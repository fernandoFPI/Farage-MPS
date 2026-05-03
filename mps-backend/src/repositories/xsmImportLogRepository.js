import pool from '../config/db.js';

function mapRow(row, includeErrors = true) {
  if (!row) return null;
  const result = {
    id: row.id,
    importedByUserId: row.imported_by_user_id,
    filename: row.filename,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    totalRows: row.total_rows,
    matchedRows: row.matched_rows,
    unmatchedRows: row.unmatched_rows,
    flaggedRows: row.flagged_rows,
    skippedRows: row.skipped_rows,
    importedAt: row.imported_at,
  };
  if (includeErrors) result.errors = row.errors;
  return result;
}

export async function create({
  importedByUserId,
  filename,
  periodStart,
  periodEnd,
  totalRows,
  matchedRows,
  unmatchedRows,
  flaggedRows,
  skippedRows,
  errors,
}) {
  const { rows } = await pool.query(
    `INSERT INTO xsm_import_logs (
       imported_by_user_id, filename, period_start, period_end,
       total_rows, matched_rows, unmatched_rows, flagged_rows, skipped_rows, errors
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      importedByUserId,
      filename,
      periodStart,
      periodEnd,
      totalRows,
      matchedRows,
      unmatchedRows,
      flaggedRows,
      skippedRows,
      errors && errors.length > 0 ? JSON.stringify(errors) : null,
    ],
  );
  return mapRow(rows[0]);
}

export async function findAll({ periodStart } = {}) {
  const values = [];
  const where = periodStart ? `WHERE period_start = $1` : '';
  if (periodStart) values.push(periodStart);

  const { rows } = await pool.query(
    `SELECT * FROM xsm_import_logs ${where} ORDER BY imported_at DESC`,
    values,
  );
  return rows.map((r) => mapRow(r, false));
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT * FROM xsm_import_logs WHERE id = $1`,
    [id],
  );
  return mapRow(rows[0]);
}
