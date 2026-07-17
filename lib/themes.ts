import { LanguageCode } from "@/types";

export type ThemeId = "default" | "espanol" | "english" | "japonais" | "hanguk" | "catala";

export const LANGUAGE_THEME_MAP: Partial<Record<LanguageCode, ThemeId>> = {
  es: "espanol",
  en: "english",
  ja: "japonais",
  ko: "hanguk",
  ca: "catala",
};

export const DEFAULT_THEME: ThemeId = "default";
