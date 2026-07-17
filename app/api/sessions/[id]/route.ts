import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { Session, Segment } from "@/types";


// ---------------------------------------------------------------------------
// DB row → domain type converters (duplicated from ../route.ts for edge isolation)
// ---------------------------------------------------------------------------

function dbSegmentToSegment(row: Record<string, unknown>): Segment {
  return {
    id: row.id as string,
    sourceText: row.source_text as string,
    speakerLabel: (row.speaker_label as string | null) ?? undefined,
    userTranslation: row.user_translation as string,
    referenceTranslation: row.reference_translation as string,
    status: row.status as Segment["status"],
    advice: (row.advice as string | null) ?? undefined,
    reason: (row.reason as string | null) ?? undefined,
    checked_at: (row.checked_at as string | null) ?? null,
    cloze_metadata: (row.cloze_metadata as Segment["cloze_metadata"]) ?? null,
    boundingBox: (row.bounding_box as Segment["boundingBox"] | null) ?? undefined,
  };
}

type SessionRow = {
  id: string; title: string; source_lang: string; target_lang: string;
  source_text: string; source_file_url: string | null; storage_provider: string | null;
  raw_ocr_output: string | null; input_mode: string | null; updated_at: number;
  created_at: string; is_pinned: boolean; segments: Record<string, unknown>[];
};

function dbSessionToSession(row: SessionRow): Session {
  return {
    id: row.id, title: row.title,
    sourceLang: row.source_lang as Session["sourceLang"],
    targetLang: row.target_lang as Session["targetLang"],
    sourceText: row.source_text,
    sourceFileUrl: row.source_file_url ?? undefined,
    storageProvider: (row.storage_provider as Session["storageProvider"]) ?? undefined,
    rawOcrOutput: row.raw_ocr_output ?? undefined,
    inputMode: ((row.input_mode === "text" ? "comprehension" : row.input_mode) ?? "comprehension") as Session["inputMode"],
    updatedAt: row.updated_at,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
    isPinned: row.is_pinned ?? false,
    segments: (row.segments ?? [])
      .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
      .map(dbSegmentToSegment),
  };
}

// ---------------------------------------------------------------------------
// GET /api/sessions/:id → Session
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createAuthServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sb = createServerClient();

  const { data, error } = await sb
    .from("sessions")
    .select("*, segments(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json(null, { status: 404 });
  }
  return NextResponse.json(dbSessionToSession(data as SessionRow));
}

// ---------------------------------------------------------------------------
// DELETE /api/sessions/:id → delete session (cascades to segments)
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createAuthServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sb = createServerClient();

  const { error } = await sb.from("sessions").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[api/sessions DELETE]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// PATCH /api/sessions/:id
//   { action: "pin",    isPinned: boolean }
//   { action: "rename", title: string }
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createAuthServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { action: string; isPinned?: boolean; title?: string };
  const sb = createServerClient();

  let updatePayload: Record<string, unknown>;

  if (body.action === "pin") {
    updatePayload = { is_pinned: body.isPinned };
  } else if (body.action === "rename") {
    updatePayload = { title: body.title };
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error } = await sb.from("sessions").update(updatePayload).eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[api/sessions PATCH]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
