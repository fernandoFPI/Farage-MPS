import ExcelJS from 'exceljs'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  // Title bar
  titleBg:   '1F3864',
  titleFg:   'FFFFFF',
  // Info bar (contract / period)
  infoBg:    'D6DCE4',
  infoFg:    '1F3864',
  // Black Impressions section
  bwHdrBg:   '2E75B6',
  bwHdrFg:   'FFFFFF',
  bwSubBg:   'BDD7EE',
  bwSubFg:   '1F3864',
  bwDataBg:  'DEEAF1',
  // Color Impressions section
  clrHdrBg:  'C55A11',
  clrHdrFg:  'FFFFFF',
  clrSubBg:  'FCE4D6',
  clrSubFg:  '843C0C',
  clrDataBg: 'FBE5D6',
  // Total Impressions section
  totHdrBg:  '375623',
  totHdrFg:  'FFFFFF',
  totSubBg:  'E2EFDA',
  totSubFg:  '375623',
  totDataBg: 'EBF3E8',
  // Left info columns
  leftHdrBg: '595959',
  leftHdrFg: 'FFFFFF',
  leftDataBg:'F2F2F2',
  // Totals row
  totalBg:   '404040',
  totalFg:   'FFFFFF',
}

function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function font(argb, bold = false, size = 10) {
  return { name: 'Calibri', size, bold, color: { argb } }
}

function border(style = 'thin') {
  const s = { style }
  return { top: s, left: s, bottom: s, right: s }
}

function fmtDate(val) {
  if (!val) return ''
  const d = new Date(val)
  if (isNaN(d)) return ''
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function n(v) { return v != null ? Number(v) : 0 }

// ── Column layout ─────────────────────────────────────────────────────────────
// A–E  : info columns
// F–L  : Black Printed Impressions (7 cols)
// M–S  : Color Printed Impressions (7 cols)
// T–Z  : Total Printed Impressions (7 cols)
const TOTAL_COLS = 26  // A–Z

function colLetter(idx) {          // 0-based → 'A', 'B', …, 'Z'
  return String.fromCharCode(65 + idx)
}

function applyHeaderStyle(cell, bgArgb, fgArgb, bold = true) {
  cell.fill   = fill(bgArgb)
  cell.font   = font(fgArgb, bold, 10)
  cell.border = border()
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
}

function applyDataStyle(cell, bgArgb) {
  cell.fill   = fill(bgArgb)
  cell.font   = font('000000', false, 10)
  cell.border = border()
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
}

// ── Sheet builder ─────────────────────────────────────────────────────────────
function buildSheet(wb, data) {
  const { header, contract, printers } = data
  const ws = wb.addWorksheet('Billing Audit')

  // Column widths (A=0 … Z=25)
  const widths = [
    22, // A: Account Name
    14, // B: Manufacturer
    18, // C: Model
    16, // D: Serial Number
    22, // E: Location
    // BW (F–L)
    14, 12, 12, 14, 12, 12, 10,
    // Color (M–S)
    14, 12, 12, 14, 12, 12, 10,
    // Total (T–Z)
    14, 12, 12, 14, 12, 12, 10,
  ]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  const lastCol = colLetter(TOTAL_COLS - 1) // 'Z'

  // ── Row 1: Title ────────────────────────────────────────────────────────────
  ws.mergeCells(`A1:${lastCol}1`)
  const titleCell = ws.getCell('A1')
  titleCell.value = `Billing Audit Report  ·  ${header.customerName}  ·  ${header.period}`
  titleCell.fill      = fill(C.titleBg)
  titleCell.font      = font(C.titleFg, true, 13)
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 22

  // ── Row 2: Contract info ────────────────────────────────────────────────────
  ws.mergeCells(`A2:${lastCol}2`)
  const infoCell = ws.getCell('A2')
  const contractRef = header.officialContractNumber
    ? `${header.contractNumber} (Ref: ${header.officialContractNumber})`
    : header.contractNumber
  infoCell.value = `Contract: ${contractRef}   |   Period: ${header.periodStart} → ${header.periodEnd}   |   Currency: ${header.currency}   |   Status: ${header.status.toUpperCase()}`
  infoCell.fill      = fill(C.infoBg)
  infoCell.font      = font(C.infoFg, false, 10)
  infoCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 16

  // ── Row 3: Contract pricing reference ───────────────────────────────────────
  ws.mergeCells(`A3:${lastCol}3`)
  const pricingCell = ws.getCell('A3')
  pricingCell.value = `Fixed Charge: ${n(contract.fixedCharge).toLocaleString()} ${header.currency}   |   BW Price: ${n(contract.bwPrice).toLocaleString()}   |   Color Price: ${n(contract.colorPrice).toLocaleString()}   |   Min BW Pages: ${n(contract.minBwPages).toLocaleString()}   |   Min Color Pages: ${n(contract.minColorPages).toLocaleString()}`
  pricingCell.fill      = fill('F2F2F2')
  pricingCell.font      = font('595959', false, 9)
  pricingCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(3).height = 14

  // ── Row 4: Section group headers ────────────────────────────────────────────
  ws.getRow(4).height = 18

  // Left 5 columns — span rows 4-5
  const leftHeaders = ['Account Name', 'Manufacturer', 'Model Name', 'Serial Number', 'Location']
  leftHeaders.forEach((label, i) => {
    ws.mergeCells(4, i + 1, 5, i + 1)
    const cell = ws.getCell(4, i + 1)
    cell.value = label
    applyHeaderStyle(cell, C.leftHdrBg, C.leftHdrFg)
  })

  // BW section header: cols F–L (6–12)
  ws.mergeCells(4, 6, 4, 12)
  const bwHdr = ws.getCell(4, 6)
  bwHdr.value = 'Black Printed Impressions'
  applyHeaderStyle(bwHdr, C.bwHdrBg, C.bwHdrFg)

  // Color section header: cols M–S (13–19)
  ws.mergeCells(4, 13, 4, 19)
  const clrHdr = ws.getCell(4, 13)
  clrHdr.value = 'Color Printed Impressions'
  applyHeaderStyle(clrHdr, C.clrHdrBg, C.clrHdrFg)

  // Total section header: cols T–Z (20–26)
  ws.mergeCells(4, 20, 4, 26)
  const totHdr = ws.getCell(4, 20)
  totHdr.value = 'Total Printed Impressions'
  applyHeaderStyle(totHdr, C.totHdrBg, C.totHdrFg)

  // ── Row 5: Sub-column headers ───────────────────────────────────────────────
  ws.getRow(5).height = 28

  const subCols = [
    'Start Read Date', 'Start Meter\nRead A4', 'Start Meter\nRead A3',
    'End Read Date',   'End Meter\nRead A4',   'End Meter\nRead A3', 'Volume',
  ]

  subCols.forEach((label, i) => {
    const bwCell  = ws.getCell(5, 6  + i)
    const clrCell = ws.getCell(5, 13 + i)
    const totCell = ws.getCell(5, 20 + i)
    bwCell.value  = label; applyHeaderStyle(bwCell,  C.bwSubBg,  C.bwSubFg,  true)
    clrCell.value = label; applyHeaderStyle(clrCell, C.clrSubBg, C.clrSubFg, true)
    totCell.value = label; applyHeaderStyle(totCell, C.totSubBg, C.totSubFg, true)
  })

  // ── Data rows ───────────────────────────────────────────────────────────────
  let dataRow = 6
  let totalBw = 0, totalColor = 0, totalAll = 0

  // Group printers by account (same customer — all the same here, but structure allows future multi-customer)
  const customerName = header.customerName

  printers.forEach((p, i) => {
    const row = ws.getRow(dataRow)
    row.height = 16

    const pc = p.prevCounters
    const cc = p.currCounters ?? {}
    const pu = p.pagesUsed ?? {}
    const bwVol  = n(pu.totalBw)
    const clrVol = n(pu.totalColor)
    const totVol = bwVol + clrVol
    totalBw    += bwVol
    totalColor += clrVol
    totalAll   += totVol

    const prevDate = fmtDate(p.prevSubmittedAt)
    const currDate = fmtDate(p.submittedAt)

    // Left columns
    const leftData = [
      i === 0 ? customerName : '',   // Account Name (only first row — can merge after if needed)
      'Xerox',
      p.model,
      p.serialNumber,
      p.location ? `${p.city} - ${p.location}` : p.city,
    ]
    leftData.forEach((val, ci) => {
      const cell = ws.getCell(dataRow, ci + 1)
      cell.value = val ?? ''
      applyDataStyle(cell, C.leftDataBg)
      if (ci === 0) cell.font = font('1F3864', true, 10) // bold account name
    })

    // BW columns (F–L = 6–12)
    const bwVals = [
      prevDate,
      pc ? n(pc.a4Bw) : 'Baseline',
      pc ? n(pc.a3Bw) : '',
      currDate,
      n(cc.a4Bw),
      n(cc.a3Bw),
      bwVol,
    ]
    bwVals.forEach((val, ci) => {
      const cell = ws.getCell(dataRow, 6 + ci)
      cell.value = val
      applyDataStyle(cell, ci === 6 ? C.bwHdrBg : C.bwDataBg)
      if (ci === 6) { cell.font = font(C.bwHdrFg, true, 10) }
    })

    // Color columns (M–S = 13–19) — blank for BW-only printers
    const clrVals = p.isBwOnly
      ? ['', '', '', '', '', '', '']
      : [
          prevDate,
          pc ? n(pc.a4Color) : 'Baseline',
          pc ? n(pc.a3Color) : '',
          currDate,
          n(cc.a4Color),
          n(cc.a3Color),
          clrVol,
        ]
    clrVals.forEach((val, ci) => {
      const cell = ws.getCell(dataRow, 13 + ci)
      cell.value = val
      applyDataStyle(cell, ci === 6 ? C.clrHdrBg : C.clrDataBg)
      if (ci === 6) { cell.font = font(C.clrHdrFg, true, 10) }
    })

    // Total columns (T–Z = 20–26)
    const prevA4Total = pc ? n(pc.a4Bw) + n(pc.a4Color) : null
    const prevA3Total = pc ? n(pc.a3Bw) + n(pc.a3Color) : null
    const totVals = [
      prevDate,
      prevA4Total !== null ? prevA4Total : 'Baseline',
      prevA3Total !== null ? prevA3Total : '',
      currDate,
      n(cc.a4Bw) + n(cc.a4Color),
      n(cc.a3Bw) + n(cc.a3Color),
      totVol,
    ]
    totVals.forEach((val, ci) => {
      const cell = ws.getCell(dataRow, 20 + ci)
      cell.value = val
      applyDataStyle(cell, ci === 6 ? C.totHdrBg : C.totDataBg)
      if (ci === 6) { cell.font = font(C.totHdrFg, true, 10) }
    })

    dataRow++
  })

  // ── Totals row ──────────────────────────────────────────────────────────────
  ws.getRow(dataRow).height = 18
  for (let ci = 1; ci <= TOTAL_COLS; ci++) {
    const cell = ws.getCell(dataRow, ci)
    cell.fill   = fill(C.totalBg)
    cell.font   = font(C.totalFg, true, 10)
    cell.border = border()
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  }
  ws.getCell(dataRow, 1).value = 'TOTAL'
  ws.getCell(dataRow, 12).value = totalBw    // BW Volume
  ws.getCell(dataRow, 19).value = totalColor // Color Volume
  ws.getCell(dataRow, 26).value = totalAll   // Total Volume

  // Merge account name vertically across all data rows (if more than 1 printer)
  if (printers.length > 1) {
    ws.mergeCells(6, 1, dataRow - 1, 1)
    const merged = ws.getCell(6, 1)
    merged.value     = customerName
    merged.fill      = fill(C.leftDataBg)
    merged.font      = font('1F3864', true, 10)
    merged.border    = border()
    merged.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  }

  return ws
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function generateBillingAuditExcel(data) {
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Farage MPS'
  wb.created  = new Date()

  buildSheet(wb, data)

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
