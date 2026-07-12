-- Per-user permission overrides. Missing key = follow role. true = force allow. false = force block.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS permission_overrides JSONB NOT NULL DEFAULT '{}';
