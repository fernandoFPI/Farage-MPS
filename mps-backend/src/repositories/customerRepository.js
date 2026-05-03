import pool from '../config/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email,
    requiresConfirmation: row.requires_confirmation,
    createdAt: row.created_at,
  };
}

function mapContract(c) {
  if (!c) return null;
  return {
    id: c.id,
    contractNumber: c.contract_number,
    billingType: c.billing_type,
    isActive: c.is_active,
    startDate: c.start_date,
    endDate: c.end_date,
    fixedCharge: c.fixed_charge,
    confirmationSlaDays: c.confirmation_sla_days,
    createdAt: c.created_at,
  };
}

export async function findAll({ name } = {}) {
  const values = [];
  let where = '';

  if (name) {
    values.push(`%${name}%`);
    where = `WHERE c.name ILIKE $1`;
  }

  const { rows } = await pool.query(
    `SELECT * FROM customers c ${where} ORDER BY name ASC`,
    values,
  );
  return rows.map(mapRow);
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT c.*,
       COALESCE(
         json_agg(co.* ORDER BY co.created_at DESC) FILTER (WHERE co.id IS NOT NULL),
         '[]'
       ) AS contracts
     FROM customers c
     LEFT JOIN contracts co ON co.customer_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [id],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    ...mapRow(row),
    contracts: (row.contracts || []).map(mapContract),
  };
}

export async function create({ name, contactPerson, phone, email, requiresConfirmation }) {
  const { rows } = await pool.query(
    `INSERT INTO customers (name, contact_person, phone, email, requires_confirmation)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, contactPerson ?? null, phone ?? null, email ?? null, requiresConfirmation ?? false],
  );
  return mapRow(rows[0]);
}

export async function update(id, fields) {
  const columnMap = {
    name: 'name',
    contactPerson: 'contact_person',
    phone: 'phone',
    email: 'email',
    requiresConfirmation: 'requires_confirmation',
  };

  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const [key, col] of Object.entries(columnMap)) {
    if (fields[key] !== undefined) {
      setClauses.push(`${col} = $${idx++}`);
      values.push(fields[key]);
    }
  }

  if (setClauses.length === 0) return findById(id);

  values.push(id);
  const { rowCount } = await pool.query(
    `UPDATE customers SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    values,
  );
  if (rowCount === 0) return null;
  return findById(id);
}

export async function hasActiveContracts(id) {
  const { rows } = await pool.query(
    `SELECT id FROM contracts WHERE customer_id = $1 AND is_active = true LIMIT 1`,
    [id],
  );
  return rows.length > 0;
}

export async function deleteById(id) {
  const { rowCount } = await pool.query(`DELETE FROM customers WHERE id = $1`, [id]);
  return rowCount > 0;
}
