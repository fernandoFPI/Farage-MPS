ALTER TABLE contract_printers
ADD COLUMN IF NOT EXISTS contract_type VARCHAR(10) NOT NULL DEFAULT 'osg'
  CHECK (contract_type IN ('osg', 'psg'));
