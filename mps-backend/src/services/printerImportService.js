import XLSX from 'xlsx';
import pool from '../config/db.js';
import * as printerRepo from '../repositories/printerRepository.js';
import * as logRepo from '../repositories/printerImportLogRepository.js';

// ── Excel helpers ─────────────────────────────────────────────────────────────

function safeNum(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'string' && val.startsWith('=')) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function safeStr(val) {
  if (val == null) return null;
  return String(val).trim() || null;
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  // Excel serial number
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
  }
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function parseSheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    const err = new Error('Excel file has no sheets');
    err.status = 400;
    throw err;
  }

  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  // Row 0 is header — skip it; data starts at index 1
  const dataRows = allRows.slice(1);

  const rows = [];
  for (const row of dataRows) {
    if (!row || row.every(c => c == null)) continue;

    rows.push({
      model:                safeStr(row[0]),
      type:                 safeStr(row[1]),
      serialNumber:         safeStr(String(row[2] ?? '').trim()),
      city:                 safeStr(row[3]),
      location:             safeStr(row[4]),
      contractNumber:       safeStr(String(row[5] ?? '').trim()),
      assignedFrom:         toDateStr(row[6]),
      fixedChargeOverride:  safeNum(row[7]),
      bwPriceOverride:      safeNum(row[8]),
      colorPriceOverride:   safeNum(row[9]),
      minBwOverride:        safeNum(row[10]) != null ? Math.round(safeNum(row[10])) : null,
      minColorOverride:     safeNum(row[11]) != null ? Math.round(safeNum(row[11])) : null,
      latitude:             safeNum(row[13]),
      longitude:            safeNum(row[14]),
    });
  }
  return rows;
}

// ── Contract lookup ───────────────────────────────────────────────────────────

async function findContractByNumber(contractNumber) {
  const { rows } = await pool.query(
    `SELECT id, is_active, contract_mode FROM contracts WHERE contract_number = $1 LIMIT 1`,
    [contractNumber],
  );
  return rows[0] ?? null;
}

async function createContractPrinter({
  contractId, printerId,
  assignedFrom,
  fixedChargeOverride, bwPriceOverride, colorPriceOverride,
  minBwOverride, minColorOverride,
}) {
  await pool.query(
    `INSERT INTO contract_printers (
       contract_id, printer_id, contract_type, assigned_from,
       fixed_charge, bw_price, color_price,
       override_min_bw_pages, override_min_color_pages
     ) VALUES ($1,$2,'osg',$3,$4,$5,$6,$7,$8)`,
    [
      contractId,
      printerId,
      assignedFrom,
      fixedChargeOverride ?? null,
      bwPriceOverride ?? null,
      colorPriceOverride ?? null,
      minBwOverride ?? null,
      minColorOverride ?? null,
    ],
  );
}

// ── Main import orchestrator ──────────────────────────────────────────────────

export async function importPrinterFile({ buffer, filename, userId }) {
  const rows = parseSheet(buffer);

  const errors = [];
  let createdRows = 0;
  let skippedRows = 0;
  let failedRows  = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // 1-indexed, skipping header
    const row = rows[i];

    // ── Validation ────────────────────────────────────────────────────────
    const missing = ['model','type','serialNumber','city','location','contractNumber','assignedFrom']
      .filter(f => !row[f]);
    if (missing.length > 0) {
      failedRows++;
      errors.push({ row: rowNum, serialNumber: row.serialNumber ?? '—', contractNumber: row.contractNumber ?? '—', reason: `Missing required fields: ${missing.join(', ')}` });
      continue;
    }

    const typeNorm = row.type.toLowerCase();
    if (!['color', 'b&w'].includes(typeNorm)) {
      failedRows++;
      errors.push({ row: rowNum, serialNumber: row.serialNumber, contractNumber: row.contractNumber, reason: `Invalid type "${row.type}" — must be Color or B&W` });
      continue;
    }

    if (!row.assignedFrom || isNaN(new Date(row.assignedFrom))) {
      failedRows++;
      errors.push({ row: rowNum, serialNumber: row.serialNumber, contractNumber: row.contractNumber, reason: 'Invalid or missing Assigned From date' });
      continue;
    }

    for (const [field, val] of [
      ['Fixed Charge Override', row.fixedChargeOverride],
      ['BW Price Override', row.bwPriceOverride],
      ['Color Price Override', row.colorPriceOverride],
    ]) {
      if (val != null && val < 0) {
        failedRows++;
        errors.push({ row: rowNum, serialNumber: row.serialNumber, contractNumber: row.contractNumber, reason: `${field} must be non-negative` });
        continue;
      }
    }

    // ── Serial number check ───────────────────────────────────────────────
    const existing = await printerRepo.findBySerialNumber(row.serialNumber);
    if (existing) {
      skippedRows++;
      errors.push({ row: rowNum, serialNumber: row.serialNumber, contractNumber: row.contractNumber, reason: 'Printer already exists' });
      continue;
    }

    // ── Contract check ────────────────────────────────────────────────────
    const contract = await findContractByNumber(row.contractNumber);
    if (!contract) {
      failedRows++;
      errors.push({ row: rowNum, serialNumber: row.serialNumber, contractNumber: row.contractNumber, reason: `Contract not found: ${row.contractNumber}` });
      continue;
    }
    if (!contract.is_active) {
      failedRows++;
      errors.push({ row: rowNum, serialNumber: row.serialNumber, contractNumber: row.contractNumber, reason: `Contract is inactive: ${row.contractNumber}` });
      continue;
    }

    // ── Create printer ────────────────────────────────────────────────────
    try {
      const printer = await printerRepo.create({
        serialNumber: row.serialNumber,
        model:        row.model,
        city:         row.city,
        location:     row.location,
        xsmDeviceId:  null,
        xsmEnabled:   true,
        isBwOnly:     typeNorm === 'b&w',
        latitude:     row.latitude,
        longitude:    row.longitude,
      });

      // ── Create assignment (PSG contracts ignore price overrides) ──────
      const isPsg = contract.contract_mode === 'psg';
      await createContractPrinter({
        contractId:          contract.id,
        printerId:           printer.id,
        assignedFrom:        row.assignedFrom,
        fixedChargeOverride: isPsg ? null : row.fixedChargeOverride,
        bwPriceOverride:     isPsg ? null : row.bwPriceOverride,
        colorPriceOverride:  isPsg ? null : row.colorPriceOverride,
        minBwOverride:       isPsg ? null : row.minBwOverride,
        minColorOverride:    isPsg ? null : row.minColorOverride,
      });

      createdRows++;
    } catch (err) {
      failedRows++;
      errors.push({ row: rowNum, serialNumber: row.serialNumber, contractNumber: row.contractNumber, reason: err.message || 'Unexpected error' });
    }
  }

  const totalRows = rows.length;

  const log = await logRepo.create({
    importedByUserId: userId,
    filename,
    totalRows,
    createdRows,
    skippedRows,
    failedRows,
    errors,
  });

  return {
    message: 'Printer import complete',
    summary: { totalRows, createdRows, skippedRows, failedRows },
    errors,
    importLogId: log.id,
  };
}

export async function getImportLogs() {
  return logRepo.findAll();
}

export async function getImportLogById(id) {
  const log = await logRepo.findById(id);
  if (!log) {
    const err = new Error('Import log not found');
    err.status = 404;
    throw err;
  }
  return log;
}
