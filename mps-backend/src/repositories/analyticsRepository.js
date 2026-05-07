import pool from '../config/db.js'

export async function getAnalytics({ year, customerId } = {}) {
  const y = parseInt(year) || new Date().getFullYear()

  const [
    monthlyUsageTrend,
    billingCycleStatus,
    topCustomersByVolume,
    contractUtilization,
    revenueByCustomer,
    monthlyRevenueTrend,
    engineerPerformance,
  ] = await Promise.all([
    getMonthlyUsageTrend(y, customerId),
    getBillingCycleStatus(y),
    getTopCustomersByVolume(y),
    getContractUtilization(y, customerId),
    getRevenueByCustomer(y, customerId),
    getMonthlyRevenueTrend(y, customerId),
    getEngineerPerformance(y),
  ])

  return {
    monthlyUsageTrend,
    billingCycleStatus,
    topCustomersByVolume,
    contractUtilization,
    revenueByCustomer,
    monthlyRevenueTrend,
    engineerPerformance,
  }
}

async function getMonthlyUsageTrend(year, customerId) {
  const params = [year]
  const cFilter = customerId ? `AND c.customer_id = $2` : ''
  if (customerId) params.push(customerId)

  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(bc.period_start, 'Mon YYYY') AS month,
      EXTRACT(MONTH FROM bc.period_start)  AS month_num,
      EXTRACT(YEAR  FROM bc.period_start)  AS year,
      COALESCE(SUM(mr.excess_bw),    0) AS total_bw,
      COALESCE(SUM(mr.excess_color), 0) AS total_color
    FROM meter_readings mr
    JOIN billing_cycles bc ON mr.billing_cycle_id = bc.id
    JOIN contracts c       ON bc.contract_id      = c.id
    WHERE EXTRACT(YEAR FROM bc.period_start) = $1
    ${cFilter}
    AND bc.is_cancelled = false
    GROUP BY month, month_num, year
    ORDER BY year, month_num
  `, params)

  return rows.map(r => ({
    month:       r.month,
    total_bw:    Number(r.total_bw),
    total_color: Number(r.total_color),
  }))
}

async function getBillingCycleStatus(year) {
  const { rows } = await pool.query(`
    SELECT
      status,
      COUNT(*) AS count
    FROM billing_cycles
    WHERE EXTRACT(YEAR FROM period_start) = $1
    AND is_cancelled = false
    GROUP BY status
  `, [year])

  return rows.map(r => ({ status: r.status, count: Number(r.count) }))
}

async function getTopCustomersByVolume(year) {
  const { rows } = await pool.query(`
    SELECT
      cu.name AS customer,
      COALESCE(SUM(mr.excess_bw),                    0) AS total_bw,
      COALESCE(SUM(mr.excess_color),                 0) AS total_color,
      COALESCE(SUM(mr.excess_bw + mr.excess_color),  0) AS total_pages
    FROM meter_readings mr
    JOIN billing_cycles bc ON mr.billing_cycle_id = bc.id
    JOIN contracts c       ON bc.contract_id      = c.id
    JOIN customers cu      ON c.customer_id       = cu.id
    WHERE EXTRACT(YEAR FROM bc.period_start) = $1
    AND bc.is_cancelled = false
    GROUP BY cu.id, cu.name
    ORDER BY total_pages DESC
    LIMIT 10
  `, [year])

  return rows.map(r => ({
    customer:     r.customer,
    total_bw:     Number(r.total_bw),
    total_color:  Number(r.total_color),
    total_pages:  Number(r.total_pages),
  }))
}

async function getContractUtilization(year, customerId) {
  const params = [year]
  const cFilter = customerId ? `AND c.customer_id = $2` : ''
  if (customerId) params.push(customerId)

  const { rows } = await pool.query(`
    SELECT
      c.contract_number,
      cu.name AS customer,
      COALESCE(c.min_bw_pages,    0) AS min_bw_pages,
      COALESCE(c.min_color_pages, 0) AS min_color_pages,
      COALESCE(SUM(mr.excess_bw),    0) AS used_bw,
      COALESCE(SUM(mr.excess_color), 0) AS used_color
    FROM contracts c
    JOIN customers cu ON c.customer_id = cu.id
    LEFT JOIN billing_cycles bc ON bc.contract_id = c.id
      AND EXTRACT(YEAR FROM bc.period_start) = $1
      AND bc.is_cancelled = false
    LEFT JOIN meter_readings mr ON mr.billing_cycle_id = bc.id
    WHERE c.billing_type = 'minimum_volume'
    AND c.is_active = true
    ${cFilter}
    GROUP BY c.id, c.contract_number, cu.name, c.min_bw_pages, c.min_color_pages
    ORDER BY cu.name
  `, params)

  return rows.map(r => ({
    contract_number: r.contract_number,
    customer:        r.customer,
    min_bw_pages:    Number(r.min_bw_pages),
    min_color_pages: Number(r.min_color_pages),
    used_bw:         Number(r.used_bw),
    used_color:      Number(r.used_color),
  }))
}

async function getRevenueByCustomer(year, customerId) {
  const params = [year]
  const cFilter = customerId ? `AND c.customer_id = $2` : ''
  if (customerId) params.push(customerId)

  const { rows } = await pool.query(`
    SELECT
      cu.name AS customer,
      COUNT(DISTINCT bc.id) AS cycle_count,
      SUM(
        CASE WHEN c.billing_type = 'per_click' THEN
          (COALESCE(mr_totals.total_bw,    0) * c.bw_price::float8)    +
          (COALESCE(mr_totals.total_color, 0) * c.color_price::float8) +
          c.fixed_charge::float8
        ELSE c.fixed_charge::float8 END
      ) AS estimated_revenue
    FROM billing_cycles bc
    JOIN contracts c  ON bc.contract_id  = c.id
    JOIN customers cu ON c.customer_id   = cu.id
    LEFT JOIN (
      SELECT billing_cycle_id,
        SUM(excess_bw)    AS total_bw,
        SUM(excess_color) AS total_color
      FROM meter_readings
      GROUP BY billing_cycle_id
    ) mr_totals ON mr_totals.billing_cycle_id = bc.id
    WHERE EXTRACT(YEAR FROM bc.period_start) = $1
    AND bc.status IN ('confirmed', 'invoiced')
    AND bc.is_cancelled = false
    ${cFilter}
    GROUP BY cu.id, cu.name
    ORDER BY estimated_revenue DESC
  `, params)

  return rows.map(r => ({
    customer:           r.customer,
    cycle_count:        Number(r.cycle_count),
    estimated_revenue:  Number(r.estimated_revenue) || 0,
  }))
}

async function getMonthlyRevenueTrend(year, customerId) {
  const params = [year]
  const cFilter = customerId ? `AND c.customer_id = $2` : ''
  if (customerId) params.push(customerId)

  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(bc.period_start, 'Mon YYYY') AS month,
      EXTRACT(MONTH FROM bc.period_start)  AS month_num,
      EXTRACT(YEAR  FROM bc.period_start)  AS year,
      SUM(
        CASE WHEN c.billing_type = 'per_click' THEN
          (COALESCE(mr_totals.total_bw,    0) * c.bw_price::float8)    +
          (COALESCE(mr_totals.total_color, 0) * c.color_price::float8) +
          c.fixed_charge::float8
        ELSE c.fixed_charge::float8 END
      ) AS estimated_revenue
    FROM billing_cycles bc
    JOIN contracts c  ON bc.contract_id  = c.id
    JOIN customers cu ON c.customer_id   = cu.id
    LEFT JOIN (
      SELECT billing_cycle_id,
        SUM(excess_bw)    AS total_bw,
        SUM(excess_color) AS total_color
      FROM meter_readings
      GROUP BY billing_cycle_id
    ) mr_totals ON mr_totals.billing_cycle_id = bc.id
    WHERE EXTRACT(YEAR FROM bc.period_start) = $1
    AND bc.status IN ('confirmed', 'invoiced')
    AND bc.is_cancelled = false
    ${cFilter}
    GROUP BY month, month_num, year
    ORDER BY year, month_num
  `, params)

  return rows.map(r => ({
    month:              r.month,
    estimated_revenue:  Number(r.estimated_revenue) || 0,
  }))
}

async function getEngineerPerformance(year) {
  const { rows } = await pool.query(`
    SELECT
      u.full_name AS engineer,
      COUNT(mr.id)::int                                                      AS total_readings,
      ROUND(AVG(mr.submission_duration_seconds))::int                        AS avg_duration_seconds,
      COUNT(CASE WHEN jsonb_array_length(mr.photos) > 0 THEN 1 END)::int    AS with_photos,
      COUNT(CASE WHEN mr.flagged = true THEN 1 END)::int                    AS flagged_count
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN meter_readings mr   ON mr.submitted_by_user_id = u.id
    LEFT JOIN billing_cycles bc   ON mr.billing_cycle_id     = bc.id
    WHERE r.name = 'engineer'
    AND (bc.id IS NULL OR EXTRACT(YEAR FROM bc.period_start) = $1)
    GROUP BY u.id, u.full_name
    ORDER BY total_readings DESC
  `, [year])

  return rows.map(r => ({
    engineer:             r.engineer,
    total_readings:       Number(r.total_readings),
    avg_duration_seconds: Number(r.avg_duration_seconds) || 0,
    with_photos:          Number(r.with_photos),
    flagged_count:        Number(r.flagged_count),
  }))
}
