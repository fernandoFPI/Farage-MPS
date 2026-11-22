import * as cycleRepo from '../repositories/billingCycleRepository.js';
import * as storageRepo from '../repositories/customerStorageRepository.js';
import * as eventRepo from '../repositories/cycleEventRepository.js';
import { refreshAnomaly } from './customerStorageService.js';
import { STOCK_QTY_KEYS } from '../utils/stockAnomaly.js';
import { cycleLockedError } from '../utils/cycleLockGuard.js';

// A cycle's customer stock must be reviewed (confirmed) by an admin / MPS specialist before the cycle
// itself can be confirmed. Reviewing, adjusting and acknowledging only happen while the cycle is still
// being worked on; after that an admin has to unconfirm (or unlock) it first.
const WORKABLE_STATUSES = ['open', 'pending_confirmation', 'disputed'];
const MAX_QTY = 100000;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Baseline cycles carry no charges and LS/LO contracts have no printers, so neither has stock to review.
export function stockRequiredFor(cycle) {
  return !cycle.isBaseline && !['LS', 'LO'].includes(cycle.contract?.serviceType);
}

async function loadCycle(id) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) throw httpError(404, 'Billing cycle not found');
  return cycle;
}

async function loadWorkableCycle(id) {
  const cycle = await loadCycle(id);
  if (cycle.isLocked) throw cycleLockedError();
  if (!WORKABLE_STATUSES.includes(cycle.status)) {
    throw httpError(409, 'This cycle is already confirmed. Unconfirm it first to review or change its stock.');
  }
  return cycle;
}

export async function getStockReview(cycleId) {
  const cycle = await loadCycle(cycleId);
  const rows = await storageRepo.findReviewRowsByCycle(cycleId);
  const unacknowledged = rows.filter(r => r.anomaly && !r.anomalyAcknowledgedAt);
  return {
    cycleId,
    stockRequired: stockRequiredFor(cycle),
    editable: !cycle.isLocked && WORKABLE_STATUSES.includes(cycle.status),
    stockConfirmedAt: cycle.stockConfirmedAt,
    stockConfirmedByName: cycle.stockConfirmedByName,
    rows,
    unacknowledgedCount: unacknowledged.length,
    canConfirmStock: unacknowledged.length === 0,
  };
}

function cleanQuantity(key, value) {
  const n = Number(value);
  if (value === '' || value == null || !Number.isInteger(n) || n < 0 || n > MAX_QTY) {
    throw httpError(400, `${key} must be a whole number from 0 to ${MAX_QTY}`);
  }
  return n;
}

// Reviewer correction of one stock snapshot. The engineer's submission is overwritten in the history
// row, so the before/after and the reason live in the cycle's activity log.
export async function adjustStock(cycleId, historyId, body, user) {
  const reason = String(body?.reason ?? '').trim();
  if (reason.length < 3) throw httpError(400, 'A reason is required to adjust stock');

  const cycle = await loadWorkableCycle(cycleId);
  const row = await storageRepo.findReviewRow(cycleId, historyId);
  if (!row) throw httpError(404, 'Stock entry not found for this cycle');

  const after = { ...row.quantities };
  for (const key of STOCK_QTY_KEYS) {
    if (body?.quantities && body.quantities[key] !== undefined) after[key] = cleanQuantity(key, body.quantities[key]);
  }
  const changes = {};
  for (const key of STOCK_QTY_KEYS) {
    if (after[key] !== row.quantities[key]) changes[key] = { from: row.quantities[key], to: after[key] };
  }
  if (Object.keys(changes).length === 0) throw httpError(400, 'No quantity was changed');

  await storageRepo.updateHistoryQuantities(historyId, after);
  // The customer's current stock level mirrors the newest snapshot only
  if (await storageRepo.isLatestSnapshot(historyId)) {
    await storageRepo.updateCurrentQuantities(row.customerStorageId, after, user.id);
  }
  const anomaly = await refreshAnomaly(historyId);

  await eventRepo.add(cycleId, 'stock_adjusted', user.id, {
    historyId, printerModel: row.printerModel, location: row.location,
    before: row.quantities, after, changes, reason, anomaly,
  });
  // Adjusting changes what was reviewed, so the stock has to be confirmed again
  if (await cycleRepo.clearStockConfirmed(cycleId)) {
    await eventRepo.add(cycleId, 'stock_confirmation_reset', user.id, {
      reason: 'Stock was adjusted after it had been confirmed', printerModel: row.printerModel, location: row.location,
    });
  }
  return getStockReview(cycle.id);
}

export async function acknowledgeAnomaly(cycleId, historyId, user) {
  await loadWorkableCycle(cycleId);
  const row = await storageRepo.findReviewRow(cycleId, historyId);
  if (!row) throw httpError(404, 'Stock entry not found for this cycle');
  if (!row.anomaly) throw httpError(409, 'This stock entry has no anomaly to acknowledge');
  if (row.anomalyAcknowledgedAt) throw httpError(409, 'This anomaly was already acknowledged');

  await storageRepo.acknowledgeAnomaly(historyId, user.id);
  await eventRepo.add(cycleId, 'stock_anomaly_acknowledged', user.id, {
    historyId, printerModel: row.printerModel, location: row.location, anomaly: row.anomaly,
  });
  return getStockReview(cycleId);
}

export async function confirmStock(cycleId, user) {
  const cycle = await loadWorkableCycle(cycleId);
  if (cycle.stockConfirmedAt) throw httpError(409, 'Stock is already confirmed for this cycle');

  const rows = await storageRepo.findReviewRowsByCycle(cycleId);
  const open = rows.filter(r => r.anomaly && !r.anomalyAcknowledgedAt);
  if (open.length > 0) {
    throw httpError(422, `${open.length} stock entr${open.length === 1 ? 'y has' : 'ies have'} an unacknowledged anomaly. Acknowledge or adjust ${open.length === 1 ? 'it' : 'them'} before confirming stock.`);
  }

  await cycleRepo.setStockConfirmed(cycleId, user.id);
  await eventRepo.add(cycleId, 'stock_confirmed', user.id, {
    entries: rows.length,
    noStockSubmitted: rows.length === 0,
    acknowledgedAnomalies: rows.filter(r => r.anomaly).length,
  });
  return getStockReview(cycleId);
}

// Events plus what happened before the log existed: stock submissions are reconstructed from the
// stock history, and a cycle confirmed earlier shows as confirmed with the user not recorded.
export async function getActivity(cycleId) {
  const cycle = await loadCycle(cycleId);
  const [events, legacy] = await Promise.all([
    eventRepo.findByCycle(cycleId),
    eventRepo.findLegacyStockSubmissions(cycleId),
  ]);
  const out = [...events];
  for (const l of legacy) out.push(l);
  if (cycle.confirmedAt && !events.some(e => e.type === 'cycle_confirmed')) {
    out.push({
      id: `legacy-confirmed-${cycle.id}`, type: 'cycle_confirmed', userId: null, userName: null, roleName: null,
      detail: { userNotRecorded: true }, at: cycle.confirmedAt,
    });
  }
  out.sort((a, b) => new Date(a.at) - new Date(b.at));
  return out;
}
