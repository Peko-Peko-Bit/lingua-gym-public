import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { seedGuestForUser } from "@/lib/guest-seed";

/**
 * Manual re-seed hook for a guest account.
 *
 * Nothing in the app calls this — `/` seeds on render (app/page.tsx), which is
 * the path every guest actually takes. It is kept as a debugging/manual entry
 * point and to keep the API surface symmetric with LinguaCoach, whose client
 * component does have to POST here. Do not delete it as dead code.
 *
 * Seeding is idempotent, so calling this on an already-seeded guest is a no-op.
 */
export async function POST() {
  const authClient = await createAuthServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Anonymous users have an empty app_metadata (no provider key), so
  // is_anonymous is the only reliable flag. The previous check here read
  // app_metadata.provider, which every guest passes straight through.
  if (user.is_anonymous !== true) {
    return NextResponse.json({ message: "Not a guest user", seeded: false }, { status: 200 });
  }

  const result = await seedGuestForUser(user.id);

  // Always 200: the caller only distinguishes on `seeded`, and a failed seed
  // must never look like a broken session.
  return NextResponse.json({ message: result.reason, seeded: result.seeded }, { status: 200 });
}
