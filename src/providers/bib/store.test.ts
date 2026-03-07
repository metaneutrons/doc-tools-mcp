import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, rm, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { BibStore } from './store.js';

const SAMPLE_YAML = `---
references:

  - id: BGH_I_ZR_73_79
    type: legal_case
    title: Pornofilme
    authority: BGH
    number: I ZR 73/79
    genre: Urt.
    issued:
      date-parts:
        - - 1981
          - 6
          - 26
    container-title: BGHZ
    volume: "81"
    page: "126"

  - id: WandtkeLehrbuch6
    type: book
    author:
      - family: Wandtke
        given: Artur-Axel
    title: Urheberrecht
    edition: "6"
    publisher: De Gruyter
    publisher-place: Berlin
    issued:
      date-parts:
        - - 2023

  - id: Becker2010
    type: article-journal
    author:
      - family: Becker
        given: Guido Michael
    title: "Wem gehört das nicht eingetragene Gemeinschaftsgeschmacksmuster?"
    container-title: GRUR Int
    issued:
      date-parts:
        - - 2010
    page: "484"
`;

let testDir: string;
let testFile: string;
let store: BibStore;

beforeEach(async () => {
  testDir = join(tmpdir(), `bib-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
  testFile = join(testDir, 'references.yaml');
  await writeFile(testFile, SAMPLE_YAML, 'utf-8');
  store = new BibStore();
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('BibStore', () => {
  describe('read', () => {
    it('should parse CSL-YAML file', async () => {
      const entries = await store.read(testFile);
      expect(entries).toHaveLength(3);
      expect(entries[0].id).toBe('BGH_I_ZR_73_79');
      expect(entries[0].type).toBe('legal_case');
    });

    it('should throw on missing file', async () => {
      await expect(store.read('/nonexistent.yaml')).rejects.toThrow('File not found');
    });

    it('should throw on invalid YAML', async () => {
      await writeFile(testFile, 'not: valid: yaml: [', 'utf-8');
      await expect(store.read(testFile)).rejects.toThrow();
    });

    it('should throw on missing references array', async () => {
      await writeFile(testFile, '---\ntitle: test\n', 'utf-8');
      await expect(store.read(testFile)).rejects.toThrow('missing "references" array');
    });
  });

  describe('get', () => {
    it('should return entry by ID', async () => {
      const entry = await store.get(testFile, 'BGH_I_ZR_73_79');
      expect(entry).toBeDefined();
      expect(entry!.title).toBe('Pornofilme');
    });

    it('should return undefined for unknown ID', async () => {
      const entry = await store.get(testFile, 'nonexistent');
      expect(entry).toBeUndefined();
    });
  });

  describe('exists', () => {
    it('should return true for existing ID', async () => {
      expect(await store.exists(testFile, 'BGH_I_ZR_73_79')).toBe(true);
    });

    it('should return false for unknown ID', async () => {
      expect(await store.exists(testFile, 'nonexistent')).toBe(false);
    });
  });

  describe('add', () => {
    it('should add a new entry', async () => {
      const newEntry = { id: 'NewEntry', type: 'book', title: 'New Book', issued: { 'date-parts': [[2024]] } };
      await store.add(testFile, newEntry);
      const entries = await store.read(testFile);
      expect(entries).toHaveLength(4);
      expect(entries[3].id).toBe('NewEntry');
    });

    it('should create backup file', async () => {
      await store.add(testFile, { id: 'X', type: 'book', title: 'X' });
      const backup = await readFile(`${testFile}.bak`, 'utf-8');
      expect(backup).toContain('BGH_I_ZR_73_79');
    });
  });

  describe('update', () => {
    it('should update fields', async () => {
      const updated = await store.update(testFile, 'BGH_I_ZR_73_79', { page: '999' });
      expect(updated.page).toBe('999');
      expect(updated.title).toBe('Pornofilme');
    });

    it('should throw on unknown ID', async () => {
      await expect(store.update(testFile, 'nonexistent', { title: 'x' })).rejects.toThrow('not found');
    });

    it('should not allow changing ID', async () => {
      const updated = await store.update(testFile, 'BGH_I_ZR_73_79', { id: 'hacked', title: 'New' });
      expect(updated.id).toBe('BGH_I_ZR_73_79');
    });
  });

  describe('delete', () => {
    it('should remove entry', async () => {
      await store.delete(testFile, 'Becker2010');
      const entries = await store.read(testFile);
      expect(entries).toHaveLength(2);
      expect(entries.find((e) => e.id === 'Becker2010')).toBeUndefined();
    });

    it('should throw on unknown ID', async () => {
      await expect(store.delete(testFile, 'nonexistent')).rejects.toThrow('not found');
    });
  });
});
