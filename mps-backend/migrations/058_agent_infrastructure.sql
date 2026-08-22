-- Agent sites: one row per customer location that has an agent PC installed
CREATE TABLE IF NOT EXISTS agent_sites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  reg_code        TEXT UNIQUE,
  reg_code_expiry TIMESTAMPTZ,
  api_token_hash  TEXT,          -- SHA-256 of the long-lived agent token
  last_seen       TIMESTAMPTZ,
  agent_version   TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | active | offline
  snmp_community  TEXT NOT NULL DEFAULT 'public',
  poll_interval   INT  NOT NULL DEFAULT 3600,       -- seconds
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Track which site each printer belongs to + live network state
ALTER TABLE printers
  ADD COLUMN IF NOT EXISTS ip_address    INET,
  ADD COLUMN IF NOT EXISTS agent_site_id UUID REFERENCES agent_sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_polled   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snmp_status   TEXT;       -- online | unreachable | snmp_error

-- Mark whether a meter reading came from the agent or was entered manually
ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';  -- manual | agent

-- Latest consumable level per supply type per printer (upserted on each poll)
CREATE TABLE IF NOT EXISTS printer_consumables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  printer_id  UUID NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  supply_type TEXT NOT NULL,   -- black | cyan | magenta | yellow | drum
  level_pct   INT,
  cur_units   INT,
  max_units   INT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (printer_id, supply_type)
);

-- Active and historical printer alerts from SNMP alert table
CREATE TABLE IF NOT EXISTS printer_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  printer_id  UUID NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  alert_code  TEXT,
  description TEXT,
  severity    TEXT,            -- info | warning | error | critical
  seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_at  TIMESTAMPTZ
);
