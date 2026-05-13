import pool from '../config/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    billingCycleId: row.billing_cycle_id,
    city: row.city,
    status: row.status,
    totalPrinters: Number(row.total_printers),
    submittedPrinters: Number(row.submitted_printers),
    confirmedByUserId: row.confirmed_by_user_id ?? null,
    confirmedByName: row.confirmed_by_name ?? null,
    confirmedAt: row.confirmed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findByCycleId(cycleId) {
  const { rows } = await pool.query(
    `SELECT cs.*, u.full_name AS confirmed_by_name
     FROM billing_cycle_city_status cs
     LEFT JOIN users u ON cs.confirmed_by_user_id = u.id
     WHERE cs.billing_cycle_id = $1
     ORDER BY cs.city`,
    [cycleId],
  );
  return rows.map(mapRow);
}

export async function findByCycleAndCity(cycleId, city) {
  const { rows } = await pool.query(
    `SELECT cs.*, u.full_name AS confirmed_by_name
     FROM billing_cycle_city_status cs
     LEFT JOIN users u ON cs.confirmed_by_user_id = u.id
     WHERE cs.billing_cycle_id = $1 AND cs.city = $2`,
    [cycleId, city],
  );
  return mapRow(rows[0]);
}

export async function upsert(cycleId, city, { status, totalPrinters, submittedPrinters }) {
  const { rows } = await pool.query(
    `INSERT INTO billing_cycle_city_status
       (billing_cycle_id, city, status, total_printers, submitted_printers, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (billing_cycle_id, city) DO UPDATE SET
       status = EXCLUDED.status,
       total_printers = EXCLUDED.total_printers,
       submitted_printers = EXCLUDED.submitted_printers,
       updated_at = NOW()
     RETURNING id`,
    [cycleId, city, status, totalPrinters, submittedPrinters],
  );
  return findByCycleAndCity(cycleId, city);
}

export async function confirmCity(cycleId, city, userId) {
  await pool.query(
    `UPDATE billing_cycle_city_status
     SET status = 'confirmed', confirmed_by_user_id = $3, confirmed_at = NOW(), updated_at = NOW()
     WHERE billing_cycle_id = $1 AND city = $2`,
    [cycleId, city, userId],
  );
  return findByCycleAndCity(cycleId, city);
}

export async function resetCity(cycleId, city, { status, totalPrinters, submittedPrinters }) {
  await pool.query(
    `UPDATE billing_cycle_city_status
     SET status = $3, total_printers = $4, submitted_printers = $5,
         confirmed_by_user_id = NULL, confirmed_at = NULL, updated_at = NOW()
     WHERE billing_cycle_id = $1 AND city = $2`,
    [cycleId, city, status, totalPrinters, submittedPrinters],
  );
  return findByCycleAndCity(cycleId, city);
}
