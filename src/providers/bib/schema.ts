import { z } from 'zod';

/** All CSL types we validate required fields for */
export const CSL_TYPES = [
  'article-journal', 'book', 'chapter', 'legal_case', 'legislation',
  'thesis', 'report', 'paper-conference', 'webpage', 'no-type',
] as const;

export type CslType = typeof CSL_TYPES[number];

/** CSL name variable (author, editor) */
const cslNameSchema = z.object({
  family: z.string(),
  given: z.string().optional(),
}).passthrough();

/** CSL date variable */
const cslDateSchema = z.object({
  'date-parts': z.array(z.array(z.number())).optional(),
  literal: z.string().optional(),
}).passthrough();

/** Single CSL-YAML entry */
export const cslEntrySchema = z.object({
  id: z.string().min(1, 'ID must not be empty'),
  type: z.string().min(1, 'Type must not be empty'),
  title: z.string().optional(),
  author: z.array(cslNameSchema).optional(),
  editor: z.array(cslNameSchema).optional(),
  issued: cslDateSchema.optional(),
  'container-title': z.string().optional(),
  volume: z.string().optional(),
  page: z.string().optional(),
  publisher: z.string().optional(),
  'publisher-place': z.string().optional(),
  edition: z.string().optional(),
  authority: z.string().optional(),
  number: z.string().optional(),
  genre: z.string().optional(),
  url: z.string().optional(),
  note: z.string().optional(),
}).passthrough();

export type CslEntry = z.infer<typeof cslEntrySchema>;

/** Required fields per CSL type */
const REQUIRED_FIELDS: Record<string, string[]> = {
  'legal_case': ['title', 'authority', 'number', 'issued'],
  'book': ['title', 'issued'],
  'article-journal': ['title', 'container-title', 'issued'],
  'chapter': ['title', 'container-title', 'issued'],
  'legislation': ['title', 'issued'],
  'thesis': ['title', 'issued'],
};

export interface ValidationIssue {
  id: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

/** Validate required fields for a given CSL type */
export function validateRequiredFields(entry: CslEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const required = REQUIRED_FIELDS[entry.type];
  if (!required) return issues;

  for (const field of required) {
    const value = entry[field as keyof CslEntry];
    if (value === undefined || value === null || value === '') {
      issues.push({
        id: entry.id,
        field,
        message: `Missing required field '${field}' for type '${entry.type}'`,
        severity: 'error',
      });
    }
  }
  return issues;
}

/** Validate an entire bibliography */
export function validateBibliography(entries: CslEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  for (const entry of entries) {
    // Duplicate ID check
    if (seenIds.has(entry.id)) {
      issues.push({ id: entry.id, message: `Duplicate ID '${entry.id}'`, severity: 'error' });
    }
    seenIds.add(entry.id);

    // Required fields
    issues.push(...validateRequiredFields(entry));

    // Missing issued warning
    if (!entry.issued) {
      issues.push({
        id: entry.id,
        field: 'issued',
        message: `Missing 'issued' date`,
        severity: 'warning',
      });
    }
  }

  return issues;
}
