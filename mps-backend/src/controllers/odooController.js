import * as service from '../services/odooCallbackService.js';

export async function handleCallback(req, res, next) {
  try {
    const { cycleId, orderType, status, odooRef, errorCode, errorMessage } = req.body;
    res.json(await service.handleOdooCallback({ cycleId, orderType, status, odooRef, errorCode, errorMessage }));
  } catch (err) { next(err); }
}

export async function getSyncLog(req, res, next) {
  try {
    res.json(await service.getSyncLog());
  } catch (err) { next(err); }
}

export async function handleResolutionError(req, res, next) {
  try {
    const { cycleId, errorCode, errorMessage } = req.body;
    res.json(await service.handleResolutionError({ cycleId, errorCode, errorMessage }));
  } catch (err) { next(err); }
}
