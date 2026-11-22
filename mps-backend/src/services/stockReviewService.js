import * as cycleRepo from '../repositories/billingCycleRepository.js';
import * as storageRepo from '../repositories/customerStorageRepository.js';
import * as eventRepo from '../repositories/cycleEventRepository.js';
import * as cpRepo from '../repositories/contractPrinterRepository.js';
import { refreshAnomaly, updateCustomerStorage } from './customerStorageService.js';
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

// pg returns DATE columns as local-midnight Date objects; read them with local getters.
function ymd(v) {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
}

const locationOf = (printer) => (printer?.location ?? '').trim();
// One map key per location + model (JSON keeps locations containing any character unambiguous)
const slotKey = (location, model) => JSON.stringify([(location ?? '').trim(), model]);

// Location + model combinations of the printers active on this cycle's contract (the same rule the
// Tickets page uses), i.e. the places where stock can be entered.
async function stockSlots(cycle) {
  const ref = ymd(cycle.periodStart);
  const all = await cpRepo.findAll({ contractId: cycle.contractId });
  const slots = new Map();
  for (const a of all) {
    if (a.assignedUntil && ymd(a.assignedUntil) < ref) continue;
    const printer = a.printer;
    if (!printer?.model) continue;
    const key = slotKey(locationOf(printer), printer.model);
    if (!slots.has(key)) slots.set(key, { printerModel: printer.model, location: locationOf(printer), isBwOnly: !!printer.isBwOnly, serials: [] });
    if (printer.serialNumber) slots.get(key).serials.push(printer.serialNumber);
  }
  return slots;
}

export async function getStockReview(cycleId) {
  const cycle = await loadCycle(cycleId);
  const rows = await storageRepo.findReviewRowsByCycle(cycleId);
  const unacknowledged = rows.filter(r => r.anomaly && !r.anomalyAcknowledgedAt);
  // Slots with no entry on this cycle yet: what "Add stock entry" can offer
  const have = new Set(rows.map(r => slotKey(r.location, r.printerModel)));
  const addOptions = [...(await stockSlots(cycle)).entries()]
    .filter(([key]) => !have.has(key))
    .map(([, slot]) => slot)
    .sort((a, b) => a.location.localeCompare(b.location) || a.printerModel.localeCompare(b.printerModel));
  return {
    addOptions,
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

// Reviewer adds a stock entry for a location/model where nothing was submitted for this cycle (or fixes the
// customer's current level from the cycle). Same rules as Adjust: reason required, logged, and the stock
// has to be confirmed again.
export async function addStock(cycleId, body, user) {
  const reason = String(body?.reason ?? '').trim();
  if (reason.length < 3) throw httpError(400, 'A reason is required to add a stock entry');

  const cycle = await loadWorkableCycle(cycleId);
  const model = String(body?.printerModel ?? '').trim();
  const location = String(body?.location ?? '').trim();
  const slot = (await stockSlots(cycle)).get(slotKey(location, model));
  if (!slot) throw httpError(400, "That location and model is not on this cycle's contract");

  const rows = await storageRepo.findReviewRowsByCycle(cycleId);
  if (rows.some(r => (r.location ?? '').trim() === location && r.printerModel === model)) {
    throw httpError(409, 'This cycle already has an entry for that location and model. Use Adjust to change it.');
  }

  const quantities = {};
  for (const key of STOCK_QTY_KEYS) {
    quantities[key] = (slot.isBwOnly && ['cQty', 'mQty', 'yQty'].includes(key)) ? 0 : cleanQuantity(key, body?.quantities?.[key] ?? 0);
  }
  const customerId = cycle.contract?.customer?.id;
  if (!customerId) throw httpError(400, 'Cycle has no associated customer');

  await updateCustomerStorage(customerId, model, { location, ...quantities, billingCycleId: cycleId }, user.id, { reason });
  return getStockReview(cycleId);
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
