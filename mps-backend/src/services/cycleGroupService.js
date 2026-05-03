import * as groupRepo from '../repositories/cycleGroupRepository.js';
import * as cycleRepo from '../repositories/billingCycleRepository.js';
import * as contractRepo from '../repositories/contractRepository.js';

export async function createGroup({ contractId, cycleIds }, userId) {
  if (!contractId || !Array.isArray(cycleIds) || cycleIds.length !== 3) {
    const err = new Error('contractId and exactly 3 cycleIds are required');
    err.status = 400;
    throw err;
  }

  const contract = await contractRepo.findById(contractId);
  if (!contract) {
    const err = new Error('Contract not found');
    err.status = 404;
    throw err;
  }

  // Fetch all 3 cycles and validate
  const cycles = await Promise.all(cycleIds.map(id => cycleRepo.findById(id)));

  for (let i = 0; i < cycles.length; i++) {
    const c = cycles[i];
    if (!c) {
      const err = new Error(`Cycle ${cycleIds[i]} not found`);
      err.status = 404;
      throw err;
    }
    if (c.contractId !== contractId) {
      const err = new Error(`Cycle ${cycleIds[i]} does not belong to contract ${contractId}`);
      err.status = 400;
      throw err;
    }
    if (c.status !== 'confirmed') {
      const err = new Error(`Cycle ${cycleIds[i]} must be in confirmed status`);
      err.status = 400;
      throw err;
    }
    if (c.cycleGroupId) {
      const err = new Error(`Cycle ${cycleIds[i]} is already part of a group`);
      err.status = 400;
      throw err;
    }
  }

  // Verify chronological order
  for (let i = 0; i < cycles.length - 1; i++) {
    if (new Date(cycles[i].periodStart) >= new Date(cycles[i + 1].periodStart)) {
      const err = new Error('Cycles must be in chronological order by period_start');
      err.status = 400;
      throw err;
    }
  }

  // Create group
  const group = await groupRepo.create({ contractId, createdByUserId: userId });

  // Link cycles: positions 1 and 2 → pending_quarterly, position 3 → stays confirmed
  for (let i = 0; i < 3; i++) {
    const position = i + 1;
    const newStatus = position < 3 ? 'pending_quarterly' : 'confirmed';
    await cycleRepo.update(cycles[i].id, {
      cycleGroupId: group.id,
      groupPosition: position,
      status: newStatus,
    });
  }

  return groupRepo.findById(group.id);
}

export async function getGroup(id) {
  const group = await groupRepo.findById(id);
  if (!group) {
    const err = new Error('Cycle group not found');
    err.status = 404;
    throw err;
  }
  return group;
}

export async function listGroups(query) {
  return groupRepo.findAll({ contractId: query.contractId });
}

export async function deleteGroup(id) {
  const group = await groupRepo.findById(id);
  if (!group) {
    const err = new Error('Cycle group not found');
    err.status = 404;
    throw err;
  }

  // Restore all 3 cycles to confirmed, clear group link
  for (const c of group.cycles) {
    await cycleRepo.update(c.id, {
      cycleGroupId: null,
      groupPosition: null,
      status: 'confirmed',
    });
  }

  await groupRepo.deleteById(id);
  return { message: 'Cycle group deleted' };
}
