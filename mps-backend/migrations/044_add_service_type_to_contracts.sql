ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS service_type VARCHAR(10)
    CHECK (service_type IN ('MPS', 'FSMA', 'LS', 'LO', 'SMA'));
