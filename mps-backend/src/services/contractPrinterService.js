import * as repo from '../repositories/contractPrinterRepository.js';

export async function listAssignments(query) {
  return repo.findAll({
    contractId: query.contractId,
    printerId: query.printerId,
  });
}

export async function createAssignment({ contractId, printerId, assignedFrom, assignedUntil, fixedCharge, bwPrice, colorPrice, overrideMinBwPages, overrideMinColorPages }) {
  if (!contractId || !printerId || !assignedFrom) {
    const err = new Error('contractId, printerId, and assignedFrom are required');
    err.status = 400;
    throw err;
  }

  const contractOk = await repo.contractExists(contractId);
  if (!contractOk) {
    const err = new Error('Contract not found');
    err.status = 400;
    throw err;
  }

  const printerOk = await repo.printerExists(printerId);
  if (!printerOk) {
    const err = new Error('Printer not found');
    err.status = 400;
    throw err;
  }

  const overlap = await repo.hasOverlap(printerId, assignedFrom);
  if (overlap) {
    const err = new Error('Printer already assigned to a contract in this period');
    err.status = 400;
    throw err;
  }

  return repo.create({ contractId, printerId, assignedFrom, assignedUntil, contractType: 'osg', fixedCharge: fixedCharge ?? null, bwPrice: bwPrice ?? null, colorPrice: colorPrice ?? null, overrideMinBwPages: overrideMinBwPages ?? null, overrideMinColorPages: overrideMinColorPages ?? null });
}

export async function updateAssignment(id, { contractId, assignedFrom, assignedUntil, fixedCharge, bwPrice, colorPrice, overrideMinBwPages, overrideMinColorPages }) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Assignment not found');
    err.status = 404;
    throw err;
  }

  if (contractId && contractId !== existing.contractId) {
    const contractOk = await repo.contractExists(contractId);
    if (!contractOk) {
      const err = new Error('Contract not found');
      err.status = 400;
      throw err;
    }
  }

  const newFrom = assignedFrom ?? existing.assignedFrom;

  const overlap = await repo.hasOverlap(existing.printerId, newFrom, id);
  if (overlap) {
    const err = new Error('Printer already assigned to a contract in this period');
    err.status = 400;
    throw err;
  }

  return repo.update(id, { contractId, assignedFrom, assignedUntil, fixedCharge, bwPrice, colorPrice, overrideMinBwPages, overrideMinColorPages });
}

export async function transferPrinters({ toContractId, assignmentIds, transferDate }) {
  if (!toContractId || !Array.isArray(assignmentIds) || assignmentIds.length === 0 || !transferDate) {
    const err = new Error('toContractId, assignmentIds, and transferDate are required');
    err.status = 400;
    throw err;
  }

  const targetOk = await repo.contractExists(toContractId);
  if (!targetOk) {
    const err = new Error('Target contract not found');
    err.status = 404;
    throw err;
  }

  // Resolve existing assignments
  const existing = await Promise.all(assignmentIds.map(id => repo.findById(id)));
  const missing = existing.filter(a => !a);
  if (missing.length > 0) {
    const err = new Error('One or more assignments not found');
    err.status = 404;
    throw err;
  }

  // assignedUntil on old = transferDate - 1 day
  const d = new Date(transferDate);
  d.setDate(d.getDate() - 1);
  const closingDate = d.toISOString().slice(0, 10);

  return repo.transferInTransaction({ existing, toContractId, transferDate, closingDate });
}

export async function removeAssignment(id) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Assignment not found');
    err.status = 404;
    throw err;
  }

  await repo.deleteById(id);
  return { message: 'Assignment removed' };
}
