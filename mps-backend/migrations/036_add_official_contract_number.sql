ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS official_contract_number VARCHAR(150);
