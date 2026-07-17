import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { VocabularyEntry, LanguageCode } from "@/types";


type VocabRow = {
  id: string; term: string; translation: string;
  source_lang: string; target_lang: string;
  type: string | null;
  part_of_speech: string | null;
  session_id: string | null; session_title: string;
  created_at: string;
  source_app: string | null;
};

function dbRowToEntry(row: VocabRow): VocabularyEntry {
  return {
    id: row.id, term: row.term, translation: row.translation,
    sourceLang: row.source_lang as LanguageCode,
    targetLang: row.target_lang as LanguageCode,
    type: (row.type as "word" | "phrase" | null) ?? "word",
    partOfSpeech: row.part_of_speech ?? undefined,
    sessionId: row.session_id ?? undefined,
    sessionTitle: row.session_title,
    createdAt: row.created_at,
    sourceApp: row.source_app ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// GET /api/vocabulary â†’ VocabularyEntry[]
// ---------------------------------------------------------------------------

export async function GET() {
  const authClient = await createAuthServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from("vocabulary")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/vocabulary GET]", error.message);
    return NextResponse.json([], { status: 200 });
  }
  return NextResponse.json((data as VocabRow[]).map(dbRowToEntry));
}

// ---------------------------------------------------------------------------
// POST /api/vocabulary â†’ VocabularyEntry (new entry)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const authClient = await createAuthServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entry = await req.json() as Omit<VocabularyEntry, "id" | "createdAt">;
  const sb = createServerClient();

  const id = `vocab-${crypto.randomUUID()}`;

  const { data, error } = await sb
    .from("vocabulary")
    .insert({
      id,
      term: entry.term,
      translation: entry.translation,
      source_lang: entry.sourceLang,
      target_lang: entry.targetLang,
      type: entry.type ?? "word",
      part_of_speech: entry.partOfSpeech ?? null,
      session_id: entry.sessionId ?? null,
      session_title: entry.sessionTitle,
      source_app: "lingua_gym",
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/vocabulary POST]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(dbRowToEntry(data as VocabRow));
}

