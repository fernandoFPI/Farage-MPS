import * as repo from '../repositories/contractGroupRepository.js';
import * as billingCycleRepoRaw from '../repositories/billingCycleRepository.js';
import * as contractRepo from '../repositories/contractRepository.js';
import { getBillingCycleSummary } from './billingCycleService.js';
import { calculateGroupedMinVolumeBilling } from './netCalculationService.js';

const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;

function toBaghdadMonthKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const baghdad = new Date(date.getTime() + BAGHDAD_OFFSET_MS);
  const year = baghdad.getUTCFullYear();
  const month = String(baghdad.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export async function listGroups() {
  return repo.findAll();
}

export async function getGroupById(id) {
  const group = await repo.findById(id);
  if (!group) {
    const err = new Error('Contract group not found');
    err.status = 404;
    throw err;
  }
  return group;
}

export async function getGroupByContractId(contractId) {
  const groups = await repo.findByContractId(contractId);
  return groups;
}

export async function createGroup({ name, groupMinBw, groupMinColor }) {
  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  return repo.create({ name, groupMinBw, groupMinColor });
}

export async function updateGroup(id, { name, groupMinBw, groupMinColor }) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Contract group not found');
    err.status = 404;
    throw err;
  }
  return repo.update(id, {
    name:          name          ?? existing.name,
    groupMinBw:    groupMinBw    ?? existing.groupMinBw,
    groupMinColor: groupMinColor ?? existing.groupMinColor,
  });
}

export async function deleteGroup(id) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Contract group not found');
    err.status = 404;
    throw err;
  }
  await repo.deleteById(id);
  return { message: 'Contract group deleted' };
}

export async function addMember(groupId, contractId) {
  const group = await repo.findById(groupId);
  if (!group) {
    const err = new Error('Contract group not found');
    err.status = 404;
    throw err;
  }
  const contractOk = await repo.contractExists(contractId);
  if (!contractOk) {
    const err = new Error('Contract not found');
    err.status = 400;
    throw err;
  }
  const alreadyIn = await repo.memberAlreadyInGroup(contractId);
  if (alreadyIn) {
    const err = new Error('Contract is already a member of a group');
    err.status = 409;
    throw err;
  }
  await repo.addMember(groupId, contractId);
  return repo.findById(groupId);
}

export async function removeMember(groupId, contractId) {
  const group = await repo.findById(groupId);
  if (!group) {
    const err = new Error('Contract group not found');
    err.status = 404;
    throw err;
  }
  await repo.removeMember(groupId, contractId);
  return repo.findById(groupId);
}

// Group summary: get per-contract billable totals for a period and apply grouped billing
export async function getGroupSummary(groupId, periodStart) {
  const group = await repo.findById(groupId);
  if (!group) {
    const err = new Error('Contract group not found');
    err.status = 404;
    throw err;
  }
  if (!periodStart) {
    const err = new Error('periodStart is required');
    err.status = 400;
    throw err;
  }

  const contractSummaries = [];
  const targetMonthKey = toBaghdadMonthKey(periodStart);
  for (const member of group.members) {
    // Find the billing cycle for this contract and period
    const cycles = await billingCycleRepoRaw.findAll({
      contractId: member.contractId,
    });
    const contract = await contractRepo.findById(member.contractId);
    const cycle = cycles.find((c) => {
      return toBaghdadMonthKey(c.periodStart) === targetMonthKey;
    });
    if (!cycle) {
      contractSummaries.push({
        contractId: member.contractId,
        contractNumber: member.contractNumber,
        customerName: member.customerName,
        cycleId: null,
        cycleName: null,
        billableBw: 0,
        billableColor: 0,
        fixedCharge: Number(contract?.fixedCharge) || 0,
        bwPrice: Number(contract?.bwPrice) || 0,
        colorPrice: Number(contract?.colorPrice) || 0,
        minBwPages: Number(contract?.minBwPages) || 0,
        minColorPages: Number(contract?.minColorPages) || 0,
      });
      continue;
    }
    const summary = await getBillingCycleSummary(cycle.id);
    contractSummaries.push({
      contractId: member.contractId,
      contractNumber: member.contractNumber,
      customerName: member.customerName,
      cycleId: cycle.id,
      cycleName: summary.cycleName,
      billableBw:    summary.totals?.totalBillableBw    ?? 0,
      billableColor: summary.totals?.totalBillableColor ?? 0,
      fixedCharge:   Number(contract?.fixedCharge)   || 0,
      bwPrice:       Number(contract?.bwPrice)        || 0,
      colorPrice:    Number(contract?.colorPrice)     || 0,
      minBwPages:    Number(contract?.minBwPages)     || 0,
      minColorPages: Number(contract?.minColorPages)  || 0,
    });
  }

  const grouped = calculateGroupedMinVolumeBilling(contractSummaries, {
    groupMinBw:    group.groupMinBw,
    groupMinColor: group.groupMinColor,
  });

  return {
    groupId: group.id,
    groupName: group.name,
    groupMinBw:    group.groupMinBw,
    groupMinColor: group.groupMinColor,
    periodStart,
    ...grouped,
    contracts: grouped.contracts.map((r, i) => ({
      ...r,
      contractNumber: contractSummaries[i].contractNumber,
      customerName:   contractSummaries[i].customerName,
      cycleId:        contractSummaries[i].cycleId,
      cycleName:      contractSummaries[i].cycleName,
    })),
  };
}
