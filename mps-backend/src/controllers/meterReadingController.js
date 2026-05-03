import * as service from '../services/meterReadingService.js';

export async function list(req, res, next) {
  try {
    res.json(await service.listReadings(req.query));
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    res.status(201).json(await service.createReading(req.body, req.user.id));
  } catch (err) {
    if (err.status === 423) return res.status(423).json({ error: err.message, ...err.lockInfo });
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    res.json(await service.getReadingById(req.params.id));
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    res.json(await service.updateReading(req.params.id, req.body));
  } catch (err) { next(err); }
}

export async function remove(req, res, next) {
  try {
    res.json(await service.deleteReading(req.params.id));
  } catch (err) { next(err); }
}

export async function getPhotos(req, res, next) {
  try {
    if (req.user?.role === 'engineer') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const photos = await service.getReadingPhotos(req.params.id);
    res.json(photos);
  } catch (err) { next(err); }
}

export async function getPrevious(req, res, next) {
  try {
    const { printerId, beforeDate } = req.query;
    if (!printerId || !beforeDate) {
      return res.status(400).json({ error: 'printerId and beforeDate are required' });
    }
    const reading = await service.getPreviousReading(printerId, beforeDate);
    res.json(reading ?? null);
  } catch (err) { next(err); }
}
