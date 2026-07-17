-- LinguaGym Database Schema
-- Run this in the Supabase SQL Editor (https://app.supabase.com → SQL Editor)

-- ============================================================
-- sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL DEFAULT 'Untitled Session',
  source_lang      TEXT NOT NULL,
  target_lang      TEXT NOT NULL,
  source_text      TEXT NOT NULL DEFAULT '',
  -- Media / OCR fields
  source_file_url  TEXT,                           -- URL in Supabase Storage or GCS
  storage_provider TEXT CHECK (storage_provider IN ('supabase', 'gcs')),
  raw_ocr_output   TEXT,                           -- Raw full text from OCR (pre-segmentation)
  -- Timestamps
  updated_at       BIGINT NOT NULL,                -- Date.now() milliseconds
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- segments
-- ============================================================
CREATE TABLE IF NOT EXISTS segments (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source_text           TEXT NOT NULL DEFAULT '',
  user_translation      TEXT NOT NULL DEFAULT '',
  reference_translation TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'neutral'
                          CHECK (status IN ('neutral', 'red', 'yellow', 'green')),
  advice                TEXT,
  reason                TEXT,
  bounding_box          JSONB,  -- { x, y, width, height } from OCR
  sort_order            INTEGER NOT NULL DEFAULT 0
);

-- Index for fast segment lookup by session
CREATE INDEX IF NOT EXISTS segments_session_id_idx ON segments(session_id);
-- Index for fast session lookup by recency
CREATE INDEX IF NOT EXISTS sessions_updated_at_idx ON sessions(updated_at DESC);

-- ============================================================
-- Supabase Storage bucket
-- Run separately in Supabase Dashboard → Storage → New Bucket
-- ============================================================
-- Bucket name : session-files
-- Public      : false  (serve via signed URLs)
-- File size   : 50 MB per file (sufficient for images/PDFs)
