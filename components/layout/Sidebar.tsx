"use client";

import React, { useState, useEffect, useRef } from "react";
import { SessionSummary, VocabularyEntry, LanguageCode } from "@/types";
import { Plus, X, MoreVertical, Pin, PinOff, Pencil, Trash2, BookOpen, History, Headphones, PenLine, Languages, Check } from "lucide-react";
import { AppNav } from "@/components/shared/AppNav";
import { UserAuthSection } from "@/components/auth/UserAuthSection";
import VocabularyPanel from "@/components/vocabulary/VocabularyPanel";
import { LANGUAGE_FLAG_MAP } from "@/lib/flags";

type SidebarTab = "sessions" | "vocabulary";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  openToTab?: SidebarTab;
  sessions: SessionSummary[];
  currentSessionId: string | null;
  sourceLang: LanguageCode;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onPinSession: (id: string, isPinned: boolean) => void;
  onRenameSession: (id: string, title: string) => void;
  isLoading?: boolean;
  // Vocabulary
  vocabularyEntries: VocabularyEntry[];
  onDeleteVocabulary: (id: string) => void;
}

type MenuState = { id: string; top: number; right: number } | null;

export default function Sidebar({
  isOpen,
  onClose,
  openToTab,
  sessions,
  currentSessionId,
  sourceLang,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onPinSession,
  onRenameSession,
  isLoading = false,
  vocabularyEntries,
  onDeleteVocabulary,
}: SidebarProps) {
  const filteredSessions = sessions.filter(s => s.sourceLang === sourceLang);
  const filteredVocabulary = vocabularyEntries.filter(e => e.sourceLang === sourceLang);
  const [activeTab, setActiveTab] = useState<SidebarTab>("sessions");
  const [menuState, setMenuState] = useState<MenuState>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Switch to requested tab when sidebar opens (描画中の state 調整パターン)
  const [prevOpenState, setPrevOpenState] = useState({ isOpen, openToTab });
  if (prevOpenState.isOpen !== isOpen || prevOpenState.openToTab !== openToTab) {
    setPrevOpenState({ isOpen, openToTab });
    if (isOpen && openToTab) setActiveTab(openToTab);
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
  };

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  // メニュー外クリックで閉じる。Next.js は React のイベントを document に付けるため、
  // メニュー内の stopPropagation ではこのリスナーを止められない(同一ノード上のリスナー同士は
  // stopPropagation の対象外)。そのためハンドラ側でクリック位置を判定して無視する。
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuState) return;
    const handler = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (menuRef.current?.contains(target as Node)) return;      // メニュー内のクリック
      if (target?.closest("[data-menu-trigger]")) return;         // 別セッションの ⋮(メニュー切替)
      setMenuState(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuState]);

  // Reset delete confirmation whenever the menu opens on another session or closes
  // (描画中の state 調整パターン)
  const [prevMenuId, setPrevMenuId] = useState(menuState?.id);
  if (prevMenuId !== menuState?.id) {
    setPrevMenuId(menuState?.id);
    setConfirmingDelete(false);
  }

  const handleMenuOpen = (e: React.MouseEvent<HTMLButtonElement>, sessionId: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 148;
    const spaceBelow = window.innerHeight - rect.bottom;
    setMenuState({
      id: sessionId,
      top: spaceBelow >= menuHeight ? rect.bottom + 4 : rect.top - menuHeight - 4,
      right: window.innerWidth - rect.right,
    });
  };

  const handlePin = (id: string, currentlyPinned: boolean) => {
    onPinSession(id, !currentlyPinned);
    setMenuState(null);
  };

  const handleRenameStart = (id: string, currentTitle: string) => {
    setMenuState(null);
    setRenamingId(id);
    setRenameValue(currentTitle);
  };

  const handleRenameCommit = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) onRenameSession(id, trimmed);
    setRenamingId(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") handleRenameCommit(id);
    if (e.key === "Escape") setRenamingId(null);
  };

  const handleDelete = (id: string) => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    onDeleteSession(id);
    setMenuState(null);
  };

  const menuSession = menuState ? filteredSessions.find(s => s.id === menuState.id) : null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-80 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-r border-gray-200 dark:border-zinc-800 shadow-2xl z-40 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-100 dark:border-zinc-800">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              LinguaGym
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Tabs */}
          <div className="flex px-3 pb-1 gap-1">
            <button
              onClick={() => setActiveTab("sessions")}
              className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "sessions"
                  ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                  : "text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Sessions
            </button>
            <button
              onClick={() => setActiveTab("vocabulary")}
              className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "vocabulary"
                  ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                  : "text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Vocabulary
              {filteredVocabulary.length > 0 && (
                <span className="ml-0.5 px-1 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded text-[10px] leading-none">
                  {filteredVocabulary.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Sessions tab ── */}
        {activeTab === "sessions" && (
          <div className="p-4 flex-shrink-0">
            <button
              onClick={() => { onNewSession(); onClose(); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              New Session
            </button>
          </div>
        )}

        {/* ── Vocabulary tab ── */}
        {activeTab === "vocabulary" && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <VocabularyPanel entries={filteredVocabulary} onDelete={onDeleteVocabulary} />
          </div>
        )}

        {/* ── Settings tab ── */}
        {/* Session List */}
        {activeTab === "sessions" && (
          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1.5">
            {isLoading ? (
              <div className="text-center py-12 text-gray-400 dark:text-zinc-600">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs">Loading sessions…</p>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-12 text-gray-400 dark:text-zinc-600">
                <p className="text-sm">No sessions yet.</p>
                <p className="text-xs mt-1">Start translating to create one.</p>
              </div>
            ) : (
              filteredSessions.map((session) => {
                const isActive = session.id === currentSessionId;
                const isMenuOpen = menuState?.id === session.id;
                const isRenaming = renamingId === session.id;
                const checkedCount = session.checkedCount;
                const segCount = session.segmentCount;
                const isSkit = session.hasSpeakers;
                const sourceTypeLabel =
                  session.inputMode === "media" ? "OCR" :
                  isSkit                        ? "Skit" :
                  "Text";
                const PracticeModeIcon =
                  session.inputMode === "listening" ? Headphones :
                  session.inputMode === "dictation" ? PenLine :
                  Languages;
                const practiceModeLabel =
                  session.inputMode === "listening" ? "Listening" :
                  session.inputMode === "dictation" ? "Dictation" :
                  "Translation";
                const ringRadius = 7;
                const ringCircumference = 2 * Math.PI * ringRadius;
                const ringProgress = segCount > 0 ? checkedCount / segCount : 0;
                const ringOffset = ringCircumference * (1 - ringProgress);
                const isComplete = segCount > 0 && checkedCount === segCount;

                return (
                  <div
                    key={session.id}
                    onClick={() => {
                      if (isRenaming) return;
                      onSelectSession(session.id);
                      onClose();
                    }}
                    className={`group relative flex flex-col gap-1 p-3 rounded-xl cursor-pointer transition-all ${
                      isActive
                        ? "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 shadow-sm"
                        : "hover:bg-gray-50 dark:hover:bg-zinc-800/50 border border-transparent"
                    }`}
                  >
                    {session.isPinned && (
                      <Pin className="absolute top-2.5 left-2.5 w-3 h-3 text-indigo-400 dark:text-indigo-500 rotate-45" />
                    )}

                    <div className={`flex items-start justify-between gap-2 ${session.isPinned ? "pl-4" : ""}`}>
                      {isRenaming ? (
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => handleRenameCommit(session.id)}
                          onKeyDown={e => handleRenameKeyDown(e, session.id)}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 text-sm font-medium bg-white dark:bg-zinc-800 border border-indigo-400 rounded px-1.5 py-0.5 outline-none text-gray-800 dark:text-gray-200"
                        />
                      ) : (
                        <span className={`text-sm font-medium truncate flex-1 ${isActive ? "text-indigo-700 dark:text-indigo-300" : "text-gray-800 dark:text-gray-200"}`}>
                          {session.title || "Untitled"}
                        </span>
                      )}

                      {!isRenaming && (
                        <button
                          data-menu-trigger
                          onClick={e => handleMenuOpen(e, session.id)}
                          className={`flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all ${
                            isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
                          title="More options"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-500">
                      {/* Flag pair */}
                      <span className="flex items-center gap-1">
                        <img src={LANGUAGE_FLAG_MAP[session.sourceLang]} alt={session.sourceLang} className="h-3 w-4 object-cover rounded-sm" />
                        <span>→</span>
                        <img src={LANGUAGE_FLAG_MAP[session.targetLang]} alt={session.targetLang} className="h-3 w-4 object-cover rounded-sm" />
                      </span>
                      <span>·</span>
                      {/* Source type + practice mode chip */}
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400" title={`${sourceTypeLabel} · ${practiceModeLabel}`}>
                        {sourceTypeLabel}
                        <PracticeModeIcon className="w-3 h-3" />
                      </span>
                      <span>·</span>
                      {/* Progress ring */}
                      <span className="relative flex-shrink-0 w-5 h-5" title={`${checkedCount}/${segCount} checked`}>
                        <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
                          <circle cx="10" cy="10" r={ringRadius} fill="none" strokeWidth="2.5" className="stroke-gray-200 dark:stroke-zinc-700" />
                          {segCount > 0 && (
                            <circle
                              cx="10" cy="10" r={ringRadius} fill="none" strokeWidth="2.5"
                              strokeDasharray={ringCircumference}
                              strokeDashoffset={ringOffset}
                              strokeLinecap="round"
                              className={isComplete ? "stroke-green-500" : "stroke-indigo-400"}
                            />
                          )}
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Check className={`w-2.5 h-2.5 ${isComplete ? "text-green-500" : "text-gray-300 dark:text-zinc-600"}`} />
                        </span>
                      </span>
                      <span>·</span>
                      <span>{formatDate(session.createdAt ?? session.updatedAt)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Bottom nav links */}
        <div className="flex-shrink-0 border-t border-gray-100 dark:border-zinc-800 px-4 pt-3 pb-2">
          <div className="mb-3">
            <UserAuthSection />
          </div>
          <AppNav />
        </div>
      </div>

      {/* Dropdown Menu */}
      {menuState && menuSession && (
        <div
          style={{ top: menuState.top, right: menuState.right }}
          className="fixed z-[60] w-44 py-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl"
          ref={menuRef}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => handlePin(menuSession.id, !!menuSession.isPinned)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700/60 transition-colors"
          >
            {menuSession.isPinned
              ? <PinOff className="w-4 h-4 text-gray-400" />
              : <Pin className="w-4 h-4 text-gray-400 rotate-45" />
            }
            {menuSession.isPinned ? "Unpin" : "Pin"}
          </button>

          <button
            onClick={() => handleRenameStart(menuSession.id, menuSession.title)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700/60 transition-colors"
          >
            <Pencil className="w-4 h-4 text-gray-400" />
            Rename
          </button>

          <div className="my-1 border-t border-gray-100 dark:border-zinc-700" />

          <button
            onClick={() => handleDelete(menuSession.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
              confirmingDelete
                ? "text-white bg-red-500 hover:bg-red-600 font-semibold"
                : "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {confirmingDelete ? "Confirm delete" : "Delete"}
          </button>
        </div>
      )}
    </>
  );
}
