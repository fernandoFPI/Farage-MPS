ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS odoo_company VARCHAR(20) DEFAULT NULL
  CHECK (odoo_company IN ('FPI', 'AL Farage'));
