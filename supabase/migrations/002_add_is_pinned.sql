-- Migration 002: Add is_pinned column to sessions
-- Run this in the Supabase SQL Editor

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

-- Index for the new sort order: pinned first, then newest first
CREATE INDEX IF NOT EXISTS sessions_sort_idx
  ON sessions(is_pinned DESC, created_at DESC);
