import pool from '../config/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    contractId: row.contract_id,
    createdByUserId: row.created_by_user_id,
    status: row.status,
    odooInvoiceId: row.odoo_invoice_id,
    invoicedAt: row.invoiced_at,
    createdAt: row.created_at,
  };
}

export async function create({ contractId, createdByUserId }) {
  const { rows } = await pool.query(
    `INSERT INTO billing_cycle_groups (contract_id, created_by_user_id, status)
     VALUES ($1, $2, 'open')
     RETURNING id`,
    [contractId, createdByUserId],
  );
  return findById(rows[0].id);
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT bcg.*,
       COALESCE(
         json_agg(
           json_build_object(
             'id',            bc.id,
             'periodStart',   bc.period_start,
             'periodEnd',     bc.period_end,
             'status',        bc.status,
             'groupPosition', bc.group_position,
             'cycleName',     CONCAT(cu.name, ' — ', TRIM(TO_CHAR(bc.period_start, 'Month YYYY')))
           ) ORDER BY bc.group_position ASC
         ) FILTER (WHERE bc.id IS NOT NULL),
         '[]'
       ) AS cycles
     FROM billing_cycle_groups bcg
     LEFT JOIN billing_cycles bc ON bc.cycle_group_id = bcg.id
     LEFT JOIN contracts co ON bcg.contract_id = co.id
     LEFT JOIN customers cu ON co.customer_id = cu.id
     WHERE bcg.id = $1
     GROUP BY bcg.id`,
    [id],
  );
  if (!rows[0]) return null;
  return { ...mapRow(rows[0]), cycles: rows[0].cycles };
}

export async function findAll({ contractId } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (contractId) {
    conditions.push(`bcg.contract_id = $${idx++}`);
    values.push(contractId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT bcg.*,
       COALESCE(
         json_agg(
           json_build_object(
             'id',            bc.id,
             'periodStart',   bc.period_start,
             'status',        bc.status,
             'groupPosition', bc.group_position,
             'cycleName',     CONCAT(cu.name, ' — ', TRIM(TO_CHAR(bc.period_start, 'Month YYYY')))
           ) ORDER BY bc.group_position ASC
         ) FILTER (WHERE bc.id IS NOT NULL),
         '[]'
       ) AS cycles
     FROM billing_cycle_groups bcg
     LEFT JOIN billing_cycles bc ON bc.cycle_group_id = bcg.id
     LEFT JOIN contracts co ON bcg.contract_id = co.id
     LEFT JOIN customers cu ON co.customer_id = cu.id
     ${where}
     GROUP BY bcg.id
     ORDER BY bcg.created_at DESC`,
    values,
  );
  return rows.map(row => ({ ...mapRow(row), cycles: row.cycles }));
}

export async function deleteById(id) {
  const { rowCount } = await pool.query(
    `DELETE FROM billing_cycle_groups WHERE id = $1`,
    [id],
  );
  return rowCount > 0;
}
