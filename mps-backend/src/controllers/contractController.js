import * as service from '../services/contractService.js';

const FINANCIAL_FIELDS = [
  'fixedCharge', 'bwPrice', 'colorPrice',
  'minBwPages', 'minColorPages', 'excessBwPrice', 'excessColorPrice',
  'a4Price', 'a3Price', 'invoiceRules',
];

const PRINTER_FINANCIAL_FIELDS = [
  'fixedCharge', 'bwPrice', 'colorPrice',
  'overrideMinBwPages', 'overrideMinColorPages',
];

function stripFinancials(contract) {
  const c = { ...contract };
  for (const f of FINANCIAL_FIELDS) delete c[f];
  if (c.printers) {
    c.printers = c.printers.map(cp => {
      const p = { ...cp };
      for (const f of PRINTER_FINANCIAL_FIELDS) delete p[f];
      return p;
    });
  }
  return c;
}

export async function list(req, res, next) {
  try {
    const result = await service.listContracts(req.query);
    const canViewFinancial = req.user?.role?.can_view_contract_pricing !== false;
    res.json(canViewFinancial ? result : result.map(stripFinancials));
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    res.status(201).json(await service.createContract(req.body));
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    const result = await service.getContractById(req.params.id);
    const canViewFinancial = req.user?.role?.can_view_contract_pricing !== false;
    res.json(canViewFinancial ? result : stripFinancials(result));
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    res.json(await service.updateContract(req.params.id, req.body));
  } catch (err) { next(err); }
}

export async function remove(req, res, next) {
  try {
    res.json(await service.deleteContract(req.params.id));
  } catch (err) { next(err); }
}
