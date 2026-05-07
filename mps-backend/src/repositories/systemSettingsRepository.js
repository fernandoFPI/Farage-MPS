import pool from '../config/db.js'

function mapRow(row) {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
    updatedByName: row.updated_by_name ?? null,
  }
}

export async function get(key) {
  const { rows } = await pool.query(
    `SELECT s.key, s.value, s.updated_at, s.updated_by_user_id, u.full_name AS updated_by_name
     FROM system_settings s
     LEFT JOIN users u ON s.updated_by_user_id = u.id
     WHERE s.key = $1`,
    [key]
  )
  return rows[0] ? mapRow(rows[0]) : null
}

export async function getAll() {
  const { rows } = await pool.query(
    `SELECT s.key, s.value, s.updated_at, s.updated_by_user_id, u.full_name AS updated_by_name
     FROM system_settings s
     LEFT JOIN users u ON s.updated_by_user_id = u.id
     ORDER BY s.key ASC`
  )
  return rows.map(mapRow)
}

export async function set(key, value, userId) {
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_by_user_id, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE
     SET value = $2, updated_by_user_id = $3, updated_at = NOW()`,
    [key, value, userId]
  )
  return get(key)
}
