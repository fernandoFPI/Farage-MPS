-- Add ON DELETE CASCADE to all billing_cycle FKs so hard-deleting a cycle
-- also removes its meter readings, consumable readings, and storage records.

ALTER TABLE meter_readings
  DROP CONSTRAINT IF EXISTS meter_readings_billing_cycle_id_fkey,
  ADD CONSTRAINT meter_readings_billing_cycle_id_fkey
    FOREIGN KEY (billing_cycle_id) REFERENCES billing_cycles(id) ON DELETE CASCADE;

ALTER TABLE consumable_readings
  DROP CONSTRAINT IF EXISTS consumable_readings_billing_cycle_id_fkey,
  ADD CONSTRAINT consumable_readings_billing_cycle_id_fkey
    FOREIGN KEY (billing_cycle_id) REFERENCES billing_cycles(id) ON DELETE CASCADE;

ALTER TABLE customer_storage_history
  DROP CONSTRAINT IF EXISTS customer_storage_history_billing_cycle_id_fkey,
  ADD CONSTRAINT customer_storage_history_billing_cycle_id_fkey
    FOREIGN KEY (billing_cycle_id) REFERENCES billing_cycles(id) ON DELETE CASCADE;
