import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";


// ---------------------------------------------------------------------------
// DELETE /api/vocabulary/:id
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

  const { error } = await sb.from("vocabulary").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[api/vocabulary DELETE]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// PATCH /api/vocabulary/:id
//   { term: string, partOfSpeech: string | null, translation: string }
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createAuthServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { term, partOfSpeech, translation, type } = await req.json() as {
    term: string;
    partOfSpeech: string | null;
    translation: string;
    type?: "word" | "phrase";
  };
  const sb = createServerClient();

  const { error } = await sb
    .from("vocabulary")
    .update({ term, part_of_speech: partOfSpeech, translation, type: type ?? "word" })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[api/vocabulary PATCH]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
