import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ParsedEbook,
  AudiobookVoice,
  EbookChapter,
  LoopMode,
} from './types/ebook';
import { DEFAULT_VOICES } from './data/voices';
import { SAMPLE_BOOKS } from './data/sampleBooks';
import { audioEngine, resolveLocalVoice } from './utils/audioEngine';
import { AudioVisualizer } from './components/AudioVisualizer';
import { VoiceSelectorModal } from './components/VoiceSelectorModal';
import { EbookUploaderModal } from './components/EbookUploaderModal';
import { LibraryModal } from './components/LibraryModal';
import { ChapterDrawer } from './components/ChapterDrawer';
import { ExportModal } from './components/ExportModal';
import { ModelManagerModal } from './components/ModelManagerModal';
import { CastAndEmotionModal } from './components/CastAndEmotionModal';
import { BatchConvertModal } from './components/BatchConvertModal';
import { PronunciationLexiconModal } from './components/PronunciationLexiconModal';
import {
  ReplacementRule,
  loadPronunciationRules,
  savePronunciationRules,
  normalizePronunciation,
  DEFAULT_PRONUNCIATION_RULES,
} from './utils/pronunciationLexicon';
import { detectSystemHardware, HardwareProfile } from './utils/hardwareDetector';
import { ambientEngine, AmbientSoundType, AMBIENT_TRACKS } from './utils/ambientSoundscapes';
import { detectSentenceEmotion, stripEmotionTags } from './utils/emotionTagger';
import { analyzeSentenceDialogue, resolveSpeakerVoice, CastSettings } from './utils/dialogueCaster';
import { ReaderTheme, ReaderFont } from './types/ebook';

import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Volume1,
  UploadCloud,
  Library,
  List,
  Mic,
  Download,
  HardDrive,
  Zap,
  Cpu,
  Users,
  Smile,
  Music2,
  Sliders,
  Settings2,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Clock,
  Sparkles,
  Type,
  Sun,
  Moon,
  Layers,
  Repeat,
  Repeat1,
  Bookmark,
  Share2,
  Languages,
} from 'lucide-react';

export default function App() {
  // Books & Navigation State
  const [currentBook, setCurrentBook] = useState<ParsedEbook>(SAMPLE_BOOKS[0]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);

  // Playback & TTS State
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<AudiobookVoice>(DEFAULT_VOICES[0]);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [pitch, setPitch] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [loopMode, setLoopMode] = useState<LoopMode>('none');
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepSecondsLeft, setSleepSecondsLeft] = useState<number | null>(null);

  // Reader Customization State
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('dark');
  const [fontSize, setFontSize] = useState<number>(18);
  const [fontFamily, setFontFamily] = useState<ReaderFont>('literata');

  // Modals State
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isUploaderModalOpen, setIsUploaderModalOpen] = useState(false);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [isChapterDrawerOpen, setIsChapterDrawerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isCastModalOpen, setIsCastModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isLexiconModalOpen, setIsLexiconModalOpen] = useState(false);
  const [pronunciationRules, setPronunciationRules] = useState<ReplacementRule[]>(() =>
    loadPronunciationRules()
  );

  const handleUpdatePronunciationRules = (newRules: ReplacementRule[]) => {
    setPronunciationRules(newRules);
    savePronunciationRules(newRules);
  };

  const handleResetPronunciationRules = () => {
    setPronunciationRules(DEFAULT_PRONUNCIATION_RULES);
    savePronunciationRules(DEFAULT_PRONUNCIATION_RULES);
  };

  // Hardware State
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile | null>(null);

  // Auto-save Reading Progress in LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        'e2aubooks_reading_progress',
        JSON.stringify({
          bookTitle: currentBook.metadata.title,
          chapterIndex: currentChapterIndex,
          sentenceIndex: currentSentenceIndex,
          timestamp: Date.now(),
        })
      );
    } catch {}
  }, [currentBook.metadata.title, currentChapterIndex, currentSentenceIndex]);

  // Ambient BGM State
  const [activeAmbientTrack, setActiveAmbientTrack] = useState<AmbientSoundType>('none');
  const [ambientVolume, setAmbientVolume] = useState<number>(0.25);

  // Cast & Emotion Mode State
  // Display-only. Enabling this must never reach the TTS input, or the model
  // reads "[cười]" aloud and each sentence sounds like a different narrator.
  const [isEmotionModeEnabled, setIsEmotionModeEnabled] = useState<boolean>(false);
  const [castSettings, setCastSettings] = useState<CastSettings>({
    isEnabled: false,
    narratorVoiceId: 'vieneu_vinh',
    maleVoiceId: 'vieneu_binh',
    femaleVoiceId: 'vieneu_doan',
  });

  useEffect(() => {
    detectSystemHardware().then(setHardwareProfile);
  }, []);

  const handleSelectAmbient = (track: AmbientSoundType) => {
    setActiveAmbientTrack(track);
    ambientEngine.playTrack(track);
  };

  const handleAmbientVolumeChange = (vol: number) => {
    setAmbientVolume(vol);
    ambientEngine.setVolume(vol);
  };

  // Refs
  const readerScrollRef = useRef<HTMLDivElement | null>(null);
  const activeSentenceRef = useRef<HTMLSpanElement | null>(null);
  const isPlayingRef = useRef(isPlaying);
  // Consecutive playback failures; reset on every successful start.
  const errorStreakRef = useRef(0);
  isPlayingRef.current = isPlaying;

  // An index can point past the end after loading a shorter book, so clamp
  // rather than fall back to chapters[0] -- which is undefined for an empty
  // book, and every .sentences read below would then throw.
  const currentChapter: EbookChapter =
    currentBook.chapters[Math.min(currentChapterIndex, currentBook.chapters.length - 1)];

  // Auto-scroll active sentence into view
  useEffect(() => {
    if (activeSentenceRef.current) {
      activeSentenceRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentSentenceIndex, currentChapterIndex]);

  // Sleep Timer Countdown
  useEffect(() => {
    if (!sleepTimerMinutes || !isPlaying) return;

    if (sleepSecondsLeft === null) {
      setSleepSecondsLeft(sleepTimerMinutes * 60);
    }

    const timer = setInterval(() => {
      setSleepSecondsLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          handleStop();
          setSleepTimerMinutes(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sleepTimerMinutes, isPlaying, sleepSecondsLeft]);

  // Play next sentence handler
  const playSentence = useCallback(
    (chapterIdx: number, sentenceIdx: number) => {
      const chapter = currentBook.chapters[chapterIdx];
      if (!chapter) return;

      const sentence = chapter.sentences[sentenceIdx];
      if (!sentence) {
        // End of chapter
        if (loopMode === 'chapter') {
          setCurrentSentenceIndex(0);
          playSentence(chapterIdx, 0);
          return;
        }

        if (chapterIdx + 1 < currentBook.chapters.length) {
          // Go to next chapter
          setCurrentChapterIndex(chapterIdx + 1);
          setCurrentSentenceIndex(0);
          playSentence(chapterIdx + 1, 0);
          return;
        }

        if (loopMode === 'book') {
          setCurrentChapterIndex(0);
          setCurrentSentenceIndex(0);
          playSentence(0, 0);
          return;
        }

        // Reached end of book
        setIsPlaying(false);
        return;
      }

      // 1. Normalize pronunciation & acronyms with custom lexicon
      const normalizedSentence = normalizePronunciation(sentence, pronunciationRules);

      // 2. Analyze dialogue for Cast Reading
      const dialogueInfo = analyzeSentenceDialogue(normalizedSentence);
      const voiceToUse = castSettings.isEnabled
        ? resolveSpeakerVoice(dialogueInfo.role, castSettings, DEFAULT_VOICES, selectedVoice)
        : selectedVoice;

      // 3. Emotion cues are display-only. Sending "[cười]" etc. to the model
      //    makes it read the tag aloud with a different delivery, which sounds
      //    like a different narrator on every sentence. Strip them before TTS.
      const textToSpeak = stripEmotionTags(normalizedSentence);

      // Synthesize the next sentence while this one is still playing, so the
      // gap between sentences drops from ~0.5s to a cache hit.
      const nextText = chapter.sentences[sentenceIdx + 1];
      if (nextText && voiceToUse.engine !== 'native') {
        const nextVoice = castSettings.isEnabled
          ? resolveSpeakerVoice(
              analyzeSentenceDialogue(nextText).role,
              castSettings, DEFAULT_VOICES, voiceToUse)
          : voiceToUse;
        const resolved = resolveLocalVoice(nextVoice);
        if (resolved) {
          audioEngine.prefetch(
            stripEmotionTags(normalizePronunciation(nextText, pronunciationRules)),
            resolved.engine,
            resolved.name,
            playbackRate
          );
        }
      }

      audioEngine.speakText({
        text: textToSpeak,
        voice: voiceToUse,
        rate: playbackRate,
        pitch: pitch,
        volume: isMuted ? 0 : volume,
        onStart: () => {
          setIsPlaying(true);
          errorStreakRef.current = 0;
        },
        onEnd: () => {
          if (isPlayingRef.current) {
            setCurrentSentenceIndex(sentenceIdx + 1);
            playSentence(chapterIdx, sentenceIdx + 1);
          }
        },
        onError: (err) => {
          console.warn('Speech playback issue:', err);
          // Skipping to the next sentence on error is right for a one-off
          // glitch, but a blocked play() (autoplay policy) fails every
          // sentence, which would spin through the whole book. Give up after
          // a few in a row.
          errorStreakRef.current = (errorStreakRef.current || 0) + 1;
          if (errorStreakRef.current > 3) {
            console.error('Too many consecutive playback errors — stopping.');
            errorStreakRef.current = 0;
            setIsPlaying(false);
            audioEngine.stop();
            return;
          }
          if (isPlayingRef.current) {
            setTimeout(() => {
              setCurrentSentenceIndex(sentenceIdx + 1);
              playSentence(chapterIdx, sentenceIdx + 1);
            }, 300);
          }
        },
      });
    },
    [currentBook, selectedVoice, playbackRate, pitch, volume, isMuted, loopMode, pronunciationRules, isEmotionModeEnabled, castSettings]
  );

  const handlePlayToggle = () => {
    if (isPlaying) {
      audioEngine.stop();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      playSentence(currentChapterIndex, currentSentenceIndex);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    setIsPlaying(false);
  };

  const handleSentenceClick = (idx: number) => {
    setCurrentSentenceIndex(idx);
    audioEngine.stop();
    setIsPlaying(true);
    playSentence(currentChapterIndex, idx);
  };

  const handlePrevSentence = () => {
    const nextIdx = Math.max(0, currentSentenceIndex - 1);
    setCurrentSentenceIndex(nextIdx);
    if (isPlaying) {
      playSentence(currentChapterIndex, nextIdx);
    }
  };

  const handleNextSentence = () => {
    const nextIdx = Math.min(currentChapter.sentences.length - 1, currentSentenceIndex + 1);
    setCurrentSentenceIndex(nextIdx);
    if (isPlaying) {
      playSentence(currentChapterIndex, nextIdx);
    }
  };

  const handlePrevChapter = () => {
    if (currentChapterIndex > 0) {
      const newCh = currentChapterIndex - 1;
      setCurrentChapterIndex(newCh);
      setCurrentSentenceIndex(0);
      if (isPlaying) {
        playSentence(newCh, 0);
      }
    }
  };

  const handleNextChapter = () => {
    if (currentChapterIndex + 1 < currentBook.chapters.length) {
      const newCh = currentChapterIndex + 1;
      setCurrentChapterIndex(newCh);
      setCurrentSentenceIndex(0);
      if (isPlaying) {
        playSentence(newCh, 0);
      }
    }
  };

  const handleSeekSentence = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newIdx = parseInt(e.target.value, 10);
    setCurrentSentenceIndex(newIdx);
    if (isPlaying) {
      playSentence(currentChapterIndex, newIdx);
    }
  };

  const handleBookLoaded = (book: ParsedEbook) => {
    // Guard here too, not just in the parser: a book can arrive from the
    // server library, saved before this check existed, and an empty chapter
    // list makes currentChapter undefined, which blanks the page on the next
    // property read with nothing in the console.
    if (!book?.chapters?.length) {
      alert(`"${book?.metadata?.title || 'Sách'}" không có nội dung để đọc (0 chương). PDF scan cần OCR trước.`);
      return;
    }
    handleStop();
    setCurrentBook(book);
    setCurrentChapterIndex(0);
    setCurrentSentenceIndex(0);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is in an input field
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayToggle();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) handlePrevChapter();
        else handlePrevSentence();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) handleNextChapter();
        else handleNextSentence();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentChapterIndex, currentSentenceIndex, playSentence]);

  // Audio duration formatter
  const formatAudioDuration = (seconds: number, rate: number = 1.0) => {
    const adjustedSecs = Math.max(1, Math.round(seconds / rate));
    const hours = Math.floor(adjustedSecs / 3600);
    const mins = Math.floor((adjustedSecs % 3600) / 60);
    const secs = adjustedSecs % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs > 0 ? `${secs}s` : ''}`;
  };

  // Font family styles for Reader View
  const getFontFamilyStyle = () => {
    switch (fontFamily) {
      case 'literata':
        return "'Literata', Georgia, serif";
      case 'merriweather':
        return "'Merriweather', Georgia, serif";
      case 'lora':
        return "'Lora', Georgia, serif";
      case 'roboto-slab':
        return "'Roboto Slab', Georgia, serif";
      case 'inter':
        return "'Inter', system-ui, -apple-system, sans-serif";
      case 'mono':
        return "'Fira Code', ui-monospace, SFMono-Regular, monospace";
      default:
        return "'Literata', Georgia, serif";
    }
  };

  // Theme styles for Reader View (Light, Gray, Dark, Sepia, Paper, Obsidian)
  const getThemeClasses = () => {
    switch (readerTheme) {
      case 'light':
        return 'bg-[#ffffff] text-[#1e293b] border-slate-200 shadow-sm';
      case 'gray':
        return 'bg-[#22272e] text-[#adbac7] border-[#373e47]';
      case 'sepia':
        return 'bg-[#fbf0d9] text-[#3d2c1d] border-[#e9dcbe]';
      case 'paper':
        return 'bg-[#faf8f5] text-[#2c3038] border-[#e8e4dc]';
      case 'obsidian':
        return 'bg-[#090a0f] text-[#d4d4d8] border-[#18181b]';
      case 'dark':
      default:
        return 'bg-slate-900/90 text-slate-200 border-slate-800';
    }
  };

  const getSentenceHighlightClasses = () => {
    switch (readerTheme) {
      case 'light':
        return 'bg-amber-100 text-amber-950 font-bold rounded px-1.5 py-0.5 border-b-2 border-amber-500 shadow-sm';
      case 'gray':
        return 'bg-cyan-500/25 text-cyan-200 font-semibold rounded px-1.5 py-0.5 border-b-2 border-cyan-400';
      case 'sepia':
        return 'bg-amber-300/40 text-amber-950 font-bold rounded px-1.5 py-0.5 border-b-2 border-amber-600 shadow-sm';
      case 'paper':
        return 'bg-emerald-100 text-emerald-950 font-bold rounded px-1.5 py-0.5 border-b-2 border-emerald-600 shadow-sm';
      case 'obsidian':
        return 'bg-purple-950/80 text-purple-200 font-semibold rounded px-1.5 py-0.5 border-b-2 border-purple-400';
      case 'dark':
      default:
        return 'bg-emerald-500/20 text-emerald-300 font-semibold rounded px-1.5 py-0.5 border-b-2 border-emerald-400';
    }
  };

  // Speed Presets
  const speedPresets = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 p-0.5 shadow-lg shadow-emerald-500/10">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base sm:text-lg tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                E2Aubooks
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono hidden sm:inline-block">
                AI Audiobook Studio
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Chuyển đổi Ebook thành Sách nói đa định dạng (EPUB, MOBI, PDF, DOCX)
            </p>
          </div>
        </div>

        {/* Action Controls in Header */}
        <div className="flex items-center gap-2">
          {/* Chapter drawer button */}
          <button
            onClick={() => setIsChapterDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-xs font-medium text-slate-300 transition"
          >
            <List className="w-4 h-4 text-emerald-400" />
            <span className="hidden md:inline">Mục lục</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
              {currentChapterIndex + 1}/{currentBook.chapters.length}
            </span>
          </button>

          {/* Voice selector button */}
          <button
            onClick={() => setIsVoiceModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-950/40 text-xs font-medium text-emerald-300 transition group"
          >
            <Mic className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition" />
            <span className="truncate max-w-[120px] sm:max-w-[160px] font-semibold">
              {selectedVoice.name}
            </span>
          </button>

          {/* Hardware status — read-only. The daemon picks its own device from
              TTS_DEVICE / nvidia-smi, so there is nothing here to configure. */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium ${
              hardwareProfile?.isNvidiaGpu
                ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
                : 'border-purple-500/40 bg-purple-950/20 text-purple-300'
            }`}
            title={hardwareProfile?.hardwareSummary || 'Đang dò phần cứng...'}
          >
            {hardwareProfile?.isNvidiaGpu ? (
              <>
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden xl:inline">NVIDIA CUDA</span>
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden xl:inline">CPU Mode</span>
              </>
            )}
          </div>

          {/* Upload Ebook button */}
          <button
            onClick={() => setIsUploaderModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition"
          >
            <UploadCloud className="w-4 h-4" />
            <span className="hidden sm:inline">Thêm Ebook</span>
          </button>

          {/* Library button — books and audio stored on the server */}
          <button
            onClick={() => setIsLibraryModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-300 text-xs font-semibold shadow-sm transition"
            title="Thư viện trên máy chủ"
          >
            <Library className="w-4 h-4" />
            <span className="hidden sm:inline">Thư viện</span>
          </button>

          {/* Batch Convert (Qua đêm) button */}
          <button
            onClick={() => setIsBatchModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-300 text-xs font-semibold shadow-sm transition"
            title="Chuyển đổi hàng loạt nhiều tệp Ebook thành Sách nói qua đêm"
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="hidden xl:inline">Batch Convert (Qua đêm)</span>
          </button>

          {/* Local TTS Models Download button */}
          <button
            onClick={() => setIsModelModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-500/40 bg-purple-950/20 hover:bg-purple-950/40 hover:border-purple-500 text-xs font-medium text-purple-300 transition"
            title="Quản lý và tải mô hình TTS Local (VieNeu v3, Kokoro, Meta MMS)"
          >
            <HardDrive className="w-4 h-4 text-purple-400" />
            <span className="hidden sm:inline">Tải Model Local</span>
          </button>

          {/* Export button */}
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-purple-950/30 hover:border-purple-500/50 hover:text-purple-300 text-xs font-medium text-slate-300 transition"
          >
            <Download className="w-4 h-4 text-purple-400" />
            <span className="hidden lg:inline">Xuất Audio</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout (2 columns: Studio Controller & Ebook Reader) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT PANEL: E2Aubooks Audio Controls Rack */}
        <aside className="w-full lg:w-96 border-b lg:border-b-0 lg:border-r border-slate-800/90 bg-slate-950/60 p-4 sm:p-5 flex flex-col gap-5 overflow-y-auto shrink-0">
          {/* Quick Local Model & Hardware Card */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setIsModelModalOpen(true)}
              className="p-3 rounded-2xl border border-purple-500/30 bg-purple-950/20 hover:bg-purple-950/40 hover:border-purple-500/50 transition flex items-center gap-2.5 text-left group"
            >
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 shrink-0">
                <HardDrive className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-200 group-hover:text-purple-300 transition">
                  Mô hình TTS
                </div>
                <div className="text-[10px] text-slate-400 truncate">Hugging Face</div>
              </div>
            </button>

            <div
              className={`p-3 rounded-2xl border flex items-center gap-2.5 text-left group ${
                hardwareProfile?.isNvidiaGpu
                  ? 'border-emerald-500/30 bg-emerald-950/20'
                  : 'border-purple-500/30 bg-purple-950/20'
              }`}
            >
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  hardwareProfile?.isNvidiaGpu
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-purple-500/20 text-purple-400'
                }`}
              >
                {hardwareProfile?.isNvidiaGpu ? <Zap className="w-4 h-4" /> : <Cpu className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300 transition">
                  {hardwareProfile?.isNvidiaGpu ? 'NVIDIA GPU' : 'CPU Mode'}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {hardwareProfile?.isNvidiaGpu ? 'CUDA / TensorRT' : 'ONNX / Q4'}
                </div>
              </div>
            </div>
          </div>

          {/* Ebook Meta Card */}
          <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-xl flex gap-3.5 items-start">
            {currentBook.metadata.coverUrl ? (
              <img
                src={currentBook.metadata.coverUrl}
                alt={currentBook.metadata.title}
                className="w-16 h-22 object-cover rounded-xl shadow-md shrink-0 border border-slate-700/60"
              />
            ) : (
              <div className="w-16 h-22 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-500 shrink-0">
                <BookOpen className="w-7 h-7 text-emerald-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  {currentBook.metadata.format}
                </span>
                <span className="text-[11px] text-slate-400 truncate">
                  {currentBook.metadata.totalWords.toLocaleString()} từ
                </span>
              </div>
              <h2 className="text-sm font-bold text-slate-100 truncate" title={currentBook.metadata.title}>
                {currentBook.metadata.title}
              </h2>
              <p className="text-xs text-slate-400 truncate mt-0.5">{currentBook.metadata.author}</p>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>~{currentBook.metadata.estimatedDurationMinutes} phút sách nói</span>
              </div>
            </div>
          </div>

          {/* Real-time Waveform Visualizer & Engine Tag */}
          <div className="p-3.5 rounded-2xl border border-slate-800/80 bg-slate-900/40 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
                {isPlaying ? 'Đang đọc theo nhịp văn' : 'Đang tạm dừng'}
              </span>
              <span className="text-[11px] font-mono text-cyan-400 font-medium">
                {selectedVoice.engineLabel}
              </span>
            </div>
            <AudioVisualizer isPlaying={isPlaying} barColor="#10b981" />
          </div>

          {/* Master Transport Playback Controls */}
          <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/50 flex flex-col gap-4">
            {/* Progress Scrubber Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">
                  Câu: <strong className="text-slate-200">{currentSentenceIndex + 1}</strong> / {currentChapter.sentences.length}
                </span>
                <span className="text-[11px] font-mono text-emerald-400">
                  {Math.round(((currentSentenceIndex + 1) / Math.max(1, currentChapter.sentences.length)) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, currentChapter.sentences.length - 1)}
                value={currentSentenceIndex}
                onChange={handleSeekSentence}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Main Buttons */}
            <div className="flex items-center justify-center gap-3">
              {/* Prev Chapter */}
              <button
                onClick={handlePrevChapter}
                disabled={currentChapterIndex === 0}
                title="Chương trước"
                className="p-2.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* Prev Sentence */}
              <button
                onClick={handlePrevSentence}
                disabled={currentSentenceIndex === 0}
                title="Câu trước"
                className="p-2.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Big Play / Pause */}
              <button
                onClick={handlePlayToggle}
                className={`p-4 rounded-2xl shadow-xl transition-all active:scale-95 ${
                  isPlaying
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30'
                }`}
              >
                {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-0.5" />}
              </button>

              {/* Next Sentence */}
              <button
                onClick={handleNextSentence}
                disabled={currentSentenceIndex >= currentChapter.sentences.length - 1}
                title="Câu tiếp theo"
                className="p-2.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 transition"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Next Chapter */}
              <button
                onClick={handleNextChapter}
                disabled={currentChapterIndex >= currentBook.chapters.length - 1}
                title="Chương sau"
                className="p-2.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 transition"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Speed & Pitch Controls (Giao diện điều khiển tốc độ đọc & âm sắc) */}
          <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/50 space-y-4">
            {/* Speed control header */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  Tốc độ đọc (Speed)
                </span>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  {playbackRate.toFixed(2)}x
                </span>
              </div>

              {/* Preset buttons */}
              <div className="grid grid-cols-6 gap-1 mb-2.5">
                {speedPresets.map(preset => (
                  <button
                    key={preset}
                    onClick={() => {
                      setPlaybackRate(preset);
                      if (isPlaying) {
                        audioEngine.stop();
                        playSentence(currentChapterIndex, currentSentenceIndex);
                      }
                    }}
                    className={`py-1 text-[11px] font-mono font-medium rounded-lg border transition ${
                      Math.abs(playbackRate - preset) < 0.01
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset}x
                  </button>
                ))}
              </div>

              {/* Fine Speed Slider */}
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.05"
                value={playbackRate}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setPlaybackRate(val);
                }}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>0.5x (Chậm)</span>
                <span>1.0x (Chuẩn)</span>
                <span>2.0x (Nhanh)</span>
                <span>3.0x (Tối đa)</span>
              </div>
            </div>

            {/* Pitch & Tone Slider */}
            <div className="pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold text-slate-300">Âm điệu / Cao độ (Pitch)</span>
                <span className="font-mono text-xs text-slate-400">{pitch.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="1.4"
                step="0.05"
                value={pitch}
                onChange={e => setPitch(parseFloat(e.target.value))}
                className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>Trầm ấm</span>
                <span>Tự nhiên</span>
                <span>Thanh trong</span>
              </div>
            </div>

            {/* Volume Slider */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-3">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={e => {
                  setVolume(parseFloat(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                className="flex-1 accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="text-[11px] font-mono text-slate-400 w-8 text-right">
                {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
              </span>
            </div>
          </div>

          {/* Audiobook Preferences (Loop, Sleep Timer) */}
          <div className="p-3.5 rounded-2xl border border-slate-800/80 bg-slate-900/40 grid grid-cols-2 gap-2 text-xs">
            {/* Loop Mode */}
            <button
              onClick={() => {
                if (loopMode === 'none') setLoopMode('chapter');
                else if (loopMode === 'chapter') setLoopMode('book');
                else setLoopMode('none');
              }}
              className="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-800/60 flex items-center justify-between text-slate-300 transition"
            >
              <span className="flex items-center gap-1.5">
                {loopMode === 'chapter' ? (
                  <Repeat1 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Repeat className="w-4 h-4 text-slate-400" />
                )}
                Lặp:
              </span>
              <span className="font-semibold text-emerald-400">
                {loopMode === 'none' ? 'Tắt' : loopMode === 'chapter' ? 'Chương' : 'Cả cuốn'}
              </span>
            </button>

            {/* Sleep Timer */}
            <button
              onClick={() => {
                if (!sleepTimerMinutes) setSleepTimerMinutes(15);
                else if (sleepTimerMinutes === 15) setSleepTimerMinutes(30);
                else if (sleepTimerMinutes === 30) setSleepTimerMinutes(60);
                else {
                  setSleepTimerMinutes(null);
                  setSleepSecondsLeft(null);
                }
              }}
              className="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-800/60 flex items-center justify-between text-slate-300 transition"
            >
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-cyan-400" />
                Hẹn giờ:
              </span>
              <span className="font-semibold text-cyan-400">
                {sleepTimerMinutes ? `${sleepTimerMinutes}m` : 'Tắt'}
              </span>
            </button>
          </div>

          {/* Ambient BGM Soundscape Rack (Ý 3) */}
          <div className="p-3.5 rounded-2xl border border-slate-800/80 bg-slate-900/40 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Music2 className="w-3.5 h-3.5 text-cyan-400" />
                Nhạc nền & Không gian (BGM)
              </span>
              <span className="text-[10px] font-mono text-cyan-400">
                {activeAmbientTrack === 'none' ? 'Đang tắt' : `${Math.round(ambientVolume * 100)}%`}
              </span>
            </div>

            {/* Soundscape Pills */}
            <div className="grid grid-cols-3 gap-1.5">
              {AMBIENT_TRACKS.map(track => (
                <button
                  key={track.id}
                  onClick={() => handleSelectAmbient(track.id)}
                  title={track.description}
                  className={`py-1.5 px-2 rounded-xl border text-[11px] font-medium flex items-center justify-center gap-1 transition ${
                    activeAmbientTrack === track.id
                      ? 'bg-cyan-950/60 border-cyan-500/70 text-cyan-200 font-bold shadow-sm'
                      : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{track.emoji}</span>
                  <span className="truncate">{track.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>

            {activeAmbientTrack !== 'none' && (
              <div className="pt-1 flex items-center gap-2">
                <Sliders className="w-3 h-3 text-slate-500" />
                <input
                  type="range"
                  min="0.05"
                  max="0.6"
                  step="0.05"
                  value={ambientVolume}
                  onChange={e => handleAmbientVolumeChange(parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Quick Cast & Emotion Control (Ý 1 & 2) */}
          <button
            onClick={() => setIsCastModalOpen(true)}
            className="p-3 rounded-2xl border border-purple-500/30 bg-purple-950/20 hover:bg-purple-950/40 hover:border-purple-500/50 transition flex items-center justify-between text-left group"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-200 group-hover:text-purple-300 transition flex items-center gap-1.5">
                  Phân vai & Cảm xúc
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">
                    {castSettings.isEnabled ? 'Đa vai BẬT' : 'Đơn vai'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {isEmotionModeEnabled ? 'Thẻ cảm xúc VieNeu: Bật' : 'Thẻ cảm xúc: Tắt'}
                </div>
              </div>
            </div>
            <Settings2 className="w-4 h-4 text-purple-400" />
          </button>
        </aside>

        {/* RIGHT PANEL: Ebook Reader & Synchronized Teleprompter */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-950/40">
          {/* Reader Sub-Toolbar */}
          <div className="h-12 border-b border-slate-800/80 px-4 sm:px-6 flex items-center justify-between gap-3 text-xs bg-slate-950/70">
            {/* Chapter title & index */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2 py-0.5 rounded bg-slate-800 font-mono text-[11px] text-slate-300 shrink-0">
                Chương {currentChapter.index}
              </span>
              <h3 className="font-medium text-slate-200 truncate">
                {currentChapter.title}
              </h3>
            </div>

            {/* Customization controls: Cast, Font Size & Theme */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Cast & Emotion button */}
              <button
                onClick={() => setIsCastModalOpen(true)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition ${
                  castSettings.isEnabled
                    ? 'border-cyan-500/50 bg-cyan-950/30 text-cyan-300'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:text-white'
                }`}
                title="Cài đặt phân vai đọc thoại & Gắn thẻ cảm xúc VieNeu"
              >
                <Users className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden md:inline">Phân vai & Cảm xúc</span>
              </button>

              {/* Pronunciation Lexicon button */}
              <button
                onClick={() => setIsLexiconModalOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-500/40 bg-amber-950/20 hover:bg-amber-950/40 text-amber-300 transition text-xs font-medium"
                title="Từ điển phát âm & Chuẩn hóa từ viết tắt, tên nước ngoài"
              >
                <Languages className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">Từ điển phát âm</span>
              </button>

              {/* Font Size */}
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setFontSize(Math.max(14, fontSize - 2))}
                  className="px-2 py-1 text-slate-400 hover:text-slate-200 text-xs"
                  title="Giảm cỡ chữ"
                >
                  A-
                </button>
                <span className="text-[11px] px-1 text-slate-300 font-mono">{fontSize}</span>
                <button
                  onClick={() => setFontSize(Math.min(28, fontSize + 2))}
                  className="px-2 py-1 text-slate-400 hover:text-slate-200 text-xs"
                  title="Tăng cỡ chữ"
                >
                  A+
                </button>
              </div>

              {/* Font Family Selector */}
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-0.5">
                <Type className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={fontFamily}
                  onChange={e => setFontFamily(e.target.value as ReaderFont)}
                  className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer py-1 font-sans"
                  title="Phông chữ sách điện tử"
                >
                  <option value="literata" className="bg-slate-900 text-slate-200">Literata (Kindle Serif)</option>
                  <option value="merriweather" className="bg-slate-900 text-slate-200">Merriweather (Văn học)</option>
                  <option value="lora" className="bg-slate-900 text-slate-200">Lora (Tao nhã)</option>
                  <option value="roboto-slab" className="bg-slate-900 text-slate-200">Roboto Slab (Hiện đại)</option>
                  <option value="inter" className="bg-slate-900 text-slate-200">Inter (Sans-serif)</option>
                  <option value="mono" className="bg-slate-900 text-slate-200">Fira Code (Monospace)</option>
                </select>
              </div>

              {/* Reader Theme Selector (Light, Gray, Dark, Sepia, Paper, Obsidian) */}
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-0.5">
                {readerTheme === 'light' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : readerTheme === 'gray' ? (
                  <Sliders className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                ) : readerTheme === 'sepia' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                ) : readerTheme === 'paper' ? (
                  <Bookmark className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : readerTheme === 'obsidian' ? (
                  <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <select
                  value={readerTheme}
                  onChange={e => setReaderTheme(e.target.value as ReaderTheme)}
                  className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer py-1 font-sans"
                  title="Chế độ màu nền & Độ tương phản"
                >
                  <option value="dark" className="bg-slate-900 text-slate-200">🌙 Dark (Mặc định)</option>
                  <option value="light" className="bg-slate-900 text-slate-200">☀️ Light (Sáng tinh khôi)</option>
                  <option value="gray" className="bg-slate-900 text-slate-200">🔘 Gray (Xám dịu mắt)</option>
                  <option value="sepia" className="bg-slate-900 text-slate-200">📜 Sepia (Trang giấy cổ)</option>
                  <option value="paper" className="bg-slate-900 text-slate-200">📄 Paper (Giấy ngà)</option>
                  <option value="obsidian" className="bg-slate-900 text-slate-200">⬛ Obsidian (OLED)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Reader Content Area */}
          <div
            ref={readerScrollRef}
            className={`flex-1 overflow-y-auto p-6 sm:p-10 lg:p-16 transition-colors duration-200 ${getThemeClasses()}`}
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: 1.85,
              fontFamily: getFontFamilyStyle(),
            }}
          >
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Chapter Heading Banner */}
              <div className="pb-6 mb-8 border-b border-current/15 text-center">
                <span className="text-xs uppercase tracking-widest opacity-60 font-mono block mb-2">
                  {currentBook.metadata.title}
                </span>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {currentChapter.title}
                </h1>
                <div className="mt-3 flex items-center justify-center gap-3 text-xs opacity-75 font-mono">
                  <span>{currentChapter.wordCount.toLocaleString()} từ</span>
                  <span>•</span>
                  <span className="font-semibold text-emerald-500">
                    ⏱️ ~{formatAudioDuration(currentChapter.estimatedDurationSeconds, playbackRate)} audio {playbackRate !== 1.0 ? `(ở ${playbackRate}x)` : ''}
                  </span>
                </div>
              </div>

              {/* Paragraphs with interactive sentence highlighting */}
              {currentChapter.paragraphRanges.map((range, pIdx) => {
                const paraSentences = currentChapter.sentences.slice(range.start, range.end);

                if (paraSentences.length === 0) {
                  return (
                    <p key={pIdx} className="leading-relaxed">
                      {currentChapter.paragraphs[pIdx]}
                    </p>
                  );
                }

                return (
                  <p key={pIdx} className="leading-relaxed text-justify">
                    {paraSentences.map((sent, sIdx) => {
                      // exact index from the parser's range, not a substring lookup
                      const sentenceIndex = range.start + sIdx;
                      const isCurrent = sentenceIndex === currentSentenceIndex;
                      const emo = isEmotionModeEnabled ? detectSentenceEmotion(sent) : null;
                      const diag = castSettings.isEnabled
                        ? analyzeSentenceDialogue(sent, currentChapter.paragraphs[pIdx])
                        : null;

                      return (
                        <span
                          key={sentenceIndex}
                          ref={isCurrent ? activeSentenceRef : null}
                          onClick={() => handleSentenceClick(sentenceIndex)}
                          title="Bấm để phát âm thanh từ câu này"
                          className={`cursor-pointer transition-all duration-150 inline ${
                            isCurrent
                              ? getSentenceHighlightClasses()
                              : 'hover:bg-slate-500/10 rounded px-0.5'
                          }`}
                        >
                          {isCurrent && emo && (
                            <span className="inline-block text-[11px] px-1.5 py-0.2 mr-1 rounded bg-amber-500/25 text-amber-300 font-mono font-normal">
                              {emo.emoji} {emo.tag}
                            </span>
                          )}
                          {isCurrent && diag?.isDialogue && (
                            <span className="inline-block text-[10px] px-1.5 py-0.2 mr-1 rounded bg-cyan-500/25 text-cyan-300 font-mono font-normal">
                              💬 {diag.role === 'female_lead' ? 'Thoại Nữ' : 'Thoại Nam'}
                            </span>
                          )}
                          {sent}{' '}
                        </span>
                      );
                    })}
                  </p>
                );
              })}

              {/* Bottom chapter navigation footer in reader */}
              <div className="pt-12 mt-12 border-t border-current/15 flex items-center justify-between text-sm">
                <button
                  onClick={handlePrevChapter}
                  disabled={currentChapterIndex === 0}
                  className="flex items-center gap-1.5 opacity-70 hover:opacity-100 disabled:opacity-20 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Chương trước
                </button>
                <span className="text-xs opacity-60 font-mono">
                  {currentChapterIndex + 1} / {currentBook.chapters.length}
                </span>
                <button
                  onClick={handleNextChapter}
                  disabled={currentChapterIndex >= currentBook.chapters.length - 1}
                  className="flex items-center gap-1.5 opacity-70 hover:opacity-100 disabled:opacity-20 transition"
                >
                  Chương sau
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Modals */}
      <VoiceSelectorModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        selectedVoice={selectedVoice}
        onSelectVoice={voice => {
          setSelectedVoice(voice);
          if (isPlaying) {
            audioEngine.stop();
            playSentence(currentChapterIndex, currentSentenceIndex);
          }
        }}
        playbackRate={playbackRate}
      />

      <LibraryModal
        isOpen={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        onBookLoaded={handleBookLoaded}
      />

      <EbookUploaderModal
        isOpen={isUploaderModalOpen}
        onClose={() => setIsUploaderModalOpen(false)}
        onBookLoaded={handleBookLoaded}
      />

      <ChapterDrawer
        isOpen={isChapterDrawerOpen}
        onClose={() => setIsChapterDrawerOpen(false)}
        chapters={currentBook.chapters}
        currentChapterIndex={currentChapterIndex}
        onSelectChapter={idx => {
          handleStop();
          setCurrentChapterIndex(idx);
          setCurrentSentenceIndex(0);
        }}
        bookTitle={currentBook.metadata.title}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        book={currentBook}
        currentChapterIndex={currentChapterIndex}
        voice={selectedVoice}
        playbackRate={playbackRate}
      />

      <ModelManagerModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
      />

      <CastAndEmotionModal
        isOpen={isCastModalOpen}
        onClose={() => setIsCastModalOpen(false)}
        castSettings={castSettings}
        onChangeCastSettings={setCastSettings}
        isEmotionModeEnabled={isEmotionModeEnabled}
        onToggleEmotionMode={setIsEmotionModeEnabled}
        availableVoices={DEFAULT_VOICES}
      />

      <BatchConvertModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        availableVoices={DEFAULT_VOICES}
        defaultVoice={selectedVoice}
      />

      <PronunciationLexiconModal
        isOpen={isLexiconModalOpen}
        onClose={() => setIsLexiconModalOpen(false)}
        rules={pronunciationRules}
        onUpdateRules={handleUpdatePronunciationRules}
        onResetDefaults={handleResetPronunciationRules}
      />
    </div>
  );
}