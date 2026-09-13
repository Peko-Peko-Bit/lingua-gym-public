import { createServerClient } from "@/lib/supabase-server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";

import esDemo from "@/data/demo/es.json";
import enDemo from "@/data/demo/en.json";
import jaDemo from "@/data/demo/ja.json";
import koDemo from "@/data/demo/ko.json";
import caDemo from "@/data/demo/ca.json";
import zhDemo from "@/data/demo/zh.json";
import frDemo from "@/data/demo/fr.json";

/**
 * Guest demo data.
 *
 * A brand-new guest lands on an empty session list, which makes the app look
 * unused. On first entry we insert a frozen set of practice sessions
 * (data/demo/*.json) so the sidebar, the progress rings and the vocabulary
 * book all have something to show.
 *
 * The fixtures were produced once by driving the real API routes
 * (scripts/generate-demo-sources.mjs → grade-demo-sessions.mjs): the reference
 * translations, the gradings and the cloze exercises are genuine model output.
 * Seeding therefore costs no LLM call — it is a plain insert.
 *
 * Dates are stored as offsets, not timestamps, and are materialised against
 * "now" on every seed, so the history still reads as "the last two weeks"
 * however long ago the fixtures were recorded.
 *
 * NEVER import this file from a client component — it holds the service_role
 * client and would drag ~200 KB of fixtures into the browser bundle. For the
 * same reason the callers must stay on the node runtime, not edge.
 */

// ---------------------------------------------------------------------------
// Fixture types
//
// Fields the DB constrains to a union (status, input_mode, type) are typed as
// plain `string` here on purpose: TypeScript widens JSON imports to `string`,
// so a union would make every fixture file fail to assign. The DB CHECK
// constraints and scripts/freeze-demo-sessions.mjs are what enforce the values.
// ---------------------------------------------------------------------------

interface DemoSegment {
  sourceText: string;
  speakerLabel: string | null;
  referenceTranslation: string;
  userTranslation: string;
  status: string;
  reason: string | null;
  advice: string | null;
  /** null for an ungraded segment — must stay in step with status === "neutral". */
  checkedMinuteOffset: number | null;
  clozeMetadata: Record<string, unknown> | null;
}

interface DemoSession {
  key: string;
  title: string;
  targetLang: string;
  inputMode: string;
  isPinned: boolean;
  dayOffset: number;
  time: string;
  updatedMinuteOffset: number;
  sourceText: string;
  segments: DemoSegment[];
}

interface DemoVocabularyEntry {
  term: string;
  translation: string;
  type: string;
  partOfSpeech: string | null;
  targetLang: string;
  sessionKey: string;
  minuteOffset: number;
}

interface DemoFixture {
  sourceLang: string;
  sessions: DemoSession[];
  vocabulary: DemoVocabularyEntry[];
}

const DEMO_FIXTURES: DemoFixture[] = [esDemo, enDemo, jaDemo, koDemo, caDemo, zhDemo, frDemo];

/** Vocabulary saved from LinguaGym is tagged so the shared table stays attributable. */
const SOURCE_APP = "lingua_gym";

export interface SeedResult {
  seeded: boolean;
  reason: "seeded" | "already-seeded" | "not-a-guest" | "no-user" | "error";
}

// ---------------------------------------------------------------------------
// Offset → timestamp
// ---------------------------------------------------------------------------

/**
 * Resolve a fixture offset against `now`.
 *
 * sessions.updated_at is BIGINT epoch milliseconds while created_at,
 * segments.checked_at and vocabulary.created_at are timestamptz (see toIso).
 * Mixing the two up lands rows in 1970 without any error, and the sidebar hides
 * it because its date label reads created_at first — only the ordering breaks.
 */
function toEpochMs(now: Date, dayOffset: number, time: string, minuteOffset: number): number {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(now);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes + minuteOffset, 0, 0);
  return date.getTime();
}

const toIso = (epochMs: number) => new Date(epochMs).toISOString();

// ---------------------------------------------------------------------------
// Row building
// ---------------------------------------------------------------------------

/**
 * Ids are derived from the user id rather than minted randomly.
 *
 * They still cannot collide between two guests (the user id is in them), but
 * they ARE stable across repeated seeds of the same guest — which is what lets
 * the inserts below be a conflict-ignoring upsert. That is the only defence
 * that survives two concurrent renders landing on different serverless
 * instances, where the in-flight lock cannot reach.
 */
const sessionId = (userId: string, key: string) => `session-demo-${userId}-${key}`;
const segmentId = (userId: string, key: string, index: number) => `seg-demo-${userId}-${key}-${index}`;
const vocabularyId = (userId: string, index: number) => `vocab-demo-${userId}-${index}`;

function buildRows(userId: string, now: Date) {
  const sessions: Record<string, unknown>[] = [];
  const segments: Record<string, unknown>[] = [];
  const vocabulary: Record<string, unknown>[] = [];

  let vocabularyIndex = 0;

  for (const fixture of DEMO_FIXTURES) {
    for (const session of fixture.sessions) {
      const id = sessionId(userId, session.key);
      const startedAt = toEpochMs(now, session.dayOffset, session.time, 0);

      sessions.push({
        id,
        title:            session.title,
        source_lang:      fixture.sourceLang,
        target_lang:      session.targetLang,
        source_text:      session.sourceText,
        source_file_url:  null,
        storage_provider: null,
        raw_ocr_output:   null,
        input_mode:       session.inputMode,
        // Keeps the sidebar ordered by real recency instead of all-at-once.
        updated_at:       toEpochMs(now, session.dayOffset, session.time, session.updatedMinuteOffset),
        created_at:       toIso(startedAt),
        is_pinned:        session.isPinned,
        user_id:          userId,
      });

      session.segments.forEach((segment, index) => {
        segments.push({
          id:                    segmentId(userId, session.key, index),
          session_id:            id,
          source_text:           segment.sourceText,
          speaker_label:         segment.speakerLabel,
          user_translation:      segment.userTranslation,
          reference_translation: segment.referenceTranslation,
          status:                segment.status,
          advice:                segment.advice,
          reason:                segment.reason,
          checked_at:            segment.checkedMinuteOffset === null
            ? null
            : toIso(toEpochMs(now, session.dayOffset, session.time, segment.checkedMinuteOffset)),
          cloze_metadata:        segment.clozeMetadata,
          bounding_box:          null,
          sort_order:            index,
        });
      });
    }

    for (const entry of fixture.vocabulary) {
      const session = fixture.sessions.find((s) => s.key === entry.sessionKey);
      if (!session) continue;

      vocabulary.push({
        id:            vocabularyId(userId, vocabularyIndex++),
        term:          entry.term,
        translation:   entry.translation,
        source_lang:   fixture.sourceLang,
        target_lang:   entry.targetLang,
        type:          entry.type,
        part_of_speech: entry.partOfSpeech,
        session_id:    sessionId(userId, entry.sessionKey),
        // Snapshot of the title at save time — that is what the app stores.
        session_title: session.title,
        source_app:    SOURCE_APP,
        created_at:    toIso(toEpochMs(now, session.dayOffset, session.time, entry.minuteOffset)),
        user_id:       userId,
      });
    }
  }

  return { sessions, segments, vocabulary };
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** Collapses a concurrent page render and a stray POST /api/guest/seed. */
const inFlight = new Map<string, Promise<SeedResult>>();

/**
 * Users this process has already settled, so re-rendering `/` does not cost a
 * SELECT every time. Bounded because a warm instance can serve many guests.
 */
const settled = new Set<string>();
const SETTLED_CACHE_LIMIT = 500;

/**
 * Seeding is a nice-to-have; the page must never wait on it longer than this.
 *
 * The insert is three sequential round trips (existence check, sessions, then
 * segments+vocabulary in parallel) carrying ~150 KB, so the wall clock is
 * dominated by latency to Supabase — a few hundred milliseconds from Vercel,
 * but seconds over a slow or VPN'd dev connection. The ceiling is set well
 * above the production figure on purpose: overshooting it costs a guest one
 * empty-looking first load, which is the exact thing this feature exists to
 * prevent. Giving up here only stops us waiting; the insert still lands, so the
 * next load finds the data.
 */
const SEED_DEADLINE_MS = 12000;

export async function seedGuestForUser(userId: string): Promise<SeedResult> {
  const pending = inFlight.get(userId);
  if (pending) return pending;

  const run = (async (): Promise<SeedResult> => {
    const supabase = createServerClient();

    const { data: existing } = await supabase
      .from("sessions")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (existing && existing.length > 0) return { seeded: false, reason: "already-seeded" };

    const { sessions, segments, vocabulary } = buildRows(userId, new Date());

    try {
      // Conflict-ignoring upserts: deterministic ids make a repeat seed a no-op
      // rather than a duplicate, which is what makes this safe when the check
      // above races with another instance.
      const { error: sessionError } = await supabase
        .from("sessions")
        .upsert(sessions, { ignoreDuplicates: true });
      if (sessionError) throw new Error(`sessions: ${sessionError.message}`);

      // Both reference the sessions above (segments by FK, vocabulary by
      // session_id), so they cannot go first — but they are independent of each
      // other, which saves one round trip on a slow link.
      const [segmentResult, vocabularyResult] = await Promise.all([
        supabase.from("segments").upsert(segments, { ignoreDuplicates: true }),
        supabase.from("vocabulary").upsert(vocabulary, { ignoreDuplicates: true }),
      ]);
      if (segmentResult.error) throw new Error(`segments: ${segmentResult.error.message}`);
      if (vocabularyResult.error) throw new Error(`vocabulary: ${vocabularyResult.error.message}`);
    } catch (err) {
      console.error("[guest-seed] failed:", err instanceof Error ? err.message : err);
      return { seeded: false, reason: "error" };
    }

    return { seeded: true, reason: "seeded" };
  })();

  inFlight.set(userId, run);
  try {
    const result = await run;
    if (result.reason !== "error") {
      if (settled.size >= SETTLED_CACHE_LIMIT) settled.clear();
      settled.add(userId);
    }
    return result;
  } finally {
    inFlight.delete(userId);
  }
}

/**
 * Entry point for `app/` — resolves the current user, seeds if they are a
 * first-time guest, and never throws or hangs. `/` is the app's only page, so
 * this is the one place every entry path goes through: the login button, a
 * cross-app hop from LinguaCoach (which skips our login page entirely, since
 * proxy.ts bounces an already-authenticated user away from it), the installed
 * PWA, and a plain bookmark.
 */
export async function seedGuestIfNeeded(): Promise<SeedResult> {
  try {
    const authClient = await createAuthServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return { seeded: false, reason: "no-user" };

    // Anonymous users have an empty app_metadata (no provider key), so
    // is_anonymous is the only reliable flag — checking the provider silently
    // skips every guest, which is what the previous stub did.
    if (user.is_anonymous !== true) return { seeded: false, reason: "not-a-guest" };
    if (settled.has(user.id)) return { seeded: false, reason: "already-seeded" };

    const deadline = new Promise<SeedResult>((resolve) =>
      setTimeout(() => resolve({ seeded: false, reason: "error" }), SEED_DEADLINE_MS)
    );
    return await Promise.race([seedGuestForUser(user.id), deadline]);
  } catch (err) {
    console.error("[guest-seed] skipped:", err instanceof Error ? err.message : err);
    return { seeded: false, reason: "error" };
  }
}
