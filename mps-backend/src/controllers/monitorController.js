import * as repo from '../repositories/monitorRepository.js';

export async function getReadingGaps(req, res, next) {
  try {
    res.json(await repo.getReadingGaps());
  } catch (err) { next(err); }
}

export async function getCycleGaps(req, res, next) {
  try {
    const graceDays = Math.max(0, Math.min(30, parseInt(req.query.graceDays ?? '5', 10) || 5));
    res.json(await repo.getCycleGaps({ graceDays }));
  } catch (err) { next(err); }
}

export async function getOdooStatus(req, res, next) {
  try {
    res.json(await repo.getOdooStatus());
  } catch (err) { next(err); }
}

export async function getSummary(req, res, next) {
  try {
    res.json(await repo.getSummary());
  } catch (err) { next(err); }
}

export async function getTvData(req, res, next) {
  try {
    res.json(await repo.getTvData());
  } catch (err) { next(err); }
}
