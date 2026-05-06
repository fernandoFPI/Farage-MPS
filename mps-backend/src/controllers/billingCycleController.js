import * as service from '../services/billingCycleService.js';
import * as cycleRepo from '../repositories/billingCycleRepository.js';
import * as storageService from '../services/customerStorageService.js';

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

export async function submitStorage(req, res, next) {
  try {
    const cycle = await cycleRepo.findById(req.params.id);
    if (!cycle) return res.status(404).json({ error: 'Billing cycle not found' });

    if (cycle.storageSubmitted) {
      return res.status(409).json({
        error: 'Storage already submitted for this cycle',
        submittedAt: cycle.storageSubmittedAt,
        submittedByName: cycle.storageSubmittedByName,
      });
    }

    const customerId = cycle.contract?.customer?.id;
    if (!customerId) return res.status(400).json({ error: 'Cycle has no associated customer' });

    // Process storage updates (one entry per model, non-blocking per model)
    const { storageUpdates = [] } = req.body;
    await Promise.all(
      storageUpdates.map(({ printerModel, ...quantities }) =>
        storageService.updateCustomerStorage(
          customerId,
          printerModel,
          { ...quantities, billingCycleId: cycle.id },
          req.user.id,
        ),
      ),
    );

    const updated = await cycleRepo.markStorageSubmitted(cycle.id, req.user.id);
    res.json(updated);
  } catch (err) { next(err); }
}

export async function resetStorageSubmission(req, res, next) {
  try {
    if (req.user.role?.name !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const cycle = await cycleRepo.findById(req.params.id);
    if (!cycle) return res.status(404).json({ error: 'Billing cycle not found' });
    res.json(await cycleRepo.resetStorage(cycle.id));
  } catch (err) { next(err); }
}
