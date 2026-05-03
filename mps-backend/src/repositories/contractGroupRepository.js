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
