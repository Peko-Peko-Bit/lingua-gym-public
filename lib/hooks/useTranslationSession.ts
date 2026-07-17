"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Segment, LanguageCode, InputMode, Session, SessionSummary, VocabularyEntry, ClozeMetadata } from "@/types";
import { apiFetch } from "@/lib/api-fetch";
import {
  getAllSessions,
  getSession,
  saveSession,
  deleteSession as deleteStoredSession,
  pinSession,
  renameSession,
  generateSessionId,
  generateSessionTitle,
} from "@/lib/storage";
import { getAllVocabulary, addVocabularyEntry, updateVocabularyNormalized } from "@/lib/vocabulary";

// Sidebar order: pinned first, then newest first
function sortSummaries(list: SessionSummary[]): SessionSummary[] {
  return [...list].sort((a, b) => {
    if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
    return (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt);
  });
}

export function useTranslationSession() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [sourceText, setSourceText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("comprehension");

  const [sourceLang, setSourceLangState] = useState<LanguageCode>(() =>
    (typeof window !== "undefined" ? (localStorage.getItem("sourceLang") as LanguageCode | null) : null) ?? "es"
  );
  const setSourceLang = (lang: LanguageCode) => {
    localStorage.setItem("sourceLang", lang);
    setSourceLangState(lang);
  };
  const [targetLang, setTargetLangState] = useState<LanguageCode>(() =>
    (typeof window !== "undefined" ? (localStorage.getItem("targetLang") as LanguageCode | null) : null) ?? "en"
  );
  const setTargetLang = (lang: LanguageCode) => {
    localStorage.setItem("targetLang", lang);
    setTargetLangState(lang);
  };

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  const [vocabularyEntries, setVocabularyEntries] = useState<VocabularyEntry[]>([]);
  // Prevents autosave from firing on initial data load (nothing changed yet)
  const [aiGeneratedTitle, setAiGeneratedTitle] = useState<string | null>(null);
  const hasUserEditedRef = useRef(false);
  // When a session is manually renamed, preserve that title over auto-generated one
  // (描画中に参照するため ref ではなく state で持つ)
  const [customTitle, setCustomTitle] = useState<string | null>(null);

  // Load sessions and vocabulary on mount
  useEffect(() => {
    (async () => {
      setIsLoadingSessions(true);
      const [loaded, vocab] = await Promise.all([getAllSessions(), getAllVocabulary()]);
      setSessions(loaded);
      setVocabularyEntries(vocab);
      setCurrentSessionId(generateSessionId());
      setIsLoadingSessions(false);
    })();
  }, []);

  // Autosave: debounce saving on state changes
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerAutosave = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      if (!currentSessionId) return;
      const session: Session = {
        id: currentSessionId,
        title: customTitle ?? aiGeneratedTitle ?? generateSessionTitle(sourceText),
        sourceLang,
        targetLang,
        segments,
        sourceText,
        inputMode,
        updatedAt: Date.now(),
      };
      await saveSession(session);
      // Update the sidebar list locally instead of re-fetching everything
      // (autosave fires on every typing pause; a full refetch is too heavy)
      setSessions(prev => {
        const existing = prev.find(s => s.id === session.id);
        const summary: SessionSummary = {
          id: session.id,
          title: session.title,
          sourceLang: session.sourceLang,
          targetLang: session.targetLang,
          inputMode: session.inputMode,
          updatedAt: session.updatedAt,
          createdAt: existing?.createdAt ?? Date.now(),
          isPinned: existing?.isPinned ?? false,
          segmentCount: session.segments.length,
          checkedCount: session.segments.filter(s => s.status !== "neutral").length,
          hasSpeakers: session.segments.some(s => s.speakerLabel),
        };
        return sortSummaries([...prev.filter(s => s.id !== session.id), summary]);
      });
    }, 800);
  }, [currentSessionId, sourceText, sourceLang, targetLang, segments, inputMode, aiGeneratedTitle, customTitle]);

  useEffect(() => {
    if (!hasUserEditedRef.current) return;
    if (sourceText.trim() || segments.length > 0) {
      triggerAutosave();
    }
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [sourceText, segments, sourceLang, targetLang, triggerAutosave]);

  const loadSession = (session: Session) => {
    hasUserEditedRef.current = false;
    setCustomTitle(null);
    setAiGeneratedTitle(null);
    setCurrentSessionId(session.id);
    setSourceText(session.sourceText);
    setSegments(session.segments);
    setSourceLang(session.sourceLang);
    setTargetLang(session.targetLang);
    const savedMode = (session.inputMode as string) ?? "comprehension";
    setInputMode(savedMode === "text" ? "comprehension" : savedMode as InputMode);
  };

  const handleNewSession = async () => {
    if (currentSessionId && (sourceText.trim() || segments.length > 0)) {
      await saveSession({
        id: currentSessionId,
        title: customTitle ?? generateSessionTitle(sourceText),
        sourceLang,
        targetLang,
        segments,
        sourceText,
        inputMode,
        updatedAt: Date.now(),
      });
    }
    const newId = generateSessionId();
    setCurrentSessionId(newId);
    setSourceText("");
    setSegments([]);
    setInputMode("comprehension");
    setCustomTitle(null);
    setAiGeneratedTitle(null);
    setSessions(await getAllSessions());
  };

  const handleSwitchSourceLang = async (newLang: LanguageCode): Promise<boolean> => {
    if (newLang === sourceLang) return false;
    const hadContent = Boolean(sourceText.trim() || segments.length > 0);
    if (hadContent) {
      await handleNewSession();
    }
    setSourceLang(newLang);
    return hadContent;
  };

  const handleSwitchTargetLang = (newLang: LanguageCode) => {
    if (newLang === targetLang) return;
    setTargetLang(newLang);
  };

  const handleSelectSession = async (id: string) => {
    if (currentSessionId && (sourceText.trim() || segments.length > 0)) {
      await saveSession({
        id: currentSessionId,
        title: customTitle ?? generateSessionTitle(sourceText),
        sourceLang,
        targetLang,
        segments,
        sourceText,
        inputMode,
        updatedAt: Date.now(),
      });
    }
    const target = await getSession(id);
    if (target) loadSession(target);
    setSessions(await getAllSessions());
  };

  const handlePinSession = async (id: string, isPinned: boolean) => {
    // Optimistic update: toggle pin and re-sort locally
    setSessions(prev => sortSummaries(prev.map(s => s.id === id ? { ...s, isPinned } : s)));
    await pinSession(id, isPinned);
  };

  const handleRenameSession = async (id: string, title: string) => {
    // Optimistic update
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
    if (id === currentSessionId) {
      setCustomTitle(title);
      setAiGeneratedTitle(null);
    }
    await renameSession(id, title);
  };

  const currentSessionTitle =
    customTitle
    ?? aiGeneratedTitle
    ?? sessions.find(s => s.id === currentSessionId)?.title
    ?? generateSessionTitle(sourceText);

  const handleAddVocabulary = async (term: string, translation: string) => {
    const entry = await addVocabularyEntry({
      term,
      translation,
      sourceLang,
      targetLang,
      sessionId: currentSessionId ?? undefined,
      sessionTitle: currentSessionTitle,
    });
    if (!entry) return;

    setVocabularyEntries(prev => [entry, ...prev]);

    const isPhrase = term.trim().split(/\s+/).length >= 2;

    (async () => {
      try {
        if (isPhrase) {
          await updateVocabularyNormalized(entry.id, term.trim(), null, translation, "phrase");
          setVocabularyEntries(prev =>
            prev.map(e => e.id === entry.id ? { ...e, type: "phrase" } : e)
          );
          return;
        }

        const normalizeRes = await apiFetch("/api/word-normalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ term, sourceLang }),
        });
        if (!normalizeRes.ok) return;
        const { baseTerm, type: vocabType, partOfSpeech } = await normalizeRes.json() as {
          baseTerm: string;
          type: "word" | "phrase";
          partOfSpeech: string | null;
        };
        if (!baseTerm) return;

        let finalTranslation = translation;
        if (baseTerm !== term) {
          const translateRes = await apiFetch("/api/word-translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ term: baseTerm, sourceLang, targetLang }),
          });
          if (translateRes.ok) {
            const { translation: baseTranslation } = await translateRes.json() as { translation: string };
            if (baseTranslation) finalTranslation = baseTranslation;
          }
        }

        await updateVocabularyNormalized(entry.id, baseTerm, partOfSpeech ?? null, finalTranslation, vocabType ?? "word");
        setVocabularyEntries(prev =>
          prev.map(e =>
            e.id === entry.id
              ? { ...e, term: baseTerm, translation: finalTranslation, type: vocabType ?? "word", partOfSpeech: partOfSpeech ?? undefined }
              : e
          )
        );
      } catch {
        // Normalization failure is non-critical — original term stays
      }
    })();
  };

  const handleDeleteVocabulary = (id: string) => {
    setVocabularyEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleDeleteSession = async (id: string) => {
    await deleteStoredSession(id);
    const updated = await getAllSessions();
    setSessions(updated);

    if (id === currentSessionId) {
      // The list only holds summaries — fetch the full session before loading
      const next = updated.length > 0 ? await getSession(updated[0].id) : undefined;
      if (next) {
        loadSession(next);
      } else {
        setCurrentSessionId(generateSessionId());
        setSourceText("");
        setSegments([]);
      }
    }
  };

  const handleProcessSource = async () => {
    if (!sourceText.trim()) return;

    const isPhrasing = inputMode === "phrasing";
    const effectiveSourceLang = isPhrasing ? targetLang : sourceLang;
    const effectiveTargetLang = isPhrasing ? sourceLang : targetLang;

    setIsProcessing(true);
    try {
      const response = await apiFetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText, sourceLang: effectiveSourceLang, targetLang: effectiveTargetLang }),
      });

      if (!response.ok) throw new Error("Failed to process text");

      const data = await response.json();

      let remainingText = sourceText;
      const newSegments: Segment[] = data.map(
        (item: { sourceText: string; referenceTranslation: string }) => {
          const textToFind = item.sourceText.trim();
          let exactSourceText = item.sourceText;

          if (textToFind.length > 0) {
            const index = remainingText.indexOf(textToFind);
            if (index !== -1) {
              exactSourceText = remainingText.substring(0, index + textToFind.length);
              remainingText = remainingText.substring(index + textToFind.length);
            }
          }

          // Skit発話者名を分離（[[Elena]]: 形式のみ対象、誤検出を防ぐ）
          const leadingWS = exactSourceText.match(/^\s*/)?.[0] ?? "";
          const speakerMatch = exactSourceText.trim().match(/^\[\[([^\]]+)\]\]:\s*([\s\S]+)$/);
          const speakerLabel = speakerMatch ? speakerMatch[1].trim() : undefined;
          const cleanSource = speakerMatch ? leadingWS + speakerMatch[2].trim() : exactSourceText;

          const refMatch = item.referenceTranslation.trim().match(/^\[\[([^\]]+)\]\]:\s*([\s\S]+)$/);
          const cleanRef = refMatch ? refMatch[2].trim() : item.referenceTranslation;

          return {
            id: `seg-${crypto.randomUUID()}`,
            sourceText: cleanSource,
            speakerLabel,
            userTranslation: "",
            referenceTranslation: cleanRef,
            status: "neutral",
          };
        }
      );

      if (remainingText.length > 0 && newSegments.length > 0) {
        newSegments[newSegments.length - 1].sourceText += remainingText;
      }

      setSegments(newSegments);
      hasUserEditedRef.current = true;

      if (inputMode === "dictation") {
        await generateClozeForSegments(newSegments);
      }

      // Fire title generation non-blocking (only if user hasn't manually renamed)
      if (!customTitle) {
        setAiGeneratedTitle(null);
        apiFetch("/api/generate-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sourceText.slice(0, 400), titleLang: sourceLang }),
        })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data?.title) setAiGeneratedTitle(data.title);
          })
          .catch(() => {/* title generation failure is non-critical */});
      }
    } catch (error) {
      console.error("Error processing source:", error);
      alert("Failed to process text. Please check your API key.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSourceChange = (text: string) => {
    hasUserEditedRef.current = true;
    setSourceText(text);
    if (text === "") {
      setSegments([]);
      setInputMode("comprehension");
    }
  };

  const updateSegmentTranslation = (id: string, text: string) => {
    hasUserEditedRef.current = true;
    setSegments(prev => prev.map(s => s.id === id ? { ...s, userTranslation: text } : s));
  };

  const resetCheckResults = () => {
    hasUserEditedRef.current = true;
    setSegments(prev => prev.map(s => ({
      ...s,
      status: "neutral" as const,
      reason: undefined,
      advice: undefined,
    })));
  };

  const handleCheckSegment = async (id: string) => {
    const segment = segments.find(s => s.id === id);
    if (!segment || !segment.userTranslation.trim() || segment.isChecking) return;

    setSegments(prev => prev.map(s => s.id === id ? { ...s, isChecking: true } : s));

    try {
      const isPhrasing = inputMode === "phrasing";
      const response = await apiFetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText:           isPhrasing ? segment.referenceTranslation : segment.sourceText,
          referenceTranslation: isPhrasing ? segment.sourceText : segment.referenceTranslation,
          userTranslation:      segment.userTranslation,
          sourceLang: isPhrasing ? targetLang : sourceLang,
          targetLang: isPhrasing ? sourceLang : targetLang,
          inputMode,
        }),
      });

      if (!response.ok) throw new Error("Evaluation failed");

      const result = await response.json();

      hasUserEditedRef.current = true;
      const now = new Date().toISOString();
      setSegments(prev =>
        prev.map(s =>
          s.id === id
            ? {
                ...s,
                status: result.status,
                reason: result.reason,
                advice: result.suggestion,
                isChecking: false,
                checked_at: s.checked_at ?? now,
              }
            : s
        )
      );
    } catch (error) {
      console.error("Evaluation error:", error);
      setSegments(prev => prev.map(s => s.id === id ? { ...s, isChecking: false } : s));
    }
  };

  // Dictation モード離脱時にクライアント state をリセット
  const prevInputModeRef = useRef(inputMode);
  useEffect(() => {
    if (prevInputModeRef.current === "dictation" && inputMode !== "dictation") {
      setSegments(prev => prev.map(s => ({
        ...s,
        dictation_inputs: undefined,
        dictation_results: undefined,
        dictation_overall_advice: undefined,
      })));
    }
    prevInputModeRef.current = inputMode;
  }, [inputMode]);

  const generateClozeForSegments = async (segs: Segment[]) => {
    const unprepared = segs.filter(s => !s.cloze_metadata);
    if (unprepared.length === 0) return;

    try {
      const response = await apiFetch("/api/generate-cloze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: unprepared.map(s => ({ id: s.id, source_text: s.sourceText })),
          source_lang: sourceLang,
          target_lang: targetLang,
        }),
      });
      if (!response.ok) throw new Error("Failed to generate cloze");

      const data = await response.json() as { results: { id: string; cloze_metadata: ClozeMetadata }[] };

      hasUserEditedRef.current = true;
      setSegments(prev => prev.map(s => {
        const found = data.results.find(r => r.id === s.id);
        return found ? { ...s, cloze_metadata: found.cloze_metadata } : s;
      }));
    } catch (error) {
      console.error("Failed to generate cloze:", error);
    }
  };

  const enableDictationMode = async () => {
    setInputMode("dictation");
    await generateClozeForSegments(segments);
  };

  const updateDictationInput = (segmentId: string, holeIndex: number, value: string) => {
    setSegments(prev => prev.map(s => {
      if (s.id !== segmentId) return s;
      const inputs = [...(s.dictation_inputs ?? [])];
      inputs[holeIndex] = value;
      return { ...s, dictation_inputs: inputs };
    }));
  };

  const checkDictation = async (segmentId: string) => {
    const segment = segments.find(s => s.id === segmentId);
    if (!segment?.cloze_metadata || segment.isChecking) return;

    const inputs = segment.dictation_inputs ?? [];
    const hasAnyInput = segment.cloze_metadata.targets.some(t => (inputs[t.index] ?? "").trim());
    if (!hasAnyInput) return;

    setSegments(prev => prev.map(s => s.id === segmentId ? { ...s, isChecking: true } : s));

    try {
      const targets = segment.cloze_metadata!.targets.map(t => ({
        index: t.index,
        answer: t.answer,
        user_input: inputs[t.index] ?? "",
      }));

      const response = await apiFetch("/api/check-dictation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_text: segment.sourceText,
          targets,
          source_lang: sourceLang,
          target_lang: targetLang,
        }),
      });
      if (!response.ok) throw new Error("Dictation check failed");

      const result = await response.json() as {
        results: Segment["dictation_results"];
        overall_advice: string;
      };

      const statuses = (result.results ?? []).map((r: { status: string }) => r.status);
      const overallStatus: "green" | "yellow" | "red" =
        statuses.every((st: string) => st === "green") ? "green" :
        statuses.some((st: string) => st === "red")    ? "red"   : "yellow";
      const now = new Date().toISOString();

      hasUserEditedRef.current = true;
      setSegments(prev => prev.map(s => s.id === segmentId ? {
        ...s,
        isChecking: false,
        status: overallStatus,
        checked_at: s.checked_at ?? now,
        dictation_results: result.results,
        dictation_overall_advice: result.overall_advice,
      } : s));
    } catch (error) {
      console.error("Dictation check error:", error);
      setSegments(prev => prev.map(s => s.id === segmentId ? { ...s, isChecking: false } : s));
    }
  };

  const handleCheckAll = async () => {
    const unchecked = segments.filter(
      s => s.userTranslation.trim().length > 0 && s.status === "neutral" && !s.isChecking
    );
    if (unchecked.length === 0) return;
    await Promise.all(unchecked.map(s => handleCheckSegment(s.id)));
  };

  return {
    // State
    segments,
    sourceText,
    isProcessing,
    inputMode,
    setInputMode,
    sourceLang,
    setSourceLang,
    targetLang,
    setTargetLang,
    currentSessionId,
    sessions,
    isLoadingSessions,
    vocabularyEntries,
    currentSessionTitle,
    // Handlers
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
    resetCheckResults,
    // Dictation mode
    enableDictationMode,
    updateDictationInput,
    checkDictation,
  };
}
