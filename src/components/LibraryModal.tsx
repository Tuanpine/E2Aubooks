import React, { useEffect, useState } from 'react';
import { library, LibraryBook, LibraryAudio } from '../utils/library';
import { ParsedEbook } from '../types/ebook';
import { BookOpen, Headphones, Trash2, Download, X, Loader2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onBookLoaded: (book: ParsedEbook) => void;
}

const fmtSize = (n: number) =>
  n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

const fmtDuration = (s: number) => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${Math.round(s % 60)}s`;
};

/** Lists what is stored on the server: uploaded books and rendered audio. */
export const LibraryModal: React.FC<Props> = ({ isOpen, onClose, onBookLoaded }) => {
  const [tab, setTab] = useState<'books' | 'audio'>('books');
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [audio, setAudio] = useState<LibraryAudio[]>([]);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const refresh = async () => {
    try {
      const [b, a] = await Promise.all([library.listBooks(), library.listAudio()]);
      setBooks(b);
      setAudio(a);
    } catch (e) {
      console.warn('Không tải được thư viện:', e);
    }
  };

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen]);

  if (!isOpen) return null;

  const openBook = async (id: number) => {
    setLoadingId(id);
    try {
      onBookLoaded(await library.loadBook(id));
      onClose();
    } catch (e) {
      alert(`Không mở được sách: ${(e as Error).message}`);
    } finally {
      setLoadingId(null);
    }
  };

  const removeBook = async (id: number) => {
    await library.deleteBook(id);
    refresh();
  };

  const removeAudio = async (id: number) => {
    await library.deleteAudio(id);
    refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-white font-semibold">Thư viện trên máy chủ</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 p-3 border-b border-white/10">
          <button
            onClick={() => setTab('books')}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${
              tab === 'books'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-white/5 text-slate-400 border border-white/10'
            }`}
          >
            <BookOpen className="w-4 h-4" /> Sách ({books.length})
          </button>
          <button
            onClick={() => setTab('audio')}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${
              tab === 'audio'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-white/5 text-slate-400 border border-white/10'
            }`}
          >
            <Headphones className="w-4 h-4" /> Audio ({audio.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {tab === 'books' &&
            (books.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">
                Chưa lưu sách nào. Thêm ebook sẽ tự động lưu vào đây.
              </p>
            ) : (
              books.map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <BookOpen className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{b.title}</p>
                    <p className="text-slate-500 text-xs truncate">
                      {b.author || 'Không rõ tác giả'} · {b.format.toUpperCase()} ·{' '}
                      {b.totalWords.toLocaleString()} từ · {fmtSize(b.fileSizeBytes)} ·{' '}
                      {new Date(b.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <button
                    onClick={() => openBook(b.id)}
                    disabled={loadingId === b.id}
                    className="px-3 py-1.5 rounded-lg text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    {loadingId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Mở'}
                  </button>
                  <button
                    onClick={() => removeBook(b.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                    title="Xoá"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            ))}

          {tab === 'audio' &&
            (audio.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">
                Chưa có audio nào được lưu. Xuất sách nói sẽ tự động lưu vào đây.
              </p>
            ) : (
              audio.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <Headphones className="w-5 h-5 text-sky-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{a.fileName}</p>
                    <p className="text-slate-500 text-xs truncate">
                      {a.engine} · {a.voiceId} · {a.format.toUpperCase()} ·{' '}
                      {fmtDuration(a.durationSec)} · {fmtSize(a.sizeBytes)} ·{' '}
                      {new Date(a.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <a
                    href={library.audioUrl(a.id)}
                    download
                    className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-sky-500/10"
                    title="Tải xuống"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => removeAudio(a.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                    title="Xoá"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            ))}
        </div>
      </div>
    </div>
  );
};
