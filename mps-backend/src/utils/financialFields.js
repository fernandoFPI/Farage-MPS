// Single source of truth for which fields carry dollar amounts, so every
// controller that can expose contract/printer pricing strips the same set.
export const CONTRACT_FINANCIAL_FIELDS = [
  'fixedCharge', 'bwPrice', 'colorPrice',
  'minBwPages', 'minColorPages', 'excessBwPrice', 'excessColorPrice',
  'a4Price', 'a3Price', 'invoiceRules',
];

export const PRINTER_FINANCIAL_FIELDS = [
  'fixedCharge', 'bwPrice', 'colorPrice',
  'overrideMinBwPages', 'overrideMinColorPages',
];

export function canViewPricing(req) {
  return req.user?.role?.can_view_contract_pricing === true;
}

export function omitFields(obj, fields) {
  if (!obj) return obj;
  const copy = { ...obj };
  for (const f of fields) delete copy[f];
  return copy;
}

export function stripContractFinancials(contract) {
  if (!contract) return contract;
  const c = omitFields(contract, CONTRACT_FINANCIAL_FIELDS);
  if (Array.isArray(c.printers)) {
    c.printers = c.printers.map((p) => omitFields(p, PRINTER_FINANCIAL_FIELDS));
  }
  return c;
}

export function stripPrinterFinancials(printer) {
  return omitFields(printer, PRINTER_FINANCIAL_FIELDS);
}
