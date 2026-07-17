"use client";

import { useState, useRef, useEffect } from "react";
import { LanguageCode } from "@/types";
import { apiFetch } from "@/lib/api-fetch";
import { Dices, Users, ChevronDown, Camera } from "lucide-react";
import {
  DifficultyLevel,
  DIFFICULTY_LEVELS,
  SkitCategory,
  SKIT_CATEGORIES,
  SourceType,
} from "@/lib/source-providers/types";

interface SourceToolbarProps {
  sourceLang: LanguageCode;
  studyLang: LanguageCode;
  onTextGenerated: (text: string) => void;
  disabled?: boolean;
  onMediaCapture?: () => void;
  isMediaActive?: boolean;
}

export default function SourceToolbar({
  sourceLang,
  studyLang,
  onTextGenerated,
  disabled,
  onMediaCapture,
  isMediaActive,
}: SourceToolbarProps) {
  const [generatingType, setGeneratingType] = useState<SourceType | null>(null);
  const [currentDifficulty, setCurrentDifficulty] = useState<DifficultyLevel>("Intermediate");
  const [skitCategory, setSkitCategory] = useState<SkitCategory>("daily");
  const [skitMenuOpen, setSkitMenuOpen] = useState(false);
  const skitMenuRef = useRef<HTMLDivElement>(null);

  // Close skit category dropdown when clicking outside
  useEffect(() => {
    if (!skitMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (skitMenuRef.current && !skitMenuRef.current.contains(e.target as Node)) {
        setSkitMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [skitMenuOpen]);

  const generateText = async (type: SourceType) => {
    if (generatingType || disabled) return;

    setGeneratingType(type);
    try {
      const response = await apiFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          lang: sourceLang,
          studyLang,
          options: {
            difficulty: currentDifficulty,
            ...(type === "skit" && { skitCategory }),
          },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to generate text");
      }

      const result = await response.json() as { text: string };
      onTextGenerated(result.text);
    } catch (error) {
      console.error("Text generation error:", error);
      alert("Failed to generate text. Please check your API key.");
    } finally {
      setGeneratingType(null);
    }
  };

  const isGeneratingRandom = generatingType === "random";
  const isGeneratingSkit   = generatingType === "skit";
  const isAnyGenerating    = !!generatingType;

  const currentSkitCategoryDef = SKIT_CATEGORIES.find(c => c.id === skitCategory)!;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-zinc-800/50">

      {/* ── Difficulty selector (shared) ── */}
      <select
        value={currentDifficulty}
        onChange={e => setCurrentDifficulty(e.target.value as DifficultyLevel)}
        disabled={isAnyGenerating || disabled}
        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold
          bg-gray-100 dark:bg-zinc-800
          text-gray-600 dark:text-zinc-300
          border-0 outline-none cursor-pointer
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:ring-2 focus:ring-indigo-400 transition-all"
      >
        {DIFFICULTY_LEVELS.map(level => (
          <option key={level} value={level}>{level}</option>
        ))}
      </select>

      {/* ── Random button (simple) ── */}
      <button
        onClick={() => generateText("random")}
        disabled={isAnyGenerating || !!disabled}
        className="group flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg
          text-xs font-semibold transition-all duration-200
          border border-indigo-200/60 dark:border-indigo-700/40
          text-indigo-600 dark:text-indigo-400
          bg-gradient-to-r from-indigo-500/10 to-purple-500/10
          dark:from-indigo-500/15 dark:to-purple-500/15
          hover:from-indigo-500/20 hover:to-purple-500/20
          dark:hover:from-indigo-500/25 dark:hover:to-purple-500/25
          hover:shadow-sm hover:shadow-indigo-500/10
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGeneratingRandom ? (
          <div className="w-3.5 h-3.5 border-2 border-indigo-400/30 border-t-indigo-500 rounded-full animate-spin" />
        ) : (
          <Dices className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-200" />
        )}
        <span>{isGeneratingRandom ? "Generating…" : "Random"}</span>
      </button>

      {/* ── Skit split button ── */}
      <div ref={skitMenuRef} className="relative flex">
        {/* Left: generate action */}
        <button
          onClick={() => generateText("skit")}
          disabled={isAnyGenerating || !!disabled}
          className="flex items-center gap-1.5 px-3.5 py-1.5
            rounded-l-lg border border-r-0
            border-indigo-200/60 dark:border-indigo-700/40
            text-xs font-semibold transition-all duration-200
            text-indigo-600 dark:text-indigo-400
            bg-gradient-to-r from-indigo-500/10 to-purple-500/10
            dark:from-indigo-500/15 dark:to-purple-500/15
            hover:from-indigo-500/20 hover:to-purple-500/20
            dark:hover:from-indigo-500/25 dark:hover:to-purple-500/25
            hover:shadow-sm hover:shadow-indigo-500/10
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGeneratingSkit ? (
            <div className="w-3.5 h-3.5 border-2 border-indigo-400/30 border-t-indigo-500 rounded-full animate-spin" />
          ) : (
            <Users className="w-3.5 h-3.5" />
          )}
          <span>
            {isGeneratingSkit
              ? "Generating…"
              : `Skit · ${currentSkitCategoryDef.label}`}
          </span>
        </button>

        {/* Right: category picker toggle */}
        <button
          onClick={() => !isAnyGenerating && !disabled && setSkitMenuOpen(v => !v)}
          disabled={isAnyGenerating || !!disabled}
          className="flex items-center justify-center px-2 py-1.5
            rounded-r-lg border
            border-indigo-200/60 dark:border-indigo-700/40
            text-xs text-indigo-600 dark:text-indigo-400
            bg-indigo-50/50 dark:bg-indigo-900/10
            hover:bg-indigo-100/50 dark:hover:bg-indigo-900/20
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200"
          title="Select skit category"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${skitMenuOpen ? "rotate-180" : ""}`}
          />
        </button>

        {/* Category dropdown */}
        {skitMenuOpen && (
          <div className="absolute top-full left-0 mt-1.5 w-52 z-50
            bg-white dark:bg-zinc-900
            border border-gray-200 dark:border-zinc-800
            rounded-xl shadow-xl py-1.5
            animate-in fade-in zoom-in duration-100"
          >
            <div className="px-3 py-1 text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest">
              Skit Category
            </div>
            {SKIT_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                  setSkitCategory(cat.id);
                  setSkitMenuOpen(false);
                }}
                className={`w-full px-4 py-2 text-left flex items-center justify-between transition-colors
                  ${skitCategory === cat.id
                    ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
                    : "text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                  }`}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{cat.label}</span>
                  <span className="text-[11px] text-gray-400 dark:text-zinc-500">{cat.description}</span>
                </span>
                {skitCategory === cat.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* OCR / Media button — mobile only */}
      {onMediaCapture && (
        <button
          onClick={onMediaCapture}
          disabled={isAnyGenerating || !!disabled}
          className={`md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border disabled:opacity-50 disabled:cursor-not-allowed ${
            isMediaActive
              ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50"
              : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 border-transparent hover:bg-gray-200 dark:hover:bg-zinc-700"
          }`}
          title="OCR / Media"
        >
          <Camera className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
