import * as cycleRepo from '../repositories/billingCycleRepository.js';
import * as readingRepo from '../repositories/meterReadingRepository.js';
import * as contractGroupRepo from '../repositories/contractGroupRepository.js';
import * as consumableReadingRepo from '../repositories/consumableReadingRepository.js';
import * as performanceRepo from '../repositories/performanceRepository.js';
import pool from '../config/db.js';
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
import { applyInvoiceRules, getPrevQuarterEndDate } from '../utils/invoiceRulesEngine.js';

const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;

function toBaghdadMonthKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const baghdad = new Date(date.getTime() + BAGHDAD_OFFSET_MS);
  const year = baghdad.getUTCFullYear();
  const month = String(baghdad.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function applyBreakdownStyle(breakdown, style, quarterNumber, quarterlyFixedCharge) {
  if (style !== 'quarterly_total' || !breakdown?.length) return breakdown;
  const label = quarterNumber ? `Q${quarterNumber} Total` : 'Quarter Total';
  return [{
    cycleId:          null,
    cycleName:        label,
    periodStart:      breakdown[0].periodStart,
    periodEnd:        breakdown[breakdown.length - 1].periodEnd,
    bwCost:           breakdown.reduce((s, m) => s + m.bwCost, 0),
    colorCost:        breakdown.reduce((s, m) => s + m.colorCost, 0),
    fixedCharge:      quarterlyFixedCharge,
    total:            breakdown.reduce((s, m) => s + m.bwCost + m.colorCost, 0) + quarterlyFixedCharge,
    isCurrentCycle:   true,
    isQuarterlyTotal: true,
  }];
}

export async function listCycles(query, user) {
  const params = {
    contractId: query.contractId,
    status:     query.status,
  };
  if (user?.role?.name === 'odoo_integration') {
    params.status = 'confirmed';
    params.excludeInvoiced = true;
  }
  return cycleRepo.findAll(params);
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

export async function updateCyclePeriod(id, { periodStart, periodEnd }) {
  if (!periodStart || !periodEnd) {
    const err = new Error('periodStart and periodEnd are required');
    err.status = 400;
    throw err;
  }
  if (new Date(periodEnd) <= new Date(periodStart)) {
    const err = new Error('periodEnd must be after periodStart');
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
    const err = new Error('Cannot edit the period of an invoiced cycle');
    err.status = 409;
    throw err;
  }
  if (cycle.isCancelled) {
    const err = new Error('Cannot edit the period of a cancelled cycle');
    err.status = 409;
    throw err;
  }

  const taken = await cycleRepo.periodStartTaken(cycle.contractId, periodStart, id);
  if (taken) {
    const err = new Error('Another billing cycle for this contract already starts on that date');
    err.status = 409;
    throw err;
  }

  return cycleRepo.updatePeriod(id, periodStart, periodEnd);
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
  const printerEntries = [];
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
    // Quarterly contracts reference the last reading of the previous quarter instead of the previous month.
    const invoiceRulesForPrev = cycle.contract?.invoiceRules ?? {};
    let prevReading;
    if (invoiceRulesForPrev.fixedChargeFrequency === 'quarterly' && invoiceRulesForPrev.contractStartDate) {
      const targetDate = getPrevQuarterEndDate(invoiceRulesForPrev.contractStartDate, cycle.periodStart);
      prevReading = await readingRepo.getPreviousQuarterEndCycleReading(
        reading.printerId, cycle.id, targetDate,
      );
    } else {
      prevReading = await readingRepo.getPreviousCycleReading(
        reading.printerId, cycle.id, cycle.periodStart,
      );
    }
    const currentExcess  = { excessBw: reading.excessBw, excessColor: reading.excessColor };
    const previousExcess = prevReading
      ? { excessBw: prevReading.excessBw, excessColor: prevReading.excessColor }
      : null;

    // All types store cumulative excess — subtract consecutive values to get period usage.
    const billable = calculateBillableUsage(currentExcess, previousExcess);

    // Validate against last 3 stored excesses for this printer
    const recentReadings     = await readingRepo.getRecentReadings(reading.printerId, cycle.periodStart, 3);
    const historicalExcesses = recentReadings.map(r => ({ excessBw: r.excessBw, excessColor: r.excessColor }));
    const validation         = validateUsage(currentExcess, historicalExcesses);

    // Populated inside the PSG branch when prevReading exists — used for perPrinterPsgBreakdown below
    let psgNet = null;

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
        psgNet = calculatePSGNet(
          { a4Bw: reading.a4Bw, a3Bw: reading.a3Bw, a4Color: reading.a4Color, a3Color: reading.a3Color, xls: reading.xls },
          previousRaw,
        );
        psgBreakdown.a4BwUsage    += Math.max(0, psgNet.excessA4Bw);
        psgBreakdown.a3BwUsage    += Math.max(0, psgNet.excessA3Bw);
        psgBreakdown.a4ColorUsage += Math.max(0, psgNet.excessA4Color);
        psgBreakdown.a3ColorUsage += Math.max(0, psgNet.excessA3Color);
      }
      // baseline (no prevReading) → contributes 0 to all breakdown buckets
    }

    const isFlagged  = !validation.valid || (billable.negativeFlag ?? false);
    const flagReason = !validation.valid
      ? validation.reason
      : (billable.negativeFlag ? 'Negative billable usage — possible meter reset or duplicate reading' : null);

    const printerContractType = isPsgSimpleContract ? 'psg_simple' : isPsgContract ? 'psg' : 'osg';
    const hasOverride = !isPsgAny && (
      reading.printerFixedCharge != null || reading.printerBwPrice != null || reading.printerColorPrice != null
      || reading.printerOverrideMinBwPages != null || reading.printerOverrideMinColorPages != null
    );

    printerResults.push({
      printerId:    reading.printerId,
      serialNumber: reading.serialNumber,
      model:        reading.model,
      isBwOnly:     reading.isBwOnly ?? false,
      contractType: printerContractType,
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

    // Build entry for invoice rules engine — use calculatePSGNet values so A3 is not double-counted in a4ColorUsage
    const perPrinterPsgBreakdown = isPsgContract && psgNet
      ? {
          a4BwUsage:    Math.max(0, psgNet.excessA4Bw),
          a3BwUsage:    Math.max(0, psgNet.excessA3Bw),
          a4ColorUsage: Math.max(0, psgNet.excessA4Color),
          a3ColorUsage: Math.max(0, psgNet.excessA3Color),
        }
      : { a4BwUsage: 0, a3BwUsage: 0, a4ColorUsage: 0, a3ColorUsage: 0 };

    printerEntries.push({
      printerId:    reading.printerId,
      serialNumber: reading.serialNumber,
      model:        reading.model,
      isBwOnly:     reading.isBwOnly ?? false,
      city:         reading.city     ?? null,
      location:     reading.location ?? null,
      contractType: printerContractType,
      hasOverride,
      billable:     { billableBw: billable.billableBw, billableColor: billable.billableColor },
      psgBreakdown: perPrinterPsgBreakdown,
      priceOverride: {
        fixedCharge:           reading.printerFixedCharge           ?? null,
        bwPrice:               reading.printerBwPrice               ?? null,
        colorPrice:            reading.printerColorPrice            ?? null,
        overrideMinBwPages:    reading.printerOverrideMinBwPages    ?? null,
        overrideMinColorPages: reading.printerOverrideMinColorPages ?? null,
      },
    });
  }

  // Aggregate totals across all printers
  const allOsgBillableBw    = osgDefaultBillable.billableBw    + osgOverrides.reduce((s, o) => s + o.billable.billableBw,    0);
  const allOsgBillableColor = osgDefaultBillable.billableColor + osgOverrides.reduce((s, o) => s + o.billable.billableColor, 0);

  const totals = {
    totalBillableBw:    allOsgBillableBw    + psgBillable.billableBw,
    totalBillableColor: allOsgBillableColor + psgBillable.billableColor,
  };

  // Route through invoice rules engine — handles grouping + frequency rules
  const { invoices, grandTotal, rulesMeta } = applyInvoiceRules({
    printers: printerEntries,
    contract: cycle.contract,
    cycle,
  });

  const quarterlyBreakdownStyle = cycle.contract.invoiceRules?.quarterlyBreakdownStyle ?? 'monthly';

  // Quarterly breakdown — fetch and price all cycles in the quarter when fixed charge covers multiple periods
  let quarterlyBreakdown = null;
  let quarterlyFixedCharge = null;
  if (rulesMeta.isFixedChargeDue && rulesMeta.fixedChargeMultiplier > 1 && rulesMeta.quarterStartDate) {
    const toPeriodStr = v => {
      const d = v instanceof Date ? v : new Date(v);
      const baghdad = new Date(d.getTime() + BAGHDAD_OFFSET_MS);
      return `${baghdad.getUTCFullYear()}-${String(baghdad.getUTCMonth() + 1).padStart(2, '0')}-${String(baghdad.getUTCDate()).padStart(2, '0')}`;
    };
    const currentPeriodStr = toPeriodStr(cycle.periodStart);
    const baseFixedCharge  = Number(cycle.contract.fixedCharge) || 0;
    const bwPrice          = Number(cycle.contract.bwPrice)     || 0;
    const colorPrice       = Number(cycle.contract.colorPrice)  || 0;

    // All non-deleted cycles for this contract within the quarter, ordered chronologically
    const { rows: quarterCycleRows } = await pool.query(
      `SELECT bc.id, bc.period_start, bc.period_end,
              TO_CHAR(bc.period_start, 'Mon YYYY') AS cycle_month
       FROM billing_cycles bc
       WHERE bc.contract_id = $1
         AND bc.period_start >= $2
         AND bc.period_start <= $3
         AND bc.deleted_at IS NULL
       ORDER BY bc.period_start ASC`,
      [cycle.contractId, rulesMeta.quarterStartDate, currentPeriodStr],
    );

    // Pre-fetch readings for all quarter cycles once — reused by both main and override breakdowns
    const cycleReadingsCache = new Map();
    await Promise.all(quarterCycleRows.map(async qCycle => {
      const readings = await readingRepo.findAllWithPrinterInfo(qCycle.id, cycle.contractId);
      cycleReadingsCache.set(qCycle.id, { readings, qPeriodStr: toPeriodStr(qCycle.period_start) });
    }));

    // Main breakdown — aggregate all printers
    const rawBreakdown = await Promise.all(quarterCycleRows.map(async qCycle => {
      const { readings, qPeriodStr } = cycleReadingsCache.get(qCycle.id);

      let totalBwCost    = 0;
      let totalColorCost = 0;
      for (const reading of readings) {
        // Breakdown rows always use the previous month's reading so each row shows
        // pages printed in that specific month only (not cumulative since quarter start).
        const prevReading = await readingRepo.getPreviousCycleReading(reading.printerId, qCycle.id, qPeriodStr);
        const billable = calculateBillableUsage(
          { excessBw: reading.excessBw, excessColor: reading.excessColor },
          prevReading ? { excessBw: prevReading.excessBw, excessColor: prevReading.excessColor } : null,
        );
        totalBwCost    += billable.billableBw    * bwPrice;
        totalColorCost += billable.billableColor * colorPrice;
      }

      return {
        cycleId:        qCycle.id,
        cycleName:      qCycle.cycle_month?.trim() ?? qPeriodStr,
        periodStart:    qPeriodStr,
        periodEnd:      toPeriodStr(qCycle.period_end),
        bwCost:         totalBwCost,
        colorCost:      totalColorCost,
        fixedCharge:    baseFixedCharge,
        total:          totalBwCost + totalColorCost + baseFixedCharge,
        isCurrentCycle: qCycle.id === cycle.id,
      };
    }));

    quarterlyFixedCharge = baseFixedCharge * rulesMeta.fixedChargeMultiplier;
    quarterlyBreakdown   = applyBreakdownStyle(rawBreakdown, quarterlyBreakdownStyle, rulesMeta.quarterNumber, quarterlyFixedCharge);

    // Per-printer override breakdowns — augment each osg_override invoice
    for (const inv of invoices) {
      if (inv.type !== 'osg_override') continue;
      const pe = printerEntries.find(p => p.printerId === inv.printerId);
      if (!pe) continue;

      const oBwPrice    = Number(pe.priceOverride?.bwPrice    ?? cycle.contract.bwPrice    ?? 0);
      const oColorPrice = Number(pe.priceOverride?.colorPrice ?? cycle.contract.colorPrice ?? 0);
      const oFixed      = Number(pe.priceOverride?.fixedCharge ?? cycle.contract.fixedCharge ?? 0);

      const rawOverride = await Promise.all(quarterCycleRows.map(async qCycle => {
        const { readings, qPeriodStr } = cycleReadingsCache.get(qCycle.id);
        const pr = readings.find(r => r.printerId === inv.printerId);

        let bwCost = 0, colorCost = 0;
        if (pr) {
          const prevReading = await readingRepo.getPreviousCycleReading(pr.printerId, qCycle.id, qPeriodStr);
          const billable = calculateBillableUsage(
            { excessBw: pr.excessBw, excessColor: pr.excessColor },
            prevReading ? { excessBw: prevReading.excessBw, excessColor: prevReading.excessColor } : null,
          );
          bwCost    = billable.billableBw    * oBwPrice;
          colorCost = billable.billableColor * oColorPrice;
        }
        return {
          cycleId:        qCycle.id,
          cycleName:      qCycle.cycle_month?.trim() ?? qPeriodStr,
          periodStart:    qPeriodStr,
          periodEnd:      toPeriodStr(qCycle.period_end),
          bwCost,
          colorCost,
          fixedCharge:    oFixed,
          total:          bwCost + colorCost + oFixed,
          isCurrentCycle: qCycle.id === cycle.id,
        };
      }));

      const oQFixedCharge = oFixed * rulesMeta.fixedChargeMultiplier;
      inv.quarterlyBreakdown   = applyBreakdownStyle(rawOverride, quarterlyBreakdownStyle, rulesMeta.quarterNumber, oQFixedCharge);
      inv.quarterlyFixedCharge = oQFixedCharge;
    }
  }

  // ── Post-process: quarterlyBreakdownStyle adjustments ─────────────────────
  const isQuarterEnd = rulesMeta.isFixedChargeDue && rulesMeta.fixedChargeMultiplier > 1;

  let finalGrandTotal = grandTotal;
  let finalInvoices   = invoices;

  if (isQuarterEnd && quarterlyBreakdownStyle === 'quarterly_total' && quarterlyBreakdown?.length) {
    // Quarter-end + quarterly_total: each invoice reflects its full-quarter amounts
    finalInvoices = invoices.map(inv => {
      const invQb     = inv.quarterlyBreakdown ?? quarterlyBreakdown;
      const invQFixed = inv.quarterlyFixedCharge ?? quarterlyFixedCharge ?? 0;
      const invBwTotal    = invQb.reduce((s, m) => s + m.bwCost,    0);
      const invColorTotal = invQb.reduce((s, m) => s + m.colorCost, 0);
      return {
        ...inv,
        billing: {
          ...inv.billing,
          bwCost:      invBwTotal,
          colorCost:   invColorTotal,
          fixedCharge: invQFixed,
          total:       invBwTotal + invColorTotal + invQFixed,
        },
      };
    });
    finalGrandTotal = finalInvoices.reduce((s, inv) => s + inv.billing.total, 0);
  } else if (!isQuarterEnd && quarterlyBreakdownStyle === 'quarterly_total') {
    // Non-quarter-end + quarterly_total: nothing invoiced yet this quarter
    finalGrandTotal = 0;
  }

  // ── invoicingNote: machine-readable instruction for Odoo ─────────────────
  const fmtIsoDate = d => {
    if (!d) return '';
    const [y, m, dy] = String(d).slice(0, 10).split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(dy, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
  };
  const { quarterNumber, quarterStartDate, quarterEndDate, nextFixedChargeDate } = rulesMeta;

  let invoicingNote;
  if (isQuarterEnd && quarterlyBreakdownStyle === 'quarterly_total') {
    invoicingNote = `Invoice covers full Q${quarterNumber} — ${fmtIsoDate(quarterStartDate)} to ${fmtIsoDate(quarterEndDate)}`;
  } else if (isQuarterEnd) {
    invoicingNote = 'Invoice covers current month only — quarterly breakdown shown for reference';
  } else if (quarterlyBreakdownStyle === 'quarterly_total') {
    invoicingNote = nextFixedChargeDate
      ? `No invoice this month — charges accumulate until ${fmtIsoDate(nextFixedChargeDate)}`
      : 'No invoice this month — charges accumulate until quarter end';
  } else {
    invoicingNote = nextFixedChargeDate
      ? `Monthly invoice — fixed charge deferred to ${fmtIsoDate(nextFixedChargeDate)}`
      : 'Monthly invoice';
  }

  return {
    cycleId:                    cycle.id,
    cycleName:                  cycle.cycleName,
    contractNumber:             cycle.contract.contractNumber,
    officialContractNumber:     cycle.contract.officialContractNumber ?? null,
    serviceType:                cycle.contract.serviceType ?? null,
    customerName:               cycle.contract.customer.name,
    periodStart:                cycle.periodStart,
    periodEnd:                  cycle.periodEnd,
    status:                     cycle.status,
    printers:                   printerResults,
    totals,
    invoices:                   finalInvoices,
    rulesMeta:                  { ...rulesMeta, quarterlyBreakdownStyle, invoicingNote },
    quarterlyBreakdown,
    quarterlyFixedCharge,
    quarterlyBreakdownStyle,
    billing:                    { billingType: cycle.contract.billingType, total: finalGrandTotal },
    grandTotal:                 finalGrandTotal,
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

export async function unconfirmCycle(id) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }
  if (cycle.status === 'invoiced') {
    const err = new Error('Cannot unconfirm an invoiced cycle');
    err.status = 400;
    throw err;
  }
  if (cycle.status !== 'confirmed') {
    const err = new Error(`Cycle is not confirmed — current status is "${cycle.status}"`);
    err.status = 400;
    throw err;
  }
  return cycleRepo.update(id, { status: 'open', confirmedAt: null, confirmedByUserId: null });
}

export async function setManualBillingAmount(id, amount) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }
  if (cycle.status === 'invoiced') {
    const err = new Error('Cannot edit an invoiced cycle');
    err.status = 400;
    throw err;
  }
  return cycleRepo.updateManualBillingAmount(id, amount);
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
    combinedInvoice,
    cycles: combinedInvoice
      ? cyclesData.map(c => ({ cycleName: c.cycleName, total: c.total }))
      : cyclesData,
    grandTotal,
    billing: { total: grandTotal },
  };
}

export async function getCancelledCycles() {
  return cycleRepo.findAllCancelled();
}

export async function softDeleteCycle(id, userId) {
  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }
  if (cycle.status === 'invoiced') {
    const err = new Error('Cannot delete an invoiced billing cycle');
    err.status = 400;
    throw err;
  }
  if (cycle.cycleGroupId) {
    const err = new Error('Cannot delete a cycle that is part of a quarterly group');
    err.status = 400;
    throw err;
  }
  await cycleRepo.softDelete(id, userId);
  return { message: 'Billing cycle moved to recycle bin' };
}

export async function getDeletedCycles() {
  return cycleRepo.findAllDeleted();
}

export async function restoreCycle(id) {
  const restored = await cycleRepo.restore(id);
  if (!restored) {
    const err = new Error('Deleted billing cycle not found');
    err.status = 404;
    throw err;
  }
  return { message: 'Billing cycle restored' };
}

export async function hardDeleteCycle(id) {
  const deleted = await cycleRepo.hardDeleteCancelledById(id);
  if (!deleted) {
    const err = new Error('Cancelled billing cycle not found');
    err.status = 404;
    throw err;
  }
  return { message: 'Billing cycle permanently deleted' };
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

export async function markInvoiced(id, body) {
  const { odooInvoiceId } = body;

  if (!odooInvoiceId) {
    const err = new Error('odooInvoiceId is required');
    err.status = 400;
    throw err;
  }

  const cycle = await cycleRepo.findById(id);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }

  if (cycle.status !== 'confirmed') {
    const err = new Error(`Cannot mark as invoiced — cycle status is "${cycle.status}". Only confirmed cycles can be invoiced.`);
    err.status = 400;
    throw err;
  }

  if (cycle.odooInvoiceId) {
    const err = new Error(`This cycle is already invoiced with Odoo invoice ID: ${cycle.odooInvoiceId}`);
    err.status = 409;
    throw err;
  }

  const updated = await cycleRepo.update(id, {
    status: 'invoiced',
    odooInvoiceId,
    invoicedAt: new Date(),
  });

  try {
    await pool.query(
      `INSERT INTO invoice_logs (billing_cycle_id, success, odoo_invoice_id, attempt_number)
       VALUES ($1, true, $2, 1)`,
      [id, odooInvoiceId],
    );
  } catch (e) {
    console.error('Could not write invoice log:', e.message);
  }

  return {
    message: 'Billing cycle marked as invoiced',
    cycleId: id,
    odooInvoiceId,
    invoicedAt: updated.invoicedAt,
    cycleName: updated.cycleName,
  };
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

// ── Audit export ─────────────────────────────────────────────────────────────

export async function getAuditExportData(cycleId) {
  const cycle = await cycleRepo.findById(cycleId);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }

  const [summary, rawReadings, consumables] = await Promise.all([
    getBillingCycleSummary(cycleId),
    readingRepo.findAllWithEngineerForOdoo(cycleId, cycle.contractId),
    consumableReadingRepo.findAll({ billingCycleId: cycleId }),
  ]);

  const consumableByPrinter = new Map();
  for (const cr of consumables) {
    if (!consumableByPrinter.has(cr.printerId)) consumableByPrinter.set(cr.printerId, cr);
  }

  const invoiceRulesForPrev = cycle.contract?.invoiceRules ?? {};
  const isQuarterly = invoiceRulesForPrev.fixedChargeFrequency === 'quarterly'
    && !!invoiceRulesForPrev.contractStartDate;

  const toPeriodStr = v => {
    const d = v instanceof Date ? v : new Date(v);
    const baghdad = new Date(d.getTime() + BAGHDAD_OFFSET_MS);
    return `${baghdad.getUTCFullYear()}-${String(baghdad.getUTCMonth() + 1).padStart(2, '0')}-${String(baghdad.getUTCDate()).padStart(2, '0')}`;
  };

  const printers = await Promise.all(rawReadings.map(async (reading) => {
    const sp = summary.printers?.find(p => p.printerId === reading.printerId);

    let prevReading;
    if (isQuarterly) {
      const targetDate = getPrevQuarterEndDate(invoiceRulesForPrev.contractStartDate, cycle.periodStart);
      prevReading = await readingRepo.getPreviousQuarterEndCycleReading(reading.printerId, cycleId, targetDate);
    } else {
      prevReading = await readingRepo.getPreviousCycleReading(reading.printerId, cycleId, cycle.periodStart);
    }

    const a4Bw    = prevReading ? Math.max(0, reading.a4Bw    - prevReading.a4Bw)    : 0;
    const a3Bw    = prevReading ? Math.max(0, reading.a3Bw    - prevReading.a3Bw)    : 0;
    const a4Color = prevReading ? Math.max(0, reading.a4Color - prevReading.a4Color)  : 0;
    const a3Color = prevReading ? Math.max(0, reading.a3Color - prevReading.a3Color)  : 0;

    const cr = consumableByPrinter.get(reading.printerId) ?? null;
    const printerInvoice = summary.invoices?.find(
      inv => inv.type === 'osg_override' && inv.printerId === reading.printerId,
    );

    return {
      serialNumber:      reading.serialNumber,
      model:             reading.model,
      city:              reading.city     ?? '',
      location:          reading.location ?? '',
      engineer:          reading.engineerName ?? '',
      isBwOnly:          reading.isBwOnly ?? false,
      submittedAt:       reading.readAt ?? null,
      prevSubmittedAt:   prevReading?.readAt ?? null,
      prevCounters:      prevReading
        ? { a4Bw: prevReading.a4Bw, a4Color: prevReading.a4Color, a3Bw: prevReading.a3Bw, a3Color: prevReading.a3Color }
        : null,
      currCounters:      { a4Bw: reading.a4Bw, a4Color: reading.a4Color, a3Bw: reading.a3Bw, a3Color: reading.a3Color },
      pagesUsed:         { a4Bw, a3Bw, a4Color, a3Color, totalBw: a4Bw + a3Bw, totalColor: a4Color + a3Color },
      effectiveMinBw:    sp?.effectiveMinBwPages    ?? null,
      effectiveMinColor: sp?.effectiveMinColorPages ?? null,
      billableBw:        sp?.billableBw    ?? 0,
      billableColor:     sp?.billableColor ?? 0,
      hasOverride:       !!printerInvoice,
      printerBilling:    printerInvoice?.billing ?? null,
      flagged:           sp?.flagged    ?? false,
      flagReason:        sp?.flagReason ?? null,
      consumables: cr ? {
        k:         cr.kPct,
        c:         cr.cPct,
        m:         cr.mPct,
        y:         cr.yPct,
        r1:        cr.r1Pct,
        r2:        cr.r2Pct,
        r3:        cr.r3Pct,
        r4:        cr.r4Pct,
        wasteTone: cr.wasteTonePct,
      } : null,
    };
  }));

  return {
    exportedAt: new Date().toISOString(),
    header: {
      customerName:           cycle.contract?.customer?.name ?? '',
      contractNumber:         cycle.contract?.contractNumber ?? '',
      officialContractNumber: cycle.contract?.officialContractNumber ?? null,
      period:                 cycle.cycleName ?? '',
      periodStart:            toPeriodStr(cycle.periodStart),
      periodEnd:              toPeriodStr(cycle.periodEnd),
      currency:               cycle.contract?.currency ?? 'IQD',
      status:                 cycle.status,
    },
    contract: {
      contractMode:  cycle.contract?.contractMode ?? 'osg',
      fixedCharge:   Number(cycle.contract?.fixedCharge)   || 0,
      bwPrice:       Number(cycle.contract?.bwPrice)       || 0,
      colorPrice:    Number(cycle.contract?.colorPrice)    || 0,
      minBwPages:    Number(cycle.contract?.minBwPages)    || 0,
      minColorPages: Number(cycle.contract?.minColorPages) || 0,
    },
    printers,
    invoices:            summary.invoices ?? [],
    grandTotal:          summary.grandTotal ?? 0,
    manualBillingAmount: cycle.manualBillingAmount ?? null,
  };
}

// ── Odoo export ─────────────────────────────────────────────────────────────

export async function getOdooExportData(cycleId) {
  const cycle = await cycleRepo.findById(cycleId);
  if (!cycle) {
    const err = new Error('Billing cycle not found');
    err.status = 404;
    throw err;
  }

  const summary = await getBillingCycleSummary(cycleId);

  const rawReadings = await readingRepo.findAllWithEngineerForOdoo(cycleId, cycle.contractId);

  const [consumables, engineerPerformance] = await Promise.all([
    consumableReadingRepo.findAll({ billingCycleId: cycleId }),
    performanceRepo.getEngineersByCycle(cycleId),
  ]);

  const consumableByPrinter = new Map();
  for (const cr of consumables) {
    if (!consumableByPrinter.has(cr.printerId)) consumableByPrinter.set(cr.printerId, cr);
  }

  const invoiceRulesForPrev = cycle.contract?.invoiceRules ?? {};
  const isQuarterly = invoiceRulesForPrev.fixedChargeFrequency === 'quarterly'
    && !!invoiceRulesForPrev.contractStartDate;

  const printers = await Promise.all(rawReadings.map(async (reading) => {
    const summaryPrinter = summary.printers?.find(p => p.printerId === reading.printerId);

    let prevReading;
    if (isQuarterly) {
      const targetDate = getPrevQuarterEndDate(invoiceRulesForPrev.contractStartDate, cycle.periodStart);
      prevReading = await readingRepo.getPreviousQuarterEndCycleReading(
        reading.printerId, cycleId, targetDate,
      );
    } else {
      prevReading = await readingRepo.getPreviousCycleReading(
        reading.printerId, cycleId, cycle.periodStart,
      );
    }

    const a4Bw    = prevReading ? Math.max(0, reading.a4Bw    - prevReading.a4Bw)    : 0;
    const a3Bw    = prevReading ? Math.max(0, reading.a3Bw    - prevReading.a3Bw)    : 0;
    const a4Color = prevReading ? Math.max(0, reading.a4Color - prevReading.a4Color)  : 0;
    const a3Color = prevReading ? Math.max(0, reading.a3Color - prevReading.a3Color)  : 0;

    const cr = consumableByPrinter.get(reading.printerId) ?? null;

    return {
      id:           reading.printerId,
      serialNumber: reading.serialNumber,
      model:        reading.model,
      isBwOnly:     reading.isBwOnly ?? false,
      engineer: {
        id:   reading.engineerId,
        name: reading.engineerName,
      },
      pagesUsed:  { a4Bw, a3Bw, a4Color, a3Color },
      billable:   {
        bw:    summaryPrinter?.billableBw    ?? 0,
        color: summaryPrinter?.billableColor ?? 0,
      },
      toner: cr ? {
        c:  cr.cPct,
        m:  cr.mPct,
        y:  cr.yPct,
        k:  cr.kPct,
        r1: cr.r1Pct,
        r2: cr.r2Pct,
        r3: cr.r3Pct,
        r4: cr.r4Pct,
      } : null,
      flagged:    summaryPrinter?.flagged    ?? false,
      flagReason: summaryPrinter?.flagReason ?? null,
    };
  }));

  const toPeriodStr = v => {
    const d = v instanceof Date ? v : new Date(v);
    const baghdad = new Date(d.getTime() + BAGHDAD_OFFSET_MS);
    return `${baghdad.getUTCFullYear()}-${String(baghdad.getUTCMonth() + 1).padStart(2, '0')}-${String(baghdad.getUTCDate()).padStart(2, '0')}`;
  };

  return {
    exportedAt: new Date().toISOString(),
    cycle: {
      id:          cycle.id,
      name:        cycle.cycleName,
      periodStart: toPeriodStr(cycle.periodStart),
      periodEnd:   toPeriodStr(cycle.periodEnd),
      status:      cycle.status,
    },
    contract: {
      id:                     cycle.contractId,
      contractNumber:         cycle.contract.contractNumber,
      officialContractNumber: cycle.contract.officialContractNumber ?? null,
      serviceType:            cycle.contract.serviceType ?? null,
      contractMode:           cycle.contract.contractMode ?? 'osg',
    },
    customer: {
      id:   cycle.contract.customer.id,
      name: cycle.contract.customer.name,
    },
    billing: {
      totalBillableBw:    summary.totals?.totalBillableBw    ?? 0,
      totalBillableColor: summary.totals?.totalBillableColor ?? 0,
      grandTotal:         (['LS', 'LO'].includes(cycle.contract.serviceType) && cycle.manualBillingAmount != null)
        ? cycle.manualBillingAmount
        : (summary.grandTotal ?? 0),
      invoiceLines:       summary.invoices                    ?? [],
    },
    printers,
    engineerPerformance,
  };
}
