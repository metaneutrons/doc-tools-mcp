import { z } from 'zod';
import { existsSync } from 'fs';
import { ToolDefinition } from '../../../shared/types.js';

/** File parameter — required unless DT_BIB_YAML is set and exists */
export function fileParam() {
  const env = process.env.DT_BIB_YAML;
  const valid = env && existsSync(env);
  return valid
    ? z.string().optional().describe(`Path to CSL-YAML bibliography file. Defaults to "${env}" (DT_BIB_YAML).`)
    : z.string().describe(
        'Absolute path to the CSL-YAML bibliography file (required). ' +
        'Look for "bibliography:" in pandoc.yaml or the YAML frontmatter of .md files.',
      );
}

/** Style parameter — always optional, shows default if DT_BIB_CSL is set and exists */
export function styleParam() {
  const env = process.env.DT_BIB_CSL;
  const valid = env && existsSync(env);
  return z.string().optional().describe(
    valid
      ? `Path to CSL style file (.csl). Defaults to "${env}" (DT_BIB_CSL). Enables style-aware field validation.`
      : 'Optional path to a CSL style file (.csl). Enables style-aware required-field validation.',
  );
}

export function readTools(): ToolDefinition[] {
  return [
    {
      name: 'bib:get',
      description: 'Retrieve a single bibliography entry by ID. Returns the full YAML block.',
      inputSchema: z.object({
        file: fileParam(),
        id: z.string().describe('The citation ID (e.g., "BGH_I_ZR_73_79")'),
      }),
    },
    {
      name: 'bib:search',
      description: 'Search bibliography entries across all fields: author, title, type, year, editor, container-title. Use ONE search term per call (e.g., "Pahlow" or "OLG Köln"). For multiple lookups, call this tool multiple times.',
      inputSchema: z.object({
        file: fileParam(),
        query: z.string().describe('Single search term (case-insensitive, matches any field). Do NOT combine multiple terms — use separate calls instead.'),
        limit: z.number().optional().default(20).describe('Maximum results to return (default: 20)'),
      }),
    },
    {
      name: 'bib:list',
      description: 'List all bibliography entries of a given CSL type (e.g., "legal_case", "book", "article-journal", "chapter").',
      inputSchema: z.object({
        file: fileParam(),
        type: z.string().describe('CSL type to filter by (e.g., "legal_case", "book", "article-journal")'),
        limit: z.number().optional().default(50).describe('Maximum results to return (default: 50)'),
      }),
    },
    {
      name: 'bib:exists',
      description: 'Check if a citation ID exists in the bibliography. Fast boolean check before citing.',
      inputSchema: z.object({
        file: fileParam(),
        id: z.string().describe('The citation ID to check'),
      }),
    },
    {
      name: 'bib:stats',
      description: 'Get bibliography statistics: total entry count and breakdown by CSL type.',
      inputSchema: z.object({
        file: fileParam(),
      }),
    },
  ];
}
