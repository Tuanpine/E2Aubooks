import React, { useState, useRef } from 'react';
import { ParsedEbook } from '../types/ebook';
import { parseEbookFile } from '../utils/ebookParser';
import { library } from '../utils/library';
import { SAMPLE_BOOKS } from '../data/sampleBooks';
import { UploadCloud, FileText, BookOpen, AlertCircle, Loader2, X, CheckCircle2 } from 'lucide-react';

interface EbookUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookLoaded: (book: ParsedEbook) => void;
}

export const EbookUploaderModal: React.FC<EbookUploaderModalProps> = ({
  isOpen,
  onClose,
  onBookLoaded,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileProcess = async (file: File) => {
    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage(`Đang đọc và giải mã ${file.name}...`);

    try {
      const parsedBook = await parseEbookFile(file);
      setStatusMessage('Phân tích chương hồi và cấu trúc câu thành công!');

      // Keep a copy on the server so the book survives a reload. Failure here
      // must not block reading: the parsed book is already in hand.
      try {
        await library.saveUpload(file);
        setStatusMessage('Đã lưu sách vào thư viện trên máy chủ.');
      } catch (e) {
        console.warn('Lưu sách lên server thất bại:', e);
      }

      setTimeout(() => {
        setIsLoading(false);
        onBookLoaded(parsedBook);
        onClose();
      }, 400);
    } catch (err: any) {
      console.error('File parsing error:', err);
      setIsLoading(false);
      setErrorMessage(
        err.message || 'Không thể đọc tệp sách này. Vui lòng kiểm tra định dạng hoặc thử tệp khác.'
      );
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const handleSelectSample = (sample: ParsedEbook) => {
    onBookLoaded(sample);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                Thêm Sách Điện Tử (Ebook)
              </h2>
              <p className="text-xs text-slate-400">
                Hỗ trợ tất cả định dạng: EPUB, MOBI, AZW3, PDF, DOCX, TXT, MD
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Dropzone */}
          <div
            onDragOver={e => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed transition-all ${
              isDragging
                ? 'border-cyan-400 bg-cyan-950/20 scale-[0.99]'
                : 'border-slate-700 hover:border-cyan-500/60 bg-slate-950/40 hover:bg-slate-950/70'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,.mobi,.azw,.azw3,.pdf,.docx,.txt,.md"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {isLoading ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                <p className="text-sm font-medium text-slate-200">{statusMessage}</p>
                <p className="text-xs text-slate-400">Đang chuẩn bị bộ đồng bộ âm thanh...</p>
              </div>
            ) : (
              <>
                <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mb-3">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <h3 className="text-base font-semibold text-slate-200 mb-1">
                  Kéo thả tệp sách vào đây hoặc bấm để chọn tệp
                </h3>
                <p className="text-xs text-slate-400 mb-4 text-center max-w-md">
                  Hệ thống tự động nhận diện chương hồi, chia câu thông minh và tạo bookmark phát âm thanh đồng bộ.
                </p>

                {/* Formats badges */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-mono">
                  {['.EPUB', '.MOBI', '.AZW3', '.PDF', '.DOCX', '.TXT'].map(fmt => (
                    <span
                      key={fmt}
                      className="px-2.5 py-1 rounded-md bg-slate-800/90 border border-slate-700 text-slate-300"
                    >
                      {fmt}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Sample Books Quick Library */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              Hoặc chọn sách mẫu có sẵn để trải nghiệm ngay
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SAMPLE_BOOKS.map(sample => (
                <button
                  key={sample.metadata.fileName}
                  onClick={() => handleSelectSample(sample)}
                  className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-800/70 hover:border-cyan-500/40 text-left transition group"
                >
                  {sample.metadata.coverUrl ? (
                    <img
                      src={sample.metadata.coverUrl}
                      alt={sample.metadata.title}
                      className="w-12 h-16 object-cover rounded-lg shrink-0 shadow-md"
                    />
                  ) : (
                    <div className="w-12 h-16 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                      <FileText className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h5 className="text-sm font-medium text-slate-200 group-hover:text-cyan-400 transition truncate">
                      {sample.metadata.title}
                    </h5>
                    <p className="text-xs text-slate-400">{sample.metadata.author}</p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                      <span className="uppercase font-mono text-cyan-400">
                        {sample.metadata.format}
                      </span>
                      <span>•</span>
                      <span>{sample.chapters.length} chương</span>
                      <span>•</span>
                      <span>~{sample.metadata.estimatedDurationMinutes} phút</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
