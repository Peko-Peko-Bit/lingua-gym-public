-- Migration 004: Add part_of_speech column to vocabulary
-- Run this in the Supabase SQL Editor

ALTER TABLE vocabulary
  ADD COLUMN IF NOT EXISTS part_of_speech TEXT;
-- NULL = phrase (2+ words) or undetermined
-- Example values: noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection
