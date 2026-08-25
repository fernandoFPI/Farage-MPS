import * as service from '../services/billingCycleService.js';
import * as cycleRepo from '../repositories/billingCycleRepository.js';
import * as storageService from '../services/customerStorageService.js';

export async function list(req, res, next) {
  try {
    res.json(await service.listCycles(req.query, req.user));
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
    const result = await service.getBillingCycleSummary(req.params.id);
    const canViewBreakdown = req.user?.role?.can_view_billing_breakdown !== false;
    const canViewTotals    = req.user?.role?.can_view_billing_totals    !== false;
    if (!canViewBreakdown || !canViewTotals) {
      let safe = { ...result };
      if (!canViewBreakdown) {
        const { billing, rulesMeta, quarterlyBreakdown, quarterlyFixedCharge, quarterlyBreakdownStyle, ...rest } = safe;
        safe = rest;
      }
      if (!canViewTotals) {
        const { grandTotal, invoices, ...rest } = safe;
        safe = rest;
      }
      return res.json(safe);
    }
    res.json(result);
  } catch (err) { next(err); }
}

export async function updatePeriod(req, res, next) {
  try {
    const { periodStart, periodEnd } = req.body;
    res.json(await service.updateCyclePeriod(req.params.id, { periodStart, periodEnd }));
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

export async function unconfirm(req, res, next) {
  try {
    if (req.user?.role?.name !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    res.json(await service.unconfirmCycle(req.params.id));
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
    res.json(await service.softDeleteCycle(req.params.id, req.user.id));
  } catch (err) { next(err); }
}

export async function listDeleted(req, res, next) {
  try {
    res.json(await service.getDeletedCycles());
  } catch (err) { next(err); }
}

export async function restoreCycle(req, res, next) {
  try {
    res.json(await service.restoreCycle(req.params.id));
  } catch (err) { next(err); }
}

export async function listCancelled(req, res, next) {
  try {
    res.json(await service.getCancelledCycles());
  } catch (err) { next(err); }
}

export async function hardDelete(req, res, next) {
  try {
    res.json(await service.hardDeleteCycle(req.params.id));
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

    const customerId = cycle.contract?.customer?.id;
    if (!customerId) return res.status(400).json({ error: 'Cycle has no associated customer' });

    // Process storage updates (one entry per model, non-blocking per model)
    const { storageUpdates = [], storageUnavailableReason } = req.body;

    if (storageUnavailableReason) {
      const updated = await cycleRepo.markStorageSubmitted(cycle.id, req.user.id, storageUnavailableReason.trim());
      return res.json(updated);
    }

    await Promise.all(
      storageUpdates.map(({ printerModel, location = '', ...quantities }) =>
        storageService.updateCustomerStorage(
          customerId,
          printerModel,
          { ...quantities, location, billingCycleId: cycle.id },
          req.user.id,
        ),
      ),
    );

    const updated = await cycleRepo.markStorageSubmitted(cycle.id, req.user.id);
    res.json(updated);
  } catch (err) { next(err); }
}

export async function markInvoiced(req, res, next) {
  try {
    res.json(await service.markInvoiced(req.params.id, req.body));
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

export async function setManualBillingAmount(req, res, next) {
  try {
    const amount = req.body.amount;
    if (amount !== null && (typeof amount !== 'number' || isNaN(amount) || amount < 0)) {
      return res.status(400).json({ error: 'amount must be a non-negative number or null' });
    }
    res.json(await service.setManualBillingAmount(req.params.id, amount));
  } catch (err) { next(err); }
}

export async function getLatestCycle(req, res, next) {
  try {
    const { contractId } = req.query;
    if (!contractId) return res.status(400).json({ error: 'contractId required' });
    const row = await cycleRepo.findLatestCycle(contractId);
    res.json(row ? { periodEnd: row.period_end } : null);
  } catch (err) { next(err); }
}

export async function getOdooExport(req, res, next) {
  try {
    res.json(await service.getOdooExportData(req.params.id));
  } catch (err) { next(err); }
}

export async function getAuditExport(req, res, next) {
  try {
    res.json(await service.getAuditExportData(req.params.id));
  } catch (err) { next(err); }
}
