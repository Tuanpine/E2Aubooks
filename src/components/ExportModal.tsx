import React, { useState } from 'react';
import { EbookChapter, AudiobookVoice, ParsedEbook } from '../types/ebook';
import { audioEngine, resolveLocalVoice } from '../utils/audioEngine';
import { library } from '../utils/library';
import { AmbientSoundType, AMBIENT_TRACKS, createAmbientSampler } from '../utils/ambientSoundscapes';
import {
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  Music,
  Sparkles,
  Sliders,
  Tag,
  Radio,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: ParsedEbook;
  currentChapterIndex: number;
  voice: AudiobookVoice;
  playbackRate: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  book,
  currentChapterIndex,
  voice,
  playbackRate,
}) => {
  const [exportScope, setExportScope] = useState<'current' | 'all'>('current');
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('wav');
  const [mp3Bitrate, setMp3Bitrate] = useState<number>(96);
  const [ambientMix, setAmbientMix] = useState<AmbientSoundType>('none');
  const [ambientVolume, setAmbientVolume] = useState<number>(0.2); // 20%
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState('');

  if (!isOpen) return null;

  const currentChapter = book.chapters[currentChapterIndex] || book.chapters[0];

  const handleStartExport = async () => {
    setIsExporting(true);
    setDownloadUrl(null);
    setExportProgress(2);
    setExportStatusText('Đang chuẩn bị...');

    try {
      const chaptersToExport =
        exportScope === 'current' ? [currentChapter] : book.chapters;

      const target = resolveLocalVoice(voice);
      if (!target) {
        throw new Error('Giọng hệ thống (Native) không xuất file được — hãy chọn giọng neural.');
      }

      const sentences = chaptersToExport.flatMap(ch => ch.sentences);
      if (sentences.length === 0) throw new Error('Không tìm thấy câu nào để đọc.');

      setExportStatusText('Đang tổng hợp & trộn nhạc nền...');

      const wavBlob = await audioEngine.synthesizeSentences(
        sentences,
        target.engine,
        target.name,
        done => {
          setExportStatusText(
            `Đang tổng hợp câu ${done}/${sentences.length} — ${voice.name} (${target.engine})`
          );
          setExportProgress(Math.floor((done / sentences.length) * 88) + 2);
        },
        // Fresh sampler per sentence: the noise filters carry state, so one
        // sampler for the whole book would never loop and the filters would
        // integrate without bound.
        data => {
          const sampleAt = createAmbientSampler(ambientMix);
          return audioEngine.floatTo16Bit(data, ambientMix, ambientVolume, sampleAt);
        }
      );

      let blob = wavBlob;
      let ext = 'wav';
      if (exportFormat === 'mp3') {
        setExportStatusText('Đang nén MP3...');
        try {
          const encoded = await audioEngine.encodeMp3(wavBlob, mp3Bitrate);
          if (encoded) { blob = encoded; ext = 'mp3'; }
        } catch (e) {
          console.warn('MP3 encode failed, keeping WAV:', e);
        }
      }
      const url = URL.createObjectURL(blob);
      const sanitizedTitle = book.metadata.title.replace(/[^a-zA-Z0-9_À-ỹ]/g, '_');
      const filename =
        exportScope === 'current'
          ? `${sanitizedTitle}_Chuong_${currentChapter.index}_${voice.id}.${ext}`
          : `${sanitizedTitle}_Full_Audiobook_${voice.id}.${ext}`;

      // Keep a copy on the server so a bad render can be re-inspected later.
      try {
        await library.saveAudio(blob, {
          bookTitle: filename.replace(/\.[^.]+$/, ''),
          voiceId: voice.id,
          engine: target.engine,
          format: ext,
          // 16-bit mono at 24 kHz; the 44-byte header is not audio.
          durationSec: Math.max(0, (wavBlob.size - 44) / 48000),
        });
      } catch (e) {
        console.warn('Lưu audio lên server thất bại:', e);
      }

      setDownloadUrl(url);
      setDownloadFilename(filename);
      setExportProgress(100);
      setExportStatusText('Hoàn tất xuất file sách nói!');
      setIsExporting(false);
    } catch (err: any) {
      console.error('Audiobook export error:', err);
      setIsExporting(false);
      setExportStatusText('Có lỗi xảy ra trong quá trình xuất âm thanh.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Xuất Tệp Sách Nói (Audiobook WAV)
              </h2>
              <p className="text-xs text-slate-400">
                Nhúng Metadata ID3 & Tùy chọn hòa âm Nhạc nền không gian
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
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Export Scope */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              1. Phạm vi xuất âm thanh
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportScope('current')}
                className={`p-3.5 rounded-xl border text-left transition ${
                  exportScope === 'current'
                    ? 'bg-purple-950/30 border-purple-500/80 text-slate-100 shadow-md shadow-purple-950/30'
                    : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-sm text-slate-200 mb-0.5">
                  Chương hiện tại
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {currentChapter.title}
                </div>
                <div className="mt-2 text-[11px] text-purple-400 font-mono">
                  ~{Math.round(currentChapter.estimatedDurationSeconds / 60)} phút
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportScope('all')}
                className={`p-3.5 rounded-xl border text-left transition ${
                  exportScope === 'all'
                    ? 'bg-purple-950/30 border-purple-500/80 text-slate-100 shadow-md shadow-purple-950/30'
                    : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-sm text-slate-200 mb-0.5">
                  Toàn bộ cuốn sách
                </div>
                <div className="text-xs text-slate-400">
                  {book.chapters.length} chương liên tục
                </div>
                <div className="mt-2 text-[11px] text-purple-400 font-mono">
                  ~{book.metadata.estimatedDurationMinutes} phút
                </div>
              </button>
            </div>
          </div>

          {/* Ambient BGM Mixing Option */}
          <div className="space-y-2.5 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                2. Hòa âm Nhạc nền / Âm thanh không gian:
              </span>
              <span className="font-mono text-cyan-400 font-medium">
                {ambientMix === 'none' ? 'Tắt' : `${Math.round(ambientVolume * 100)}% âm lượng`}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {AMBIENT_TRACKS.map(track => (
                <button
                  key={track.id}
                  onClick={() => setAmbientMix(track.id)}
                  className={`p-2 rounded-lg border text-left transition text-xs flex items-center gap-1.5 ${
                    ambientMix === track.id
                      ? 'bg-cyan-950/40 border-cyan-500/70 text-cyan-200 font-semibold'
                      : 'bg-slate-900 border-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{track.emoji}</span>
                  <span className="truncate">{track.name}</span>
                </button>
              ))}
            </div>

            {ambientMix !== 'none' && (
              <div className="pt-2 flex items-center gap-3">
                <span className="text-[11px] text-slate-400">Âm lượng BGM:</span>
                <input
                  type="range"
                  min="0.05"
                  max="0.5"
                  step="0.05"
                  value={ambientVolume}
                  onChange={e => setAmbientVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Metadata ID3 Info Preview */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
            <span className="font-semibold text-slate-400 uppercase tracking-wider text-[11px] flex items-center gap-1">
              <Tag className="w-3 h-3 text-emerald-400" />
              Thông tin tệp Audio xuất (ID3 Metadata):
            </span>
            <div className="grid grid-cols-2 gap-2 text-slate-300 text-[11px]">
              <div>
                <span className="text-slate-500 block">Tiêu đề:</span>
                <span className="font-medium truncate block">{book.metadata.title}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Tác giả:</span>
                <span className="font-medium truncate block">{book.metadata.author}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Định dạng:</span>
                <div className="flex gap-1.5 mt-1">
                  {(['wav', 'mp3'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setExportFormat(f)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        exportFormat === f
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                  {exportFormat === 'mp3' && (
                    <select
                      value={mp3Bitrate}
                      onChange={e => setMp3Bitrate(parseInt(e.target.value, 10))}
                      className="px-2 py-1 rounded-lg text-xs bg-white/5 text-slate-300 border border-white/10"
                    >
                      <option value={64}>64 kbps</option>
                      <option value={96}>96 kbps</option>
                      <option value={128}>128 kbps</option>
                      <option value={192}>192 kbps</option>
                    </select>
                  )}
                </div>
              </div>
              <div>
                <span className="text-slate-500 block">Mô hình giọng:</span>
                <span className="font-medium text-purple-400 block">{voice.name}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Định dạng âm thanh:</span>
                <span className="font-mono text-emerald-400 block">
                  {exportFormat === 'mp3'
                    ? `MP3 (${mp3Bitrate} kbps, mono)`
                    : 'WAV (24kHz Mono 16-bit)'}
                </span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {isExporting && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">{exportStatusText}</span>
                <span className="font-mono text-purple-400 font-bold">{exportProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Ready to Download Link */}
          {downloadUrl && (
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-emerald-300">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{downloadFilename}</div>
                  <div className="text-[11px] text-emerald-400/80">Sẵn sàng lưu về máy!</div>
                </div>
              </div>
              <a
                href={downloadUrl}
                download={downloadFilename}
                className="shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-md shadow-emerald-900/30"
              >
                <Download className="w-4 h-4" />
                Tải tệp
              </a>
            </div>
          )}

          {/* Start Button */}
          {!downloadUrl && (
            <button
              onClick={handleStartExport}
              disabled={isExporting}
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang tổng hợp Audiobook...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Bắt đầu kết xuất Sách nói
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
