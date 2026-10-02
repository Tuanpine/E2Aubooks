// Heavy parsers load on demand. sampleBooks imports the text helpers from
// this file, so a static import here would pull pdf.js + jszip (~450 kB) into
// the startup bundle for a feature most sessions never touch.
import type { EbookChapter, EbookFormat, ParsedEbook, EbookMetadata } from '../types/ebook';

// jszip uses `export =` (CommonJS shape), so the dynamic import namespace
// carries the constructor itself rather than a `.default`.
type JSZipCtor = typeof import('jszip');
let jszip: JSZipCtor | null = null;
async function getJsZip() {
  if (!jszip) {
    const mod = await import('jszip');
    jszip = (mod as unknown as { default?: JSZipCtor }).default ?? (mod as unknown as JSZipCtor);
  }
  return jszip;
}

let pdfjs: typeof import('pdfjs-dist') | null = null;
async function getPdfJs() {
  if (!pdfjs) {
    pdfjs = await import('pdfjs-dist');
    if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    }
  }
  return pdfjs;
}

/**
 * Splits text into sentences cleanly, supporting Vietnamese and English punctuation.
 * Protects abbreviations (TP., v.v., PGS.TS., Mr., Dr., etc.) from being broken incorrectly.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text) return [];
  // Normalize whitespace
  let clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 1. Temporary placeholder for protected periods in abbreviations
  const DOT_TOKEN = '___DOT_PROTECT___';
  
  // Protect numbers with decimals (e.g. 3.14, 1.500.000)
  clean = clean.replace(/(\d)\.(\d)/g, `$1${DOT_TOKEN}$2`);

  // Protect common Vietnamese and English abbreviations
  const abbreviations = [
    'v\\.v\\.', 'v\\/v', 'TP\\.', 'Tp\\.', 'PGS\\.', 'GS\\.', 'TS\\.', 'ThS\\.', 'BS\\.', 'Thích\\.',
    'Mr\\.', 'Mrs\\.', 'Ms\\.', 'Dr\\.', 'Prof\\.', 'St\\.', 'No\\.', 'e\\.g\\.', 'i\\.e\\.', 'vs\\.', 'vol\\.', 'approx\\.'
  ];
  const abbrRegex = new RegExp(`\\b(${abbreviations.join('|')})`, 'gi');
  clean = clean.replace(abbrRegex, match => match.replace(/\./g, DOT_TOKEN));

  // 2. Regex to split on sentence boundaries while preserving punctuation
  // Matches . ? ! … followed by space/quote/newline or end of string
  const rawSentences = clean.split(/(?<=[.?!…]["'»”]?)\s+(?=[A-ZÀ-Ỹ0-9"“«\-])/u);
  
  const sentences: string[] = [];
  for (const s of rawSentences) {
    // Restore protected dots
    const restored = s.replace(new RegExp(DOT_TOKEN, 'g'), '.').trim();
    // Drop fragments that carry no speech: a lone punctuation mark, or one or
    // two characters. Fed to the TTS they become seconds of near-silence that
    // play as a stall and land in the exported file as a gap.
    if (restored.length < 3 || !/[\p{L}\p{N}]/u.test(restored)) continue;
    if (restored.length > 0) {
      // If a sentence is unusually long (>350 chars) without punctuation, split by comma or clause
      if (restored.length > 350) {
        const sub = restored.split(/([,;:—–]\s+)/);
        let currentChunk = '';
        for (let i = 0; i < sub.length; i++) {
          currentChunk += sub[i];
          if (currentChunk.length >= 150 || i === sub.length - 1) {
            if (currentChunk.trim()) sentences.push(currentChunk.trim());
            currentChunk = '';
          }
        }
      } else {
        sentences.push(restored);
      }
    }
  }
  return sentences.length > 0 ? sentences : [clean.replace(new RegExp(DOT_TOKEN, 'g'), '.').trim()];
}

/**
 * Splits content into clean paragraphs
 */
export function splitIntoParagraphs(content: string): string[] {
  return content
    .split(/\n{2,}|\n(?=[A-ZÀ-Ỹ\d“"«])/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Builds paragraphs, the flat sentence list, AND the exact paragraph -> sentence
 * index ranges, in a single pass.
 *
 * ponytail: sentences are produced per paragraph so the ranges are exact by
 * construction. The previous UI-side `paragraph.includes(sent.slice(0, 30))`
 * lookup silently mis-mapped repeated sentences and short sentences.
 */
export function buildChapterStructure(content: string): {
  paragraphs: string[];
  sentences: string[];
  paragraphRanges: { start: number; end: number }[];
} {
  const paragraphs = splitIntoParagraphs(content);
  const sentences: string[] = [];
  const paragraphRanges: { start: number; end: number }[] = [];

  for (const para of paragraphs) {
    const start = sentences.length;
    for (const sent of splitIntoSentences(para)) {
      sentences.push(sent);
    }
    paragraphRanges.push({ start, end: sentences.length });
  }

  return { paragraphs, sentences, paragraphRanges };
}

/**
 * Strips HTML tags and decodes common HTML entities
 */
export function cleanHtmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Remove script and style elements
  doc.querySelectorAll('script, style, noscript, svg').forEach(el => el.remove());
  
  // Replace br and paragraph tags with newlines
  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  doc.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li').forEach(el => {
    el.prepend('\n');
    el.append('\n');
  });

  return (doc.body.textContent || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Calculates words and estimated duration
 */
export function calculateStats(text: string) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  // standard reading speed ~ 160 words/min
  const durationSeconds = Math.round((words / 160) * 60);
  return { words, durationSeconds };
}

/**
 * Parse EPUB file (.epub)
 */
export async function parseEpub(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedEbook> {
  const zip = await (await getJsZip()).loadAsync(arrayBuffer);
  
  // 1. Locate container.xml
  const containerXmlFile = zip.file('META-INF/container.xml');
  if (!containerXmlFile) {
    throw new Error('Định dạng EPUB không hợp lệ (thiếu META-INF/container.xml)');
  }
  
  const containerXml = await containerXmlFile.async('text');
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, 'application/xml');
  const rootfilePath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  
  if (!rootfilePath) {
    throw new Error('Không tìm thấy tệp OPF trong EPUB.');
  }

  const opfFile = zip.file(rootfilePath);
  if (!opfFile) {
    throw new Error(`Không tìm thấy tệp kê khai OPF: ${rootfilePath}`);
  }

  const opfDir = rootfilePath.includes('/') ? rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1) : '';
  const opfXml = await opfFile.async('text');
  const opfDoc = parser.parseFromString(opfXml, 'application/xml');

  // Metadata
  const title = opfDoc.querySelector('title, dc\\:title')?.textContent?.trim() || fileName.replace(/\.[^/.]+$/, '');
  const author = opfDoc.querySelector('creator, dc\\:creator')?.textContent?.trim() || 'Tác giả chưa xác định';
  const language = opfDoc.querySelector('language, dc\\:language')?.textContent?.trim() || 'vi';
  const description = opfDoc.querySelector('description, dc\\:description')?.textContent?.trim() || '';

  // Cover image
  let coverUrl: string | undefined;
  try {
    const coverMeta = opfDoc.querySelector('meta[name="cover"]');
    const coverItemId = coverMeta?.getAttribute('content');
    let coverItem = coverItemId ? opfDoc.querySelector(`item[id="${coverItemId}"]`) : null;
    if (!coverItem) {
      coverItem = opfDoc.querySelector('item[properties*="cover-image"], item[media-type^="image/"]');
    }
    if (coverItem) {
      const href = coverItem.getAttribute('href');
      if (href) {
        const coverPath = opfDir + href;
        const coverZipFile = zip.file(coverPath) || zip.file(href);
        if (coverZipFile) {
          // 'nodebuffer' works in both Node and the browser; the browser
          // path wraps it in a Blob + object URL below.
          const coverBytes = await coverZipFile.async('nodebuffer');
          coverUrl = typeof URL !== 'undefined' && URL.createObjectURL
            ? URL.createObjectURL(new Blob([new Uint8Array(coverBytes)]))
            : `data:image/jpeg;base64,${coverBytes.toString('base64')}`;
        }
      }
    }
  } catch (err) {
    console.warn('Could not extract EPUB cover image:', err);
  }

  // Spine and Manifest
  const manifestItems: Record<string, string> = {};
  opfDoc.querySelectorAll('manifest > item').forEach(item => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) {
      manifestItems[id] = href;
    }
  });

  const spineItemRefs = Array.from(opfDoc.querySelectorAll('spine > itemref'))
    .map(ref => ref.getAttribute('idref'))
    .filter(Boolean) as string[];

  const chapters: EbookChapter[] = [];
  let chapterIndex = 1;

  for (const idref of spineItemRefs) {
    const relativeHref = manifestItems[idref];
    if (!relativeHref) continue;

    const fullPath = opfDir ? opfDir + relativeHref : relativeHref;
    const file = zip.file(fullPath) || zip.file(relativeHref) || zip.file(decodeURIComponent(fullPath));
    if (!file) continue;

    const htmlContent = await file.async('text');
    const plainText = cleanHtmlText(htmlContent);

    // Skip empty copyright / dummy pages with fewer than 15 words if there are many chapters
    if (plainText.length < 30) continue;

    // Extract title from HTML
    const htmlDoc = parser.parseFromString(htmlContent, 'text/html');
    let chapterTitle = htmlDoc.querySelector('h1, h2, h3, title')?.textContent?.trim();
    if (!chapterTitle || chapterTitle.length > 80) {
      chapterTitle = `Chương ${chapterIndex}`;
    }

    const { words, durationSeconds } = calculateStats(plainText);
    const fields = buildChapterStructure(plainText);

    if (fields.sentences.length > 0) {
      chapters.push({
        id: `ch_${chapterIndex}`,
        index: chapterIndex,
        title: chapterTitle,
        content: plainText,
        ...fields,
        wordCount: words,
        estimatedDurationSeconds: durationSeconds,
      });
      chapterIndex++;
    }
  }

  // Fallback: If no spine chapters could be read, read any html files found in zip
  if (chapters.length === 0) {
    const htmlFiles = Object.keys(zip.files).filter(f => /\.(x?html|htm)$/i.test(f));
    for (let i = 0; i < htmlFiles.length; i++) {
      const f = zip.files[htmlFiles[i]];
      if (!f || f.dir) continue;
      const text = cleanHtmlText(await f.async('text'));
      if (text.length > 50) {
        const { words, durationSeconds } = calculateStats(text);
        chapters.push({
          id: `ch_${i + 1}`,
          index: i + 1,
          title: `Phần ${i + 1}`,
          content: text,
          ...buildChapterStructure(text),
          wordCount: words,
          estimatedDurationSeconds: durationSeconds,
        });
      }
    }
  }

  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
  const totalSentences = chapters.reduce((sum, ch) => sum + ch.sentences.length, 0);

  const metadata: EbookMetadata = {
    title,
    author,
    language,
    format: 'epub',
    fileName,
    fileSizeBytes: arrayBuffer.byteLength,
    totalWords,
    totalSentences,
    estimatedDurationMinutes: Math.ceil(totalWords / 160),
    coverUrl,
    description,
  };

  return { metadata, chapters };
}

/**
 * PalmDOC LZ77 Decompressor for MOBI/AZW
 */
function decompressPalmDoc(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b === 0) {
      continue;
    } else if (b >= 1 && b <= 8) {
      for (let j = 0; j < b && i < bytes.length; j++) {
        out.push(bytes[i++]);
      }
    } else if (b < 0x80) {
      out.push(b);
    } else if (b >= 0xc0) {
      out.push(32); // space
      out.push(b ^ 0x80);
    } else {
      // 0x80 .. 0xBF: 2-byte distance/length pair
      if (i >= bytes.length) break;
      const b2 = bytes[i++];
      const distance = ((b & 0x07) << 8) | b2;
      const length = ((b >> 3) & 0x0f) + 3;
      for (let j = 0; j < length; j++) {
        const pos = out.length - distance;
        out.push(pos >= 0 ? out[pos] : 32);
      }
    }
  }
  return new Uint8Array(out);
}

/**
 * Parse MOBI / AZW / AZW3 file (.mobi, .azw, .azw3)
 */
export async function parseMobi(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedEbook> {
  const dataView = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // Read PalmDB header
  // Title is at byte 0..31 (32 bytes null terminated)
  let rawTitle = '';
  for (let i = 0; i < 32; i++) {
    const code = bytes[i];
    if (code === 0) break;
    rawTitle += String.fromCharCode(code);
  }

  // Number of records is at offset 76 (2 bytes, big-endian)
  const numRecords = dataView.getUint16(76, false);
  const recordOffsets: number[] = [];
  for (let i = 0; i < numRecords; i++) {
    // Each record entry in PalmDB header is 8 bytes starting at 78
    const offset = dataView.getUint32(78 + i * 8, false);
    recordOffsets.push(offset);
  }

  let textBuffer = '';
  let bookTitle = rawTitle.trim() || fileName.replace(/\.[^/.]+$/, '');
  let author = 'Tác giả sách điện tử';

  if (recordOffsets.length > 0) {
    // Record 0 contains PalmDoc header and MOBI header
    const rec0Offset = recordOffsets[0];
    const compression = dataView.getUint16(rec0Offset, false); // 1 = none, 2 = PalmDOC LZ77
    const numTextRecords = dataView.getUint16(rec0Offset + 8, false);

    // Try to extract MOBI header for real title & author
    try {
      const mobiHeaderOffset = rec0Offset + 16;
      const mobiIdentifier = String.fromCharCode(
        bytes[mobiHeaderOffset],
        bytes[mobiHeaderOffset + 1],
        bytes[mobiHeaderOffset + 2],
        bytes[mobiHeaderOffset + 3]
      );
      if (mobiIdentifier === 'MOBI') {
        const fullTitleOffset = dataView.getUint32(mobiHeaderOffset + 68, false);
        const fullTitleLength = dataView.getUint32(mobiHeaderOffset + 72, false);
        if (fullTitleOffset && fullTitleLength > 0 && rec0Offset + fullTitleOffset + fullTitleLength <= bytes.length) {
          const titleBytes = bytes.slice(rec0Offset + fullTitleOffset, rec0Offset + fullTitleOffset + fullTitleLength);
          bookTitle = new TextDecoder('utf-8').decode(titleBytes).trim() || bookTitle;
        }
      }
    } catch (e) {
      console.warn('MOBI title header read notice:', e);
    }

    // Read and decompress text records (records 1 .. numTextRecords)
    const textPieces: string[] = [];
    const textDecoder = new TextDecoder('utf-8');

    for (let r = 1; r <= numTextRecords && r < recordOffsets.length; r++) {
      const start = recordOffsets[r];
      const end = r + 1 < recordOffsets.length ? recordOffsets[r + 1] : bytes.length;
      if (start >= end) continue;

      const recordSlice = bytes.slice(start, end);
      if (compression === 2) {
        const decompressed = decompressPalmDoc(recordSlice);
        textPieces.push(textDecoder.decode(decompressed));
      } else {
        textPieces.push(textDecoder.decode(recordSlice));
      }
    }
    textBuffer = textPieces.join('');
  }

  // Clean HTML/Palm markup
  const cleanText = cleanHtmlText(textBuffer) || new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/[^\x20-\x7E\xA0-\xFF\u0100-\u1EF9\n\r]/g, ' ');

  // Split into chapters
  const chapterRegex = /(?:\n\s*(?:Chương|CHƯƠNG|Hồi|HỒI|Chapter|CHAPTER|Phần|PHẦN)\s+([0-9IVXLCDMivxlcdm]+|[A-ZÀ-Ỹ\s]{1,40})[:.\-–\s]*[^\n]*\n?)/g;
  const matches = [...cleanText.matchAll(chapterRegex)];

  const chapters: EbookChapter[] = [];

  if (matches.length > 1) {
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const startIndex = match.index!;
      const endIndex = i + 1 < matches.length ? matches[i + 1].index! : cleanText.length;
      const chapterBody = cleanText.slice(startIndex, endIndex).trim();
      const rawTitle = match[0].trim().replace(/\n+/g, ' ');
      const title = rawTitle.length > 60 ? rawTitle.slice(0, 60) + '...' : rawTitle;

      if (chapterBody.length > 40) {
        const { words, durationSeconds } = calculateStats(chapterBody);
        chapters.push({
          id: `ch_${i + 1}`,
          index: i + 1,
          title,
          content: chapterBody,
          ...buildChapterStructure(chapterBody),
          wordCount: words,
          estimatedDurationSeconds: durationSeconds,
        });
      }
    }
  }

  // Fallback if no chapter regex matched: divide into ~1500 word chapters
  if (chapters.length === 0) {
    const allParagraphs = splitIntoParagraphs(cleanText);
    let currentParagraphs: string[] = [];
    let currentWords = 0;
    let chIdx = 1;

    for (const p of allParagraphs) {
      currentParagraphs.push(p);
      currentWords += p.split(/\s+/).length;
      if (currentWords >= 1500) {
        const content = currentParagraphs.join('\n\n');
        const { words, durationSeconds } = calculateStats(content);
        chapters.push({
          id: `ch_${chIdx}`,
          index: chIdx,
          title: `Phần ${chIdx}`,
          content,
          ...buildChapterStructure(content),
          wordCount: words,
          estimatedDurationSeconds: durationSeconds,
        });
        currentParagraphs = [];
        currentWords = 0;
        chIdx++;
      }
    }
    if (currentParagraphs.length > 0) {
      const content = currentParagraphs.join('\n\n');
      const { words, durationSeconds } = calculateStats(content);
      chapters.push({
        id: `ch_${chIdx}`,
        index: chIdx,
        title: `Phần ${chIdx}`,
        content,
        ...buildChapterStructure(content),
        wordCount: words,
        estimatedDurationSeconds: durationSeconds,
      });
    }
  }

  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
  const totalSentences = chapters.reduce((sum, ch) => sum + ch.sentences.length, 0);

  const metadata: EbookMetadata = {
    title: bookTitle,
    author,
    language: 'vi',
    format: fileName.toLowerCase().endsWith('.azw3') ? 'azw3' : 'mobi',
    fileName,
    fileSizeBytes: arrayBuffer.byteLength,
    totalWords,
    totalSentences,
    estimatedDurationMinutes: Math.ceil(totalWords / 160),
    description: `Sách định dạng MOBI gồm ${chapters.length} chương.`,
  };

  return { metadata, chapters };
}

/**
 * Parse PDF file (.pdf)
 */
export async function parsePdf(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedEbook> {
  // pdf.js transfers the buffer to its worker, which detaches the original
  // (byteLength drops to 0). Hand it a copy so fileSizeBytes stays valid.
  const sizeBytes = arrayBuffer.byteLength;
  const loadingTask = (await getPdfJs()).getDocument({
    data: new Uint8Array(arrayBuffer.slice(0)),
  });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  let title = fileName.replace(/\.pdf$/i, '');
  let author = 'Tác giả tài liệu';

  try {
    const meta = await pdfDoc.getMetadata();
    if (meta?.info) {
      const info = meta.info as any;
      if (info.Title && typeof info.Title === 'string' && info.Title.trim()) {
        title = info.Title.trim();
      }
      if (info.Author && typeof info.Author === 'string' && info.Author.trim()) {
        author = info.Author.trim();
      }
    }
  } catch (e) {
    console.warn('PDF metadata retrieval notice:', e);
  }

  // Extract page texts
  const pagesText: { pageNumber: number; text: string }[] = [];
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageStrings = textContent.items
      .map((item: any) => item.str || '')
      .filter((s: string) => s.trim().length > 0);
    
    const pageText = pageStrings.join(' ').replace(/\s{2,}/g, ' ');
    if (pageText.length > 20) {
      pagesText.push({ pageNumber: pageNum, text: pageText });
    }
  }

  // Group pages into chapters (e.g. 5-10 pages per section or detect headers)
  const chapters: EbookChapter[] = [];
  let currentPages: typeof pagesText = [];
  let currentWords = 0;
  let chIndex = 1;

  const flushChapter = () => {
    if (currentPages.length === 0) return;
    const firstPage = currentPages[0].pageNumber;
    const lastPage = currentPages[currentPages.length - 1].pageNumber;
    const content = currentPages.map(p => `[Trang ${p.pageNumber}]\n${p.text}`).join('\n\n');
    const { words, durationSeconds } = calculateStats(content);

    chapters.push({
      id: `ch_${chIndex}`,
      index: chIndex,
      title: firstPage === lastPage ? `Trang ${firstPage}` : `Trang ${firstPage} - ${lastPage}`,
      content,
      ...buildChapterStructure(content),
      wordCount: words,
      estimatedDurationSeconds: durationSeconds,
    });
    chIndex++;
    currentPages = [];
    currentWords = 0;
  };

  for (const page of pagesText) {
    currentPages.push(page);
    currentWords += page.text.split(/\s+/).length;
    // Group roughly 1000 words or every 5 pages
    if (currentWords >= 1200 || currentPages.length >= 6) {
      flushChapter();
    }
  }
  flushChapter();

  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
  const totalSentences = chapters.reduce((sum, ch) => sum + ch.sentences.length, 0);

  const metadata: EbookMetadata = {
    title,
    author,
    language: 'vi',
    format: 'pdf',
    fileName,
    fileSizeBytes: sizeBytes,
    totalWords,
    totalSentences,
    estimatedDurationMinutes: Math.ceil(totalWords / 160),
    description: `Tài liệu PDF gồm ${numPages} trang, ${chapters.length} phần sách nói.`,
  };

  return { metadata, chapters };
}

/**
 * Parse DOCX file (.docx)
 */
export async function parseDocx(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedEbook> {
  const zip = await (await getJsZip()).loadAsync(arrayBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('Định dạng DOCX không hợp lệ (thiếu word/document.xml).');
  }

  const xml = await docFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const pNodes = Array.from(doc.getElementsByTagName('w:p'));
  const fullParagraphs: string[] = [];

  for (const p of pNodes) {
    const tNodes = Array.from(p.getElementsByTagName('w:t'));
    const text = tNodes.map(t => t.textContent || '').join('');
    if (text.trim()) {
      fullParagraphs.push(text.trim());
    }
  }

  const rawText = fullParagraphs.join('\n\n');
  const title = fileName.replace(/\.docx$/i, '');
  const chapters: EbookChapter[] = [];

  // Group into ~1500 words per chapter
  let chIdx = 1;
  let curParas: string[] = [];
  let curWords = 0;

  for (const p of fullParagraphs) {
    curParas.push(p);
    curWords += p.split(/\s+/).length;
    if (curWords >= 1500) {
      const content = curParas.join('\n\n');
      const { words, durationSeconds } = calculateStats(content);
      chapters.push({
        id: `ch_${chIdx}`,
        index: chIdx,
        title: `Chương ${chIdx}`,
        content,
        ...buildChapterStructure(content),
        wordCount: words,
        estimatedDurationSeconds: durationSeconds,
      });
      curParas = [];
      curWords = 0;
      chIdx++;
    }
  }

  if (curParas.length > 0) {
    const content = curParas.join('\n\n');
    const { words, durationSeconds } = calculateStats(content);
    chapters.push({
      id: `ch_${chIdx}`,
      index: chIdx,
      title: `Chương ${chIdx}`,
      content,
      ...buildChapterStructure(content),
      wordCount: words,
      estimatedDurationSeconds: durationSeconds,
    });
  }

  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
  const totalSentences = chapters.reduce((sum, ch) => sum + ch.sentences.length, 0);

  const metadata: EbookMetadata = {
    title,
    author: 'Tác giả tài liệu Word',
    language: 'vi',
    format: 'docx',
    fileName,
    fileSizeBytes: arrayBuffer.byteLength,
    totalWords,
    totalSentences,
    estimatedDurationMinutes: Math.ceil(totalWords / 160),
    description: `Tài liệu Word DOCX gồm ${chapters.length} chương sách nói.`,
  };

  return { metadata, chapters };
}

/**
 * Parse plain text or Markdown (.txt, .md)
 */
export async function parseTxt(text: string, fileName: string, format: 'txt' | 'md' = 'txt'): Promise<ParsedEbook> {
  const title = fileName.replace(/\.(txt|md)$/i, '');
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Check for chapter markers
  const chapterRegex = /(?:\n|^)(?:#+\s*|(?:Chương|CHƯƠNG|Hồi|HỒI|Chapter|CHAPTER|Phần|PHẦN)\s+[0-9IVXLCDMivxlcdm\w\s]+[:.\-–\s]*[^\n]*\n?)/g;
  const matches = [...clean.matchAll(chapterRegex)];

  const chapters: EbookChapter[] = [];

  if (matches.length > 1) {
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const start = match.index!;
      const end = i + 1 < matches.length ? matches[i + 1].index! : clean.length;
      const chapterContent = clean.slice(start, end).trim();
      const rawTitle = match[0].trim().replace(/^#+\s*/, '').replace(/\n+/g, ' ');
      const chTitle = rawTitle.length > 60 ? rawTitle.slice(0, 60) + '...' : rawTitle;

      if (chapterContent.length > 20) {
        const { words, durationSeconds } = calculateStats(chapterContent);
        chapters.push({
          id: `ch_${i + 1}`,
          index: i + 1,
          title: chTitle || `Chương ${i + 1}`,
          content: chapterContent,
          ...buildChapterStructure(chapterContent),
          wordCount: words,
          estimatedDurationSeconds: durationSeconds,
        });
      }
    }
  }

  // Fallback chunking
  if (chapters.length === 0) {
    const paragraphs = splitIntoParagraphs(clean);
    let curParas: string[] = [];
    let curWords = 0;
    let chIdx = 1;

    for (const p of paragraphs) {
      curParas.push(p);
      curWords += p.split(/\s+/).length;
      if (curWords >= 1200) {
        const content = curParas.join('\n\n');
        const { words, durationSeconds } = calculateStats(content);
        chapters.push({
          id: `ch_${chIdx}`,
          index: chIdx,
          title: `Phần ${chIdx}`,
          content,
          ...buildChapterStructure(content),
          wordCount: words,
          estimatedDurationSeconds: durationSeconds,
        });
        curParas = [];
        curWords = 0;
        chIdx++;
      }
    }
    if (curParas.length > 0) {
      const content = curParas.join('\n\n');
      const { words, durationSeconds } = calculateStats(content);
      chapters.push({
        id: `ch_${chIdx}`,
        index: chIdx,
        title: `Phần ${chIdx}`,
        content,
        ...buildChapterStructure(content),
        wordCount: words,
        estimatedDurationSeconds: durationSeconds,
      });
    }
  }

  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
  const totalSentences = chapters.reduce((sum, ch) => sum + ch.sentences.length, 0);

  const metadata: EbookMetadata = {
    title,
    author: 'Tác giả',
    language: 'vi',
    format,
    fileName,
    fileSizeBytes: new TextEncoder().encode(text).byteLength,
    totalWords,
    totalSentences,
    estimatedDurationMinutes: Math.ceil(totalWords / 160),
    description: `Tệp văn bản ${format.toUpperCase()} gồm ${chapters.length} phần sách nói.`,
  };

  return { metadata, chapters };
}

/**
 * Universal Ebook Parser Dispatcher
 */
export async function parseEbookFile(file: File): Promise<ParsedEbook> {
  const parsed = await parseByExtension(file);
  // Every parser can legitimately come back empty -- a scanned PDF has no
  // text layer at all, a TXT can be whitespace. An empty book reaches the
  // reader as chapters[0] === undefined, and the first property access on it
  // blanks the page with no error anywhere. Reject it here, once, so no
  // caller can skip the check.
  if (!parsed.chapters || parsed.chapters.length === 0) {
    throw new Error(
      `${file.name}: không đọc được nội dung (0 chương). ` +
      `PDF scan không có lớp chữ — cần OCR trước, hoặc chuyển sang EPUB/TXT.`
    );
  }
  return parsed;
}

async function parseByExtension(file: File): Promise<ParsedEbook> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const arrayBuffer = await file.arrayBuffer();

  switch (ext) {
    case 'epub':
      return parseEpub(arrayBuffer, file.name);
    case 'mobi':
    case 'azw':
    case 'azw3':
      return parseMobi(arrayBuffer, file.name);
    case 'pdf':
      return parsePdf(arrayBuffer, file.name);
    case 'docx':
      return parseDocx(arrayBuffer, file.name);
    case 'txt': {
      const text = await file.text();
      return parseTxt(text, file.name, 'txt');
    }
    case 'md': {
      const text = await file.text();
      return parseTxt(text, file.name, 'md');
    }
    default:
      // Fallback try reading as text or epub
      try {
        return await parseEpub(arrayBuffer, file.name);
      } catch {
        const text = await file.text();
        return parseTxt(text, file.name, 'txt');
      }
  }
}