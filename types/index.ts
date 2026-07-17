export type LanguageCode = "es" | "en" | "ja" | "ko" | "ca" | "fr" | "de" | "pt" | "zh" | "it";

export const SUPPORTED_LANGUAGES: Record<LanguageCode, string> = {
  es: "Español",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  ca: "Català",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  zh: "中文",
  it: "Italiano",
};

export type InputMode = "comprehension" | "phrasing" | "media" | "listening" | "dictation";

export type Status = "neutral" | "red" | "yellow" | "green";

export interface DictationTarget {
  index: number;
  answer: string;
  hint: string;
}

export interface ClozeMetadata {
  display_template: string;
  targets: DictationTarget[];
}

export interface DictationResult {
  index: number;
  status: "green" | "yellow" | "red";
  reason: string;
}

export interface Segment {
  id: string;
  sourceText: string;
  speakerLabel?: string; // Skit モード時の発話者名（"Elena" など）
  userTranslation: string;
  referenceTranslation: string; // gpt-4o-miniで生成したお手本訳
  status: Status;
  advice?: string; // 添削モデルからのアドバイス
  reason?: string; // 判定の理由
  isChecking?: boolean;
  checked_at?: string | null;  // 初回採点日時（一度セットされたら上書きしない）
  // Dictation mode
  cloze_metadata?: ClozeMetadata | null;
  dictation_inputs?: string[];        // クライアント state のみ（DB 保存なし）
  dictation_results?: DictationResult[]; // クライアント state のみ（DB 保存なし）
  dictation_overall_advice?: string;  // クライアント state のみ（DB 保存なし）
  // Image bounding box for OCR integration later
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface VocabularyEntry {
  id: string;
  term: string;
  translation: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  type?: "word" | "phrase";
  partOfSpeech?: string; // e.g. "noun", "verb" — null for phrases
  sessionId?: string;
  sessionTitle: string;
  createdAt: string; // ISO string from DB
  sourceApp?: string; // DBカラム: source_app
}

// Lightweight session list item — what GET /api/sessions returns.
// Segment bodies and source_text stay on GET /api/sessions/[id].
export interface SessionSummary {
  id: string;
  title: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  updatedAt: number;
  createdAt?: number;
  isPinned?: boolean;
  inputMode?: InputMode;
  segmentCount: number;   // segments.length
  checkedCount: number;   // segments with status !== "neutral"
  hasSpeakers: boolean;   // any segment has a speaker_label (Skit)
}

export interface Session {
  id: string;
  title: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  segments: Segment[];
  sourceText: string;
  updatedAt: number; // Date.now() timestamp
  createdAt?: number; // Date.now() timestamp — set by DB on first insert
  isPinned?: boolean;
  inputMode?: InputMode;                   // DBカラム: input_mode
  // Media / OCR fields
  sourceFileUrl?: string;                  // URL in Supabase Storage or GCS
  storageProvider?: "supabase" | "gcs";   // Where the file is stored
  rawOcrOutput?: string;                   // Full raw OCR text before segmentation
}
