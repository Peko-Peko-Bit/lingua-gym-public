"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import SourcePanel from "../editor/SourcePanel";
import TranslationPanel from "../editor/TranslationPanel";
import Sidebar from "./Sidebar";
import MobileSettingsSheet from "./MobileSettingsSheet";
import { LanguageCode, SUPPORTED_LANGUAGES } from "@/types";
import { useTranslationSession } from "@/lib/hooks/useTranslationSession";
import { useTheme } from "@/lib/hooks/useTheme";
import { LANGUAGE_FLAG_MAP } from "@/lib/flags";
import { Menu, Settings, ChevronDown, Headphones, PenLine, Sparkles } from "lucide-react";
import SelectionPopup from "@/components/editor/SelectionPopup";
import { InputMode } from "@/types";
import { useUser } from "@/hooks/useUser";

type ViewMode = "source" | "translation";
type SidebarTab = "sessions" | "vocabulary";

export default function MainEditor() {
  const {
    segments,
    sourceText,
    isProcessing,
    inputMode, setInputMode,
    sourceLang,
    targetLang, setTargetLang,
    currentSessionId,
    sessions,
    isLoadingSessions,
    vocabularyEntries,
    currentSessionTitle,
    handleNewSession,
    handleSelectSession,
    handlePinSession,
    handleRenameSession,
    handleAddVocabulary,
    handleDeleteVocabulary,
    handleDeleteSession,
    handleSwitchSourceLang,
    handleSwitchTargetLang,
    handleProcessSource,
    handleSourceChange,
    updateSegmentTranslation,
    handleCheckSegment,
    handleCheckAll,
    enableDictationMode,
    updateDictationInput,
    checkDictation,
  } = useTranslationSession();

  useTheme(sourceLang);

  // Guests are seeded with demo sessions on entry (lib/guest-seed.ts), so say
  // so rather than letting the practice history read as someone's real work.
  const { user } = useUser();
  const isGuest = user?.is_anonymous === true;

  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const mobileLangDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!langDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const inDesktop = langDropdownRef.current?.contains(e.target as Node);
      const inMobile  = mobileLangDropdownRef.current?.contains(e.target as Node);
      if (!inDesktop && !inMobile) setLangDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [langDropdownOpen]);

  const handleCheckTranslation = useCallback(
    (id: string) => handleCheckSegment(id),
    [handleCheckSegment]
  );

  const handleCheckAllWithMode = useCallback(
    () => handleCheckAll(),
    [handleCheckAll]
  );

  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarOpenTab] = useState<SidebarTab | undefined>(undefined);
  const [viewMode, setViewMode] = useState<ViewMode>("source");
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const handler = () => {
      setIsKeyboardOpen(viewport.height < window.innerHeight * 0.75);
    };
    viewport.addEventListener("resize", handler);
    return () => viewport.removeEventListener("resize", handler);
  }, []);

  const canProcess = !isProcessing && sourceText.trim().length > 0;
  const canCheckAll =
    segments.length > 0 &&
    segments.some(s => s.userTranslation.trim().length > 0 && s.status === "neutral" && !s.isChecking);

  const translationPanelProps = {
    targetLang,
    onCheckTranslation: handleCheckTranslation,
  };

  const handleSetInputMode = useCallback(
    (mode: InputMode) => mode === "dictation" ? enableDictationMode() : setInputMode(mode),
    [enableDictationMode, setInputMode]
  );

  const handleNewSessionWithPanel = async () => {
    await handleNewSession();
    setViewMode("source");
  };

  const handleSwitchSourceLangWithPanel = async (newLang: LanguageCode) => {
    const newSessionCreated = await handleSwitchSourceLang(newLang);
    if (newSessionCreated) setViewMode("source");
  };

  const openSettings = () => setMobileSettingsOpen(true);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-gray-100">

      {/* ──────────────────────────────────────
          Fixed hamburger — desktop only
      ────────────────────────────────────── */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="hidden md:flex fixed top-4 left-4 z-50 p-2 rounded-lg bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-gray-200/50 dark:border-zinc-700/50 shadow-lg hover:shadow-xl text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
        title="Toggle session menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ──────────────────────────────────────
          Sidebar — shared mobile / desktop
      ────────────────────────────────────── */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        openToTab={sidebarOpenTab}
        sessions={sessions}
        currentSessionId={currentSessionId}
        sourceLang={sourceLang}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSessionWithPanel}
        onDeleteSession={handleDeleteSession}
        onPinSession={handlePinSession}
        onRenameSession={handleRenameSession}
        isLoading={isLoadingSessions}
        vocabularyEntries={vocabularyEntries}
        onDeleteVocabulary={handleDeleteVocabulary}
      />

      {/* ──────────────────────────────────────
          Mobile settings bottom sheet
      ────────────────────────────────────── */}
      <MobileSettingsSheet
        isOpen={mobileSettingsOpen}
        onClose={() => setMobileSettingsOpen(false)}
        inputMode={inputMode}
        onSetInputMode={handleSetInputMode}
        disableListeningDictation={inputMode === "phrasing"}
      />

      {/* ──────────────────────────────────────
          Selection popup — global
      ────────────────────────────────────── */}
      <SelectionPopup
        sourceLang={sourceLang}
        targetLang={targetLang}
        sessionId={currentSessionId}
        sessionTitle={currentSessionTitle}
        onAdd={handleAddVocabulary}
      />

      {/* ══════════════════════════════════════
          MOBILE HEADER  (< md)
      ══════════════════════════════════════ */}
      <header className="flex md:hidden items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 shadow-sm z-10 flex-shrink-0">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all"
          title="Toggle session menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <img src="/linguagym_icon.svg" alt="LinguaGym" className="w-7 h-7 rounded-lg" />
          <h1 className="text-lg font-bold tracking-tight">LinguaGym</h1>
          {/* Mobile study language dropdown — shares langDropdownOpen with desktop */}
          <div ref={mobileLangDropdownRef} className="relative ml-1">
            <button
              onClick={() => setLangDropdownOpen(v => !v)}
              className="flex items-center gap-1 px-1.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all"
            >
              <img src={LANGUAGE_FLAG_MAP[sourceLang]} alt={sourceLang} className="h-4 w-6 object-cover rounded-sm" />
              <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${langDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {langDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-44 z-50 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl py-1.5">
                {(Object.entries(SUPPORTED_LANGUAGES) as [LanguageCode, string][]).map(([code, name]) => (
                  <button
                    key={code}
                    onClick={() => { void handleSwitchSourceLangWithPanel(code); setLangDropdownOpen(false); }}
                    className={`w-full px-3 py-2 text-left flex items-center gap-2.5 text-sm transition-colors ${
                      sourceLang === code
                        ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
                        : "text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <img src={LANGUAGE_FLAG_MAP[code]} alt={code} className="h-3.5 w-5 object-cover rounded-sm flex-shrink-0" />
                    <span>{name}</span>
                    {sourceLang === code && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={openSettings}
          className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {/* ══════════════════════════════════════
          DESKTOP HEADER  (≥ md)
      ══════════════════════════════════════ */}
      <header className="hidden md:flex items-center justify-between pl-16 pr-6 py-3 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 shadow-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <img src="/linguagym_icon.svg" alt="LinguaGym" className="w-8 h-8 rounded-lg" />
            <div className="absolute -bottom-0.5 -right-0.5 w-[16px] h-[16px] rounded-full overflow-hidden border-2 border-white dark:border-zinc-900">
              <img src={LANGUAGE_FLAG_MAP[sourceLang]} alt={sourceLang} className="w-full h-full object-cover" />
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight">LinguaGym</h1>

          {/* Study language flag dropdown */}
          <div ref={langDropdownRef} className="relative ml-1">
            <button
              onClick={() => setLangDropdownOpen(v => !v)}
              className="flex items-center gap-1 px-1.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all"
            >
              <img src={LANGUAGE_FLAG_MAP[sourceLang]} alt={sourceLang} className="h-4 w-6 object-cover rounded-sm" />
              <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${langDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {langDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-44 z-50 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl py-1.5">
                {(Object.entries(SUPPORTED_LANGUAGES) as [LanguageCode, string][]).map(([code, name]) => (
                  <button
                    key={code}
                    onClick={() => { void handleSwitchSourceLangWithPanel(code); setLangDropdownOpen(false); }}
                    className={`w-full px-3 py-2 text-left flex items-center gap-2.5 text-sm transition-colors ${
                      sourceLang === code
                        ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
                        : "text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <img src={LANGUAGE_FLAG_MAP[code]} alt={code} className="h-3.5 w-5 object-cover rounded-sm flex-shrink-0" />
                    <span>{name}</span>
                    {sourceLang === code && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Input mode segmented control */}
          {(() => {
            const disableLD = inputMode === "phrasing";
            const modeBtn = (id: InputMode, label: string, icon?: React.ReactNode) => {
              const isDisabled = disableLD && (id === "listening" || id === "dictation");
              const isActive = inputMode === id;
              return (
                <button
                  key={id}
                  disabled={isDisabled}
                  onClick={() => id === "dictation" ? enableDictationMode() : setInputMode(id)}
                  title={isDisabled ? "Listening/Dictation is not available in Phrasing drill" : undefined}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    isDisabled
                      ? "text-gray-300 dark:text-zinc-600 cursor-not-allowed"
                      : isActive
                        ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                        : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300"
                  }`}
                >
                  {icon}
                  {label}
                </button>
              );
            };
            return (
              <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5">
                {modeBtn("comprehension", "Comprehension")}
                {modeBtn("phrasing", "Phrasing")}
                <div className="w-px bg-gray-300 dark:bg-zinc-600 my-0.5 mx-0.5" />
                {modeBtn("listening", "Listening", <Headphones className="w-3 h-3" />)}
                {modeBtn("dictation", "Dictation", <PenLine className="w-3 h-3" />)}
              </div>
            );
          })()}

          {/* Your language */}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-400 dark:text-zinc-500 whitespace-nowrap">Your language</span>
            <select
              value={targetLang}
              onChange={e => handleSwitchTargetLang(e.target.value as LanguageCode)}
              className="px-2 py-1 rounded-md bg-gray-100 dark:bg-zinc-800 text-xs font-medium border-0 outline-none cursor-pointer text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
            >
              {(Object.entries(SUPPORTED_LANGUAGES) as [LanguageCode, string][]).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>

          {/* Check All */}
          <button
            onClick={handleCheckAllWithMode}
            disabled={!canCheckAll}
            className="px-4 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50 disabled:cursor-not-allowed text-indigo-600 dark:text-indigo-400 text-sm font-semibold transition-all"
          >
            Check All
          </button>

          {/* Split & Translate / Re-translate */}
          <button
            onClick={() => handleProcessSource()}
            disabled={!canProcess}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              segments.length > 0
                ? "border border-indigo-400 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white shadow-md"
            }`}
          >
            {isProcessing ? (
              <>
                <div className={`w-4 h-4 border-2 rounded-full animate-spin ${segments.length > 0 ? "border-indigo-400/30 border-t-indigo-500" : "border-white/30 border-t-white"}`} />
                Processing...
              </>
            ) : segments.length > 0 ? "Re-translate" : "Split & Translate"}
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════
          GUEST SAMPLE-DATA BANNER  (all widths)
          Sits between the two headers and the content so one element covers
          both breakpoints. flex-shrink-0 is required — the root is a
          h-screen flex column and the panes below are flex-1 min-h-0.
      ══════════════════════════════════════ */}
      {isGuest && (
        <div className="flex-shrink-0 flex items-start gap-2.5 px-4 py-2.5
                        bg-indigo-50 dark:bg-indigo-950/40
                        border-b border-indigo-100 dark:border-indigo-900/60
                        text-sm text-gray-600 dark:text-zinc-300">
          <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-500 dark:text-indigo-400" />
          <p>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">Sample data</span>
            {" — guest accounts start with a demo practice history so you can explore right away."}
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════
          MOBILE TAB BAR  (< md)
      ══════════════════════════════════════ */}
      <div className="flex md:hidden flex-shrink-0 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <button
          onClick={() => setViewMode("source")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-all border-b-2 ${
            viewMode === "source"
              ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-gray-500 dark:text-zinc-400"
          }`}
        >
          Source
        </button>
        <button
          onClick={() => setViewMode("translation")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-all border-b-2 ${
            viewMode === "translation"
              ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-gray-500 dark:text-zinc-400"
          }`}
        >
          Translation
          {segments.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-full">
              {segments.length}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════
          MOBILE CONTENT  (< md)
      ══════════════════════════════════════ */}
      <div className="flex-1 flex flex-col md:hidden min-h-0">
        {viewMode === "source" ? (
          <>
            <div className="flex-1 overflow-hidden bg-white dark:bg-zinc-900">
              <SourcePanel
                sourceText={sourceText}
                onSourceChange={handleSourceChange}
                segments={segments}
                sourceLang={sourceLang}
                inputMode={inputMode}
                targetLang={targetLang}
                onSetTargetLang={setTargetLang}
                onSetInputMode={handleSetInputMode}
                disableListeningDictation={inputMode === "phrasing"}
              />
            </div>

            {/* Source tab — bottom action bar */}
            <div className="flex-shrink-0 p-3 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <button
                onClick={() => {
                  handleProcessSource();
                  setViewMode("translation");
                }}
                disabled={!canProcess}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  segments.length > 0
                    ? "border border-indigo-400 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white shadow-md"
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className={`w-4 h-4 border-2 rounded-full animate-spin ${segments.length > 0 ? "border-indigo-400/30 border-t-indigo-500" : "border-white/30 border-t-white"}`} />
                    Processing...
                  </>
                ) : segments.length > 0 ? "Re-translate" : "Split & Translate"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-zinc-950">
              <TranslationPanel
                segments={segments}
                onUpdateTranslation={updateSegmentTranslation}
                onCheckDictation={checkDictation}
                onUpdateDictationInput={updateDictationInput}
                sourceLang={sourceLang}
                inputMode={inputMode}
                {...translationPanelProps}
              />
            </div>

            {/* Translation tab — bottom action bar (hidden when keyboard is open) */}
            {!isKeyboardOpen && (
              <div className="flex-shrink-0 p-3 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <button
                  onClick={handleCheckAllWithMode}
                  disabled={!canCheckAll}
                  className="w-full py-3 rounded-xl border-2 border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-600 dark:text-indigo-400 text-sm font-semibold transition-all"
                >
                  Check All
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════
          DESKTOP CONTENT  (≥ md)
      ══════════════════════════════════════ */}
      <main className="hidden md:flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-1/2 flex border-r border-gray-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900">
          <SourcePanel
            sourceText={sourceText}
            onSourceChange={handleSourceChange}
            segments={segments}
            sourceLang={sourceLang}
            inputMode={inputMode}
            targetLang={targetLang}
            onSetTargetLang={setTargetLang}
            onSetInputMode={handleSetInputMode}
            disableListeningDictation={inputMode === "phrasing"}
          />
        </div>

        {/* Right panel */}
        <div className="w-1/2 flex overflow-hidden bg-gray-50 dark:bg-zinc-950">
          <TranslationPanel
            segments={segments}
            onUpdateTranslation={updateSegmentTranslation}
            onCheckDictation={checkDictation}
            onUpdateDictationInput={updateDictationInput}
            sourceLang={sourceLang}
            inputMode={inputMode}
            {...translationPanelProps}
          />
        </div>
      </main>
    </div>
  );
}
