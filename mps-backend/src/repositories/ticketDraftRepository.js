import pool from '../config/db.js';

// List view: never returns the payload (it carries base64 photos).
export async function findSummariesByCycle(billingCycleId) {
  const { rows } = await pool.query(
    `SELECT d.id, d.printer_id, d.saved_by_user_id, u.full_name AS saved_by_name,
            d.created_at, d.updated_at,
            COALESCE(jsonb_array_length(d.payload->'photos'), 0) AS photo_count
     FROM ticket_drafts d
     JOIN users u ON u.id = d.saved_by_user_id
     WHERE d.billing_cycle_id = $1
     ORDER BY d.updated_at DESC`,
    [billingCycleId],
  );
  return rows.map(r => ({
    id: r.id,
    printerId: r.printer_id,
    savedByUserId: r.saved_by_user_id,
    savedByName: r.saved_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    photoCount: Number(r.photo_count),
  }));
}

export async function findOne(billingCycleId, printerId) {
  const { rows } = await pool.query(
    `SELECT d.id, d.billing_cycle_id, d.printer_id, d.saved_by_user_id, u.full_name AS saved_by_name,
            d.payload, d.created_at, d.updated_at
     FROM ticket_drafts d
     JOIN users u ON u.id = d.saved_by_user_id
     WHERE d.billing_cycle_id = $1 AND d.printer_id = $2`,
    [billingCycleId, printerId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    billingCycleId: r.billing_cycle_id,
    printerId: r.printer_id,
    savedByUserId: r.saved_by_user_id,
    savedByName: r.saved_by_name,
    payload: r.payload,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function upsert({ billingCycleId, printerId, userId, payload }) {
  await pool.query(
    `INSERT INTO ticket_drafts (billing_cycle_id, printer_id, saved_by_user_id, payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (billing_cycle_id, printer_id)
     DO UPDATE SET payload = EXCLUDED.payload, saved_by_user_id = EXCLUDED.saved_by_user_id, updated_at = NOW()`,
    [billingCycleId, printerId, userId, JSON.stringify(payload)],
  );
}

export async function deleteByCycleAndPrinter(billingCycleId, printerId) {
  const { rowCount } = await pool.query(
    `DELETE FROM ticket_drafts WHERE billing_cycle_id = $1 AND printer_id = $2`,
    [billingCycleId, printerId],
  );
  return rowCount > 0;
}

// Locations (customer_storage.location, '' = main branch) that already have a
// stock submission recorded against this cycle.
export async function findStockLocationsForCycle(billingCycleId, customerId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT cs.location
     FROM customer_storage_history h
     JOIN customer_storage cs ON cs.id = h.customer_storage_id
     WHERE h.billing_cycle_id = $1 AND cs.customer_id = $2`,
    [billingCycleId, customerId],
  );
  return rows.map(r => r.location ?? '');
}
