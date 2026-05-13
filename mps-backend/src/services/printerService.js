import * as repo from '../repositories/printerRepository.js';

export async function listPrinters(query) {
  const filter = {};
  if (query.city) filter.city = query.city;
  if (query.xsmEnabled !== undefined) filter.xsmEnabled = query.xsmEnabled === 'true';
  return repo.findAll(filter);
}

function validateCoordinates(latitude, longitude) {
  if (latitude == null && longitude == null) return;
  if (latitude == null || longitude == null) {
    const err = new Error('Both latitude and longitude must be provided together');
    err.status = 400;
    throw err;
  }
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  if (isNaN(lat) || lat < -90 || lat > 90) {
    const err = new Error('Latitude must be between -90 and 90');
    err.status = 400;
    throw err;
  }
  if (isNaN(lng) || lng < -180 || lng > 180) {
    const err = new Error('Longitude must be between -180 and 180');
    err.status = 400;
    throw err;
  }
}

export async function createPrinter({ serialNumber, model, city, location, xsmDeviceId, xsmEnabled, isBwOnly, latitude, longitude }) {
  if (!serialNumber || !model || !city || !location) {
    const err = new Error('serialNumber, model, city, and location are required');
    err.status = 400;
    throw err;
  }

  validateCoordinates(latitude ?? null, longitude ?? null);

  const exists = await repo.serialNumberExists(serialNumber);
  if (exists) {
    const err = new Error('Serial number already exists');
    err.status = 409;
    throw err;
  }

  return repo.create({ serialNumber, model, city, location, xsmDeviceId, xsmEnabled, isBwOnly, latitude: latitude ?? null, longitude: longitude ?? null });
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
  if (fields.serialNumber !== undefined && fields.serialNumber !== existing.serialNumber) {
    if (!fields.serialNumber.trim()) {
      const err = new Error('Serial number cannot be empty');
      err.status = 400;
      throw err;
    }
    const taken = await repo.serialNumberExists(fields.serialNumber.trim(), id);
    if (taken) {
      const err = new Error('Serial number already exists');
      err.status = 409;
      throw err;
    }
    fields = { ...fields, serialNumber: fields.serialNumber.trim() };
  }
  if (fields.latitude !== undefined || fields.longitude !== undefined) {
    validateCoordinates(
      fields.latitude !== undefined ? fields.latitude : existing.latitude,
      fields.longitude !== undefined ? fields.longitude : existing.longitude,
    );
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
