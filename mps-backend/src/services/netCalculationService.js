// Pure functions only — no DB, no Express imports.

// Step 1: calculate this month's cumulative excess from raw counter difference.
export function calculateOSGNet(current, previous) {
  const excessA4Bw    = current.a4Bw    - previous.a4Bw;
  const excessA3Bw    = current.a3Bw    - previous.a3Bw;
  const excessA4Color = current.a4Color - previous.a4Color;
  const excessA3Color = current.a3Color - previous.a3Color;
  return {
    excessA4Bw, excessA3Bw, excessA4Color, excessA3Color,
    excessBw:    excessA4Bw + excessA3Bw,
    excessColor: excessA4Color + excessA3Color,
  };
}

// Step 1 (PSG): derive net counters from both raw readings, then subtract.
export function calculatePSGNet(current, previousRaw) {
  const a4BwNet    = current.a4Bw - current.a3Bw;
  const a3BwNet    = current.a3Bw;
  const a4ColorNet = (current.a4Color - current.xls) - current.a3Color;
  const a3ColorNet = current.a3Color;

  const prevA4BwNet    = previousRaw.a4Bw - previousRaw.a3Bw;
  const prevA3BwNet    = previousRaw.a3Bw;
  const prevA4ColorNet = (previousRaw.a4Color - previousRaw.xls) - previousRaw.a3Color;
  const prevA3ColorNet = previousRaw.a3Color;

  const excessA4Bw    = a4BwNet    - prevA4BwNet;
  const excessA3Bw    = a3BwNet    - prevA3BwNet;
  const excessA4Color = a4ColorNet - prevA4ColorNet;
  const excessA3Color = a3ColorNet - prevA3ColorNet;

  return {
    excessA4Bw, excessA3Bw, excessA4Color, excessA3Color,
    excessBw:    excessA4Bw + excessA3Bw,
    excessColor: excessA4Color + excessA3Color,
    // Store current net values for display purposes
    a4BwNet, a3BwNet, a4ColorNet, a3ColorNet,
  };
}

// Step 2: bill only the GROWTH in cumulative excess since last month.
// If no previous reading exists this is the baseline — nothing to bill.
export function calculateBillableUsage(currentExcess, previousExcess) {
  if (!previousExcess) {
    return { billableBw: 0, billableColor: 0, isBaseline: true };
  }
  const rawBillableBw    = currentExcess.excessBw    - previousExcess.excessBw;
  const rawBillableColor = currentExcess.excessColor - previousExcess.excessColor;
  return {
    billableBw:    Math.max(0, rawBillableBw),
    billableColor: Math.max(0, rawBillableColor),
    isBaseline:    false,
    negativeFlag:  rawBillableBw < 0 || rawBillableColor < 0,
  };
}

export function validateUsage(currentExcess, historicalExcesses) {
  if (currentExcess.excessBw < 0 || currentExcess.excessColor < 0) {
    return { valid: false, reason: 'Negative excess detected — possible meter reset or data entry error' };
  }

  if (historicalExcesses.length >= 3) {
    const avgBw    = historicalExcesses.reduce((s, e) => s + e.excessBw,    0) / historicalExcesses.length;
    const avgColor = historicalExcesses.reduce((s, e) => s + e.excessColor, 0) / historicalExcesses.length;
    if (currentExcess.excessBw > 3 * avgBw || currentExcess.excessColor > 3 * avgColor) {
      return { valid: false, reason: 'Usage spike detected — exceeds 3x historical average' };
    }
  }

  return { valid: true };
}

export function calculateOSGBilling(billableUsage, contract) {
  const { billableBw, billableColor } = billableUsage;
  const { billingType, fixedCharge, bwPrice, colorPrice, minBwPages, minColorPages } = contract;

  if (billingType === 'per_click') {
    const bwCost    = billableBw    * bwPrice;
    const colorCost = billableColor * colorPrice;
    const total     = bwCost + colorCost + fixedCharge;
    return { billingType, bwUnits: billableBw, bwPrice, bwCost, colorUnits: billableColor, colorPrice, colorCost, fixedCharge, total };
  }

  // minimum_volume — BW and Color checked independently against their own minimums
  const bwExcess    = Math.max(0, billableBw    - minBwPages);
  const colorExcess = Math.max(0, billableColor - minColorPages);
  const bwCost      = bwExcess    * bwPrice;
  const colorCost   = colorExcess * colorPrice;
  const total       = fixedCharge + bwCost + colorCost;

  return {
    billingType: 'minimum_volume',
    bwPages:      billableBw,
    bwMinimum:    minBwPages,
    bwExcess,
    bwPrice,
    bwCost,
    colorPages:   billableColor,
    colorMinimum: minColorPages,
    colorExcess,
    colorPrice,
    colorCost,
    fixedCharge,
    total,
  };
}

export function calculatePSGBilling(usage, contract) {
  const { a4BwUsage, a3BwUsage, a4ColorUsage, a3ColorUsage } = usage;
  const { a4Price, a3Price } = contract;
  const totalA4 = a4BwUsage + a4ColorUsage;
  const totalA3 = a3BwUsage + a3ColorUsage;
  const a4Cost  = totalA4 * a4Price;
  const a3Cost  = totalA3 * a3Price;
  const total   = a4Cost + a3Cost;
  return {
    billingType: 'psg',
    a4BwUsage, a3BwUsage, a4ColorUsage, a3ColorUsage,
    totalA4, totalA3,
    a4Price, a3Price,
    a4Cost, a3Cost,
    total,
  };
}

// PSG Simple: A4 counter subtraction only; both BW and Color billed at same a4Price
export function calculatePSGSimpleNet(current, previous) {
  const excessA4Bw    = current.a4Bw    - previous.a4Bw;
  const excessA4Color = current.a4Color - previous.a4Color;
  return {
    excessA4Bw, excessA3Bw: 0, excessA4Color, excessA3Color: 0,
    excessBw:    excessA4Bw,
    excessColor: excessA4Color,
  };
}

export function calculatePSGSimpleBilling(billableUsage, contract) {
  const { billableBw, billableColor } = billableUsage;
  const { a4Price } = contract;
  const bwCost    = billableBw    * a4Price;
  const colorCost = billableColor * a4Price;
  const total     = bwCost + colorCost;
  return { billingType: 'psg_simple', bwUnits: billableBw, colorUnits: billableColor, a4Price, bwCost, colorCost, total };
}

// Grouped minimum-volume billing: group-level excess check
// contractSummaries: [{ contractId, billableBw, billableColor, fixedCharge, bwPrice, colorPrice, minBwPages, minColorPages }]
// group: { groupMinBw, groupMinColor }
export function calculateGroupedMinVolumeBilling(contractSummaries, group) {
  const { groupMinBw, groupMinColor } = group;
  const totalBw    = contractSummaries.reduce((s, c) => s + c.billableBw,    0);
  const totalColor = contractSummaries.reduce((s, c) => s + c.billableColor, 0);
  const contractExcesses = contractSummaries.map(c => ({
    bwExcess: Math.max(0, c.billableBw - c.minBwPages),
    colorExcess: Math.max(0, c.billableColor - c.minColorPages),
  }));
  const pooledBwExcess = contractExcesses.reduce((s, c) => s + c.bwExcess, 0);
  const pooledColorExcess = contractExcesses.reduce((s, c) => s + c.colorExcess, 0);
  const groupBwExceeded = pooledBwExcess > groupMinBw;
  const groupColorExceeded = pooledColorExcess > groupMinColor;

  const results = contractSummaries.map((c, i) => ({
    contractId: c.contractId,
    billableBw: c.billableBw,
    billableColor: c.billableColor,
    fixedCharge: c.fixedCharge,
    bwExcess: contractExcesses[i].bwExcess,
    colorExcess: contractExcesses[i].colorExcess,
    bwCost: 0,
    colorCost: 0,
    total: c.fixedCharge,
    isBreachingContract: false,
  }));

  if (!groupBwExceeded && !groupColorExceeded) {
    return {
      groupBwExceeded: false,
      groupColorExceeded: false,
      totalBw,
      totalColor,
      groupMinBw,
      groupMinColor,
      pooledBwExcess,
      pooledColorExcess,
      contracts: results,
    };
  }

  // Find the contract with the highest combined individual excess.
  let breachIdx = 0;
  let highestExcess = -Infinity;
  for (let i = 0; i < contractExcesses.length; i++) {
    const totalExcess = contractExcesses[i].bwExcess + contractExcesses[i].colorExcess;
    if (totalExcess > highestExcess) {
      highestExcess = totalExcess;
      breachIdx = i;
    }
  }

  const groupBwExcess = groupBwExceeded ? Math.max(0, pooledBwExcess - groupMinBw) : 0;
  const groupColorExcess = groupColorExceeded ? Math.max(0, pooledColorExcess - groupMinColor) : 0;
  const breachingContract = contractSummaries[breachIdx];
  const breachBwCost = groupBwExcess * breachingContract.bwPrice;
  const breachColorCost = groupColorExcess * breachingContract.colorPrice;

  results[breachIdx].bwCost = breachBwCost;
  results[breachIdx].colorCost = breachColorCost;
  results[breachIdx].total = breachingContract.fixedCharge + breachBwCost + breachColorCost;
  results[breachIdx].isBreachingContract = true;
  results[breachIdx].groupBwExcess = groupBwExcess;
  results[breachIdx].groupColorExcess = groupColorExcess;

  return {
    groupBwExceeded,
    groupColorExceeded,
    totalBw,
    totalColor,
    groupMinBw,
    groupMinColor,
    pooledBwExcess,
    pooledColorExcess,
    groupBwExcess,
    groupColorExcess,
    contracts: results,
  };
}
