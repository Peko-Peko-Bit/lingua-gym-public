import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { Session, SessionSummary } from "@/types";


// ---------------------------------------------------------------------------
// DB row → summary converter
// ---------------------------------------------------------------------------

type SummaryRow = {
  id: string;
  title: string;
  source_lang: string;
  target_lang: string;
  input_mode: string | null;
  updated_at: number;
  created_at: string;
  is_pinned: boolean;
  segments: { status: string; speaker_label: string | null }[];
};

function dbRowToSummary(row: SummaryRow): SessionSummary {
  const segments = row.segments ?? [];
  return {
    id: row.id,
    title: row.title,
    sourceLang: row.source_lang as SessionSummary["sourceLang"],
    targetLang: row.target_lang as SessionSummary["targetLang"],
    inputMode: ((row.input_mode === "text" ? "comprehension" : row.input_mode) ?? "comprehension") as SessionSummary["inputMode"],
    updatedAt: row.updated_at,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
    isPinned: row.is_pinned ?? false,
    segmentCount: segments.length,
    checkedCount: segments.filter(s => s.status !== "neutral").length,
    hasSpeakers: segments.some(s => s.speaker_label),
  };
}

// ---------------------------------------------------------------------------
// GET /api/sessions → SessionSummary[]
// (segment bodies and source_text are only served by GET /api/sessions/[id])
// ---------------------------------------------------------------------------

export async function GET() {
  const authClient = await createAuthServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createServerClient();

  const { data, error } = await sb
    .from("sessions")
    .select("id, title, source_lang, target_lang, input_mode, updated_at, created_at, is_pinned, segments(status, speaker_label)")
    .eq("user_id", user.id)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/sessions GET]", error.message);
    return NextResponse.json([], { status: 200 });
  }

  return NextResponse.json((data as SummaryRow[]).map(dbRowToSummary));
}

// ---------------------------------------------------------------------------
// POST /api/sessions → upsert session + replace segments
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const authClient = await createAuthServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = (await req.json()) as Session;
  const sb = createServerClient();

  // 他人のsession.idへの不正上書きをブロック
  const { data: existing } = await sb
    .from("sessions")
    .select("id")
    .eq("id", session.id)
    .maybeSingle();

  if (existing) {
    const { data: owned } = await sb
      .from("sessions")
      .select("id")
      .eq("id", session.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: sessionError } = await sb.from("sessions").upsert({
    id: session.id,
    title: session.title,
    source_lang: session.sourceLang,
    target_lang: session.targetLang,
    source_text: session.sourceText,
    source_file_url: session.sourceFileUrl ?? null,
    storage_provider: session.storageProvider ?? null,
    raw_ocr_output: session.rawOcrOutput ?? null,
    input_mode: session.inputMode ?? "comprehension",
    updated_at: session.updatedAt,
    user_id: user.id,
    // is_pinned intentionally omitted — managed by PATCH /:id
  });

  if (sessionError) {
    console.error("[api/sessions POST] upsert:", sessionError.message);
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  // Replace segments: upsert first, then delete stale rows.
  // (Never delete before the new data is safely written — an insert failure
  // after a blind delete would wipe the session's segments.)
  if (session.segments.length > 0) {
    const { error: segError } = await sb.from("segments").upsert(
      session.segments.map((seg, i) => ({
        id: seg.id,
        session_id: session.id,
        source_text: seg.sourceText,
        speaker_label: seg.speakerLabel ?? null,
        user_translation: seg.userTranslation,
        reference_translation: seg.referenceTranslation,
        status: seg.status,
        advice: seg.advice ?? null,
        reason: seg.reason ?? null,
        checked_at: seg.checked_at ?? null,
        cloze_metadata: seg.cloze_metadata ?? null,
        bounding_box: seg.boundingBox ?? null,
        sort_order: i,
      }))
    );
    if (segError) {
      console.error("[api/sessions POST] segments upsert:", segError.message);
      return NextResponse.json({ error: segError.message }, { status: 500 });
    }
  }

  const { data: existingSegs, error: listError } = await sb
    .from("segments")
    .select("id")
    .eq("session_id", session.id);
  if (listError) {
    console.error("[api/sessions POST] segments list:", listError.message);
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const keepIds = new Set(session.segments.map(seg => seg.id));
  const staleIds = (existingSegs ?? []).map(r => r.id).filter(id => !keepIds.has(id));
  if (staleIds.length > 0) {
    const { error: delError } = await sb.from("segments").delete().in("id", staleIds);
    if (delError) {
      console.error("[api/sessions POST] segments delete:", delError.message);
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
