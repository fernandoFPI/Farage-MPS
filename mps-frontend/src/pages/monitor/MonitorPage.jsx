import { useState, useMemo, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, RefreshCw, ExternalLink, ChevronDown, ChevronRight,
  Search, Download, Clock, CheckCircle2, XCircle, Loader2,
  FileWarning, CalendarX, Activity, Filter, X,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useReadingGaps, useCycleGaps, useOdooMonitorStatus } from '../../api/hooks/useMonitor'
import { useDocTitle } from '../../hooks/useDocTitle'
import PageHeader from '../../components/PageHeader'

// ─── helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtPeriod(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function relTime(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return fmtDate(iso)
}

function downloadCsv(rows, filename) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const escape = v => {
    if (v == null) return ''
    const s = String(v).replace(/"/g, '""')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
  }
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => escape(r[k])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── shared sub-components ──────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, count, accent }) {
  const colors = {
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
    red:   'text-red-600   dark:text-red-400   bg-red-50   dark:bg-red-900/20',
    blue:  'text-blue-600  dark:text-blue-400  bg-blue-50  dark:bg-blue-900/20',
  }
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`flex items-center justify-center h-9 w-9 rounded-lg ${colors[accent]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {count != null && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{count} item{count !== 1 ? 's' : ''}</p>
        )}
      </div>
    </div>
  )
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function EmptyState({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
        <Icon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  )
}

function UrgencyBadge({ days }) {
  if (days == null) return <span className="text-xs text-gray-400">—</span>
  if (days > 14) return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />{days}d</span>
  if (days > 7)  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />{days}d</span>
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"><span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" />{days}d</span>
}

function OdooStatusBadge({ status }) {
  const cfg = {
    synced:  { label: 'Synced',      cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
    partial: { label: 'Partial',     cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',         dot: 'bg-amber-500' },
    error:   { label: 'Error',       cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',                 dot: 'bg-red-500' },
    pending: { label: 'Pending',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',             dot: 'bg-blue-500' },
    null:    { label: 'Not Pushed',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',                dot: 'bg-gray-400' },
  }
  const c = cfg[status] ?? cfg['null']
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  )
}

function SortButton({ field, current, dir, onSort, children }) {
  const active = current === field
  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 font-medium text-xs uppercase tracking-wide ${active ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
    >
      {children}
      <span className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
    </button>
  )
}

function useSort(defaultField, defaultDir = 'asc') {
  const [sort, setSort] = useState({ field: defaultField, dir: defaultDir })
  const onSort = useCallback(field => {
    setSort(prev => prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }, [])
  const sorted = useCallback((arr, getter) => {
    return [...arr].sort((a, b) => {
      const va = getter ? getter(a, sort.field) : a[sort.field]
      const vb = getter ? getter(b, sort.field) : b[sort.field]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : (va < vb ? -1 : va > vb ? 1 : 0)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [sort])
  return { sort, onSort, sorted }
}

// ─── Tab 1: Reading Gaps ────────────────────────────────────────────────────

function CityBar({ city, submitted, total, status }) {
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0
  const barColor = status === 'complete' ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-gray-200 dark:bg-gray-700'
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 truncate text-gray-600 dark:text-gray-400 font-medium">{city}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 min-w-[60px]">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right tabular-nums text-gray-500 dark:text-gray-400">{submitted}/{total}</span>
    </div>
  )
}

function ReadingRow({ row, expanded, onToggle }) {
  const cities = row.city_statuses ?? []
  const daysOpen = row.days_open ?? 0
  const hasCities = cities.length > 0
  const totalPrinters = cities.reduce((s, c) => s + (c.totalPrinters || 0), 0)
  const submittedPrinters = cities.reduce((s, c) => s + (c.submittedPrinters || 0), 0)
  const pct = totalPrinters > 0 ? Math.round((submittedPrinters / totalPrinters) * 100) : null

  return (
    <>
      <tr
        className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${hasCities ? 'cursor-pointer' : ''}`}
        onClick={hasCities ? onToggle : undefined}
      >
        <td className="py-3 pl-4 pr-2 w-8">
          {hasCities && (
            <button className="text-gray-400 dark:text-gray-500">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </td>
        <td className="py-3 pr-4">
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate max-w-[200px]">{row.customer_name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{row.official_contract_number || row.contract_number}</div>
        </td>
        <td className="py-3 pr-4 hidden md:table-cell">
          <span className="text-xs text-gray-500 dark:text-gray-400">{fmtPeriod(row.period_start)}</span>
        </td>
        <td className="py-3 pr-4">
          <UrgencyBadge days={daysOpen} />
        </td>
        <td className="py-3 pr-4 hidden lg:table-cell">
          {pct != null ? (
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-gray-600 dark:text-gray-400">{pct}%</span>
            </div>
          ) : (
            <span className="text-xs text-gray-400">No readings</span>
          )}
        </td>
        <td className="py-3 pr-4 hidden xl:table-cell">
          <span className="text-xs text-gray-500 dark:text-gray-400">{row.specialist_name ?? '—'}</span>
        </td>
        <td className="py-3 pr-4">
          <Link
            to={`/billing-cycles/${row.cycle_id}`}
            onClick={e => e.stopPropagation()}
            className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </td>
      </tr>
      {expanded && hasCities && (
        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
          <td colSpan={7} className="py-3 pl-12 pr-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {cities.map(c => (
                <CityBar key={c.city} city={c.city} submitted={c.submittedPrinters} total={c.totalPrinters} status={c.status} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ReadingGapsTab({ data, isLoading }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState({})
  const { sort, onSort, sorted } = useSort('days_open', 'desc')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return (data ?? []).filter(r =>
      !q ||
      r.customer_name?.toLowerCase().includes(q) ||
      r.contract_number?.toLowerCase().includes(q) ||
      r.official_contract_number?.toLowerCase().includes(q) ||
      r.specialist_name?.toLowerCase().includes(q)
    )
  }, [data, search])

  const rows = useMemo(() => sorted(filtered, (r, f) => {
    if (f === 'customer_name') return r.customer_name
    if (f === 'days_open')     return r.days_open ?? 0
    return r[f]
  }), [filtered, sorted])

  const toggleExpand = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const exportCsv = () => downloadCsv(rows.map(r => ({
    customer:          r.customer_name,
    contract:          r.official_contract_number || r.contract_number,
    period:            fmtPeriod(r.period_start),
    days_open:         r.days_open,
    specialist:        r.specialist_name ?? '',
    cities:            (r.city_statuses ?? []).length,
    submitted_cities:  (r.city_statuses ?? []).filter(c => c.status === 'complete').length,
  })), 'reading-gaps.csv')

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Search customer, contract, specialist…" />
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap">
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {rows.length === 0 ? (
        search
          ? <EmptyState icon={Search} message="No results match your search." />
          : <EmptyState icon={CheckCircle2} message="All open cycles have complete readings." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                <th className="py-3 pl-4 pr-2 w-8" />
                <th className="py-3 pr-4 text-left">
                  <SortButton field="customer_name" current={sort.field} dir={sort.dir} onSort={onSort}>Customer</SortButton>
                </th>
                <th className="py-3 pr-4 text-left hidden md:table-cell">
                  <span className="text-xs uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400">Period</span>
                </th>
                <th className="py-3 pr-4 text-left">
                  <SortButton field="days_open" current={sort.field} dir={sort.dir} onSort={onSort}>Days Open</SortButton>
                </th>
                <th className="py-3 pr-4 text-left hidden lg:table-cell">
                  <span className="text-xs uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400">Progress</span>
                </th>
                <th className="py-3 pr-4 text-left hidden xl:table-cell">
                  <span className="text-xs uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400">Specialist</span>
                </th>
                <th className="py-3 pr-4" />
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900">
              {rows.map(r => (
                <ReadingRow
                  key={r.cycle_id}
                  row={r}
                  expanded={!!expanded[r.cycle_id]}
                  onToggle={() => toggleExpand(r.cycle_id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Tab 2: Cycle Gaps ──────────────────────────────────────────────────────

function CycleGapRow({ row }) {
  const lastStatus = row.last_cycle_status
  const statusColors = {
    invoiced:            'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    confirmed:           'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    pending_confirmation:'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    disputed:            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="py-3 pl-4 pr-4">
        <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate max-w-[200px]">{row.customer_name}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{row.official_contract_number || row.contract_number}</div>
      </td>
      <td className="py-3 pr-4 hidden sm:table-cell">
        <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{row.service_type ?? '—'}</span>
      </td>
      <td className="py-3 pr-4 hidden md:table-cell">
        {row.last_period_start ? (
          <div>
            <div className="text-xs text-gray-700 dark:text-gray-300">{fmtPeriod(row.last_period_start)}</div>
            {lastStatus && (
              <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColors[lastStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                {lastStatus.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">No cycles yet</span>
        )}
      </td>
      <td className="py-3 pr-4">
        <UrgencyBadge days={row.days_since_last_cycle} />
      </td>
      <td className="py-3 pr-4 hidden xl:table-cell">
        <span className="text-xs text-gray-500 dark:text-gray-400">{row.specialist_name ?? '—'}</span>
      </td>
      <td className="py-3 pr-4 hidden lg:table-cell">
        <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{row.invoice_frequency?.replace(/_/g, ' ') ?? '—'}</span>
      </td>
      <td className="py-3 pr-4">
        <Link to={`/contracts/${row.contract_id}`} className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">
          <ExternalLink className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  )
}

function CycleGapsTab({ data, isLoading }) {
  const [search, setSearch] = useState('')
  const [subFilter, setSubFilter] = useState('all') // all | never | idle
  const { sort, onSort, sorted } = useSort('days_since_last_cycle', 'desc')

  const filtered = useMemo(() => {
    let rows = data ?? []
    if (subFilter === 'never') rows = rows.filter(r => !r.last_cycle_id)
    if (subFilter === 'idle')  rows = rows.filter(r => !!r.last_cycle_id)
    const q = search.toLowerCase()
    if (q) rows = rows.filter(r =>
      r.customer_name?.toLowerCase().includes(q) ||
      r.contract_number?.toLowerCase().includes(q) ||
      r.official_contract_number?.toLowerCase().includes(q) ||
      r.specialist_name?.toLowerCase().includes(q)
    )
    return rows
  }, [data, search, subFilter])

  const rows = useMemo(() => sorted(filtered, (r, f) => {
    if (f === 'customer_name')        return r.customer_name
    if (f === 'days_since_last_cycle') return r.days_since_last_cycle ?? -1
    return r[f]
  }), [filtered, sorted])

  const neverCount = (data ?? []).filter(r => !r.last_cycle_id).length
  const idleCount  = (data ?? []).filter(r => !!r.last_cycle_id).length

  const exportCsv = () => downloadCsv(rows.map(r => ({
    customer:         r.customer_name,
    contract:         r.official_contract_number || r.contract_number,
    service_type:     r.service_type ?? '',
    last_period:      fmtPeriod(r.last_period_start),
    last_status:      r.last_cycle_status ?? '',
    days_idle:        r.days_since_last_cycle ?? '',
    specialist:       r.specialist_name ?? '',
    invoice_freq:     r.invoice_frequency ?? '',
  })), 'cycle-gaps.csv')

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Search customer, contract, specialist…" />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {[
            { key: 'all',   label: `All (${(data ?? []).length})` },
            { key: 'never', label: `Never opened (${neverCount})` },
            { key: 'idle',  label: `No new cycle (${idleCount})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSubFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                subFilter === key
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap">
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {rows.length === 0 ? (
        search || subFilter !== 'all'
          ? <EmptyState icon={Search} message="No results match your filter." />
          : <EmptyState icon={CheckCircle2} message="All active contracts have an open billing cycle." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                <th className="py-3 pl-4 pr-4 text-left">
                  <SortButton field="customer_name" current={sort.field} dir={sort.dir} onSort={onSort}>Customer</SortButton>
                </th>
                <th className="py-3 pr-4 text-left hidden sm:table-cell">
                  <span className="text-xs uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400">Service</span>
                </th>
                <th className="py-3 pr-4 text-left hidden md:table-cell">
                  <span className="text-xs uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400">Last Cycle</span>
                </th>
                <th className="py-3 pr-4 text-left">
                  <SortButton field="days_since_last_cycle" current={sort.field} dir={sort.dir} onSort={onSort}>Days Idle</SortButton>
                </th>
                <th className="py-3 pr-4 text-left hidden xl:table-cell">
                  <span className="text-xs uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400">Specialist</span>
                </th>
                <th className="py-3 pr-4 text-left hidden lg:table-cell">
                  <span className="text-xs uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400">Frequency</span>
                </th>
                <th className="py-3 pr-4" />
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900">
              {rows.map(r => <CycleGapRow key={r.contract_id} row={r} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Tab 3: Odoo Status ─────────────────────────────────────────────────────

function OdooRow({ row, expanded, onToggle }) {
  const errors = row.error_logs ?? []

  return (
    <>
      <tr
        className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${errors.length ? 'cursor-pointer' : ''}`}
        onClick={errors.length ? onToggle : undefined}
      >
        <td className="py-3 pl-4 pr-2 w-8">
          {errors.length > 0 && (
            <button className="text-gray-400 dark:text-gray-500">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </td>
        <td className="py-3 pr-4">
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate max-w-[180px]">{row.customer_name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{row.official_contract_number || row.contract_number}</div>
        </td>
        <td className="py-3 pr-4 hidden md:table-cell">
          <span className="text-xs text-gray-600 dark:text-gray-400">{fmtPeriod(row.period_start)}</span>
        </td>
        <td className="py-3 pr-4">
          <OdooStatusBadge status={row.odoo_status} />
        </td>
        <td className="py-3 pr-4 hidden lg:table-cell">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{row.odoo_invoice_id ?? '—'}</span>
        </td>
        <td className="py-3 pr-4 hidden xl:table-cell">
          <span className="text-xs text-gray-500 dark:text-gray-400">{row.confirmed_at ? relTime(row.confirmed_at) : '—'}</span>
        </td>
        <td className="py-3 pr-4 hidden xl:table-cell">
          <span className="text-xs text-gray-500 dark:text-gray-400">{row.last_success_at ? relTime(row.last_success_at) : '—'}</span>
        </td>
        <td className="py-3 pr-4">
          <Link
            to={`/billing-cycles/${row.cycle_id}`}
            onClick={e => e.stopPropagation()}
            className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </td>
      </tr>
      {expanded && errors.length > 0 && (
        <tr className="border-b border-gray-100 dark:border-gray-800 bg-red-50/50 dark:bg-red-900/10">
          <td colSpan={8} className="py-3 pl-12 pr-6">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">Error log ({errors.length} attempt{errors.length !== 1 ? 's' : ''})</p>
            <div className="space-y-2">
              {errors.map((e, i) => (
                <div key={i} className="flex gap-3 text-xs">
                  <span className="text-gray-400 dark:text-gray-500 whitespace-nowrap">#{e.attempt}</span>
                  <span className="text-gray-400 dark:text-gray-500 whitespace-nowrap">{relTime(e.at)}</span>
                  <span className="text-red-700 dark:text-red-400 font-mono break-all">{e.error ?? 'Unknown error'}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function OdooStatusTab({ data, isLoading }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expanded, setExpanded] = useState({})
  const { sort, onSort, sorted } = useSort('confirmed_at', 'desc')

  const STATUS_OPTS = ['all', 'error', 'pending', 'partial', 'synced', 'none']

  const filtered = useMemo(() => {
    let rows = data ?? []
    if (statusFilter !== 'all') {
      if (statusFilter === 'none') rows = rows.filter(r => !r.odoo_status)
      else                         rows = rows.filter(r => r.odoo_status === statusFilter)
    }
    const q = search.toLowerCase()
    if (q) rows = rows.filter(r =>
      r.customer_name?.toLowerCase().includes(q) ||
      r.contract_number?.toLowerCase().includes(q) ||
      r.official_contract_number?.toLowerCase().includes(q) ||
      r.odoo_invoice_id?.toLowerCase().includes(q)
    )
    return rows
  }, [data, search, statusFilter])

  const rows = useMemo(() => sorted(filtered, (r, f) => {
    if (f === 'customer_name') return r.customer_name
    if (f === 'confirmed_at')  return r.confirmed_at ?? ''
    return r[f]
  }), [filtered, sorted])

  const counts = useMemo(() => {
    const d = data ?? []
    return {
      error:   d.filter(r => r.odoo_status === 'error').length,
      pending: d.filter(r => r.odoo_status === 'pending').length,
      partial: d.filter(r => r.odoo_status === 'partial').length,
      synced:  d.filter(r => r.odoo_status === 'synced').length,
      none:    d.filter(r => !r.odoo_status).length,
    }
  }, [data])

  const toggleExpand = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const exportCsv = () => downloadCsv(rows.map(r => ({
    customer:       r.customer_name,
    contract:       r.official_contract_number || r.contract_number,
    period:         fmtPeriod(r.period_start),
    cycle_status:   r.cycle_status,
    odoo_status:    r.odoo_status ?? 'not pushed',
    so_number:      r.odoo_invoice_id ?? '',
    confirmed_at:   r.confirmed_at ? new Date(r.confirmed_at).toISOString() : '',
    last_success:   r.last_success_at ? new Date(r.last_success_at).toISOString() : '',
    error_count:    (r.error_logs ?? []).length,
  })), 'odoo-status.csv')

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>

  return (
    <div>
      {/* Mini stat row */}
      {(data ?? []).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          {[
            { key: 'error',   label: 'Error',      cls: 'text-red-600 dark:text-red-400',     bg: 'bg-red-50 dark:bg-red-900/20' },
            { key: 'pending', label: 'Pending',     cls: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
            { key: 'partial', label: 'Partial',     cls: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
            { key: 'synced',  label: 'Synced',      cls: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
            { key: 'none',    label: 'Not Pushed',  cls: 'text-gray-600 dark:text-gray-400',   bg: 'bg-gray-100 dark:bg-gray-800' },
          ].map(({ key, label, cls, bg }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
              className={`flex flex-col items-center py-3 px-2 rounded-xl border transition-all ${
                statusFilter === key
                  ? `${bg} border-current ring-2 ring-offset-1 ring-current/20`
                  : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900'
              } ${cls}`}
            >
              <span className={`text-xl font-bold tabular-nums ${cls}`}>{counts[key]}</span>
              <span className="text-xs mt-0.5 font-medium">{label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Search customer, contract, SO number…" />
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap">
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {rows.length === 0 ? (
        search || statusFilter !== 'all'
          ? <EmptyState icon={Search} message="No results match your filter." />
          : <EmptyState icon={CheckCircle2} message="No confirmed or invoiced cycles yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                <th className="py-3 pl-4 pr-2 w-8" />
                <th className="py-3 pr-4 text-left">
                  <SortButton field="customer_name" current={sort.field} dir={sort.dir} onSort={onSort}>Customer</SortButton>
                </th>
                <th className="py-3 pr-4 text-left hidden md:table-cell">
                  <span className="text-xs uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400">Period</span>
                </th>
                <th className="py-3 pr-4 text-left">
                  <span className="text-xs uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400">Odoo Status</span>
                </th>
                <th className="py-3 pr-4 text-left hidden lg:table-cell">
                  <span className="text-xs uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400">SO / Invoice #</span>
                </th>
                <th className="py-3 pr-4 text-left hidden xl:table-cell">
                  <SortButton field="confirmed_at" current={sort.field} dir={sort.dir} onSort={onSort}>Confirmed</SortButton>
                </th>
                <th className="py-3 pr-4 text-left hidden xl:table-cell">
                  <span className="text-xs uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400">Last Sync</span>
                </th>
                <th className="py-3 pr-4" />
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900">
              {rows.map(r => (
                <OdooRow
                  key={r.cycle_id}
                  row={r}
                  expanded={!!expanded[r.cycle_id]}
                  onToggle={() => toggleExpand(r.cycle_id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── KPI Bar ────────────────────────────────────────────────────────────────

function KpiBar({ readings, cycles, odoo, onTabClick }) {
  const cards = [
    {
      label: 'Incomplete Readings',
      value: readings,
      icon: FileWarning,
      accent: 'amber',
      tab: 'readings',
      cls: 'border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10',
      num: 'text-amber-700 dark:text-amber-400',
      ico: 'text-amber-500',
    },
    {
      label: 'Cycles Not Opened',
      value: cycles,
      icon: CalendarX,
      accent: 'red',
      tab: 'cycles',
      cls: 'border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/10',
      num: 'text-red-700 dark:text-red-400',
      ico: 'text-red-500',
    },
    {
      label: 'Odoo Errors',
      value: odoo,
      icon: XCircle,
      accent: 'blue',
      tab: 'odoo',
      cls: 'border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/10',
      num: 'text-blue-700 dark:text-blue-400',
      ico: 'text-blue-500',
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {cards.map(({ label, value, icon: Icon, tab, cls, num, ico }) => (
        <button
          key={tab}
          onClick={() => onTabClick(tab)}
          className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer hover:shadow-sm transition-shadow text-left ${cls}`}
        >
          <div className={`flex-shrink-0 ${ico}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className={`text-2xl font-bold tabular-nums ${num}`}>{value ?? '—'}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{label}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── Auto-refresh countdown ─────────────────────────────────────────────────

function RefreshBar({ onRefresh, lastUpdated }) {
  const [secondsLeft, setSecondsLeft] = useState(300)

  useEffect(() => {
    setSecondsLeft(300)
    const t = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { onRefresh(); return 300 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [lastUpdated, onRefresh])

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
      <span>Refreshes in {mm}:{ss}</span>
      {lastUpdated && <span className="hidden sm:inline">· Updated {relTime(lastUpdated)}</span>}
      <button
        onClick={onRefresh}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh now
      </button>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'readings', label: 'Reading Submissions', icon: FileWarning },
  { key: 'cycles',   label: 'Cycle Opening',        icon: CalendarX },
  { key: 'odoo',     label: 'Odoo Sync',             icon: Activity },
]

export default function MonitorPage() {
  useDocTitle('Operations Monitor')
  const [activeTab, setActiveTab] = useState('readings')
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toISOString())
  const qc = useQueryClient()

  const readings = useReadingGaps()
  const cycles   = useCycleGaps()
  const odoo     = useOdooMonitorStatus()

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['monitor'] })
    setLastUpdated(new Date().toISOString())
  }, [qc])

  const summaryReadings = readings.data?.length ?? 0
  const summaryCycles   = cycles.data?.length   ?? 0
  const summaryOdoo     = (odoo.data ?? []).filter(r => r.odoo_status === 'error').length

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Activity className="h-5 w-5 text-brand-500" />
            Operations Monitor
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Live operational health across all contracts</p>
        </div>
        <RefreshBar onRefresh={refresh} lastUpdated={lastUpdated} />
      </div>

      <KpiBar
        readings={summaryReadings}
        cycles={summaryCycles}
        odoo={summaryOdoo}
        onTabClick={setActiveTab}
      />

      {/* Tab strip */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-800">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count = key === 'readings' ? summaryReadings : key === 'cycles' ? summaryCycles : (odoo.data ?? []).length
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === key
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
              {count > 0 && (
                <span className={`hidden sm:inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-semibold ${
                  activeTab === key ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'readings' && (
        <>
          <SectionHeader icon={FileWarning} title="Incomplete Reading Submissions" count={summaryReadings} accent="amber" />
          <ReadingGapsTab data={readings.data} isLoading={readings.isLoading} />
        </>
      )}
      {activeTab === 'cycles' && (
        <>
          <SectionHeader icon={CalendarX} title="Contracts Without an Open Cycle" count={summaryCycles} accent="red" />
          <CycleGapsTab data={cycles.data} isLoading={cycles.isLoading} />
        </>
      )}
      {activeTab === 'odoo' && (
        <>
          <SectionHeader icon={Activity} title="Odoo Sync Status" count={(odoo.data ?? []).length} accent="blue" />
          <OdooStatusTab data={odoo.data} isLoading={odoo.isLoading} />
        </>
      )}
    </div>
  )
}
