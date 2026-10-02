import React, { useState, useEffect } from 'react';
import { DownloadableTTSModel } from '../types/models';
import { VERIFIED_TTS_MODELS } from '../data/modelCatalog';
import {
  Download,
  CheckCircle2,
  Terminal,
  AlertCircle,
  HardDrive,
  Cpu,
  RefreshCw,
  Trash2,
  ExternalLink,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Loader2,
} from 'lucide-react';

interface ModelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ModelManagerModal: React.FC<ModelManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [models, setModels] = useState<DownloadableTTSModel[]>(VERIFIED_TTS_MODELS);
  const [activeTab, setActiveTab] = useState<'catalog' | 'guide'>('catalog');
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [verifyingModelId, setVerifyingModelId] = useState<string | null>(null);
  const [verificationReport, setVerificationReport] = useState<any>(null);

  // Fetch real model status from server
  const fetchModelsStatus = async () => {
    try {
      const res = await fetch('/api/models');
      if (res.ok) {
        const data = await res.json();
        if (data.models) {
          setModels(data.models);
        }
      }
    } catch (err) {
      console.warn('Could not fetch models status from server:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchModelsStatus();
      // Poll progress every 1.5 seconds if any model is downloading
      const interval = setInterval(() => {
        fetchModelsStatus();
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartDownload = async (modelId: string) => {
    try {
      const res = await fetch('/api/models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      if (res.ok) {
        fetchModelsStatus();
      }
    } catch (err) {
      console.error('Failed to trigger download:', err);
    }
  };

  const handleCancelDownload = async (modelId: string) => {
    try {
      await fetch(`/api/models/cancel/${modelId}`, { method: 'POST' });
      fetchModelsStatus();
    } catch (err) {
      console.error('Failed to cancel download:', err);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (window.confirm('Bạn có chắc muốn xóa tệp mô hình này khỏi ổ đĩa cục bộ?')) {
      try {
        await fetch(`/api/models/${modelId}`, { method: 'DELETE' });
        fetchModelsStatus();
      } catch (err) {
        console.error('Failed to delete model:', err);
      }
    }
  };

  const handleVerifyUrls = async (modelId: string) => {
    setVerifyingModelId(modelId);
    setVerificationReport(null);
    try {
      const res = await fetch(`/api/models/verify/${modelId}`, { method: 'POST' });
      const data = await res.json();
      setVerificationReport(data);
    } catch (err) {
      console.error('Failed to verify remote model files:', err);
    } finally {
      setVerifyingModelId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">
                  Quản lý Tải Mô hình TTS E2Aubooks (Hugging Face)
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                  Verified Real URLs
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tải trọng số VieNeu-TTS v3, Kokoro-82M, Meta MMS về thư mục <code className="text-purple-300 font-mono">./models</code> hỗ trợ CPU & GPU NVIDIA
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

        {/* Tab Selector */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-slate-800/80 bg-slate-900/60 text-xs">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2 font-medium rounded-xl border transition ${
              activeTab === 'catalog'
                ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20'
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Danh mục Mô hình AI TTS ({models.length})
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-4 py-2 font-medium rounded-xl border transition flex items-center gap-1.5 ${
              activeTab === 'guide'
                ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20'
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Hướng dẫn chạy Terminal / CLI Local
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'catalog' ? (
            <div className="space-y-4">
              {models.map((model) => {
                const isExpanded = expandedModelId === model.id;
                const isVerifying = verifyingModelId === model.id;
                const isDownloading = model.status === 'downloading';
                const isInstalled = model.isInstalled;

                return (
                  <div
                    key={model.id}
                    className={`rounded-2xl border transition-all ${
                      isInstalled
                        ? 'bg-slate-950/60 border-emerald-500/40 shadow-lg shadow-emerald-950/20'
                        : isDownloading
                        ? 'bg-purple-950/20 border-purple-500/60 shadow-lg shadow-purple-950/30'
                        : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Model Summary Bar */}
                    <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                          <h3 className="font-bold text-base text-slate-100">{model.name}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-purple-500/10 border border-purple-500/30 text-purple-300">
                            {model.license}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                              model.hardwareType === 'NVIDIA CUDA'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/60'
                                : 'bg-purple-950 text-purple-300 border border-purple-700/60'
                            }`}
                          >
                            {model.hardwareType}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            ~{(model.totalSizeBytes / (1024 * 1024)).toFixed(1)} MB
                          </span>

                          {/* Status Pill */}
                          {isInstalled ? (
                            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Đã có sẵn trên máy
                            </span>
                          ) : isDownloading ? (
                            <span className="flex items-center gap-1 text-[11px] font-medium text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded-full animate-pulse">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Đang tải: {model.downloadProgress}%
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full">
                              Chưa tải về
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                          {model.description}
                        </p>

                        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1 text-slate-400">
                            <Cpu className="w-3.5 h-3.5 text-slate-500" />
                            {model.recommendedHardware}
                          </span>
                          <span>•</span>
                          <a
                            href={model.repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {model.author}
                          </a>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                        <button
                          onClick={() => handleVerifyUrls(model.id)}
                          disabled={isVerifying}
                          title="Kiểm tra tính hợp lệ và kết nối tới Hugging Face"
                          className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-xs font-medium text-slate-300 transition flex items-center gap-1.5"
                        >
                          {isVerifying ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                          )}
                          <span className="hidden md:inline">Test Link</span>
                        </button>

                        {isInstalled ? (
                          <button
                            onClick={() => handleDeleteModel(model.id)}
                            title="Xóa tệp mô hình để giải phóng dung lượng"
                            className="p-2 rounded-xl border border-red-900/40 bg-red-950/20 hover:bg-red-950/40 text-red-400 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : isDownloading ? (
                          <button
                            onClick={() => handleCancelDownload(model.id)}
                            className="px-3.5 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold transition"
                          >
                            Hủy tải
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStartDownload(model.id)}
                            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-900/30 transition"
                          >
                            <Download className="w-4 h-4" />
                            Tải về máy
                          </button>
                        )}

                        <button
                          onClick={() => setExpandedModelId(isExpanded ? null : model.id)}
                          className="p-2 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800/80 transition"
                          title="Xem danh sách tệp thành phần"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Live Progress Bar when downloading */}
                    {isDownloading && (
                      <div className="px-5 pb-4 space-y-1.5">
                        <div className="flex justify-between text-xs text-slate-300">
                          <span>
                            Đang tải:{' '}
                            <strong className="text-purple-300 font-mono">
                              {((model.downloadedBytes || 0) / (1024 * 1024)).toFixed(1)} MB
                            </strong>{' '}
                            / {(model.totalSizeBytes / (1024 * 1024)).toFixed(1)} MB
                          </span>
                          <span className="font-mono text-purple-400 font-bold">
                            {model.downloadProgress || 0}% ({model.downloadSpeedMBs || 0} MB/s)
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all duration-300"
                            style={{ width: `${model.downloadProgress || 0}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Verification Report Accordion */}
                    {verificationReport && verificationReport.modelId === model.id && (
                      <div className="mx-5 mb-4 p-3.5 rounded-xl bg-slate-900/90 border border-cyan-500/40 text-xs space-y-2 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-cyan-400" />
                            Kết quả xác thực Hugging Face Direct URLs:
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                              verificationReport.allAccessible
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-red-500/20 text-red-300 border border-red-500/30'
                            }`}
                          >
                            {verificationReport.allAccessible
                              ? '100% LINK HỢP LỆ (HTTP 200)'
                              : 'CÓ TỆP LỖI LINK'}
                          </span>
                        </div>
                        <div className="space-y-1 pt-1 font-mono text-[11px]">
                          {verificationReport.files.map((f: any, i: number) => (
                            <div
                              key={i}
                              className="flex items-center justify-between p-1.5 rounded bg-slate-950/60 border border-slate-800"
                            >
                              <span className="text-slate-300 truncate max-w-[260px]">
                                {f.fileName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">
                                  {(f.expectedBytes / (1024 * 1024)).toFixed(2)} MB
                                </span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    f.isAccessible
                                      ? 'text-emerald-400 bg-emerald-950/60'
                                      : 'text-red-400 bg-red-950/60'
                                  }`}
                                >
                                  HTTP {f.statusCode} {f.isAccessible ? 'OK' : 'FAIL'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Files Detail Drawer */}
                    {isExpanded && (
                      <div className="px-5 pb-5 pt-1 border-t border-slate-800/80 bg-slate-950/50 space-y-2 text-xs">
                        <div className="font-semibold text-slate-300 py-1 flex items-center justify-between">
                          <span>Các tệp tải về từ Hugging Face ({model.files.length} tệp):</span>
                          <span className="font-mono text-[11px] text-slate-500">
                            Thư mục đích: ./models/{model.id}/
                          </span>
                        </div>
                        <div className="space-y-1.5 font-mono text-[11px]">
                          {model.files.map((file, fIdx) => (
                            <div
                              key={fIdx}
                              className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="text-slate-200 font-medium truncate">
                                  {file.fileName}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate max-w-md">
                                  {file.description}
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                <span className="text-slate-400">
                                  {(file.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                                </span>
                                <a
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Mở link tải gốc Hugging Face"
                                  className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Guide Tab for Local Developers */
            <div className="space-y-6 text-xs text-slate-300 leading-relaxed">
              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 text-purple-200">
                <h4 className="font-bold text-sm text-purple-300 mb-1 flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Hướng dẫn triển khai TTS Model trên máy tính Local
                </h4>
                <p className="text-xs text-purple-300/80">
                  Tất cả các mô hình được thiết kế để lưu trữ trong thư mục{' '}
                  <code className="bg-purple-950 px-1 py-0.5 rounded font-mono">./models/</code>.
                  Mọi URL tải về đều đã được kiểm tra trực tiếp qua API Hugging Face với cơ chế tự động chuyển hướng CDN.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="font-semibold text-slate-200">Cách tải mô hình</div>
                <p className="text-slate-400">
                  Dùng tab <b className="text-slate-200">Danh sách mô hình</b> phía trên: bấm
                  nút tải trên từng thẻ. Danh sách và dung lượng tải về đều lấy từ
                  <code className="bg-slate-900 px-1 py-0.5 rounded font-mono text-[10px]">src/data/modelCatalog.ts</code>,
                  nên không có danh sách thứ hai ở đâu khác để lệch với UI.
                </p>
                <p className="text-slate-500">
                  Ngoài ra có thể tải thủ công từ link gốc Hugging Face trên mỗi thẻ.
                  Thư mục đích là <code className="bg-slate-900 px-1 py-0.5 rounded font-mono text-[10px]">./models/&lt;model-id&gt;/</code>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Thư mục lưu trữ cục bộ: <strong className="text-slate-200">./models</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};