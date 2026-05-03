CREATE TABLE IF NOT EXISTS contract_printers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  printer_id UUID NOT NULL REFERENCES printers(id),
  assigned_from DATE NOT NULL,
  assigned_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, printer_id, assigned_from)
);
