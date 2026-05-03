import * as service from '../services/contractPrinterService.js';

export async function list(req, res, next) {
  try {
    res.json(await service.listAssignments(req.query));
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const { contractId, printerId, assignedFrom, assignedUntil, contractType, fixedCharge, bwPrice, colorPrice, overrideMinBwPages, overrideMinColorPages } = req.body;
    res.status(201).json(
      await service.createAssignment({ contractId, printerId, assignedFrom, assignedUntil, contractType, fixedCharge, bwPrice, colorPrice, overrideMinBwPages, overrideMinColorPages }),
    );
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const { assignedFrom, assignedUntil, contractType, fixedCharge, bwPrice, colorPrice, overrideMinBwPages, overrideMinColorPages } = req.body;
    res.json(await service.updateAssignment(req.params.id, { assignedFrom, assignedUntil, contractType, fixedCharge, bwPrice, colorPrice, overrideMinBwPages, overrideMinColorPages }));
  } catch (err) { next(err); }
}

export async function remove(req, res, next) {
  try {
    res.json(await service.removeAssignment(req.params.id));
  } catch (err) { next(err); }
}
