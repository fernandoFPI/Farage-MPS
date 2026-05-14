import pool from '../config/db.js';

function mapGroup(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    groupMinBw: Number(row.group_min_bw),
    groupMinColor: Number(row.group_min_color),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    groupId: row.group_id,
    contractId: row.contract_id,
    contractNumber: row.contract_number ?? null,
    customerName: row.customer_name ?? null,
    createdAt: row.created_at,
  };
}

export async function findAll() {
  const { rows } = await pool.query(
    `SELECT g.*, COUNT(m.id)::int AS member_count
     FROM contract_groups g
     LEFT JOIN contract_group_members m ON m.group_id = g.id
     GROUP BY g.id
     ORDER BY g.name`,
  );
  return rows.map(row => ({ ...mapGroup(row), memberCount: row.member_count }));
}

export async function findById(id) {
  const { rows: groupRows } = await pool.query(
    'SELECT * FROM contract_groups WHERE id = $1',
    [id],
  );
  if (!groupRows.length) return null;
  const group = mapGroup(groupRows[0]);

  const { rows: memberRows } = await pool.query(
    `SELECT m.*, c.contract_number, cu.name AS customer_name
     FROM contract_group_members m
     JOIN contracts c ON c.id = m.contract_id
     JOIN customers cu ON cu.id = c.customer_id
     WHERE m.group_id = $1
     ORDER BY c.contract_number`,
    [id],
  );
  group.members = memberRows.map(mapMember);
  return group;
}

export async function findByContractId(contractId) {
  const { rows } = await pool.query(
    `SELECT g.* FROM contract_groups g
     JOIN contract_group_members m ON m.group_id = g.id
     WHERE m.contract_id = $1`,
    [contractId],
  );
  return rows.map(mapGroup);
}

export async function create({ name, groupMinBw, groupMinColor }) {
  const { rows } = await pool.query(
    `INSERT INTO contract_groups (name, group_min_bw, group_min_color)
     VALUES ($1, $2, $3) RETURNING *`,
    [name, groupMinBw ?? 0, groupMinColor ?? 0],
  );
  return mapGroup(rows[0]);
}

export async function update(id, { name, groupMinBw, groupMinColor }) {
  const { rows } = await pool.query(
    `UPDATE contract_groups SET name = $1, group_min_bw = $2, group_min_color = $3, updated_at = now()
     WHERE id = $4 RETURNING *`,
    [name, groupMinBw ?? 0, groupMinColor ?? 0, id],
  );
  return mapGroup(rows[0]);
}

export async function deleteById(id) {
  await pool.query('DELETE FROM contract_groups WHERE id = $1', [id]);
}

export async function addMember(groupId, contractId) {
  const { rows } = await pool.query(
    `INSERT INTO contract_group_members (group_id, contract_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING *`,
    [groupId, contractId],
  );
  return rows[0] ? mapMember(rows[0]) : null;
}

export async function removeMember(groupId, contractId) {
  await pool.query(
    'DELETE FROM contract_group_members WHERE group_id = $1 AND contract_id = $2',
    [groupId, contractId],
  );
}

export async function contractExists(contractId) {
  const { rows } = await pool.query('SELECT 1 FROM contracts WHERE id = $1', [contractId]);
  return rows.length > 0;
}

export async function memberAlreadyInGroup(contractId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM contract_group_members WHERE contract_id = $1',
    [contractId],
  );
  return rows.length > 0;
}

// Find all billing cycles for group members that fall within a given period month
export async function findGroupCyclesForPeriod(groupId, periodStart) {
  const { rows } = await pool.query(
    `SELECT bc.id, bc.status, bc.odoo_invoice_id,
            bc.period_start, bc.period_end, bc.contract_id,
            TO_CHAR(bc.period_start, 'Month YYYY') AS cycle_month,
            cu.name AS customer_name,
            co.contract_number, co.official_contract_number
     FROM billing_cycles bc
     JOIN contract_group_members cgm ON cgm.contract_id = bc.contract_id
     JOIN contracts co ON co.id = bc.contract_id
     JOIN customers cu ON cu.id = co.customer_id
     WHERE cgm.group_id = $1
       AND DATE_TRUNC('month', bc.period_start AT TIME ZONE 'UTC') =
           DATE_TRUNC('month', $2::timestamptz AT TIME ZONE 'UTC')
       AND bc.is_cancelled = false`,
    [groupId, periodStart],
  );
  return rows.map(row => ({
    id: row.id,
    status: row.status,
    odooInvoiceId: row.odoo_invoice_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    contractId: row.contract_id,
    contractNumber: row.contract_number,
    officialContractNumber: row.official_contract_number,
    customerName: row.customer_name,
    cycleName: `${row.customer_name.trim()} — ${row.cycle_month.trim()}`,
  }));
}

// Mark multiple cycles as invoiced in a single transaction
export async function markCyclesInvoiced(invoices) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const { cycleId, odooInvoiceId, cycleName } of invoices) {
      await client.query(
        `UPDATE billing_cycles
         SET status = 'invoiced', odoo_invoice_id = $1, invoiced_at = NOW()
         WHERE id = $2`,
        [odooInvoiceId, cycleId],
      );
      await client.query(
        `INSERT INTO invoice_logs (billing_cycle_id, success, odoo_invoice_id, attempt_number)
         VALUES ($1, true, $2, 1)`,
        [cycleId, odooInvoiceId],
      );
      results.push({ cycleId, cycleName, odooInvoiceId });
    }
    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
