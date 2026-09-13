import MainEditor from "@/components/layout/MainEditor";
import { seedGuestIfNeeded } from "@/lib/guest-seed";

/**
 * `/` is the app's only page, so it is also the only place every entry path
 * passes through — which is why first-guest seeding happens here rather than in
 * the login button. A guest who signed in on LinguaCoach never sees our login
 * page at all (proxy.ts bounces an authenticated user away from /login), and
 * the installed PWA opens straight here too.
 *
 * Awaiting the seed means MainEditor's mount fetch already sees the rows, so
 * there is no empty-then-filled flash and no reload. seedGuestIfNeeded() never
 * throws and gives up after 8s, so a slow or broken seed degrades to an empty
 * (but working) account rather than a page that will not load.
 *
 * Reading the session cookie makes this route dynamic. That is the intended
 * trade: proxy.ts already calls getUser() on every request, so the marginal
 * cost is one indexed SELECT, and only for anonymous users.
 */
export default async function Home() {
  await seedGuestIfNeeded();

  return (
    <main className="min-h-screen">
      <MainEditor />
    </main>
  );
}
