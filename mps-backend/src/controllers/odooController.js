import * as service from '../services/odooCallbackService.js';

export async function handleCallback(req, res, next) {
  try {
    const { cycleId, orderType, status, odooRef, errorCode, errorMessage } = req.body;
    res.json(await service.handleOdooCallback({ cycleId, orderType, status, odooRef, errorCode, errorMessage }));
  } catch (err) { next(err); }
}
