CREATE INDEX IF NOT EXISTS idx_meter_readings_billing_cycle_id ON meter_readings(billing_cycle_id);
CREATE INDEX IF NOT EXISTS idx_meter_readings_printer_id       ON meter_readings(printer_id);
CREATE INDEX IF NOT EXISTS idx_meter_readings_read_at          ON meter_readings(read_at DESC);
