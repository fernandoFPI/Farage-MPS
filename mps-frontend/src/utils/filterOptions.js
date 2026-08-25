import i18n from '../i18n'

export function customerOptions(customers) {
  return [
    { value: null, label: i18n.t('common.allCustomers') },
    ...customers.map(c => ({ value: c.id, label: c.name })),
  ]
}

export function contractOptions(contracts) {
  return [
    { value: null, label: i18n.t('common.allContracts') },
    ...contracts.map(c => ({
      value: c.id,
      label: `${c.contractNumber} — ${c.customerName ?? c.customer?.name ?? ''}`,
      group: c.customerName ?? c.customer?.name ?? '',
    })),
  ]
}

export function billingCycleOptions(cycles) {
  return [
    { value: null, label: i18n.t('common.allCycles') },
    ...cycles.map(c => ({
      value: c.id,
      label: c.cycleName ?? `${c.contractNumber} — ${c.periodStart?.slice(0, 7)}`,
      group: c.customerName ?? c.cycleName?.split(' — ')[0] ?? '',
    })),
  ]
}

export function printerOptions(printers, { includeInactive = false } = {}) {
  const filtered = includeInactive ? printers : printers.filter(p => p.isActive !== false)
  return [
    { value: null, label: i18n.t('common.allPrinters') },
    ...filtered.map(p => ({
      value: p.id,
      label: `${p.serialNumber} — ${p.model}`,
    })),
  ]
}
