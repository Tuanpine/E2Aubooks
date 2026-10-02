import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

/**
 * Persists uploaded ebooks and rendered audio so both survive a restart and can
 * be listed/reloaded. Files live on disk; SQLite holds the index plus the
 * parsed book (chapters can be large, and re-parsing a 400-chapter EPUB on
 * every page load is slow).
 *
 * Uses the built-in node:sqlite, so there is nothing to install.
 */

export interface BookRecord {
  id: number;
  fileName: string;
  title: string;
  author: string;
  format: string;
  fileSizeBytes: number;
  totalWords: number;
  totalSentences: number;
  createdAt: string;
  coverUrl?: string;
  chapters?: unknown;
}

export interface AudioRecord {
  id: number;
  fileName: string;
  bookTitle: string;
  voiceId: string;
  engine: string;
  format: string;
  durationSec: number;
  sizeBytes: number;
  createdAt: string;
}

export class Library {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.booksDir = path.join(dataDir, 'books');
    this.audioDir = path.join(dataDir, 'audio');
    fs.mkdirSync(this.booksDir, { recursive: true });
    fs.mkdirSync(this.audioDir, { recursive: true });

    this.db = new DatabaseSync(path.join(dataDir, 'library.db'));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        title TEXT, author TEXT, format TEXT,
        file_size_bytes INTEGER,
        total_words INTEGER, total_sentences INTEGER,
        cover_url TEXT,
        chapters TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        book_title TEXT, voice_id TEXT, engine TEXT, format TEXT,
        duration_sec REAL, size_bytes INTEGER,
        created_at TEXT NOT NULL
      );
    `);
  }

  private dataDir: string;
  private booksDir: string;
  private audioDir: string;

  get dirs() {
    return { data: this.dataDir, books: this.booksDir, audio: this.audioDir };
  }

  // ---- books ----

  saveBook(
    fileName: string,
    bytes: Buffer,
    parsed: { metadata: any; chapters: any[] }
  ): BookRecord {
    const meta = parsed.metadata;
    const safeName = `${Date.now()}_${fileName.replace(/[^\w.\-]/g, '_')}`;
    fs.writeFileSync(path.join(this.booksDir, safeName), bytes);

    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO books (file_name, title, author, format, file_size_bytes,
           total_words, total_sentences, cover_url, chapters, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        safeName,
        meta.title ?? fileName,
        meta.author ?? '',
        meta.format ?? '',
        bytes.length,
        meta.totalWords ?? 0,
        meta.totalSentences ?? 0,
        meta.coverUrl ?? null,
        JSON.stringify(parsed.chapters),
        now
      );
    return this.getBook(Number(info.lastInsertRowid))!;
  }

  getBook(id: number): BookRecord | null {
    const row = this.db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      fileName: row.file_name,
      title: row.title,
      author: row.author,
      format: row.format,
      fileSizeBytes: row.file_size_bytes,
      totalWords: row.total_words,
      totalSentences: row.total_sentences,
      coverUrl: row.cover_url ?? undefined,
      createdAt: row.created_at,
      chapters: row.chapters ? JSON.parse(row.chapters) : undefined,
    };
  }

  /** Summaries only — the chapters blob can be megabytes. */
  listBooks(limit = 200): Omit<BookRecord, 'chapters'>[] {
    const rows = this.db
      .prepare('SELECT * FROM books ORDER BY id DESC LIMIT ?')
      .all(limit) as any[];
    return rows.map((row) => ({
      id: row.id,
      fileName: row.file_name,
      title: row.title,
      author: row.author,
      format: row.format,
      fileSizeBytes: row.file_size_bytes,
      totalWords: row.total_words,
      totalSentences: row.total_sentences,
      coverUrl: row.cover_url ?? undefined,
      createdAt: row.created_at,
    }));
  }

  deleteBook(id: number): boolean {
    const book = this.getBook(id);
    if (!book) return false;
    try {
      fs.unlinkSync(path.join(this.booksDir, book.fileName));
    } catch { /* already gone */ }
    this.db.prepare('DELETE FROM books WHERE id = ?').run(id);
    return true;
  }

  // ---- audio ----

  saveAudio(
    fileName: string,
    bytes: Buffer,
    info: { bookTitle?: string; voiceId?: string; engine?: string; format?: string; durationSec?: number }
  ): AudioRecord {
    fs.writeFileSync(path.join(this.audioDir, fileName), bytes);
    const record = {
      fileName,
      bookTitle: info.bookTitle ?? '',
      voiceId: info.voiceId ?? '',
      engine: info.engine ?? '',
      format: info.format ?? 'wav',
      durationSec: info.durationSec ?? 0,
      sizeBytes: bytes.length,
      createdAt: new Date().toISOString(),
    };
    const info2 = this.db
      .prepare(
        `INSERT INTO audio (file_name, book_title, voice_id, engine, format,
           duration_sec, size_bytes, created_at)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(
        record.fileName, record.bookTitle, record.voiceId, record.engine,
        record.format, record.durationSec, record.sizeBytes, record.createdAt
      );
    return { id: Number(info2.lastInsertRowid), ...record };
  }

  listAudio(limit = 200): AudioRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM audio ORDER BY id DESC LIMIT ?')
      .all(limit) as any[];
    return rows.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      bookTitle: r.book_title,
      voiceId: r.voice_id,
      engine: r.engine,
      format: r.format,
      durationSec: r.duration_sec,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
    }));
  }

  deleteAudio(id: number): boolean {
    const row = this.db.prepare('SELECT file_name FROM audio WHERE id = ?').get(id) as any;
    if (!row) return false;
    try {
      fs.unlinkSync(path.join(this.audioDir, row.file_name));
    } catch { /* already gone */ }
    this.db.prepare('DELETE FROM audio WHERE id = ?').run(id);
    return true;
  }

  audioPath(fileName: string): string {
    // Only ever resolve inside the audio dir.
    const resolved = path.resolve(this.audioDir, fileName);
    if (!resolved.startsWith(path.resolve(this.audioDir) + path.sep)) {
      throw new Error('path escapes the audio directory');
    }
    return resolved;
  }
}
