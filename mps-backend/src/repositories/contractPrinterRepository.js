import pool from '../config/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    contractId: row.contract_id,
    printerId: row.printer_id,
    contractType: row.contract_type,
    fixedCharge: row.fixed_charge != null ? Number(row.fixed_charge) : null,
    bwPrice:     row.bw_price    != null ? Number(row.bw_price)    : null,
    colorPrice:  row.color_price != null ? Number(row.color_price) : null,
    overrideMinBwPages:    row.override_min_bw_pages    != null ? Number(row.override_min_bw_pages)    : null,
    overrideMinColorPages: row.override_min_color_pages != null ? Number(row.override_min_color_pages) : null,
    assignedFrom: row.assigned_from,
    assignedUntil: row.assigned_until,
    createdAt: row.created_at,
  };
}

export async function findAll({ contractId, printerId } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (contractId) {
    conditions.push(`cp.contract_id = $${idx++}`);
    values.push(contractId);
  }
  if (printerId) {
    conditions.push(`cp.printer_id = $${idx++}`);
    values.push(printerId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT
       cp.*,
       json_build_object(
         'id',           p.id,
         'serialNumber', p.serial_number,
         'model',        p.model,
         'city',         p.city,
         'location',     p.location,
         'xsmEnabled',   p.xsm_enabled,
         'isBwOnly',     p.is_bw_only
       ) AS printer,
       json_build_object(
         'id',             co.id,
         'contractNumber', co.contract_number,
         'isActive',       co.is_active,
         'customerName',   cu.name
       ) AS contract
     FROM contract_printers cp
     JOIN printers p ON cp.printer_id = p.id
     JOIN contracts co ON cp.contract_id = co.id
     JOIN customers cu ON co.customer_id = cu.id
     ${where}
     ORDER BY cp.assigned_from DESC`,
    values,
  );

  return rows.map((row) => ({ ...mapRow(row), printer: row.printer, contract: row.contract }));
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT
       cp.*,
       json_build_object(
         'id',           p.id,
         'serialNumber', p.serial_number,
         'model',        p.model,
         'city',         p.city,
         'location',     p.location,
         'xsmEnabled',   p.xsm_enabled,
         'isBwOnly',     p.is_bw_only
       ) AS printer,
       json_build_object(
         'id',             co.id,
         'contractNumber', co.contract_number,
         'isActive',       co.is_active,
         'customerName',   cu.name
       ) AS contract
     FROM contract_printers cp
     JOIN printers p ON cp.printer_id = p.id
     JOIN contracts co ON cp.contract_id = co.id
     JOIN customers cu ON co.customer_id = cu.id
     WHERE cp.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return { ...mapRow(row), printer: row.printer, contract: row.contract };
}

export async function hasOverlap(printerId, assignedFrom, excludeId = null) {
  const values = [printerId, assignedFrom];
  const excludeClause = excludeId ? ` AND id != $3` : '';
  if (excludeId) values.push(excludeId);

  const { rows } = await pool.query(
    `SELECT id FROM contract_printers
     WHERE printer_id = $1
       AND (assigned_until IS NULL OR assigned_until >= $2::date)
       ${excludeClause}
     LIMIT 1`,
    values,
  );
  return rows.length > 0;
}

// Most recent active assignment for a printer as of periodStart — used by XSM import
export async function findActiveForPrinter(printerId, periodStart) {
  const { rows } = await pool.query(
    `SELECT * FROM contract_printers
     WHERE printer_id = $1
       AND (assigned_until IS NULL OR assigned_until >= $2::date)
     ORDER BY assigned_from DESC
     LIMIT 1`,
    [printerId, periodStart],
  );
  return mapRow(rows[0]);
}

// Most recent assignment for a printer on a specific contract — used by meter reading service
export async function findByPrinterAndContract(printerId, contractId) {
  const { rows } = await pool.query(
    `SELECT * FROM contract_printers
     WHERE printer_id = $1 AND contract_id = $2
     ORDER BY assigned_from DESC
     LIMIT 1`,
    [printerId, contractId],
  );
  return mapRow(rows[0]);
}

export async function contractExists(contractId) {
  const { rows } = await pool.query(`SELECT id FROM contracts WHERE id = $1`, [contractId]);
  return rows.length > 0;
}

export async function printerExists(printerId) {
  const { rows } = await pool.query(`SELECT id FROM printers WHERE id = $1`, [printerId]);
  return rows.length > 0;
}

export async function create({ contractId, printerId, assignedFrom, assignedUntil, contractType, fixedCharge, bwPrice, colorPrice, overrideMinBwPages, overrideMinColorPages }) {
  const { rows } = await pool.query(
    `INSERT INTO contract_printers (contract_id, printer_id, assigned_from, assigned_until, contract_type, fixed_charge, bw_price, color_price, override_min_bw_pages, override_min_color_pages)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [contractId, printerId, assignedFrom, assignedUntil ?? null, contractType, fixedCharge ?? null, bwPrice ?? null, colorPrice ?? null, overrideMinBwPages ?? null, overrideMinColorPages ?? null],
  );
  return findById(rows[0].id);
}

export async function deleteByContractId(contractId) {
  await pool.query(`DELETE FROM contract_printers WHERE contract_id = $1`, [contractId]);
}

export async function update(id, fields) {
  const columnMap = {
    contractId:            'contract_id',
    assignedFrom:          'assigned_from',
    assignedUntil:         'assigned_until',
    contractType:          'contract_type',
    fixedCharge:           'fixed_charge',
    bwPrice:               'bw_price',
    colorPrice:            'color_price',
    overrideMinBwPages:    'override_min_bw_pages',
    overrideMinColorPages: 'override_min_color_pages',
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
    `UPDATE contract_printers SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    values,
  );
  if (rowCount === 0) return null;
  return findById(id);
}

export async function deleteById(id) {
  const { rowCount } = await pool.query(
    `DELETE FROM contract_printers WHERE id = $1`,
    [id],
  );
  return rowCount > 0;
}
