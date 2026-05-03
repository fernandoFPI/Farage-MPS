CREATE TABLE IF NOT EXISTS meter_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  printer_id UUID NOT NULL REFERENCES printers(id),
  billing_cycle_id UUID NOT NULL REFERENCES billing_cycles(id),
  submitted_by_user_id UUID REFERENCES users(id),
  source VARCHAR(20) NOT NULL CHECK (source IN ('odoo', 'xsm', 'manual')),
  a4_bw INT NOT NULL DEFAULT 0,
  a3_bw INT NOT NULL DEFAULT 0,
  a4_color INT NOT NULL DEFAULT 0,
  a3_color INT NOT NULL DEFAULT 0,
  read_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
