-- Migration 007: Add input_mode column to sessions
-- 練習モード ('text' / 'listening' / 'dictation' / 'media') を保存する

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS input_mode TEXT DEFAULT 'text';
UPDATE sessions SET input_mode = 'text' WHERE input_mode IS NULL;
