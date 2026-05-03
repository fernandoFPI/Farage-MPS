ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS invoice_frequency VARCHAR(30) NOT NULL DEFAULT 'monthly'
  CHECK (invoice_frequency IN ('monthly', 'quarterly', 'three_cycle_quarterly')),
ADD COLUMN IF NOT EXISTS quarter_start_months INTEGER[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS combined_invoice BOOLEAN NOT NULL DEFAULT false;
