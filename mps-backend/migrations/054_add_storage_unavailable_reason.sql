ALTER TABLE billing_cycles
  ADD COLUMN IF NOT EXISTS storage_unavailable_reason TEXT DEFAULT NULL;
