import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // pg_cron からのみ呼ばれる想定。シークレット未設定時も全拒否（fail-closed）
  const secret = Deno.env.get("CLEANUP_SECRET");
  if (!secret || req.headers.get("x-cleanup-secret") !== secret) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 匿名ユーザーは app_metadata.provider を持たない（is_anonymous フラグで判定する）
  const expiredGuests = [];
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) return new Response(JSON.stringify({ error }), { status: 500 });
    expiredGuests.push(
      ...data.users.filter((u) => u.is_anonymous === true && u.created_at < cutoff)
    );
    if (data.users.length < perPage) break;
  }

  for (const guest of expiredGuests) {
    // LinguaCoach: messages には CASCADE がないため threads より先に削除する
    const { data: threads } = await supabase
      .from("threads")
      .select("id")
      .eq("user_id", guest.id);
    if (threads && threads.length > 0) {
      const threadIds = threads.map((t: { id: string }) => t.id);
      await supabase.from("messages").delete().in("thread_id", threadIds);
    }
    await supabase.from("threads").delete().eq("user_id", guest.id);
    await supabase.from("vocabulary").delete().eq("user_id", guest.id);
    await supabase.from("grammar_progress").delete().eq("user_id", guest.id);
    await supabase.from("grammar_settings").delete().eq("user_id", guest.id);
    await supabase.from("rate_limits").delete().eq("user_id", guest.id);

    // LinguaGym: segments は sessions に ON DELETE CASCADE のため sessions 削除で連鎖削除される
    await supabase.from("sessions").delete().eq("user_id", guest.id);

    await supabase.auth.admin.deleteUser(guest.id);
  }

  return new Response(
    JSON.stringify({ deleted: expiredGuests.length }),
    { status: 200 }
  );
});
