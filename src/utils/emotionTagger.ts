interface EmotionCue {
  id: string;
  tag: string;
  label: string;
  emoji: string;
  color: string;
  keywords: string[];
}

export const SUPPORTED_EMOTIONS: EmotionCue[] = [
  {
    id: 'cuoi',
    tag: '[cười]',
    label: 'Vui vẻ / Cười',
    emoji: '😄',
    color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    keywords: ['cười', 'hớn hở', 'vui vẻ', 'thích thú', 'phấn khởi', 'ha ha', 'hi hi', 'tươi cười', 'mỉm cười'],
  },
  {
    id: 'tho_dai',
    tag: '[thở dài]',
    label: 'Thở dài / Mệt mỏi',
    emoji: '😮‍💨',
    color: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    keywords: ['thở dài', 'ngao ngán', 'mệt mỏi', 'chán nản', 'não nề', 'bất lực', 'than vãn', 'uể oải'],
  },
  {
    id: 'ngac_nhien',
    tag: '[ngạc nhiên]',
    label: 'Ngạc nhiên / Sửng sốt',
    emoji: '😲',
    color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    keywords: ['ngạc nhiên', 'kinh ngạc', 'sửng sốt', 'bàng hoàng', 'trời ơi', 'sao lại', 'lạ lùng', 'kỳ quặc'],
  },
  {
    id: 'thi_tham',
    tag: '[thì thầm]',
    label: 'Thì thầm / Bí mật',
    emoji: '🤫',
    color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    keywords: ['thì thầm', 'nhỏ giọng', 'khe khẽ', 'bí mật', 'thầm thì', 'nói nhỏ', 'rỉ tai'],
  },
  {
    id: 'tuc_gian',
    tag: '[tức giận]',
    label: 'Tức giận / Cáu gắt',
    emoji: '😠',
    color: 'bg-red-500/20 text-red-300 border-red-500/30',
    keywords: ['tức giận', 'giận dữ', 'gắt gỏng', 'quát', 'hét lên', 'bực bội', 'nghiến răng', 'nổi giận'],
  },
  {
    id: 'buon_ba',
    tag: '[buồn bã]',
    label: 'Buồn bã / U buồn',
    emoji: '😢',
    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    keywords: ['buồn bã', 'u sầu', 'khóc', 'nước mắt', 'rưng rưng', 'đau xót', 'tủi thân', 'thảm thương'],
  },
  {
    id: 'hoi_hop',
    tag: '[hồi hộp]',
    label: 'Hồi hộp / Căng thẳng',
    emoji: '⚡',
    color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    keywords: ['hồi hộp', 'lo sợ', 'run rẩy', 'tim đập', 'bất an', 'kinh hãi', 'nguy hiểm', 'thình thình'],
  },
  {
    id: 'nghen_ngao',
    tag: '[nghẹn ngào]',
    label: 'Nghẹn ngào / Xúc động',
    emoji: '🥺',
    color: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    keywords: ['nghẹn ngào', 'xúc động', 'nghẹn lời', 'rưng rưng', 'bùi ngùi', 'dạt dào'],
  },
];

/**
 * Heuristically detects the most appropriate emotion cue for a sentence
 */
export function detectSentenceEmotion(sentence: string): EmotionCue | null {
  const lower = sentence.toLowerCase();

  for (const emotion of SUPPORTED_EMOTIONS) {
    for (const kw of emotion.keywords) {
      // Use regex word boundary check
      if (lower.includes(kw)) {
        return emotion;
      }
    }
  }

  // Check punctuation cues
  if (sentence.includes('?!') || sentence.includes('!?')) {
    return SUPPORTED_EMOTIONS.find(e => e.id === 'ngac_nhien') || null;
  }
  if (sentence.includes('...') && (lower.includes('ôi') || lower.includes('haizz') || lower.includes('chao ôi'))) {
    return SUPPORTED_EMOTIONS.find(e => e.id === 'tho_dai') || null;
  }
  if (sentence.endsWith('!') && (lower.includes('biến đi') || lower.includes('cút') || lower.includes('dám'))) {
    return SUPPORTED_EMOTIONS.find(e => e.id === 'tuc_gian') || null;
  }

  return null;
}

/**
 * Strips every emotion cue for plain text display and for TTS input.
 * Built from SUPPORTED_EMOTIONS so a new cue cannot be forgotten here.
 */
export function stripEmotionTags(text: string): string {
  const pattern = new RegExp(
    SUPPORTED_EMOTIONS.map(e => e.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'gi'
  );
  return text.replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
}
