/**
 * ===================================================================
 * E2Aubooks - Pronunciation Lexicon & Text Normalizer
 * Bộ Chuẩn Hóa & Từ Điển Phát Âm Chuyên Nghiệp Cho Sách Nói Tiếng Việt
 * ===================================================================
 */

export interface ReplacementRule {
  id: string;
  pattern: string; // Tên gốc hoặc từ viết tắt (vd: "TP.HCM", "Sherlock Holmes")
  replacement: string; // Phiên âm đọc thành (vd: "Thành phố Hồ Chí Minh", "Sơ-lốc Hôm")
  isRegex?: boolean;
  category: 'abbreviation' | 'foreign_name' | 'unit' | 'custom';
  isEnabled: boolean;
  description?: string;
}

// Bộ quy tắc chuẩn hóa tiếng Việt mặc định
export const DEFAULT_PRONUNCIATION_RULES: ReplacementRule[] = [
  // Đơn vị đo lường & Ký hiệu
  {
    id: 'unit_kmh',
    pattern: '\\bkm/h\\b',
    replacement: 'ki-lô-mét trên giờ',
    isRegex: true,
    category: 'unit',
    isEnabled: true,
    description: 'Vận tốc km/h',
  },
  {
    id: 'unit_km',
    pattern: '(\\d+)\\s*km\\b',
    replacement: '$1 ki-lô-mét',
    isRegex: true,
    category: 'unit',
    isEnabled: true,
    description: 'Khoảng cách km',
  },
  {
    id: 'unit_kg',
    pattern: '(\\d+)\\s*kg\\b',
    replacement: '$1 ki-lô-gam',
    isRegex: true,
    category: 'unit',
    isEnabled: true,
    description: 'Khối lượng kg',
  },
  {
    id: 'unit_percent',
    pattern: '(\\d+)%',
    replacement: '$1 phần trăm',
    isRegex: true,
    category: 'unit',
    isEnabled: true,
    description: 'Ký hiệu phần trăm',
  },
  {
    id: 'unit_celsius',
    pattern: '(\\d+)°C',
    replacement: '$1 độ xê',
    isRegex: true,
    category: 'unit',
    isEnabled: true,
    description: 'Nhiệt độ độ C',
  },

  // Tiền tệ
  {
    id: 'curr_vnd',
    pattern: '(\\d+)\\s*(?:VNĐ|VND|đ)\\b',
    replacement: '$1 đồng',
    isRegex: true,
    category: 'unit',
    isEnabled: true,
    description: 'Tiền Việt Nam Đồng',
  },
  {
    id: 'curr_usd',
    pattern: '\\$(\\d+)',
    replacement: '$1 đô la',
    isRegex: true,
    category: 'unit',
    isEnabled: true,
    description: 'Tiền Đô la Mỹ',
  },

  // Địa danh & Từ viết tắt hành chính
  {
    id: 'abbr_tphcm',
    pattern: '\\bTP\\.?\\s*HCM\\b',
    replacement: 'Thành phố Hồ Chí Minh',
    isRegex: true,
    category: 'abbreviation',
    isEnabled: true,
    description: 'Thành phố Hồ Chí Minh',
  },
  {
    id: 'abbr_hn',
    pattern: '\\bTP\\.?\\s*HN\\b',
    replacement: 'Thành phố Hà Nội',
    isRegex: true,
    category: 'abbreviation',
    isEnabled: true,
    description: 'Thành phố Hà Nội',
  },
  {
    id: 'abbr_pgs_ts',
    pattern: '\\bPGS\\.?\\s*TS\\b',
    replacement: 'Phó giáo sư Tiến sĩ',
    isRegex: true,
    category: 'abbreviation',
    isEnabled: true,
    description: 'Chức danh PGS.TS',
  },
  {
    id: 'abbr_gs_ts',
    pattern: '\\bGS\\.?\\s*TS\\b',
    replacement: 'Giáo sư Tiến sĩ',
    isRegex: true,
    category: 'abbreviation',
    isEnabled: true,
    description: 'Chức danh GS.TS',
  },
  {
    id: 'abbr_ths',
    pattern: '\\bThS\\b',
    replacement: 'Thạc sĩ',
    isRegex: true,
    category: 'abbreviation',
    isEnabled: true,
    description: 'Chức danh Thạc sĩ',
  },
  {
    id: 'abbr_ai',
    pattern: '\\bAI\\b',
    replacement: 'trí tuệ nhân tạo',
    isRegex: true,
    category: 'abbreviation',
    isEnabled: false, // Tùy người đọc muốn phát âm là A-I hay Trí tuệ nhân tạo
    description: 'Trí tuệ nhân tạo (AI)',
  },

  // Số La Mã trong chương hồi
  {
    id: 'roman_century_21',
    pattern: 'thế kỷ\\s+XXI\\b',
    replacement: 'thế kỷ hai mươi mốt',
    isRegex: true,
    category: 'abbreviation',
    isEnabled: true,
    description: 'Thế kỷ 21',
  },
  {
    id: 'roman_century_20',
    pattern: 'thế kỷ\\s+XX\\b',
    replacement: 'thế kỷ hai mươi',
    isRegex: true,
    category: 'abbreviation',
    isEnabled: true,
    description: 'Thế kỷ 20',
  },
  {
    id: 'roman_century_19',
    pattern: 'thế kỷ\\s+XIX\\b',
    replacement: 'thế kỷ mười chín',
    isRegex: true,
    category: 'abbreviation',
    isEnabled: true,
    description: 'Thế kỷ 19',
  },

  // Tên riêng văn học nước ngoài phổ biến
  {
    id: 'name_sherlock',
    pattern: '\\bSherlock Holmes\\b',
    replacement: 'Sơ-lốc Hôm',
    isRegex: true,
    category: 'foreign_name',
    isEnabled: true,
    description: 'Thám tử Sherlock Holmes',
  },
  {
    id: 'name_watson',
    pattern: '\\bJohn Watson\\b',
    replacement: 'Giôn Oát-sơn',
    isRegex: true,
    category: 'foreign_name',
    isEnabled: true,
    description: 'Bác sĩ John Watson',
  },
  {
    id: 'name_harry_potter',
    pattern: '\\bHarry Potter\\b',
    replacement: 'Ha-ri Pót-tơ',
    isRegex: true,
    category: 'foreign_name',
    isEnabled: true,
    description: 'Nhân vật Harry Potter',
  },
  {
    id: 'name_hermione',
    pattern: '\\bHermione\\b',
    replacement: 'Hơ-mai-ơ-ni',
    isRegex: true,
    category: 'foreign_name',
    isEnabled: true,
    description: 'Nhân vật Hermione',
  },
  {
    id: 'name_voldemort',
    pattern: '\\bVoldemort\\b',
    replacement: 'Vôn-đơ-mo',
    isRegex: true,
    category: 'foreign_name',
    isEnabled: true,
    description: 'Chúa tể Voldemort',
  },
];

// Quản lý từ điển phát âm lưu trong LocalStorage
const STORAGE_KEY = 'e2aubooks_pronunciation_rules';

export function loadPronunciationRules(): ReplacementRule[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_PRONUNCIATION_RULES;
}

export function savePronunciationRules(rules: ReplacementRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {}
}

/**
 * Chuẩn hóa văn bản trước khi đưa vào mô hình TTS
 */
export function normalizePronunciation(text: string, rules: ReplacementRule[]): string {
  let result = text;

  for (const rule of rules) {
    if (!rule.isEnabled) continue;

    try {
      if (rule.isRegex) {
        const regex = new RegExp(rule.pattern, 'gi');
        result = result.replace(regex, rule.replacement);
      } else {
        // Chuỗi thông thường: thay thế toàn bộ từ độc lập
        const escaped = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        result = result.replace(regex, rule.replacement);
      }
    } catch (e) {
      console.warn(`Lỗi áp dụng quy tắc từ điển phát âm "${rule.pattern}":`, e);
    }
  }

  return result;
}
