import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { FileError } from '../../shared/errors.js';
import { rootLogger } from '../../shared/logger.js';

const logger = rootLogger.child({ module: 'csl-style' });

export interface StyleVariables {
  /** Variables used globally (outside any type-conditional) */
  global: Set<string>;
  /** Variables used inside `<if type="...">` / `<else-if type="...">` blocks */
  byType: Map<string, Set<string>>;
  /** All CSL types referenced in the style */
  knownTypes: Set<string>;
}

/** Extract all CSL variables referenced in a .csl style file, grouped by type conditionals */
export async function parseStyleVariables(stylePath: string): Promise<StyleVariables> {
  if (!existsSync(stylePath)) {
    throw new FileError(`Style file not found: ${stylePath}`, stylePath);
  }

  const xml = await readFile(stylePath, 'utf-8');
  const result = extractVariables(xml);
  logger.info('Style parsed', {
    path: stylePath,
    globalVars: result.global.size,
    types: result.byType.size,
  });
  return result;
}

/** Get required variables for a specific CSL type from parsed style data */
export function getRequiredVariables(style: StyleVariables, cslType: string): string[] {
  const vars = new Set(style.global);
  const typeVars = style.byType.get(cslType);
  if (typeVars) {
    for (const v of typeVars) vars.add(v);
  }
  return [...vars];
}

// --- internal ---

const VARIABLE_RE = /\bvariable="([^"]+)"/g;
const TYPE_OPEN_RE = /<(?:if|else-if)\b[^>]*\btype="([^"]+)"[^>]*>/g;
const TYPE_CLOSE_RE = /<\/(?:if|choose)>/g;

function extractVariables(xml: string): StyleVariables {
  const global = new Set<string>();
  const byType = new Map<string, Set<string>>();
  const knownTypes = new Set<string>();

  // Find all type-conditional blocks with their character ranges
  const typeBlocks: Array<{ types: string[]; start: number; end: number }> = [];
  const openTags: Array<{ types: string[]; start: number; depth: number }> = [];

  // Simple nesting tracker: find open/close tags in order
  const events: Array<{ pos: number; kind: 'open'; types: string[] } | { pos: number; kind: 'close' }> = [];

  for (const m of xml.matchAll(TYPE_OPEN_RE)) {
    const types = m[1].split(/\s+/);
    types.forEach((t) => knownTypes.add(t));
    events.push({ pos: m.index!, kind: 'open', types });
  }
  for (const m of xml.matchAll(TYPE_CLOSE_RE)) {
    events.push({ pos: m.index!, kind: 'close' });
  }
  events.sort((a, b) => a.pos - b.pos);

  for (const ev of events) {
    if (ev.kind === 'open') {
      openTags.push({ types: ev.types, start: ev.pos, depth: openTags.length });
    } else if (openTags.length > 0) {
      const tag = openTags.pop()!;
      typeBlocks.push({ types: tag.types, start: tag.start, end: ev.pos });
    }
  }

  // Extract all variable references and classify them
  for (const m of xml.matchAll(VARIABLE_RE)) {
    const pos = m.index!;
    const vars = m[1].split(/\s+/);
    const enclosingBlock = typeBlocks.find((b) => pos >= b.start && pos <= b.end);

    if (enclosingBlock) {
      for (const t of enclosingBlock.types) {
        if (!byType.has(t)) byType.set(t, new Set());
        for (const v of vars) byType.get(t)!.add(v);
      }
    } else {
      for (const v of vars) global.add(v);
    }
  }

  return { global, byType, knownTypes };
}
