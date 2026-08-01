import * as XLSX from 'xlsx'

const COL_WIDTHS = {
  narrow:  8,
  medium:  14,
  wide:    20,
  serial:  16,
}

function s(v) { return v ?? '' }
function n(v) { return v != null ? Number(v) : '' }

function makeHeaderBlock(h) {
  return [
    ['Customer',        s(h.customerName)],
    ['Contract',        s(h.contractNumber) + (h.officialContractNumber ? `  (Ref: ${h.officialContractNumber})` : '')],
    ['Period',          s(h.period)],
    ['Dates',           `${s(h.periodStart)} → ${s(h.periodEnd)}`],
    ['Currency',        s(h.currency)],
    ['Status',          s(h.status).toUpperCase()],
    [],
  ]
}

// ── Sheet 1: per-printer readings ─────────────────────────────────────────────

function buildReadingsSheet(data) {
  const { header, contract, printers } = data
  const currency = header.currency

  const rows = [
    ...makeHeaderBlock(header),
    // Contract pricing reference
    ['Contract Pricing'],
    ['Fixed Charge', n(contract.fixedCharge), currency, 'BW Price', n(contract.bwPrice), currency, 'Color Price', n(contract.colorPrice), currency,
     'Min BW Pages', n(contract.minBwPages), '', 'Min Color Pages', n(contract.minColorPages)],
    [],
    // Column headers — two header rows to group sections
    ['', '', '', '', '', '',
     '─── Previous Counters ───', '', '', '',
     '─── Current Counters ───', '', '', '',
     '─── Pages Printed ───', '', '', '', '', '',
     '─── Minimums ─', '',
     '─── Excess ──', '',
     '─── Consumable Levels (%) ───', '', '', '', '', '', '',
     ''],
    [
      '#', 'Serial Number', 'Model', 'City', 'Location', 'Engineer',
      'Prev A4 BW', 'Prev A4 Color', 'Prev A3 BW', 'Prev A3 Color',
      'Curr A4 BW', 'Curr A4 Color', 'Curr A3 BW', 'Curr A3 Color',
      'A4 BW', 'A4 Color', 'A3 BW', 'A3 Color', 'Total BW', 'Total Color',
      'Min BW', 'Min Color',
      'BW Excess', 'Color Excess',
      'K (Black)', 'C (Cyan)', 'M (Magenta)', 'Y (Yellow)', 'R1', 'R2', 'R3', 'R4', 'Waste Toner',
      'Flagged', 'Flag Reason',
    ],
  ]

  let totalBwPrinted = 0, totalColorPrinted = 0

  printers.forEach((p, i) => {
    const pu = p.pagesUsed ?? {}
    totalBwPrinted    += pu.totalBw    ?? 0
    totalColorPrinted += pu.totalColor ?? 0
    const pc = p.prevCounters
    const cc = p.currCounters ?? {}
    const c  = p.consumables

    rows.push([
      i + 1,
      s(p.serialNumber),
      s(p.model),
      s(p.city),
      s(p.location),
      s(p.engineer),
      // previous counters
      pc ? n(pc.a4Bw) : 'Baseline', pc ? n(pc.a4Color) : '', pc ? n(pc.a3Bw) : '', pc ? n(pc.a3Color) : '',
      // current counters
      n(cc.a4Bw), n(cc.a4Color), n(cc.a3Bw), n(cc.a3Color),
      // pages printed
      n(pu.a4Bw), n(pu.a4Color), n(pu.a3Bw), n(pu.a3Color), n(pu.totalBw), n(pu.totalColor),
      // minimums
      p.effectiveMinBw != null ? n(p.effectiveMinBw) : '',
      p.effectiveMinColor != null ? n(p.effectiveMinColor) : '',
      // excess (billable = pages above minimum)
      n(p.billableBw), n(p.billableColor),
      // consumables
      c ? n(c.k) : '', c ? n(c.c) : '', c ? n(c.m) : '', c ? n(c.y) : '',
      c ? n(c.r1) : '', c ? n(c.r2) : '', c ? n(c.r3) : '', c ? n(c.r4) : '',
      c ? n(c.wasteTone) : '',
      // flag
      p.flagged ? 'YES' : '',
      s(p.flagReason),
    ])
  })

  // Totals row
  rows.push([])
  rows.push([
    'TOTAL', '', '', '', '', '',
    '', '', '', '',
    '', '', '', '',
    '', '', '', '', totalBwPrinted, totalColorPrinted,
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
  ])

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Column widths
  ws['!cols'] = [
    { wch: 4 }, { wch: COL_WIDTHS.serial }, { wch: COL_WIDTHS.medium },
    { wch: COL_WIDTHS.medium }, { wch: COL_WIDTHS.medium }, { wch: COL_WIDTHS.medium },
    ...Array(28).fill({ wch: COL_WIDTHS.narrow }),
    { wch: 6 }, { wch: 36 },
  ]

  return ws
}

// ── Sheet 2: billing breakdown ────────────────────────────────────────────────

function invoiceLabel(inv) {
  switch (inv.type) {
    case 'osg_default':  return 'Default Group'
    case 'osg_override': return `Per-Printer Override — ${inv.serialNumber ?? inv.printerId ?? ''}`
    case 'psg':          return 'PSG Contract'
    case 'psg_simple':   return 'PSG Simple Contract'
    case 'group_minimum_volume': return `Group Min-Volume — ${inv.billing?.groupName ?? ''}`
    default:             return inv.type ?? '—'
  }
}

function buildBillingSheet(data) {
  const { header, contract, invoices, grandTotal, manualBillingAmount } = data
  const currency = header.currency
  const fmt = v => (v != null ? Number(v) : '')

  const rows = [
    ...makeHeaderBlock(header),
    ['Contract Pricing Reference'],
    ['Fixed Charge', fmt(contract.fixedCharge), currency,
     'BW Price', fmt(contract.bwPrice), currency,
     'Color Price', fmt(contract.colorPrice), currency,
     'Min BW', fmt(contract.minBwPages), '',
     'Min Color', fmt(contract.minColorPages)],
    [],
    // Column headers
    ['Invoice', 'Description / Serial', 'BW Pages', 'Color Pages', 'BW Price', 'Color Price',
     'BW Cost', 'Color Cost', 'Fixed Charge', 'Total', 'Currency'],
  ]

  for (const inv of invoices) {
    const b = inv.billing ?? {}
    rows.push([
      invoiceLabel(inv),
      inv.type === 'osg_override' ? (inv.serialNumber ?? '') : '',
      fmt(b.bwPages ?? b.bwCost != null ? undefined : undefined), // may not have pages
      '',
      fmt(b.bwPrice ?? contract.bwPrice),
      fmt(b.colorPrice ?? contract.colorPrice),
      fmt(b.bwCost),
      fmt(b.colorCost),
      fmt(b.fixedCharge),
      fmt(b.total),
      currency,
    ])
  }

  rows.push([])
  if (manualBillingAmount != null) {
    rows.push(['Manual Billing Override', '', '', '', '', '', '', '', '', fmt(manualBillingAmount), currency])
  }
  rows.push(['GRAND TOTAL', '', '', '', '', '', '', '', '', fmt(manualBillingAmount ?? grandTotal), currency])

  const ws = XLSX.utils.aoa_to_sheet(rows)

  ws['!cols'] = [
    { wch: 36 }, { wch: COL_WIDTHS.serial },
    { wch: COL_WIDTHS.narrow }, { wch: COL_WIDTHS.narrow },
    { wch: COL_WIDTHS.narrow }, { wch: COL_WIDTHS.narrow },
    { wch: COL_WIDTHS.medium }, { wch: COL_WIDTHS.medium },
    { wch: COL_WIDTHS.medium }, { wch: COL_WIDTHS.medium },
    { wch: 8 },
  ]

  return ws
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateBillingAuditExcel(data) {
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, buildReadingsSheet(data), 'Readings')
  XLSX.utils.book_append_sheet(wb, buildBillingSheet(data),  'Billing')

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
