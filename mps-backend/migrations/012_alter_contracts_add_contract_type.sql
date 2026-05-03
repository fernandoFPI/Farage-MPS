ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS contract_type VARCHAR(3) NOT NULL DEFAULT 'osg'
  CHECK (contract_type IN ('osg', 'psg'));
