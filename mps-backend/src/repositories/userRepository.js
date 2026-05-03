import pool from '../config/db.js';

// Columns returned for all non-login queries (no password_hash)
const SAFE_USER_COLS = `
  u.id, u.role_id, u.full_name, u.email,
  u.is_active, u.last_login_at, u.created_at,
  row_to_json(r.*) AS role
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    roleId: row.role_id,
    fullName: row.full_name,
    email: row.email,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    role: row.role,
  };
}

// Includes password_hash — only for login verification
export async function findByEmailWithPassword(email) {
  const { rows } = await pool.query(
    `SELECT u.*, row_to_json(r.*) AS role
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.email = $1`,
    [email],
  );
  return rows[0] || null;
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT ${SAFE_USER_COLS}
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.id = $1`,
    [id],
  );
  return mapRow(rows[0]);
}

export async function findAll(filter = {}) {
  const values = [];
  let where = '';

  if (filter.isActive !== undefined) {
    values.push(filter.isActive);
    where = `WHERE u.is_active = $1`;
  }

  const { rows } = await pool.query(
    `SELECT ${SAFE_USER_COLS}
     FROM users u
     JOIN roles r ON u.role_id = r.id
     ${where}
     ORDER BY u.created_at DESC`,
    values,
  );
  return rows.map(mapRow);
}

export async function emailExists(email, excludeId = null) {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE email = $1${excludeId ? ' AND id != $2' : ''}`,
    excludeId ? [email, excludeId] : [email],
  );
  return rows.length > 0;
}

export async function roleExists(roleId) {
  const { rows } = await pool.query(
    `SELECT id FROM roles WHERE id = $1`,
    [roleId],
  );
  return rows.length > 0;
}

export async function create({ fullName, email, passwordHash, roleId }) {
  const { rows } = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [fullName, email, passwordHash, roleId],
  );
  return findById(rows[0].id);
}

export async function update(id, fields) {
  const columnMap = {
    fullName: 'full_name',
    email: 'email',
    roleId: 'role_id',
    isActive: 'is_active',
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
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    values,
  );

  if (rowCount === 0) return null;
  return findById(id);
}

export async function updateLastLogin(id) {
  await pool.query(
    `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
    [id],
  );
}
