/**
 * lib/vocabulary-taxonomy.ts
 *
 * The allowed values for vocabulary.type and vocabulary.part_of_speech.
 *
 * `type` is guarded in the database by CHECK (type IN ('word','phrase')) — added
 * on the LinguaCoach side (20260503000000_add_type_to_vocabulary.sql) of the
 * shared vocabulary table. An off-spec value fails the whole UPDATE, taking the
 * base form and the translation down with the part of speech, so LLM output is
 * sanitized here before it ever reaches a write.
 *
 * `part_of_speech` has no DB constraint; the list mirrors the keys of POS_STYLE
 * in components/vocabulary/VocabularyPanel.tsx.
 */

export type VocabularyType = "word" | "phrase";

export const PART_OF_SPEECH_VALUES = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "interjection",
] as const;

const PART_OF_SPEECH_SET = new Set<string>(PART_OF_SPEECH_VALUES);

/** Anything that is not exactly "phrase" falls back to "word" (the DB default). */
export function sanitizeVocabularyType(value: unknown): VocabularyType {
  return value === "phrase" ? "phrase" : "word";
}

/** Phrases never carry a part of speech; unknown labels are dropped, not stored. */
export function sanitizePartOfSpeech(
  value: unknown,
  type: VocabularyType
): string | null {
  if (type === "phrase") return null;
  if (typeof value !== "string") return null;
  const pos = value.trim().toLowerCase();
  return PART_OF_SPEECH_SET.has(pos) ? pos : null;
}
