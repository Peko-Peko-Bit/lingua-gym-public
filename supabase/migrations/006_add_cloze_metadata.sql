-- Migration 006: Add cloze_metadata column to segments (Dictation mode)
-- Run this in the Supabase SQL Editor

ALTER TABLE segments
  ADD COLUMN IF NOT EXISTS cloze_metadata JSONB;
-- NULL = not yet generated
-- Structure: { display_template: string, targets: [{index, answer, hint}] }
