import { describe, it, expect } from 'vitest';
import { validateRequiredFields, validateBibliography, CslEntry } from './schema.js';

describe('schema validation', () => {
  describe('validateRequiredFields', () => {
    it('should pass for valid legal_case', () => {
      const entry: CslEntry = {
        id: 'test', type: 'legal_case', title: 'Test',
        authority: 'BGH', number: 'I ZR 1/23',
        issued: { 'date-parts': [[2023]] },
      };
      expect(validateRequiredFields(entry)).toHaveLength(0);
    });

    it('should report missing fields for legal_case', () => {
      const entry: CslEntry = { id: 'test', type: 'legal_case', title: 'Test' };
      const issues = validateRequiredFields(entry);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.field === 'authority')).toBe(true);
      expect(issues.some((i) => i.field === 'number')).toBe(true);
      expect(issues.some((i) => i.field === 'issued')).toBe(true);
    });

    it('should pass for valid book', () => {
      const entry: CslEntry = {
        id: 'test', type: 'book', title: 'Test Book',
        issued: { 'date-parts': [[2024]] },
      };
      expect(validateRequiredFields(entry)).toHaveLength(0);
    });

    it('should skip validation for unknown types', () => {
      const entry: CslEntry = { id: 'test', type: 'no-type', title: 'Test' };
      expect(validateRequiredFields(entry)).toHaveLength(0);
    });
  });

  describe('validateBibliography', () => {
    it('should detect duplicate IDs', () => {
      const entries: CslEntry[] = [
        { id: 'dup', type: 'book', title: 'A', issued: { 'date-parts': [[2024]] } },
        { id: 'dup', type: 'book', title: 'B', issued: { 'date-parts': [[2024]] } },
      ];
      const issues = validateBibliography(entries);
      expect(issues.some((i) => i.message.includes('Duplicate'))).toBe(true);
    });

    it('should warn about missing issued', () => {
      const entries: CslEntry[] = [
        { id: 'test', type: 'no-type', title: 'Test' },
      ];
      const issues = validateBibliography(entries);
      expect(issues.some((i) => i.severity === 'warning' && i.field === 'issued')).toBe(true);
    });

    it('should return empty for valid bibliography', () => {
      const entries: CslEntry[] = [
        { id: 'a', type: 'book', title: 'A', issued: { 'date-parts': [[2024]] } },
        { id: 'b', type: 'book', title: 'B', issued: { 'date-parts': [[2023]] } },
      ];
      expect(validateBibliography(entries)).toHaveLength(0);
    });
  });
});
