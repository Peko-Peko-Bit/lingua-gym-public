import { VocabularyEntry } from "@/types";
import { apiFetch } from "./api-fetch";

// ---------------------------------------------------------------------------
// Public API — thin fetch wrappers over /api/vocabulary
// All Supabase access is server-side only (see app/api/vocabulary/*)
// ---------------------------------------------------------------------------

export async function getAllVocabulary(): Promise<VocabularyEntry[]> {
  const res = await apiFetch("/api/vocabulary");
  if (!res.ok) {
    console.error("[vocabulary] getAllVocabulary:", res.status);
    return [];
  }
  return res.json();
}

export async function addVocabularyEntry(
  entry: Omit<VocabularyEntry, "id" | "createdAt">
): Promise<VocabularyEntry | null> {
  const res = await apiFetch("/api/vocabulary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    console.error("[vocabulary] addVocabularyEntry:", res.status);
    return null;
  }
  return res.json();
}

export async function updateVocabularyNormalized(
  id: string,
  term: string,
  partOfSpeech: string | null,
  translation: string,
  type: "word" | "phrase" = "word"
): Promise<void> {
  const res = await apiFetch(`/api/vocabulary/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ term, partOfSpeech, translation, type }),
  });
  if (!res.ok) {
    console.error("[vocabulary] updateVocabularyNormalized:", res.status);
  }
}

export async function deleteVocabularyEntry(id: string): Promise<void> {
  const res = await apiFetch(`/api/vocabulary/${id}`, { method: "DELETE" });
  if (!res.ok) {
    console.error("[vocabulary] deleteVocabularyEntry:", res.status);
  }
}

// ---------------------------------------------------------------------------
// CSV export — pure client-side, no DB access
// ---------------------------------------------------------------------------

export function exportVocabularyAsCsv(entries: VocabularyEntry[]): void {
  const header = ["term", "part_of_speech", "translation", "source_lang", "target_lang", "session_title", "created_at"];

  const rows = entries.map(e => [
    csvEscape(e.term),
    csvEscape(e.partOfSpeech ?? ""),
    csvEscape(e.translation),
    csvEscape(e.sourceLang),
    csvEscape(e.targetLang),
    csvEscape(e.sessionTitle),
    csvEscape(new Date(e.createdAt).toLocaleString("ja-JP")),
  ]);

  const csv = [header, ...rows].map(r => r.join(",")).join("\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `linguagym_vocabulary_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

