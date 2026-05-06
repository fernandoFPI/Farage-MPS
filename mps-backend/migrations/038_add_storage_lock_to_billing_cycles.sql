ALTER TABLE billing_cycles
ADD COLUMN IF NOT EXISTS storage_submitted    BOOLEAN     NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS storage_submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS storage_submitted_by UUID REFERENCES users(id);
