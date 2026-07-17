import { LanguageCode } from "@/types";

/** Supported source text generation types — extend this union as new providers are added */
export type SourceType = "random" | "skit" | "news" | "dialogue";

/** Four difficulty levels for generated passages */
export type DifficultyLevel = "Beginner" | "Pre-Intermediate" | "Intermediate" | "Advanced";

export const DIFFICULTY_LEVELS: DifficultyLevel[] = [
  "Beginner",
  "Pre-Intermediate",
  "Intermediate",
  "Advanced",
];

/** Four skit categories that control the scene and target expressions */
export type SkitCategory = "daily" | "business" | "intellectual" | "narrative";

export interface SkitCategoryDef {
  id: SkitCategory;
  label: string;
  description: string;
  targetExpressions: string;
}

export const SKIT_CATEGORIES: SkitCategoryDef[] = [
  {
    id: "daily",
    label: "Daily",
    description: "Daily Life",
    targetExpressions:
      "expressing emotions, talking about habits and daily routines, making casual plans, and natural friendly conversation",
  },
  {
    id: "business",
    label: "Business",
    description: "Business / Official",
    targetExpressions:
      "making polite requests, giving status reports, explaining things logically and clearly, and declining offers or requests tactfully",
  },
  {
    id: "intellectual",
    label: "Intellectual",
    description: "Discussion / Debate",
    targetExpressions:
      "expressing opinions on social issues, comparing abstract concepts, constructing arguments, and offering critical analysis",
  },
  {
    id: "narrative",
    label: "Narrative",
    description: "Narrative / Description",
    targetExpressions:
      "recalling past events in vivid detail, describing scenery and atmosphere, portraying characters, and building a narrative arc",
  },
];

export interface GenerateRequest {
  type: SourceType;
  lang: LanguageCode;
  /** The language being studied — sets cultural context when different from lang */
  studyLang?: LanguageCode;
  /** Provider-specific options (topic, difficulty, scene, etc.) */
  options?: {
    difficulty?: DifficultyLevel;
    skitCategory?: SkitCategory;
    [key: string]: unknown;
  };
}

export interface GenerateResult {
  text: string;
  metadata?: {
    topic?: string;
    /** Origin for attribution, e.g. "BBC News", "NHK" */
    source?: string;
  };
}

export interface SourceProvider {
  type: SourceType;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}
