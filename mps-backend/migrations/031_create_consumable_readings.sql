CREATE TABLE IF NOT EXISTS consumable_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meter_reading_id UUID NOT NULL REFERENCES meter_readings(id) ON DELETE CASCADE,
  printer_id UUID NOT NULL REFERENCES printers(id),
  billing_cycle_id UUID NOT NULL REFERENCES billing_cycles(id),
  submitted_by_user_id UUID REFERENCES users(id),
  c_pct INTEGER,
  m_pct INTEGER,
  y_pct INTEGER,
  k_pct INTEGER,
  r1_pct INTEGER,
  r2_pct INTEGER,
  r3_pct INTEGER,
  r4_pct INTEGER,
  waste_toner_pct INTEGER,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (printer_id, billing_cycle_id)
);
