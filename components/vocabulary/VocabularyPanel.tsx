"use client";

import React, { useState } from "react";
import { VocabularyEntry } from "@/types";
import { Download, Trash2, Search } from "lucide-react";
import { deleteVocabularyEntry, exportVocabularyAsCsv } from "@/lib/vocabulary";

const POS_STYLE: Record<string, string> = {
  verb:        "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  noun:        "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  adjective:   "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  adverb:      "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
  pronoun:     "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300",
  preposition: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  conjunction: "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300",
  interjection:"bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  _default:    "bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300",
};

interface VocabularyPanelProps {
  entries: VocabularyEntry[];
  onDelete: (id: string) => void;
}

export default function VocabularyPanel({ entries, onDelete }: VocabularyPanelProps) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? entries.filter(e =>
        e.term.toLowerCase().includes(query.toLowerCase()) ||
        e.translation.toLowerCase().includes(query.toLowerCase()) ||
        e.sessionTitle.toLowerCase().includes(query.toLowerCase())
      )
    : entries;

  const handleDelete = async (id: string) => {
    onDelete(id); // optimistic
    await deleteVocabularyEntry(id);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search words..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100 dark:bg-zinc-800 border border-transparent rounded-lg outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-zinc-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 transition-all"
          />
        </div>

        {/* Count + CSV */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-zinc-500">
            {filtered.length} / {entries.length} items
          </span>
          <button
            onClick={() => exportVocabularyAsCsv(filtered)}
            disabled={filtered.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-zinc-600">
            {entries.length === 0 ? (
              <>
                <p className="text-sm">Vocabulary is empty.</p>
                <p className="text-xs mt-1">Select text to add words.</p>
              </>
            ) : (
              <p className="text-sm">No matches</p>
            )}
          </div>
        ) : (
          filtered.map(entry => (
            <div
              key={entry.id}
              className="group flex items-start gap-2 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800/50 border border-transparent hover:border-gray-100 dark:hover:border-zinc-700/50 transition-all"
            >
              <div className="flex-1 min-w-0">
                {/* Term + POS badge + translation */}
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                    {entry.term}
                  </span>
                  {entry.partOfSpeech && (
                    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${POS_STYLE[entry.partOfSpeech] ?? POS_STYLE._default}`}>
                      {entry.partOfSpeech}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 dark:text-zinc-500">→</span>
                  <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
                    {entry.translation}
                  </span>
                </div>
                {/* Meta */}
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400 dark:text-zinc-600">
                  <span className="truncate max-w-[130px]" title={entry.sessionTitle}>
                    {entry.sessionTitle || "—"}
                  </span>
                  <span>·</span>
                  <span className="flex-shrink-0">{formatDate(entry.createdAt)}</span>
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(entry.id)}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-all"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
