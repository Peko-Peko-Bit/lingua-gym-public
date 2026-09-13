/**
 * Step A' of the demo-data pipeline — build the authoring scaffold.
 *
 *   sources.json + demo-sessions.json  ──►  answers.json + authoring-todo.md
 *
 * This is the only step that calls no API and costs nothing, which is why it is
 * split out from Step A: you can re-run it after tweaking the grading targets
 * in the blueprint without regenerating (and paying for) any text.
 *
 * What it does:
 *   - turns each slot's grading targets into a per-segment intendedStatus,
 *     clamped to the number of segments that actually came back;
 *   - pre-fills every segment intended to be GREEN with the reference
 *     translation, and leaves yellow/red blank with a todo flag.
 *
 * That pre-fill is the point. Writing ~130 translations from scratch is a day's
 * work; degrading ~35 already-correct ones into specific mistakes is an hour.
 * It is also the likeliest way to actually land green, which is where most
 * segments need to be.
 *
 * Entries whose sourceHash still matches sources.json are preserved verbatim,
 * so re-running never eats prose you have already written.
 *
 * Usage:
 *   node scripts/author-demo-answers.mjs
 *   node scripts/author-demo-answers.mjs --sessions es-1,es-4
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, parseList, readOut, writeOut, SCRIPT_DIR } from "./demo-lib.mjs";

/**
 * Choose `count` distinct segment indices spread across the attempted range.
 * Index 0 is avoided while there is room, so a session does not open on an
 * error — the first card a viewer sees should look competent.
 */
function spreadIndices(count, attempted) {
  if (count <= 0 || attempted <= 0) return [];
  const lower = attempted > count + 1 ? 1 : 0;
  const picks = [];
  for (let n = 0; n < count; n++) {
    const ideal = lower + Math.round(((n + 1) * (attempted - lower)) / (count + 1));
    let index = Math.min(Math.max(ideal, lower), attempted - 1);
    while (picks.includes(index) && index < attempted - 1) index++;
    while (picks.includes(index) && index > lower) index--;
    if (!picks.includes(index)) picks.push(index);
  }
  return picks.sort((a, b) => a - b);
}

function planStatuses(segmentCount, grading, key, warnings) {
  const requested = grading.attempted === "all" ? segmentCount : grading.attempted;
  const attempted = Math.min(requested, segmentCount);
  if (attempted < requested) {
    warnings.push(`${key}: blueprint asked for ${requested} attempted segments but only ${segmentCount} were generated`);
  }

  const wantYellow = grading.yellow ?? 0;
  const wantRed = grading.red ?? 0;
  const room = Math.max(attempted - 1, 0); // keep at least one green
  const total = Math.min(wantYellow + wantRed, room);
  if (total < wantYellow + wantRed) {
    warnings.push(`${key}: ${wantYellow + wantRed} non-green targets do not fit in ${attempted} attempted segments — using ${total}`);
  }

  const red = Math.min(wantRed, total);
  const picks = spreadIndices(total, attempted);
  // Reds take the later slots: a learner plausibly stumbles more on the
  // sentences further into a harder text.
  const redSet = new Set(picks.slice(picks.length - red));

  return Array.from({ length: segmentCount }, (_, i) => {
    if (i >= attempted) return "neutral";
    if (redSet.has(i)) return "red";
    if (picks.includes(i)) return "yellow";
    return "green";
  });
}

function buildSessionEntry(source, slot, warnings) {
  const statuses = planStatuses(source.segments.length, slot.grading, slot.key, warnings);
  const isDictation = source.inputMode === "dictation";

  return {
    sourceHash: source.sourceHash,
    inputMode: source.inputMode,
    segments: source.segments.map((segment, index) => {
      const intendedStatus = statuses[index];
      const attempted = intendedStatus !== "neutral";
      const base = { index, intendedStatus, attempted };

      // `prefilled` marks text this script wrote, not a human. Step A's
      // clobber guard keys off it — without it, every session looks authored
      // the moment this script runs and regeneration is blocked for no reason.
      const prefilled = attempted && intendedStatus === "green";

      if (isDictation) {
        const targets = segment.clozeMetadata?.targets ?? [];
        return {
          ...base,
          // Pre-filled with the correct answers; blank or mistype one or more
          // to aim for yellow/red. Only `attempted` segments are ever sent.
          dictationInputs: targets.map((t) => (prefilled ? t.answer : "")),
          prefilled,
          todo: attempted && intendedStatus !== "green",
        };
      }

      return {
        ...base,
        userTranslation: prefilled ? segment.referenceTranslation : "",
        prefilled,
        todo: attempted && intendedStatus !== "green",
      };
    }),
  };
}

function buildTodoMarkdown(sources, answers, warnings) {
  const lines = [
    "# デモデータ オーサリング TODO",
    "",
    "`scripts/.demo-out/answers.json` を直接編集する。編集後: `node scripts/grade-demo-sessions.mjs`",
    "",
    "- **todo: true** の項目は空欄。意図した誤りを含む訳を書く。",
    "- **green** は参考訳がそのまま入っている。**言い換えること** — 参考訳と一字一句同じだと作り物に見える。",
    "- 採点器は意図に従わない。ズレは `grading-review.md` に出るので、そこを見て直す。",
    "",
  ];

  if (warnings.length > 0) {
    lines.push("## ⚠ 設計図と実際のズレ", "");
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  for (const [key, entry] of Object.entries(answers.sessions)) {
    const source = sources[key];
    const todo = entry.segments.filter((s) => s.todo);
    const greens = entry.segments.filter((s) => s.attempted && s.intendedStatus === "green");
    const counts = entry.segments.reduce((acc, s) => ({ ...acc, [s.intendedStatus]: (acc[s.intendedStatus] ?? 0) + 1 }), {});

    lines.push(
      `## ${key} — ${source.sourceLang}→${source.targetLang} / ${source.inputMode}`,
      "",
      `「${source.title}」 · ${source.segments.length} セグメント · ` +
        `green ${counts.green ?? 0} / yellow ${counts.yellow ?? 0} / red ${counts.red ?? 0} / neutral ${counts.neutral ?? 0}`,
      "",
    );

    if (todo.length > 0) {
      lines.push(`### 書くもの（${todo.length}件）`, "");
      for (const s of todo) {
        const segment = source.segments[s.index];
        lines.push(`**[${s.index}] 目標: ${s.intendedStatus}**`);
        lines.push(`- 原文: ${segment.sourceText.trim()}`);
        lines.push(`- 参考訳: ${segment.referenceTranslation}`);
        if (source.inputMode === "dictation") {
          const targets = segment.clozeMetadata?.targets ?? [];
          lines.push(`- 穴 (${targets.length}): ${targets.map((t) => `${t.index}="${t.answer}"`).join(", ")}`);
        }
        lines.push("");
      }
    }

    if (greens.length > 0 && source.inputMode !== "dictation") {
      lines.push(`### 言い換え推奨（${greens.length}件 — 参考訳のコピーが入っている）`, "");
      lines.push(greens.map((s) => `[${s.index}]`).join(" "), "");
    }
  }

  return lines.join("\n") + "\n";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const only = parseList(args.sessions);

  const blueprint = JSON.parse(readFileSync(join(SCRIPT_DIR, "demo-sessions.json"), "utf8"));
  const slotByKey = new Map(blueprint.sessions.map((s) => [s.key, s]));

  const sources = readOut("sources.json", null);
  if (!sources || Object.keys(sources).length === 0) {
    console.error("scripts/.demo-out/sources.json is missing or empty — run generate-demo-sources.mjs first.");
    process.exit(1);
  }

  const previous = readOut("answers.json", { sessions: {}, vocabulary: {} });
  const answers = { sessions: {}, vocabulary: previous.vocabulary ?? {} };
  const warnings = [];
  let kept = 0;
  let rebuilt = 0;

  for (const [key, source] of Object.entries(sources)) {
    const slot = slotByKey.get(key);
    if (!slot) {
      warnings.push(`${key}: present in sources.json but not in demo-sessions.json — skipped`);
      continue;
    }

    const existing = previous.sessions?.[key];
    if (existing && existing.sourceHash === source.sourceHash && (!only || !only.includes(key))) {
      answers.sessions[key] = existing;
      kept++;
      continue;
    }

    answers.sessions[key] = buildSessionEntry(source, slot, warnings);
    rebuilt++;
  }

  // Vocabulary can only be chosen once the text exists, so it is authored here
  // rather than in the blueprint. freeze-demo-sessions.mjs enforces that every
  // term actually occurs in its own session.
  for (const source of Object.values(sources)) {
    if (!answers.vocabulary[source.sourceLang]) answers.vocabulary[source.sourceLang] = [];
  }

  const answersFile = writeOut("answers.json", answers);
  const todoFile = writeOut("authoring-todo.md", buildTodoMarkdown(sources, answers, warnings));

  console.log(`answers.json: ${rebuilt} session(s) rebuilt, ${kept} preserved → ${answersFile}`);
  console.log(`authoring guide → ${todoFile}`);
  for (const w of warnings) console.warn(`  ⚠ ${w}`);
  console.log("\nEdit answers.json, then: node scripts/grade-demo-sessions.mjs");
}

main();
