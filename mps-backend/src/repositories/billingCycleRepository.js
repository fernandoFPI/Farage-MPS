import pool from '../config/db.js';
import { findByCycleId as findCityStatuses } from './cityCycleStatusRepository.js';

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
    storageSubmitted: row.storage_submitted ?? false,
    storageSubmittedAt: row.storage_submitted_at ?? null,
    storageSubmittedBy: row.storage_submitted_by ?? null,
    storageSubmittedByName: row.storage_submitted_by_name ?? null,
    storageUnavailableReason: row.storage_unavailable_reason ?? null,
    contractGroupId:   row.contract_group_id   ?? null,
    contractGroupName: row.contract_group_name ?? null,
    isGrouped:         !!row.contract_group_id,
    deletedAt:            row.deleted_at              ?? null,
    deletedByUserId:      row.deleted_by_user_id      ?? null,
    manualBillingAmount:  row.manual_billing_amount != null ? Number(row.manual_billing_amount) : null,
  };
}

export async function findAll({ contractId, status, excludeInvoiced } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (contractId)      { conditions.push(`bc.contract_id = $${idx++}`);   values.push(contractId); }
  if (status)          { conditions.push(`bc.status = $${idx++}`);         values.push(status); }
  if (excludeInvoiced) { conditions.push('bc.odoo_invoice_id IS NULL'); }

  conditions.push('bc.is_cancelled = false');
  conditions.push('bc.deleted_at IS NULL');
  const where = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT bc.*, co.contract_number, co.contract_mode, co.official_contract_number, co.service_type, cu.name AS customer_name,
            bu.full_name AS baseline_set_by_name,
            su.full_name AS storage_submitted_by_name,
            TO_CHAR(bc.period_end, 'Month YYYY') AS cycle_month,
            cg.id   AS contract_group_id,
            cg.name AS contract_group_name,
            COALESCE(
              (SELECT json_agg(json_build_object('city', cs.city, 'status', cs.status, 'totalPrinters', cs.total_printers, 'submittedPrinters', cs.submitted_printers))
               FROM billing_cycle_city_status cs WHERE cs.billing_cycle_id = bc.id),
              '[]'::json
            ) AS city_statuses
     FROM billing_cycles bc
     JOIN contracts co ON bc.contract_id = co.id
     JOIN customers cu ON co.customer_id = cu.id
     LEFT JOIN users bu ON bc.baseline_set_by = bu.id
     LEFT JOIN users su ON bc.storage_submitted_by = su.id
     LEFT JOIN contract_groups cg ON cg.id = (
       SELECT cgm.group_id FROM contract_group_members cgm
       WHERE cgm.contract_id = bc.contract_id LIMIT 1
     )
     ${where}
     ORDER BY bc.created_at DESC`,
    values,
  );

  return rows.map((row) => {
    const cityStatuses = row.city_statuses ?? [];
    return {
      ...mapRow(row),
      contractNumber: row.contract_number,
      customerName: row.customer_name,
      cycleName: `${row.customer_name.trim()} — ${row.cycle_month.trim()}`,
      contract: { contractNumber: row.contract_number, contractMode: row.contract_mode ?? 'osg', officialContractNumber: row.official_contract_number ?? null, serviceType: row.service_type ?? null },
      cityStatuses,
    };
  });
}

// Returns cycle with full contract pricing + customer — used by both billing and meter reading services
export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT bc.*,
       bu.full_name AS baseline_set_by_name,
       su.full_name AS storage_submitted_by_name,
       TO_CHAR(bc.period_end, 'Month YYYY') AS cycle_month,
       cg.id   AS contract_group_id,
       cg.name AS contract_group_name,
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
         'serviceType',        co.service_type,
         'invoiceRules',       co.invoice_rules,
         'odooCompany',        co.odoo_company,
         'customer', json_build_object(
           'id',   cu.id,
           'name', cu.name
         )
       ) AS contract
     FROM billing_cycles bc
     JOIN contracts co ON bc.contract_id = co.id
     JOIN customers cu ON co.customer_id = cu.id
     LEFT JOIN users bu ON bc.baseline_set_by = bu.id
     LEFT JOIN users su ON bc.storage_submitted_by = su.id
     LEFT JOIN contract_groups cg ON cg.id = (
       SELECT cgm.group_id FROM contract_group_members cgm
       WHERE cgm.contract_id = bc.contract_id LIMIT 1
     )
     WHERE bc.id = $1 AND bc.deleted_at IS NULL`,
    [id],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  const cycleName = `${row.contract.customer.name.trim()} — ${row.cycle_month.trim()}`;
  const cityStatuses = await findCityStatuses(row.id);
  const allCitiesReady = cityStatuses.length > 0 &&
    cityStatuses.every(c => c.status === 'complete' || c.status === 'confirmed');
  return { ...mapRow(row), contract: row.contract, cycleName, cityStatuses, allCitiesReady };
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
       AND bc.deleted_at IS NULL
     LIMIT 1`,
    [contractId, periodStart],
  );
  return mapRow(rows[0]);
}

export async function findByContractAndPeriodRange(contractId, fromDate, toDate) {
  const { rows } = await pool.query(
    `SELECT bc.*, TO_CHAR(bc.period_end, 'Month YYYY') AS cycle_month,
            cu.name AS customer_name
     FROM billing_cycles bc
     JOIN contracts co ON bc.contract_id = co.id
     JOIN customers cu ON co.customer_id = cu.id
     WHERE bc.contract_id = $1
       AND bc.period_start >= $2
       AND bc.period_start < $3
       AND bc.is_cancelled = false
       AND bc.deleted_at IS NULL
     ORDER BY bc.period_start ASC`,
    [contractId, fromDate, toDate],
  );
  return rows.map(row => ({
    ...mapRow(row),
    cycleName: `${row.customer_name.trim()} — ${row.cycle_month.trim()}`,
  }));
}

export async function cycleExists(contractId, periodStart) {
  const { rows } = await pool.query(
    `SELECT id
     FROM billing_cycles
     WHERE contract_id = $1
       AND period_start = $2
       AND is_cancelled = false
       AND deleted_at IS NULL`,
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
       AND deleted_at IS NULL
     LIMIT 1`,
    [contractId, afterPeriodStart],
  );
  return rows;
}

export async function findByCycleGroupId(cycleGroupId) {
  const { rows } = await pool.query(
    `SELECT bc.*,
       TO_CHAR(bc.period_end, 'Month YYYY') AS cycle_month,
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
         'invoiceRules',     co.invoice_rules,
         'customer', json_build_object('id', cu.id, 'name', cu.name)
       ) AS contract
     FROM billing_cycles bc
     JOIN contracts co ON bc.contract_id = co.id
     JOIN customers cu ON co.customer_id = cu.id
     LEFT JOIN users bu ON bc.baseline_set_by = bu.id
     WHERE bc.cycle_group_id = $1
       AND bc.deleted_at IS NULL
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

export async function findAllCancelled() {
  const { rows } = await pool.query(
    `SELECT bc.*, co.contract_number, cu.name AS customer_name,
            cu2.full_name AS cancelled_by_name,
            TO_CHAR(bc.period_end, 'Month YYYY') AS cycle_month
     FROM billing_cycles bc
     JOIN contracts co ON bc.contract_id = co.id
     JOIN customers cu ON co.customer_id = cu.id
     LEFT JOIN users cu2 ON bc.cancelled_by_user_id = cu2.id
     WHERE bc.is_cancelled = true
     ORDER BY bc.cancelled_at DESC`,
  );
  return rows.map(row => ({
    ...mapRow(row),
    contractNumber: row.contract_number,
    customerName: row.customer_name,
    cycleName: `${row.customer_name.trim()} — ${row.cycle_month.trim()}`,
    cancelledByName: row.cancelled_by_name ?? null,
  }));
}

export async function hardDeleteCancelledById(id) {
  const { rowCount } = await pool.query(
    `DELETE FROM billing_cycles WHERE id = $1 AND (is_cancelled = true OR deleted_at IS NOT NULL)`,
    [id],
  );
  return rowCount > 0;
}

export async function update(id, fields) {
  const columnMap = {
    status:         'status',
    disputeNote:    'dispute_note',
    confirmedAt:    'confirmed_at',
    cycleGroupId:   'cycle_group_id',
    groupPosition:  'group_position',
    isBaseline:     'is_baseline',
    baselineSetBy:  'baseline_set_by',
    baselineSetAt:  'baseline_set_at',
    odooInvoiceId:  'odoo_invoice_id',
    invoicedAt:     'invoiced_at',
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

export async function updatePeriod(id, periodStart, periodEnd) {
  const { rowCount } = await pool.query(
    `UPDATE billing_cycles SET period_start = $1, period_end = $2 WHERE id = $3`,
    [periodStart, periodEnd, id],
  );
  if (rowCount === 0) return null;
  return findById(id);
}

export async function periodStartTaken(contractId, periodStart, excludeId) {
  const { rows } = await pool.query(
    `SELECT id FROM billing_cycles
     WHERE contract_id = $1
       AND period_start = $2
       AND id != $3
       AND is_cancelled = false
       AND deleted_at IS NULL`,
    [contractId, periodStart, excludeId],
  );
  return rows.length > 0;
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

export async function markStorageSubmitted(id, userId, unavailableReason = null) {
  await pool.query(
    `UPDATE billing_cycles
     SET storage_submitted = true, storage_submitted_at = NOW(), storage_submitted_by = $2,
         storage_unavailable_reason = $3
     WHERE id = $1`,
    [id, userId, unavailableReason ?? null],
  );
  return findById(id);
}

export async function softDelete(id, userId) {
  const { rowCount } = await pool.query(
    `UPDATE billing_cycles
     SET deleted_at = NOW(), deleted_by_user_id = $2
     WHERE id = $1 AND deleted_at IS NULL`,
    [id, userId],
  );
  return rowCount > 0;
}

export async function findAllDeleted() {
  const { rows } = await pool.query(
    `SELECT bc.*, co.contract_number, cu.name AS customer_name,
            du.full_name AS deleted_by_name,
            TO_CHAR(bc.period_end, 'Month YYYY') AS cycle_month
     FROM billing_cycles bc
     JOIN contracts co ON bc.contract_id = co.id
     JOIN customers cu ON co.customer_id = cu.id
     LEFT JOIN users du ON bc.deleted_by_user_id = du.id
     WHERE bc.deleted_at IS NOT NULL
     ORDER BY bc.deleted_at DESC`,
  );
  return rows.map(row => ({
    ...mapRow(row),
    contractNumber: row.contract_number,
    customerName: row.customer_name,
    cycleName: `${row.customer_name.trim()} — ${row.cycle_month.trim()}`,
    deletedByName: row.deleted_by_name ?? null,
  }));
}

export async function restore(id) {
  const { rowCount } = await pool.query(
    `UPDATE billing_cycles
     SET deleted_at = NULL, deleted_by_user_id = NULL
     WHERE id = $1 AND deleted_at IS NOT NULL`,
    [id],
  );
  return rowCount > 0;
}

export async function resetStorage(id) {
  await pool.query(
    `UPDATE billing_cycles
     SET storage_submitted = false, storage_submitted_at = NULL, storage_submitted_by = NULL
     WHERE id = $1`,
    [id],
  );
  return findById(id);
}

export async function updateManualBillingAmount(id, amount) {
  await pool.query(
    `UPDATE billing_cycles SET manual_billing_amount = $1 WHERE id = $2`,
    [amount, id],
  );
  return findById(id);
}

export async function findLatestCycle(contractId) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(period_end, 'YYYY-MM-DD') AS period_end FROM billing_cycles
     WHERE contract_id = $1
       AND is_cancelled = false
       AND deleted_at IS NULL
     ORDER BY period_end DESC
     LIMIT 1`,
    [contractId],
  );
  return rows[0] ?? null;
}
