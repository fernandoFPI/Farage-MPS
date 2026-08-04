ALTER TABLE billing_cycles
  ADD COLUMN IF NOT EXISTS odoo_status VARCHAR(20) DEFAULT NULL
    CHECK (odoo_status IN ('pending', 'synced', 'partial', 'error')),
  ADD COLUMN IF NOT EXISTS odoo_orders JSONB NOT NULL DEFAULT '[]';
