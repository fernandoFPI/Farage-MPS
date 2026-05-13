import * as service from '../services/cityCycleStatusService.js';

export async function list(req, res, next) {
  try {
    res.json(await service.getCityStatuses(req.params.id));
  } catch (err) { next(err); }
}

export async function confirm(req, res, next) {
  try {
    const result = await service.confirmCity(req.params.id, req.params.city, req.user.id);
    res.json(result);
  } catch (err) { next(err); }
}

export async function reset(req, res, next) {
  try {
    const result = await service.resetCity(req.params.id, req.params.city);
    res.json(result);
  } catch (err) { next(err); }
}
