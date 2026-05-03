CREATE TABLE IF NOT EXISTS printer_import_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  imported_by_user_id UUID REFERENCES users(id),
  filename VARCHAR(255) NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  created_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
