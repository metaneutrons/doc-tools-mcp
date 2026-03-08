import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { Provider, ToolDefinition, ToolResult } from '../../shared/types.js';
import { extractCitations } from './extract.js';
import type { CitationEntry } from './types.js';
import { z } from 'zod';

export function createProvider(): Provider | null {
  return new CtverifyProvider();
}

const tools: ToolDefinition[] = [
  {
    name: 'ctverify:extract',
    description:
      'Extract citations from Pandoc inline footnotes (^[...]) for verification tracking. ' +
      'This is a CITATION VERIFICATION tool, not bibliography management. It extracts citations so the LLM can systematically verify ' +
      'that each cited source actually supports the claim made in the text. ' +
      'Use `registry_path` to save/merge results into a JSON registry file (preserves existing claims and statuses). ' +
      'Workflow: extract → set claims → verify each claim against the source using research tools → update status.',
    inputSchema: z.object({
      file: z.string().describe('Path to the Markdown file to extract citations from'),
      registry_path: z.string().optional().describe('Path to save/merge the citation registry JSON file'),
    }),
  },
  {
    name: 'ctverify:update',
    description:
      'Update or add a citation verification entry. ' +
      'The `claim` field records WHAT the text asserts at this citation point. ' +
      'The `status` tracks verification progress: pending → under_review → verified/disputed/not_found. ' +
      'If the ID does not exist and `cite` is provided, creates a new entry (for inline citations not in footnotes).',
    inputSchema: z.object({
      registry_path: z.string().describe('Path to the citation registry JSON file'),
      id: z.string().describe('Citation ID (format: "filename:line:index")'),
      cite: z.string().optional().describe('Raw citation text (required when adding a new entry)'),
      file: z.string().optional().describe('Source file path (for new entries)'),
      line: z.number().optional().describe('Line number in source file (for new entries)'),
      claim: z.string().optional().describe('What the text asserts at this citation'),
      status: z.enum(['pending', 'under_review', 'verified', 'disputed', 'not_found']).optional(),
      note: z.string().optional().describe('Free text notes from verification'),
    }),
  },
  {
    name: 'ctverify:status',
    description:
      'Show verification progress of a citation registry: counts by status and list of citations. ' +
      'Use `filter` to focus on specific statuses (e.g., "pending" to see what still needs verification).',
    inputSchema: z.object({
      registry_path: z.string().describe('Path to the citation registry JSON file'),
      filter: z.enum(['pending', 'under_review', 'verified', 'disputed', 'not_found']).optional()
        .describe('Only show citations with this status'),
      file: z.string().optional().describe('Only show citations from this source file'),
      offset: z.number().optional().default(0).describe('Skip this many entries (for pagination)'),
      limit: z.number().optional().default(50).describe('Maximum entries to return (default: 50)'),
    }),
  },
];

class CtverifyProvider implements Provider {
  readonly name = 'ctverify';
  getTools(): ToolDefinition[] { return tools; }
  async shutdown(): Promise<void> {}

  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case 'ctverify:extract': return this.handleExtract(args);
      case 'ctverify:update': return this.handleUpdate(args);
      case 'ctverify:status': return this.handleStatus(args);
      default: return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
    }
  }

  private async loadRegistry(path: string): Promise<CitationEntry[]> {
    try { return JSON.parse(await readFile(path, 'utf-8')); }
    catch { return []; }
  }

  private async saveRegistry(path: string, entries: CitationEntry[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(entries, null, 2), 'utf-8');
  }

  private async handleExtract(args: Record<string, unknown>): Promise<ToolResult> {
    const { file, registry_path } = args as { file: string; registry_path?: string };
    const extracted = await extractCitations(file);
    if (registry_path) {
      const existing = await this.loadRegistry(registry_path);
      const extractedIds = new Set(extracted.map(e => e.id));
      // Match by file+cite text to survive line number changes
      const byCite = new Map(existing.map(e => [`${e.file}\0${e.cite}`, e]));
      const merged = [
        ...existing.filter(e => !extractedIds.has(e.id) && !extracted.some(x => x.file === e.file && x.cite === e.cite)),
        ...extracted.map(e => {
          const prev = byCite.get(`${e.file}\0${e.cite}`);
          return prev ? { ...e, claim: prev.claim, status: prev.status, note: prev.note } : e;
        }),
      ];
      await this.saveRegistry(registry_path, merged);
      const newCount = extracted.filter(e => !byCite.has(`${e.file}\0${e.cite}`)).length;
      return { content: [{ type: 'text', text: `${extracted.length} citations extracted, ${newCount} new. Registry: ${registry_path}\n\n${this.formatEntries(merged)}` }] };
    }
    return { content: [{ type: 'text', text: `${extracted.length} citations:\n\n${this.formatEntries(extracted)}` }] };
  }

  private async handleUpdate(args: Record<string, unknown>): Promise<ToolResult> {
    const { registry_path, id, cite, file, line, claim, status, note } = args as {
      registry_path: string; id: string; cite?: string; file?: string; line?: number;
      claim?: string; status?: string; note?: string;
    };
    const entries = await this.loadRegistry(registry_path);
    let entry = entries.find(e => e.id === id);
    if (!entry) {
      if (!cite) return { content: [{ type: 'text', text: `Citation ${id} not found. Provide 'cite' to create a new entry.` }], isError: true };
      entry = { id, file: file ?? '', line: line ?? 0, cite, claim: '', status: 'pending', note: '' };
      entries.push(entry);
    }
    if (claim !== undefined) entry.claim = claim;
    if (status !== undefined) entry.status = status as CitationEntry['status'];
    if (note !== undefined) entry.note = note;
    await this.saveRegistry(registry_path, entries);
    return { content: [{ type: 'text', text: `Updated ${id}:\n  status: ${entry.status}\n  claim: ${entry.claim}\n  note: ${entry.note}` }] };
  }

  private async handleStatus(args: Record<string, unknown>): Promise<ToolResult> {
    const { registry_path, filter, file, offset = 0, limit = 50 } = args as {
      registry_path: string; filter?: string; file?: string; offset?: number; limit?: number;
    };
    const entries = await this.loadRegistry(registry_path);
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.status] = (counts[e.status] || 0) + 1;
    let filtered = entries;
    if (filter) filtered = filtered.filter(e => e.status === filter);
    if (file) filtered = filtered.filter(e => e.file.includes(file));
    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);
    const summary = Object.entries(counts).map(([s, n]) => `${s}: ${n}`).join(', ');
    const range = total > paged.length ? ` (showing ${offset + 1}–${offset + paged.length} of ${total})` : '';
    return { content: [{ type: 'text', text: `${entries.length} total (${summary})${range}\n\n${this.formatEntries(paged)}` }] };
  }

  private formatEntries(entries: CitationEntry[]): string {
    return entries.map(e =>
      `[${e.status}] ${e.id}\n  ${e.cite}${e.claim ? `\n  → ${e.claim}` : ''}${e.note ? `\n  note: ${e.note}` : ''}`
    ).join('\n\n');
  }
}
