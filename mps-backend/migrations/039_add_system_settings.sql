CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES users(id)
);

INSERT INTO system_settings (key, value) VALUES
  ('show_calculation_details', 'true')
ON CONFLICT (key) DO NOTHING;
