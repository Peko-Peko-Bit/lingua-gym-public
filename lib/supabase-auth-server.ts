import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Auth-aware server client — reads/writes the session cookie.
 * Use in Route Handlers, Server Actions and Server Components to get the
 * current user (see setAll below for why Server Components are safe).
 * For DB operations, continue using createServerClient() from supabase-server.ts.
 */
export async function createAuthServerClient() {
  const cookieStore = await cookies();
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, { ...options, domain });
            });
          } catch {
            // Server Components get a read-only cookie store, so a token refresh
            // triggered from one would throw here and take the whole page down.
            // Nothing is lost by ignoring it: proxy.ts runs the same refresh on
            // every request and writes the cookies from middleware, where it is
            // allowed. Route Handlers and Server Actions still write normally.
          }
        },
      },
    }
  );
}
