import { ParsedEbook } from '../types/ebook';

export interface LibraryBook {
  id: number;
  fileName: string;
  title: string;
  author: string;
  format: string;
  fileSizeBytes: number;
  totalWords: number;
  totalSentences: number;
  coverUrl?: string;
  createdAt: string;
  chapters?: unknown;
}

export interface LibraryAudio {
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

/** Blob -> base64. Chunked so a 50 MB book does not blow the argument limit. */
export async function toBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export const library = {
  /** Upload a book to the server library. */
  async saveUpload(file: File): Promise<LibraryBook> {
    const res = await fetch('/api/library/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: file.name, data_base64: await toBase64(file) }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return (await res.json()).book;
  },

  async listBooks(): Promise<LibraryBook[]> {
    const res = await fetch('/api/library/books');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).books;
  },

  /** Rebuild a ParsedEbook from a stored library entry. */
  async loadBook(id: number): Promise<ParsedEbook> {
    const res = await fetch(`/api/library/books/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { book } = await res.json();
    return {
      metadata: {
        title: book.title,
        author: book.author,
        language: 'vi',
        format: book.format as any,
        fileName: book.fileName,
        fileSizeBytes: book.fileSizeBytes,
        totalWords: book.totalWords,
        totalSentences: book.totalSentences,
        estimatedDurationMinutes: Math.ceil(book.totalWords / 160),
        coverUrl: book.coverUrl,
        description: '',
      },
      chapters: book.chapters,
    } as ParsedEbook;
  },

  async deleteBook(id: number): Promise<void> {
    await fetch(`/api/library/books/${id}`, { method: 'DELETE' });
  },

  async listAudio(): Promise<LibraryAudio[]> {
    const res = await fetch('/api/library/audio');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).audio;
  },

  /**
   * Keep a rendered file on the server so it can be inspected later.
   * Sent as binary: base64-encoding a multi-hundred-megabyte WAV would triple
   * it into a string and blow the tab heap.
   */
  async saveAudio(
    blob: Blob,
    meta: { bookTitle: string; voiceId: string; engine: string; format: string; durationSec: number }
  ): Promise<LibraryAudio> {
    const name = meta.bookTitle.replace(/[^\w.\-]/g, '_') + '.' + meta.format;
    const res = await fetch(
      '/api/library/audio?name=' + encodeURIComponent(name) +
      '&voice=' + encodeURIComponent(meta.voiceId) +
      '&engine=' + encodeURIComponent(meta.engine), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).record;
  },

  audioUrl(id: number): string {
    return `/api/library/audio/${id}/download`;
  },

  async deleteAudio(id: number): Promise<void> {
    await fetch(`/api/library/audio/${id}`, { method: 'DELETE' });
  },
};
