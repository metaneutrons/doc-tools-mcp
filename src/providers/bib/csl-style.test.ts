import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseStyleVariables, getRequiredVariables } from './csl-style.js';

const testDir = join(tmpdir(), `csl-test-${Date.now()}`);
const stylePath = join(testDir, 'test.csl');

const SAMPLE_CSL = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="note" version="1.0">
  <info><title>Test Style</title></info>
  <macro name="author">
    <names variable="author editor"/>
  </macro>
  <bibliography>
    <layout>
      <text variable="title"/>
      <date variable="issued"/>
      <choose>
        <if type="legal_case">
          <text variable="authority"/>
          <text variable="number"/>
        </if>
        <else-if type="book chapter">
          <text variable="publisher"/>
        </else-if>
      </choose>
    </layout>
  </bibliography>
</style>`;

beforeAll(async () => {
  await mkdir(testDir, { recursive: true });
  await writeFile(stylePath, SAMPLE_CSL, 'utf-8');
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('parseStyleVariables', () => {
  it('extracts global variables', async () => {
    const style = await parseStyleVariables(stylePath);
    expect(style.global).toContain('title');
    expect(style.global).toContain('issued');
    expect(style.global).toContain('author');
    expect(style.global).toContain('editor');
  });

  it('extracts type-specific variables', async () => {
    const style = await parseStyleVariables(stylePath);
    expect(style.byType.get('legal_case')).toContain('authority');
    expect(style.byType.get('legal_case')).toContain('number');
    expect(style.byType.get('book')).toContain('publisher');
    expect(style.byType.get('chapter')).toContain('publisher');
  });

  it('does not leak type-specific variables into global', async () => {
    const style = await parseStyleVariables(stylePath);
    expect(style.global).not.toContain('authority');
    expect(style.global).not.toContain('publisher');
  });

  it('collects knownTypes from conditionals', async () => {
    const style = await parseStyleVariables(stylePath);
    expect(style.knownTypes).toContain('legal_case');
    expect(style.knownTypes).toContain('book');
    expect(style.knownTypes).toContain('chapter');
    expect(style.knownTypes).not.toContain('article-journal');
  });

  it('handles space-separated variables', async () => {
    const style = await parseStyleVariables(stylePath);
    // variable="author editor" should produce both
    expect(style.global).toContain('author');
    expect(style.global).toContain('editor');
  });

  it('throws on missing file', async () => {
    await expect(parseStyleVariables('/nonexistent.csl')).rejects.toThrow('Style file not found');
  });
});

describe('getRequiredVariables', () => {
  it('returns global + type-specific for known type', async () => {
    const style = await parseStyleVariables(stylePath);
    const vars = getRequiredVariables(style, 'legal_case');
    expect(vars).toContain('title');
    expect(vars).toContain('issued');
    expect(vars).toContain('authority');
    expect(vars).toContain('number');
  });

  it('returns only global for unknown type', async () => {
    const style = await parseStyleVariables(stylePath);
    const vars = getRequiredVariables(style, 'article-journal');
    expect(vars).toContain('title');
    expect(vars).not.toContain('authority');
    expect(vars).not.toContain('publisher');
  });

  it('merges shared type variables (book/chapter)', async () => {
    const style = await parseStyleVariables(stylePath);
    const bookVars = getRequiredVariables(style, 'book');
    const chapterVars = getRequiredVariables(style, 'chapter');
    expect(bookVars).toContain('publisher');
    expect(chapterVars).toContain('publisher');
    // both also get globals
    expect(bookVars).toContain('title');
    expect(chapterVars).toContain('title');
  });
});
