import * as repo from '../repositories/customerStorageRepository.js';
import * as cycleRepo from '../repositories/billingCycleRepository.js';
import * as eventRepo from '../repositories/cycleEventRepository.js';
import { detectStockAnomaly } from '../utils/stockAnomaly.js';

function clampQty(val) {
  if (val == null || val === '') return 0;
  const n = parseInt(val, 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

export async function getCustomerStorage(customerId) {
  const existing = await repo.findByCustomerId(customerId);
  const models   = await repo.getDistinctModelsForCustomer(customerId);

  // Start with ALL existing records (bug fix: previously dropped records not in contract_printers)
  const result = [...existing];

  // Add zero-placeholder rows for models that have no storage at all yet
  const existingModels = new Set(existing.map(r => r.printerModel));
  for (const { model, isBwOnly } of models) {
    if (!existingModels.has(model)) {
      result.push({
        id: null,
        customerId,
        printerModel: model,
        location: '',
        isBwOnly,
        cQty: 0, mQty: 0, yQty: 0, kQty: 0,
        r1Qty: 0, r2Qty: 0, r3Qty: 0, r4Qty: 0,
        wasteTonQty: 0,
        updatedAt: null,
        updatedByName: null,
      });
    }
  }

  result.sort((a, b) => {
    const m = a.printerModel.localeCompare(b.printerModel);
    return m !== 0 ? m : (a.location || '').localeCompare(b.location || '');
  });
  return result;
}

// opts.reason: a reviewer adding a stock entry from the cycle. It is logged as an adjustment that
// carries the reason, instead of as an engineer's plain submission.
export async function updateCustomerStorage(customerId, printerModel, body, userId, opts = {}) {
  const location = (body.location ?? '').trim();
  const quantities = {
    cQty:       clampQty(body.cQty),
    mQty:       clampQty(body.mQty),
    yQty:       clampQty(body.yQty),
    kQty:       clampQty(body.kQty),
    r1Qty:      clampQty(body.r1Qty),
    r2Qty:      clampQty(body.r2Qty),
    r3Qty:      clampQty(body.r3Qty),
    r4Qty:      clampQty(body.r4Qty),
    wasteTonQty: clampQty(body.wasteTonQty),
  };

  // Determine isBwOnly from any existing record for this model, or from contract_printers
  let isBwOnly = false;
  const existing = await repo.findByCustomerAndModel(customerId, printerModel);
  if (existing) {
    isBwOnly = existing.isBwOnly;
  } else {
    const models = await repo.getDistinctModelsForCustomer(customerId);
    const found = models.find(m => m.model === printerModel);
    if (found) isBwOnly = found.isBwOnly;
  }

  const record = await repo.upsert(customerId, printerModel, location, isBwOnly, quantities, userId);
  const historyId = await repo.addHistory(record.id, body.billingCycleId ?? null, quantities, userId);

  // Stock recorded against a cycle: flag abnormal jumps, log who submitted, and drop any earlier
  // stock confirmation (the numbers just changed). Best-effort — the stock itself is already saved,
  // and a bookkeeping hiccup must not fail an engineer's ticket.
  if (body.billingCycleId) {
    try {
      await afterCycleStockWrite({ historyId, billingCycleId: body.billingCycleId, printerModel, location, quantities, userId, reason: opts.reason });
    } catch (err) {
      console.error('Stock review bookkeeping failed:', err.message);
    }
  }

  return record;
}

// Recomputes the anomaly flag of one snapshot against the snapshot before it. Returns the anomaly or null.
export async function refreshAnomaly(historyId) {
  const [previous, current] = await Promise.all([
    repo.findPreviousQuantities(historyId),
    repo.findHistoryQuantities(historyId),
  ]);
  const anomaly = detectStockAnomaly(previous, current);
  await repo.setAnomaly(historyId, anomaly);
  return anomaly;
}

async function afterCycleStockWrite({ historyId, billingCycleId, printerModel, location, quantities, userId, reason }) {
  const anomaly = await refreshAnomaly(historyId);
  if (reason) {
    await eventRepo.add(billingCycleId, 'stock_adjusted', userId, {
      historyId, printerModel, location, added: true, before: null, after: quantities, reason, anomaly,
    });
  } else {
    await eventRepo.add(billingCycleId, 'stock_submitted', userId, { historyId, printerModel, location, quantities, anomaly });
  }

  const cycle = await cycleRepo.findById(billingCycleId);
  // Only while the cycle is still being worked on: a confirmed cycle's stock confirmation stays as it was.
  if (cycle && ['open', 'pending_confirmation', 'disputed'].includes(cycle.status)) {
    if (await cycleRepo.clearStockConfirmed(billingCycleId)) {
      await eventRepo.add(billingCycleId, 'stock_confirmation_reset', userId, {
        reason: 'Stock was submitted again after it had been confirmed', printerModel, location,
      });
    }
  }
}

export async function getStorageHistory(customerId, printerModel) {
  return repo.findHistory(customerId, printerModel);
}
