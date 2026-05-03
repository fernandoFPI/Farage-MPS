ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS contract_mode VARCHAR(10) NOT NULL DEFAULT 'osg'
  CHECK (contract_mode IN ('osg', 'psg'));
