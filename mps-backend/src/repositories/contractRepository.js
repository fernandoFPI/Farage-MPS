import pool from '../config/db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    contractNumber: row.contract_number,
    billingType: row.billing_type,
    contractType: row.contract_type,
    currency: row.currency,
    fixedCharge: row.fixed_charge != null ? Number(row.fixed_charge) : 0,
    minBwPages: row.min_bw_pages != null ? Number(row.min_bw_pages) : null,
    minColorPages: row.min_color_pages != null ? Number(row.min_color_pages) : null,
    bwPrice: row.bw_price != null ? Number(row.bw_price) : 0,
    colorPrice: row.color_price != null ? Number(row.color_price) : 0,
    excessBwPrice: row.excess_bw_price != null ? Number(row.excess_bw_price) : 0,
    excessColorPrice: row.excess_color_price != null ? Number(row.excess_color_price) : 0,
    a4Price: row.a4_price != null ? Number(row.a4_price) : 0,
    a3Price: row.a3_price != null ? Number(row.a3_price) : 0,
    startDate: row.start_date,
    endDate: row.end_date,
    confirmationSlaDays: row.confirmation_sla_days,
    isActive: row.is_active,
    createdAt: row.created_at,
    invoiceFrequency: row.invoice_frequency ?? 'monthly',
    quarterStartMonths: row.quarter_start_months ?? null,
    combinedInvoice: row.combined_invoice ?? false,
    contractMode: row.contract_mode ?? 'osg',
  };
}

export async function findAll({ customerId, isActive, contractMode } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (customerId !== undefined) {
    conditions.push(`co.customer_id = $${idx++}`);
    values.push(customerId);
  }
  if (isActive !== undefined) {
    conditions.push(`co.is_active = $${idx++}`);
    values.push(isActive);
  }
  if (contractMode !== undefined) {
    conditions.push(`co.contract_mode = $${idx++}`);
    values.push(contractMode);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT co.*, cu.name AS customer_name
     FROM contracts co
     JOIN customers cu ON co.customer_id = cu.id
     ${where}
     ORDER BY co.created_at DESC`,
    values,
  );

  return rows.map((row) => ({ ...mapRow(row), customerName: row.customer_name }));
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT co.*,
       json_build_object(
         'id',                   cu.id,
         'name',                 cu.name,
         'contactPerson',        cu.contact_person,
         'phone',                cu.phone,
         'email',                cu.email,
         'requiresConfirmation', cu.requires_confirmation,
         'createdAt',            cu.created_at
       ) AS customer,
       COALESCE(
         json_agg(
           json_build_object(
             'id',                   cp.id,
             'printerId',            cp.printer_id,
             'contractType',         cp.contract_type,
             'fixedCharge',          cp.fixed_charge,
             'bwPrice',              cp.bw_price,
             'colorPrice',           cp.color_price,
             'overrideMinBwPages',   cp.override_min_bw_pages,
             'overrideMinColorPages',cp.override_min_color_pages,
             'assignedFrom',         cp.assigned_from,
             'assignedUntil',        cp.assigned_until,
             'printer', json_build_object(
               'id',           p.id,
               'serialNumber', p.serial_number,
               'model',        p.model,
               'city',         p.city,
               'location',     p.location,
               'xsmDeviceId',  p.xsm_device_id,
               'xsmEnabled',   p.xsm_enabled
             )
           ) ORDER BY cp.assigned_from DESC
         ) FILTER (WHERE cp.id IS NOT NULL),
         '[]'
       ) AS printers
     FROM contracts co
     JOIN customers cu ON co.customer_id = cu.id
     LEFT JOIN contract_printers cp ON cp.contract_id = co.id
     LEFT JOIN printers p ON cp.printer_id = p.id
     WHERE co.id = $1
     GROUP BY co.id, cu.id`,
    [id],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return { ...mapRow(row), customer: row.customer, printers: row.printers };
}

export async function contractNumberExists(contractNumber, excludeId = null) {
  const { rows } = await pool.query(
    `SELECT id FROM contracts WHERE contract_number = $1${excludeId ? ' AND id != $2' : ''}`,
    excludeId ? [contractNumber, excludeId] : [contractNumber],
  );
  return rows.length > 0;
}

export async function customerExists(customerId) {
  const { rows } = await pool.query(`SELECT id FROM customers WHERE id = $1`, [customerId]);
  return rows.length > 0;
}

export async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO contracts (
       customer_id, contract_number, billing_type, contract_type, currency, fixed_charge,
       min_bw_pages, min_color_pages,
       bw_price, color_price,
       excess_bw_price, excess_color_price,
       a4_price, a3_price,
       start_date, end_date, confirmation_sla_days, is_active,
       invoice_frequency, quarter_start_months, combined_invoice,
       contract_mode
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     RETURNING id`,
    [
      data.customerId,
      data.contractNumber,
      data.billingType,
      data.contractType ?? 'osg',
      data.currency ?? 'IQD',
      data.fixedCharge ?? 0,
      data.minBwPages ?? 0,
      data.minColorPages ?? 0,
      data.bwPrice ?? 0,
      data.colorPrice ?? 0,
      data.excessBwPrice ?? 0,
      data.excessColorPrice ?? 0,
      data.a4Price ?? 0,
      data.a3Price ?? 0,
      data.startDate,
      data.endDate ?? null,
      data.confirmationSlaDays ?? 5,
      data.isActive ?? true,
      data.invoiceFrequency ?? 'monthly',
      data.quarterStartMonths ?? null,
      data.combinedInvoice ?? false,
      data.contractMode ?? 'osg',
    ],
  );
  return findById(rows[0].id);
}

export async function update(id, fields) {
  const columnMap = {
    billingType: 'billing_type',
    contractType: 'contract_type',
    contractMode: 'contract_mode',
    currency: 'currency',
    fixedCharge: 'fixed_charge',
    minBwPages: 'min_bw_pages',
    minColorPages: 'min_color_pages',
    bwPrice: 'bw_price',
    colorPrice: 'color_price',
    excessBwPrice: 'excess_bw_price',
    excessColorPrice: 'excess_color_price',
    a4Price: 'a4_price',
    a3Price: 'a3_price',
    startDate: 'start_date',
    endDate: 'end_date',
    confirmationSlaDays: 'confirmation_sla_days',
    isActive: 'is_active',
    invoiceFrequency: 'invoice_frequency',
    quarterStartMonths: 'quarter_start_months',
    combinedInvoice: 'combined_invoice',
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
    `UPDATE contracts SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    values,
  );
  if (rowCount === 0) return null;
  return findById(id);
}

// All contracts that are active today — used by billing cycle job
export async function findActiveContracts() {
  const { rows } = await pool.query(
    `SELECT * FROM contracts
     WHERE is_active = true
       AND start_date <= CURRENT_DATE
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)
     ORDER BY contract_number`,
  );
  return rows.map(mapRow);
}

export async function hasBillingCycles(id) {
  const { rows } = await pool.query(
    `SELECT id FROM billing_cycles WHERE contract_id = $1 LIMIT 1`,
    [id],
  );
  return rows.length > 0;
}

export async function deleteById(id) {
  const { rowCount } = await pool.query(`DELETE FROM contracts WHERE id = $1`, [id]);
  return rowCount > 0;
}
