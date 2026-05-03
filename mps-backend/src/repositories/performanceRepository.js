import pool from '../config/db.js';

export async function getEngineersSummary() {
  const { rows } = await pool.query(
    `SELECT
       u.id AS user_id,
       u.full_name,
       u.email,
       COUNT(mr.id)::int AS total_readings,
       COUNT(DISTINCT mr.billing_cycle_id)::int AS total_cycles,
       ROUND(AVG(mr.submission_duration_seconds))::int AS avg_duration_seconds,
       MIN(mr.submission_duration_seconds)::int AS min_duration_seconds,
       MAX(mr.submission_duration_seconds)::int AS max_duration_seconds,
       COUNT(CASE WHEN jsonb_array_length(mr.photos) > 0 THEN 1 END)::int AS readings_with_photos,
       COUNT(CASE WHEN mr.photos = '[]'::jsonb OR mr.photos IS NULL THEN 1 END)::int AS readings_without_photos,
       COUNT(CASE WHEN mr.flagged = true THEN 1 END)::int AS flagged_readings,
       MAX(mr.submitted_at) AS last_submission_at
     FROM users u
     LEFT JOIN meter_readings mr ON mr.submitted_by_user_id = u.id
     JOIN roles r ON u.role_id = r.id
     WHERE r.name = 'engineer'
     GROUP BY u.id, u.full_name, u.email
     ORDER BY u.full_name ASC`,
  );

  return rows.map(row => ({
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    totalReadings: row.total_readings,
    totalCycles: row.total_cycles,
    avgDurationSeconds: row.avg_duration_seconds,
    minDurationSeconds: row.min_duration_seconds,
    maxDurationSeconds: row.max_duration_seconds,
    readingsWithPhotos: row.readings_with_photos,
    readingsWithoutPhotos: row.readings_without_photos,
    flaggedReadings: row.flagged_readings,
    lastSubmissionAt: row.last_submission_at ?? null,
  }));
}

export async function getEngineerDetail(userId, { cycleId, from, to } = {}) {
  // Summary
  const summaryResult = await pool.query(
    `SELECT
       u.id AS user_id,
       u.full_name,
       u.email,
       COUNT(mr.id)::int AS total_readings,
       COUNT(DISTINCT mr.billing_cycle_id)::int AS total_cycles,
       ROUND(AVG(mr.submission_duration_seconds))::int AS avg_duration_seconds,
       MIN(mr.submission_duration_seconds)::int AS min_duration_seconds,
       MAX(mr.submission_duration_seconds)::int AS max_duration_seconds,
       COUNT(CASE WHEN jsonb_array_length(mr.photos) > 0 THEN 1 END)::int AS readings_with_photos,
       COUNT(CASE WHEN mr.photos = '[]'::jsonb OR mr.photos IS NULL THEN 1 END)::int AS readings_without_photos,
       COUNT(CASE WHEN mr.flagged = true THEN 1 END)::int AS flagged_readings,
       MAX(mr.submitted_at) AS last_submission_at
     FROM users u
     LEFT JOIN meter_readings mr ON mr.submitted_by_user_id = u.id
     JOIN roles r ON u.role_id = r.id
     WHERE r.name = 'engineer' AND u.id = $1
     GROUP BY u.id, u.full_name, u.email`,
    [userId],
  );

  if (!summaryResult.rows[0]) return null;
  const s = summaryResult.rows[0];

  // Recent readings with optional filters
  const conditions = [`mr.submitted_by_user_id = $1`];
  const values = [userId];
  let idx = 2;

  if (cycleId) {
    conditions.push(`mr.billing_cycle_id = $${idx++}`);
    values.push(cycleId);
  }
  if (from) {
    conditions.push(`mr.submitted_at >= $${idx++}`);
    values.push(from);
  }
  if (to) {
    conditions.push(`mr.submitted_at <= $${idx++}`);
    values.push(to);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const readingsResult = await pool.query(
    `SELECT mr.id, mr.submitted_at, mr.submission_duration_seconds, mr.flagged,
            jsonb_array_length(mr.photos) AS photo_count,
            p.serial_number, p.model, p.id AS printer_id,
            cu.name AS customer_name,
            bc.id AS cycle_id,
            CONCAT(cu.name, ' — ', TO_CHAR(bc.period_start, 'Month YYYY')) AS cycle_name
     FROM meter_readings mr
     JOIN printers p ON mr.printer_id = p.id
     JOIN billing_cycles bc ON mr.billing_cycle_id = bc.id
     JOIN contracts c ON bc.contract_id = c.id
     JOIN customers cu ON c.customer_id = cu.id
     ${where}
     ORDER BY mr.submitted_at DESC NULLS LAST
     LIMIT 50`,
    values,
  );

  return {
    userId: s.user_id,
    fullName: s.full_name,
    email: s.email,
    totalReadings: s.total_readings,
    totalCycles: s.total_cycles,
    avgDurationSeconds: s.avg_duration_seconds,
    minDurationSeconds: s.min_duration_seconds,
    maxDurationSeconds: s.max_duration_seconds,
    readingsWithPhotos: s.readings_with_photos,
    readingsWithoutPhotos: s.readings_without_photos,
    flaggedReadings: s.flagged_readings,
    lastSubmissionAt: s.last_submission_at ?? null,
    recentReadings: readingsResult.rows.map(r => ({
      readingId: r.id,
      printerId: r.printer_id,
      serialNumber: r.serial_number,
      model: r.model,
      customerName: r.customer_name,
      cycleId: r.cycle_id,
      cycleName: r.cycle_name?.trim() ?? '—',
      submittedAt: r.submitted_at ?? null,
      durationSeconds: r.submission_duration_seconds ?? null,
      photoCount: r.photo_count ?? 0,
      flagged: r.flagged ?? false,
    })),
  };
}
