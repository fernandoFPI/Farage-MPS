import * as repo from '../repositories/customerStorageRepository.js';

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

export async function updateCustomerStorage(customerId, printerModel, body, userId) {
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
  await repo.addHistory(record.id, body.billingCycleId ?? null, quantities, userId);

  return record;
}

export async function getStorageHistory(customerId, printerModel) {
  return repo.findHistory(customerId, printerModel);
}
