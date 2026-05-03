import * as service from '../services/customerStorageService.js';

export async function getByCustomer(req, res, next) {
  try {
    const records = await service.getCustomerStorage(req.params.customerId);
    res.json(records);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const record = await service.updateCustomerStorage(
      req.params.customerId,
      decodeURIComponent(req.params.printerModel),
      req.body,
      req.user.id,
    );
    res.json(record);
  } catch (err) {
    next(err);
  }
}

export async function getHistory(req, res, next) {
  try {
    const history = await service.getStorageHistory(
      req.params.customerId,
      decodeURIComponent(req.params.printerModel),
    );
    res.json(history);
  } catch (err) {
    next(err);
  }
}
