ALTER TABLE printers
  ADD COLUMN IF NOT EXISTS service_type VARCHAR(10) DEFAULT NULL
  CHECK (service_type IN ('MPS', 'FSMA'));
