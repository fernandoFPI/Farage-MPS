CREATE TABLE IF NOT EXISTS customer_storage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  printer_model VARCHAR(150) NOT NULL,
  is_bw_only BOOLEAN NOT NULL DEFAULT false,
  c_qty INTEGER NOT NULL DEFAULT 0,
  m_qty INTEGER NOT NULL DEFAULT 0,
  y_qty INTEGER NOT NULL DEFAULT 0,
  k_qty INTEGER NOT NULL DEFAULT 0,
  r1_qty INTEGER NOT NULL DEFAULT 0,
  r2_qty INTEGER NOT NULL DEFAULT 0,
  r3_qty INTEGER NOT NULL DEFAULT 0,
  r4_qty INTEGER NOT NULL DEFAULT 0,
  waste_toner_qty INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID REFERENCES users(id),
  UNIQUE (customer_id, printer_model)
);

CREATE TABLE IF NOT EXISTS customer_storage_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_storage_id UUID NOT NULL REFERENCES customer_storage(id),
  billing_cycle_id UUID REFERENCES billing_cycles(id),
  c_qty INTEGER NOT NULL DEFAULT 0,
  m_qty INTEGER NOT NULL DEFAULT 0,
  y_qty INTEGER NOT NULL DEFAULT 0,
  k_qty INTEGER NOT NULL DEFAULT 0,
  r1_qty INTEGER NOT NULL DEFAULT 0,
  r2_qty INTEGER NOT NULL DEFAULT 0,
  r3_qty INTEGER NOT NULL DEFAULT 0,
  r4_qty INTEGER NOT NULL DEFAULT 0,
  waste_toner_qty INTEGER NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_by_user_id UUID REFERENCES users(id)
);
