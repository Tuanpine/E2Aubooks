import React, { useState } from 'react';
import {
  ReplacementRule,
  normalizePronunciation,
} from '../utils/pronunciationLexicon';
import {
  Languages,
  Plus,
  Trash2,
  X,
  RotateCcw,
  Check,
  Search,
  Sparkles,
  Info,
  HelpCircle,
} from 'lucide-react';

interface PronunciationLexiconModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: ReplacementRule[];
  onUpdateRules: (newRules: ReplacementRule[]) => void;
  onResetDefaults: () => void;
}

export const PronunciationLexiconModal: React.FC<PronunciationLexiconModalProps> = ({
  isOpen,
  onClose,
  rules,
  onUpdateRules,
  onResetDefaults,
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newPattern, setNewPattern] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
  const [newCategory, setNewCategory] = useState<ReplacementRule['category']>('custom');
  const [testInput, setTestInput] = useState('Bác sĩ John Watson và Sherlock Holmes đã đi 120km/h về TP.HCM vào thế kỷ XXI.');

  if (!isOpen) return null;

  const handleToggleRule = (id: string) => {
    const updated = rules.map(r => (r.id === id ? { ...r, isEnabled: !r.isEnabled } : r));
    onUpdateRules(updated);
  };

  const handleDeleteRule = (id: string) => {
    const updated = rules.filter(r => r.id !== id);
    onUpdateRules(updated);
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPattern.trim() || !newReplacement.trim()) return;

    const newRule: ReplacementRule = {
      id: `custom_${Date.now()}`,
      pattern: newPattern.trim(),
      replacement: newReplacement.trim(),
      isRegex: false,
      category: newCategory,
      isEnabled: true,
      description: 'Quy tắc tùy chỉnh của người dùng',
    };

    onUpdateRules([newRule, ...rules]);
    setNewPattern('');
    setNewReplacement('');
  };

  const filteredRules = rules.filter(r => {
    const matchCat = filterCategory === 'all' || r.category === filterCategory;
    const matchSearch =
      r.pattern.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.replacement.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchSearch;
  });

  const liveNormalizedPreview = normalizePronunciation(testInput, rules);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">
                  Từ Điển Phát Âm & Chuẩn Hóa Văn Bản (Pronunciation Lexicon)
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono">
                  Text Normalizer
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tự động sửa lỗi phát âm từ viết tắt (TP.HCM, km/h), số La Mã, và tên riêng tiếng nước ngoài
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

        {/* Live Test Box */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Xem Trước Phiên Âm Thời Gian Thực (Live Preview):
            </span>
            <span className="text-[11px] text-slate-500">Gõ câu bên dưới để thử nghiệm quy tắc</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Văn bản gốc:</label>
              <textarea
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                rows={2}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 resize-none font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-amber-400 block mb-1">Âm thanh AI sẽ đọc thành:</label>
              <div className="w-full h-[62px] bg-slate-950 border border-amber-500/40 rounded-lg p-2 text-xs text-amber-300 overflow-y-auto font-mono">
                {liveNormalizedPreview}
              </div>
            </div>
          </div>
        </div>

        {/* Add New Rule Form */}
        <form onSubmit={handleAddRule} className="p-4 bg-slate-950/30 border-b border-slate-800 flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex-1 min-w-[140px]">
            <input
              type="text"
              placeholder="Từ gốc (vd: Harry Potter, CEO...)"
              value={newPattern}
              onChange={e => setNewPattern(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <input
              type="text"
              placeholder="Đọc thành (vd: Ha-ri Pót-tơ, C-E-O...)"
              value={newReplacement}
              onChange={e => setNewReplacement(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>
          <select
            value={newCategory}
            onChange={e => setNewCategory(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="custom">Tự định nghĩa</option>
            <option value="foreign_name">Tên nước ngoài</option>
            <option value="abbreviation">Từ viết tắt</option>
            <option value="unit">Đơn vị đo / Ký hiệu</option>
          </select>
          <button
            type="submit"
            disabled={!newPattern.trim() || !newReplacement.trim()}
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-medium flex items-center gap-1 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Thêm quy tắc
          </button>
        </form>

        {/* Filters and Search Bar */}
        <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            {['all', 'foreign_name', 'abbreviation', 'unit', 'custom'].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded-md transition ${
                  filterCategory === cat
                    ? 'bg-amber-500/20 text-amber-300 font-medium border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat === 'all' && `Tất cả (${rules.length})`}
                {cat === 'foreign_name' && 'Tên nước ngoài'}
                {cat === 'abbreviation' && 'Từ viết tắt'}
                {cat === 'unit' && 'Đơn vị đo'}
                {cat === 'custom' && 'Tùy chỉnh'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm quy tắc..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg pl-7 pr-3 py-1 text-slate-300 text-xs focus:outline-none focus:border-amber-500 w-36 sm:w-44"
              />
            </div>
            <button
              onClick={onResetDefaults}
              className="p-1.5 text-slate-400 hover:text-amber-400 rounded transition"
              title="Khôi phục quy tắc chuẩn mặc định"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Rules Table */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredRules.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Không tìm thấy quy tắc phát âm nào phù hợp.
            </div>
          ) : (
            filteredRules.map(rule => (
              <div
                key={rule.id}
                className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-3 text-xs ${
                  rule.isEnabled
                    ? 'bg-slate-950/40 border-slate-800'
                    : 'bg-slate-950/20 border-slate-900 opacity-50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={rule.isEnabled}
                    onChange={() => handleToggleRule(rule.id)}
                    className="accent-amber-500 w-4 h-4 rounded cursor-pointer shrink-0"
                  />
                  <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-slate-200 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {rule.pattern}
                    </span>
                    <span className="text-slate-500">➔</span>
                    <span className="font-mono text-amber-300 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-500/30">
                      {rule.replacement}
                    </span>
                    {rule.description && (
                      <span className="text-[11px] text-slate-500 truncate max-w-xs">
                        ({rule.description})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 font-mono text-slate-400">
                    {rule.category}
                  </span>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1 text-slate-600 hover:text-red-400 rounded transition"
                    title="Xóa quy tắc này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Tự động lưu và áp dụng cho toàn bộ các chương sách nói</span>
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
