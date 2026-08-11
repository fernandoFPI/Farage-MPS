import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw, ArrowLeft, Activity } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useOdooSyncLog } from '../../api/hooks/useOdoo'
import { useDocTitle } from '../../hooks/useDocTitle'

const ORDER_TYPE_LABELS = {
  all:          'All Charges',
  fixed_charge: 'Fixed Charge',
  clicks:       'Usage Clicks',
  bw_clicks:    'BW Clicks',
  color_clicks: 'Color Clicks',
  a4_pages:     'A4 Pages',
  a3_pages:     'A3 Pages',
}

const STATUSES = ['synced', 'partial', 'error', 'pending', 'never']

const STATUS_CFG = {
  synced:  { label: 'Synced',      dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', cardAccent: 'from-emerald-500/10 via-transparent', num: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', border: 'border-l-emerald-500', ring: 'ring-emerald-200 dark:ring-emerald-800' },
  partial: { label: 'Partial',     dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',         cardAccent: 'from-amber-500/10 via-transparent',   num: 'text-amber-600 dark:text-amber-400',   bar: 'bg-amber-500',   border: 'border-l-amber-500',   ring: 'ring-amber-200 dark:ring-amber-800' },
  error:   { label: 'Error',       dot: 'bg-red-500',     badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',                 cardAccent: 'from-red-500/10 via-transparent',     num: 'text-red-600 dark:text-red-400',       bar: 'bg-red-500',     border: 'border-l-red-500',     ring: 'ring-red-200 dark:ring-red-800' },
  pending: { label: 'Pending',     dot: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',             cardAccent: 'from-blue-500/10 via-transparent',    num: 'text-blue-600 dark:text-blue-400',     bar: 'bg-blue-500',    border: 'border-l-blue-500',    ring: 'ring-blue-200 dark:ring-blue-800' },
  never:   { label: 'Not Pushed',  dot: 'bg-gray-400 dark:bg-gray-500', badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', cardAccent: 'from-gray-400/10 via-transparent',    num: 'text-gray-500 dark:text-gray-400',     bar: 'bg-gray-400',    border: 'border-l-gray-300 dark:border-l-gray-600', ring: 'ring-gray-200 dark:ring-gray-700' },
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatPeriod(isoDate) {
  if (!isoDate) return '—'
  const d = new Date(isoDate)
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function relativeTime(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status ?? 'never']
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${cfg.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function StatCard({ status, count, total }) {
  const cfg = STATUS_CFG[status]
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className={`relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ${cfg.ring}`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${cfg.cardAccent} to-transparent pointer-events-none`} />
      <p className="relative text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{cfg.label}</p>
      <p className={`relative mt-2 text-4xl font-bold tabular-nums leading-none ${cfg.num}`}>{count}</p>
      <div className="relative mt-3 h-1 rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          className={`h-1 rounded-full transition-all duration-700 ease-out ${cfg.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="relative mt-1.5 text-xs text-gray-400 dark:text-gray-500">
        {pct}% of {total}
      </p>
    </div>
  )
}

function OrderDetailTable({ orders, resolutionError }) {
  if (!orders?.length) {
    if (resolutionError) {
      return (
        <p className="text-xs text-red-500 dark:text-red-400 py-1">
          <span className="font-semibold">Sync never started: </span>
          {resolutionError}
        </p>
      )
    }
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">
        No sync records yet — push this cycle to Odoo first.
      </p>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
            {['Order Type', 'Status', 'SO Reference', 'Synced', 'Error'].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {orders.map((o, i) => (
            <tr key={i} className="bg-white dark:bg-gray-900/60">
              <td className="px-3 py-2.5 font-medium text-gray-700 dark:text-gray-300">
                {ORDER_TYPE_LABELS[o.orderType] ?? o.orderType}
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge status={o.status} />
              </td>
              <td className="px-3 py-2.5">
                {o.odooRef
                  ? <span className="font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded px-1.5 py-0.5">{o.odooRef}</span>
                  : <span className="text-gray-400">—</span>}
              </td>
              <td className="px-3 py-2.5 text-gray-400 dark:text-gray-500 whitespace-nowrap">
                {relativeTime(o.syncedAt)}
              </td>
              <td className="px-3 py-2.5 max-w-xs">
                {o.errorMessage ? (
                  <span className="text-red-500 dark:text-red-400 truncate block" title={o.errorMessage}>
                    {o.errorCode ? <span className="font-semibold">{o.errorCode}: </span> : null}
                    {o.errorMessage}
                  </span>
                ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CycleRow({ cycle }) {
  const [expanded, setExpanded] = useState(false)
  const status = cycle.odooStatus ?? 'never'
  const cfg = STATUS_CFG[status]

  const lastSync = useMemo(() => {
    if (!cycle.odooOrders?.length) return null
    const times = cycle.odooOrders.map(o => o.syncedAt).filter(Boolean)
    return times.length ? times.sort().at(-1) : null
  }, [cycle.odooOrders])

  const soRefs = useMemo(() =>
    cycle.odooOrders?.filter(o => o.odooRef).map(o => o.odooRef) ?? []
  , [cycle.odooOrders])

  return (
    <>
      <tr
        className={`border-l-2 ${cfg.border} cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors`}
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-3.5">
          <p className="font-semibold text-sm text-gray-800 dark:text-gray-100 leading-snug">{cycle.customerName}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">{cycle.contractNumber ?? '—'}</p>
        </td>
        <td className="px-4 py-3.5 whitespace-nowrap">
          <span className="inline-block rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300 tabular-nums">
            {formatPeriod(cycle.periodStart)}
          </span>
        </td>
        <td className="px-4 py-3.5">
          {cycle.odooCompany ? (
            <span className="inline-block rounded-md border border-gray-200 dark:border-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
              {cycle.odooCompany}
            </span>
          ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
        </td>
        <td className="px-4 py-3.5">
          <StatusBadge status={status} />
        </td>
        <td className="px-4 py-3.5 max-w-xs">
          {soRefs.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {soRefs.map(ref => (
                <span
                  key={ref}
                  className="inline-block rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 font-mono text-xs text-gray-600 dark:text-gray-300"
                >
                  {ref}
                </span>
              ))}
            </div>
          ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
        </td>
        <td className="px-4 py-3.5 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
          {relativeTime(lastSync)}
        </td>
        <td className="px-3 py-3.5 text-gray-400 dark:text-gray-500">
          {expanded
            ? <ChevronDown className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />}
        </td>
      </tr>
      {expanded && (
        <tr className={`border-l-2 ${cfg.border} bg-gray-50/60 dark:bg-gray-800/20`}>
          <td colSpan={7} className="px-6 py-3">
            <OrderDetailTable orders={cycle.odooOrders} resolutionError={cycle.resolutionError} />
          </td>
        </tr>
      )}
    </>
  )
}

export default function OdooSyncPage() {
  useDocTitle('Odoo Sync Log')

  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')

  const { data = [], isLoading, refetch, isFetching } = useOdooSyncLog()

  const counts = useMemo(() => {
    const c = { synced: 0, partial: 0, error: 0, pending: 0, never: 0 }
    for (const cy of data) {
      const s = cy.odooStatus ?? 'never'
      if (s in c) c[s]++
      else c.never++
    }
    return c
  }, [data])

  const filtered = useMemo(() => {
    let out = data
    if (statusFilter) {
      out = statusFilter === 'never'
        ? out.filter(c => !c.odooStatus)
        : out.filter(c => c.odooStatus === statusFilter)
    }
    if (companyFilter) out = out.filter(c => c.odooCompany === companyFilter)
    if (search) {
      const q = search.toLowerCase()
      out = out.filter(c =>
        c.customerName?.toLowerCase().includes(q) ||
        c.contractNumber?.toLowerCase().includes(q) ||
        c.odooOrders?.some(o => o.odooRef?.toLowerCase().includes(q))
      )
    }
    return out
  }, [data, statusFilter, companyFilter, search])

  const hasFilters = search || statusFilter || companyFilter

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-5 flex items-center gap-2 text-sm">
        <Link
          to="/settings"
          className="flex items-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <span className="text-gray-300 dark:text-gray-600">/</span>
        <span className="font-medium text-gray-700 dark:text-gray-300">Odoo Sync Log</span>
      </div>

      <PageHeader
        title="Odoo Sync Log"
        subtitle="Track sale order sync status for all confirmed billing cycles"
        actions={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {/* Stats cards */}
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATUSES.map(s => (
          <StatCard key={s} status={s} count={counts[s]} total={data.length} />
        ))}
      </div>

      {/* Filter bar */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customer, contract, or SO ref…"
          className="h-9 w-72 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400"
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_CFG[s].label}</option>
          ))}
        </select>
        <select
          value={companyFilter}
          onChange={e => setCompanyFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400"
        >
          <option value="">All Companies</option>
          <option value="FPI">FPI</option>
          <option value="AL Farage">AL Farage</option>
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setStatusFilter(''); setCompanyFilter('') }}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline transition-colors"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 tabular-nums">
          {filtered.length} of {data.length} cycles
        </span>
      </div>

      {/* Table */}
      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Activity className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {hasFilters ? 'No cycles match the current filters.' : 'No confirmed billing cycles found.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                  {['Customer / Contract', 'Period', 'Company', 'Odoo Status', 'Sale Orders', 'Last Sync', ''].map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                {filtered.map(cycle => (
                  <CycleRow key={cycle.id} cycle={cycle} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
