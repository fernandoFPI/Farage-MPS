export function formatPeriod(start, end) {
  if (!start || !end) return '—'
  const s = new Date(start)
  const e = new Date(end)
  const fmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
  const yearFmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt.format(s)} – ${yearFmt.format(e)}`
}
