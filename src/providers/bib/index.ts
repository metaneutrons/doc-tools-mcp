import yaml from 'js-yaml';
import { existsSync } from 'fs';
import { Provider, ToolDefinition, ToolResult } from '../../shared/types.js';
import { rootLogger } from '../../shared/logger.js';
import { NotFoundError, DuplicateError, ValidationError } from '../../shared/errors.js';
import { BibStore } from './store.js';
import { CslEntry, validateRequiredFields, validateBibliography } from './schema.js';
import { parseStyleVariables, getRequiredVariables, StyleVariables } from './csl-style.js';
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

  /** Resolve file path from args or env var */
  private resolveFile(args: Record<string, unknown>): string {
    const fromArgs = args.file as string | undefined;
    const fromEnv = process.env.DT_BIB_YAML;
    if (fromEnv && !existsSync(fromEnv)) {
      logger.warn('DT_BIB_YAML file not found, ignoring', { path: fromEnv });
    }
    const file = fromArgs ?? (fromEnv && existsSync(fromEnv) ? fromEnv : undefined);
    if (!file) throw new ValidationError('No bibliography file specified. Set DT_BIB_YAML or pass "file" parameter.');
    logger.debug('Resolved bibliography file', { path: file, source: fromArgs ? 'args' : 'env' });
    return file;
  }

  /** Load style variables from args or env var, returns undefined if no style configured */
  private async resolveStyle(args: Record<string, unknown>): Promise<StyleVariables | undefined> {
    const fromArgs = args.style as string | undefined;
    const fromEnv = process.env.DT_BIB_CSL;
    if (fromEnv && !existsSync(fromEnv)) {
      logger.warn('DT_BIB_CSL file not found, ignoring', { path: fromEnv });
    }
    const stylePath = fromArgs ?? (fromEnv && existsSync(fromEnv) ? fromEnv : undefined);
    if (!stylePath) return undefined;
    logger.debug('Resolved CSL style', { path: stylePath, source: fromArgs ? 'args' : 'env' });
    return parseStyleVariables(stylePath);
  }

  /** Build a styleFieldsFn callback from parsed style variables */
  private styleFieldsFn(style: StyleVariables | undefined): ((type: string) => string[] | undefined) | undefined {
    if (!style) return undefined;
    return (type: string) => getRequiredVariables(style, type);
  }

  getTools(): ToolDefinition[] {
    return bibTools();
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
    const file = this.resolveFile(args);
    const { id } = args as { id: string };
    const entry = await this.store.get(file, id);
    if (!entry) throw new NotFoundError(id);
    return { content: [{ type: 'text', text: entryToYaml(entry) }] };
  }

  private async handleSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const file = this.resolveFile(args);
    const { query, limit = 20 } = args as { query: string; limit?: number };
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
    const file = this.resolveFile(args);
    const { type, limit = 50 } = args as { type: string; limit?: number };
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
    const file = this.resolveFile(args);
    const { id } = args as { id: string };
    const exists = await this.store.exists(file, id);
    return { content: [{ type: 'text', text: exists ? `✅ "${id}" exists` : `❌ "${id}" not found` }] };
  }

  private async handleStats(args: Record<string, unknown>): Promise<ToolResult> {
    const file = this.resolveFile(args);
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
    const file = this.resolveFile(args);
    const style = await this.resolveStyle(args);
    const { entry } = args as { entry: CslEntry };

    // Duplicate check
    if (await this.store.exists(file, entry.id)) {
      throw new DuplicateError(entry.id);
    }

    // Required field validation (style-aware if available)
    const styleFields = style ? getRequiredVariables(style, entry.type) : undefined;
    const issues = validateRequiredFields(entry, styleFields);
    if (style?.knownTypes.size && !style.knownTypes.has(entry.type)) {
      issues.push({ id: entry.id, field: 'type', message: `Type '${entry.type}' is not handled by the CSL style`, severity: 'warning' });
    }
    if (issues.some((i) => i.severity === 'error')) {
      const text = 'Validation errors:\n' + issues.map((i) => `- ${i.message}`).join('\n');
      return { content: [{ type: 'text', text }], isError: true };
    }

    await this.store.add(file, entry);
    const text = `✅ Entry "${entry.id}" added.\n\n${entryToYaml(entry)}`;
    return { content: [{ type: 'text', text }] };
  }

  private async handleUpdate(args: Record<string, unknown>): Promise<ToolResult> {
    const file = this.resolveFile(args);
    const style = await this.resolveStyle(args);
    const { id, fields } = args as { id: string; fields: Record<string, unknown> };

    if (!(await this.store.exists(file, id))) {
      throw new NotFoundError(id);
    }

    const updated = await this.store.update(file, id, fields);

    // Validate updated entry against style if available
    const styleFields = style ? getRequiredVariables(style, updated.type) : undefined;
    const issues = validateRequiredFields(updated, styleFields);
    if (style?.knownTypes.size && !style.knownTypes.has(updated.type)) {
      issues.push({ id: updated.id, field: 'type', message: `Type '${updated.type}' is not handled by the CSL style`, severity: 'warning' });
    }
    const warnings = issues.length > 0
      ? '\n\n⚠️ Warnings:\n' + issues.map((i) => `- ${i.message}`).join('\n')
      : '';

    const text = `✅ Entry "${id}" updated.\n\n${entryToYaml(updated)}${warnings}`;
    return { content: [{ type: 'text', text }] };
  }

  private async handleDelete(args: Record<string, unknown>): Promise<ToolResult> {
    const file = this.resolveFile(args);
    const { id } = args as { id: string };

    if (!(await this.store.exists(file, id))) {
      throw new NotFoundError(id);
    }

    await this.store.delete(file, id);
    return { content: [{ type: 'text', text: `✅ Entry "${id}" deleted.` }] };
  }

  private async handleValidate(args: Record<string, unknown>): Promise<ToolResult> {
    const file = this.resolveFile(args);
    const style = await this.resolveStyle(args);
    const entries = await this.store.read(file);
    const issues = validateBibliography(entries, this.styleFieldsFn(style), style?.knownTypes);

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
