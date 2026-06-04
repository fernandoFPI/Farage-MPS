import * as repo from '../repositories/consumableReadingRepository.js';
import * as printerRepo from '../repositories/printerRepository.js';
import * as cycleRepo from '../repositories/billingCycleRepository.js';

function clampPct(val) {
  if (val == null || val === '') return null;
  const n = parseInt(val, 10);
  if (isNaN(n)) return null;
  if (n < 0 || n > 100) {
    const err = new Error('Percentage values must be between 0 and 100');
    err.status = 422;
    throw err;
  }
  return n;
}

export async function createConsumableReading({ meterReadingId, printerId, billingCycleId,
  cPct, mPct, yPct, kPct, r1Pct, r2Pct, r3Pct, r4Pct, wasteTonePct }, userId) {
  if (!meterReadingId || !printerId || !billingCycleId) {
    const err = new Error('meterReadingId, printerId, and billingCycleId are required');
    err.status = 422;
    throw err;
  }

  const printer = await printerRepo.findById(printerId);
  if (!printer) {
    const err = new Error('Printer not found');
    err.status = 404;
    throw err;
  }

  const isBwOnly = printer.isBwOnly ?? false;

  const pctData = {
    kPct:         clampPct(kPct),
    r1Pct:        clampPct(r1Pct),
    wasteTonePct: clampPct(wasteTonePct),
    // color fields — null for BW-only printers
    cPct:  isBwOnly ? null : clampPct(cPct),
    mPct:  isBwOnly ? null : clampPct(mPct),
    yPct:  isBwOnly ? null : clampPct(yPct),
    r2Pct: isBwOnly ? null : clampPct(r2Pct),
    r3Pct: isBwOnly ? null : clampPct(r3Pct),
    r4Pct: isBwOnly ? null : clampPct(r4Pct),
  };

  // Upsert: update the existing record if one already exists for this printer+cycle
  const existing = await repo.findByPrinterAndCycle(printerId, billingCycleId);
  if (existing) {
    return repo.updateById(existing.id, pctData);
  }

  return repo.create({ meterReadingId, printerId, billingCycleId, submittedByUserId: userId, ...pctData });
}

export async function listConsumableReadings(params = {}) {
  return repo.findAll(params);
}

export async function getConsumableReadingById(id) {
  const reading = await repo.findById(id);
  if (!reading) {
    const err = new Error('Consumable reading not found');
    err.status = 404;
    throw err;
  }
  return reading;
}

export async function updateConsumableReading(id, { cPct, mPct, yPct, kPct, r1Pct, r2Pct, r3Pct, r4Pct, wasteTonePct }) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Consumable reading not found');
    err.status = 404;
    throw err;
  }

  const printer = await printerRepo.findById(existing.printerId);
  const isBwOnly = printer?.isBwOnly ?? false;

  const data = {
    kPct:         clampPct(kPct),
    r1Pct:        clampPct(r1Pct),
    wasteTonePct: clampPct(wasteTonePct),
    cPct:  isBwOnly ? null : clampPct(cPct),
    mPct:  isBwOnly ? null : clampPct(mPct),
    yPct:  isBwOnly ? null : clampPct(yPct),
    r2Pct: isBwOnly ? null : clampPct(r2Pct),
    r3Pct: isBwOnly ? null : clampPct(r3Pct),
    r4Pct: isBwOnly ? null : clampPct(r4Pct),
  };

  return repo.updateById(id, data);
}
