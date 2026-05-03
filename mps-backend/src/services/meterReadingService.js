import * as readingRepo from '../repositories/meterReadingRepository.js';
import * as cycleRepo from '../repositories/billingCycleRepository.js';
import * as cpRepo from '../repositories/contractPrinterRepository.js';
import * as printerRepo from '../repositories/printerRepository.js';
import * as contractRepo from '../repositories/contractRepository.js';
import {
  calculateOSGNet,
  calculatePSGNet,
  calculatePSGSimpleNet,
  calculateBillableUsage,
  validateUsage,
} from './netCalculationService.js';

const VALID_SOURCES = ['odoo', 'xsm', 'manual'];

// Attach excess + billable to a single reading object (for GET endpoints)
async function attachUsage(reading) {
  const cycle = await cycleRepo.findById(reading.billingCycleId);
  const contract = await contractRepo.findById(cycle.contractId);
  const contractType = contract?.contractMode ?? 'osg';

  const prevReading = await readingRepo.getPreviousCycleReading(
    reading.printerId,
    cycle.id,
    cycle.periodStart,
  );
  const previousExcess = prevReading
    ? {
        excessBw: prevReading.cycleIsBaseline ? 0 : prevReading.excessBw,
        excessColor: prevReading.cycleIsBaseline ? 0 : prevReading.excessColor,
      }
    : null;

  const currentExcess = { excessBw: reading.excessBw, excessColor: reading.excessColor };
  // PSG Simple / PSG: stored excess is already the billable delta — use directly
  const billable = (contractType === 'psg_simple' || contractType === 'psg')
    ? { billableBw: reading.excessBw, billableColor: reading.excessColor, isBaseline: reading.excessBw === 0 && reading.excessColor === 0 }
    : calculateBillableUsage(currentExcess, previousExcess);

  // For PSG: also expose derived net values
  let psgNet = {};
  if (contractType === 'psg') {
    const previousRaw = prevReading
      ? { a4Bw: prevReading.a4Bw, a3Bw: prevReading.a3Bw, a4Color: prevReading.a4Color, a3Color: prevReading.a3Color, xls: prevReading.xls }
      : { a4Bw: 0, a3Bw: 0, a4Color: 0, a3Color: 0, xls: 0 };
    const net = calculatePSGNet(
      { a4Bw: reading.a4Bw, a3Bw: reading.a3Bw, a4Color: reading.a4Color, a3Color: reading.a3Color, xls: reading.xls },
      previousRaw,
    );
    psgNet = { a4BwNet: net.a4BwNet, a3BwNet: net.a3BwNet, a4ColorNet: net.a4ColorNet, a3ColorNet: net.a3ColorNet };
  }
  // PSG Simple exposes direct A4 counter values
  if (contractType === 'psg_simple') {
    psgNet = { a4BwNet: reading.a4Bw, a4ColorNet: reading.a4Color };
  }

  return { ...reading, contractType, ...psgNet, ...billable };
}

export async function listReadings(query) {
  const readings = await readingRepo.findAll({
    printerId: query.printerId,
    billingCycleId: query.billingCycleId,
    source: query.source,
  });
  return Promise.all(readings.map(attachUsage));
}

export async function getReadingById(id) {
  const reading = await readingRepo.findById(id);
  if (!reading) {
    const err = new Error('Reading not found');
    err.status = 404;
    throw err;
  }
  return attachUsage(reading);
}

export async function getReadingPhotos(id) {
  const photos = await readingRepo.getPhotosByReadingId(id);
  if (photos === null) {
    const err = new Error('Reading not found');
    err.status = 404;
    throw err;
  }
  return photos;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB base64-decoded
const MAX_PHOTOS = 5;

export async function createReading(body, userId) {
  const { printerId, billingCycleId, source, a4Bw, a3Bw, a4Color, a3Color } = body;
  const readAt = body.readAt ?? new Date().toISOString();

  // 1. Required fields
  if (!printerId || !billingCycleId || !source ||
      a4Bw == null || a3Bw == null || a4Color == null || a3Color == null) {
    const err = new Error('printerId, billingCycleId, source, a4Bw, a3Bw, a4Color, and a3Color are required');
    err.status = 400;
    throw err;
  }

  // 1a. Validate photos
  const rawPhotos = Array.isArray(body.photos) ? body.photos : [];
  if (rawPhotos.length > MAX_PHOTOS) {
    const err = new Error(`Maximum ${MAX_PHOTOS} photos allowed`);
    err.status = 400;
    throw err;
  }
  const photos = rawPhotos.map((p, i) => {
    if (!p.mimeType || !p.data) {
      const err = new Error(`Photo ${i + 1}: mimeType and data are required`);
      err.status = 400;
      throw err;
    }
    if (!ALLOWED_MIME_TYPES.includes(p.mimeType)) {
      const err = new Error(`Photo ${i + 1}: unsupported mime type ${p.mimeType}`);
      err.status = 400;
      throw err;
    }
    const cleanData = p.data.replace(/^data:[^;]+;base64,/, '');
    const sizeBytes = Math.ceil((cleanData.length * 3) / 4);
    if (sizeBytes > MAX_PHOTO_SIZE_BYTES) {
      const err = new Error(`Photo ${i + 1}: exceeds 5 MB limit`);
      err.status = 400;
      throw err;
    }
    return { id: crypto.randomUUID(), mimeType: p.mimeType, data: cleanData };
  });

  // 2. Validate source
  if (!VALID_SOURCES.includes(source)) {
    const err = new Error('source must be odoo, xsm, or manual');
    err.status = 400;
    throw err;
  }

  // 3. Get billing cycle
  const cycle = await cycleRepo.findById(billingCycleId);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 400;
    throw err;
  }

  // 4. Validate cycle is writable
  if (!['open', 'pending_confirmation'].includes(cycle.status)) {
    const err = new Error('Billing cycle is closed');
    err.status = 400;
    throw err;
  }

  // 4a. Check submission lock — block if another user has an active lock on this printer
  const now = new Date();
  const activeLock = (cycle.lockedPrinters ?? []).find(
    l => l.printerId === printerId && new Date(l.expiresAt) > now && l.lockedBy !== userId,
  );
  if (activeLock) {
    const err = new Error('Printer is being submitted by another engineer');
    err.status = 423;
    err.lockInfo = { lockedBy: activeLock.lockedByName, expiresAt: activeLock.expiresAt };
    throw err;
  }

  // 5. Verify printer is assigned to this contract; get contract mode
  const assignment = await cpRepo.findByPrinterAndContract(printerId, cycle.contractId);
  if (!assignment) {
    const err = new Error('Printer is not assigned to this contract');
    err.status = 400;
    throw err;
  }
  const contract = await contractRepo.findById(cycle.contractId);
  const contractType = contract?.contractMode ?? 'osg';

  // 6. xls defaults to 0; force color=0 for BW-only printers
  const printer = await printerRepo.findById(printerId);
  const isBwOnly = printer?.isBwOnly ?? false;
  const a4ColorFinal = isBwOnly ? 0 : (a4Color ?? 0);
  const a3ColorFinal = isBwOnly ? 0 : (a3Color ?? 0);
  const xls = isBwOnly ? 0 : (body.xls ?? 0);

  // 7. Previous reading (before period_start) — provides raw baseline and stored excess; skip baseline cycles
  const prevReading = await readingRepo.getPreviousCycleReading(
    printerId,
    cycle.id,
    cycle.periodStart,
  );
  const previousRaw = prevReading
    ? { a4Bw: prevReading.a4Bw, a3Bw: prevReading.a3Bw, a4Color: prevReading.a4Color, a3Color: prevReading.a3Color, xls: prevReading.xls }
    : { a4Bw: 0, a3Bw: 0, a4Color: 0, a3Color: 0, xls: 0 };

  // 8. Calculate this period's excess from raw counter difference
  let net;
  if (contractType === 'osg') {
    net = calculateOSGNet({ a4Bw, a3Bw, a4Color: a4ColorFinal, a3Color: a3ColorFinal }, previousRaw);
  } else if (contractType === 'psg_simple') {
    // PSG Simple: direct A4 counter subtraction; A3 and XLS are forced to 0
    net = calculatePSGSimpleNet({ a4Bw, a4Color: a4ColorFinal }, previousRaw);
  } else {
    net = calculatePSGNet({ a4Bw, a3Bw, a4Color: a4ColorFinal, a3Color: a3ColorFinal, xls }, previousRaw);
  }

  const currentExcess  = { excessBw: net.excessBw, excessColor: net.excessColor };
  const previousExcess = prevReading
    ? {
        excessBw: prevReading.cycleIsBaseline ? 0 : prevReading.excessBw,
        excessColor: prevReading.cycleIsBaseline ? 0 : prevReading.excessColor,
      }
    : null;

  // 9. Billable = growth in excess since last reading (0 if this is the baseline).
  // PSG and PSG Simple both store a delta — net.excessBw is already the period delta (non-baseline)
  // or would be the cumulative counter (baseline, no prevReading) which must be zeroed.
  const billable = (contractType === 'psg' || contractType === 'psg_simple')
    ? { billableBw: prevReading ? net.excessBw : 0, billableColor: prevReading ? net.excessColor : 0, isBaseline: !prevReading }
    : calculateBillableUsage(currentExcess, previousExcess);

  // 10. Validate against last 3 stored excesses
  const recentReadings     = await readingRepo.getRecentReadings(printerId, cycle.periodStart, 3);
  const historicalExcesses = recentReadings.map(r => ({ excessBw: r.excessBw, excessColor: r.excessColor }));
  const validation         = validateUsage(currentExcess, historicalExcesses);

  // 11. Insert with stored excess
  const lockAcquiredAt = body.lockAcquiredAt ?? null;
  const submittedAt = new Date();
  const submissionDurationSeconds = lockAcquiredAt
    ? Math.round((submittedAt - new Date(lockAcquiredAt)) / 1000)
    : null;

  const reading = await readingRepo.create({
    printerId,
    billingCycleId,
    submittedByUserId: userId,
    source,
    a4Bw,
    a3Bw,
    a4Color: a4ColorFinal,
    a3Color: a3ColorFinal,
    xls,
    // PSG/PSG Simple: store the period delta so billing can use it directly.
    // For a baseline PSG reading calculatePSGNet returns the full cumulative counter
    // (previousRaw = 0), so override to 0.
    // OSG keeps net.excessBw unchanged — its billing uses the cumulative-minus-previous pattern.
    excessBw:    (contractType === 'psg' || contractType === 'psg_simple') ? billable.billableBw : net.excessBw,
    excessColor: (contractType === 'psg' || contractType === 'psg_simple') ? billable.billableColor : net.excessColor,
    readAt,
    photos,
    lockAcquiredAt,
    submissionDurationSeconds,
    flagged:    !validation.valid,
    flagReason: validation.valid ? null : validation.reason,
  });

  // 12. Auto-release the lock for this printer after successful submission
  const updatedLocks = (cycle.lockedPrinters ?? []).filter(l => l.printerId !== printerId);
  await cycleRepo.updateLockedPrinters(billingCycleId, updatedLocks);

  return {
    ...reading,
    ...billable,
    flagged:    !validation.valid,
    flagReason: validation.valid ? null : validation.reason,
  };
}

export async function deleteReading(id) {
  const reading = await readingRepo.findById(id);
  if (!reading) {
    const err = new Error('Reading not found');
    err.status = 404;
    throw err;
  }

  const cycle = await cycleRepo.findById(reading.billingCycleId);
  if (!cycle || cycle.status !== 'open') {
    const err = new Error('Cannot delete reading from a closed billing cycle');
    err.status = 400;
    throw err;
  }

  await readingRepo.deleteById(id);
  return { message: 'Reading deleted' };
}

export async function updateReading(id, body) {
  const { a4Bw, a3Bw, a4Color, a3Color, readAt } = body;

  const reading = await readingRepo.findById(id);
  if (!reading) {
    const err = new Error('Reading not found');
    err.status = 404;
    throw err;
  }

  const cycle = await cycleRepo.findById(reading.billingCycleId);
  if (!cycle || !['open', 'pending_confirmation'].includes(cycle.status)) {
    const err = new Error('Billing cycle is not editable');
    err.status = 400;
    throw err;
  }

  const contract = await contractRepo.findById(cycle.contractId);
  const contractType = contract?.contractMode ?? 'osg';

  const printer = await printerRepo.findById(reading.printerId);
  const isBwOnly = printer?.isBwOnly ?? false;
  const a4ColorFinal = isBwOnly ? 0 : (a4Color ?? 0);
  const a3ColorFinal = isBwOnly ? 0 : (a3Color ?? 0);
  const xls = isBwOnly ? 0 : (body.xls ?? 0);

  const prevReading = await readingRepo.getPreviousCycleReading(
    reading.printerId,
    cycle.id,
    cycle.periodStart,
  );
  const previousRaw = prevReading
    ? { a4Bw: prevReading.a4Bw, a3Bw: prevReading.a3Bw, a4Color: prevReading.a4Color, a3Color: prevReading.a3Color, xls: prevReading.xls }
    : { a4Bw: 0, a3Bw: 0, a4Color: 0, a3Color: 0, xls: 0 };

  let net;
  if (contractType === 'osg') {
    net = calculateOSGNet({ a4Bw, a3Bw, a4Color: a4ColorFinal, a3Color: a3ColorFinal }, previousRaw);
  } else if (contractType === 'psg_simple') {
    net = calculatePSGSimpleNet({ a4Bw, a4Color: a4ColorFinal }, previousRaw);
  } else {
    net = calculatePSGNet({ a4Bw, a3Bw, a4Color: a4ColorFinal, a3Color: a3ColorFinal, xls }, previousRaw);
  }

  const storedExcessBw    = (contractType === 'psg' || contractType === 'psg_simple') ? (prevReading ? net.excessBw    : 0) : net.excessBw;
  const storedExcessColor = (contractType === 'psg' || contractType === 'psg_simple') ? (prevReading ? net.excessColor : 0) : net.excessColor;

  const updated = await readingRepo.updateById(id, {
    a4Bw, a3Bw, a4Color: a4ColorFinal, a3Color: a3ColorFinal, xls,
    excessBw:    storedExcessBw,
    excessColor: storedExcessColor,
    readAt:      readAt ?? reading.readAt,
  });

  const laterCycles = await cycleRepo.findLaterConfirmedCycles(cycle.contractId, cycle.periodStart);
  const result = await attachUsage(updated);

  if (laterCycles.length > 0) {
    return {
      warning: true,
      warningMessage: 'A later billing cycle for this printer is already confirmed or invoiced. Editing this reading will not automatically update that cycle. You may need to reopen and recalculate it manually.',
      data: result,
    };
  }

  return result;
}

export async function getPreviousReading(printerId, beforeDate) {
  return readingRepo.getPreviousReading(printerId, beforeDate);
}
