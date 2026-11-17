-- Billing cycle locks.
--
-- Billing figures are never stored: every read recomputes them from readings, contract
-- prices and the billing logic, so a logic fix or a data correction silently changes cycles
-- that were already confirmed or invoiced. A LOCKED cycle instead serves a frozen snapshot
-- of its figures (summary, audit export, Odoo export) and refuses edits until an admin
-- unlocks it or explicitly recalculates it.
--
-- The snapshot lives in its own table on purpose: the cycle queries use `SELECT bc.*`, and a
-- large JSON column on billing_cycles would be dragged into every list call.

ALTER TABLE billing_cycles
  ADD COLUMN IF NOT EXISTS is_locked         BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by_user_id UUID REFERENCES users(id);

CREATE TABLE IF NOT EXISTS billing_cycle_snapshots (
  billing_cycle_id  UUID PRIMARY KEY REFERENCES billing_cycles(id) ON DELETE CASCADE,
  snapshot          JSONB       NOT NULL,
  taken_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  taken_by_user_id  UUID REFERENCES users(id)
);

-- Audit trail: every lock / unlock / recalculation with the figure before and after,
-- so a recalculated cycle can always be traced. user_id is NULL for automatic locks.
CREATE TABLE IF NOT EXISTS billing_cycle_lock_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_cycle_id  UUID NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
  action            TEXT NOT NULL CHECK (action IN ('lock', 'auto_lock', 'unlock', 'recalculate')),
  user_id           UUID REFERENCES users(id),
  old_total         NUMERIC(18, 2),
  new_total         NUMERIC(18, 2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_cycle_lock_events_cycle
  ON billing_cycle_lock_events (billing_cycle_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_cycles_is_locked ON billing_cycles (is_locked) WHERE is_locked;
