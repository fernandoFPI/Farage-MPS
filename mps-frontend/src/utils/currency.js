export function formatAmount(amount, currency = 'IQD') {
  if (amount === null || amount === undefined) return '—'
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + ' USD'
  }
  return new Intl.NumberFormat('en-IQ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(amount) + ' IQD'
}

export function formatIQD(amount) {
  return formatAmount(amount, 'IQD')
}

export function formatNumber(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('en').format(n)
}
