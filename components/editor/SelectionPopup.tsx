"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { LanguageCode } from "@/types";
import { apiFetch } from "@/lib/api-fetch";

interface SelectionPopupProps {
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  sessionId: string | null;
  sessionTitle: string;
  onAdd: (term: string, translation: string) => Promise<void>;
}

interface PopupState {
  term: string;
  x: number;
  y: number;
  isMobile: boolean;
}

export default function SelectionPopup({
  sourceLang,
  targetLang,
  onAdd,
}: SelectionPopupProps) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [translation, setTranslation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const popupContainerRef = useRef<HTMLDivElement>(null);
  // Guard: skip re-fetch when selectionchange fires due to React updating the input value
  const currentTermRef = useRef<string | null>(null);

  // Track keyboard height via visualViewport (mobile)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setBottomOffset(window.innerHeight - vv.height - vv.offsetTop);
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const fetchTranslation = useCallback(async (term: string, signal: AbortSignal) => {
    setIsLoading(true);
    setTranslation("");
    try {
      const res = await apiFetch("/api/word-translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, sourceLang, targetLang }),
        signal,
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json() as { translation: string };
      setTranslation(data.translation);
    } catch {
      // aborted or network error — field stays empty for manual entry
    } finally {
      setIsLoading(false);
    }
  }, [sourceLang, targetLang]);

  const handleSelection = useCallback(() => {
    // DOM selection (spans, divs, etc.)
    const sel = window.getSelection();
    let term = sel?.toString().trim() ?? "";
    let rect: DOMRect | null = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;

    // Textarea fallback (window.getSelection() returns "" inside <textarea>)
    if (!term) {
      const active = document.activeElement as HTMLTextAreaElement | null;
      if (
        active?.tagName === "TEXTAREA" &&
        active.selectionStart != null &&
        active.selectionEnd != null &&
        active.selectionStart !== active.selectionEnd
      ) {
        term = active.value.substring(active.selectionStart, active.selectionEnd).trim();
        rect = active.getBoundingClientRect();
      }
    }

    // Only open the popup — closing is handled by outside mousedown
    if (!term || term.length > 200 || !rect) return;

    // Skip if already fetching/showing this exact term (prevents selectionchange loop)
    if (term === currentTermRef.current) return;
    currentTermRef.current = term;

    setPopup({
      term,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      isMobile: navigator.maxTouchPoints > 0,
    });

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    fetchTranslation(term, abortRef.current.signal);
  }, [fetchTranslation]);

  // Mobile: selectionchange with debounce is more reliable than mouseup
  const handleSelectionChange = useCallback(() => {
    if (selectionTimerRef.current !== null) clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = setTimeout(() => {
      handleSelection();
      selectionTimerRef.current = null;
    }, 200);
  }, [handleSelection]);

  useEffect(() => {
    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("mouseup", handleSelection);
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (selectionTimerRef.current !== null) clearTimeout(selectionTimerRef.current);
    };
  }, [handleSelection, handleSelectionChange]);

  // Close on outside mousedown — lets the translation input receive focus without closing
  useEffect(() => {
    if (!popup) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (popupContainerRef.current && !popupContainerRef.current.contains(e.target as Node)) {
        currentTermRef.current = null;
        setPopup(null);
        abortRef.current?.abort();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [popup]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        currentTermRef.current = null;
        setPopup(null);
        abortRef.current?.abort();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleAdd = async () => {
    if (!popup || isAdding || isLoading) return;
    setIsAdding(true);
    try {
      await onAdd(popup.term, translation || popup.term);
    } finally {
      setIsAdding(false);
      currentTermRef.current = null;
      setPopup(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  if (!popup) return null;

  const bookIcon = (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );

  // Mobile: fixed bottom — input + button side by side
  if (popup.isMobile) {
    return (
      <div
        className="fixed left-3 right-3 z-[100] pointer-events-none transition-[bottom] duration-150"
        style={{ bottom: Math.max(72, bottomOffset + 8) }}
      >
        <div
          ref={popupContainerRef}
          className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl p-2 flex items-center gap-2 pointer-events-auto"
        >
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-zinc-500 px-1 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>Translating...</span>
              </div>
            ) : (
              <input
                value={translation}
                onChange={e => setTranslation(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
                placeholder="Translation..."
                className="w-full text-sm bg-gray-50 dark:bg-zinc-700/60 rounded-lg px-2.5 py-2 outline-none focus:ring-1 focus:ring-indigo-400 text-gray-800 dark:text-gray-100 placeholder-gray-400"
              />
            )}
          </div>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={handleAdd}
            disabled={isLoading || isAdding}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-all whitespace-nowrap"
          >
            {bookIcon}
            {isAdding ? "Adding..." : "Add to Vocabulary"}
          </button>
        </div>
      </div>
    );
  }

  // Desktop: float above selected text
  const clampedX = Math.max(106, Math.min(popup.x, window.innerWidth - 106));

  return (
    <div
      className="fixed z-[100] -translate-x-1/2 -translate-y-full pointer-events-none"
      style={{ left: clampedX, top: popup.y }}
    >
      <div
        ref={popupContainerRef}
        className="relative bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl p-2.5 flex flex-col gap-2 w-52 pointer-events-auto"
      >
        {isLoading ? (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-500 px-1 py-1">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span>Translating...</span>
          </div>
        ) : (
          <input
            value={translation}
            onChange={e => setTranslation(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
            placeholder="Translation..."
            className="w-full text-xs bg-gray-50 dark:bg-zinc-700/60 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-400 text-gray-800 dark:text-gray-100 placeholder-gray-400"
          />
        )}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={handleAdd}
          disabled={isLoading || isAdding}
          className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-all whitespace-nowrap"
        >
          {bookIcon}
          {isAdding ? "Adding..." : "Add to Vocabulary"}
        </button>
        {/* Triangle pointer — rotated square spanning bottom border of card */}
        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-white dark:bg-zinc-800 border-r border-b border-gray-200 dark:border-zinc-700 rotate-45" />
      </div>
    </div>
  );
}
