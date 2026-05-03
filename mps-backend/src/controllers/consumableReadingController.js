import * as service from '../services/consumableReadingService.js';

export async function create(req, res, next) {
  try {
    const reading = await service.createConsumableReading(req.body, req.user.id);
    res.status(201).json(reading);
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const { printerId, billingCycleId, customerId } = req.query;
    const readings = await service.listConsumableReadings({ printerId, billingCycleId, customerId });
    res.json(readings);
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const reading = await service.getConsumableReadingById(req.params.id);
    res.json(reading);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const reading = await service.updateConsumableReading(req.params.id, req.body);
    res.json(reading);
  } catch (err) {
    next(err);
  }
}
