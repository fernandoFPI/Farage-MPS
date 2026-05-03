import * as repo from '../repositories/printerRepository.js';

export async function listPrinters(query) {
  const filter = {};
  if (query.city) filter.city = query.city;
  if (query.xsmEnabled !== undefined) filter.xsmEnabled = query.xsmEnabled === 'true';
  return repo.findAll(filter);
}

export async function createPrinter({ serialNumber, model, city, location, xsmDeviceId, xsmEnabled, isBwOnly }) {
  if (!serialNumber || !model || !city || !location) {
    const err = new Error('serialNumber, model, city, and location are required');
    err.status = 400;
    throw err;
  }

  const exists = await repo.serialNumberExists(serialNumber);
  if (exists) {
    const err = new Error('Serial number already exists');
    err.status = 409;
    throw err;
  }

  return repo.create({ serialNumber, model, city, location, xsmDeviceId, xsmEnabled, isBwOnly });
}

export async function getPrinterById(id) {
  const printer = await repo.findById(id);
  if (!printer) {
    const err = new Error('Printer not found');
    err.status = 404;
    throw err;
  }
  return printer;
}

export async function updatePrinter(id, fields) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Printer not found');
    err.status = 404;
    throw err;
  }
  return repo.update(id, fields);
}

export async function deletePrinter(id) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Printer not found');
    err.status = 404;
    throw err;
  }

  const assigned = await repo.hasActiveAssignment(id);
  if (assigned) {
    const err = new Error('Printer is assigned to an active contract');
    err.status = 400;
    throw err;
  }

  await repo.deleteById(id);
  return { message: 'Printer deleted' };
}
