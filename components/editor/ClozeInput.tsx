"use client";

import { useState } from "react";
import { DictationTarget, DictationResult } from "@/types";

// ── 穴ひとつ分のコンポーネント ──────────────────────────────────────────────
interface ClozeHoleProps {
  target: DictationTarget;
  value: string;
  result?: DictationResult;
  isRevealed: boolean;
  onInput: (index: number, value: string) => void;
}

function ClozeHole({ target, value, result, isRevealed, onInput }: ClozeHoleProps) {
  const [hintOpen, setHintOpen] = useState(false);

  const charWidth = Math.max(value.length + 2, 8);

  if (isRevealed) {
    return (
      <span className="inline-block align-baseline mx-0.5 px-1 italic text-gray-400 dark:text-zinc-500 border-b border-dashed border-gray-300 dark:border-zinc-600">
        {target.answer}
      </span>
    );
  }

  const resultBorder = result
    ? result.status === "green"
      ? "border-solid border-green-400 dark:border-green-600"
      : result.status === "yellow"
      ? "border-solid border-yellow-400 dark:border-yellow-600"
      : "border-solid border-red-400 dark:border-red-600"
    : "";

  const resultText = result
    ? result.status === "green"
      ? "text-green-600 dark:text-green-400 font-bold"
      : result.status === "yellow"
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-red-500 dark:text-red-400"
    : "";

  return (
    <span className="relative inline-flex items-center mx-0.5">
      {/* ヒント — ? ボタンでトグル（全デバイス共通） */}
      <span
        className={[
          "pointer-events-none absolute -top-7 left-0 z-10 whitespace-nowrap rounded",
          "bg-zinc-800 dark:bg-zinc-700 px-2 py-0.5 text-[11px] text-white shadow",
          "transition-opacity duration-200",
          hintOpen ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {target.hint}
      </span>

      {/* Input */}
      <input
        type="text"
        value={value}
        onChange={e => onInput(target.index, e.target.value)}
        style={{ width: `${charWidth}ch`, minWidth: "80px", maxWidth: "200px" }}
        className={[
          "align-baseline bg-gray-100 dark:bg-zinc-800",
          "border-b-2 outline-none px-1 py-0.5 rounded-t transition-colors",
          result
            ? `${resultBorder} ${resultText}`
            : "border-dotted border-gray-300 dark:border-zinc-600",
        ].join(" ")}
      />

      {/* ? ボタン — 全デバイス共通 */}
      <button
        type="button"
        onClick={() => setHintOpen(v => !v)}
        aria-label="Show hint"
        className="ml-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center
          rounded-full bg-gray-200 dark:bg-zinc-700
          text-[10px] font-bold text-gray-500 dark:text-zinc-400
          active:bg-indigo-100 dark:active:bg-indigo-900/40 transition-colors"
      >
        ?
      </button>
    </span>
  );
}

// ── テンプレートパーサー＋レンダラー ────────────────────────────────────────
interface Props {
  displayTemplate: string;
  targets: DictationTarget[];
  inputs: string[];
  results?: DictationResult[];
  isRevealed: boolean;
  onInput: (holeIndex: number, value: string) => void;
}

export default function ClozeInput({ displayTemplate, targets, inputs, results, isRevealed, onInput }: Props) {
  type Part = { type: "text"; value: string } | { type: "hole"; index: number };
  const parts: Part[] = [];
  const regex = /\{(\d+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(displayTemplate)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: displayTemplate.slice(last, m.index) });
    parts.push({ type: "hole", index: parseInt(m[1], 10) });
    last = m.index + m[0].length;
  }
  if (last < displayTemplate.length) parts.push({ type: "text", value: displayTemplate.slice(last) });

  return (
    <span className="text-lg leading-loose text-gray-800 dark:text-gray-200">
      {parts.map((part, i) => {
        if (part.type === "text") return <span key={i}>{part.value}</span>;
        const target = targets.find(t => t.index === part.index);
        if (!target) return null;
        return (
          <ClozeHole
            key={i}
            target={target}
            value={inputs[part.index] ?? ""}
            result={results?.find(r => r.index === part.index)}
            isRevealed={isRevealed}
            onInput={onInput}
          />
        );
      })}
    </span>
  );
}
