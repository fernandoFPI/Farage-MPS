-- Add psg_simple as a valid contract_mode value
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_contract_mode_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_contract_mode_check
  CHECK (contract_mode IN ('osg', 'psg', 'psg_simple'));
