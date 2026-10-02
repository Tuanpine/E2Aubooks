import { AudiobookVoice } from '../types/ebook';

export type SpeakerRole = 'narrator' | 'male_lead' | 'female_lead';

export interface CastSettings {
  isEnabled: boolean;
  narratorVoiceId: string;
  maleVoiceId: string;
  femaleVoiceId: string;
}

export interface SentenceAnalysis {
  isDialogue: boolean;
  role: SpeakerRole;
  speakerName?: string;
  cleanText: string;
}

const FEMALE_INDICATORS = [
  'cô', 'nàng', 'bà', 'chị', 'mẹ', 'em gái', 'tiểu thư', 'công chúa', 'bác gái', 'chị cốc', 'bà lão',
  'she', 'her', 'lady', 'woman', 'mother', 'girl', 'princess', 'queen'
];

const MALE_INDICATORS = [
  'chàng', 'ông', 'anh', 'chú', 'bố', 'cha', 'cậu', 'dế mèn', 'dế choắt', 'thầy', 'ông lão',
  'he', 'him', 'sir', 'man', 'father', 'boy', 'prince', 'king'
];

/**
 * Analyzes whether a sentence is dialogue or narrative, and identifies speaker gender
 */
export function analyzeSentenceDialogue(sentence: string, surroundingParagraph = ''): SentenceAnalysis {
  const trimmed = sentence.trim();
  const lowerPara = surroundingParagraph.toLowerCase();
  const lowerSent = trimmed.toLowerCase();

  // Dialogue markers: quotes, dashes, guillemets
  const isQuoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('“') && trimmed.endsWith('”')) ||
    (trimmed.startsWith('«') && trimmed.endsWith('»')) ||
    trimmed.startsWith('- ') ||
    trimmed.startsWith('— ') ||
    trimmed.startsWith('– ');

  if (!isQuoted) {
    return {
      isDialogue: false,
      role: 'narrator',
      cleanText: trimmed,
    };
  }

  // It is dialogue. Now detect gender:
  let detectedRole: SpeakerRole = 'male_lead'; // Default character voice

  // Check paragraph context for speaker markers
  const femaleScore = FEMALE_INDICATORS.reduce(
    (acc, kw) => (lowerPara.includes(kw) ? acc + 1 : acc),
    0
  );
  const maleScore = MALE_INDICATORS.reduce(
    (acc, kw) => (lowerPara.includes(kw) ? acc + 1 : acc),
    0
  );

  if (femaleScore > maleScore) {
    detectedRole = 'female_lead';
  } else if (maleScore > 0) {
    detectedRole = 'male_lead';
  } else {
    // If ambiguous, use alternating pitch/male lead
    detectedRole = 'male_lead';
  }

  return {
    isDialogue: true,
    role: detectedRole,
    cleanText: trimmed.replace(/^["“«—–-]\s*|["”»]\s*$/g, ''),
  };
}

/**
 * Resolves the actual voice to use based on Cast Settings
 */
export function resolveSpeakerVoice(
  role: SpeakerRole,
  settings: CastSettings,
  availableVoices: AudiobookVoice[],
  fallbackVoice: AudiobookVoice
): AudiobookVoice {
  if (!settings.isEnabled) return fallbackVoice;

  let targetId = settings.narratorVoiceId;
  if (role === 'male_lead') targetId = settings.maleVoiceId;
  if (role === 'female_lead') targetId = settings.femaleVoiceId;

  const found = availableVoices.find(v => v.id === targetId);
  return found || fallbackVoice;
}
