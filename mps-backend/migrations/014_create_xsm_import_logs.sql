CREATE TABLE IF NOT EXISTS xsm_import_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  imported_by_user_id UUID REFERENCES users(id),
  filename VARCHAR(255) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  matched_rows INTEGER NOT NULL DEFAULT 0,
  unmatched_rows INTEGER NOT NULL DEFAULT 0,
  flagged_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  errors JSONB,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
