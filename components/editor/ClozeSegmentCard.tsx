"use client";

import { Volume2, VolumeX, Play, CheckCircle2, AlertTriangle, XCircle, Info, Loader2, Eye, EyeOff } from "lucide-react";
import { Segment, LanguageCode } from "@/types";
import { SPEAKER_COLORS } from "@/lib/speakerColors";
import ClozeInput from "./ClozeInput";

interface Props {
  segment: Segment;
  sourceLang: LanguageCode;
  isSkit: boolean;
  color: typeof SPEAKER_COLORS[number];
  isRevealed: boolean;
  onToggleReveal: () => void;
  onUpdateInput: (holeIndex: number, value: string) => void;
  onCheck: () => void;
  currentTTSId: string | null;
  onSpeak: (text: string, lang: LanguageCode, id: string) => void;
  onStopSpeak: () => void;
  isTTSSupported: boolean;
}

function statusClasses(status: string | null) {
  switch (status) {
    case "green": return "border-green-300 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10";
    case "yellow": return "border-yellow-400 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-900/10 shadow-[0_1px_2px_rgba(250,204,21,0.2)]";
    case "red": return "border-red-400 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 shadow-[0_1px_2px_rgba(248,113,113,0.2)]";
    default: return "border-gray-100 dark:border-zinc-800";
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === "green") return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />;
  if (status === "yellow") return <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />;
  return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />;
}

export default function ClozeSegmentCard({
  segment, sourceLang, isSkit, color,
  isRevealed, onToggleReveal,
  onUpdateInput, onCheck,
  currentTTSId, onSpeak, onStopSpeak, isTTSSupported,
}: Props) {
  const meta = segment.cloze_metadata;
  const results = segment.dictation_results;

  const hasInput = meta?.targets.some(t => (segment.dictation_inputs?.[t.index] ?? "").trim()) ?? false;

  const overallStatus = (() => {
    if (!results?.length) return null;
    if (results.some(r => r.status === "red")) return "red";
    if (results.some(r => r.status === "yellow")) return "yellow";
    return "green";
  })();

  const btnBase = "p-1.5 rounded transition-colors";
  const isSpeaking = currentTTSId === segment.id;

  return (
    <div
      className={`${isSkit ? "flex-1" : ""} flex flex-col gap-3 p-4 bg-white dark:bg-zinc-900 border rounded-xl shadow-sm transition-all ${statusClasses(overallStatus)}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node) && hasInput) {
          onCheck();
        }
      }}
    >
      {/* Speaker label (Skit) */}
      {segment.speakerLabel && (
        <span className={`text-xs font-bold uppercase tracking-wide ${color.label}`}>
          {segment.speakerLabel}
        </span>
      )}

      {/* Cloze exercise */}
      {meta && (
        <div className="py-1">
          <ClozeInput
            displayTemplate={meta.display_template}
            targets={meta.targets}
            inputs={segment.dictation_inputs ?? []}
            results={results}
            isRevealed={isRevealed}
            onInput={onUpdateInput}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end items-center gap-1 pt-1 border-t border-gray-50 dark:border-zinc-800/50">
        <button
          tabIndex={-1}
          onClick={onCheck}
          disabled={segment.isChecking || !hasInput}
          className={`${btnBase} bg-gray-50 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:bg-zinc-800/50 dark:hover:bg-indigo-900/30 disabled:opacity-50`}
          title="Check (Cmd+Enter)"
        >
          {segment.isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        </button>
        {isTTSSupported && (
          <button
            tabIndex={-1}
            onClick={() => isSpeaking ? onStopSpeak() : onSpeak(segment.sourceText, sourceLang, segment.id)}
            className={`${btnBase} bg-gray-50 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:bg-zinc-800/50 dark:hover:bg-blue-900/30`}
            title={isSpeaking ? "Stop" : "Read aloud"}
          >
            {isSpeaking ? <VolumeX className="w-4 h-4 text-blue-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}
        <button
          tabIndex={-1}
          onClick={onToggleReveal}
          className={`${btnBase} bg-gray-50 hover:bg-indigo-50 dark:bg-zinc-800/50 dark:hover:bg-indigo-900/30 ${isRevealed ? "text-indigo-500" : "text-gray-400 hover:text-indigo-500"}`}
          title={isRevealed ? "Hide answers" : "Show answers"}
        >
          {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {/* Feedback */}
      {results && results.length > 0 && (
        <div className="pt-3 border-t border-dashed border-gray-200 dark:border-zinc-800/50 space-y-2 text-sm">
          {results.map(r => (
            <div key={r.index} className="flex items-start gap-2">
              <StatusIcon status={r.status} />
              <p className="text-gray-700 dark:text-gray-300">{r.reason}</p>
            </div>
          ))}
          {segment.dictation_overall_advice && (
            <div className="flex gap-2 items-start mt-2 p-2 bg-white/50 dark:bg-zinc-800/50 rounded-md border border-gray-100 dark:border-zinc-700/50">
              <Info className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
              <p className="text-indigo-700 dark:text-indigo-300 font-medium">{segment.dictation_overall_advice}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
