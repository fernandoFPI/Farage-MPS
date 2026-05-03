import pool from '../config/db.js';

export async function findAll() {
  const { rows } = await pool.query('SELECT * FROM roles ORDER BY name ASC');
  return rows;
}
