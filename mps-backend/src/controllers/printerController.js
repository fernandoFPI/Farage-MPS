import * as service from '../services/printerService.js';

export async function list(req, res, next) {
  try {
    res.json(await service.listPrinters(req.query));
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const { serialNumber, model, city, location, xsmDeviceId, xsmEnabled, isBwOnly, latitude, longitude } = req.body;
    res.status(201).json(
      await service.createPrinter({ serialNumber, model, city, location, xsmDeviceId, xsmEnabled, isBwOnly, latitude, longitude }),
    );
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    res.json(await service.getPrinterById(req.params.id));
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const { serialNumber, model, city, location, xsmDeviceId, xsmEnabled, isBwOnly, lastSeenAt, latitude, longitude } = req.body;
    res.json(
      await service.updatePrinter(req.params.id, { serialNumber, model, city, location, xsmDeviceId, xsmEnabled, isBwOnly, lastSeenAt, latitude, longitude }),
    );
  } catch (err) { next(err); }
}

export async function updateCoordinates(req, res, next) {
  try {
    const { latitude, longitude } = req.body;
    res.json(await service.updatePrinter(req.params.id, { latitude, longitude }));
  } catch (err) { next(err); }
}

export async function remove(req, res, next) {
  try {
    res.json(await service.deletePrinter(req.params.id));
  } catch (err) { next(err); }
}
