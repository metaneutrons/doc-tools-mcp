import { z } from 'zod';
import { ToolDefinition } from '../../../shared/types.js';

/** Shared file parameter — optional, falls back to DT_BIB_YAML env var */
export const fileParam = z.string().optional().describe(
  'Absolute path to the CSL-YAML bibliography file. ' +
  'Falls back to DT_BIB_YAML env var if not provided. ' +
  'Look for "bibliography:" in pandoc.yaml or the YAML frontmatter of .md files to find the path.'
);

/** Shared style parameter — optional, falls back to DT_BIB_CSL env var */
export const styleParam = z.string().optional().describe(
  'Absolute path to a CSL style file (.csl). ' +
  'Falls back to DT_BIB_CSL env var if not provided. ' +
  'When set, required-field validation uses the variables referenced in the style.'
);

export const readTools: ToolDefinition[] = [
  {
    name: 'bib:get',
    description: 'Retrieve a single bibliography entry by ID. Returns the full YAML block.',
    inputSchema: z.object({
      file: fileParam,
      id: z.string().describe('The citation ID (e.g., "BGH_I_ZR_73_79")'),
    }),
  },
  {
    name: 'bib:search',
    description: 'Search bibliography entries across all fields: author, title, type, year, editor, container-title. Returns matching entries.',
    inputSchema: z.object({
      file: fileParam,
      query: z.string().describe('Search term (case-insensitive, matches any field)'),
      limit: z.number().optional().default(20).describe('Maximum results to return (default: 20)'),
    }),
  },
  {
    name: 'bib:list',
    description: 'List all bibliography entries of a given CSL type (e.g., "legal_case", "book", "article-journal", "chapter").',
    inputSchema: z.object({
      file: fileParam,
      type: z.string().describe('CSL type to filter by (e.g., "legal_case", "book", "article-journal")'),
      limit: z.number().optional().default(50).describe('Maximum results to return (default: 50)'),
    }),
  },
  {
    name: 'bib:exists',
    description: 'Check if a citation ID exists in the bibliography. Fast boolean check before citing.',
    inputSchema: z.object({
      file: fileParam,
      id: z.string().describe('The citation ID to check'),
    }),
  },
  {
    name: 'bib:stats',
    description: 'Get bibliography statistics: total entry count and breakdown by CSL type.',
    inputSchema: z.object({
      file: fileParam,
    }),
  },
];
