-- Stock review before a cycle can be confirmed, stock anomaly alerts, and a per-cycle activity log.
--
--  * roles.can_review_stock: confirm / adjust / acknowledge a cycle's customer stock. New flag,
--    default false; granted only to admin and mps_specialist (the Roles screen can widen it).
--  * billing_cycles: who confirmed the cycle (confirm only stored confirmed_at until now) and
--    who confirmed its stock, and when.
--  * customer_storage_history.anomaly: set when this snapshot jumped abnormally against the
--    previous one; the reviewer must acknowledge (or adjust) it before confirming stock.
--  * billing_cycle_events: the activity log shown inside the cycle (stock submitted / adjusted /
--    confirmed, cycle confirmed / unconfirmed). Adjustments keep before/after + reason, because
--    the history row itself is overwritten in place.

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS can_review_stock BOOLEAN NOT NULL DEFAULT false;

UPDATE roles SET can_review_stock = true WHERE name IN ('admin', 'mps_specialist');

ALTER TABLE billing_cycles
  ADD COLUMN IF NOT EXISTS confirmed_by_user_id       UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS stock_confirmed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stock_confirmed_by_user_id UUID REFERENCES users(id);

ALTER TABLE customer_storage_history
  ADD COLUMN IF NOT EXISTS anomaly                          JSONB,
  ADD COLUMN IF NOT EXISTS anomaly_acknowledged_by_user_id  UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS anomaly_acknowledged_at          TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS billing_cycle_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_cycle_id  UUID NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL CHECK (event_type IN (
                      'stock_submitted', 'stock_adjusted', 'stock_anomaly_acknowledged',
                      'stock_confirmed', 'stock_confirmation_reset',
                      'cycle_confirmed', 'cycle_unconfirmed')),
  user_id           UUID REFERENCES users(id),
  detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_cycle_events_cycle
  ON billing_cycle_events (billing_cycle_id, created_at);

CREATE INDEX IF NOT EXISTS idx_storage_history_unacked_anomaly
  ON customer_storage_history (billing_cycle_id)
  WHERE anomaly IS NOT NULL AND anomaly_acknowledged_at IS NULL;
