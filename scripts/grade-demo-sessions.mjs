/**
 * Step B of the demo-data pipeline — grade the authored answers for real.
 *
 *   sources.json + answers.json  ──►  graded.json + grading-review.md
 *
 * Drives /api/check and /api/check-dictation exactly the way the app does, so
 * the statuses, reasons and advice that end up in data/demo/*.json are genuine
 * model output.
 *
 * Usage:
 *   node scripts/grade-demo-sessions.mjs
 *   node scripts/grade-demo-sessions.mjs --sessions es-5
 *   node scripts/grade-demo-sessions.mjs --sessions es-5 --segments 3,7
 *
 * Sessions already graded against unchanged answers are skipped, so the
 * fix-one-segment-and-regrade loop costs one API call rather than 120.
 *
 * RATE LIMIT: /api/check allows 120 per hour per user and a full 12-session run
 * needs ~122, so grade in two or three invocations. Each run signs in as a new
 * anonymous user, which resets the bucket. On a 429 this flushes what it has
 * and prints the resume command.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadEnvLocal, signInAsGuest, postJson, sleep, parseArgs, parseList,
  readOut, writeOut, normalize, RateLimitError, SCRIPT_DIR, DEFAULT_BASE_URL,
} from "./demo-lib.mjs";

const THROTTLE_MS = 400;

const hashAnswers = (entry) =>
  createHash("sha256").update(JSON.stringify(entry)).digest("hex").slice(0, 16);

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

async function gradeSegment(baseUrl, cookieHeader, source, answer, segment) {
  const { sourceLang, targetLang, inputMode } = source;

  if (inputMode === "dictation") {
    const targets = (segment.clozeMetadata?.targets ?? []).map((t) => ({
      index: t.index,
      answer: t.answer,
      user_input: answer.dictationInputs?.[t.index] ?? "",
    }));

    const result = await postJson(baseUrl, cookieHeader, "/api/check-dictation", {
      source_text: segment.sourceText,
      targets,
      source_lang: sourceLang,
      target_lang: targetLang,
    });

    // Same derivation the app uses (useTranslationSession.ts:546-549).
    const statuses = (result.results ?? []).map((r) => r.status);
    const status = statuses.every((s) => s === "green") ? "green"
      : statuses.some((s) => s === "red") ? "red"
      : "yellow";

    // The app persists neither the per-blank results nor the overall advice —
    // they are client-only state — so the fixture must not carry them either.
    // They are kept here only so the review report can show them.
    return {
      status,
      reason: null,
      advice: null,
      userTranslation: "",
      _dictationResults: result.results ?? [],
      _dictationAdvice: result.overall_advice ?? "",
    };
  }

  // In phrasing mode the app swaps the texts AND the languages before checking
  // (useTranslationSession.ts:416-426). inputMode is forwarded raw: "listening"
  // must NOT be normalised to "phrasing", or it would gain the swap it does not
  // currently get.
  const isPhrasing = inputMode === "phrasing";
  const result = await postJson(baseUrl, cookieHeader, "/api/check", {
    sourceText: isPhrasing ? segment.referenceTranslation : segment.sourceText,
    referenceTranslation: isPhrasing ? segment.sourceText : segment.referenceTranslation,
    userTranslation: answer.userTranslation,
    sourceLang: isPhrasing ? targetLang : sourceLang,
    targetLang: isPhrasing ? sourceLang : targetLang,
    inputMode,
  });

  return {
    status: result.status,
    reason: result.reason ?? null,
    advice: result.suggestion ?? "",
    userTranslation: answer.userTranslation,
  };
}

// ---------------------------------------------------------------------------
// Review report
// ---------------------------------------------------------------------------

function sidebarChip(source) {
  const hasSpeakers = source.segments.some((s) => s.speakerLabel);
  const sourceType = source.inputMode === "media" ? "OCR" : hasSpeakers ? "Skit" : "Text";
  const practice = source.inputMode === "listening" ? "Listening"
    : source.inputMode === "dictation" ? "Dictation"
    : "Translation";
  return `${sourceType} / ${practice}`;
}

function buildReview(sources, graded, answers) {
  const lines = ["# デモデータ 採点レビュー", "", `生成: ${new Date().toISOString()}`, ""];

  const tally = { green: 0, yellow: 0, red: 0 };
  const mismatches = [];
  const copies = [];

  for (const [key, entry] of Object.entries(graded)) {
    for (const segment of entry.segments) {
      if (segment.status === "neutral") continue;
      tally[segment.status] = (tally[segment.status] ?? 0) + 1;
      const intended = answers.sessions[key]?.segments?.[segment.index]?.intendedStatus;
      if (intended && intended !== segment.status) mismatches.push({ key, segment, intended });
      const ref = sources[key].segments[segment.index].referenceTranslation;
      if (segment.userTranslation && segment.userTranslation.trim() === ref.trim()) copies.push(`${key}[${segment.index}]`);
    }
  }

  const total = tally.green + tally.yellow + tally.red;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  lines.push(
    "## 全体の配分",
    "",
    `採点済み ${total} セグメント — green ${tally.green} (${pct(tally.green)}%) / yellow ${tally.yellow} (${pct(tally.yellow)}%) / red ${tally.red} (${pct(tally.red)}%)`,
    "",
    "目標は es 6件で green 60% / yellow 28% / red 12% 前後。",
    "",
  );

  lines.push("## セッション別（サイドバーでどう見えるか）", "", "| key | チップ | 進捗リング | 日付ラベル | 話者 |", "|---|---|---|---|---|");
  for (const [key, entry] of Object.entries(graded)) {
    const source = sources[key];
    const checked = entry.segments.filter((s) => s.status !== "neutral").length;
    const ring = `${checked}/${entry.segments.length}${checked === entry.segments.length ? " ✅完了" : ""}`;
    const speakers = source.segments.filter((s) => s.speakerLabel).length;
    lines.push(`| ${key}${source.isPinned ? " 📌" : ""} | ${sidebarChip(source)} | ${ring} | ${source.dayOffset}日前 ${source.time} | ${speakers || "—"} |`);
  }
  lines.push("");

  if (mismatches.length > 0) {
    lines.push(`## 意図とのズレ（${mismatches.length}件）`, "", "採点器が設計図と違う判定を出したもの。直すなら該当セグメントの訳を書き換えて再採点する。", "");
    for (const { key, segment, intended } of mismatches) {
      const source = sources[key].segments[segment.index];
      lines.push(`### ${key}[${segment.index}] 意図 ${intended} → 実際 **${segment.status}**`);
      lines.push(`- 原文: ${source.sourceText.trim()}`);
      lines.push(`- 参考訳: ${source.referenceTranslation}`);
      if (segment.userTranslation) lines.push(`- 学習者訳: ${segment.userTranslation}`);
      if (segment._dictationResults) {
        lines.push(`- 穴ごと: ${segment._dictationResults.map((r) => `${r.index}:${r.status}`).join(", ")}`);
        if (segment._dictationAdvice) lines.push(`- 総評(保存されない): ${segment._dictationAdvice}`);
      }
      if (segment.reason) lines.push(`- 判定理由: ${segment.reason}`);
      lines.push(`- 修正: \`node scripts/grade-demo-sessions.mjs --sessions ${key} --segments ${segment.index}\``);
      lines.push("");
    }
  } else {
    lines.push("## 意図とのズレ", "", "なし。", "");
  }

  if (copies.length > 0) {
    lines.push("## 参考訳のコピーのまま（言い換え推奨）", "", copies.join(" "), "");
  }

  // Vocabulary occurrence is what freeze-demo-sessions.mjs fails on; surfacing
  // it here means you find out now instead of at the freeze.
  const vocabProblems = [];
  for (const [lang, entries] of Object.entries(answers.vocabulary ?? {})) {
    for (const entry of entries) {
      const source = sources[entry.sessionKey];
      if (!source) { vocabProblems.push(`${lang}: "${entry.term}" — sessionKey ${entry.sessionKey} が存在しない`); continue; }
      const haystack = normalize(source.sourceText + " " + source.segments.map((s) => s.referenceTranslation).join(" "));
      if (!haystack.includes(normalize(entry.term))) {
        vocabProblems.push(`${lang}: "${entry.term}" が ${entry.sessionKey} の本文に見つからない`);
      }
    }
  }
  const vocabCount = Object.values(answers.vocabulary ?? {}).reduce((n, list) => n + list.length, 0);
  lines.push(`## 語彙（${vocabCount}件）`, "");
  lines.push(vocabProblems.length === 0 ? "出現チェック OK。" : vocabProblems.map((p) => `- ⚠ ${p}`).join("\n"));
  lines.push("");

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  loadEnvLocal();

  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args["base-url"] ?? DEFAULT_BASE_URL;
  const only = parseList(args.sessions);
  const onlySegments = parseList(args.segments)?.map(Number) ?? null;
  const force = args.force === true;

  JSON.parse(readFileSync(join(SCRIPT_DIR, "demo-sessions.json"), "utf8")); // fail fast if the blueprint is broken

  const sources = readOut("sources.json", null);
  const answers = readOut("answers.json", null);
  if (!sources || !answers) {
    console.error("sources.json / answers.json missing — run generate-demo-sources.mjs then author-demo-answers.mjs.");
    process.exit(1);
  }

  const graded = readOut("graded.json", {});
  const keys = Object.keys(sources).filter((key) => !only || only.includes(key));

  const todo = [];
  for (const key of keys) {
    const answer = answers.sessions[key];
    if (!answer) { console.warn(`  ⚠ ${key}: no answers entry — skipped`); continue; }
    if (answer.sourceHash !== sources[key].sourceHash) {
      console.error(`${key}: answers.json was written against different source text (hash mismatch). Re-run author-demo-answers.mjs.`);
      process.exit(1);
    }
    const stale = graded[key]?.answersHash !== hashAnswers(answer);
    if (!stale && !force && !only) continue;
    todo.push(key);
  }

  if (todo.length === 0) {
    console.log("Nothing to grade — every session is up to date. (--force to regrade)");
    writeOut("grading-review.md", buildReview(sources, graded, answers));
    return;
  }

  const { userId, cookieHeader } = await signInAsGuest();
  console.log(`Signed in as throwaway guest ${userId}`);
  console.log(`Grading ${todo.length} session(s) against ${baseUrl}\n`);

  let calls = 0;
  try {
    for (const key of todo) {
      const source = sources[key];
      const answer = answers.sessions[key];
      process.stdout.write(`  ${key} (${source.inputMode}) `);

      const previous = graded[key]?.segments ?? [];
      const segments = [];

      for (let i = 0; i < source.segments.length; i++) {
        const segmentAnswer = answer.segments[i];
        const segment = source.segments[i];

        if (!segmentAnswer?.attempted) {
          segments.push({ index: i, status: "neutral", reason: null, advice: null, userTranslation: "" });
          continue;
        }

        // --segments limits regrading to specific indices; everything else keeps
        // the result it already had.
        if (onlySegments && !onlySegments.includes(i)) {
          const kept = previous.find((s) => s.index === i);
          if (kept) { segments.push(kept); process.stdout.write("·"); continue; }
        }

        const result = await gradeSegment(baseUrl, cookieHeader, source, segmentAnswer, segment);
        calls++;
        segments.push({ index: i, ...result });
        process.stdout.write(result.status === "green" ? "G" : result.status === "yellow" ? "Y" : "R");
        await sleep(THROTTLE_MS);
      }

      graded[key] = {
        answersHash: hashAnswers(answer),
        gradedAt: new Date().toISOString(),
        segments,
      };
      console.log("");
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      const remaining = todo.filter((k) => !graded[k] || graded[k].answersHash !== hashAnswers(answers.sessions[k]));
      console.error(`\nRate limited (${err.path}) after ${calls} call(s).`);
      console.error(`Resume in a new run with: node scripts/grade-demo-sessions.mjs --sessions ${remaining.join(",")}`);
    } else {
      console.error(`\nFailed after ${calls} call(s):`, err.message);
    }
    writeOut("graded.json", graded);
    writeOut("grading-review.md", buildReview(sources, graded, answers));
    process.exit(1);
  }

  writeOut("graded.json", graded);
  const reviewFile = writeOut("grading-review.md", buildReview(sources, graded, answers));
  console.log(`\n${calls} grading call(s). Review: ${reviewFile}`);
  console.log("When it looks right: node scripts/freeze-demo-sessions.mjs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
