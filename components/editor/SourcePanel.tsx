"use client";

import { useState } from "react";
import { Segment, LanguageCode, InputMode, SUPPORTED_LANGUAGES } from "@/types";
import SourceToolbar from "./SourceToolbar";
import { Eye, EyeOff, Headphones, PenLine } from "lucide-react";
import { SPEAKER_COLORS, buildSpeakerColorMap, buildEffectiveSpeakers } from "@/lib/speakerColors";

interface SourcePanelProps {
  sourceText: string;
  onSourceChange: (text: string) => void;
  segments: Segment[];
  sourceLang: LanguageCode;
  inputMode: InputMode;
  targetLang: LanguageCode;
  onSetTargetLang: (lang: LanguageCode) => void;
  onSetInputMode: (mode: InputMode) => void;
  disableListeningDictation: boolean;
}

export default function SourcePanel({ sourceText, onSourceChange, segments, sourceLang, inputMode, targetLang, onSetTargetLang, onSetInputMode, disableListeningDictation }: SourcePanelProps) {
  const [isSourceBlurred, setIsSourceBlurred] = useState(false);

  // モード切替時にブラー状態を再導出（描画中の state 調整パターン。effect での setState を避ける）
  const [prevInputMode, setPrevInputMode] = useState(inputMode);
  if (prevInputMode !== inputMode) {
    setPrevInputMode(inputMode);
    setIsSourceBlurred(inputMode === "listening" || inputMode === "dictation");
  }

  const isListening = inputMode === "listening" || inputMode === "dictation";

  const isSkit = segments.some(s => s.speakerLabel);
  const speakerColorMap = buildSpeakerColorMap(segments);
  const effectiveSpeakers = buildEffectiveSpeakers(segments);

  return (
    <div className="flex flex-col w-full h-full">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm flex justify-between items-center gap-3">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
          Source Text
        </h2>

        {isListening && (
          <button
            onClick={() => setIsSourceBlurred(prev => !prev)}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors flex-shrink-0"
          >
            {isSourceBlurred ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {isSourceBlurred ? "Show Source" : "Hide Source"}
          </button>
        )}
      </div>

      {/* Mobile-only: lang switcher + mode buttons above SourceToolbar */}
      {segments.length === 0 && (
        <div className="md:hidden border-b border-gray-100 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-900/50">
          {!isListening && (
            <div className="flex items-center justify-center px-4 py-2 border-b border-gray-100 dark:border-zinc-800/30">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-400 dark:text-zinc-500 whitespace-nowrap">Your language</span>
                <select
                  value={targetLang}
                  onChange={e => onSetTargetLang(e.target.value as LanguageCode)}
                  className="px-2 py-1 rounded-md bg-gray-100 dark:bg-zinc-800 text-xs font-medium border-0 outline-none cursor-pointer text-gray-700 dark:text-zinc-300"
                >
                  {(Object.entries(SUPPORTED_LANGUAGES) as [LanguageCode, string][]).map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Mode buttons 2×2 */}
          <div className="grid grid-cols-2 gap-1.5 px-3 py-2">
            {([
              { id: "comprehension" as InputMode, label: "Comprehension" },
              { id: "phrasing"      as InputMode, label: "Phrasing" },
              { id: "listening"     as InputMode, label: "Listening", icon: <Headphones className="w-3.5 h-3.5" /> },
              { id: "dictation"     as InputMode, label: "Dictation", icon: <PenLine className="w-3.5 h-3.5" /> },
            ] as { id: InputMode; label: string; icon?: React.ReactNode }[]).map(mode => {
              const isDisabled = disableListeningDictation && (mode.id === "listening" || mode.id === "dictation");
              const isActive = inputMode === mode.id;
              return (
                <button
                  key={mode.id}
                  disabled={isDisabled}
                  onClick={() => onSetInputMode(mode.id)}
                  title={isDisabled ? "Listening/Dictation is not available in Phrasing drill" : undefined}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                    isDisabled
                      ? "text-gray-300 dark:text-zinc-600 bg-gray-50 dark:bg-zinc-800 border-transparent cursor-not-allowed"
                      : isActive
                        ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50"
                        : "bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border-transparent hover:border-gray-200 dark:hover:border-zinc-700"
                  }`}
                >
                  {mode.icon}
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {segments.length === 0 && (
        <SourceToolbar
          sourceLang={!isListening && inputMode === "phrasing" ? targetLang : sourceLang}
          studyLang={sourceLang}
          onTextGenerated={onSourceChange}
          onMediaCapture={() => onSetInputMode("media")}
          isMediaActive={inputMode === "media"}
        />
      )}

      <div className="flex-1 p-6 overflow-y-auto relative">
        <div className="h-full transition-all duration-200">
          {segments.length === 0 ? (
            <textarea
              className="w-full h-full resize-none bg-transparent outline-none text-lg text-gray-800 dark:text-gray-200 placeholder:text-gray-300 dark:placeholder:text-zinc-700 leading-relaxed"
              placeholder="Type or paste your text here to begin translation..."
              value={sourceText}
              onChange={(e) => onSourceChange(e.target.value)}
            />
          ) : isSkit ? (
            <div className="flex flex-col gap-1.5">
              {segments.map((segment, idx) => {
                const effectiveSpeaker = effectiveSpeakers[idx];
                const prevEffective = idx > 0 ? effectiveSpeakers[idx - 1] : null;
                const colorIdx = effectiveSpeaker ? (speakerColorMap.get(effectiveSpeaker) ?? 0) : 0;
                const color = SPEAKER_COLORS[colorIdx];
                const showBadge = !!segment.speakerLabel && effectiveSpeaker !== prevEffective;
                const isTextBlurred = isListening && isSourceBlurred;  // isListening covers both listening & dictation
                return (
                  <div key={segment.id} className="flex gap-3 items-start">
                    <div className="w-20 flex-shrink-0 flex justify-start pt-[0.15rem]">
                      {showBadge && (
                        <span className={`text-[12px] font-bold uppercase px-2.5 py-0.5 rounded-md ${color.badge}`}>
                          {segment.speakerLabel}
                        </span>
                      )}
                    </div>
                    <span className={`flex-1 text-lg leading-relaxed text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors cursor-text ${isTextBlurred ? "blur-sm select-none pointer-events-none" : ""}`}>
                      {(inputMode === "phrasing" ? segment.referenceTranslation : segment.sourceText).trim()}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={`text-lg leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap ${isListening && isSourceBlurred ? "blur-sm select-none pointer-events-none" : ""}`}>
              {segments.map((segment) => (
                <span
                  key={segment.id}
                  className="hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors cursor-text inline"
                  title="This segment will be translated"
                >
                  {inputMode === "phrasing" ? segment.referenceTranslation : segment.sourceText}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {segments.length > 0 && (
        <div className="p-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/30 flex justify-end">
          <button
            onClick={() => onSourceChange("")}
            className="text-sm font-medium text-gray-400 hover:text-red-500 transition-colors"
          >
            Clear Text
          </button>
        </div>
      )}
    </div>
  );
}
