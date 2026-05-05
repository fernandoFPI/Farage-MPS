import XLSX from 'xlsx';
import * as printerRepo from '../repositories/printerRepository.js';
import * as cpRepo from '../repositories/contractPrinterRepository.js';
import * as cycleRepo from '../repositories/billingCycleRepository.js';
import * as readingRepo from '../repositories/meterReadingRepository.js';
import * as logRepo from '../repositories/readingImportLogRepository.js';
import * as meterReadingService from './meterReadingService.js';

// ── Custom template parser ─────────────────────────────────────────────────────
// Format: header row + one data row per reading.
// Col 0: Serial Number  Col 1: Read Date  Col 2: A4 Black  Col 3: A3 Black
// Col 4: A4 Color       Col 5: A3 Color   Col 6: XLS

function parseReadingImportFile(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const readings = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    if (!row || row.every(cell => cell === null || cell === '')) continue;

    const serialNumber = row[0] !== null ? String(row[0]).trim() : null;
    const readDate     = row[1];
    const a4Bw         = row[2] !== null ? parseInt(row[2]) : null;
    const a3Bw         = row[3] !== null ? parseInt(row[3]) : null;
    const a4Color      = row[4] !== null ? parseInt(row[4]) : 0;
    const a3Color      = row[5] !== null ? parseInt(row[5]) : 0;
    const xls          = row[6] !== null ? parseInt(row[6]) : 0;

    if (!serialNumber || !readDate || a4Bw === null || a3Bw === null) {
      readings.push({ error: true, row: i + 1, serialNumber: serialNumber ?? '—', reason: 'Missing required fields' });
      continue;
    }

    let parsedDate;
    if (readDate instanceof Date) {
      parsedDate = readDate;
    } else if (typeof readDate === 'number') {
      const d = XLSX.SSF.parse_date_code(readDate);
      parsedDate = new Date(d.y, d.m - 1, d.d);
    } else {
      parsedDate = new Date(readDate);
    }

    if (isNaN(parsedDate.getTime())) {
      readings.push({ error: true, row: i + 1, serialNumber, reason: 'Invalid date format' });
      continue;
    }

    readings.push({ error: false, row: i + 1, serialNumber, readDate: parsedDate, a4Bw, a3Bw, a4Color, a3Color, xls });
  }

  return readings;
}

function getPeriod(readDate) {
  const d = readDate instanceof Date ? readDate : new Date(readDate);
  if (isNaN(d.getTime())) return null;
  const year  = d.getFullYear();
  const month = d.getMonth();
  const day   = d.getDate();
  const periodStart = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
  const periodEnd   = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  return { periodStart, periodEnd };
}

// ── Main import orchestrator ───────────────────────────────────────────────────

export async function importReadingFile({ buffer, filename, userId }) {
  const parsed = parseReadingImportFile(buffer);

  const errors    = [];
  let createdRows  = 0;
  let skippedRows  = 0;
  let failedRows   = 0;

  const cycleCache     = new Map(); // `${contractId}:${periodStart}` → cycle
  const cycleStatusMap = new Map(); // cycleId → 'created' | 'matched'

  async function findOrCreateCycle(contractId, periodStart, periodEnd) {
    const key = `${contractId}:${periodStart}`;
    if (cycleCache.has(key)) return cycleCache.get(key);

    let cycle = await cycleRepo.findByContractAndPeriod(contractId, periodStart);
    if (!cycle) {
      cycle = await cycleRepo.create({ contractId, periodStart, periodEnd, specialistUserId: userId });
      if (!cycleStatusMap.has(cycle.id)) cycleStatusMap.set(cycle.id, 'created');
    } else {
      if (!cycleStatusMap.has(cycle.id)) cycleStatusMap.set(cycle.id, 'matched');
    }
    cycleCache.set(key, cycle);
    return cycle;
  }

  // Collect parse failures first
  for (const item of parsed) {
    if (item.error) {
      failedRows++;
      errors.push({ row: item.row, serialNumber: item.serialNumber, readDate: '—', reason: item.reason });
    }
  }

  // Process valid readings
  for (const reading of parsed.filter(r => !r.error)) {
    const readDateStr = reading.readDate.toISOString().slice(0, 10);

    const period = getPeriod(reading.readDate);
    if (!period) {
      failedRows++;
      errors.push({ row: reading.row, serialNumber: reading.serialNumber, readDate: readDateStr, reason: 'Could not determine billing period from date' });
      continue;
    }

    try {
      const printer = await printerRepo.findBySerialNumber(reading.serialNumber);
      if (!printer) {
        failedRows++;
        errors.push({ row: reading.row, serialNumber: reading.serialNumber, readDate: readDateStr, reason: 'Printer not found' });
        continue;
      }

      const assignment = await cpRepo.findActiveForPrinter(printer.id, period.periodStart);
      if (!assignment) {
        failedRows++;
        errors.push({ row: reading.row, serialNumber: reading.serialNumber, readDate: readDateStr, reason: 'No active contract assignment' });
        continue;
      }

      const cycle = await findOrCreateCycle(assignment.contractId, period.periodStart, period.periodEnd);

      if (['confirmed', 'disputed', 'invoiced'].includes(cycle.status)) {
        skippedRows++;
        errors.push({ row: reading.row, serialNumber: reading.serialNumber, readDate: readDateStr, reason: `Billing cycle is ${cycle.status} — cannot import` });
        continue;
      }

      const alreadyExists = await readingRepo.existsForPrinterAndCycle(printer.id, cycle.id);
      if (alreadyExists) {
        skippedRows++;
        errors.push({ row: reading.row, serialNumber: reading.serialNumber, readDate: readDateStr, reason: 'Reading already exists for this printer in this cycle' });
        continue;
      }

      await meterReadingService.createReading({
        printerId:      printer.id,
        billingCycleId: cycle.id,
        source:         'manual',
        a4Bw:           reading.a4Bw   ?? 0,
        a3Bw:           reading.a3Bw   ?? 0,
        a4Color:        reading.a4Color ?? 0,
        a3Color:        reading.a3Color ?? 0,
        xls:            reading.xls    ?? 0,
        readAt:         reading.readDate.toISOString(),
        photos:         [],
      }, userId);

      createdRows++;
    } catch (err) {
      failedRows++;
      errors.push({ row: reading.row, serialNumber: reading.serialNumber, readDate: readDateStr, reason: err.message || 'Unexpected error' });
    }
  }

  const totalRows     = parsed.length;
  const cyclesCreated = [...cycleStatusMap.values()].filter(v => v === 'created').length;
  const cyclesMatched = [...cycleStatusMap.values()].filter(v => v === 'matched').length;

  const log = await logRepo.create({
    importedByUserId: userId,
    filename,
    totalRows,
    createdRows,
    skippedRows,
    failedRows,
    cyclesCreated,
    cyclesMatched,
    errors,
  });

  return {
    message: 'Reading import complete',
    summary: { totalRows, createdRows, skippedRows, failedRows, cyclesCreated, cyclesMatched },
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
