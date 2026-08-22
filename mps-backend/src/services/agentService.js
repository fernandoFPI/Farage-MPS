import crypto from 'crypto';
import pool from '../config/db.js';
import * as repo from '../repositories/agentSiteRepository.js';

const AGENT_VERSION = '1.0.0';

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function generateRegCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `FAR-${seg(4)}-${seg(4)}`;
}

// ── Admin: create a site and issue a fresh registration code ──────────────────

export async function createSite({ customerId, name }) {
  const site    = await repo.create({ customerId, name });
  const regCode = generateRegCode();
  const expiry  = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
  return repo.setRegCode(site.id, regCode, expiry);
}

export async function regenerateCode(siteId) {
  const regCode = generateRegCode();
  const expiry  = new Date(Date.now() + 48 * 60 * 60 * 1000);
  return repo.setRegCode(siteId, regCode, expiry);
}

export async function listSites() {
  return repo.findAll();
}

export async function updateSite(id, patch) {
  return repo.update(id, patch);
}

// ── Agent: register using a one-time code ────────────────────────────────────

export async function register({ regCode, agentVersion }) {
  const site = await repo.findByRegCode(regCode);
  if (!site) {
    const err = new Error('Invalid or expired registration code');
    err.status = 400;
    throw err;
  }

  const token     = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(token);

  await repo.activateWithToken(site.id, tokenHash, agentVersion || AGENT_VERSION);

  const knownSerials = await repo.getKnownSerials(site.id);

  return {
    apiToken: token,
    siteId:   site.id,
    config: {
      pollInterval:  site.poll_interval  ?? 3600,
      snmpCommunity: site.snmp_community ?? 'public',
      knownSerials:  Object.keys(knownSerials),
    },
  };
}

// ── Agent: pull latest config (poll interval, community string, known serials) ─

export async function getConfig(agentSite) {
  const knownSerials = await repo.getKnownSerials(agentSite.id);
  return {
    pollInterval:  agentSite.poll_interval,
    snmpCommunity: agentSite.snmp_community,
    knownSerials:  Object.keys(knownSerials),
  };
}

// ── Agent: heartbeat ──────────────────────────────────────────────────────────

export async function heartbeat(agentSite, { agentVersion } = {}) {
  if (agentVersion) {
    await pool.query(
      `UPDATE agent_sites SET agent_version = $1 WHERE id = $2`,
      [agentVersion, agentSite.id],
    );
  }
  const config = await getConfig(agentSite);
  return { ok: true, config };
}

// ── Agent: receive meter readings ─────────────────────────────────────────────

export async function receiveReadings(agentSite, readings) {
  if (!readings?.length) return { saved: 0 };

  const serials = readings.map(r => r.serial);
  const matched = await repo.matchSerials(agentSite.id, serials);

  let saved = 0;
  for (const r of readings) {
    const printer = matched[r.serial];
    if (!printer) continue;

    // Update network state
    await repo.updatePrinterNetwork(printer.id, {
      ip:          r.ip,
      snmpStatus:  'online',
      lastPolled:  new Date(),
    });

    // Find the open billing cycle for this printer
    const { rows: cycleRows } = await pool.query(
      `SELECT bc.id, bc.period_start
       FROM billing_cycles bc
       JOIN contract_printers cp ON cp.contract_id = bc.contract_id
       WHERE cp.printer_id = $1
         AND bc.status = 'open'
       ORDER BY bc.period_start DESC
       LIMIT 1`,
      [printer.id],
    );
    if (!cycleRows[0]) continue;

    const cycle = cycleRows[0];

    // Only store if reading doesn't already exist for today from agent
    const today = new Date().toISOString().slice(0, 10);
    const { rows: existing } = await pool.query(
      `SELECT id FROM meter_readings
       WHERE printer_id = $1 AND billing_cycle_id = $2
         AND source = 'agent' AND DATE(created_at) = $3`,
      [printer.id, cycle.id, today],
    );
    if (existing.length) {
      // Update today's agent reading in-place rather than duplicating
      await pool.query(
        `UPDATE meter_readings
         SET a4_bw = $1, a3_bw = $2, a4_color = $3, a3_color = $4, updated_at = now()
         WHERE id = $5`,
        [r.a4Bw ?? 0, r.a3Bw ?? 0, r.a4Color ?? 0, r.a3Color ?? 0, existing[0].id],
      );
    } else {
      await pool.query(
        `INSERT INTO meter_readings
           (printer_id, billing_cycle_id, a4_bw, a3_bw, a4_color, a3_color, source, submitted_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'agent', NULL)`,
        [printer.id, cycle.id, r.a4Bw ?? 0, r.a3Bw ?? 0, r.a4Color ?? 0, r.a3Color ?? 0],
      );
    }
    saved++;
  }

  return { saved, total: readings.length };
}

// ── Agent: receive consumable (toner) levels ──────────────────────────────────

export async function receiveConsumables(agentSite, consumables) {
  if (!consumables?.length) return { saved: 0 };

  const serials = [...new Set(consumables.map(c => c.serial))];
  const matched = await repo.matchSerials(agentSite.id, serials);

  let saved = 0;
  for (const c of consumables) {
    const printer = matched[c.serial];
    if (!printer) continue;

    await pool.query(
      `INSERT INTO printer_consumables (printer_id, supply_type, level_pct, cur_units, max_units, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (printer_id, supply_type)
       DO UPDATE SET level_pct = EXCLUDED.level_pct,
                     cur_units = EXCLUDED.cur_units,
                     max_units = EXCLUDED.max_units,
                     updated_at = now()`,
      [printer.id, c.supplyType, c.levelPct ?? null, c.curUnits ?? null, c.maxUnits ?? null],
    );
    saved++;
  }
  return { saved, total: consumables.length };
}

// ── Agent: receive alerts ─────────────────────────────────────────────────────

export async function receiveAlerts(agentSite, alerts) {
  if (!alerts?.length) return { saved: 0 };

  const serials = [...new Set(alerts.map(a => a.serial))];
  const matched = await repo.matchSerials(agentSite.id, serials);

  let saved = 0;
  for (const a of alerts) {
    const printer = matched[a.serial];
    if (!printer) continue;

    // Auto-clear alerts for this printer that are no longer in the list
    const activeCodes = alerts.filter(x => x.serial === a.serial).map(x => x.code).filter(Boolean);

    await pool.query(
      `UPDATE printer_alerts
       SET cleared_at = now()
       WHERE printer_id = $1 AND cleared_at IS NULL
         AND (alert_code != ALL($2::text[]) OR $2::text[] = '{}')`,
      [printer.id, activeCodes],
    );

    // Upsert active alert (skip if already open with same code)
    if (a.code) {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM printer_alerts
         WHERE printer_id = $1 AND alert_code = $2 AND cleared_at IS NULL`,
        [printer.id, a.code],
      );
      if (!rowCount) {
        await pool.query(
          `INSERT INTO printer_alerts (printer_id, alert_code, description, severity)
           VALUES ($1, $2, $3, $4)`,
          [printer.id, a.code, a.description ?? null, a.severity ?? 'warning'],
        );
        saved++;
      }
    }
  }
  return { saved, total: alerts.length };
}

// ── Version check (auto-update) ───────────────────────────────────────────────

export function getLatestVersion() {
  return {
    version:     AGENT_VERSION,
    downloadUrl: null, // set to a real URL once releases exist
    required:    false,
  };
}
