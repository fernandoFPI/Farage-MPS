import { useState, useEffect } from 'react'
import { useTvData } from '../../api/hooks/useMonitor'
import { AlertTriangle, CalendarX, Activity, Wifi, CheckCircle2 } from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtPeriod(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function relTime(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

// ── sub-components ────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, accent }) {
  const colors = {
    red:   'border-red-500/40 bg-red-950/30',
    amber: 'border-amber-500/40 bg-amber-950/30',
    blue:  'border-blue-500/40 bg-blue-950/30',
    green: 'border-emerald-500/40 bg-emerald-950/30',
  }
  const valueColors = {
    red:   value > 0 ? 'text-red-400'     : 'text-emerald-400',
    amber: value > 0 ? 'text-amber-400'   : 'text-emerald-400',
    blue:  'text-blue-300',
    green: 'text-emerald-400',
  }
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border p-6 ${colors[accent]}`}>
      <span className={`text-6xl font-black tabular-nums ${valueColors[accent]}`}>{value}</span>
      <span className="mt-2 text-lg font-semibold text-gray-200 tracking-wide">{label}</span>
      {sub && <span className="mt-1 text-sm text-gray-500">{sub}</span>}
    </div>
  )
}

function SectionTitle({ icon: Icon, label, count, color }) {
  const colors = { amber: 'text-amber-400', red: 'text-red-400', blue: 'text-blue-400' }
  return (
    <div className="flex items-center gap-2 mb-3 border-b border-white/10 pb-2">
      <Icon className={`h-5 w-5 ${colors[color]}`} />
      <span className="text-sm font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      {count != null && (
        <span className={`ms-auto text-xs font-bold px-2 py-0.5 rounded-full ${
          count > 0 ? `${colors[color]} bg-white/5` : 'text-emerald-400 bg-white/5'
        }`}>{count}</span>
      )}
    </div>
  )
}

function ProgressBar({ submitted, total }) {
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0
  const color = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-500 w-14 text-end">{submitted}/{total}</span>
    </div>
  )
}

function StatusDot({ status }) {
  const map = {
    error:   'bg-red-500',
    partial: 'bg-amber-500',
    pending: 'bg-yellow-500',
  }
  return <span className={`inline-block h-2 w-2 rounded-full ${map[status] ?? 'bg-gray-600'}`} />
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function TvDashboardPage() {
  const { data, isLoading, dataUpdatedAt } = useTvData()
  const now = useClock()

  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  if (isLoading || !data) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <span className="text-2xl text-gray-500 animate-pulse">Loading dashboard…</span>
      </div>
    )
  }

  const { summary, readingGaps, cycleGaps, odooIssues, readingsToday, recentActivity } = data

  return (
    <div className="fixed inset-0 bg-gray-950 text-white overflow-hidden flex flex-col p-4 gap-4"
         style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1.5 rounded-full bg-brand-500" />
          <span className="text-xl font-black tracking-tight text-white">FARAGE MPS</span>
          <span className="text-sm text-gray-600 font-medium tracking-widest uppercase ms-2">Operations</span>
        </div>
        <div className="flex items-center gap-4 text-right">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-gray-600">Updated {relTime(new Date(dataUpdatedAt))}</span>
          )}
          <div>
            <div className="text-2xl font-black tabular-nums text-gray-200">{timeStr}</div>
            <div className="text-xs text-gray-500 text-end">{dateStr}</div>
          </div>
        </div>
      </div>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        <KpiTile label="Open Cycles"    value={summary.readingGaps} accent="amber"
                 sub="incomplete readings" />
        <KpiTile label="Readings Today" value={readingsToday}       accent="blue"
                 sub="submitted today" />
        <KpiTile label="Missing Cycles" value={summary.cycleGaps}   accent="red"
                 sub="contracts without a cycle" />
        <KpiTile label="Odoo Errors"    value={summary.odooErrors}  accent="red"
                 sub="sync failures" />
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">

        {/* Reading gaps */}
        <div className="flex flex-col bg-gray-900/60 rounded-2xl border border-white/5 p-4 overflow-hidden">
          <SectionTitle icon={AlertTriangle} label="Incomplete Readings" count={readingGaps.length} color="amber" />
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {readingGaps.length === 0 ? (
              <div className="flex items-center gap-2 text-emerald-400 text-sm mt-2">
                <CheckCircle2 className="h-4 w-4" />All readings complete
              </div>
            ) : readingGaps.map((r, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm font-medium text-gray-200 truncate max-w-[70%]">{r.customer_name}</span>
                  <span className="text-xs text-gray-500 shrink-0">{r.days_open}d open</span>
                </div>
                <ProgressBar submitted={r.submitted} total={r.total} />
              </div>
            ))}
          </div>
        </div>

        {/* Missing cycles + Odoo issues stacked */}
        <div className="flex flex-col gap-4 min-h-0">

          {/* Missing cycles */}
          <div className="flex flex-col bg-gray-900/60 rounded-2xl border border-white/5 p-4 flex-1 overflow-hidden">
            <SectionTitle icon={CalendarX} label="Missing Cycles" count={cycleGaps.length} color="red" />
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {cycleGaps.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm mt-2">
                  <CheckCircle2 className="h-4 w-4" />All contracts have active cycles
                </div>
              ) : cycleGaps.map((r, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-gray-200 truncate max-w-[75%]">{r.customer_name}</span>
                  <span className={`text-xs font-semibold tabular-nums shrink-0 ${
                    r.days_since > 45 ? 'text-red-400' : r.days_since > 30 ? 'text-amber-400' : 'text-gray-400'
                  }`}>{r.days_since}d</span>
                </div>
              ))}
            </div>
          </div>

          {/* Odoo issues */}
          <div className="flex flex-col bg-gray-900/60 rounded-2xl border border-white/5 p-4 flex-1 overflow-hidden">
            <SectionTitle icon={Wifi} label="Odoo Sync Issues" count={odooIssues.length} color="red" />
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {odooIssues.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm mt-2">
                  <CheckCircle2 className="h-4 w-4" />All cycles synced
                </div>
              ) : odooIssues.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <StatusDot status={r.odoo_status} />
                  <span className="text-sm text-gray-200 truncate flex-1">{r.customer_name}</span>
                  <span className="text-xs text-gray-500 shrink-0">{fmtPeriod(r.period_start)}</span>
                  <span className={`text-xs font-semibold uppercase shrink-0 ${
                    r.odoo_status === 'error' ? 'text-red-400' :
                    r.odoo_status === 'partial' ? 'text-amber-400' : 'text-yellow-400'
                  }`}>{r.odoo_status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Activity feed */}
        <div className="flex flex-col bg-gray-900/60 rounded-2xl border border-white/5 p-4 overflow-hidden">
          <SectionTitle icon={Activity} label="Recent Activity" color="blue" />
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {recentActivity.length === 0 ? (
              <span className="text-sm text-gray-500 mt-2">No readings submitted yet today</span>
            ) : recentActivity.map((r, i) => (
              <div key={i} className="flex flex-col gap-0.5 border-b border-white/5 pb-2.5 last:border-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-200 truncate">{r.customer_name}</span>
                  <span className="text-xs text-gray-500 shrink-0 tabular-nums">{relTime(r.created_at)}</span>
                </div>
                <span className="text-xs text-gray-400 truncate">{r.model} · {r.serial_number}</span>
                {r.submitted_by && (
                  <span className="text-xs text-gray-600">{r.submitted_by}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between shrink-0 text-xs text-gray-700">
        <span>Auto-refreshes every 60 seconds</span>
        <span>Farage Printing Industries · MPS Platform</span>
      </div>
    </div>
  )
}
