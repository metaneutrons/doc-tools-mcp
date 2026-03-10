import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { Provider, ToolDefinition, ToolResult } from '../../shared/types.js';
import { rootLogger } from '../../shared/logger.js';
import { ValidationError } from '../../shared/errors.js';
import { extractCitations } from './extract.js';
import type { CitationEntry } from './types.js';
import { z } from 'zod';

const logger = rootLogger.child({ module: 'ctverify' });

export function createProvider(): Provider | null {
  return new CtverifyProvider();
}

function registryParam() {
  const env = process.env.DT_CT_REGISTRY;
  const valid = env && existsSync(env);
  return valid
    ? z.string().optional().describe(`Path to citation registry JSON file. Defaults to "${env}" (DT_CT_REGISTRY).`)
    : z.string().describe('Path to the citation registry JSON file (required). Set DT_CT_REGISTRY env var to make optional.');
}

function buildTools(): ToolDefinition[] {
  return [
    {
      name: 'ctverify:extract',
      description:
        'Extract citations from Pandoc inline footnotes (^[...]) for verification tracking. ' +
        'This is a CITATION VERIFICATION tool, not bibliography management. It extracts citations so the LLM can systematically verify ' +
        'that each cited source actually supports the claim made in the text. ' +
        'Use `registry_path` to save/merge results into a JSON registry file (preserves existing claims and statuses). ' +
        'Re-running after text edits is safe: exact cite matches preserve claims/status, proximity matching (±5 lines) recovers claims when cite text changed. ' +
        'Each citation captures ~200 chars of surrounding context for claim formulation. ' +
        'Workflow: extract → set claims → verify each claim against the source using research tools → update status.',
      inputSchema: z.object({
        file: z.union([z.string(), z.array(z.string())]).describe('Single path or array of paths to Markdown files to extract citations from'),
        registry_path: registryParam(),
        dry_run: z.boolean().optional().default(false).describe('Preview merge result without writing. Use after text edits to check which citations are new, removed, or proximity-matched before committing.'),
      }),
    },
    {
      name: 'ctverify:update',
      description:
        'Batch update citation verification entries. Each entry can set claim, status, and/or note independently. ' +
        'The `claim` field records WHAT the text asserts at this citation point. ' +
        'The `status` tracks verification progress: pending → under_review → verified/disputed/not_found. ' +
        'If an ID does not exist and `cite` is provided, creates a new entry (for inline citations not in footnotes).',
      inputSchema: z.object({
        registry_path: registryParam(),
        entries: z.array(z.object({
          id: z.string().describe('Citation ID (format: "filename:line:index")'),
          cite: z.string().optional().describe('Raw citation text (required when adding a new entry)'),
          file: z.string().optional().describe('Source file path (for new entries)'),
          line: z.number().optional().describe('Line number in source file (for new entries)'),
          claim: z.string().optional().describe('What the text asserts at this citation'),
          status: z.enum(['pending', 'under_review', 'verified', 'disputed', 'not_found']).optional(),
          note: z.string().optional().describe('Free text notes from verification'),
        })).describe('Array of entries to update'),
      }),
    },
    {
      name: 'ctverify:status',
      description:
        'Show verification progress of a citation registry: counts by status and list of citations. ' +
        'Use `filter_status` to focus on specific statuses, `filter_claim` to search claims or find missing ones.',
      inputSchema: z.object({
        registry_path: registryParam(),
        filter_status: z.enum(['pending', 'under_review', 'verified', 'disputed', 'not_found']).optional()
          .describe('Only show citations with this status'),
        filter_claim: z.string().optional().describe('Filter by claim: use "" for entries without claims, or any text to search within claims'),
        file: z.string().optional().describe('Only show citations from this source file (matches basename or path suffix, e.g. "40-02.md")'),
        offset: z.number().optional().default(0).describe('Skip this many entries (for pagination)'),
        limit: z.number().optional().default(50).describe('Maximum entries to return (default: 50)'),
      }),
    },
    {
      name: 'ctverify:bulk-update',
      description:
        'Update status (and optionally note) for multiple citations at once. ' +
        'Select entries either by a list of IDs or by filter (current status). ' +
        'At least one of `ids` or `filter_status` must be provided.',
      inputSchema: z.object({
        registry_path: registryParam(),
        ids: z.array(z.string()).optional().describe('List of citation IDs to update'),
        filter_status: z.enum(['pending', 'under_review', 'verified', 'disputed', 'not_found']).optional()
          .describe('Update all entries with this current status'),
        status: z.enum(['pending', 'under_review', 'verified', 'disputed', 'not_found']).describe('New status to set'),
        note: z.string().optional().describe('Note to set on all matched entries'),
      }),
    },
  ];
}

class CtverifyProvider implements Provider {
  readonly name = 'ctverify';
  getTools(): ToolDefinition[] { return buildTools(); }
  async shutdown(): Promise<void> {}

  private resolveRegistry(args: Record<string, unknown>): string {
    const fromArgs = args.registry_path as string | undefined;
    const fromEnv = process.env.DT_CT_REGISTRY;
    if (fromEnv && !existsSync(fromEnv)) {
      logger.warn('DT_CT_REGISTRY file not found, ignoring', { path: fromEnv });
    }
    const path = fromArgs ?? (fromEnv && existsSync(fromEnv) ? fromEnv : undefined);
    if (!path) throw new ValidationError('No registry path specified. Set DT_CT_REGISTRY or pass "registry_path" parameter.');
    return path;
  }

  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case 'ctverify:extract': return this.handleExtract(args);
      case 'ctverify:update': return this.handleUpdate(args);
      case 'ctverify:bulk-update': return this.handleBulkUpdate(args);
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
    const { file, dry_run = false } = args as { file: string | string[]; dry_run?: boolean };
    const registry_path = args.registry_path as string | undefined ?? (process.env.DT_CT_REGISTRY && existsSync(process.env.DT_CT_REGISTRY) ? process.env.DT_CT_REGISTRY : undefined);
    const files = Array.isArray(file) ? file : [file];
    const extracted: CitationEntry[] = [];
    for (const f of files) {
      extracted.push(...await extractCitations(f));
    }
    if (registry_path) {
      const existing = await this.loadRegistry(registry_path);
      const extractedFiles = new Set(extracted.map(e => e.file));
      // Existing entries from OTHER files (untouched)
      const untouched = existing.filter(e => !extractedFiles.has(e.file));
      // Existing entries from extracted files (candidates for matching)
      const candidates = existing.filter(e => extractedFiles.has(e.file));
      // Phase 1: exact cite match
      const byCite = new Map(candidates.map(e => [`${e.file}\0${e.cite}`, e]));
      const matched = new Set<string>();
      const merged = extracted.map(e => {
        const key = `${e.file}\0${e.cite}`;
        const prev = byCite.get(key);
        if (prev) { matched.add(prev.id); return { ...e, claim: prev.claim, status: prev.status, note: prev.note }; }
        return e;
      });
      // Phase 2: proximity match for unmatched (same file, closest line)
      const unusedCandidates = candidates.filter(c => !matched.has(c.id));
      for (const entry of merged) {
        if (byCite.has(`${entry.file}\0${entry.cite}`)) continue; // already matched
        const closest = unusedCandidates
          .filter(c => c.file === entry.file && c.claim)
          .sort((a, b) => Math.abs(a.line - entry.line) - Math.abs(b.line - entry.line))[0];
        if (closest && Math.abs(closest.line - entry.line) <= 5) {
          entry.claim = closest.claim;
          entry.status = closest.status;
          entry.note = closest.note;
          matched.add(closest.id);
          unusedCandidates.splice(unusedCandidates.indexOf(closest), 1);
        }
      }
      const removed = candidates.filter(c => !matched.has(c.id));
      const newEntries = merged.filter(e => !candidates.some(c => c.id === e.id) && !e.claim);
      const final = [...untouched, ...merged];
      if (!dry_run) await this.saveRegistry(registry_path, final);
      const lines: string[] = [`${extracted.length} citations extracted${dry_run ? ' (dry run)' : ''}, registry: ${final.length} total`];
      if (newEntries.length) lines.push(`\nNew (${newEntries.length}):\n${newEntries.map(e => `+ ${e.id}: ${e.cite}`).join('\n')}`);
      if (removed.length) lines.push(`\nRemoved (${removed.length}):\n${removed.map(e => `- ${e.id}: ${e.cite}`).join('\n')}`);
      const proximityMatched = merged.filter(e => !byCite.has(`${e.file}\0${e.cite}`) && e.claim);
      if (proximityMatched.length) lines.push(`\nProximity-matched (${proximityMatched.length}):\n${proximityMatched.map(e => `~ ${e.id}: ${e.cite} → claim: ${e.claim}`).join('\n')}`);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
    return { content: [{ type: 'text', text: `${extracted.length} citations extracted.\n\n${extracted.map(e => `- ${e.id}: ${e.cite}`).join('\n')}` }] };
  }

  private async handleUpdate(args: Record<string, unknown>): Promise<ToolResult> {
    const registry_path = this.resolveRegistry(args);
    const { entries: inputEntries } = args as {
      entries: Array<{ id: string; cite?: string; file?: string; line?: number; claim?: string; status?: string; note?: string }>;
    };
    const entries = await this.loadRegistry(registry_path);
    const results: string[] = [];
    for (const input of inputEntries) {
      let entry = entries.find(e => e.id === input.id);
      if (!entry) {
        if (!input.cite) { results.push(`✗ ${input.id}: not found (provide 'cite' to create)`); continue; }
        entry = { id: input.id, file: input.file ?? '', line: input.line ?? 0, cite: input.cite, context: '', claim: '', status: 'pending', note: '' };
        entries.push(entry);
      }
      if (input.claim !== undefined) entry.claim = input.claim;
      if (input.status !== undefined) entry.status = input.status as CitationEntry['status'];
      if (input.note !== undefined) entry.note = input.note;
      results.push(`✓ ${input.id}: ${entry.status}${input.claim !== undefined ? ' | claim set' : ''}`);
    }
    await this.saveRegistry(registry_path, entries);
    return { content: [{ type: 'text', text: `${results.length} entries processed:\n${results.join('\n')}` }] };
  }

  private async handleBulkUpdate(args: Record<string, unknown>): Promise<ToolResult> {
    const registry_path = this.resolveRegistry(args);
    const { ids, filter_status, status, note } = args as {
      ids?: string[]; filter_status?: string;
      status: string; note?: string;
    };
    if (!ids && !filter_status) {
      return { content: [{ type: 'text', text: 'Provide at least one of: ids, filter_status' }], isError: true };
    }
    const entries = await this.loadRegistry(registry_path);
    let count = 0;
    for (const e of entries) {
      if (ids?.includes(e.id) || (filter_status && e.status === filter_status)) {
        e.status = status as CitationEntry['status'];
        if (note !== undefined) e.note = note;
        count++;
      }
    }
    await this.saveRegistry(registry_path, entries);
    return { content: [{ type: 'text', text: `✅ ${count} entries updated to "${status}".` }] };
  }

  private async handleStatus(args: Record<string, unknown>): Promise<ToolResult> {
    const registry_path = this.resolveRegistry(args);
    const { filter_status, filter_claim, file, offset = 0, limit = 50 } = args as {
      filter_status?: string; filter_claim?: string; file?: string; offset?: number; limit?: number;
    };
    const entries = await this.loadRegistry(registry_path);
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.status] = (counts[e.status] || 0) + 1;
    let filtered = entries;
    if (file) filtered = filtered.filter(e => e.file.endsWith(file) || e.id.startsWith(file.replace(/\.md$/, '')));
    if (filter_status) filtered = filtered.filter(e => e.status === filter_status);
    if (filter_claim !== undefined) {
      filtered = filter_claim === ''
        ? filtered.filter(e => !e.claim)
        : filtered.filter(e => e.claim.toLowerCase().includes(filter_claim.toLowerCase()));
    }
    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);
    const summary = Object.entries(counts).map(([s, n]) => `${s}: ${n}`).join(', ');
    const range = total > paged.length ? ` (showing ${offset + 1}–${offset + paged.length} of ${total})` : '';
    const lines = paged.map(e => `[${e.status}] ${e.id}: ${e.cite}${e.claim ? ' → ' + e.claim : ''}`).join('\n');
    return { content: [{ type: 'text', text: `${entries.length} total (${summary})${range}\n\n${lines}` }] };
  }

}
