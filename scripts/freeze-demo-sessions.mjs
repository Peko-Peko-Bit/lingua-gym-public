/**
 * Step C of the demo-data pipeline — freeze the reviewed output.
 *
 *   sources.json + answers.json + graded.json  ──►  data/demo/<sourceLang>.json
 *
 * Calls no API. It reshapes the pipeline output into the fixture shape that
 * lib/guest-seed.ts inserts, and refuses to write anything if the result would
 * not survive contact with the app.
 *
 * Timestamps are stored as offsets only — dayOffset/time on the session,
 * minute offsets on each graded segment and vocabulary entry — and are
 * materialised against "now" at seed time, so the history keeps reading as
 * "the last two weeks" however old the recording is.
 *
 * Usage:
 *   node scripts/freeze-demo-sessions.mjs
 *   node scripts/freeze-demo-sessions.mjs --dry-run
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, readOut, normalize, REPO_ROOT } from "./demo-lib.mjs";

/** A segment is graded every couple of minutes, starting a little after the session opens. */
const FIRST_CHECK_MINUTE = 3;
const MINUTES_PER_SEGMENT = 2;
/** The session keeps being touched for a few minutes after the last grading. */
const TRAILING_MINUTES = 4;
/** Below this, one segment sitting inside another is coincidence, not a re-split leftover. */
const MIN_CONTAINMENT_LENGTH = 25;

const checkMinute = (index) => FIRST_CHECK_MINUTE + index * MINUTES_PER_SEGMENT;

function buildFixtureSession(source, graded) {
  const gradedByIndex = new Map((graded?.segments ?? []).map((s) => [s.index, s]));

  // Dictation stores neither a learner translation nor feedback: the app keeps
  // the per-blank results and the overall advice in client state only
  // (useTranslationSession.ts:553-560), so writing them would create a row the
  // app itself can never produce.
  const isDictation = source.inputMode === "dictation";

  const segments = source.segments.map((segment, index) => {
    const result = gradedByIndex.get(index) ?? { status: "neutral", reason: null, advice: null, userTranslation: "" };
    const isNeutral = result.status === "neutral";

    return {
      sourceText: segment.sourceText,
      speakerLabel: segment.speakerLabel ?? null,
      referenceTranslation: segment.referenceTranslation,
      userTranslation: isDictation ? "" : result.userTranslation ?? "",
      status: result.status,
      reason: isNeutral || isDictation ? null : result.reason ?? null,
      advice: isNeutral || isDictation ? null : result.advice ?? "",
      checkedMinuteOffset: isNeutral ? null : checkMinute(index),
      clozeMetadata: segment.clozeMetadata ?? null,
    };
  });

  const lastChecked = segments.reduce((max, s) => Math.max(max, s.checkedMinuteOffset ?? 0), 0);

  return {
    key: source.key,
    title: source.title,
    targetLang: source.targetLang,
    inputMode: source.inputMode,
    isPinned: Boolean(source.isPinned),
    dayOffset: source.dayOffset,
    time: source.time,
    updatedMinuteOffset: lastChecked + TRAILING_MINUTES,
    sourceText: source.sourceText,
    segments,
  };
}

// ---------------------------------------------------------------------------
// Sanity checks — every one of these has a matching failure mode in the app.
// ---------------------------------------------------------------------------

const VALID_MODES = new Set(["comprehension", "phrasing", "listening", "dictation"]);
const VALID_STATUSES = new Set(["neutral", "green", "yellow", "red"]);

function check(fixtures) {
  const errors = [];
  const warnings = [];
  const all = Object.values(fixtures).flatMap((f) => f.sessions.map((s) => ({ fixture: f, session: s })));

  if (all.length === 0) errors.push("no sessions were produced");

  // Exactly one pinned session overall — two pinned cards read as a bug.
  const pinned = all.filter(({ session }) => session.isPinned);
  if (pinned.length !== 1) errors.push(`expected exactly 1 pinned session, found ${pinned.length}`);

  const es = fixtures.es?.sessions ?? [];
  const esModes = new Set(es.map((s) => s.inputMode));
  for (const mode of VALID_MODES) {
    if (!esModes.has(mode)) errors.push(`es is missing a "${mode}" session — the sidebar filters by study language, so all four modes must be in the default view`);
  }

  if (!all.some(({ session }) => session.segments.some((seg) => seg.speakerLabel))) {
    errors.push('no session has speaker labels — the sidebar "Skit" chip would never appear');
  }

  // Most sessions are deliberately left part-finished — /api/translate produces
  // ~20 segments per text, and every card at 20/20 would read as a demo account
  // rather than a practice log. What must hold is that BOTH states are visible:
  // at least one part-finished ring and at least one completed green ring.
  const partial = all.filter(({ session }) =>
    session.segments.some((s) => s.status === "neutral") && session.segments.some((s) => s.status !== "neutral"));
  if (partial.length < 1) errors.push("no session is partially graded — the sidebar would never show a part-finished ring");

  if (!all.some(({ session }) => session.segments.length > 0 && session.segments.every((s) => s.status !== "neutral"))) {
    errors.push("no session is fully graded — the sidebar would never show a completed (green) ring");
  }

  for (const { fixture, session } of all) {
    const where = `${session.key}`;
    if (!VALID_MODES.has(session.inputMode)) errors.push(`${where}: input_mode "${session.inputMode}" is not one of ${[...VALID_MODES].join("|")}`);
    if (session.segments.length === 0) errors.push(`${where}: no segments`);
    if (!session.title?.trim()) errors.push(`${where}: empty title`);

    // The segmentation model occasionally emits a long sentence both whole and
    // re-split, so the same text lands in the list two or three times. Nothing
    // downstream notices, but it is plainly visible in the session view.
    const seen = new Map();
    session.segments.forEach((seg, i) => {
      const text = seg.sourceText.trim();
      if (!text) return;
      if (seen.has(text)) errors.push(`${where}[${i}]: duplicate of segment ${seen.get(text)} — regenerate this session`);
      else seen.set(text, i);
    });
    // Containment is compared with punctuation and spacing stripped: the whole
    // and the re-split copy usually differ by exactly one character (the clause
    // ends "…Mediterrània"." while the long version continues "…Mediterrània",
    // un disc…"), which a plain substring test walks straight past.
    //
    // The length floor keeps a short fragment that is coincidentally inside a
    // longer unrelated sentence from being flagged (Japanese "佐藤さんは、" inside
    // "店主の佐藤さんは、"); a real leftover is a whole clause.
    const bare = (s) => s.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
    const entries = [...seen.entries()].map(([text, i]) => ({ text, i, bare: bare(text) }));
    for (const entry of entries) {
      if (entry.bare.length < MIN_CONTAINMENT_LENGTH) continue;
      const swallowed = entries.find((o) => o.i !== entry.i && o.bare.length > entry.bare.length && o.bare.includes(entry.bare));
      if (swallowed) errors.push(`${where}[${entry.i}]: text is contained in segment ${swallowed.i} (re-split leftover) — regenerate this session`);
    }

    session.segments.forEach((seg, i) => {
      const at = `${where}[${i}]`;
      if (!VALID_STATUSES.has(seg.status)) errors.push(`${at}: invalid status "${seg.status}"`);

      // status and checked_at must agree, or the progress ring and the
      // "checked" timestamps tell different stories.
      const isNeutral = seg.status === "neutral";
      if (isNeutral && seg.checkedMinuteOffset !== null) errors.push(`${at}: neutral but has a check time`);
      if (!isNeutral && seg.checkedMinuteOffset === null) errors.push(`${at}: graded but has no check time`);
      if (isNeutral && seg.userTranslation !== "") errors.push(`${at}: neutral but carries a learner translation`);

      // Segment text must really come from the session text — this is what
      // catches the segment-rebuild copy in generate-demo-sources.mjs drifting
      // away from useTranslationSession.ts.
      if (!seg.speakerLabel && !session.sourceText.includes(seg.sourceText.trim())) {
        errors.push(`${at}: segment text is not a substring of the session source text (segment rebuild drift?)`);
      }

      if (session.inputMode === "dictation") {
        if (!seg.clozeMetadata) errors.push(`${at}: dictation segment without cloze metadata`);
        // The app persists none of these for dictation (useTranslationSession.ts:553-560).
        if (seg.userTranslation !== "") errors.push(`${at}: dictation segments must not carry a learner translation`);
        if (seg.reason !== null || seg.advice !== null) errors.push(`${at}: dictation segments must not carry reason/advice`);
      }
    });

    if (session.targetLang === fixture.sourceLang) errors.push(`${where}: source and target language are the same`);
  }

  // Vocabulary must be findable in its own session, or the book looks invented.
  for (const fixture of Object.values(fixtures)) {
    const byKey = new Map(fixture.sessions.map((s) => [s.key, s]));
    for (const entry of fixture.vocabulary) {
      const session = byKey.get(entry.sessionKey);
      if (!session) { errors.push(`vocabulary "${entry.term}": unknown sessionKey ${entry.sessionKey}`); continue; }
      const haystack = normalize(session.sourceText + " " + session.segments.map((s) => s.referenceTranslation).join(" "));
      if (!haystack.includes(normalize(entry.term))) {
        errors.push(`vocabulary "${entry.term}": does not occur in ${entry.sessionKey}`);
      }
      if (entry.type === "phrase" && entry.partOfSpeech !== null) {
        errors.push(`vocabulary "${entry.term}": phrases must have partOfSpeech null`);
      }
      if (entry.type === "word" && !entry.partOfSpeech) {
        errors.push(`vocabulary "${entry.term}": words need a partOfSpeech`);
      }
    }
  }

  // Nothing absolute and nothing from the throwaway generator account may leak.
  const serialised = JSON.stringify(fixtures);
  if (/"(created_at|updated_at|checked_at|generatedAt|gradedAt)"/.test(serialised)) errors.push("fixture contains absolute timestamp fields");
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/.test(serialised)) errors.push("fixture contains a UUID (generator user id or segment id leaked in)");

  // Colour distribution is a judgement call, so warn rather than fail.
  const esGraded = es.flatMap((s) => s.segments).filter((s) => s.status !== "neutral");
  if (esGraded.length > 0) {
    const share = (status) => Math.round((esGraded.filter((s) => s.status === status).length / esGraded.length) * 100);
    const [g, y, r] = [share("green"), share("yellow"), share("red")];
    if (Math.abs(g - 60) > 10 || Math.abs(y - 28) > 10 || Math.abs(r - 12) > 10) {
      warnings.push(`es colour mix is green ${g}% / yellow ${y}% / red ${r}% (target 60/28/12 ±10)`);
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args["dry-run"] === true;

  const sources = readOut("sources.json", null);
  const answers = readOut("answers.json", null);
  const graded = readOut("graded.json", null);
  if (!sources || !answers || !graded) {
    console.error("sources.json / answers.json / graded.json missing — run steps A, A' and B first.");
    process.exit(1);
  }

  const fixtures = {};
  for (const [key, source] of Object.entries(sources)) {
    if (!graded[key]) {
      console.error(`${key} has never been graded — run grade-demo-sessions.mjs --sessions ${key}`);
      process.exit(1);
    }
    const lang = source.sourceLang;
    if (!fixtures[lang]) fixtures[lang] = { sourceLang: lang, sessions: [], vocabulary: [] };
    fixtures[lang].sessions.push(buildFixtureSession(source, graded[key]));
  }

  for (const [lang, entries] of Object.entries(answers.vocabulary ?? {})) {
    if (!fixtures[lang]) continue;
    fixtures[lang].vocabulary = entries.map((entry, i) => ({
      term: entry.term,
      translation: entry.translation,
      type: entry.type,
      partOfSpeech: entry.partOfSpeech ?? null,
      targetLang: entry.targetLang,
      sessionKey: entry.sessionKey,
      minuteOffset: entry.minuteOffset ?? checkMinute(i) + 1,
    }));
  }

  // Newest first inside a file, matching the sidebar's own order.
  for (const fixture of Object.values(fixtures)) {
    fixture.sessions.sort((a, b) => b.dayOffset - a.dayOffset);
  }

  const { errors, warnings } = check(fixtures);
  for (const w of warnings) console.warn(`  ⚠ ${w}`);
  if (errors.length > 0) {
    console.error(`\nRefusing to freeze — ${errors.length} problem(s):\n`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  const summary = [];
  for (const [lang, fixture] of Object.entries(fixtures)) {
    const file = join(REPO_ROOT, "data", "demo", `${lang}.json`);
    const graded = fixture.sessions.flatMap((s) => s.segments).filter((s) => s.status !== "neutral").length;
    const total = fixture.sessions.reduce((n, s) => n + s.segments.length, 0);
    summary.push(`  ${lang}: ${fixture.sessions.length} session(s), ${graded}/${total} segments graded, ${fixture.vocabulary.length} vocabulary`);
    if (!dryRun) writeFileSync(file, JSON.stringify(fixture, null, 2) + "\n", "utf8");
  }

  console.log(dryRun ? "\nDry run — nothing written.\n" : "\nFrozen to data/demo/:\n");
  console.log(summary.join("\n"));
}

main();
