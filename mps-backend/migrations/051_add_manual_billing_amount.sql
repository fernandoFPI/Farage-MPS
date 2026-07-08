ALTER TABLE billing_cycles ADD COLUMN IF NOT EXISTS manual_billing_amount DECIMAL(12,2) DEFAULT NULL;
