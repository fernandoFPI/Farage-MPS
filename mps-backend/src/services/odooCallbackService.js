import pool from '../config/db.js';

const VALID_STATUSES   = ['synced', 'error', 'pending'];
const VALID_ORDER_TYPES = ['all', 'fixed_charge', 'clicks', 'bw_clicks', 'color_clicks'];

export async function handleOdooCallback({ cycleId, orderType, status, odooRef, errorCode, errorMessage }) {
  if (!cycleId || !orderType || !status) {
    const err = new Error('cycleId, orderType, and status are required');
    err.status = 400; throw err;
  }
  if (!VALID_STATUSES.includes(status)) {
    const err = new Error(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    err.status = 400; throw err;
  }
  if (!VALID_ORDER_TYPES.includes(orderType)) {
    const err = new Error(`orderType must be one of: ${VALID_ORDER_TYPES.join(', ')}`);
    err.status = 400; throw err;
  }

  const { rows } = await pool.query(
    `SELECT id, odoo_orders FROM billing_cycles WHERE id = $1`,
    [cycleId],
  );
  if (!rows[0]) {
    const err = new Error('Billing cycle not found');
    err.status = 404; throw err;
  }

  const existing = rows[0].odoo_orders ?? [];

  const entry = {
    orderType,
    status,
    odooRef:      odooRef      ?? null,
    errorCode:    errorCode    ?? null,
    errorMessage: errorMessage ?? null,
    syncedAt:     new Date().toISOString(),
  };

  const updatedOrders = [
    ...existing.filter(e => e.orderType !== orderType),
    entry,
  ];

  const allStatuses = updatedOrders.map(e => e.status);
  let aggregateStatus;
  if (allStatuses.every(s => s === 'synced'))  aggregateStatus = 'synced';
  else if (allStatuses.every(s => s === 'error')) aggregateStatus = 'error';
  else if (allStatuses.some(s => s === 'pending')) aggregateStatus = 'pending';
  else aggregateStatus = 'partial';

  await pool.query(
    `UPDATE billing_cycles SET odoo_orders = $1, odoo_status = $2 WHERE id = $3`,
    [JSON.stringify(updatedOrders), aggregateStatus, cycleId],
  );

  return { cycleId, odooStatus: aggregateStatus, orders: updatedOrders };
}

export async function getSyncLog() {
  const { rows } = await pool.query(
    `SELECT
       bc.id,
       bc.period_start,
       bc.odoo_status,
       bc.odoo_orders,
       c.contract_number,
       c.odoo_company,
       cu.name AS customer_name
     FROM billing_cycles bc
     JOIN contracts c ON c.id = bc.contract_id
     JOIN customers cu ON cu.id = c.customer_id
     WHERE bc.status = 'confirmed'
     ORDER BY bc.period_start DESC, cu.name ASC
     LIMIT 500`,
  );

  return rows.map(r => ({
    id:             r.id,
    periodStart:    r.period_start,
    odooStatus:     r.odoo_status ?? null,
    odooOrders:     r.odoo_orders ?? [],
    contractNumber: r.contract_number,
    odooCompany:    r.odoo_company ?? null,
    customerName:   r.customer_name,
  }));
}
