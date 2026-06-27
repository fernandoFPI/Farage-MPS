ALTER TABLE customer_storage ADD COLUMN IF NOT EXISTS location VARCHAR(200) NOT NULL DEFAULT '';

ALTER TABLE customer_storage DROP CONSTRAINT IF EXISTS customer_storage_customer_id_printer_model_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_storage_customer_id_printer_model_location_key'
  ) THEN
    ALTER TABLE customer_storage ADD CONSTRAINT customer_storage_customer_id_printer_model_location_key
      UNIQUE (customer_id, printer_model, location);
  END IF;
END $$;
