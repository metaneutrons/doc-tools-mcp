import yaml from 'js-yaml';
import { Provider, ToolDefinition, ToolResult } from '../../shared/types.js';
import { rootLogger } from '../../shared/logger.js';
import { NotFoundError, DuplicateError } from '../../shared/errors.js';
import { BibStore } from './store.js';
import { CslEntry, validateRequiredFields, validateBibliography } from './schema.js';
import { bibTools } from './tools/index.js';

const logger = rootLogger.child({ module: 'bib' });

/** Serialize a single entry to YAML for display */
function entryToYaml(entry: CslEntry): string {
  return yaml.dump([entry], { indent: 2, lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }).trim();
}

/** Flatten all string values of an entry for full-text search */
function flattenEntry(entry: CslEntry): string {
  const parts: string[] = [];
  const walk = (obj: unknown): void => {
    if (typeof obj === 'string') parts.push(obj);
    else if (typeof obj === 'number') parts.push(String(obj));
    else if (Array.isArray(obj)) obj.forEach(walk);
    else if (obj && typeof obj === 'object') Object.values(obj).forEach(walk);
  };
  walk(entry);
  return parts.join(' ').toLowerCase();
}

class BibProvider implements Provider {
  readonly name = 'bib';
  private store = new BibStore();

  getTools(): ToolDefinition[] {
    return bibTools;
  }

  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'bib:get': return await this.handleGet(args);
        case 'bib:search': return await this.handleSearch(args);
        case 'bib:list': return await this.handleList(args);
        case 'bib:exists': return await this.handleExists(args);
        case 'bib:stats': return await this.handleStats(args);
        case 'bib:add': return await this.handleAdd(args);
        case 'bib:update': return await this.handleUpdate(args);
        case 'bib:delete': return await this.handleDelete(args);
        case 'bib:validate': return await this.handleValidate(args);
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
      }
    } catch (error) {
      logger.error('Tool call failed', error as Error, { tool: toolName });
      const message = error instanceof Error ? error.toString() : String(error);
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Bib provider shutdown');
  }

  // --- Read tools ---

  private async handleGet(args: Record<string, unknown>): Promise<ToolResult> {
    const { file, id } = args as { file: string; id: string };
    const entry = await this.store.get(file, id);
    if (!entry) throw new NotFoundError(id);
    return { content: [{ type: 'text', text: entryToYaml(entry) }] };
  }

  private async handleSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const { file, query, limit = 20 } = args as { file: string; query: string; limit?: number };
    const entries = await this.store.read(file);
    const q = query.toLowerCase();
    const matches = entries.filter((e) => flattenEntry(e).includes(q)).slice(0, limit);

    if (matches.length === 0) {
      return { content: [{ type: 'text', text: `No entries found for "${query}"` }] };
    }

    const text = `Found ${matches.length} result(s) for "${query}":\n\n` +
      matches.map((e) => `- **${e.id}** (${e.type}): ${e.title ?? '(no title)'}`).join('\n');
    return { content: [{ type: 'text', text }] };
  }

  private async handleList(args: Record<string, unknown>): Promise<ToolResult> {
    const { file, type, limit = 50 } = args as { file: string; type: string; limit?: number };
    const entries = await this.store.read(file);
    const matches = entries.filter((e) => e.type === type).slice(0, limit);
    const total = entries.filter((e) => e.type === type).length;

    if (matches.length === 0) {
      return { content: [{ type: 'text', text: `No entries of type "${type}"` }] };
    }

    const text = `${total} entries of type "${type}"` +
      (total > limit ? ` (showing first ${limit})` : '') + ':\n\n' +
      matches.map((e) => `- **${e.id}**: ${e.title ?? '(no title)'}`).join('\n');
    return { content: [{ type: 'text', text }] };
  }

  private async handleExists(args: Record<string, unknown>): Promise<ToolResult> {
    const { file, id } = args as { file: string; id: string };
    const exists = await this.store.exists(file, id);
    return { content: [{ type: 'text', text: exists ? `✅ "${id}" exists` : `❌ "${id}" not found` }] };
  }

  private async handleStats(args: Record<string, unknown>): Promise<ToolResult> {
    const { file } = args as { file: string };
    const entries = await this.store.read(file);
    const byType: Record<string, number> = {};
    for (const e of entries) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
    }

    const sorted = Object.entries(byType).sort(([, a], [, b]) => b - a);
    const text = `Total entries: ${entries.length}\n\n` +
      sorted.map(([type, count]) => `- ${type}: ${count}`).join('\n');
    return { content: [{ type: 'text', text }] };
  }

  // --- Write tools ---

  private async handleAdd(args: Record<string, unknown>): Promise<ToolResult> {
    const { file, entry } = args as { file: string; entry: CslEntry };

    // Duplicate check
    if (await this.store.exists(file, entry.id)) {
      throw new DuplicateError(entry.id);
    }

    // Required field validation
    const issues = validateRequiredFields(entry);
    if (issues.some((i) => i.severity === 'error')) {
      const text = 'Validation errors:\n' + issues.map((i) => `- ${i.message}`).join('\n');
      return { content: [{ type: 'text', text }], isError: true };
    }

    await this.store.add(file, entry);
    const text = `✅ Entry "${entry.id}" added.\n\n${entryToYaml(entry)}`;
    return { content: [{ type: 'text', text }] };
  }

  private async handleUpdate(args: Record<string, unknown>): Promise<ToolResult> {
    const { file, id, fields } = args as { file: string; id: string; fields: Record<string, unknown> };

    if (!(await this.store.exists(file, id))) {
      throw new NotFoundError(id);
    }

    const updated = await this.store.update(file, id, fields);
    const text = `✅ Entry "${id}" updated.\n\n${entryToYaml(updated)}`;
    return { content: [{ type: 'text', text }] };
  }

  private async handleDelete(args: Record<string, unknown>): Promise<ToolResult> {
    const { file, id } = args as { file: string; id: string };

    if (!(await this.store.exists(file, id))) {
      throw new NotFoundError(id);
    }

    await this.store.delete(file, id);
    return { content: [{ type: 'text', text: `✅ Entry "${id}" deleted.` }] };
  }

  private async handleValidate(args: Record<string, unknown>): Promise<ToolResult> {
    const { file } = args as { file: string };
    const entries = await this.store.read(file);
    const issues = validateBibliography(entries);

    if (issues.length === 0) {
      return { content: [{ type: 'text', text: `✅ Bibliography is valid. ${entries.length} entries, no issues found.` }] };
    }

    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    let text = `Validation results for ${entries.length} entries:\n`;
    text += `- ${errors.length} error(s), ${warnings.length} warning(s)\n\n`;

    if (errors.length > 0) {
      text += '**Errors:**\n' + errors.map((i) => `- [${i.id}] ${i.message}`).join('\n') + '\n\n';
    }
    if (warnings.length > 0) {
      text += '**Warnings:**\n' + warnings.map((i) => `- [${i.id}] ${i.message}`).join('\n');
    }

    return { content: [{ type: 'text', text }] };
  }
}

export function createProvider(): Provider | null {
  return new BibProvider();
}
