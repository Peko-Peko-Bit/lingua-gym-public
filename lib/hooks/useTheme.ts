"use client";

import { useEffect } from "react";
import { LanguageCode } from "@/types";
import { LANGUAGE_THEME_MAP, DEFAULT_THEME } from "@/lib/themes";

export function useTheme(sourceLang: LanguageCode) {
  useEffect(() => {
    const theme = LANGUAGE_THEME_MAP[sourceLang] ?? DEFAULT_THEME;
    document.documentElement.setAttribute("data-theme", theme);
  }, [sourceLang]);
}
