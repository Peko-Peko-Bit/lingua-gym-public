-- ============================================================
-- Migration 005: Row Level Security (RLS)
-- ============================================================
-- Phase 1: Single-user protection (run now)
--   → Only the service_role key (used server-side) can write.
--     The anon key (exposed in browser) becomes read-only at best,
--     but with the policies below it gets NO access at all,
--     making the public anon key harmless even if leaked.
--
-- Phase 2: Multi-user (future — Supabase Auth)
--   → Add user_id columns, change policies to auth.uid() = user_id.
--   → Steps are marked [PHASE 2] below so they are easy to find.
-- ============================================================


-- ============================================================
-- STEP 1: Add user_id columns (nullable for now)
-- ============================================================
-- These columns are intentionally NULL in Phase 1.
-- When you introduce Supabase Auth, populate them and flip the policies.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE vocabulary
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- segments inherit ownership via sessions.session_id → no user_id needed here.

-- Index for future per-user queries
CREATE INDEX IF NOT EXISTS sessions_user_id_idx  ON sessions(user_id);
CREATE INDEX IF NOT EXISTS vocabulary_user_id_idx ON vocabulary(user_id);


-- ============================================================
-- STEP 2: Enable RLS on all tables
-- ============================================================

ALTER TABLE sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 3: Phase 1 policies — deny anon, allow service_role
-- ============================================================
-- service_role bypasses RLS automatically in Supabase,
-- so we only need to handle the anon role here.
-- Result: anon key (in browser) → zero access to any table.

-- sessions
DROP POLICY IF EXISTS "anon_no_access_sessions"   ON sessions;
CREATE POLICY "anon_no_access_sessions"
  ON sessions FOR ALL TO anon USING (false);

-- segments
DROP POLICY IF EXISTS "anon_no_access_segments"   ON segments;
CREATE POLICY "anon_no_access_segments"
  ON segments FOR ALL TO anon USING (false);

-- vocabulary
DROP POLICY IF EXISTS "anon_no_access_vocabulary" ON vocabulary;
CREATE POLICY "anon_no_access_vocabulary"
  ON vocabulary FOR ALL TO anon USING (false);


-- ============================================================
-- [PHASE 2] Future policies — uncomment when Auth is enabled
-- ============================================================
-- When you add Supabase Auth:
--   1. Remove the "anon_no_access_*" policies above.
--   2. Populate user_id for existing rows:
--        UPDATE sessions   SET user_id = '<your-user-uuid>';
--        UPDATE vocabulary SET user_id = '<your-user-uuid>';
--   3. Uncomment and run the policies below.
--
-- -- sessions: owner access only
-- CREATE POLICY "owner_sessions"
--   ON sessions FOR ALL TO authenticated
--   USING      (auth.uid() = user_id)
--   WITH CHECK (auth.uid() = user_id);
--
-- -- segments: accessible when parent session belongs to user
-- CREATE POLICY "owner_segments"
--   ON segments FOR ALL TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM sessions s
--       WHERE s.id = segments.session_id
--         AND s.user_id = auth.uid()
--     )
--   );
--
-- -- vocabulary: owner access only
-- CREATE POLICY "owner_vocabulary"
--   ON vocabulary FOR ALL TO authenticated
--   USING      (auth.uid() = user_id)
--   WITH CHECK (auth.uid() = user_id);
-- ============================================================
