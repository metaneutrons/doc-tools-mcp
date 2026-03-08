import { readFile } from 'fs/promises';
import { basename } from 'path';
import type { CitationEntry } from './types.js';

/**
 * Extract citations from Pandoc inline footnotes (`^[...]`).
 * Splits multiple cites by `;` and returns structured entries.
 */
export async function extractCitations(filePath: string): Promise<CitationEntry[]> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const base = basename(filePath, '.md');
  const entries: CitationEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match all ^[...] footnotes on this line (handle nested brackets)
    let pos = 0;
    let citeIdx = 0;
    while (pos < line.length) {
      const start = line.indexOf('^[', pos);
      if (start === -1) break;

      // Find matching closing bracket
      let depth = 0;
      let end = -1;
      for (let j = start + 1; j < line.length; j++) {
        if (line[j] === '[') depth++;
        else if (line[j] === ']') {
          depth--;
          if (depth === 0) { end = j; break; }
        }
      }
      if (end === -1) { pos = start + 2; continue; }

      const footnote = line.substring(start + 2, end);
      // Split by semicolons (but not inside nested brackets/parens)
      const cites = splitCites(footnote);

      for (let idx = 0; idx < cites.length; idx++) {
        const cite = cites[idx].replace(/^\s+|\s+$/g, '').replace(/\.?\]?$/, '').replace(/^\[?/, '');
        if (!cite || cite.length < 5) continue;
        entries.push({
          id: `${base}:${i + 1}:${citeIdx}`,
          file: filePath,
          line: i + 1,
          cite,
          claim: '',
          status: 'pending',
          note: '',
        });
        citeIdx++;
      }
      pos = end + 1;
    }
  }

  return entries;
}

function splitCites(footnote: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of footnote) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ';' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}
