import React, { useState, useRef } from 'react';
import { AudiobookVoice } from '../types/ebook';
import { parseEbookFile } from '../utils/ebookParser';
import { audioEngine, resolveLocalVoice } from '../utils/audioEngine';
import {
  Layers,
  UploadCloud,
  Play,
  Pause,
  CheckCircle,
  AlertTriangle,
  Clock,
  HardDrive,
  Cpu,
  Zap,
  Trash2,
  X,
  FileText,
  Sliders,
  FolderDown,
  Info,
  ShieldCheck,
  ThermometerSnowflake,
  Moon,
  ChevronRight,
} from 'lucide-react';

export interface BatchItem {
  id: string;
  file: File;
  title: string;
  format: string;
  totalWords: number;
  totalChapters: number;
  estimatedMinutes: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  errorMessage?: string;
  downloadUrl?: string;
  downloadFilename?: string;
}

interface BatchConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableVoices: AudiobookVoice[];
  defaultVoice: AudiobookVoice;
}

export const BatchConvertModal: React.FC<BatchConvertModalProps> = ({
  isOpen,
  onClose,
  availableVoices,
  defaultVoice,
}) => {
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(defaultVoice.id);
  const [hardwareMode, setHardwareMode] = useState<'cuda' | 'cpu'>('cuda');
  const [skipOnError, setSkipOnError] = useState(true);
  const [gpuCooldownSeconds, setGpuCooldownSeconds] = useState(5);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'guidelines'>('queue');
  const [activeBatchIndex, setActiveBatchIndex] = useState<number>(-1);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isStopRequestedRef = useRef(false);

  if (!isOpen) return null;

  const handleFilesAdded = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: BatchItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      
      try {
        // Fast pre-parsing to calculate words and chapters
        const parsed = await parseEbookFile(file);
        const totalWords = parsed.chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
        const estMins = Math.max(1, Math.round(totalWords / 160));

        newItems.push({
          id: `${file.name}-${Date.now()}-${i}`,
          file,
          title: parsed.metadata.title || file.name,
          format: ext.toUpperCase(),
          totalWords,
          totalChapters: parsed.chapters.length,
          estimatedMinutes: estMins,
          status: 'pending',
          progress: 0,
        });
      } catch (err: any) {
        // If pre-parsing failed, still enqueue with estimate
        newItems.push({
          id: `${file.name}-${Date.now()}-${i}`,
          file,
          title: file.name.replace(/\.[^/.]+$/, ''),
          format: ext.toUpperCase(),
          totalWords: Math.round(file.size / 6),
          totalChapters: 1,
          estimatedMinutes: Math.round(file.size / (6 * 160)),
          status: 'pending',
          progress: 0,
        });
      }
    }

    setQueue(prev => [...prev, ...newItems]);
  };

  const handleRemoveItem = (id: string) => {
    if (isProcessing) return;
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const handleClearAll = () => {
    if (isProcessing) return;
    setQueue([]);
  };

  const startBatchProcess = async () => {
    if (queue.length === 0) return;
    setIsProcessing(true);
    isStopRequestedRef.current = false;

    const voice = availableVoices.find(v => v.id === selectedVoiceId) || defaultVoice;
    const target = resolveLocalVoice(voice);
    if (!target) {
      alert('Giọng hệ thống (Native) không xuất file được — hãy chọn giọng neural.');
      return;
    }

    for (let i = 0; i < queue.length; i++) {
      if (isStopRequestedRef.current) break;
      const item = queue[i];
      if (item.status === 'completed') continue;

      setActiveBatchIndex(i);

      // Update status to processing
      setQueue(prev =>
        prev.map((it, idx) =>
          idx === i ? { ...it, status: 'processing', progress: 5 } : it
        )
      );

      try {
        // 1. Parse book fully
        const parsedBook = await parseEbookFile(item.file);

        // 2. One daemon call per sentence, assembled into a WAV. Same path the
        //    single-book export uses, so a batch file sounds identical.
        const sentences = parsedBook.chapters.flatMap(ch => ch.sentences);
        if (sentences.length === 0) throw new Error('Không tìm thấy câu nào để đọc.');

        const wavBlob = await audioEngine.synthesizeSentences(
          sentences,
          target.engine,
          target.name,
          done => {
            const currentProg = Math.floor(10 + (done / sentences.length) * 80);
            setQueue(prev =>
              prev.map((it, idx) =>
                idx === i ? { ...it, progress: currentProg } : it
              )
            );
          }
        );

        // 3. Create download URL
        const url = URL.createObjectURL(wavBlob);
        const sanitizedTitle = item.title.replace(/[^a-zA-Z0-9_À-ỹ]/g, '_');
        const filename = `${sanitizedTitle}_Audiobook_${voice.id}.wav`;

        setQueue(prev =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: 'completed',
                  progress: 100,
                  downloadUrl: url,
                  downloadFilename: filename,
                }
              : it
          )
        );

        // 4. GPU Cooldown between heavy book renders
        if (i < queue.length - 1 && gpuCooldownSeconds > 0) {
          await new Promise(res => setTimeout(res, gpuCooldownSeconds * 1000));
        }
      } catch (err: any) {
        console.error(`Error processing batch item ${item.title}:`, err);
        setQueue(prev =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: 'error',
                  progress: 0,
                  errorMessage: err.message || 'Lỗi xử lý tệp',
                }
              : it
          )
        );

        if (!skipOnError) {
          break; // Stop batch on error if configured
        }
      }
    }

    setIsProcessing(false);
    setActiveBatchIndex(-1);
  };

  const stopBatchProcess = () => {
    isStopRequestedRef.current = true;
    setIsProcessing(false);
    setActiveBatchIndex(-1);
  };

  const totalBatchWords = queue.reduce((sum, it) => sum + it.totalWords, 0);
  const totalBatchHours = (totalBatchWords / (160 * 60)).toFixed(1);
  const completedCount = queue.filter(it => it.status === 'completed').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">
                  Batch Audiobooks Converter (Chuyển Đổi Hàng Loạt Qua Đêm)
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono">
                  Overnight Worker
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Xếp hàng nhiều sách (EPUB, MOBI, PDF, DOCX) và tự động tạo Audiobook liên tục
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex bg-slate-800/80 rounded-lg p-0.5 border border-slate-700 text-xs">
              <button
                onClick={() => setActiveTab('queue')}
                className={`px-3 py-1 rounded-md transition ${
                  activeTab === 'queue'
                    ? 'bg-cyan-600 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Hàng đợi ({queue.length})
              </button>
              <button
                onClick={() => setActiveTab('guidelines')}
                className={`px-3 py-1 rounded-md flex items-center gap-1 transition ${
                  activeTab === 'guidelines'
                    ? 'bg-cyan-600 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
                Lưu ý qua đêm
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TAB 1: Queue & Execution */}
        {activeTab === 'queue' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top Toolbar / Configuration */}
            <div className="p-4 bg-slate-950/50 border-b border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {/* Select Voice */}
              <div>
                <label className="text-slate-400 font-medium block mb-1">
                  Mô hình & Giọng đọc mục tiêu:
                </label>
                <select
                  value={selectedVoiceId}
                  disabled={isProcessing}
                  onChange={e => setSelectedVoiceId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {availableVoices.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.engineLabel})
                    </option>
                  ))}
                </select>
              </div>

              {/* Hardware Selection */}
              <div>
                <label className="text-slate-400 font-medium block mb-1">
                  Tăng tốc phần cứng:
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHardwareMode('cuda')}
                    className={`px-2 py-1.5 rounded-lg border text-center font-medium transition ${
                      hardwareMode === 'cuda'
                        ? 'bg-emerald-950/40 border-emerald-500/70 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    NVIDIA CUDA
                  </button>
                  <button
                    type="button"
                    onClick={() => setHardwareMode('cpu')}
                    className={`px-2 py-1.5 rounded-lg border text-center font-medium transition ${
                      hardwareMode === 'cpu'
                        ? 'bg-cyan-950/40 border-cyan-500/70 text-cyan-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    CPU Đa nhân
                  </button>
                </div>
              </div>

              {/* Safety & Cooldown */}
              <div>
                <label className="text-slate-400 font-medium block mb-1 flex items-center justify-between">
                  <span>Nghỉ GPU giữa các cuốn:</span>
                  <span className="text-cyan-400 font-mono">{gpuCooldownSeconds}s</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="5"
                  value={gpuCooldownSeconds}
                  disabled={isProcessing}
                  onChange={e => setGpuCooldownSeconds(parseInt(e.target.value))}
                  className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Queue List Table */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {queue.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-800 hover:border-cyan-500/60 rounded-2xl p-10 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 group"
                >
                  <div className="p-4 rounded-2xl bg-cyan-500/10 group-hover:bg-cyan-500/20 text-cyan-400 transition">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-200 text-sm">
                      Kéo thả nhiều tệp Ebook vào đây hoặc Bấm để chọn
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Hỗ trợ hàng loạt EPUB, MOBI, PDF, DOCX, TXT cùng lúc
                    </p>
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Chọn tệp Ebook
                  </span>
                </div>
              ) : (
                queue.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      activeBatchIndex === idx
                        ? 'bg-cyan-950/30 border-cyan-500/70 shadow-lg'
                        : item.status === 'completed'
                        ? 'bg-emerald-950/20 border-emerald-500/30'
                        : item.status === 'error'
                        ? 'bg-red-950/20 border-red-500/30'
                        : 'bg-slate-950/50 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 text-xs font-mono flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-200 text-xs truncate max-w-sm">
                            {item.title}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 font-mono text-cyan-400 uppercase">
                            {item.format}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                          <span>{item.totalWords.toLocaleString()} từ</span>
                          <span>•</span>
                          <span>{item.totalChapters} chương</span>
                          <span>•</span>
                          <span>~{item.estimatedMinutes} phút audio</span>
                        </div>
                      </div>
                    </div>

                    {/* Progress / Status & Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      {item.status === 'processing' && (
                        <div className="w-36 space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-cyan-400">Đang tổng hợp...</span>
                            <span className="font-mono text-cyan-300 font-bold">{item.progress}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-cyan-500 transition-all duration-200"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {item.status === 'completed' && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-emerald-400 flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            Xong
                          </span>
                          {item.downloadUrl && (
                            <a
                              href={item.downloadUrl}
                              download={item.downloadFilename}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium flex items-center gap-1 transition"
                            >
                              <FolderDown className="w-3.5 h-3.5" />
                              Tải WAV
                            </a>
                          )}
                        </div>
                      )}

                      {item.status === 'error' && (
                        <span className="text-xs text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" />
                          Lỗi
                        </span>
                      )}

                      {item.status === 'pending' && (
                        <span className="text-xs text-slate-500 font-mono">Chờ lượt</span>
                      )}

                      {!isProcessing && (
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 rounded transition"
                          title="Xóa khỏi hàng đợi"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Hidden Multi-file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".epub,.mobi,.azw,.pdf,.docx,.txt"
              onChange={e => handleFilesAdded(e.target.files)}
              className="hidden"
            />

            {/* Bottom Status & Control Bar */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400 flex items-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 transition disabled:opacity-50"
                >
                  + Thêm Ebook
                </button>
                {queue.length > 0 && !isProcessing && (
                  <button
                    onClick={handleClearAll}
                    className="text-slate-500 hover:text-red-400 text-xs transition"
                  >
                    Xóa tất cả
                  </button>
                )}
                <span>
                  Tổng: <b>{queue.length} cuốn</b> ({completedCount} hoàn tất) • ~{totalBatchHours} giờ audio
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isProcessing ? (
                  <button
                    onClick={stopBatchProcess}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-red-900/20"
                  >
                    <Pause className="w-4 h-4 fill-current" />
                    Tạm dừng Convert
                  </button>
                ) : (
                  <button
                    onClick={startBatchProcess}
                    disabled={queue.length === 0}
                    className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-cyan-900/30"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Bắt đầu chạy Convert hàng loạt
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Overnight Guidelines & Best Practices */}
        {activeTab === 'guidelines' && (
          <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-300 max-h-[75vh]">
            <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-2">
              <h3 className="font-bold text-sm text-cyan-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                5 Điều Cần Đặc Biệt Lưu Ý Khi Convert Sách Nói Qua Đêm (Overnight Conversion)
              </h3>
              <p className="text-slate-300 leading-relaxed">
                Khi máy trạm chạy liên tục 6 đến 10 tiếng tổng hợp hàng chục nghìn câu audio, bạn cần chú ý các rủi ro hệ thống sau để đảm bảo quá trình không bị gián đoạn:
              </p>
            </div>

            {/* Checklist */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Note 1: Sleep mode */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                <div className="font-bold text-slate-100 flex items-center gap-1.5">
                  <Moon className="w-4 h-4 text-amber-400" />
                  1. Chống máy tự động Sleep / Ngủ
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Windows và macOS có chế độ tự ngủ sau 15-30 phút không chạm chuột.
                  <br />
                  - <b>Windows</b>: Vào Settings → Power & Sleep → Đặt "When plugged in, PC goes to sleep after: <b>Never</b>".
                  <br />
                  - <b>macOS</b>: Dùng lệnh <code>caffeinate -d</code> trong Terminal trước khi đi ngủ.
                </p>
              </div>

              {/* Note 2: Thermal */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                <div className="font-bold text-slate-100 flex items-center gap-1.5">
                  <ThermometerSnowflake className="w-4 h-4 text-cyan-400" />
                  2. Nhiệt độ và Công suất GPU NVIDIA
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Chạy liên tục nhiều giờ khiến GPU nóng lên 70°C - 85°C.
                  <br />
                  - Đặt thời gian nghỉ GPU Cooldown từ <b>5 đến 10 giây</b> giữa các cuốn sách để quạt tản nhiệt hạ nhiệt độ VRAM.
                  <br />
                  - Đảm bảo lỗ thông gió thùng máy hoặc laptop không bị che khuất.
                </p>
              </div>

              {/* Note 3: VRAM */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                <div className="font-bold text-slate-100 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  3. Quản lý Bộ nhớ VRAM & RAM
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Tránh rò rỉ bộ nhớ (Memory Fragmentation):
                  <br />
                  - Máy có GPU dưới 6GB VRAM: dùng <b>Kokoro Vietnamese</b> thay VieNeu.
                  <br />
                  - Đóng các ứng dụng đồ họa nặng khác (game, Premiere, Photoshop) trước khi bắt đầu phiên chạy qua đêm.
                </p>
              </div>

              {/* Note 4: Checkpointing */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                <div className="font-bold text-slate-100 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-purple-400" />
                  4. Chế độ Bỏ qua Lỗi (Crash Resilience)
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Nếu một tệp sách trong hàng đợi bị lỗi định dạng hoặc hỏng font chữ:
                  <br />
                  - Chế độ <b>"Skip on Error"</b> sẽ ghi nhận lỗi và tự động chuyển sang cuốn tiếp theo mà không làm dừng toàn bộ hàng đợi cả đêm của bạn.
                </p>
              </div>
            </div>

            {/* CLI Command for Overnight Terminal execution */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="font-bold text-slate-200 block">
                Lệnh Chạy CLI Qua Đêm Độc Lập (Không Cần Bật Trình Duyệt):
              </span>
              <pre className="p-3 rounded-lg bg-black text-emerald-400 font-mono text-[11px] overflow-x-auto">
{`# Đặt toàn bộ file ebook vào thư mục ./ebooks_queue/
# Chạy nền qua đêm (xem README_CLI.md để biết đầy đủ):
node scripts/audiobook.js --all

# Hoặc xuất MP3 cho nhẹ hơn:
node scripts/audiobook.js --all --format mp3`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
