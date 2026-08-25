import pool from '../config/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    serialNumber: row.serial_number,
    model: row.model,
    city: row.city,
    location: row.location,
    xsmDeviceId: row.xsm_device_id,
    xsmEnabled: row.xsm_enabled,
    isBwOnly: row.is_bw_only ?? false,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    latitude: row.latitude != null ? parseFloat(row.latitude) : null,
    longitude: row.longitude != null ? parseFloat(row.longitude) : null,
    serviceType: row.service_type ?? null,
    isActive: row.is_active ?? true,
  };
}

export async function findAll({ city, xsmEnabled, isActive } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (city) {
    conditions.push(`city ILIKE $${idx++}`);
    values.push(`%${city}%`);
  }
  if (xsmEnabled !== undefined) {
    conditions.push(`xsm_enabled = $${idx++}`);
    values.push(xsmEnabled);
  }
  if (isActive !== undefined) {
    conditions.push(`is_active = $${idx++}`);
    values.push(isActive);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT * FROM printers ${where} ORDER BY city ASC, location ASC`,
    values,
  );
  return rows.map(mapRow);
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT p.*,
       (
         SELECT json_build_object(
           'id',             cp.id,
           'contractId',     cp.contract_id,
           'assignedFrom',   cp.assigned_from,
           'assignedUntil',  cp.assigned_until,
           'contractNumber', co.contract_number
         )
         FROM contract_printers cp
         JOIN contracts co ON cp.contract_id = co.id
         WHERE cp.printer_id = p.id
           AND (cp.assigned_until IS NULL OR cp.assigned_until >= CURRENT_DATE)
         ORDER BY cp.assigned_from DESC
         LIMIT 1
       ) AS current_assignment
     FROM printers p
     WHERE p.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return { ...mapRow(row), currentAssignment: row.current_assignment };
}

export async function findBySerialNumber(serialNumber) {
  const { rows } = await pool.query(
    `SELECT * FROM printers WHERE serial_number = $1`,
    [serialNumber],
  );
  return mapRow(rows[0]);
}

export async function serialNumberExists(serialNumber, excludeId = null) {
  const { rows } = await pool.query(
    `SELECT id FROM printers WHERE serial_number = $1${excludeId ? ' AND id != $2' : ''}`,
    excludeId ? [serialNumber, excludeId] : [serialNumber],
  );
  return rows.length > 0;
}

export async function create({ serialNumber, model, city, location, xsmDeviceId, xsmEnabled, isBwOnly, latitude, longitude, serviceType }) {
  const { rows } = await pool.query(
    `INSERT INTO printers (serial_number, model, city, location, xsm_device_id, xsm_enabled, is_bw_only, latitude, longitude, service_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [serialNumber, model, city, location, xsmDeviceId ?? null, xsmEnabled ?? false, isBwOnly ?? false, latitude ?? null, longitude ?? null, serviceType ?? null],
  );
  return findById(rows[0].id);
}

export async function update(id, fields) {
  const columnMap = {
    serialNumber: 'serial_number',
    model: 'model',
    city: 'city',
    location: 'location',
    xsmDeviceId: 'xsm_device_id',
    xsmEnabled: 'xsm_enabled',
    isBwOnly: 'is_bw_only',
    lastSeenAt: 'last_seen_at',
    latitude: 'latitude',
    longitude: 'longitude',
    serviceType: 'service_type',
    isActive:    'is_active',
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
    `UPDATE printers SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    values,
  );
  if (rowCount === 0) return null;
  return findById(id);
}

export async function hasActiveAssignment(id) {
  const { rows } = await pool.query(
    `SELECT id FROM contract_printers
     WHERE printer_id = $1
       AND (assigned_until IS NULL OR assigned_until >= CURRENT_DATE)
     LIMIT 1`,
    [id],
  );
  return rows.length > 0;
}

export async function deleteById(id) {
  const { rowCount } = await pool.query(`DELETE FROM printers WHERE id = $1`, [id]);
  return rowCount > 0;
}
