import pool from '../config/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    printerModel: row.printer_model,
    location: row.location ?? '',
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
  const { rows } = await pool.query(
    `SELECT cs.*, u.full_name AS updated_by_name
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
  await pool.query(
    `INSERT INTO customer_storage_history
       (customer_storage_id, billing_cycle_id, c_qty, m_qty, y_qty, k_qty, r1_qty, r2_qty, r3_qty, r4_qty, waste_toner_qty, submitted_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [customerStorageId, billingCycleId ?? null, cQty, mQty, yQty, kQty, r1Qty, r2Qty, r3Qty, r4Qty, wasteTonQty, userId],
  );
}

export async function findHistory(customerId, printerModel) {
  const { rows } = await pool.query(
    `SELECT csh.*, u.full_name AS submitted_by_name,
            TO_CHAR(bc.period_start, 'Month YYYY') AS cycle_name
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
