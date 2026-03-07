import { readFile, writeFile, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import yaml from 'js-yaml';
import { CslEntry, cslEntrySchema } from './schema.js';
import { FileError } from '../../shared/errors.js';
import { rootLogger } from '../../shared/logger.js';

const logger = rootLogger.child({ module: 'bib-store' });

interface CslDocument {
  references: CslEntry[];
}

export class BibStore {
  /** Read and parse a CSL-YAML file */
  async read(filePath: string): Promise<CslEntry[]> {
    if (!existsSync(filePath)) {
      throw new FileError(`File not found: ${filePath}`, filePath);
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const doc = yaml.load(content) as CslDocument;

      if (!doc || !Array.isArray(doc.references)) {
        throw new FileError('Invalid CSL-YAML: missing "references" array', filePath);
      }

      return doc.references.map((entry) => {
        const result = cslEntrySchema.safeParse(entry);
        if (!result.success) {
          logger.warn('Entry failed schema validation', { id: entry?.id, errors: result.error.issues });
          return entry as CslEntry;
        }
        return result.data;
      });
    } catch (error) {
      if (error instanceof FileError) throw error;
      throw new FileError(
        `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
        filePath,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /** Write entries back to a CSL-YAML file, creating a .bak backup first */
  async write(filePath: string, entries: CslEntry[]): Promise<void> {
    // Backup
    if (existsSync(filePath)) {
      const backupPath = `${filePath}.bak`;
      await copyFile(filePath, backupPath);
      logger.info('Backup created', { backupPath });
    }

    const doc: CslDocument = { references: entries };
    const content = '---\n' + yaml.dump(doc, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
      sortKeys: false,
    });

    await writeFile(filePath, content, 'utf-8');
    logger.info('File written', { filePath, count: entries.length });
  }

  /** Get a single entry by ID */
  async get(filePath: string, id: string): Promise<CslEntry | undefined> {
    const entries = await this.read(filePath);
    return entries.find((e) => e.id === id);
  }

  /** Check if an ID exists */
  async exists(filePath: string, id: string): Promise<boolean> {
    const entries = await this.read(filePath);
    return entries.some((e) => e.id === id);
  }

  /** Add a new entry (appends to end) */
  async add(filePath: string, entry: CslEntry): Promise<void> {
    const entries = await this.read(filePath);
    entries.push(entry);
    await this.write(filePath, entries);
  }

  /** Update fields of an existing entry */
  async update(filePath: string, id: string, fields: Record<string, unknown>): Promise<CslEntry> {
    const entries = await this.read(filePath);
    const index = entries.findIndex((e) => e.id === id);
    if (index === -1) throw new Error(`Entry '${id}' not found`);

    entries[index] = { ...entries[index], ...fields, id } as CslEntry;
    await this.write(filePath, entries);
    return entries[index];
  }

  /** Delete an entry by ID */
  async delete(filePath: string, id: string): Promise<void> {
    const entries = await this.read(filePath);
    const filtered = entries.filter((e) => e.id !== id);
    if (filtered.length === entries.length) throw new Error(`Entry '${id}' not found`);
    await this.write(filePath, filtered);
  }
}
