import pool from '../config/db.js';

/**
 * Open billing cycles where readings are still incomplete.
 * Keyed by the cycle — each row includes per-city progress.
 */
export async function getReadingGaps() {
  const { rows } = await pool.query(`
    SELECT
      bc.id                            AS cycle_id,
      bc.period_start,
      bc.period_end,
      bc.status,
      bc.created_at,
      co.id                            AS contract_id,
      co.contract_number,
      co.official_contract_number,
      co.service_type,
      cu.id                            AS customer_id,
      cu.name                          AS customer_name,
      su.full_name                     AS specialist_name,
      EXTRACT(DAY FROM NOW() - bc.created_at)::int AS days_open,
      COALESCE(
        (SELECT json_agg(
           json_build_object(
             'city',              cs.city,
             'status',            cs.status,
             'totalPrinters',     cs.total_printers,
             'submittedPrinters', cs.submitted_printers
           ) ORDER BY cs.city
         )
         FROM billing_cycle_city_status cs
         WHERE cs.billing_cycle_id = bc.id
        ),
        '[]'::json
      )                                AS city_statuses,
      (SELECT COUNT(*) FROM billing_cycle_city_status cs
       WHERE cs.billing_cycle_id = bc.id)::int AS total_cities,
      (SELECT COUNT(*) FROM billing_cycle_city_status cs
       WHERE cs.billing_cycle_id = bc.id
         AND cs.submitted_printers >= cs.total_printers
         AND cs.total_printers > 0)::int AS complete_cities
    FROM billing_cycles bc
    JOIN contracts co  ON bc.contract_id      = co.id
    JOIN customers cu  ON co.customer_id       = cu.id
    LEFT JOIN users su ON bc.specialist_user_id = su.id
    WHERE bc.status       = 'open'
      AND bc.is_cancelled = false
      AND bc.deleted_at   IS NULL
      AND bc.is_baseline  = false
      AND (
        -- cycle has cities with incomplete submissions
        EXISTS (
          SELECT 1 FROM billing_cycle_city_status cs
          WHERE cs.billing_cycle_id = bc.id
            AND cs.submitted_printers < cs.total_printers
        )
        OR
        -- cycle has no city tracking at all (no readings started)
        NOT EXISTS (
          SELECT 1 FROM billing_cycle_city_status cs
          WHERE cs.billing_cycle_id = bc.id
        )
      )
    ORDER BY bc.created_at ASC
  `);
  return rows;
}

/**
 * Active contracts where no billing cycle covers the current date.
 * A 5-day grace period applies so newly-ended cycles don't flash immediately.
 * "Covers today" means period_start <= today <= period_end regardless of status —
 * so a July cycle still being processed doesn't hide a missing August cycle.
 */
export async function getCycleGaps({ graceDays = 5 } = {}) {
  const { rows } = await pool.query(`
    SELECT
      co.id                              AS contract_id,
      co.contract_number,
      co.official_contract_number,
      co.service_type,
      co.contract_mode,
      co.start_date,
      co.end_date,
      co.invoice_frequency,
      cu.id                              AS customer_id,
      cu.name                            AS customer_name,
      lc.id                              AS last_cycle_id,
      lc.period_start                    AS last_period_start,
      lc.period_end                      AS last_period_end,
      lc.status                          AS last_cycle_status,
      lc.invoiced_at                     AS last_invoiced_at,
      su.full_name                       AS specialist_name,
      CASE
        WHEN lc.period_end IS NOT NULL
        THEN (CURRENT_DATE - lc.period_end::date)
        ELSE (CURRENT_DATE - co.start_date::date)
      END                                AS days_since_last_cycle
    FROM contracts co
    JOIN customers cu ON co.customer_id = cu.id
    -- Latest non-cancelled, non-deleted cycle
    LEFT JOIN LATERAL (
      SELECT bc.id, bc.period_start, bc.period_end, bc.status,
             bc.invoiced_at, bc.specialist_user_id
      FROM billing_cycles bc
      WHERE bc.contract_id  = co.id
        AND bc.is_cancelled = false
        AND bc.deleted_at   IS NULL
      ORDER BY bc.period_end DESC
      LIMIT 1
    ) lc ON true
    LEFT JOIN users su ON lc.specialist_user_id = su.id
    WHERE co.is_active   = true
      AND co.start_date <= CURRENT_DATE
      AND (co.end_date IS NULL OR co.end_date >= CURRENT_DATE)
      -- No cycle whose date range actually covers today
      AND NOT EXISTS (
        SELECT 1 FROM billing_cycles bc
        WHERE bc.contract_id  = co.id
          AND bc.is_cancelled = false
          AND bc.deleted_at   IS NULL
          AND bc.period_start <= CURRENT_DATE
          AND bc.period_end   >= CURRENT_DATE
      )
      -- Grace period: only alert after N days past the last cycle end (or contract start)
      AND (
        (lc.period_end IS NOT NULL AND lc.period_end  < CURRENT_DATE - ($1 || ' days')::interval)
        OR
        (lc.period_end IS NULL     AND co.start_date  < CURRENT_DATE - ($1 || ' days')::interval)
      )
    ORDER BY days_since_last_cycle DESC NULLS LAST, co.contract_number
  `, [graceDays]);
  return rows;
}

/**
 * Confirmed / invoiced cycles grouped by odoo_status, with error details.
 */
export async function getOdooStatus() {
  const { rows } = await pool.query(`
    SELECT
      bc.id                   AS cycle_id,
      bc.period_start,
      bc.period_end,
      bc.status               AS cycle_status,
      bc.odoo_status,
      bc.odoo_invoice_id,
      bc.invoiced_at,
      bc.confirmed_at,
      bc.odoo_orders,
      co.id                   AS contract_id,
      co.contract_number,
      co.official_contract_number,
      cu.id                   AS customer_id,
      cu.name                 AS customer_name,
      -- Latest error logs for this cycle
      (SELECT json_agg(
         json_build_object(
           'attempt',      il.attempt_number,
           'error',        il.error_message,
           'at',           il.created_at
         ) ORDER BY il.created_at DESC
       )
       FROM invoice_logs il
       WHERE il.billing_cycle_id = bc.id
         AND il.success = false
      )                       AS error_logs,
      -- Last successful push
      (SELECT MAX(il.created_at)
       FROM invoice_logs il
       WHERE il.billing_cycle_id = bc.id
         AND il.success = true
      )                       AS last_success_at
    FROM billing_cycles bc
    JOIN contracts co  ON bc.contract_id  = co.id
    JOIN customers cu  ON co.customer_id  = cu.id
    WHERE bc.is_cancelled = false
      AND bc.deleted_at   IS NULL
      AND bc.status IN ('confirmed', 'invoiced')
    ORDER BY
      CASE bc.odoo_status
        WHEN 'error'   THEN 0
        WHEN 'pending' THEN 1
        WHEN 'partial' THEN 2
        WHEN 'synced'  THEN 3
        ELSE                4
      END,
      bc.confirmed_at DESC NULLS LAST
    LIMIT 300
  `);
  return rows;
}

/**
 * All data needed by the TV dashboard in one round-trip.
 */
export async function getTvData() {
  const [summary, readingGaps, cycleGaps, odooIssues, readingsToday, recentActivity] = await Promise.all([
    getSummary(),

    // Incomplete cycles for the current month only
    pool.query(`
      SELECT cu.name AS customer_name,
             bc.id   AS cycle_id,
             COALESCE(SUM(cs.submitted_printers), 0)::int AS submitted,
             COALESCE(SUM(cs.total_printers), 0)::int     AS total,
             EXTRACT(DAY FROM NOW() - bc.created_at)::int AS days_open
      FROM billing_cycles bc
      JOIN contracts co ON bc.contract_id = co.id
      JOIN customers cu ON co.customer_id = cu.id
      LEFT JOIN billing_cycle_city_status cs ON cs.billing_cycle_id = bc.id
      WHERE bc.status = 'open'
        AND bc.is_cancelled = false
        AND bc.deleted_at   IS NULL
        AND bc.is_baseline  = false
        AND bc.period_start >= date_trunc('month', CURRENT_DATE)
        AND (
          EXISTS (SELECT 1 FROM billing_cycle_city_status x WHERE x.billing_cycle_id = bc.id AND x.submitted_printers < x.total_printers)
          OR NOT EXISTS (SELECT 1 FROM billing_cycle_city_status x WHERE x.billing_cycle_id = bc.id)
        )
      GROUP BY cu.name, bc.id
      ORDER BY days_open DESC
      LIMIT 15
    `),

    // Contracts missing a cycle for the current month (last cycle ended ≤ 60 days ago)
    pool.query(`
      SELECT cu.name AS customer_name,
             co.contract_number,
             CASE
               WHEN lc.period_end IS NOT NULL THEN (CURRENT_DATE - lc.period_end::date)
               ELSE (CURRENT_DATE - co.start_date::date)
             END AS days_since
      FROM contracts co
      JOIN customers cu ON co.customer_id = cu.id
      LEFT JOIN LATERAL (
        SELECT bc.period_end FROM billing_cycles bc
        WHERE bc.contract_id = co.id AND bc.is_cancelled = false AND bc.deleted_at IS NULL
        ORDER BY bc.period_end DESC LIMIT 1
      ) lc ON true
      WHERE co.is_active = true
        AND co.start_date <= CURRENT_DATE
        AND (co.end_date IS NULL OR co.end_date >= CURRENT_DATE)
        AND NOT EXISTS (
          SELECT 1 FROM billing_cycles bc
          WHERE bc.contract_id = co.id AND bc.is_cancelled = false AND bc.deleted_at IS NULL
            AND bc.period_start <= CURRENT_DATE AND bc.period_end >= CURRENT_DATE
        )
        AND (
          (lc.period_end IS NOT NULL AND lc.period_end >= CURRENT_DATE - INTERVAL '60 days'
                                    AND lc.period_end  <  CURRENT_DATE - INTERVAL '5 days')
          OR (lc.period_end IS NULL  AND co.start_date >= CURRENT_DATE - INTERVAL '60 days'
                                    AND co.start_date  <  CURRENT_DATE - INTERVAL '5 days')
        )
      ORDER BY days_since ASC
      LIMIT 15
    `),

    // Odoo errors/pending for cycles from the current and previous month
    pool.query(`
      SELECT cu.name AS customer_name, bc.odoo_status, bc.period_start, bc.period_end
      FROM billing_cycles bc
      JOIN contracts co ON bc.contract_id = co.id
      JOIN customers cu ON co.customer_id = cu.id
      WHERE bc.is_cancelled = false
        AND bc.deleted_at   IS NULL
        AND bc.status IN ('confirmed', 'invoiced')
        AND bc.odoo_status IN ('error', 'pending', 'partial')
        AND bc.period_start >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
      ORDER BY CASE bc.odoo_status WHEN 'error' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END, bc.confirmed_at DESC
      LIMIT 10
    `),

    // Readings submitted today
    pool.query(`
      SELECT COUNT(*)::int AS count FROM meter_readings
      WHERE created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day'
    `),

    // Last 12 readings
    pool.query(`
      SELECT mr.created_at, p.serial_number, p.model, cu.name AS customer_name,
             u.full_name AS submitted_by
      FROM meter_readings mr
      JOIN printers p ON mr.printer_id = p.id
      JOIN billing_cycles bc ON mr.billing_cycle_id = bc.id
      JOIN contracts co ON bc.contract_id = co.id
      JOIN customers cu ON co.customer_id = cu.id
      LEFT JOIN users u ON mr.submitted_by_user_id = u.id
      ORDER BY mr.created_at DESC
      LIMIT 12
    `),
  ]);

  return {
    summary,
    readingGaps:    readingGaps.rows,
    cycleGaps:      cycleGaps.rows,
    odooIssues:     odooIssues.rows,
    readingsToday:  readingsToday.rows[0].count,
    recentActivity: recentActivity.rows,
  };
}

/**
 * Single-query summary counts for the nav badge / KPI bar.
 */
export async function getSummary() {
  const [readingGaps, cycleGaps, odooErrors] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM billing_cycles bc
      WHERE bc.status = 'open'
        AND bc.is_cancelled = false
        AND bc.deleted_at   IS NULL
        AND bc.is_baseline  = false
        AND (
          EXISTS (SELECT 1 FROM billing_cycle_city_status cs WHERE cs.billing_cycle_id = bc.id AND cs.submitted_printers < cs.total_printers)
          OR NOT EXISTS (SELECT 1 FROM billing_cycle_city_status cs WHERE cs.billing_cycle_id = bc.id)
        )
    `),
    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM contracts co
      LEFT JOIN LATERAL (
        SELECT bc.period_end FROM billing_cycles bc
        WHERE bc.contract_id = co.id AND bc.is_cancelled = false AND bc.deleted_at IS NULL
        ORDER BY bc.period_end DESC LIMIT 1
      ) lc ON true
      WHERE co.is_active = true
        AND co.start_date <= CURRENT_DATE
        AND (co.end_date IS NULL OR co.end_date >= CURRENT_DATE)
        AND NOT EXISTS (
          SELECT 1 FROM billing_cycles bc
          WHERE bc.contract_id = co.id AND bc.is_cancelled = false AND bc.deleted_at IS NULL
            AND bc.period_start <= CURRENT_DATE AND bc.period_end >= CURRENT_DATE
        )
        AND (
          (lc.period_end IS NOT NULL AND lc.period_end  < CURRENT_DATE - INTERVAL '5 days')
          OR
          (lc.period_end IS NULL     AND co.start_date  < CURRENT_DATE - INTERVAL '5 days')
        )
    `),
    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM billing_cycles bc
      WHERE bc.is_cancelled = false
        AND bc.deleted_at   IS NULL
        AND bc.status IN ('confirmed', 'invoiced')
        AND bc.odoo_status = 'error'
    `),
  ]);

  return {
    readingGaps:  readingGaps.rows[0].count,
    cycleGaps:    cycleGaps.rows[0].count,
    odooErrors:   odooErrors.rows[0].count,
    total: readingGaps.rows[0].count + cycleGaps.rows[0].count + odooErrors.rows[0].count,
  };
}
