import * as service from '../services/billingCycleService.js';

export async function list(req, res, next) {
  try {
    res.json(await service.listCycles(req.query));
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const { contractId, periodStart, periodEnd } = req.body;
    res.status(201).json(await service.createCycle({ contractId, periodStart, periodEnd }, req.user.id));
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    res.json(await service.getCycleById(req.params.id));
  } catch (err) { next(err); }
}

export async function summary(req, res, next) {
  try {
    res.json(await service.getBillingCycleSummary(req.params.id));
  } catch (err) { next(err); }
}

export async function confirm(req, res, next) {
  try {
    res.json(await service.confirmCycle(req.params.id));
  } catch (err) { next(err); }
}

export async function dispute(req, res, next) {
  try {
    res.json(await service.disputeCycle(req.params.id, req.body));
  } catch (err) { next(err); }
}

export async function reopen(req, res, next) {
  try {
    res.json(await service.reopenCycle(req.params.id));
  } catch (err) { next(err); }
}

export async function groupSummary(req, res, next) {
  try {
    res.json(await service.getGroupSummary(req.params.id));
  } catch (err) { next(err); }
}

export async function cancel(req, res, next) {
  try {
    if (req.user.role?.name !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    res.json(await service.cancelCycle(req.params.id, req.user.id));
  } catch (err) { next(err); }
}

export async function lockPrinter(req, res, next) {
  try {
    const result = await service.lockPrinter(req.params.id, req.body.printerId, req.user);
    res.json(result);
  } catch (err) {
    if (err.status === 423) {
      return res.status(423).json({ error: err.message, ...err.lockInfo });
    }
    next(err);
  }
}

export async function unlockPrinter(req, res, next) {
  try {
    res.json(await service.unlockPrinter(req.params.id, req.params.printerId, req.user.id));
  } catch (err) { next(err); }
}

export async function setBaseline(req, res, next) {
  try {
    if (req.user.role?.name !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    res.json(await service.setBaseline(req.params.id, req.body, req.user.id));
  } catch (err) { next(err); }
}
