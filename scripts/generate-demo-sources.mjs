/**
 * Step A of the demo-data pipeline — produce the source material.
 *
 *   scripts/demo-sessions.json  ──►  scripts/.demo-out/sources.json
 *
 * For every session slot in the blueprint this drives the real routes, in the
 * same order and with the same payloads the UI sends:
 *
 *   /api/generate       an article or a skit          (SourceToolbar.tsx:55-67)
 *   /api/translate      segments + reference text     (useTranslationSession.ts:299-354)
 *   /api/generate-cloze dictation blanks              (useTranslationSession.ts:470-483)
 *   /api/generate-title the session title             (useTranslationSession.ts:366-370)
 *
 * Usage:
 *   node scripts/generate-demo-sources.mjs                    # every slot
 *   node scripts/generate-demo-sources.mjs --sessions es-1,es-3
 *   node scripts/generate-demo-sources.mjs --sessions es-1 --force
 *   node scripts/generate-demo-sources.mjs --base-url http://localhost:3000
 *
 * Re-running merges by key. If a slot has already been authored against in
 * answers.json, regenerating would silently invalidate that prose, so it is
 * refused without --force (which backs the stale answers up first).
 *
 * Rate limits per run (a run = one fresh anonymous user): generate 30,
 * translate 30, generate-title 60, generate-cloze 30. Twelve slots fit
 * comfortably; the ceiling is ~30 slots per run.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadEnvLocal, signInAsGuest, postJson, sleep, parseArgs, parseList,
  readOut, writeOut, RateLimitError, SCRIPT_DIR, OUT_DIR, DEFAULT_BASE_URL,
} from "./demo-lib.mjs";

const THROTTLE_MS = 400;

// ---------------------------------------------------------------------------
// Segment reconstruction
//
// Ported verbatim from lib/hooks/useTranslationSession.ts:318-354. The scripts
// are .mjs and cannot import the TypeScript hook, so this is a deliberate
// duplicate; freeze-demo-sessions.mjs asserts that every produced segment still
// occurs in its session's source text, which is what catches drift.
// ---------------------------------------------------------------------------

function rebuildSegments(sourceText, translated) {
  let remainingText = sourceText;

  const segments = translated.map((item) => {
    const textToFind = item.sourceText.trim();
    let exactSourceText = item.sourceText;

    if (textToFind.length > 0) {
      const index = remainingText.indexOf(textToFind);
      if (index !== -1) {
        exactSourceText = remainingText.substring(0, index + textToFind.length);
        remainingText = remainingText.substring(index + textToFind.length);
      }
    }

    // Skit speaker names are split off — [[Elena]]: form only, to avoid false hits.
    const leadingWS = exactSourceText.match(/^\s*/)?.[0] ?? "";
    const speakerMatch = exactSourceText.trim().match(/^\[\[([^\]]+)\]\]:\s*([\s\S]+)$/);
    const speakerLabel = speakerMatch ? speakerMatch[1].trim() : null;
    const cleanSource = speakerMatch ? leadingWS + speakerMatch[2].trim() : exactSourceText;

    const refMatch = item.referenceTranslation.trim().match(/^\[\[([^\]]+)\]\]:\s*([\s\S]+)$/);
    const cleanRef = refMatch ? refMatch[2].trim() : item.referenceTranslation;

    return {
      sourceText: cleanSource,
      speakerLabel,
      referenceTranslation: cleanRef,
    };
  });

  if (remainingText.length > 0 && segments.length > 0) {
    segments[segments.length - 1].sourceText += remainingText;
  }

  return segments;
}

const SEGMENT_SEPARATOR = String.fromCharCode(0);

export const hashSegments = (segments) =>
  createHash("sha256").update(segments.map((s) => s.sourceText).join(SEGMENT_SEPARATOR)).digest("hex").slice(0, 16);

/**
 * Reject segmentation the model got wrong.
 *
 * /api/translate is one LLM call, and across a dozen sessions it fails in three
 * ways often enough to matter. All three are obvious in the session view and
 * invisible to every type check:
 *
 *   1. the TRANSLATION lands in the sourceText field, so one segment of a
 *      Catalan article comes back in English;
 *   2. a long sentence is emitted both whole and re-split, so the same clause
 *      shows up two or three times running;
 *   3. a segment is repeated verbatim.
 *
 * The app cannot recover from any of them either: when a returned chunk is not
 * found in the remaining source text, the rebuild keeps the raw string
 * (useTranslationSession.ts:324-330). Failing here rather than at freeze time
 * stops a bad generation before anyone authors translations against it.
 */
const MIN_CONTAINMENT_LENGTH = 25;
const bare = (s) => s.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

function validateSegments(sourceText, segments) {
  const problems = [];
  const bareSource = bare(sourceText);

  segments.forEach((segment, i) => {
    const text = segment.sourceText.trim();
    if (!text) { problems.push(`[${i}] is empty`); return; }
    if (!bareSource.includes(bare(text))) {
      problems.push(`[${i}] is not part of the generated text — a translation probably leaked into sourceText: "${text.slice(0, 60)}…"`);
    }
  });

  const entries = segments.map((s, i) => ({ i, bare: bare(s.sourceText) }));
  for (const entry of entries) {
    if (!entry.bare) continue;
    const twin = entries.find((o) => o.i < entry.i && o.bare === entry.bare);
    if (twin) { problems.push(`[${entry.i}] duplicates [${twin.i}]`); continue; }
    if (entry.bare.length < MIN_CONTAINMENT_LENGTH) continue;
    const swallowed = entries.find((o) => o.i !== entry.i && o.bare.length > entry.bare.length && o.bare.includes(entry.bare));
    if (swallowed) problems.push(`[${entry.i}] is contained in [${swallowed.i}] — re-split leftover`);
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Per-slot generation
// ---------------------------------------------------------------------------

async function buildSession(baseUrl, cookieHeader, slot) {
  const { sourceLang, targetLang, inputMode } = slot;
  const isPhrasing = inputMode === "phrasing";

  const options = { difficulty: slot.generate.difficulty };
  if (slot.generate.skitCategory) options.skitCategory = slot.generate.skitCategory;

  // Phrasing is the reverse drill: the pane holds the learner's OWN language and
  // they produce the study language, so the text has to be generated in
  // targetLang. (The app's Generate button always uses sourceLang —
  // SourceToolbar.tsx:57 — which is why pressing it while in phrasing mode
  // produces Spanish that /api/translate is then told is English, and hands back
  // "translations" identical to the input. Phrasing expects pasted native text.)
  const generated = await postJson(baseUrl, cookieHeader, "/api/generate", {
    type: slot.generate.type,
    lang: isPhrasing ? targetLang : sourceLang,
    studyLang: sourceLang,
    options,
  });
  const sourceText = generated.text;
  if (!sourceText || !sourceText.trim()) throw new Error(`${slot.key}: /api/generate returned no text`);
  await sleep(THROTTLE_MS);

  // In phrasing mode the learner produces the study language, so the pair is
  // swapped before segmentation (useTranslationSession.ts:302-304).
  const effectiveSourceLang = isPhrasing ? targetLang : sourceLang;
  const effectiveTargetLang = isPhrasing ? sourceLang : targetLang;

  // NOTE: /api/translate answers with a BARE ARRAY, not { results }.
  const translated = await postJson(baseUrl, cookieHeader, "/api/translate", {
    text: sourceText,
    sourceLang: effectiveSourceLang,
    targetLang: effectiveTargetLang,
  });
  if (!Array.isArray(translated)) throw new Error(`${slot.key}: /api/translate did not return an array`);
  await sleep(THROTTLE_MS);

  const segments = rebuildSegments(sourceText, translated);

  const problems = validateSegments(sourceText, segments);
  if (problems.length > 0) {
    throw new Error(
      `${slot.key}: segmentation is unusable, re-run this slot\n` +
      problems.map((p) => `      ${p}`).join("\n")
    );
  }

  // Dictation prepares EVERY segment, not just the ones the learner attempts
  // (useTranslationSession.ts:498-501).
  if (inputMode === "dictation") {
    const cloze = await postJson(baseUrl, cookieHeader, "/api/generate-cloze", {
      segments: segments.map((s, i) => ({ id: `seg-${i}`, source_text: s.sourceText })),
      source_lang: sourceLang,
      target_lang: targetLang,
    });
    for (const result of cloze.results ?? []) {
      const index = Number(String(result.id).replace("seg-", ""));
      if (Number.isInteger(index) && segments[index]) segments[index].clozeMetadata = result.cloze_metadata;
    }
    await sleep(THROTTLE_MS);
  }

  const titled = await postJson(baseUrl, cookieHeader, "/api/generate-title", {
    text: sourceText.slice(0, 400),
    titleLang: sourceLang,
  });
  await sleep(THROTTLE_MS);

  return {
    key: slot.key,
    sourceLang,
    targetLang,
    inputMode,
    isPinned: slot.isPinned,
    dayOffset: slot.dayOffset,
    time: slot.time,
    title: titled.title ?? slot.key,
    sourceText,
    segments,
    sourceHash: hashSegments(segments),
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  loadEnvLocal();

  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args["base-url"] ?? DEFAULT_BASE_URL;
  const only = parseList(args.sessions);
  const force = args.force === true;

  const blueprint = JSON.parse(readFileSync(join(SCRIPT_DIR, "demo-sessions.json"), "utf8"));
  const slots = blueprint.sessions.filter((s) => !only || only.includes(s.key));
  if (slots.length === 0) throw new Error(`no session slots matched ${args.sessions}`);

  const sources = readOut("sources.json", {});
  const answers = readOut("answers.json", null);

  // Regenerating a slot invalidates any learner translations written for it.
  // Only HUMAN-written text counts: author-demo-answers.mjs pre-fills the green
  // segments and marks them `prefilled`, and losing those costs nothing.
  const isHumanWritten = (seg) =>
    !seg.prefilled &&
    ((seg.userTranslation ?? "").trim() || (seg.dictationInputs ?? []).some((v) => (v ?? "").trim()));

  const authored = new Set(
    answers ? Object.entries(answers.sessions ?? {})
      .filter(([, s]) => (s.segments ?? []).some(isHumanWritten))
      .map(([key]) => key) : []
  );
  const clashes = slots.map((s) => s.key).filter((key) => authored.has(key));
  if (clashes.length > 0 && !force) {
    console.error(`Refusing to regenerate ${clashes.join(", ")} — answers.json already has authored text for them.`);
    console.error("Re-run with --force to overwrite (the existing answers are backed up first).");
    process.exit(1);
  }
  if (clashes.length > 0 && force) {
    // Back the whole file up, but only DROP the slots being regenerated. Moving
    // answers.json aside wholesale would silently discard the authoring for
    // every other session, which is a very expensive way to regenerate one.
    const backup = join(OUT_DIR, `answers.${Date.now()}.bak.json`);
    writeOut(backup.split(/[\\/]/).pop(), answers);
    for (const key of clashes) delete answers.sessions[key];
    writeOut("answers.json", answers);
    console.warn(`Dropped authored answers for ${clashes.join(", ")} (full backup at ${backup})`);
  }

  const { userId, cookieHeader } = await signInAsGuest();
  console.log(`Signed in as throwaway guest ${userId}`);
  console.log(`Generating ${slots.length} session(s) against ${baseUrl}\n`);

  let done = 0;
  try {
    for (const slot of slots) {
      process.stdout.write(`  ${slot.key} (${slot.sourceLang}->${slot.targetLang}, ${slot.inputMode}) ... `);
      const built = await buildSession(baseUrl, cookieHeader, slot);
      sources[slot.key] = built;
      done++;
      const speakers = built.segments.filter((s) => s.speakerLabel).length;
      console.log(`${built.segments.length} segments${speakers ? `, ${speakers} with speaker labels` : ""} — "${built.title}"`);
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      const remaining = slots.slice(done).map((s) => s.key).join(",");
      console.error(`\nRate limited (${err.path}). Wrote ${done} session(s).`);
      console.error(`Resume with: node scripts/generate-demo-sources.mjs --sessions ${remaining}`);
    } else {
      console.error(`\nFailed after ${done} session(s):`, err.message);
    }
    writeOut("sources.json", sources);
    process.exit(1);
  }

  const file = writeOut("sources.json", sources);
  console.log(`\nWrote ${done} session(s) to ${file}`);
  console.log("Next: node scripts/author-demo-answers.mjs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
