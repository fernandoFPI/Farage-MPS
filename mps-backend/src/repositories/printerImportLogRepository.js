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
    importedAt: row.imported_at,
  };
  if (includeErrors) result.errors = row.errors ?? [];
  return result;
}

export async function create({
  importedByUserId,
  filename,
  totalRows,
  createdRows,
  skippedRows,
  failedRows,
  errors,
}) {
  const { rows } = await pool.query(
    `INSERT INTO printer_import_logs (
       imported_by_user_id, filename,
       total_rows, created_rows, skipped_rows, failed_rows, errors
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      importedByUserId,
      filename,
      totalRows,
      createdRows,
      skippedRows,
      failedRows,
      errors && errors.length > 0 ? JSON.stringify(errors) : '[]',
    ],
  );
  return mapRow(rows[0]);
}

export async function findAll() {
  const { rows } = await pool.query(
    `SELECT pil.*, u.full_name AS imported_by_name
     FROM printer_import_logs pil
     LEFT JOIN users u ON pil.imported_by_user_id = u.id
     ORDER BY pil.imported_at DESC`,
  );
  return rows.map(r => mapRow(r, false));
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT pil.*, u.full_name AS imported_by_name
     FROM printer_import_logs pil
     LEFT JOIN users u ON pil.imported_by_user_id = u.id
     WHERE pil.id = $1`,
    [id],
  );
  return mapRow(rows[0]);
}
