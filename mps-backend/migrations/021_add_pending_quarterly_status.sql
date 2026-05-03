ALTER TABLE billing_cycles
DROP CONSTRAINT IF EXISTS billing_cycles_status_check;

ALTER TABLE billing_cycles
ADD CONSTRAINT billing_cycles_status_check
CHECK (status IN ('open', 'pending_confirmation', 'confirmed', 'pending_quarterly', 'disputed', 'invoiced', 'cancelled'));
