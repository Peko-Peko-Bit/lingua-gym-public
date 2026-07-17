"use client";

import React, { useState, useEffect } from "react";
import { Segment, LanguageCode, InputMode, SUPPORTED_LANGUAGES } from "@/types";
import { Volume2, VolumeX, Play, CheckCircle2, AlertTriangle, XCircle, Info, Loader2, Eye, EyeOff } from "lucide-react";
import { useSpeech } from "@/lib/hooks/useSpeech";
import { SPEAKER_COLORS, buildSpeakerColorMap, buildEffectiveSpeakers } from "@/lib/speakerColors";
import ClozeSegmentCard from "./ClozeSegmentCard";

interface TranslationPanelProps {
  segments: Segment[];
  onUpdateTranslation: (id: string, text: string) => void;
  onCheckTranslation: (id: string) => void;
  onCheckDictation: (id: string) => void;
  onUpdateDictationInput: (segmentId: string, holeIndex: number, value: string) => void;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  inputMode: InputMode;
}

export default function TranslationPanel({
  segments, onUpdateTranslation, onCheckTranslation,
  onCheckDictation, onUpdateDictationInput,
  sourceLang, targetLang, inputMode,
}: TranslationPanelProps) {
  const { speak, stop, currentSegmentId, isSupported } = useSpeech();
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  // Reset revealed state on every mode change (描画中の state 調整パターン)
  const [prevInputMode, setPrevInputMode] = useState(inputMode);
  if (prevInputMode !== inputMode) {
    setPrevInputMode(inputMode);
    setRevealedIds(new Set());
  }

  // Stop TTS when leaving immersive modes (外部システムへの副作用なので effect のまま)
  useEffect(() => {
    if (inputMode !== "listening" && inputMode !== "dictation") stop();
  }, [inputMode, stop]);

  if (segments.length === 0) {
    return (
      <div className="flex flex-col w-full h-full items-center justify-center text-gray-400 dark:text-zinc-600">
        <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 dark:bg-zinc-900 flex items-center justify-center">
          <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
        </div>
        <p className="text-sm font-medium">Segments will appear here.</p>
      </div>
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, id: string) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onCheckTranslation(id);
    }
  };

  const getStatusClasses = (status?: string) => {
    switch (status) {
      case "green":
        return "border-green-300 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10 focus-within:border-green-500";
      case "yellow":
        return "border-yellow-400 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-900/10 focus-within:border-yellow-500 shadow-[0_1px_2px_rgba(250,204,21,0.2)]";
      case "red":
        return "border-red-400 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 focus-within:border-red-500 shadow-[0_1px_2px_rgba(248,113,113,0.2)]";
      default:
        return "border-gray-100 dark:border-zinc-800 focus-within:border-purple-400 dark:focus-within:border-purple-600";
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "green": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "yellow": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "red": return <XCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  const isSkit = segments.some(s => s.speakerLabel);
  const speakerColorMap = buildSpeakerColorMap(segments);
  const effectiveSpeakers = buildEffectiveSpeakers(segments);
  const isDictation = inputMode === "dictation";

  const toggleRevealed = (id: string) => {
    setRevealedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const panelTitle =
    isDictation             ? "Dictation"           :
    inputMode === "listening" ? "Your Understanding" :
    "Your Translation";

  const placeholder =
    isDictation               ? "" :
    inputMode === "listening" ? "Type your understanding here..." :
    inputMode === "phrasing"  ? `Type in ${SUPPORTED_LANGUAGES[sourceLang]}...` :
    `Type in ${SUPPORTED_LANGUAGES[targetLang]}...`;

  return (
    <div className="flex flex-col w-full h-full">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10 flex justify-between items-center gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
            {panelTitle}
          </h2>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {!isDictation && <span className="text-xs text-gray-400 hidden md:block">Ctrl/Cmd + Enter to Check</span>}
          <span className="text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-2.5 py-1 rounded-full">
            {segments.length} segments
          </span>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {segments.map((segment, idx) => {
          const isListening = inputMode === "listening";
          const isRevealed = revealedIds.has(segment.id);
          const isBlurred = isListening && !isRevealed;

          // In Phrasing mode show the reference translation (native lang) as the prompt
          const displayText = inputMode === "phrasing" ? segment.referenceTranslation : segment.sourceText;
          const displayLang = inputMode === "phrasing" ? targetLang : sourceLang;

          const effectiveSpeaker = effectiveSpeakers[idx];
          const prevEffective = idx > 0 ? effectiveSpeakers[idx - 1] : null;
          const colorIdx = isSkit && effectiveSpeaker
            ? (speakerColorMap.get(effectiveSpeaker) ?? 0)
            : 0;
          const color = SPEAKER_COLORS[colorIdx];
          const showDot = isSkit && !!segment.speakerLabel && effectiveSpeaker !== prevEffective;
          const isLast = idx === segments.length - 1;

          return (
            <div key={segment.id} className={isSkit ? "flex gap-3" : ""}>
              {/* Timeline indicator (Skit mode only) */}
              {isSkit && (
                <div className="relative w-4 flex-shrink-0">
                  <div className={`absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 ${color.line}`} />
                  {!isLast && (
                    <div className={`absolute left-1/2 -translate-x-1/2 top-full h-6 w-0.5 ${color.line}`} />
                  )}
                  {showDot && (
                    <div className={`absolute left-1/2 -translate-x-1/2 top-5 w-2.5 h-2.5 rounded-full z-10 ${color.dot}`} />
                  )}
                </div>
              )}

              {/* Dictation mode: ClozeSegmentCard or loading skeleton */}
              {isDictation ? (
                segment.cloze_metadata ? (
                  <ClozeSegmentCard
                    segment={segment}
                    sourceLang={sourceLang}
                    isSkit={isSkit}
                    color={color}
                    isRevealed={isRevealed}
                    onToggleReveal={() => toggleRevealed(segment.id)}
                    onUpdateInput={(holeIdx, val) => onUpdateDictationInput(segment.id, holeIdx, val)}
                    onCheck={() => onCheckDictation(segment.id)}
                    currentTTSId={currentSegmentId}
                    onSpeak={speak}
                    onStopSpeak={stop}
                    isTTSSupported={isSupported}
                  />
                ) : (
                  <div className={`${isSkit ? "flex-1" : ""} p-4 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl shadow-sm animate-pulse`}>
                    <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-3/4 mb-2" />
                    <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2" />
                  </div>
                )
              ) : (
                /* Normal translation card */
                <div
                  className={`${isSkit ? "flex-1" : ""} group flex flex-col gap-2 p-4 bg-white dark:bg-zinc-900 border rounded-xl shadow-sm transition-all relative ${getStatusClasses(segment.status)} ${currentSegmentId === segment.id ? "ring-1 ring-blue-400" : ""}`}
                >
                  <div className="text-sm text-gray-500 dark:text-gray-400 font-medium pb-2 border-b border-gray-50 dark:border-zinc-800/50 flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0 flex items-start gap-1">
                      <div className="flex-1">
                        {segment.speakerLabel && (
                          <span className={`block text-xs font-bold mb-0.5 uppercase tracking-wide ${color.label}`}>
                            {segment.speakerLabel}
                          </span>
                        )}
                        <span className={`block ${isBlurred ? "blur-sm select-none" : ""} transition-all duration-200`}>
                          {displayText}
                        </span>
                      </div>
                      {isListening && (
                        <button
                          onClick={() => toggleRevealed(segment.id)}
                          className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                          title={isRevealed ? "Hide" : "Show"}
                        >
                          {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-1">
                      <button
                        onClick={() => onCheckTranslation(segment.id)}
                        disabled={segment.isChecking || !segment.userTranslation.trim()}
                        className="p-1.5 rounded bg-gray-50 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:bg-zinc-800/50 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-50"
                        title="Check (Cmd+Enter)"
                      >
                        {segment.isChecking
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Play className="w-4 h-4" />}
                      </button>
                      {isSupported && (
                        <button
                          onClick={() => currentSegmentId === segment.id ? stop() : speak(displayText, displayLang, segment.id)}
                          className="p-1.5 rounded bg-gray-50 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:bg-zinc-800/50 dark:hover:bg-blue-900/30 transition-colors"
                          title={currentSegmentId === segment.id ? "Stop" : "Read aloud"}
                        >
                          {currentSegmentId === segment.id
                            ? <VolumeX className="w-4 h-4 text-blue-400" />
                            : <Volume2 className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>

                  <textarea
                    className="w-full resize-none bg-transparent outline-none text-base text-gray-800 dark:text-gray-200 placeholder:text-gray-300 dark:placeholder:text-zinc-600 mt-2 min-h-[60px]"
                    placeholder={placeholder}
                    value={segment.userTranslation}
                    onChange={(e) => onUpdateTranslation(segment.id, e.target.value)}
                    onBlur={(e) => {
                      const next = e.relatedTarget as HTMLElement | null;
                      if (
                        segment.status === "neutral" &&
                        segment.userTranslation.trim() &&
                        next?.tagName === "TEXTAREA" &&
                        next !== e.currentTarget
                      ) {
                        onCheckTranslation(segment.id);
                      }
                    }}
                    onKeyDown={(e) => handleKeyDown(e, segment.id)}
                  />

                  {segment.status !== "neutral" && (
                    <div className="mt-2 pt-3 border-t border-dashed border-gray-200 dark:border-zinc-800/50 text-sm">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5">{getStatusIcon(segment.status)}</div>
                        <div className="flex-1">
                          {segment.reason && (
                            <p className="text-gray-700 dark:text-gray-300 mb-1">{segment.reason}</p>
                          )}
                          {segment.advice && segment.status !== "green" && (
                            <div className="flex gap-2 items-start mt-2 p-2 bg-white/50 dark:bg-zinc-800/50 rounded-md border border-gray-100 dark:border-zinc-700/50">
                              <Info className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                              <p className="text-indigo-700 dark:text-indigo-300 font-medium">{segment.advice}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
