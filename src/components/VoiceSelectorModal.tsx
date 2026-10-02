import React, { useState, useEffect } from 'react';
import { AudiobookVoice, TTSEngineType } from '../types/ebook';
import { DEFAULT_VOICES } from '../data/voices';
import { audioEngine } from '../utils/audioEngine';
import {
  X,
  Volume2,
  Sparkles,
  Check,
  Play,
  Mic,
  Search,
  Globe,
  Cpu,
  Zap,
} from 'lucide-react';

/** Preview lines, one per language, so a model never reads phonemes it cannot say. */
const SAMPLE_BY_LANG: Record<string, string> = {
  'vi-VN': 'Chào bạn, đây là mẫu giọng đọc sách nói trí tuệ nhân tạo từ E2Aubooks.',
  'en-US': 'Welcome to E2Aubooks. High-fidelity audiobook narration powered by local AI.',
  'en-GB': 'Welcome to E2Aubooks. Crisp British narration, generated entirely on your own machine.',
};

interface VoiceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoice: AudiobookVoice;
  onSelectVoice: (voice: AudiobookVoice) => void;
  playbackRate: number;
}

export const VoiceSelectorModal: React.FC<VoiceSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedVoice,
  onSelectVoice,
  playbackRate,
}) => {
  const [voices, setVoices] = useState<AudiobookVoice[]>(DEFAULT_VOICES);
  const [activeEngineTab, setActiveEngineTab] = useState<'all' | TTSEngineType>('all');
  const [activeHardwareTab, setActiveHardwareTab] = useState<'all' | 'cpu' | 'nvidia'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'female' | 'male'>('all');
  const [accentFilter, setAccentFilter] = useState<'all' | 'Bắc' | 'Nam' | 'Trung' | 'en'>('all');
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  // Load system native voices on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const updateSystemVoices = () => {
        const sysVoices = window.speechSynthesis.getVoices();
        if (sysVoices.length > 0) {
          const nativeMapped: AudiobookVoice[] = sysVoices
            .filter(v => v.lang.startsWith('vi') || v.lang.startsWith('en'))
            .slice(0, 10)
            .map((v, idx) => ({
              id: `sys_${v.name.replace(/\s+/g, '_')}_${idx}`,
              name: `${v.name} (${v.lang})`,
              engine: 'native',
              engineLabel: 'Hệ thống Native',
              lang: v.lang,
              languageLabel: v.lang.startsWith('vi') ? 'Tiếng Việt' : 'English',
              gender: /female|woman|girl|hoa|lan|mai|linh|ngoc|zira/i.test(v.name) ? 'female' : 'male',
              styleDescription: 'Giọng đọc tích hợp sẵn trên thiết bị của bạn, phản hồi tức thì.',
              tag: 'Offline Zero-Lag',
              isNeural: false,
              nativeVoiceName: v.name,
              hardwareTarget: 'CPU',
              sampleText: 'Đây là giọng đọc tích hợp sẵn của thiết bị, đọc mượt mà không cần mạng internet.',
            }));

          setVoices([...DEFAULT_VOICES, ...nativeMapped]);
        }
      };

      updateSystemVoices();
      window.speechSynthesis.onvoiceschanged = updateSystemVoices;
    }
  }, []);

  if (!isOpen) return null;

  const filteredVoices = voices.filter(v => {
    if (activeEngineTab !== 'all' && v.engine !== activeEngineTab) return false;
    if (genderFilter !== 'all' && v.gender !== genderFilter) return false;

    // Hardware Filter
    if (activeHardwareTab === 'cpu') {
      if (v.hardwareTarget === 'NVIDIA CUDA') return false;
    } else if (activeHardwareTab === 'nvidia') {
      if (v.hardwareTarget === 'CPU') return false;
    }

    // Accent Filter
    if (accentFilter === 'Bắc' && !v.accent?.includes('Bắc')) return false;
    if (accentFilter === 'Nam' && !v.accent?.includes('Nam')) return false;
    if (accentFilter === 'Trung' && !v.accent?.includes('Trung')) return false;
    if (accentFilter === 'en' && !v.lang.startsWith('en')) return false;

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = v.name.toLowerCase().includes(q);
      const matchStyle = v.styleDescription.toLowerCase().includes(q);
      const matchEngine = v.engineLabel.toLowerCase().includes(q);
      const matchTag = v.tag.toLowerCase().includes(q);
      const matchAccent = v.accent?.toLowerCase().includes(q);
      if (!matchName && !matchStyle && !matchEngine && !matchTag && !matchAccent) return false;
    }
    return true;
  });

  const handlePreviewVoice = (v: AudiobookVoice) => {
    if (previewingVoiceId === v.id) {
      audioEngine.stop();
      setPreviewingVoiceId(null);
      return;
    }

    setPreviewingVoiceId(v.id);
    // Read the sample in the voice's own language: a US model fed Vietnamese
    // phonemes produces noise, not a preview.
    const sampleText = v.sampleText || SAMPLE_BY_LANG[v.lang] || SAMPLE_BY_LANG['vi-VN'];

    audioEngine.speakText({
      text: sampleText,
      voice: v,
      rate: playbackRate,
      pitch: 1.0,
      volume: 1.0,
      onEnd: () => setPreviewingVoiceId(null),
      onError: () => setPreviewingVoiceId(null),
    });
  };

  const handleSelect = (v: AudiobookVoice) => {
    onSelectVoice(v);
    audioEngine.stop();
    setPreviewingVoiceId(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Bộ sưu tập Giọng đọc Sách nói E2Aubooks
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-normal">
                  {voices.length} Giọng AI
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Toàn bộ giọng VieNeu-TTS v3 (Vĩnh, Đoan, Bình, Tuyên, Ly, Ngọc), Kokoro-82M, Meta MMS & Qwen3 — tất cả chạy local
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              audioEngine.stop();
              setPreviewingVoiceId(null);
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/80 space-y-3">
          {/* Search & Hardware Accelerator Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm giọng theo tên (Vĩnh, Đoan, Bella, Adam...), mô hình hoặc cảm xúc..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            {/* Hardware filter */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
              <button
                onClick={() => setActiveHardwareTab('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  activeHardwareTab === 'all'
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mọi phần cứng
              </button>
              <button
                onClick={() => setActiveHardwareTab('nvidia')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  activeHardwareTab === 'nvidia'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Tối ưu cho GPU NVIDIA (CUDA / TensorRT)"
              >
                <Zap className="w-3.5 h-3.5 text-emerald-300" />
                NVIDIA CUDA
              </button>
              <button
                onClick={() => setActiveHardwareTab('cpu')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  activeHardwareTab === 'cpu'
                    ? 'bg-purple-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Tối ưu chạy nhẹ trên CPU"
              >
                <Cpu className="w-3.5 h-3.5 text-purple-300" />
                CPU Multithread
              </button>
            </div>
          </div>

          {/* Model Engine Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {[
              { id: 'all', label: 'Tất cả Models' },
              { id: 'vieneu', label: 'VieNeu-TTS v3 (6 Giọng chính thức)' },
              { id: 'kokoro', label: 'Kokoro-82M (VN & English)' },
              { id: 'mms', label: 'Meta MMS Vietnamese' },
              { id: 'qwen3', label: 'Qwen3 / OmniVoice' },
              { id: 'native', label: 'Hệ thống Native' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveEngineTab(tab.id as any)}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-xl border transition ${
                  activeEngineTab === tab.id
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-medium shadow-sm shadow-emerald-500/10'
                    : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Region / Accent Filter */}
          <div className="flex items-center gap-2 pt-1 text-xs text-slate-400 flex-wrap">
            <span className="font-semibold text-slate-300">Vùng miền:</span>
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'Bắc', label: 'Miền Bắc (Hà Nội)' },
              { id: 'Nam', label: 'Miền Nam (Sài Gòn)' },
              { id: 'Trung', label: 'Miền Trung' },
              { id: 'en', label: 'Tiếng Anh (US/UK)' },
            ].map(acc => (
              <button
                key={acc.id}
                onClick={() => setAccentFilter(acc.id as any)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] transition ${
                  accentFilter === acc.id
                    ? 'bg-slate-800 border-slate-600 text-slate-100 font-medium'
                    : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>

        {/* Voices Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3.5">
          {filteredVoices.map(v => {
            const isSelected = selectedVoice.id === v.id;
            const isPreviewing = previewingVoiceId === v.id;

            let engineBadgeColor = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
            if (v.engine === 'vieneu') engineBadgeColor = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
            if (v.engine === 'kokoro') engineBadgeColor = 'bg-purple-500/15 text-purple-300 border-purple-500/40';
            if (v.engine === 'mms') engineBadgeColor = 'bg-sky-500/15 text-sky-300 border-sky-500/40';
            if (v.engine === 'qwen3') engineBadgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/40';

            return (
              <div
                key={v.id}
                className={`group relative p-4 rounded-2xl border transition-all ${
                  isSelected
                    ? 'bg-emerald-950/25 border-emerald-500/70 shadow-lg shadow-emerald-950/40'
                    : 'bg-slate-950/50 border-slate-800/90 hover:border-slate-700 hover:bg-slate-950/80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-bold text-sm text-slate-100 truncate">
                        {v.name}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${engineBadgeColor}`}>
                        {v.engineLabel}
                      </span>
                      {v.accent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {v.accent}
                        </span>
                      )}
                      {v.hardwareTarget && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                            v.hardwareTarget === 'NVIDIA CUDA'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                              : 'bg-purple-950 text-purple-400 border border-purple-800/60'
                          }`}
                        >
                          {v.hardwareTarget}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-2">
                      {v.styleDescription}
                    </p>

                    {v.sampleText && (
                      <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800/80 text-[11px] text-slate-300 italic mb-2 line-clamp-2">
                        "{v.sampleText}"
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3 text-slate-500" />
                        {v.languageLabel}
                      </span>
                      <span>•</span>
                      <span className="text-emerald-400 font-medium">
                        {v.tag}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => handlePreviewVoice(v)}
                      title="Nghe thử giọng đọc"
                      className={`p-2.5 rounded-xl border transition ${
                        isPreviewing
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 animate-pulse'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {isPreviewing ? <Volume2 className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleSelect(v)}
                      title="Chọn giọng đọc này"
                      className={`p-2.5 rounded-xl border transition ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-emerald-600 hover:text-white hover:border-emerald-500'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Đang chọn:{' '}
              <strong className="text-slate-100">{selectedVoice.name}</strong> (
              {selectedVoice.engineLabel})
            </span>
          </div>
          <button
            onClick={() => {
              audioEngine.stop();
              setPreviewingVoiceId(null);
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
};
