import pool from '../config/db.js';
import { ALL_PERMISSION_FLAGS } from '../utils/permissions.js';

export async function findAll() {
  const { rows } = await pool.query('SELECT * FROM roles ORDER BY name ASC');
  return rows;
}

export async function findById(id) {
  const { rows } = await pool.query('SELECT * FROM roles WHERE id = $1', [id]);
  return rows[0];
}

export async function create({ name, description, flags }) {
  const cols = ['name', 'description', ...ALL_PERMISSION_FLAGS];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const values = [name, description, ...ALL_PERMISSION_FLAGS.map((f) => !!flags[f])];
  const { rows } = await pool.query(
    `INSERT INTO roles (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    values,
  );
  return rows[0];
}

export async function update(id, { description, flags }) {
  const setCols = ['description', ...ALL_PERMISSION_FLAGS];
  const setClause = setCols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const values = [id, description, ...ALL_PERMISSION_FLAGS.map((f) => !!flags[f])];
  const { rows } = await pool.query(
    `UPDATE roles SET ${setClause} WHERE id = $1 RETURNING *`,
    values,
  );
  return rows[0];
}

export async function remove(id) {
  await pool.query('DELETE FROM roles WHERE id = $1', [id]);
}

export async function countUsersWithRole(id) {
  const { rows } = await pool.query('SELECT COUNT(*) AS count FROM users WHERE role_id = $1', [id]);
  return Number(rows[0].count);
}
