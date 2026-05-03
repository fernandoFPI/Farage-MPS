import * as repo from '../repositories/customerStorageRepository.js';

function clampQty(val) {
  if (val == null || val === '') return 0;
  const n = parseInt(val, 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

export async function getCustomerStorage(customerId) {
  const existing = await repo.findByCustomerId(customerId);
  const models   = await repo.getDistinctModelsForCustomer(customerId);

  const existingMap = new Map(existing.map(r => [r.printerModel, r]));

  const result = [];
  for (const { model, isBwOnly } of models) {
    if (existingMap.has(model)) {
      result.push(existingMap.get(model));
    } else {
      result.push({
        id: null,
        customerId,
        printerModel: model,
        isBwOnly,
        cQty: 0, mQty: 0, yQty: 0, kQty: 0,
        r1Qty: 0, r2Qty: 0, r3Qty: 0, r4Qty: 0,
        wasteTonQty: 0,
        updatedAt: null,
        updatedByName: null,
      });
    }
  }
  return result;
}

export async function updateCustomerStorage(customerId, printerModel, body, userId) {
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

  // Determine isBwOnly from existing record or from models list
  let isBwOnly = false;
  const existing = await repo.findByCustomerAndModel(customerId, printerModel);
  if (existing) {
    isBwOnly = existing.isBwOnly;
  } else {
    const models = await repo.getDistinctModelsForCustomer(customerId);
    const found = models.find(m => m.model === printerModel);
    if (found) isBwOnly = found.isBwOnly;
  }

  const record = await repo.upsert(customerId, printerModel, isBwOnly, quantities, userId);
  await repo.addHistory(record.id, body.billingCycleId ?? null, quantities, userId);

  return record;
}

export async function getStorageHistory(customerId, printerModel) {
  return repo.findHistory(customerId, printerModel);
}
