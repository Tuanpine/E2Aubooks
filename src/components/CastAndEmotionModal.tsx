import React from 'react';
import { AudiobookVoice } from '../types/ebook';
import { CastSettings } from '../utils/dialogueCaster';
import { SUPPORTED_EMOTIONS } from '../utils/emotionTagger';
import {
  Users,
  Sparkles,
  Smile,
  X,
  Check,
  Volume2,
  Mic,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';

interface CastAndEmotionModalProps {
  isOpen: boolean;
  onClose: () => void;
  castSettings: CastSettings;
  onChangeCastSettings: (settings: CastSettings) => void;
  isEmotionModeEnabled: boolean;
  onToggleEmotionMode: (enabled: boolean) => void;
  availableVoices: AudiobookVoice[];
}

export const CastAndEmotionModal: React.FC<CastAndEmotionModalProps> = ({
  isOpen,
  onClose,
  castSettings,
  onChangeCastSettings,
  isEmotionModeEnabled,
  onToggleEmotionMode,
  availableVoices,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Diễn đọc Đa vai & Biểu cảm Cảm xúc
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                  VieNeu-TTS v3 Feature
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Phân vai thoại tự động (Cast Reading) và gắn thẻ cảm xúc nội tuyến (Emotion Cues)
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
        <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* SECTION 1: Emotion Acting Mode */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <Smile className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-200">
                    Gắn thẻ cảm xúc tự động (Emotion Acting Mode)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Tự động nhận diện ngữ cảnh và chèn các thẻ cảm xúc của VieNeu-TTS v3
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEmotionModeEnabled}
                  onChange={e => onToggleEmotionMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Emotion Cues List */}
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[11px] font-semibold text-slate-400 block mb-2">
                Các thẻ biểu cảm được hỗ trợ trong mô hình VieNeu-TTS v3:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SUPPORTED_EMOTIONS.map(e => (
                  <div
                    key={e.id}
                    className={`p-2 rounded-lg border text-xs flex items-center gap-1.5 ${e.color}`}
                  >
                    <span>{e.emoji}</span>
                    <span className="font-mono text-[11px] font-bold">{e.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SECTION 2: Multi-Speaker Cast Reading */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-200">
                    Phân vai đọc truyện tự động (Multi-Speaker Cast)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Tách lời dẫn truyện và hội thoại nhân vật để phát âm bằng các giọng khác nhau
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={castSettings.isEnabled}
                  onChange={e =>
                    onChangeCastSettings({ ...castSettings, isEnabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
              </label>
            </div>

            {/* Voice Selectors per Role */}
            <div className={`space-y-3 pt-2 ${!castSettings.isEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
              {/* Role 1: Narrator */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    1. Người dẫn truyện (Narrator):
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Đoạn miêu tả, dẫn dắt</span>
                </div>
                <select
                  value={castSettings.narratorVoiceId}
                  onChange={e =>
                    onChangeCastSettings({ ...castSettings, narratorVoiceId: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  {availableVoices.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.engineLabel})
                    </option>
                  ))}
                </select>
              </div>

              {/* Role 2: Male Lead */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-cyan-400" />
                    2. Lời thoại Nhân vật Nam (Male Character):
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Lời nói trong ngoặc kép / gạch đầu dòng</span>
                </div>
                <select
                  value={castSettings.maleVoiceId}
                  onChange={e =>
                    onChangeCastSettings({ ...castSettings, maleVoiceId: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  {availableVoices
                    .filter(v => v.gender === 'male' || v.gender === 'neutral')
                    .map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.engineLabel})
                      </option>
                    ))}
                </select>
              </div>

              {/* Role 3: Female Lead */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-pink-400" />
                    3. Lời thoại Nhân vật Nữ (Female Character):
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Lời nói của nhân vật nữ</span>
                </div>
                <select
                  value={castSettings.femaleVoiceId}
                  onChange={e =>
                    onChangeCastSettings({ ...castSettings, femaleVoiceId: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-pink-500"
                >
                  {availableVoices
                    .filter(v => v.gender === 'female' || v.gender === 'neutral')
                    .map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.engineLabel})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Tự động phối âm mượt mà theo từng câu</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition"
          >
            Lưu cài đặt
          </button>
        </div>
      </div>
    </div>
  );
};
