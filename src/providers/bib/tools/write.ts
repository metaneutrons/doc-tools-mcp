import { z } from 'zod';
import { ToolDefinition } from '../../../shared/types.js';
import { fileParam, styleParam } from './read.js';

export function writeTools(): ToolDefinition[] {
  return [
    {
      name: 'bib:add',
      description:
        'Add a new bibliography entry. Validates required fields per CSL type, checks for duplicate IDs, ' +
        'and creates a .bak backup before writing. Returns the created YAML block for confirmation.',
      inputSchema: z.object({
        file: fileParam(),
        style: styleParam(),
        entry: z.object({
          id: z.string().describe('Unique citation ID (e.g., "BGH_I_ZR_42_22")'),
          type: z.string().describe('CSL type (e.g., "legal_case", "book", "article-journal", "chapter")'),
          title: z.string().optional().describe('Title of the work'),
          author: z.array(z.object({
            family: z.string(),
            given: z.string().optional(),
          })).optional().describe('Author(s)'),
          editor: z.array(z.object({
            family: z.string(),
            given: z.string().optional(),
          })).optional().describe('Editor(s)'),
          issued: z.object({
            'date-parts': z.array(z.array(z.number())).optional(),
          }).optional().describe('Publication date, e.g., {"date-parts": [[2024]]}'),
          'container-title': z.string().optional().describe('Journal, reporter, or book title'),
          volume: z.string().optional(),
          page: z.string().optional(),
          publisher: z.string().optional(),
          'publisher-place': z.string().optional(),
          edition: z.string().optional(),
          authority: z.string().optional().describe('Court name (for legal_case)'),
          number: z.string().optional().describe('Case number or report number'),
          genre: z.string().optional().describe('e.g., "Urt.", "Beschl."'),
          url: z.string().optional(),
          note: z.string().optional(),
        }).passthrough().describe('The CSL-YAML entry to add'),
      }),
    },
    {
      name: 'bib:update',
      description:
        'Update fields of an existing bibliography entry. Only the specified fields are changed; ' +
        'all other fields remain untouched. Creates a .bak backup before writing.',
      inputSchema: z.object({
        file: fileParam(),
        style: styleParam(),
        id: z.string().describe('The citation ID to update'),
        fields: z.record(z.string(), z.unknown()).describe('Fields to update (e.g., {"url": "https://...", "page": "123"})'),
      }),
    },
    {
      name: 'bib:delete',
      description: 'Remove a bibliography entry by ID. Creates a .bak backup before writing.',
      inputSchema: z.object({
        file: fileParam(),
        id: z.string().describe('The citation ID to delete'),
      }),
    },
    {
      name: 'bib:validate',
      description:
        'Validate the entire bibliography file: YAML syntax, required fields per CSL type, ' +
        'duplicate IDs, and missing issued dates. Returns a list of errors and warnings.',
      inputSchema: z.object({
        file: fileParam(),
        style: styleParam(),
      }),
    },
  ];
}
