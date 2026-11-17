import * as cycleRepo from '../repositories/billingCycleRepository.js';
import { buildCycleSnapshot } from './billingCycleService.js';

// Billing figures are recomputed from readings on every read, so a locked cycle serves a frozen
// snapshot instead (see migration 063). This service owns the lifecycle of that snapshot:
//   lock / auto-lock -> take a snapshot, flag the cycle
//   recalculate      -> the ONLY way a locked cycle's figures change: retake the snapshot
//   unlock           -> drop the snapshot, the cycle is live again

// Open cycles are still being worked on, so only closed ones can be frozen.
const LOCKABLE_STATUSES = ['confirmed', 'invoiced'];

// Chunk size for the bulk lock. Each cycle needs four heavy computations, so the UI calls the
// endpoint repeatedly rather than holding one request open for hundreds of cycles.
const BULK_MAX_CHUNK = 50;
const BULK_DEFAULT_CHUNK = 25;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function loadCycle(id) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) throw httpError(404, 'Billing cycle not found');
  return cycle;
}

// The cycle's headline figure, from whichever summary the snapshot serves.
function totalOf(snapshot) {
  const summary = snapshot?.final ?? snapshot?.raw;
  const n = Number(summary?.grandTotal ?? summary?.billing?.total ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function assertLockable(cycle) {
  if (cycle.isBaseline) throw httpError(400, 'Baseline cycles carry no charges and cannot be locked');
  if (!LOCKABLE_STATUSES.includes(cycle.status)) {
    throw httpError(400, `Only confirmed or invoiced cycles can be locked (this cycle is "${cycle.status}")`);
  }
}

export async function lockCycle(id, userId) {
  const cycle = await loadCycle(id);
  if (cycle.isLocked) throw httpError(409, 'This billing cycle is already locked');
  assertLockable(cycle);

  const snapshot = await buildCycleSnapshot(id);
  await cycleRepo.saveSnapshot(id, userId, snapshot, { action: 'lock', newTotal: totalOf(snapshot) });
  return cycleRepo.findById(id);
}

// Called when a cycle becomes invoiced: an issued invoice's figures must never move.
// Quietly does nothing when there is nothing to do (already locked, not lockable).
export async function autoLockCycle(id) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle || cycle.isLocked || cycle.isBaseline || !LOCKABLE_STATUSES.includes(cycle.status)) return null;

  const snapshot = await buildCycleSnapshot(id);
  await cycleRepo.saveSnapshot(id, null, snapshot, { action: 'auto_lock', newTotal: totalOf(snapshot) });
  return cycleRepo.findById(id);
}

export async function unlockCycle(id, userId) {
  const cycle = await loadCycle(id);
  if (!cycle.isLocked) throw httpError(409, 'This billing cycle is not locked');

  const snapshot = await cycleRepo.getLockedSnapshot(id);
  await cycleRepo.clearLock(id, userId, { oldTotal: snapshot ? totalOf(snapshot) : null });
  return cycleRepo.findById(id);
}

function printerFigures(snapshot) {
  const out = new Map();
  for (const p of snapshot?.raw?.printers ?? []) {
    out.set(p.printerId, {
      serialNumber: p.serialNumber,
      billableBw: p.billableBw ?? 0,
      billableColor: p.billableColor ?? 0,
    });
  }
  return out;
}

// Old (frozen) vs new (live) figures for a locked cycle, without changing anything.
export async function previewRecalculation(id) {
  const cycle = await loadCycle(id);
  if (!cycle.isLocked) throw httpError(409, 'Only locked cycles are recalculated — an unlocked cycle is already live');

  const [oldSnap, freshSnap] = await Promise.all([cycleRepo.getLockedSnapshot(id), buildCycleSnapshot(id)]);
  if (!oldSnap) throw httpError(409, 'This cycle is locked but has no snapshot to compare against');

  const before = printerFigures(oldSnap);
  const after = printerFigures(freshSnap);
  const changedPrinters = [];
  for (const printerId of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(printerId) ?? { serialNumber: null, billableBw: 0, billableColor: 0 };
    const a = after.get(printerId) ?? { serialNumber: null, billableBw: 0, billableColor: 0 };
    if (b.billableBw !== a.billableBw || b.billableColor !== a.billableColor) {
      changedPrinters.push({
        printerId,
        serialNumber: a.serialNumber ?? b.serialNumber,
        oldBillableBw: b.billableBw, newBillableBw: a.billableBw,
        oldBillableColor: b.billableColor, newBillableColor: a.billableColor,
      });
    }
  }

  const oldTotal = totalOf(oldSnap);
  const newTotal = totalOf(freshSnap);
  return {
    cycleId: id,
    cycleName: cycle.cycleName,
    lockedAt: cycle.lockedAt,
    oldTotal,
    newTotal,
    difference: Math.round((newTotal - oldTotal) * 100) / 100,
    changed: oldTotal !== newTotal || changedPrinters.length > 0,
    changedPrinters,
  };
}

// Retake the snapshot from live data. The cycle stays locked.
export async function recalculateCycle(id, userId) {
  const cycle = await loadCycle(id);
  if (!cycle.isLocked) throw httpError(409, 'Only locked cycles are recalculated — an unlocked cycle is already live');

  const oldSnap = await cycleRepo.getLockedSnapshot(id);
  const snapshot = await buildCycleSnapshot(id);
  const oldTotal = oldSnap ? totalOf(oldSnap) : null;
  const newTotal = totalOf(snapshot);
  await cycleRepo.saveSnapshot(id, userId, snapshot, { action: 'recalculate', oldTotal, newTotal });
  return { cycleId: id, oldTotal, newTotal };
}

export async function getLockHistory(id) {
  await loadCycle(id);
  return cycleRepo.findLockEvents(id);
}

// Locks the next chunk of confirmed/invoiced cycles. The caller repeats until `remaining` is 0
// or a chunk makes no progress (`locked` 0 — remaining cycles then keep failing and are in `failed`).
export async function lockCyclesBulk(userId, { contractId, limit } = {}) {
  const chunk = Math.min(Math.max(Number(limit) || BULK_DEFAULT_CHUNK, 1), BULK_MAX_CHUNK);
  const { total, ids } = await cycleRepo.findLockCandidates({ contractId, limit: chunk });

  let locked = 0;
  const failed = [];
  for (const id of ids) {
    try {
      await lockCycle(id, userId);
      locked += 1;
    } catch (err) {
      failed.push({ cycleId: id, error: err.message });
    }
  }
  return { locked, failed, remaining: Math.max(total - locked, 0) };
}

// How many cycles a bulk lock would still cover (for the confirmation dialog).
export async function countLockCandidates({ contractId } = {}) {
  const { total } = await cycleRepo.findLockCandidates({ contractId, limit: 1 });
  return { total };
}
