import pool from '../config/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    printerId: row.printer_id,
    billingCycleId: row.billing_cycle_id,
    submittedByUserId: row.submitted_by_user_id,
    source: row.source,
    a4Bw: Number(row.a4_bw),
    a3Bw: Number(row.a3_bw),
    a4Color: Number(row.a4_color),
    a3Color: Number(row.a3_color),
    xls: Number(row.xls),
    excessBw:    Number(row.excess_bw),
    excessColor: Number(row.excess_color),
    readAt: row.read_at,
    submittedAt: row.submitted_at ?? null,
    createdAt: row.created_at,
    photos: row.photos ?? [],
    lockAcquiredAt: row.lock_acquired_at ?? null,
    submissionDurationSeconds: row.submission_duration_seconds != null ? Number(row.submission_duration_seconds) : null,
    flagged: row.flagged ?? false,
    flagReason: row.flag_reason ?? null,
  };
}

export async function findAll({ printerId, billingCycleId, source, customerId } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (printerId)     { conditions.push(`mr.printer_id = $${idx++}`);       values.push(printerId); }
  if (billingCycleId){ conditions.push(`mr.billing_cycle_id = $${idx++}`); values.push(billingCycleId); }
  if (source)        { conditions.push(`mr.source = $${idx++}`);           values.push(source); }
  if (customerId)    { conditions.push(`cu.id = $${idx++}`);               values.push(customerId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT mr.id, mr.printer_id, mr.billing_cycle_id, mr.submitted_by_user_id, mr.source,
            mr.a4_bw, mr.a3_bw, mr.a4_color, mr.a3_color, mr.xls,
            mr.excess_bw, mr.excess_color, mr.read_at, mr.submitted_at, mr.created_at,
            COALESCE(
              (SELECT jsonb_agg(photo - 'data') FROM jsonb_array_elements(mr.photos) AS photo),
              '[]'::jsonb
            ) AS photos,
            p.serial_number, p.model, p.is_bw_only,
            cu.name AS customer_name,
            TO_CHAR(bc.period_start, 'Month YYYY') AS cycle_month,
            u.full_name AS submitted_by_name
     FROM meter_readings mr
     JOIN printers p ON mr.printer_id = p.id
     JOIN billing_cycles bc ON mr.billing_cycle_id = bc.id
     JOIN contracts c ON bc.contract_id = c.id
     JOIN customers cu ON c.customer_id = cu.id
     LEFT JOIN users u ON mr.submitted_by_user_id = u.id
     ${where}
     ORDER BY mr.read_at DESC`,
    values,
  );
  return rows.map(row => ({
    ...mapRow(row),
    serialNumber: row.serial_number,
    model: row.model,
    isBwOnly: row.is_bw_only ?? false,
    customerName: row.customer_name,
    cycleName: `${row.customer_name.trim()} — ${row.cycle_month.trim()}`,
    submittedByName: row.submitted_by_name ?? null,
  }));
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT mr.*, u.full_name AS submitted_by_name
     FROM meter_readings mr
     LEFT JOIN users u ON mr.submitted_by_user_id = u.id
     WHERE mr.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  return { ...mapRow(rows[0]), submittedByName: rows[0].submitted_by_name ?? null };
}

export async function getPhotosByReadingId(id) {
  const { rows } = await pool.query(
    `SELECT photos FROM meter_readings WHERE id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  return rows[0].photos ?? [];
}

export async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO meter_readings (
       printer_id, billing_cycle_id, submitted_by_user_id, source,
       a4_bw, a3_bw, a4_color, a3_color, xls,
       excess_bw, excess_color,
       read_at, submitted_at, photos,
       lock_acquired_at, submission_duration_seconds,
       flagged, flag_reason
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),$13,$14,$15,$16,$17)
     RETURNING id`,
    [
      data.printerId,
      data.billingCycleId,
      data.submittedByUserId,
      data.source,
      data.a4Bw,
      data.a3Bw,
      data.a4Color,
      data.a3Color,
      data.xls ?? 0,
      data.excessBw    ?? 0,
      data.excessColor ?? 0,
      data.readAt,
      JSON.stringify(data.photos ?? []),
      data.lockAcquiredAt ?? null,
      data.submissionDurationSeconds ?? null,
      data.flagged ?? false,
      data.flagReason ?? null,
    ],
  );
  return findById(rows[0].id);
}

// Most recent reading for a printer strictly before a date (for previous-period baseline)
export async function getPreviousReading(printerId, beforeDate) {
  const { rows } = await pool.query(
    `SELECT * FROM meter_readings
     WHERE printer_id = $1 AND read_at < $2
     ORDER BY read_at DESC
     LIMIT 1`,
    [printerId, beforeDate],
  );
  return mapRow(rows[0]);
}

// Finds the latest reading from the most recent previous cycle, including baseline cycles.
// Baseline cycles must still provide the raw counter starting point for the next cycle.
export async function getPreviousCycleReading(printerId, currentCycleId, currentPeriodStart) {
  const { rows } = await pool.query(
    `SELECT mr.excess_bw, mr.excess_color, mr.a4_bw, mr.a3_bw, mr.a4_color, mr.a3_color, mr.xls,
            bc.is_baseline AS cycle_is_baseline
     FROM meter_readings mr
     JOIN billing_cycles bc ON mr.billing_cycle_id = bc.id
     WHERE mr.printer_id = $1
       AND mr.billing_cycle_id != $2
       AND bc.period_start < $3
     ORDER BY bc.period_start DESC, mr.read_at DESC
     LIMIT 1`,
    [printerId, currentCycleId, currentPeriodStart],
  );
  if (!rows[0]) return null;
  return {
    ...mapRow(rows[0]),
    cycleIsBaseline: rows[0].cycle_is_baseline ?? false,
  };
}

// Finds the latest reading from the most recent non-baseline cycle before the current cycle.
// We compare using the billing cycle period, not mr.read_at, because readings may be submitted late.
export async function getPreviousNonBaselineReading(printerId, currentCycleId, currentPeriodStart) {
  const { rows } = await pool.query(
    `SELECT mr.excess_bw, mr.excess_color, mr.a4_bw, mr.a3_bw, mr.a4_color, mr.a3_color, mr.xls
     FROM meter_readings mr
     JOIN billing_cycles bc ON mr.billing_cycle_id = bc.id
     WHERE mr.printer_id = $1
       AND mr.billing_cycle_id != $2
       AND bc.period_start < $3
       AND bc.is_baseline = false
     ORDER BY bc.period_start DESC, mr.read_at DESC
     LIMIT 1`,
    [printerId, currentCycleId, currentPeriodStart],
  );
  return mapRow(rows[0]);
}

// Last N readings strictly before a date — for historical average computation
export async function getRecentReadings(printerId, beforeDate, count) {
  const { rows } = await pool.query(
    `SELECT * FROM meter_readings
     WHERE printer_id = $1 AND read_at < $2
     ORDER BY read_at DESC
     LIMIT $3`,
    [printerId, beforeDate, count],
  );
  return rows.map(mapRow);
}

// One row per printer (most recent reading) with printer detail + contractType for the cycle summary
export async function findAllWithPrinterInfo(billingCycleId, contractId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (mr.printer_id)
       mr.*,
       p.serial_number,
       p.model,
       p.is_bw_only,
       (
         SELECT cp.contract_type
         FROM contract_printers cp
         WHERE cp.printer_id = mr.printer_id
           AND cp.contract_id = $2
         ORDER BY cp.assigned_from DESC
         LIMIT 1
       ) AS contract_type,
       (
         SELECT cp.fixed_charge
         FROM contract_printers cp
         WHERE cp.printer_id = mr.printer_id
           AND cp.contract_id = $2
         ORDER BY cp.assigned_from DESC
         LIMIT 1
       ) AS printer_fixed_charge,
       (
         SELECT cp.bw_price
         FROM contract_printers cp
         WHERE cp.printer_id = mr.printer_id
           AND cp.contract_id = $2
         ORDER BY cp.assigned_from DESC
         LIMIT 1
       ) AS printer_bw_price,
       (
         SELECT cp.color_price
         FROM contract_printers cp
         WHERE cp.printer_id = mr.printer_id
           AND cp.contract_id = $2
         ORDER BY cp.assigned_from DESC
         LIMIT 1
       ) AS printer_color_price,
       (
         SELECT cp.override_min_bw_pages
         FROM contract_printers cp
         WHERE cp.printer_id = mr.printer_id
           AND cp.contract_id = $2
         ORDER BY cp.assigned_from DESC
         LIMIT 1
       ) AS printer_override_min_bw_pages,
       (
         SELECT cp.override_min_color_pages
         FROM contract_printers cp
         WHERE cp.printer_id = mr.printer_id
           AND cp.contract_id = $2
         ORDER BY cp.assigned_from DESC
         LIMIT 1
       ) AS printer_override_min_color_pages
     FROM meter_readings mr
     JOIN printers p ON mr.printer_id = p.id
     WHERE mr.billing_cycle_id = $1
     ORDER BY mr.printer_id, mr.read_at DESC`,
    [billingCycleId, contractId],
  );

  return rows.map((row) => ({
    ...mapRow(row),
    serialNumber: row.serial_number,
    model: row.model,
    isBwOnly: row.is_bw_only ?? false,
    contractType: row.contract_type,
    printerFixedCharge:          row.printer_fixed_charge             != null ? Number(row.printer_fixed_charge)             : null,
    printerBwPrice:              row.printer_bw_price                 != null ? Number(row.printer_bw_price)                 : null,
    printerColorPrice:           row.printer_color_price              != null ? Number(row.printer_color_price)              : null,
    printerOverrideMinBwPages:   row.printer_override_min_bw_pages    != null ? Number(row.printer_override_min_bw_pages)    : null,
    printerOverrideMinColorPages:row.printer_override_min_color_pages != null ? Number(row.printer_override_min_color_pages) : null,
  }));
}

// Duplicate reading guard (any source)
export async function existsForPrinterAndCycle(printerId, billingCycleId) {
  const { rows } = await pool.query(
    `SELECT id FROM meter_readings
     WHERE printer_id = $1 AND billing_cycle_id = $2
     LIMIT 1`,
    [printerId, billingCycleId],
  );
  return rows.length > 0;
}

// Duplicate XSM reading guard
export async function existsXsmReading(printerId, billingCycleId) {
  const { rows } = await pool.query(
    `SELECT id FROM meter_readings
     WHERE printer_id = $1 AND billing_cycle_id = $2 AND source = 'xsm'
     LIMIT 1`,
    [printerId, billingCycleId],
  );
  return rows.length > 0;
}

export async function updateById(id, data) {
  const { rowCount } = await pool.query(
    `UPDATE meter_readings
     SET a4_bw = $1, a3_bw = $2, a4_color = $3, a3_color = $4, xls = $5,
         excess_bw = $6, excess_color = $7, read_at = $8
     WHERE id = $9`,
    [
      data.a4Bw, data.a3Bw, data.a4Color, data.a3Color, data.xls ?? 0,
      data.excessBw ?? 0, data.excessColor ?? 0, data.readAt, id,
    ],
  );
  if (rowCount === 0) return null;
  return findById(id);
}

export async function deleteById(id) {
  const { rowCount } = await pool.query(`DELETE FROM meter_readings WHERE id = $1`, [id]);
  return rowCount > 0;
}
