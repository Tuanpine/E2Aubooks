import React from 'react';
import { EbookChapter } from '../types/ebook';
import { List, X, Clock, FileText, CheckCircle2 } from 'lucide-react';

interface ChapterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: EbookChapter[];
  currentChapterIndex: number;
  onSelectChapter: (index: number) => void;
  bookTitle: string;
}

export const ChapterDrawer: React.FC<ChapterDrawerProps> = ({
  isOpen,
  onClose,
  chapters,
  currentChapterIndex,
  onSelectChapter,
  bookTitle,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
      />

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col h-full z-10 animate-slide-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <List className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Mục lục sách nói</h3>
              <p className="text-xs text-slate-400 truncate max-w-[240px]">{bookTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chapters list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {chapters.map((ch, idx) => {
            const isActive = currentChapterIndex === idx;
            const isRead = idx < currentChapterIndex;

            return (
              <button
                key={ch.id}
                onClick={() => {
                  onSelectChapter(idx);
                  onClose();
                }}
                className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                  isActive
                    ? 'bg-emerald-950/30 border-emerald-500/60 shadow-md shadow-emerald-950/30'
                    : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-mono shrink-0 mt-0.5 ${
                    isActive
                      ? 'bg-emerald-600 text-white font-bold'
                      : isRead
                      ? 'bg-slate-800 text-slate-400'
                      : 'bg-slate-900 border border-slate-800 text-slate-400'
                  }`}
                >
                  {isRead ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <h4
                    className={`text-xs font-medium line-clamp-2 ${
                      isActive ? 'text-emerald-300' : 'text-slate-200'
                    }`}
                  >
                    {ch.title}
                  </h4>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3 text-slate-500" />
                      {ch.wordCount} từ
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      ~{Math.round(ch.estimatedDurationSeconds / 60)} phút
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-400 flex items-center justify-between">
          <span>Tổng số: <strong>{chapters.length} chương</strong></span>
          <span className="text-emerald-400">
            Chương {currentChapterIndex + 1}/{chapters.length}
          </span>
        </div>
      </div>
    </div>
  );
};
