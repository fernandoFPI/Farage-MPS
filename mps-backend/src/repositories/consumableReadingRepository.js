import pool from '../config/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    meterReadingId: row.meter_reading_id,
    printerId: row.printer_id,
    billingCycleId: row.billing_cycle_id,
    submittedByUserId: row.submitted_by_user_id,
    submittedByName: row.submitted_by_name ?? null,
    cPct: row.c_pct != null ? Number(row.c_pct) : null,
    mPct: row.m_pct != null ? Number(row.m_pct) : null,
    yPct: row.y_pct != null ? Number(row.y_pct) : null,
    kPct: row.k_pct != null ? Number(row.k_pct) : null,
    r1Pct: row.r1_pct != null ? Number(row.r1_pct) : null,
    r2Pct: row.r2_pct != null ? Number(row.r2_pct) : null,
    r3Pct: row.r3_pct != null ? Number(row.r3_pct) : null,
    r4Pct: row.r4_pct != null ? Number(row.r4_pct) : null,
    wasteTonePct: row.waste_toner_pct != null ? Number(row.waste_toner_pct) : null,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    // joined fields
    printerSerial: row.printer_serial ?? null,
    printerModel: row.printer_model ?? null,
    isBwOnly: row.is_bw_only ?? false,
    customerName: row.customer_name ?? null,
    cycleName: row.cycle_name ?? null,
  };
}

export async function findAll({ printerId, billingCycleId, customerId } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (printerId)     { conditions.push(`cr.printer_id = $${idx++}`);        values.push(printerId); }
  if (billingCycleId){ conditions.push(`cr.billing_cycle_id = $${idx++}`);  values.push(billingCycleId); }
  if (customerId)    { conditions.push(`cu.id = $${idx++}`);                values.push(customerId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT cr.*,
            u.full_name AS submitted_by_name,
            p.serial_number AS printer_serial,
            p.model AS printer_model,
            p.is_bw_only,
            cu.name AS customer_name,
            TO_CHAR(bc.period_end, 'Month YYYY') AS cycle_name
     FROM consumable_readings cr
     LEFT JOIN users u ON u.id = cr.submitted_by_user_id
     LEFT JOIN printers p ON p.id = cr.printer_id
     LEFT JOIN billing_cycles bc ON bc.id = cr.billing_cycle_id
     LEFT JOIN contracts co ON co.id = bc.contract_id
     LEFT JOIN customers cu ON cu.id = co.customer_id
     ${where}
     ORDER BY cr.submitted_at DESC`,
    values,
  );
  return rows.map(mapRow);
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT cr.*,
            u.full_name AS submitted_by_name,
            p.serial_number AS printer_serial,
            p.model AS printer_model,
            p.is_bw_only,
            cu.name AS customer_name,
            TO_CHAR(bc.period_end, 'Month YYYY') AS cycle_name
     FROM consumable_readings cr
     LEFT JOIN users u ON u.id = cr.submitted_by_user_id
     LEFT JOIN printers p ON p.id = cr.printer_id
     LEFT JOIN billing_cycles bc ON bc.id = cr.billing_cycle_id
     LEFT JOIN contracts co ON co.id = bc.contract_id
     LEFT JOIN customers cu ON cu.id = co.customer_id
     WHERE cr.id = $1`,
    [id],
  );
  return mapRow(rows[0]);
}

export async function findByPrinterAndCycle(printerId, billingCycleId) {
  const { rows } = await pool.query(
    `SELECT id FROM consumable_readings WHERE printer_id = $1 AND billing_cycle_id = $2 LIMIT 1`,
    [printerId, billingCycleId],
  );
  return rows[0] ?? null;
}

export async function create({ meterReadingId, printerId, billingCycleId, submittedByUserId,
  cPct, mPct, yPct, kPct, r1Pct, r2Pct, r3Pct, r4Pct, wasteTonePct }) {
  const { rows } = await pool.query(
    `INSERT INTO consumable_readings
       (meter_reading_id, printer_id, billing_cycle_id, submitted_by_user_id,
        c_pct, m_pct, y_pct, k_pct, r1_pct, r2_pct, r3_pct, r4_pct, waste_toner_pct)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [meterReadingId, printerId, billingCycleId, submittedByUserId,
     cPct ?? null, mPct ?? null, yPct ?? null, kPct ?? null,
     r1Pct ?? null, r2Pct ?? null, r3Pct ?? null, r4Pct ?? null, wasteTonePct ?? null],
  );
  return mapRow(rows[0]);
}

export async function updateById(id, { cPct, mPct, yPct, kPct, r1Pct, r2Pct, r3Pct, r4Pct, wasteTonePct }) {
  const { rows } = await pool.query(
    `UPDATE consumable_readings
     SET c_pct=$1, m_pct=$2, y_pct=$3, k_pct=$4,
         r1_pct=$5, r2_pct=$6, r3_pct=$7, r4_pct=$8, waste_toner_pct=$9
     WHERE id=$10
     RETURNING *`,
    [cPct ?? null, mPct ?? null, yPct ?? null, kPct ?? null,
     r1Pct ?? null, r2Pct ?? null, r3Pct ?? null, r4Pct ?? null, wasteTonePct ?? null, id],
  );
  return mapRow(rows[0]);
}
