import {
  calculateOSGBilling,
  calculatePSGBilling,
  calculatePSGSimpleBilling,
} from '../services/netCalculationService.js';

const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;

// Returns the period_start date string of the last cycle of the previous quarter.
// Quarters are measured in 3-month intervals from contractStartDate.
// Handles Baghdad timezone: PostgreSQL DATE columns arrive as midnight Baghdad (UTC+3).
export function getPrevQuarterEndDate(contractStartDate, currentPeriodStart) {
  const start = new Date(contractStartDate);
  // Add Baghdad offset so midnight-Baghdad Date objects read the correct local month
  const rawCurrent = currentPeriodStart instanceof Date ? currentPeriodStart : new Date(currentPeriodStart);
  const current = new Date(rawCurrent.getTime() + BAGHDAD_OFFSET_MS);

  const sY = start.getUTCFullYear();
  const sM = start.getUTCMonth() + 1;
  const sD = start.getUTCDate();
  const cY = current.getUTCFullYear();
  const cM = current.getUTCMonth() + 1;

  const monthsElapsed = (cY - sY) * 12 + (cM - sM);
  const remainder     = monthsElapsed % 3;
  const offset        = remainder === 0 ? 3 : remainder;
  const targetMonths  = monthsElapsed - offset;

  let tM = sM + targetMonths;
  let tY = sY + Math.floor((tM - 1) / 12);
  tM     = ((tM - 1) % 12 + 12) % 12 + 1;

  return `${tY}-${String(tM).padStart(2, '0')}-${String(sD).padStart(2, '0')}`;
}

export function getDefaultRules() {
  return {
    fixedChargeFrequency:    'monthly',
    excessFrequency:         'monthly',
    overrideInvoicing:       'separate',
    groupingStrategy:        'contract',
    contractStartDate:       null,
    quarterlyBreakdownStyle: 'monthly',
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

export function applyInvoiceRules({ printers, contract, cycle }) {
  const rules = { ...getDefaultRules(), ...(contract.invoiceRules ?? {}) };
  const rulesMeta = buildRulesMeta(rules, cycle);

  const groups = groupPrinters(printers, rules.groupingStrategy, rules.overrideInvoicing);

  const rawInvoices = groups.map(group => {
    const billing = calculateGroupBilling(group, contract);
    return { ...group.meta, billing };
  });

  return applyFrequencyRules(rawInvoices, rules, rulesMeta);
}

// ── Period timing ─────────────────────────────────────────────────────────────

function buildRulesMeta(rules, cycle) {
  const cycleStart = new Date(cycle.periodStart);

  let monthsElapsed = 0;
  if (rules.contractStartDate) {
    const start = new Date(rules.contractStartDate);
    const elapsed =
      (cycleStart.getFullYear() - start.getFullYear()) * 12 +
      (cycleStart.getMonth() - start.getMonth());
    monthsElapsed = Math.max(0, elapsed);
  }

  const periodLength = freqToPeriod(rules.fixedChargeFrequency);
  const excessPeriod = freqToPeriod(rules.excessFrequency);

  const isFixedChargeDue =
    rules.fixedChargeFrequency === 'monthly' ||
    (rules.contractStartDate != null && monthsElapsed % periodLength === 0);

  let isExcessDue;
  let accumulatedCycles = [];
  switch (rules.excessFrequency) {
    case 'quarterly':
      isExcessDue = rules.contractStartDate != null && monthsElapsed % 3 === 2;
      accumulatedCycles = [];
      break;
    case 'semi_annual':
      isExcessDue = rules.contractStartDate != null && monthsElapsed % 6 === 5;
      accumulatedCycles = [];
      break;
    case 'annual':
      isExcessDue = rules.contractStartDate != null && monthsElapsed % 12 === 11;
      accumulatedCycles = [];
      break;
    default:
      isExcessDue = true;
  }

  const fixedChargeMultiplier = isFixedChargeDue ? periodLength : 0;

  const nextFixedChargeDate = isFixedChargeDue
    ? null
    : calculateNextFixedChargeDate(rules, cycle, monthsElapsed, periodLength);

  const nextExcessDate = isExcessDue
    ? null
    : calculateNextFixedChargeDate(
        { ...rules, fixedChargeFrequency: rules.excessFrequency },
        cycle,
        monthsElapsed,
        excessPeriod,
      );

  const fixedChargePeriodLength = periodLength;
  let monthInQuarter = null;
  let quarterStartDate = null;
  let quarterEndDate = null;
  let quarterNumber = null;

  if (periodLength > 1 && rules.contractStartDate) {
    const start = new Date(rules.contractStartDate);
    const posInPeriod = monthsElapsed % periodLength;
    monthInQuarter = posInPeriod + 1;
    quarterNumber = Math.floor(monthsElapsed / periodLength) + 1;

    // quarterStartDate = start of the current quarter (current billing month is the LAST month)
    // e.g. contractStart Jan 2026, Jun 2026 is Q2 end (monthsElapsed=5) → quarter started Apr 2026 (offset=3)
    const quarterOffset = Math.max(0, Math.floor(monthsElapsed / periodLength) * periodLength - (periodLength - 1));
    const qStart = new Date(start);
    qStart.setMonth(start.getMonth() + quarterOffset);
    qStart.setDate(1); // normalize to 1st so billing cycles (always period_start=1st) are compared correctly
    quarterStartDate = qStart.toISOString().slice(0, 10);

    const qEnd = new Date(qStart);
    qEnd.setMonth(qStart.getMonth() + periodLength - 1);
    quarterEndDate = qEnd.toISOString().slice(0, 10);
  }

  return {
    monthsElapsed,
    isFixedChargeDue,
    isExcessDue,
    fixedChargeMultiplier,
    fixedChargePeriodLength,
    accumulatedCycles,
    nextFixedChargeDate,
    nextExcessDate,
    groupingStrategy: rules.groupingStrategy,
    monthInQuarter,
    quarterStartDate,
    quarterEndDate,
    quarterNumber,
  };
}

function freqToPeriod(freq) {
  switch (freq) {
    case 'quarterly':   return 3;
    case 'semi_annual': return 6;
    case 'annual':      return 12;
    default:            return 1;
  }
}

function calculateNextFixedChargeDate(rules, cycle, monthsElapsed, periodLength) {
  if (!rules.contractStartDate) return null;
  const start = new Date(rules.contractStartDate);
  const nextDueMonth =
    Math.floor(monthsElapsed / periodLength) * periodLength + periodLength;
  const nextDate = new Date(start);
  nextDate.setMonth(start.getMonth() + nextDueMonth);
  return nextDate.toISOString().slice(0, 10);
}

// ── Grouping ──────────────────────────────────────────────────────────────────

function groupPrinters(printers, groupingStrategy, overrideInvoicing) {
  const overrideSeparate = overrideInvoicing !== 'combined' && overrideInvoicing !== 'merge';

  // Split override vs non-override printers for OSG contracts
  const hasAnyOverride = printers.some(p => p.hasOverride && p.contractType === 'osg');

  // If all PSG or grouping doesn't interact with overrides, treat as one bucket
  if (!hasAnyOverride || !overrideSeparate) {
    return buildGroups(printers, groupingStrategy);
  }

  // Override printers always get their own group (separate line items)
  const overridePrinters = printers.filter(p => p.hasOverride && p.contractType === 'osg');
  const regularPrinters  = printers.filter(p => !(p.hasOverride && p.contractType === 'osg'));

  const regularGroups  = buildGroups(regularPrinters, groupingStrategy);
  const overrideGroups = overridePrinters.map(p => ({
    key: `override_${p.printerId}`,
    printers: [p],
    meta: {
      type: 'osg_override',
      serialNumber: p.serialNumber,
      printerId: p.printerId,
      allBwOnly: p.isBwOnly ?? false,
      overrides: {
        fixedCharge:   p.priceOverride.fixedCharge   != null,
        bwPrice:       p.priceOverride.bwPrice        != null,
        colorPrice:    p.priceOverride.colorPrice     != null,
        minBwPages:    p.priceOverride.overrideMinBwPages    != null,
        minColorPages: p.priceOverride.overrideMinColorPages != null,
      },
    },
  }));

  return [...regularGroups, ...overrideGroups];
}

function buildGroups(printers, groupingStrategy) {
  if (!printers.length) return [];

  let keyFn;
  switch (groupingStrategy) {
    case 'city':     keyFn = p => p.city     ?? 'unknown'; break;
    case 'location': keyFn = p => p.location ?? 'unknown'; break;
    case 'printer':  keyFn = p => p.printerId;             break;
    default:         keyFn = () => 'default';              break; // contract
  }

  const buckets = groupBy(printers, keyFn);

  return Object.entries(buckets).map(([key, group]) => {
    const contractType = group[0]?.contractType ?? 'osg';
    const isPsgSimple  = contractType === 'psg_simple';
    const isPsg        = contractType === 'psg';
    const type = isPsg ? 'psg' : isPsgSimple ? 'psg_simple' : 'osg_default';

    const serialNumbers = group.map(p => p.serialNumber).filter(Boolean);
    const allBwOnly     = group.every(p => p.isBwOnly ?? false);

    const meta = { type, serialNumbers, allBwOnly };
    if (groupingStrategy !== 'contract') meta.groupKey = key;

    return { key, printers: group, meta };
  });
}

// ── Per-group billing ─────────────────────────────────────────────────────────

function calculateGroupBilling(group, contract) {
  const printers = group.printers;
  if (!printers.length) return { total: 0 };

  const contractType = printers[0]?.contractType ?? 'osg';
  const isPsgSimple  = contractType === 'psg_simple';
  const isPsg        = contractType === 'psg';

  if (isPsg) {
    const psgBreakdown = printers.reduce(
      (acc, p) => {
        acc.a4BwUsage    += p.psgBreakdown?.a4BwUsage    ?? 0;
        acc.a3BwUsage    += p.psgBreakdown?.a3BwUsage    ?? 0;
        acc.a4ColorUsage += p.psgBreakdown?.a4ColorUsage ?? 0;
        acc.a3ColorUsage += p.psgBreakdown?.a3ColorUsage ?? 0;
        return acc;
      },
      { a4BwUsage: 0, a3BwUsage: 0, a4ColorUsage: 0, a3ColorUsage: 0 },
    );
    return calculatePSGBilling(psgBreakdown, contract);
  }

  if (isPsgSimple) {
    const billable = printers.reduce(
      (acc, p) => {
        acc.billableBw    += p.billable.billableBw;
        acc.billableColor += p.billable.billableColor;
        return acc;
      },
      { billableBw: 0, billableColor: 0 },
    );
    return calculatePSGSimpleBilling(billable, contract);
  }

  // OSG — may be override printer (single printer with priceOverride)
  const isOverride = group.meta?.type === 'osg_override';
  const billable = printers.reduce(
    (acc, p) => {
      acc.billableBw    += p.billable.billableBw;
      acc.billableColor += p.billable.billableColor;
      return acc;
    },
    { billableBw: 0, billableColor: 0 },
  );

  let effectiveContract = contract;
  if (isOverride && printers[0]?.priceOverride) {
    const ov = printers[0].priceOverride;
    effectiveContract = {
      ...contract,
      fixedCharge:   ov.fixedCharge           ?? contract.fixedCharge,
      bwPrice:       ov.bwPrice               ?? contract.bwPrice,
      colorPrice:    ov.colorPrice            ?? contract.colorPrice,
      minBwPages:    ov.overrideMinBwPages    ?? contract.minBwPages,
      minColorPages: ov.overrideMinColorPages ?? contract.minColorPages,
    };
  }

  return calculateOSGBilling(billable, effectiveContract);
}

// ── Frequency adjustments ─────────────────────────────────────────────────────

function applyFrequencyRules(invoices, rules, rulesMeta) {
  if (rulesMeta.isFixedChargeDue && rulesMeta.isExcessDue) {
    // Default monthly path — apply multiplier to fixed charge if > 1
    const adjusted = invoices.map(inv => {
      if (rulesMeta.fixedChargeMultiplier <= 1) return inv;
      const b = inv.billing;
      if (b.fixedCharge == null) return inv;
      const multipliedFixed = b.fixedCharge * rulesMeta.fixedChargeMultiplier;
      return {
        ...inv,
        billing: { ...b, fixedCharge: multipliedFixed, total: b.total - b.fixedCharge + multipliedFixed },
      };
    });
    const grandTotal = adjusted.reduce((s, inv) => s + (inv.billing?.total ?? 0), 0);
    return { invoices: adjusted, grandTotal, rulesMeta };
  }

  const adjusted = invoices.map(inv => {
    const b = { ...inv.billing };

    if (!rulesMeta.isFixedChargeDue) {
      b.fixedCharge = 0;
      b.fixedChargeDeferred = true;
    } else if (rulesMeta.fixedChargeMultiplier > 1) {
      b.fixedCharge = (b.fixedCharge ?? 0) * rulesMeta.fixedChargeMultiplier;
    }

    if (!rulesMeta.isExcessDue) {
      b.bwCost        = 0;
      b.colorCost     = 0;
      b.excessDeferred = true;
    }

    b.total = (b.fixedCharge ?? 0) + (b.bwCost ?? 0) + (b.colorCost ?? 0);

    return { ...inv, billing: b };
  });

  const grandTotal = adjusted.reduce((s, inv) => s + (inv.billing?.total ?? 0), 0);
  return { invoices: adjusted, grandTotal, rulesMeta };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupBy(array, keyFn) {
  const result = {};
  for (const item of array) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}
