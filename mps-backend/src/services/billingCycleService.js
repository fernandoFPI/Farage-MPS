import * as cycleRepo from '../repositories/billingCycleRepository.js';
import * as readingRepo from '../repositories/meterReadingRepository.js';
import * as contractGroupRepo from '../repositories/contractGroupRepository.js';
import {
  calculateBillableUsage,
  validateUsage,
  calculateOSGBilling,
  calculatePSGBilling,
  calculatePSGNet,
  calculatePSGSimpleBilling,
  calculateGroupedMinVolumeBilling,
} from './netCalculationService.js';
import { canConfirmCycle } from './cityCycleStatusService.js';

const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;

function toBaghdadMonthKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const baghdad = new Date(date.getTime() + BAGHDAD_OFFSET_MS);
  const year = baghdad.getUTCFullYear();
  const month = String(baghdad.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export async function listCycles(query) {
  return cycleRepo.findAll({
    contractId: query.contractId,
    status:     query.status,
  });
}

export async function createCycle({ contractId, periodStart, periodEnd }, userId) {
  if (!contractId || !periodStart || !periodEnd) {
    const err = new Error('contractId, periodStart, and periodEnd are required');
    err.status = 400;
    throw err;
  }

  if (new Date(periodEnd) <= new Date(periodStart)) {
    const err = new Error('periodEnd must be after periodStart');
    err.status = 400;
    throw err;
  }

  const contractOk = await cycleRepo.contractActiveExists(contractId);
  if (!contractOk) {
    const err = new Error('Contract not found or not active');
    err.status = 400;
    throw err;
  }

  const duplicate = await cycleRepo.cycleExists(contractId, periodStart);
  if (duplicate) {
    const err = new Error('Billing cycle already exists for this period');
    err.status = 409;
    throw err;
  }

  return cycleRepo.create({ contractId, periodStart, periodEnd, specialistUserId: userId });
}

export async function getCycleById(id) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }
  const now = new Date();
  return {
    ...cycle,
    lockedPrinters: (cycle.lockedPrinters ?? []).filter(l => new Date(l.expiresAt) > now),
  };
}

export async function lockPrinter(id, printerId, user) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }

  const now = new Date();
  const existingLock = (cycle.lockedPrinters ?? []).find(l => l.printerId === printerId);

  if (existingLock && new Date(existingLock.expiresAt) > now && existingLock.lockedBy !== user.id) {
    const err = new Error('Printer is being submitted by another engineer');
    err.status = 423;
    err.lockInfo = { lockedBy: existingLock.lockedByName, expiresAt: existingLock.expiresAt };
    throw err;
  }

  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  const newLock = {
    printerId,
    lockedBy: user.id,
    lockedByName: user.fullName,
    lockedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const updatedLocks = [
    ...(cycle.lockedPrinters ?? []).filter(l => l.printerId !== printerId),
    newLock,
  ];
  await cycleRepo.updateLockedPrinters(id, updatedLocks);
  return { message: 'Printer locked', expiresAt: expiresAt.toISOString(), lockedAt: now.toISOString() };
}

export async function unlockPrinter(id, printerId, userId) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }
  const updatedLocks = (cycle.lockedPrinters ?? []).filter(
    l => !(l.printerId === printerId && l.lockedBy === userId),
  );
  await cycleRepo.updateLockedPrinters(id, updatedLocks);
  return { message: 'Lock released' };
}

async function buildBillingCycleSummary(id, { applyGroupAdjustment = true } = {}) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }

  // One row per printer — most recent reading — with printer details
  const printers = await readingRepo.findAllWithPrinterInfo(id, cycle.contractId);

  // Baseline cycles carry no charges — return immediately with zeroed values
  if (cycle.isBaseline) {
    return {
      cycleId:                cycle.id,
      cycleName:              cycle.cycleName,
      contractNumber:         cycle.contract.contractNumber,
      officialContractNumber: cycle.contract.officialContractNumber ?? null,
      customerName:           cycle.contract.customer.name,
      periodStart:            cycle.periodStart,
      periodEnd:              cycle.periodEnd,
      status:                 cycle.status,
      isBaseline:             true,
      printers: printers.map(p => ({
        ...p,
        excessBw:      0,
        excessColor:   0,
        billableBw:    0,
        billableColor: 0,
        isBaseline:    true,
        flagged:       false,
      })),
      billing: { total: 0, isBaseline: true },
      grandTotal: 0,
    };
  }

  // Contract mode is the single source of truth for OSG vs PSG
  const contractMode = cycle.contract?.contractMode ?? 'osg';
  const isPsgContract     = contractMode === 'psg';
  const isPsgSimpleContract = contractMode === 'psg_simple';
  const isPsgAny          = isPsgContract || isPsgSimpleContract;

  const printerResults = [];
  // Default OSG group — printers with no price override
  const osgDefaultBillable = { billableBw: 0, billableColor: 0 };
  const osgDefaultSerialNumbers = [];
  let osgDefaultAllBwOnly = true;
  // One entry per OSG printer that has any price override
  const osgOverrides = [];
  const psgBillable  = { billableBw: 0, billableColor: 0 };
  const psgBreakdown = { a4BwUsage: 0, a3BwUsage: 0, a4ColorUsage: 0, a3ColorUsage: 0 };

  for (const reading of printers) {

    // Previous cycle supplies the raw starting counters.
    // If that previous cycle was baseline, its stored excess counts as zero for billing growth.
    const prevReading = await readingRepo.getPreviousCycleReading(
      reading.printerId,
      cycle.id,
      cycle.periodStart,
    );
    const currentExcess  = { excessBw: reading.excessBw, excessColor: reading.excessColor };
    const previousExcess = prevReading
      ? {
          excessBw: prevReading.cycleIsBaseline ? 0 : prevReading.excessBw,
          excessColor: prevReading.cycleIsBaseline ? 0 : prevReading.excessColor,
        }
      : null;

    // PSG / PSG Simple: excess_bw/excess_color store the period delta — use directly.
    // calculateBillableUsage assumes cumulative values and would double-subtract — skip it.
    const billable = isPsgAny
      ? { billableBw: reading.excessBw, billableColor: reading.excessColor, isBaseline: reading.excessBw === 0 && reading.excessColor === 0 }
      : calculateBillableUsage(currentExcess, previousExcess);

    // Validate against last 3 stored excesses for this printer
    const recentReadings     = await readingRepo.getRecentReadings(reading.printerId, cycle.periodStart, 3);
    const historicalExcesses = recentReadings.map(r => ({ excessBw: r.excessBw, excessColor: r.excessColor }));
    const validation         = validateUsage(currentExcess, historicalExcesses);

    if (!isPsgAny) {
      const hasOverride = reading.printerFixedCharge != null || reading.printerBwPrice != null || reading.printerColorPrice != null
        || reading.printerOverrideMinBwPages != null || reading.printerOverrideMinColorPages != null;
      if (hasOverride) {
        osgOverrides.push({
          printerId:             reading.printerId,
          serialNumber:          reading.serialNumber,
          model:                 reading.model,
          isBwOnly:              reading.isBwOnly,
          billable,
          fixedCharge:           reading.printerFixedCharge,
          bwPrice:               reading.printerBwPrice,
          colorPrice:            reading.printerColorPrice,
          overrideMinBwPages:    reading.printerOverrideMinBwPages,
          overrideMinColorPages: reading.printerOverrideMinColorPages,
        });
      } else {
        osgDefaultBillable.billableBw    += billable.billableBw;
        osgDefaultBillable.billableColor += billable.billableColor;
        osgDefaultSerialNumbers.push(reading.serialNumber);
        if (!reading.isBwOnly) osgDefaultAllBwOnly = false;
      }
    } else if (isPsgSimpleContract) {
      psgBillable.billableBw    += billable.billableBw;
      psgBillable.billableColor += billable.billableColor;
    } else {
      // PSG: re-derive per-category breakdown to split A4 vs A3 correctly
      psgBillable.billableBw    += billable.billableBw;
      psgBillable.billableColor += billable.billableColor;
      if (prevReading) {
        const previousRaw = { a4Bw: prevReading.a4Bw, a3Bw: prevReading.a3Bw, a4Color: prevReading.a4Color, a3Color: prevReading.a3Color, xls: prevReading.xls };
        const net = calculatePSGNet(
          { a4Bw: reading.a4Bw, a3Bw: reading.a3Bw, a4Color: reading.a4Color, a3Color: reading.a3Color, xls: reading.xls },
          previousRaw,
        );
        psgBreakdown.a4BwUsage    += Math.max(0, net.excessA4Bw);
        psgBreakdown.a3BwUsage    += Math.max(0, net.excessA3Bw);
        psgBreakdown.a4ColorUsage += Math.max(0, net.excessA4Color);
        psgBreakdown.a3ColorUsage += Math.max(0, net.excessA3Color);
      }
      // baseline (no prevReading) → contributes 0 to all breakdown buckets
    }

    const isFlagged  = !validation.valid || (billable.negativeFlag ?? false);
    const flagReason = !validation.valid
      ? validation.reason
      : (billable.negativeFlag ? 'Negative billable usage — possible meter reset or duplicate reading' : null);

    printerResults.push({
      printerId:    reading.printerId,
      serialNumber: reading.serialNumber,
      model:        reading.model,
      isBwOnly:     reading.isBwOnly ?? false,
      contractType: isPsgSimpleContract ? 'psg_simple' : isPsgContract ? 'psg' : 'osg',
      fixedCharge:  reading.printerFixedCharge ?? null,
      bwPrice:      reading.printerBwPrice     ?? null,
      colorPrice:   reading.printerColorPrice  ?? null,
      overrideMinBwPages:    reading.printerOverrideMinBwPages    ?? null,
      overrideMinColorPages: reading.printerOverrideMinColorPages ?? null,
      effectiveMinBwPages:   reading.printerOverrideMinBwPages    ?? cycle.contract.minBwPages    ?? null,
      effectiveMinColorPages:reading.printerOverrideMinColorPages ?? cycle.contract.minColorPages ?? null,
      excessBw:     reading.excessBw,
      excessColor:  reading.excessColor,
      billableBw:   billable.billableBw,
      billableColor: billable.billableColor,
      isBaseline:   billable.isBaseline,
      flagged:      isFlagged,
      flagReason,
    });
  }

  // Aggregate totals across all printers
  const allOsgBillableBw    = osgDefaultBillable.billableBw    + osgOverrides.reduce((s, o) => s + o.billable.billableBw,    0);
  const allOsgBillableColor = osgDefaultBillable.billableColor + osgOverrides.reduce((s, o) => s + o.billable.billableColor, 0);

  const totals = {
    totalBillableBw:    allOsgBillableBw    + psgBillable.billableBw,
    totalBillableColor: allOsgBillableColor + psgBillable.billableColor,
  };

  // Build one invoice per billing group
  const invoices = [];
  let grandTotal = 0;

  if (!isPsgAny) {
    if (osgDefaultSerialNumbers.length > 0) {
      const b = calculateOSGBilling(osgDefaultBillable, cycle.contract);
      grandTotal += b.total;
      invoices.push({
        type: 'osg_default',
        serialNumbers: osgDefaultSerialNumbers,
        allBwOnly: osgDefaultAllBwOnly && osgDefaultSerialNumbers.length > 0,
        billing: b,
      });
    }

    for (const ov of osgOverrides) {
      const effectiveContract = {
        ...cycle.contract,
        fixedCharge:   ov.fixedCharge           ?? cycle.contract.fixedCharge,
        bwPrice:       ov.bwPrice               ?? cycle.contract.bwPrice,
        colorPrice:    ov.colorPrice            ?? cycle.contract.colorPrice,
        minBwPages:    ov.overrideMinBwPages    ?? cycle.contract.minBwPages,
        minColorPages: ov.overrideMinColorPages ?? cycle.contract.minColorPages,
      };
      const b = calculateOSGBilling(ov.billable, effectiveContract);
      grandTotal += b.total;
      invoices.push({
        type: 'osg_override',
        serialNumber: ov.serialNumber,
        printerId: ov.printerId,
        allBwOnly: ov.isBwOnly ?? false,
        overrides: {
          fixedCharge:   ov.fixedCharge           != null,
          bwPrice:       ov.bwPrice               != null,
          colorPrice:    ov.colorPrice            != null,
          minBwPages:    ov.overrideMinBwPages    != null,
          minColorPages: ov.overrideMinColorPages != null,
        },
        billing: b,
      });
    }
  } else if (isPsgSimpleContract) {
    const b = calculatePSGSimpleBilling(psgBillable, cycle.contract);
    grandTotal += b.total;
    invoices.push({ type: 'psg_simple', billing: b });
  } else {
    const b = calculatePSGBilling(psgBreakdown, cycle.contract);
    grandTotal += b.total;
    invoices.push({ type: 'psg', billing: b });
  }

  return {
    cycleId:                cycle.id,
    cycleName:              cycle.cycleName,
    contractNumber:         cycle.contract.contractNumber,
    officialContractNumber: cycle.contract.officialContractNumber ?? null,
    customerName:           cycle.contract.customer.name,
    periodStart:            cycle.periodStart,
    periodEnd:              cycle.periodEnd,
    status:                 cycle.status,
    printers:               printerResults,
    totals,
    invoices,
    billing:        { billingType: cycle.contract.billingType, total: grandTotal },
    grandTotal,
  };
}

async function applyContractGroupBilling(summary, cycle) {
  const groups = await contractGroupRepo.findByContractId(cycle.contractId);
  const groupMeta = groups[0];
  if (!groupMeta) return summary;
  if (cycle.contract?.contractMode !== 'osg' || cycle.contract?.billingType !== 'minimum_volume') {
    return summary;
  }

  const group = await contractGroupRepo.findById(groupMeta.id);
  if (!group?.members?.length) return summary;

  const targetMonthKey = toBaghdadMonthKey(cycle.periodStart);
  const rawMemberSummaries = [];

  for (const member of group.members) {
    const memberCycles = await cycleRepo.findAll({ contractId: member.contractId });
    const memberCycle = memberCycles.find(c => toBaghdadMonthKey(c.periodStart) === targetMonthKey);

    if (!memberCycle) {
      rawMemberSummaries.push({
        contractId: member.contractId,
        contractNumber: member.contractNumber,
        customerName: member.customerName,
        cycleId: null,
        cycleName: null,
        billableBw: 0,
        billableColor: 0,
        fixedCharge: 0,
        bwPrice: 0,
        colorPrice: 0,
        minBwPages: 0,
        minColorPages: 0,
      });
      continue;
    }

    const memberSummary = memberCycle.id === cycle.id
      ? summary
      : await buildBillingCycleSummary(memberCycle.id, { applyGroupAdjustment: false });
    const memberCycleDetail = await cycleRepo.findById(memberCycle.id);

    rawMemberSummaries.push({
      contractId: member.contractId,
      contractNumber: member.contractNumber,
      customerName: member.customerName,
      cycleId: memberCycle.id,
      cycleName: memberSummary.cycleName,
      billableBw: memberSummary.totals?.totalBillableBw ?? 0,
      billableColor: memberSummary.totals?.totalBillableColor ?? 0,
      fixedCharge: Number(memberCycleDetail?.contract?.fixedCharge) || 0,
      bwPrice: Number(memberCycleDetail?.contract?.bwPrice) || 0,
      colorPrice: Number(memberCycleDetail?.contract?.colorPrice) || 0,
      minBwPages: Number(memberCycleDetail?.contract?.minBwPages) || 0,
      minColorPages: Number(memberCycleDetail?.contract?.minColorPages) || 0,
    });
  }

  const grouped = calculateGroupedMinVolumeBilling(rawMemberSummaries, {
    groupMinBw: group.groupMinBw,
    groupMinColor: group.groupMinColor,
  });

  const memberIndex = rawMemberSummaries.findIndex(m => m.contractId === cycle.contractId);
  if (memberIndex === -1) return summary;

  const memberSource = rawMemberSummaries[memberIndex];
  const memberGrouped = grouped.contracts[memberIndex];
  const billing = {
    billingType: 'minimum_volume',
    bwPages: memberSource.billableBw,
    bwMinimum: memberSource.minBwPages,
    bwExcess: memberGrouped.groupBwExcess ?? 0,
    bwPrice: memberSource.bwPrice,
    bwCost: memberGrouped.bwCost ?? 0,
    colorPages: memberSource.billableColor,
    colorMinimum: memberSource.minColorPages,
    colorExcess: memberGrouped.groupColorExcess ?? 0,
    colorPrice: memberSource.colorPrice,
    colorCost: memberGrouped.colorCost ?? 0,
    fixedCharge: memberSource.fixedCharge,
    total: memberGrouped.total,
    isGroupedContract: true,
    groupName: group.name,
    groupMinBw: group.groupMinBw,
    groupMinColor: group.groupMinColor,
    pooledBwExcess: grouped.pooledBwExcess ?? 0,
    pooledColorExcess: grouped.pooledColorExcess ?? 0,
    isBreachingContract: memberGrouped.isBreachingContract,
  };

  return {
    ...summary,
    invoices: [{ type: 'group_minimum_volume', billing }],
    billing: { billingType: 'minimum_volume', total: billing.total, isGroupedContract: true, groupName: group.name },
    grandTotal: billing.total,
  };
}

export async function getBillingCycleSummary(id) {
  const summary = await buildBillingCycleSummary(id, { applyGroupAdjustment: false });
  if (summary.isBaseline) return summary;
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }
  return applyContractGroupBilling(summary, cycle);
}

// ── Status transitions ──────────────────────────────────────────────────────

export async function confirmCycle(id) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }
  // pending_quarterly → confirmed only when group is unlinked (handled by cycleGroupService)
  if (!['open', 'pending_confirmation'].includes(cycle.status)) {
    const err = new Error('Invalid status transition');
    err.status = 400;
    throw err;
  }
  const { canConfirm, reason } = await canConfirmCycle(id);
  if (!canConfirm) {
    const err = new Error(`Cannot confirm cycle — ${reason}`);
    err.status = 400;
    throw err;
  }
  return cycleRepo.update(id, { status: 'confirmed', confirmedAt: new Date() });
}

export async function disputeCycle(id, { disputeNote }) {
  if (!disputeNote) {
    const err = new Error('disputeNote is required');
    err.status = 400;
    throw err;
  }

  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }
  if (cycle.status === 'pending_quarterly') {
    const err = new Error('Pending quarterly cycles cannot be disputed individually');
    err.status = 400;
    throw err;
  }
  if (!['open', 'pending_confirmation'].includes(cycle.status)) {
    const err = new Error('Invalid status transition');
    err.status = 400;
    throw err;
  }
  return cycleRepo.update(id, { status: 'disputed', disputeNote });
}

export async function reopenCycle(id) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }
  if (cycle.status !== 'disputed') {
    const err = new Error('Invalid status transition');
    err.status = 400;
    throw err;
  }
  return cycleRepo.update(id, { status: 'open', disputeNote: null });
}

export async function getGroupSummary(id) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }
  if (cycle.groupPosition !== 3) {
    const err = new Error('Group summary is only available for the invoicing cycle (position 3)');
    err.status = 400;
    throw err;
  }
  if (!cycle.cycleGroupId) {
    const err = new Error('This cycle is not part of a group');
    err.status = 400;
    throw err;
  }

  const groupCycles = await cycleRepo.findByCycleGroupId(cycle.cycleGroupId);
  const summaries = await Promise.all(groupCycles.map(c => getBillingCycleSummary(c.id)));

  const grandTotal = summaries.reduce((s, sm) => s + (sm.billing?.total ?? 0), 0);
  const combinedInvoice = cycle.contract?.combinedInvoice ?? false;

  const cyclesData = summaries.map((sm, i) => ({
    cycleName: sm.cycleName,
    cycleId: groupCycles[i].id,
    groupPosition: groupCycles[i].groupPosition,
    billing: sm.billing,
    invoices: sm.invoices,
    total: sm.billing?.total ?? 0,
  }));

  return {
    groupId:                cycle.cycleGroupId,
    contractNumber:         cycle.contract.contractNumber,
    officialContractNumber: cycle.contract.officialContractNumber ?? null,
    customerName:           cycle.contract.customer.name,
    currency: cycle.contract.currency ?? 'IQD',
    invoiceFrequency: cycle.contract.invoiceFrequency,
    combinedInvoice,
    cycles: combinedInvoice
      ? cyclesData.map(c => ({ cycleName: c.cycleName, total: c.total }))
      : cyclesData,
    grandTotal,
    billing: { total: grandTotal },
  };
}

export async function cancelCycle(id, userId) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }
  if (cycle.status === 'invoiced') {
    const err = new Error('Cannot cancel an invoiced billing cycle');
    err.status = 400;
    throw err;
  }
  await cycleRepo.cancelById(id, userId);
  return { message: 'Billing cycle cancelled' };
}

export async function setBaseline(id, { isBaseline }, userId) {
  if (typeof isBaseline !== 'boolean') {
    const err = new Error('isBaseline must be boolean');
    err.status = 400;
    throw err;
  }
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }
  if (cycle.status === 'invoiced') {
    const err = new Error('Cannot change baseline status of an invoiced cycle');
    err.status = 400;
    throw err;
  }
  return cycleRepo.setBaseline(id, isBaseline, userId);
}
