import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProvider } from './index.js';

const SAMPLE_YAML = `---
references:

  - id: BGH_I_ZR_73_79
    type: legal_case
    title: Pornofilme
    authority: BGH
    number: I ZR 73/79
    issued:
      date-parts:
        - - 1981

  - id: WandtkeLehrbuch6
    type: book
    author:
      - family: Wandtke
        given: Artur-Axel
    title: Urheberrecht
    issued:
      date-parts:
        - - 2023

  - id: Becker2010
    type: article-journal
    author:
      - family: Becker
        given: Guido Michael
    title: "Wem gehört das Gemeinschaftsgeschmacksmuster?"
    container-title: GRUR Int
    issued:
      date-parts:
        - - 2010
    page: "484"
`;

let testDir: string;
let testFile: string;
const provider = createProvider()!;

beforeEach(async () => {
  testDir = join(tmpdir(), `bib-provider-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
  testFile = join(testDir, 'references.yaml');
  await writeFile(testFile, SAMPLE_YAML, 'utf-8');
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('BibProvider', () => {
  it('should register tools', () => {
    const tools = provider.getTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.name === 'bib:get')).toBe(true);
    expect(tools.some((t) => t.name === 'bib:add')).toBe(true);
    expect(tools.some((t) => t.name === 'bib:validate')).toBe(true);
  });

  describe('bib:get', () => {
    it('should return entry', async () => {
      const result = await provider.handleToolCall('bib:get', { file: testFile, id: 'BGH_I_ZR_73_79' });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Pornofilme');
    });

    it('should error on unknown ID', async () => {
      const result = await provider.handleToolCall('bib:get', { file: testFile, id: 'nonexistent' });
      expect(result.isError).toBe(true);
    });
  });

  describe('bib:search', () => {
    it('should find by title', async () => {
      const result = await provider.handleToolCall('bib:search', { file: testFile, query: 'Urheberrecht' });
      expect(result.content[0].text).toContain('WandtkeLehrbuch6');
    });

    it('should find by author', async () => {
      const result = await provider.handleToolCall('bib:search', { file: testFile, query: 'Becker' });
      expect(result.content[0].text).toContain('Becker2010');
    });

    it('should return no results message', async () => {
      const result = await provider.handleToolCall('bib:search', { file: testFile, query: 'zzzznonexistent' });
      expect(result.content[0].text).toContain('No entries found');
    });
  });

  describe('bib:list', () => {
    it('should list by type', async () => {
      const result = await provider.handleToolCall('bib:list', { file: testFile, type: 'legal_case' });
      expect(result.content[0].text).toContain('BGH_I_ZR_73_79');
    });
  });

  describe('bib:exists', () => {
    it('should return true for existing', async () => {
      const result = await provider.handleToolCall('bib:exists', { file: testFile, id: 'BGH_I_ZR_73_79' });
      expect(result.content[0].text).toContain('✅');
    });

    it('should return false for missing', async () => {
      const result = await provider.handleToolCall('bib:exists', { file: testFile, id: 'nope' });
      expect(result.content[0].text).toContain('❌');
    });
  });

  describe('bib:stats', () => {
    it('should return counts', async () => {
      const result = await provider.handleToolCall('bib:stats', { file: testFile });
      expect(result.content[0].text).toContain('Total entries: 3');
      expect(result.content[0].text).toContain('legal_case: 1');
    });
  });

  describe('bib:add', () => {
    it('should add entry', async () => {
      const entry = { id: 'New1', type: 'book', title: 'New Book', issued: { 'date-parts': [[2024]] } };
      const result = await provider.handleToolCall('bib:add', { file: testFile, entry });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('New1');
    });

    it('should reject duplicate ID', async () => {
      const entry = { id: 'BGH_I_ZR_73_79', type: 'book', title: 'Dup' };
      const result = await provider.handleToolCall('bib:add', { file: testFile, entry });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('already exists');
    });

    it('should reject missing required fields', async () => {
      const entry = { id: 'BadCase', type: 'legal_case', title: 'Missing fields' };
      const result = await provider.handleToolCall('bib:add', { file: testFile, entry });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('authority');
    });
  });

  describe('bib:update', () => {
    it('should update fields', async () => {
      const result = await provider.handleToolCall('bib:update', {
        file: testFile, id: 'Becker2010', fields: { page: '999' },
      });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('999');
    });
  });

  describe('bib:delete', () => {
    it('should delete entry', async () => {
      const result = await provider.handleToolCall('bib:delete', { file: testFile, id: 'Becker2010' });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('deleted');
    });
  });

  describe('bib:validate', () => {
    it('should validate clean file', async () => {
      const result = await provider.handleToolCall('bib:validate', { file: testFile });
      expect(result.content[0].text).toContain('valid');
    });
  });
});
