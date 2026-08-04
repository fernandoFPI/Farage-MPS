import * as repo from '../repositories/contractRepository.js';
import * as cpRepo from '../repositories/contractPrinterRepository.js';
import { getDefaultRules } from '../utils/invoiceRulesEngine.js';

const VALID_BILLING_TYPES = ['per_click', 'minimum_volume'];
const VALID_CONTRACT_MODES = ['osg', 'psg', 'psg_simple'];
const SERVICE_TYPES = {
  osg:        ['MPS', 'FSMA', 'LS', 'LO'],
  psg:        ['FSMA', 'SMA', 'LO'],
  psg_simple: ['FSMA', 'SMA', 'LO'],
};

const VALID_FREQ = ['monthly', 'quarterly', 'semi_annual', 'annual'];
const VALID_OVERRIDE_INVOICING = ['separate', 'combined'];
const VALID_GROUPING = ['contract', 'city', 'location', 'printer'];
const VALID_BREAKDOWN_STYLE = ['monthly', 'quarterly_total'];
const VALID_FIXED_CHARGE_SCOPE = ['contract', 'per_printer'];
const VALID_ORDER_SPLIT        = ['single', 'fixed_separate', 'all_separate'];

function validateInvoiceRules(rules) {
  if (!rules || typeof rules !== 'object') return;
  // Normalize legacy value stored in existing records
  if (rules.overrideInvoicing === 'merge') {
    rules.overrideInvoicing = 'combined';
  }
  const { fixedChargeFrequency, excessFrequency, overrideInvoicing, groupingStrategy, fixedChargeScope, odooOrderSplit, contractStartDate, quarterlyBreakdownStyle } = rules;
  if (fixedChargeFrequency && !VALID_FREQ.includes(fixedChargeFrequency)) {
    const err = new Error('invoiceRules.fixedChargeFrequency must be monthly, quarterly, semi_annual, or annual');
    err.status = 400; throw err;
  }
  if (excessFrequency && !VALID_FREQ.includes(excessFrequency)) {
    const err = new Error('invoiceRules.excessFrequency must be monthly, quarterly, semi_annual, or annual');
    err.status = 400; throw err;
  }
  if (overrideInvoicing && !VALID_OVERRIDE_INVOICING.includes(overrideInvoicing)) {
    const err = new Error('invoiceRules.overrideInvoicing must be separate or combined');
    err.status = 400; throw err;
  }
  if (groupingStrategy && !VALID_GROUPING.includes(groupingStrategy)) {
    const err = new Error('invoiceRules.groupingStrategy must be contract, city, location, or printer');
    err.status = 400; throw err;
  }
  if (quarterlyBreakdownStyle && !VALID_BREAKDOWN_STYLE.includes(quarterlyBreakdownStyle)) {
    const err = new Error('invoiceRules.quarterlyBreakdownStyle must be monthly or quarterly_total');
    err.status = 400; throw err;
  }
  if (fixedChargeScope && !VALID_FIXED_CHARGE_SCOPE.includes(fixedChargeScope)) {
    const err = new Error('invoiceRules.fixedChargeScope must be contract or per_printer');
    err.status = 400; throw err;
  }
  if (odooOrderSplit && !VALID_ORDER_SPLIT.includes(odooOrderSplit)) {
    const err = new Error('invoiceRules.odooOrderSplit must be single, fixed_separate, or all_separate');
    err.status = 400; throw err;
  }
  const needsStartDate =
    (fixedChargeFrequency && fixedChargeFrequency !== 'monthly') ||
    (excessFrequency && excessFrequency !== 'monthly');
  if (needsStartDate && !contractStartDate) {
    const err = new Error('invoiceRules.contractStartDate is required when frequency is not monthly');
    err.status = 400; throw err;
  }
}

// Apply PSG/OSG field constraints — returns normalised data object
function applyModeConstraints(data) {
  const mode = data.contractMode ?? 'osg';
  if (!VALID_CONTRACT_MODES.includes(mode)) {
    const err = new Error('contractMode must be osg, psg, or psg_simple');
    err.status = 400;
    throw err;
  }

  if (mode === 'psg') {
    // PSG: always per_click, all OSG price fields zeroed
    if (data.a4Price != null && Number(data.a4Price) <= 0) {
      const err = new Error('a4Price is required and must be > 0 for PSG contracts');
      err.status = 400;
      throw err;
    }
    if (data.a3Price != null && Number(data.a3Price) <= 0) {
      const err = new Error('a3Price is required and must be > 0 for PSG contracts');
      err.status = 400;
      throw err;
    }
    return {
      ...data,
      contractMode: 'psg',
      billingType: 'per_click',
      fixedCharge: 0,
      bwPrice: 0,
      colorPrice: 0,
      excessBwPrice: 0,
      excessColorPrice: 0,
      minBwPages: 0,
      minColorPages: 0,
    };
  }

  if (mode === 'psg_simple') {
    // PSG Simple: a4Price only (same price for BW and Color), a3Price forced to 0
    if (data.a4Price != null && Number(data.a4Price) <= 0) {
      const err = new Error('a4Price is required and must be > 0 for PSG Simple contracts');
      err.status = 400;
      throw err;
    }
    return {
      ...data,
      contractMode: 'psg_simple',
      billingType: 'per_click',
      fixedCharge: 0,
      bwPrice: 0,
      colorPrice: 0,
      excessBwPrice: 0,
      excessColorPrice: 0,
      minBwPages: 0,
      minColorPages: 0,
      a3Price: 0,
    };
  }

  // OSG: zero out PSG-specific fields
  return {
    ...data,
    contractMode: 'osg',
    a4Price: 0,
    a3Price: 0,
  };
}

export async function listContracts(query) {
  const filter = {};
  if (query.customerId) filter.customerId = query.customerId;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.contractMode) filter.contractMode = query.contractMode;
  if (query.serviceType) filter.serviceType = query.serviceType;
  return repo.findAll(filter);
}

export async function createContract(data) {
  const { customerId, contractNumber, startDate } = data;
  const mode = data.contractMode ?? 'osg';

  if (!customerId || !contractNumber || !startDate) {
    const err = new Error('customerId, contractNumber, and startDate are required');
    err.status = 400;
    throw err;
  }

  const normalised = applyModeConstraints({ ...data, contractMode: mode });

  // billingType required for OSG; PSG/PSG-Simple forces per_click
  if (normalised.contractMode === 'osg' && !normalised.billingType) {
    const err = new Error('billingType is required for OSG contracts');
    err.status = 400;
    throw err;
  }

  if (normalised.billingType && !VALID_BILLING_TYPES.includes(normalised.billingType)) {
    const err = new Error('billingType must be per_click or minimum_volume');
    err.status = 400;
    throw err;
  }

  if (data.endDate && new Date(data.endDate) <= new Date(startDate)) {
    const err = new Error('endDate must be after startDate');
    err.status = 400;
    throw err;
  }

  if (normalised.invoiceRules !== undefined) {
    validateInvoiceRules(normalised.invoiceRules);
    normalised.invoiceRules = { ...getDefaultRules(), ...normalised.invoiceRules };
  }

  if (normalised.serviceType) {
    const allowed = SERVICE_TYPES[normalised.contractMode] ?? [];
    if (!allowed.includes(normalised.serviceType)) {
      const err = new Error(`serviceType must be one of: ${allowed.join(', ')} for ${normalised.contractMode} contracts`);
      err.status = 400;
      throw err;
    }
  }

  const VALID_COMPANIES = ['FPI', 'AL Farage'];
  if (!normalised.odooCompany || !VALID_COMPANIES.includes(normalised.odooCompany)) {
    const err = new Error('odooCompany is required and must be one of: FPI, AL Farage');
    err.status = 400;
    throw err;
  }

  const numExists = await repo.contractNumberExists(contractNumber);
  if (numExists) {
    const err = new Error('Contract number already exists');
    err.status = 409;
    throw err;
  }

  const custExists = await repo.customerExists(customerId);
  if (!custExists) {
    const err = new Error('Customer not found');
    err.status = 400;
    throw err;
  }

  return repo.create(normalised);
}

export async function getContractById(id) {
  const contract = await repo.findById(id);
  if (!contract) {
    const err = new Error('Contract not found');
    err.status = 404;
    throw err;
  }
  return contract;
}

export async function updateContract(id, fields) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Contract not found');
    err.status = 404;
    throw err;
  }

  // Merge mode: use incoming contractMode if provided, else keep existing
  const merged = { ...existing, ...fields };
  const normalised = applyModeConstraints(merged);

  if (normalised.billingType && !VALID_BILLING_TYPES.includes(normalised.billingType)) {
    const err = new Error('billingType must be per_click or minimum_volume');
    err.status = 400;
    throw err;
  }

  if (fields.invoiceRules !== undefined) {
    validateInvoiceRules(fields.invoiceRules);
    normalised.invoiceRules = { ...getDefaultRules(), ...(existing.invoiceRules ?? {}), ...fields.invoiceRules };
  }

  if (normalised.serviceType) {
    const allowed = SERVICE_TYPES[normalised.contractMode] ?? [];
    if (!allowed.includes(normalised.serviceType)) {
      const err = new Error(`serviceType must be one of: ${allowed.join(', ')} for ${normalised.contractMode} contracts`);
      err.status = 400;
      throw err;
    }
  }

  if (fields.odooCompany !== undefined) {
    const VALID_COMPANIES = ['FPI', 'AL Farage'];
    if (!fields.odooCompany || !VALID_COMPANIES.includes(fields.odooCompany)) {
      const err = new Error('odooCompany must be one of: FPI, AL Farage');
      err.status = 400;
      throw err;
    }
  }

  const startDate = normalised.startDate ?? existing.startDate;
  const endDate = normalised.endDate !== undefined ? normalised.endDate : existing.endDate;
  if (endDate && new Date(endDate) <= new Date(startDate)) {
    const err = new Error('endDate must be after startDate');
    err.status = 400;
    throw err;
  }

  return repo.update(id, normalised);
}

export async function deleteContract(id) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Contract not found');
    err.status = 404;
    throw err;
  }

  const hasCycles = await repo.hasBillingCycles(id);
  if (hasCycles) {
    const err = new Error('Contract has billing history');
    err.status = 400;
    throw err;
  }

  await cpRepo.deleteByContractId(id);
  await repo.deleteById(id);
  return { message: 'Contract deleted' };
}
