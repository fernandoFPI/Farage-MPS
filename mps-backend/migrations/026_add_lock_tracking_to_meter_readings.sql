ALTER TABLE meter_readings
ADD COLUMN IF NOT EXISTS lock_acquired_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS submission_duration_seconds INTEGER;
