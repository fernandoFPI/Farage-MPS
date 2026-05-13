CREATE TABLE IF NOT EXISTS billing_cycle_city_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_cycle_id UUID NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
  city VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'partial', 'complete', 'confirmed')),
  total_printers INTEGER NOT NULL DEFAULT 0,
  submitted_printers INTEGER NOT NULL DEFAULT 0,
  confirmed_by_user_id UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (billing_cycle_id, city)
);
