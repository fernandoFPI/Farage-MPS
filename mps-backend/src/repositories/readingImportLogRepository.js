import pool from '../config/db.js';

function mapRow(row, includeErrors = true) {
  if (!row) return null;
  const result = {
    id: row.id,
    importedByUserId: row.imported_by_user_id,
    importedByName: row.imported_by_name ?? null,
    filename: row.filename,
    totalRows: row.total_rows,
    createdRows: row.created_rows,
    skippedRows: row.skipped_rows,
    failedRows: row.failed_rows,
    cyclesCreated: row.cycles_created,
    cyclesMatched: row.cycles_matched,
    importedAt: row.imported_at,
  };
  if (includeErrors) result.errors = row.errors ?? [];
  return result;
}

export async function create({
  importedByUserId, filename,
  totalRows, createdRows, skippedRows, failedRows,
  cyclesCreated, cyclesMatched, errors,
}) {
  const { rows } = await pool.query(
    `INSERT INTO reading_import_logs (
       imported_by_user_id, filename,
       total_rows, created_rows, skipped_rows, failed_rows,
       cycles_created, cycles_matched, errors
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      importedByUserId, filename,
      totalRows, createdRows, skippedRows, failedRows,
      cyclesCreated, cyclesMatched,
      errors?.length > 0 ? JSON.stringify(errors) : '[]',
    ],
  );
  return mapRow(rows[0]);
}

export async function findAll() {
  const { rows } = await pool.query(
    `SELECT ril.*, u.full_name AS imported_by_name
     FROM reading_import_logs ril
     LEFT JOIN users u ON ril.imported_by_user_id = u.id
     ORDER BY ril.imported_at DESC`,
  );
  return rows.map(r => mapRow(r, false));
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT ril.*, u.full_name AS imported_by_name
     FROM reading_import_logs ril
     LEFT JOIN users u ON ril.imported_by_user_id = u.id
     WHERE ril.id = $1`,
    [id],
  );
  return mapRow(rows[0]);
}
