-- ============================================================
-- Migration 010: RLS Phase 2 — Supabase Auth owner policies
-- ============================================================
-- Drops the Phase 1 anon-block policies and replaces them with
-- per-user owner policies for authenticated users.
-- service_role (server-side) continues to bypass RLS automatically.
-- ============================================================


-- ============================================================
-- STEP 1: Drop Phase 1 anon-block policies
-- ============================================================

DROP POLICY IF EXISTS "anon_no_access_sessions"   ON sessions;
DROP POLICY IF EXISTS "anon_no_access_segments"   ON segments;
DROP POLICY IF EXISTS "anon_no_access_vocabulary" ON vocabulary;


-- ============================================================
-- STEP 2: Phase 2 owner policies (authenticated users only)
-- ============================================================

-- sessions: owner access only
CREATE POLICY "owner_sessions"
  ON sessions FOR ALL TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- segments: accessible when parent session belongs to user
CREATE POLICY "owner_segments"
  ON segments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = segments.session_id
        AND s.user_id = auth.uid()
    )
  );

-- vocabulary: owner access only
CREATE POLICY "owner_vocabulary"
  ON vocabulary FOR ALL TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
