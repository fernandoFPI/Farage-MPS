import pool from '../config/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    printerModel: row.printer_model,
    location: row.location ?? '',
    city: row.city ?? null,
    isBwOnly: row.is_bw_only ?? false,
    cQty: Number(row.c_qty),
    mQty: Number(row.m_qty),
    yQty: Number(row.y_qty),
    kQty: Number(row.k_qty),
    r1Qty: Number(row.r1_qty),
    r2Qty: Number(row.r2_qty),
    r3Qty: Number(row.r3_qty),
    r4Qty: Number(row.r4_qty),
    wasteTonQty: Number(row.waste_toner_qty),
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name ?? null,
  };
}

function mapHistoryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerStorageId: row.customer_storage_id,
    billingCycleId: row.billing_cycle_id ?? null,
    cycleName: row.cycle_name ?? null,
    cQty: Number(row.c_qty),
    mQty: Number(row.m_qty),
    yQty: Number(row.y_qty),
    kQty: Number(row.k_qty),
    r1Qty: Number(row.r1_qty),
    r2Qty: Number(row.r2_qty),
    r3Qty: Number(row.r3_qty),
    r4Qty: Number(row.r4_qty),
    wasteTonQty: Number(row.waste_toner_qty),
    snapshotAt: row.snapshot_at,
    submittedByName: row.submitted_by_name ?? null,
  };
}

export async function findByCustomerId(customerId) {
  // customer_storage has no city column of its own — it only records the free-text
  // "location" branch name that was picked from a printer at submission time. The
  // city for that branch is derived here from any printer at this same customer
  // whose location matches, so existing records get a city with no backfill needed.
  const { rows } = await pool.query(
    `SELECT cs.*, u.full_name AS updated_by_name,
            (
              SELECT p.city
              FROM printers p
              JOIN contract_printers cp ON cp.printer_id = p.id
              JOIN contracts co ON co.id = cp.contract_id
              WHERE co.customer_id = cs.customer_id AND p.location = cs.location
              ORDER BY p.city
              LIMIT 1
            ) AS city
     FROM customer_storage cs
     LEFT JOIN users u ON u.id = cs.updated_by_user_id
     WHERE cs.customer_id = $1
     ORDER BY cs.printer_model`,
    [customerId],
  );
  return rows.map(mapRow);
}

export async function findByCustomerAndModel(customerId, printerModel) {
  const { rows } = await pool.query(
    `SELECT cs.*, u.full_name AS updated_by_name
     FROM customer_storage cs
     LEFT JOIN users u ON u.id = cs.updated_by_user_id
     WHERE cs.customer_id = $1 AND cs.printer_model = $2
     LIMIT 1`,
    [customerId, printerModel],
  );
  return mapRow(rows[0]);
}

export async function upsert(customerId, printerModel, location, isBwOnly, quantities, userId) {
  const { cQty = 0, mQty = 0, yQty = 0, kQty = 0, r1Qty = 0, r2Qty = 0, r3Qty = 0, r4Qty = 0, wasteTonQty = 0 } = quantities;
  const { rows } = await pool.query(
    `INSERT INTO customer_storage
       (customer_id, printer_model, location, is_bw_only, c_qty, m_qty, y_qty, k_qty, r1_qty, r2_qty, r3_qty, r4_qty, waste_toner_qty, updated_at, updated_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),$14)
     ON CONFLICT (customer_id, printer_model, location)
     DO UPDATE SET
       is_bw_only = EXCLUDED.is_bw_only,
       c_qty = EXCLUDED.c_qty, m_qty = EXCLUDED.m_qty, y_qty = EXCLUDED.y_qty,
       k_qty = EXCLUDED.k_qty, r1_qty = EXCLUDED.r1_qty, r2_qty = EXCLUDED.r2_qty,
       r3_qty = EXCLUDED.r3_qty, r4_qty = EXCLUDED.r4_qty, waste_toner_qty = EXCLUDED.waste_toner_qty,
       updated_at = NOW(), updated_by_user_id = EXCLUDED.updated_by_user_id
     RETURNING *`,
    [customerId, printerModel, location, isBwOnly, cQty, mQty, yQty, kQty, r1Qty, r2Qty, r3Qty, r4Qty, wasteTonQty, userId],
  );
  return mapRow(rows[0]);
}

export async function addHistory(customerStorageId, billingCycleId, quantities, userId) {
  const { cQty = 0, mQty = 0, yQty = 0, kQty = 0, r1Qty = 0, r2Qty = 0, r3Qty = 0, r4Qty = 0, wasteTonQty = 0 } = quantities;

  // Re-submitting storage for the same printer/location within the same cycle (re-opening
  // the ticket, correcting an unrelated field, a retried request, etc.) previously inserted
  // a brand new row every time, so the history list filled up with identical-looking entries
  // for the same day. One cycle should produce one snapshot — update it in place if it
  // already exists instead of appending a duplicate. A reading with no cycle (e.g. a manual
  // admin edit) has no natural key to dedupe against, so it always gets its own row.
  if (billingCycleId) {
    const { rows: existing } = await pool.query(
      `SELECT id FROM customer_storage_history WHERE customer_storage_id = $1 AND billing_cycle_id = $2 LIMIT 1`,
      [customerStorageId, billingCycleId],
    );
    if (existing[0]) {
      await pool.query(
        `UPDATE customer_storage_history
         SET c_qty=$1, m_qty=$2, y_qty=$3, k_qty=$4, r1_qty=$5, r2_qty=$6, r3_qty=$7, r4_qty=$8, waste_toner_qty=$9,
             snapshot_at = NOW(), submitted_by_user_id = $10
         WHERE id = $11`,
        [cQty, mQty, yQty, kQty, r1Qty, r2Qty, r3Qty, r4Qty, wasteTonQty, userId, existing[0].id],
      );
      return existing[0].id;
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO customer_storage_history
       (customer_storage_id, billing_cycle_id, c_qty, m_qty, y_qty, k_qty, r1_qty, r2_qty, r3_qty, r4_qty, waste_toner_qty, submitted_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [customerStorageId, billingCycleId ?? null, cQty, mQty, yQty, kQty, r1Qty, r2Qty, r3Qty, r4Qty, wasteTonQty, userId],
  );
  return rows[0].id;
}

// ── Stock review (per cycle) ─────────────────────────────────────────────────

const QTY_COLS = {
  cQty: 'c_qty', mQty: 'm_qty', yQty: 'y_qty', kQty: 'k_qty',
  r1Qty: 'r1_qty', r2Qty: 'r2_qty', r3Qty: 'r3_qty', r4Qty: 'r4_qty', wasteTonQty: 'waste_toner_qty',
};

function qtyFrom(row, prefix = '') {
  const out = {};
  for (const [key, col] of Object.entries(QTY_COLS)) out[key] = Number(row[`${prefix}${col}`]);
  return out;
}

function mapReviewRow(r) {
  return {
    historyId: r.id,
    customerStorageId: r.customer_storage_id,
    printerModel: r.printer_model,
    location: r.location ?? '',
    isBwOnly: r.is_bw_only ?? false,
    quantities: qtyFrom(r),
    previous: r.prev_id ? qtyFrom(r, 'prev_') : null,
    submittedByName: r.submitted_by_name ?? null,
    submittedAt: r.snapshot_at,
    anomaly: r.anomaly ?? null,
    anomalyAcknowledgedAt: r.anomaly_acknowledged_at ?? null,
    anomalyAcknowledgedByName: r.ack_by_name ?? null,
  };
}

// Every stock snapshot recorded against this cycle, each with the snapshot before it (same customer,
// model and location) so the reviewer sees previous -> now. "Before" is by cycle period, not by the
// time the row was written, so a late back-fill still compares against the right month.
export async function findReviewRowsByCycle(billingCycleId) {
  const { rows } = await pool.query(
    `SELECT h.*, cs.printer_model, cs.location, cs.is_bw_only,
            su.full_name AS submitted_by_name, au.full_name AS ack_by_name,
            prev.id AS prev_id,
            prev.c_qty AS prev_c_qty, prev.m_qty AS prev_m_qty, prev.y_qty AS prev_y_qty, prev.k_qty AS prev_k_qty,
            prev.r1_qty AS prev_r1_qty, prev.r2_qty AS prev_r2_qty, prev.r3_qty AS prev_r3_qty, prev.r4_qty AS prev_r4_qty,
            prev.waste_toner_qty AS prev_waste_toner_qty
     FROM customer_storage_history h
     JOIN customer_storage cs ON cs.id = h.customer_storage_id
     JOIN billing_cycles cbc ON cbc.id = h.billing_cycle_id
     LEFT JOIN users su ON su.id = h.submitted_by_user_id
     LEFT JOIN users au ON au.id = h.anomaly_acknowledged_by_user_id
     LEFT JOIN LATERAL (
       SELECT p.* FROM customer_storage_history p
       LEFT JOIN billing_cycles pbc ON pbc.id = p.billing_cycle_id
       WHERE p.customer_storage_id = h.customer_storage_id AND p.id <> h.id
         AND COALESCE(pbc.period_end::timestamptz, p.snapshot_at) < cbc.period_end::timestamptz
       ORDER BY COALESCE(pbc.period_end::timestamptz, p.snapshot_at) DESC, p.snapshot_at DESC
       LIMIT 1
     ) prev ON true
     WHERE h.billing_cycle_id = $1
     ORDER BY cs.location, cs.printer_model`,
    [billingCycleId],
  );
  return rows.map(mapReviewRow);
}

export async function findReviewRow(billingCycleId, historyId) {
  const rows = await findReviewRowsByCycle(billingCycleId);
  return rows.find(r => r.historyId === historyId) ?? null;
}

export async function findHistoryQuantities(historyId) {
  const { rows } = await pool.query(`SELECT * FROM customer_storage_history WHERE id = $1`, [historyId]);
  return rows[0] ? qtyFrom(rows[0]) : null;
}

// Previous snapshot quantities for one history row (null when it is the first ever).
export async function findPreviousQuantities(historyId) {
  const { rows } = await pool.query(
    `WITH me AS (
       SELECT h.id, COALESCE(bc.period_end::timestamptz, h.snapshot_at) AS ref, h.customer_storage_id AS sid
       FROM customer_storage_history h LEFT JOIN billing_cycles bc ON bc.id = h.billing_cycle_id
       WHERE h.id = $1)
     SELECT p.* FROM customer_storage_history p
     LEFT JOIN billing_cycles pbc ON pbc.id = p.billing_cycle_id, me
     WHERE p.customer_storage_id = me.sid AND p.id <> me.id
       AND COALESCE(pbc.period_end::timestamptz, p.snapshot_at) < me.ref
     ORDER BY COALESCE(pbc.period_end::timestamptz, p.snapshot_at) DESC, p.snapshot_at DESC
     LIMIT 1`,
    [historyId],
  );
  return rows[0] ? qtyFrom(rows[0]) : null;
}

// Sets (or clears, with null) the anomaly on a snapshot. Always clears any acknowledgement:
// the numbers it covered have just changed.
export async function setAnomaly(historyId, anomaly) {
  await pool.query(
    `UPDATE customer_storage_history
     SET anomaly = $2::jsonb, anomaly_acknowledged_by_user_id = NULL, anomaly_acknowledged_at = NULL
     WHERE id = $1`,
    [historyId, anomaly ? JSON.stringify(anomaly) : null],
  );
}

export async function acknowledgeAnomaly(historyId, userId) {
  await pool.query(
    `UPDATE customer_storage_history
     SET anomaly_acknowledged_by_user_id = $2, anomaly_acknowledged_at = NOW()
     WHERE id = $1`,
    [historyId, userId],
  );
}

// Reviewer adjustment of one snapshot. Returns the updated quantities.
export async function updateHistoryQuantities(historyId, quantities) {
  const sets = [];
  const values = [];
  for (const [key, col] of Object.entries(QTY_COLS)) {
    values.push(quantities[key]);
    sets.push(`${col} = $${values.length}`);
  }
  values.push(historyId);
  await pool.query(`UPDATE customer_storage_history SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
}

// Is this snapshot the newest one for its storage row? Only then does the customer's CURRENT stock
// level (customer_storage) mirror it and need updating when the snapshot is adjusted.
export async function isLatestSnapshot(historyId) {
  const { rows } = await pool.query(
    `WITH me AS (
       SELECT h.id, COALESCE(bc.period_end::timestamptz, h.snapshot_at) AS ref, h.customer_storage_id AS sid
       FROM customer_storage_history h LEFT JOIN billing_cycles bc ON bc.id = h.billing_cycle_id
       WHERE h.id = $1)
     SELECT NOT EXISTS (
       SELECT 1 FROM customer_storage_history p
       LEFT JOIN billing_cycles pbc ON pbc.id = p.billing_cycle_id, me
       WHERE p.customer_storage_id = me.sid AND p.id <> me.id
         AND COALESCE(pbc.period_end::timestamptz, p.snapshot_at) > me.ref
     ) AS latest`,
    [historyId],
  );
  return rows[0]?.latest === true;
}

export async function updateCurrentQuantities(customerStorageId, quantities, userId) {
  const sets = [];
  const values = [];
  for (const [key, col] of Object.entries(QTY_COLS)) {
    values.push(quantities[key]);
    sets.push(`${col} = $${values.length}`);
  }
  values.push(userId, customerStorageId);
  await pool.query(
    `UPDATE customer_storage SET ${sets.join(', ')}, updated_at = NOW(), updated_by_user_id = $${values.length - 1}
     WHERE id = $${values.length}`,
    values,
  );
}

export async function findHistory(customerId, printerModel) {
  const { rows } = await pool.query(
    `SELECT csh.*, u.full_name AS submitted_by_name,
            TO_CHAR(bc.period_end, 'Month YYYY') AS cycle_name
     FROM customer_storage_history csh
     JOIN customer_storage cs ON cs.id = csh.customer_storage_id
     LEFT JOIN users u ON u.id = csh.submitted_by_user_id
     LEFT JOIN billing_cycles bc ON bc.id = csh.billing_cycle_id
     WHERE cs.customer_id = $1 AND cs.printer_model = $2
     ORDER BY csh.snapshot_at DESC`,
    [customerId, printerModel],
  );
  return rows.map(mapHistoryRow);
}

export async function getDistinctModelsForCustomer(customerId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT p.model, BOOL_OR(p.is_bw_only) AS is_bw_only
     FROM printers p
     JOIN contract_printers cp ON cp.printer_id = p.id
     JOIN contracts co ON co.id = cp.contract_id
     WHERE co.customer_id = $1
     GROUP BY p.model
     ORDER BY p.model`,
    [customerId],
  );
  return rows.map(r => ({ model: r.model, isBwOnly: r.is_bw_only }));
}
