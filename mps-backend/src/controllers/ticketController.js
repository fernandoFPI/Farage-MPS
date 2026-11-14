import * as service from '../services/ticketService.js';

export async function context(req, res, next) {
  try {
    const { billingCycleId } = req.query;
    if (!billingCycleId) return res.status(400).json({ error: 'billingCycleId is required' });
    res.json(await service.getContext(billingCycleId));
  } catch (err) { next(err); }
}

export async function submit(req, res, next) {
  try {
    res.status(201).json(await service.submitTicket(req.body, req.user));
  } catch (err) {
    if (err.status === 423) {
      return res.status(423).json({ error: err.message, ...err.lockInfo });
    }
    next(err);
  }
}

export async function saveDraft(req, res, next) {
  try {
    res.json(await service.saveDraft(req.body, req.user));
  } catch (err) { next(err); }
}

export async function getDraft(req, res, next) {
  try {
    res.json(await service.getDraft(req.params.billingCycleId, req.params.printerId, req.user));
  } catch (err) { next(err); }
}

export async function deleteDraft(req, res, next) {
  try {
    res.json(await service.deleteDraft(req.params.billingCycleId, req.params.printerId, req.user));
  } catch (err) { next(err); }
}
