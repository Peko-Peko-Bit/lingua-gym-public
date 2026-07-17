-- Migration 003: Add vocabulary table
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS vocabulary (
  id            TEXT PRIMARY KEY,
  term          TEXT NOT NULL,          -- selected word / phrase
  translation   TEXT NOT NULL,          -- user-confirmed translation
  source_lang   TEXT NOT NULL,
  target_lang   TEXT NOT NULL,
  session_id    TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  session_title TEXT NOT NULL DEFAULT '',  -- snapshot at time of adding
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vocabulary_created_at_idx ON vocabulary(created_at DESC);
CREATE INDEX IF NOT EXISTS vocabulary_session_id_idx ON vocabulary(session_id);
