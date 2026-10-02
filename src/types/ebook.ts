export type EbookFormat = 'epub' | 'mobi' | 'azw3' | 'pdf' | 'txt' | 'docx' | 'md' | 'fb2';

export interface EbookMetadata {
  title: string;
  author: string;
  language: string;
  format: EbookFormat;
  fileName: string;
  fileSizeBytes: number;
  totalWords: number;
  totalSentences: number;
  estimatedDurationMinutes: number;
  coverUrl?: string;
  description?: string;
}

export interface ParagraphRange {
  /** Inclusive sentence index where this paragraph starts. */
  start: number;
  /** Exclusive sentence index where this paragraph ends. */
  end: number;
}

export interface EbookChapter {
  id: string;
  index: number;
  title: string;
  content: string; // raw plain text
  paragraphs: string[];
  sentences: string[];
  /**
   * Exact paragraph -> sentence index ranges, produced by the parser.
   * ponytail: never re-derive this in the UI by substring matching; repeated
   * sentences and sentences shorter than the prefix length make that ambiguous.
   */
  paragraphRanges: ParagraphRange[];
  wordCount: number;
  estimatedDurationSeconds: number;
}

export interface ParsedEbook {
  metadata: EbookMetadata;
  chapters: EbookChapter[];
}

export type TTSEngineType = 'vieneu' | 'kokoro' | 'mms' | 'qwen3' | 'native';

export type HardwareAccelerationType = 'cpu' | 'nvidia_gpu' | 'auto';

export interface AudiobookVoice {
  id: string;
  name: string;
  engine: TTSEngineType;
  engineLabel: string;
  lang: string;
  languageLabel: string;
  gender: 'female' | 'male' | 'neutral';
  accent?: string;
  styleDescription: string;
  tag: string;
  isNeural: boolean;
  sampleAudio?: string;
  nativeVoiceName?: string;
  hardwareTarget?: 'CPU' | 'NVIDIA CUDA' | 'CPU / GPU';
  sampleText?: string;
}

export type LoopMode = 'none' | 'chapter' | 'book';

export type ReaderTheme = 'dark' | 'light' | 'gray' | 'sepia' | 'obsidian' | 'paper';

export type ReaderFont = 'literata' | 'merriweather' | 'lora' | 'roboto-slab' | 'inter' | 'mono';
