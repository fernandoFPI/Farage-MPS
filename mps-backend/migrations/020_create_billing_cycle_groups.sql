CREATE TABLE IF NOT EXISTS billing_cycle_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  created_by_user_id UUID REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'confirmed', 'invoiced')),
  odoo_invoice_id VARCHAR(150),
  invoiced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE billing_cycles
ADD COLUMN IF NOT EXISTS cycle_group_id UUID REFERENCES billing_cycle_groups(id),
ADD COLUMN IF NOT EXISTS group_position INTEGER;
