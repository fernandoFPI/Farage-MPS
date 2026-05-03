export const COLOR_CONSUMABLES = ['C', 'M', 'Y', 'K', 'R1', 'R2', 'R3', 'R4', 'wasteToner']
export const BW_CONSUMABLES    = ['K', 'R1', 'wasteToner']

export function getConsumablesForPrinter(isBwOnly) {
  return isBwOnly ? BW_CONSUMABLES : COLOR_CONSUMABLES
}

// Map consumable key → field name in the API object
export const CONSUMABLE_FIELD_MAP = {
  C:          { pctKey: 'cPct',         qtyKey: 'cQty',        labelKey: 'consumables.cyan' },
  M:          { pctKey: 'mPct',         qtyKey: 'mQty',        labelKey: 'consumables.magenta' },
  Y:          { pctKey: 'yPct',         qtyKey: 'yQty',        labelKey: 'consumables.yellow' },
  K:          { pctKey: 'kPct',         qtyKey: 'kQty',        labelKey: 'consumables.black' },
  R1:         { pctKey: 'r1Pct',        qtyKey: 'r1Qty',       labelKey: 'consumables.r1' },
  R2:         { pctKey: 'r2Pct',        qtyKey: 'r2Qty',       labelKey: 'consumables.r2' },
  R3:         { pctKey: 'r3Pct',        qtyKey: 'r3Qty',       labelKey: 'consumables.r3' },
  R4:         { pctKey: 'r4Pct',        qtyKey: 'r4Qty',       labelKey: 'consumables.r4' },
  wasteToner: { pctKey: 'wasteTonePct', qtyKey: 'wasteTonQty', labelKey: 'consumables.wasteToner' },
}
