import pool from '../config/db.js';

// Activity log inside a billing cycle (see migration 064). detail is free-form JSON per event type.
export async function add(billingCycleId, eventType, userId, detail = {}, client = pool) {
  await client.query(
    `INSERT INTO billing_cycle_events (billing_cycle_id, event_type, user_id, detail)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [billingCycleId, eventType, userId ?? null, JSON.stringify(detail)],
  );
}

export async function findByCycle(billingCycleId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.event_type, e.user_id, u.full_name AS user_name, r.name AS role_name, e.detail, e.created_at
     FROM billing_cycle_events e
     LEFT JOIN users u ON u.id = e.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE e.billing_cycle_id = $1
     ORDER BY e.created_at ASC, e.id`,
    [billingCycleId],
  );
  return rows.map(r => ({
    id: r.id,
    type: r.event_type,
    userId: r.user_id,
    userName: r.user_name ?? null,
    roleName: r.role_name ?? null,
    detail: r.detail ?? {},
    at: r.created_at,
  }));
}

// Stock submissions recorded before the activity log existed (or whose event failed to write):
// rebuilt from the stock history so past cycles still show who submitted stock and when.
export async function findLegacyStockSubmissions(billingCycleId) {
  const { rows } = await pool.query(
    `SELECT h.id, h.snapshot_at, h.submitted_by_user_id, u.full_name AS user_name, r.name AS role_name,
            cs.printer_model, cs.location
     FROM customer_storage_history h
     JOIN customer_storage cs ON cs.id = h.customer_storage_id
     LEFT JOIN users u ON u.id = h.submitted_by_user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE h.billing_cycle_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM billing_cycle_events e
         WHERE e.billing_cycle_id = h.billing_cycle_id AND e.event_type = 'stock_submitted'
           AND e.detail->>'historyId' = h.id::text)
     ORDER BY h.snapshot_at`,
    [billingCycleId],
  );
  return rows.map(r => ({
    id: `legacy-stock-${r.id}`,
    type: 'stock_submitted',
    userId: r.submitted_by_user_id ?? null,
    userName: r.user_name ?? null,
    roleName: r.role_name ?? null,
    detail: { historyId: r.id, printerModel: r.printer_model, location: r.location ?? '', fromHistory: true },
    at: r.snapshot_at,
  }));
}
