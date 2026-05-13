-- Add dedicated odoo_integration role
INSERT INTO roles (
  id, name, description,
  can_submit_readings, can_manage_billing, can_confirm_billing,
  can_manage_contracts, can_manage_users, can_push_to_odoo,
  created_at
) VALUES (
  uuid_generate_v4(),
  'odoo_integration',
  'Dedicated role for Odoo ERP integration — read-only access to confirmed billing data',
  false, false, false, false, false, true,
  NOW()
) ON CONFLICT (name) DO NOTHING;

-- Invoice audit log table
CREATE TABLE IF NOT EXISTS invoice_logs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_cycle_id UUID NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
  success          BOOLEAN NOT NULL DEFAULT true,
  odoo_invoice_id  VARCHAR(200),
  attempt_number   INTEGER NOT NULL DEFAULT 1,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
