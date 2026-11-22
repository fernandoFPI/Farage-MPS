// Abnormal-jump detection for customer stock.
//
// Stock is the quantity of consumables sitting at the customer. A fall is normal consumption;
// a big rise is either a delivery or a typing error, so it is flagged for a reviewer to
// acknowledge (or adjust) before the cycle's stock is confirmed.
//
// Calibrated on production history (132 consecutive snapshot pairs: median change 0, p99 +9,
// one real typo 4 -> 175): a rise of at least 10 units AND at least 3x the previous level
// (or any such rise from 0) flags roughly 1-3 entries in total.
export const STOCK_ANOMALY_RULES = { minRise: 10, multiplier: 3 };

// The nine stored quantities, grouped the way people think about them.
export const STOCK_GROUPS = {
  toner: ['cQty', 'mQty', 'yQty', 'kQty'],
  drums: ['r1Qty', 'r2Qty', 'r3Qty', 'r4Qty'],
  waste: ['wasteTonQty'],
};

export const STOCK_QTY_KEYS = Object.values(STOCK_GROUPS).flat();

export function groupTotals(q) {
  const out = {};
  for (const [group, keys] of Object.entries(STOCK_GROUPS)) {
    out[group] = keys.reduce((s, k) => s + (Number(q?.[k]) || 0), 0);
  }
  return out;
}

// previous/current: objects carrying the nine *Qty keys. No previous snapshot -> nothing to compare -> null.
// Returns null, or { kinds: [{ key, previous, current, rise }] } with one entry per flagged group.
export function detectStockAnomaly(previous, current, rules = STOCK_ANOMALY_RULES) {
  if (!previous || !current) return null;
  const before = groupTotals(previous);
  const after = groupTotals(current);
  const kinds = [];
  for (const key of Object.keys(STOCK_GROUPS)) {
    const rise = after[key] - before[key];
    if (rise >= rules.minRise && (before[key] === 0 || after[key] >= rules.multiplier * before[key])) {
      kinds.push({ key, previous: before[key], current: after[key], rise });
    }
  }
  return kinds.length > 0 ? { kinds } : null;
}
