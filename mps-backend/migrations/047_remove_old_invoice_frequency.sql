ALTER TABLE contracts
  DROP COLUMN IF EXISTS invoice_frequency,
  DROP COLUMN IF EXISTS billing_frequency,
  DROP COLUMN IF EXISTS quarter_start_months,
  DROP COLUMN IF EXISTS combined_invoice;
