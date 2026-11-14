-- Engineer ticket drafts: a half-filled ticket (counters, photos, consumable
-- levels, stock, GPS) saved server-side so it can be finished and submitted
-- later. Deliberately NOT stored in meter_readings, so billing, previous-reading
-- lookups, city status and performance stats never see a draft.
CREATE TABLE IF NOT EXISTS ticket_drafts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_cycle_id   UUID NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
  printer_id         UUID NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  saved_by_user_id   UUID NOT NULL REFERENCES users(id),
  payload            JSONB NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (billing_cycle_id, printer_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_drafts_cycle ON ticket_drafts (billing_cycle_id);
