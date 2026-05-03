import XLSX from 'xlsx';
import * as printerRepo from '../repositories/printerRepository.js';
import * as cpRepo from '../repositories/contractPrinterRepository.js';
import * as cycleRepo from '../repositories/billingCycleRepository.js';
import * as readingRepo from '../repositories/meterReadingRepository.js';
import * as logRepo from '../repositories/xsmImportLogRepository.js';
import * as meterReadingService from './meterReadingService.js';

// ── Excel parsing helpers ──────────────────────────────────────────────────

function safeCell(val) {
  // Formula strings (e.g. "=(O8+P8)-(L8+M8)") are treated as null
  if (typeof val === 'string' && val.startsWith('=')) return null;
  return val ?? null;
}

function toISODate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function parseSheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets['Asset with Meters'];
  if (!sheet) {
    const err = new Error('Invalid XSM file — sheet "Asset with Meters" not found');
    err.status = 400;
    throw err;
  }

  // sheet_to_json with header:1 gives array-of-arrays; defval fills empty cells with null
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // Row 8 (index 7), col 0 must be the expected account name
  if (allRows[7]?.[0] !== 'Farage Printing Industries Iraq') {
    const err = new Error('Invalid XSM file — account name does not match');
    err.status = 400;
    throw err;
  }

  // Rows 1–7 are headers (indices 0–6). Data starts at index 7.
  const dataRows = allRows.slice(7);

  let totalRows = 0;
  const readingMap = new Map(); // serial → latest row

  for (const row of dataRows) {
    // Skip completely empty rows
    if (!row || row.every((c) => c == null)) continue;

    // Serial number comes out of Excel as a plain number — skip formula check
    if (row[4] == null) continue;
    const serialNumber = String(row[4]).trim();
    if (!serialNumber) continue;

    totalRows++;

    // End Read Date is always a JS Date object when cellDates:true is set
    const endReadDate = row[13] instanceof Date ? row[13].toISOString() : null;

    const parsed = {
      serialNumber,
      model:       safeCell(row[2]),
      branch:      safeCell(row[8]),
      location:    safeCell(row[9]),
      endReadDate,
      blackA4:     safeCell(row[14]),
      blackA3:     safeCell(row[15]),
      colorA4:     safeCell(row[21]),
      colorA3:     safeCell(row[22]),
    };

    // Keep only the row with the latest endReadDate per serial number
    const existing = readingMap.get(serialNumber);
    const parsedDate  = endReadDate ? new Date(endReadDate) : null;
    const existingDate = existing?.endReadDate ? new Date(existing.endReadDate) : null;

    if (!existing || (parsedDate && (!existingDate || parsedDate > existingDate))) {
      readingMap.set(serialNumber, parsed);
    }
  }

  return { rows: Array.from(readingMap.values()), totalRows };
}

// ── Main import orchestrator ───────────────────────────────────────────────

export async function importXSMFile({ buffer, filename, periodStart, periodEnd, userId }) {
  const { rows, totalRows } = parseSheet(buffer);

  const errors = [];
  let matchedRows   = 0;
  let unmatchedRows = 0;
  let flaggedRows   = 0;
  let skippedRows   = 0;

  for (const row of rows) {
    try {
      // Step 2a — Match printer by serial number
      const printer = await printerRepo.findBySerialNumber(row.serialNumber);
      if (!printer) {
        unmatchedRows++;
        errors.push({ serialNumber: row.serialNumber, reason: 'Printer not found in system' });
        continue;
      }

      if (!printer.xsmEnabled) {
        skippedRows++;
        errors.push({ serialNumber: row.serialNumber, reason: 'Printer is not XSM enabled' });
        continue;
      }

      // Step 2b — Find active contract assignment
      const assignment = await cpRepo.findActiveForPrinter(printer.id, periodStart);
      if (!assignment) {
        unmatchedRows++;
        errors.push({ serialNumber: row.serialNumber, reason: 'No active contract assignment' });
        continue;
      }

      const contractId = assignment.contractId;

      // Step 3 — Auto-create billing cycle if needed
      let cycle = await cycleRepo.findByContractAndPeriod(contractId, periodStart);

      if (!cycle) {
        cycle = await cycleRepo.create({ contractId, periodStart, periodEnd, specialistUserId: userId });
      } else if (['confirmed', 'disputed', 'invoiced'].includes(cycle.status)) {
        skippedRows++;
        errors.push({
          serialNumber: row.serialNumber,
          reason: `Billing cycle is ${cycle.status} — cannot import`,
        });
        continue;
      }

      // Step 4a — Duplicate XSM reading guard
      const alreadyExists = await readingRepo.existsXsmReading(printer.id, cycle.id);
      if (alreadyExists) {
        skippedRows++;
        errors.push({
          serialNumber: row.serialNumber,
          reason: 'XSM reading already imported for this cycle',
        });
        continue;
      }

      // Step 4b — Create reading via meterReadingService (reuses net calculation + validation)
      const result = await meterReadingService.createReading(
        {
          printerId:      printer.id,
          billingCycleId: cycle.id,
          source:         'xsm',
          a4Bw:           row.blackA4 ?? 0,
          a3Bw:           row.blackA3 ?? 0,
          a4Color:        row.colorA4 ?? 0,
          a3Color:        row.colorA3 ?? 0,
          xls:            0,
          readAt:         row.endReadDate,
        },
        userId,
      );

      matchedRows++;
      if (result.flagged) flaggedRows++;

    } catch (err) {
      // One printer failing does not block the rest
      unmatchedRows++;
      errors.push({ serialNumber: row.serialNumber, reason: err.message || 'Unexpected error' });
    }
  }

  // Step 5 — Log the import
  const log = await logRepo.create({
    importedByUserId: userId,
    filename,
    periodStart,
    periodEnd,
    totalRows,
    matchedRows,
    unmatchedRows,
    flaggedRows,
    skippedRows,
    errors,
  });

  return {
    message: 'XSM import complete',
    summary: { totalRows, matchedRows, unmatchedRows, flaggedRows, skippedRows },
    errors,
    importLogId: log.id,
  };
}

export async function getImportLogs(query) {
  return logRepo.findAll({ periodStart: query.periodStart });
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
