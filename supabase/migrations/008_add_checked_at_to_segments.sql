ALTER TABLE segments
  ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS segments_checked_at_idx ON segments(checked_at DESC);
