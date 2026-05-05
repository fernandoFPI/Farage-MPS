import pool from '../config/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    contractId: row.contract_id,
    specialistUserId: row.specialist_user_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    disputeNote: row.dispute_note,
    confirmedAt: row.confirmed_at,
    odooInvoiceId: row.odoo_invoice_id,
    invoicedAt: row.invoiced_at,
    createdAt: row.created_at,
    cycleGroupId: row.cycle_group_id ?? null,
    groupPosition: row.group_position ?? null,
    lockedPrinters: row.locked_printers ?? [],
    isBaseline: row.is_baseline ?? false,
    baselineSetBy: row.baseline_set_by ?? null,
    baselineSetAt: row.baseline_set_at ?? null,
    baselineSetByName: row.baseline_set_by_name ?? null,
  };
}

export async function findAll({ contractId, status } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (contractId) { conditions.push(`bc.contract_id = $${idx++}`); values.push(contractId); }
  if (status)     { conditions.push(`bc.status = $${idx++}`);       values.push(status); }

  conditions.push('bc.is_cancelled = false');
  const where = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT bc.*, co.contract_number, co.contract_mode, co.official_contract_number, cu.name AS customer_name,
            bu.full_name AS baseline_set_by_name,
            TO_CHAR(bc.period_start, 'Month YYYY') AS cycle_month
     FROM billing_cycles bc
     JOIN contracts co ON bc.contract_id = co.id
     JOIN customers cu ON co.customer_id = cu.id
     LEFT JOIN users bu ON bc.baseline_set_by = bu.id
     ${where}
     ORDER BY bc.created_at DESC`,
    values,
  );

  return rows.map((row) => ({
    ...mapRow(row),
    contractNumber: row.contract_number,
    customerName: row.customer_name,
    cycleName: `${row.customer_name.trim()} — ${row.cycle_month.trim()}`,
    contract: { contractNumber: row.contract_number, contractMode: row.contract_mode ?? 'osg', officialContractNumber: row.official_contract_number ?? null },
  }));
}

// Returns cycle with full contract pricing + customer — used by both billing and meter reading services
export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT bc.*,
       TO_CHAR(bc.period_start, 'Month YYYY') AS cycle_month,
       json_build_object(
         'id',                 co.id,
         'contractNumber',          co.contract_number,
         'officialContractNumber',  co.official_contract_number,
         'billingType',             co.billing_type,
         'fixedCharge',        co.fixed_charge::float8,
         'bwPrice',            co.bw_price::float8,
         'colorPrice',         co.color_price::float8,
         'excessBwPrice',      co.excess_bw_price::float8,
         'excessColorPrice',   co.excess_color_price::float8,
         'minBwPages',         co.min_bw_pages,
         'minColorPages',      co.min_color_pages,
         'a4Price',            co.a4_price::float8,
         'a3Price',            co.a3_price::float8,
         'isActive',           co.is_active,
         'currency',           co.currency,
         'contractType',       co.contract_type,
         'contractMode',       co.contract_mode,
         'invoiceFrequency',   co.invoice_frequency,
         'combinedInvoice',    co.combined_invoice,
         'customer', json_build_object(
           'id',   cu.id,
           'name', cu.name
         )
       ) AS contract
     FROM billing_cycles bc
     JOIN contracts co ON bc.contract_id = co.id
     JOIN customers cu ON co.customer_id = cu.id
     LEFT JOIN users bu ON bc.baseline_set_by = bu.id
     WHERE bc.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  const cycleName = `${row.contract.customer.name.trim()} — ${row.cycle_month.trim()}`;
  return { ...mapRow(row), contract: row.contract, cycleName };
}

// Find a specific cycle by contract + period — used by XSM import service
export async function findByContractAndPeriod(contractId, periodStart) {
  const { rows } = await pool.query(
    `SELECT bc.*, bu.full_name AS baseline_set_by_name
     FROM billing_cycles bc
     LEFT JOIN users bu ON bc.baseline_set_by = bu.id
     WHERE contract_id = $1
       AND period_start = $2
       AND bc.is_cancelled = false
     LIMIT 1`,
    [contractId, periodStart],
  );
  return mapRow(rows[0]);
}

export async function cycleExists(contractId, periodStart) {
  const { rows } = await pool.query(
    `SELECT id
     FROM billing_cycles
     WHERE contract_id = $1
       AND period_start = $2
       AND is_cancelled = false`,
    [contractId, periodStart],
  );
  return rows.length > 0;
}

export async function contractActiveExists(contractId) {
  const { rows } = await pool.query(
    `SELECT id FROM contracts WHERE id = $1 AND is_active = true`,
    [contractId],
  );
  return rows.length > 0;
}

export async function create({ contractId, periodStart, periodEnd, specialistUserId }) {
  const { rows } = await pool.query(
    `INSERT INTO billing_cycles (
       contract_id, period_start, period_end, specialist_user_id, status,
       is_baseline, baseline_set_by, baseline_set_at
     )
     VALUES ($1, $2, $3, $4, 'open', false, NULL, NULL)
     RETURNING id`,
    [contractId, periodStart, periodEnd, specialistUserId],
  );
  return findById(rows[0].id);
}

export async function findLaterConfirmedCycles(contractId, afterPeriodStart) {
  const { rows } = await pool.query(
    `SELECT id FROM billing_cycles
     WHERE contract_id = $1
       AND period_start > $2
       AND status IN ('confirmed', 'invoiced')
     LIMIT 1`,
    [contractId, afterPeriodStart],
  );
  return rows;
}

export async function findByCycleGroupId(cycleGroupId) {
  const { rows } = await pool.query(
    `SELECT bc.*,
       TO_CHAR(bc.period_start, 'Month YYYY') AS cycle_month,
       bu.full_name AS baseline_set_by_name,
       json_build_object(
         'id',               co.id,
         'contractNumber',   co.contract_number,
         'billingType',      co.billing_type,
         'fixedCharge',      co.fixed_charge::float8,
         'bwPrice',          co.bw_price::float8,
         'colorPrice',       co.color_price::float8,
         'excessBwPrice',    co.excess_bw_price::float8,
         'excessColorPrice', co.excess_color_price::float8,
         'minBwPages',       co.min_bw_pages,
         'minColorPages',    co.min_color_pages,
         'a4Price',          co.a4_price::float8,
         'a3Price',          co.a3_price::float8,
         'isActive',         co.is_active,
         'currency',         co.currency,
         'contractType',     co.contract_type,
         'invoiceFrequency', co.invoice_frequency,
         'combinedInvoice',  co.combined_invoice,
         'customer', json_build_object('id', cu.id, 'name', cu.name)
       ) AS contract
     FROM billing_cycles bc
     JOIN contracts co ON bc.contract_id = co.id
     JOIN customers cu ON co.customer_id = cu.id
     LEFT JOIN users bu ON bc.baseline_set_by = bu.id
     WHERE bc.cycle_group_id = $1
     ORDER BY bc.group_position ASC`,
    [cycleGroupId],
  );
  return rows.map(row => ({
    ...mapRow(row),
    contract: row.contract,
    cycleName: `${row.contract.customer.name.trim()} — ${row.cycle_month.trim()}`,
  }));
}

export async function cancelById(id, userId) {
  const { rowCount } = await pool.query(
    `UPDATE billing_cycles
     SET is_cancelled = true, cancelled_at = NOW(), cancelled_by_user_id = $2
     WHERE id = $1`,
    [id, userId],
  );
  return rowCount > 0;
}

export async function update(id, fields) {
  const columnMap = {
    status:        'status',
    disputeNote:   'dispute_note',
    confirmedAt:   'confirmed_at',
    cycleGroupId:  'cycle_group_id',
    groupPosition: 'group_position',
    isBaseline:    'is_baseline',
    baselineSetBy: 'baseline_set_by',
    baselineSetAt: 'baseline_set_at',
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
    `UPDATE billing_cycles SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    values,
  );
  if (rowCount === 0) return null;
  return findById(id);
}

export async function updateLockedPrinters(id, lockedPrinters) {
  await pool.query(
    `UPDATE billing_cycles SET locked_printers = $1 WHERE id = $2`,
    [JSON.stringify(lockedPrinters), id],
  );
}

export async function setBaseline(id, isBaseline, userId) {
  await pool.query(
    `UPDATE billing_cycles
     SET is_baseline = $1, baseline_set_by = $2, baseline_set_at = NOW()
     WHERE id = $3`,
    [isBaseline, userId, id],
  );
  return findById(id);
}
