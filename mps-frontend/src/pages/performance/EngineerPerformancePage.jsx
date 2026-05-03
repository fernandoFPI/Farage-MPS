import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, AlertTriangle, Camera } from 'lucide-react'
import { useEngineerPerformance } from '../../api/hooks/usePerformance'
import { useBillingCycles } from '../../api/hooks/useBillingCycles'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import { fmtDuration, fmtDateTime, fmtDate } from '../../utils/format'

function durationColor(seconds) {
  if (seconds == null) return 'text-gray-400'
  if (seconds < 300)  return 'text-green-600 dark:text-green-400'
  if (seconds < 900)  return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function SpeedBar({ label, seconds, maxSeconds, color }) {
  const pct = maxSeconds > 0 ? Math.min(100, Math.round((seconds / maxSeconds) * 100)) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-16 text-xs font-medium text-end ${color.replace('bg-', 'text-')}`}>
        {fmtDuration(seconds)}
      </span>
    </div>
  )
}

export default function EngineerPerformancePage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()

  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')
  const [cycleId, setCycleId] = useState('')

  const params = {}
  if (cycleId) params.cycleId = cycleId
  if (from)    params.from    = from
  if (to)      params.to      = to

  const { data: engineer, isLoading } = useEngineerPerformance(id, params)
  const { data: cycles = [] } = useBillingCycles()

  if (isLoading) return <LoadingSpinner className="py-20" />
  if (!engineer) return <EmptyState title="Engineer not found" />

  const photoPct = engineer.totalReadings > 0
    ? Math.round((engineer.readingsWithPhotos / engineer.totalReadings) * 100)
    : 0

  const maxSeconds = engineer.maxDurationSeconds ?? 1

  const statCards = [
    { label: t('performance.readings'),    value: engineer.totalReadings },
    { label: t('performance.cycles'),      value: engineer.totalCycles },
    { label: t('performance.avgTime'),     value: fmtDuration(engineer.avgDurationSeconds) },
    { label: t('performance.photoCoverage'), value: `${photoPct}%` },
    { label: t('performance.flagged'),     value: engineer.flaggedReadings },
  ]

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back link */}
      <button
        onClick={() => navigate('/performance')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t('common.back')}
      </button>

      {/* Heading */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{engineer.fullName}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{engineer.email}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map(c => (
          <div key={c.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{c.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Speed distribution */}
      {(engineer.minDurationSeconds != null || engineer.avgDurationSeconds != null || engineer.maxDurationSeconds != null) && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-4">
            {t('performance.speedDistribution')}
          </h2>
          <div className="space-y-3">
            <SpeedBar
              label={t('performance.fastest')}
              seconds={engineer.minDurationSeconds}
              maxSeconds={maxSeconds}
              color="bg-green-500"
            />
            <SpeedBar
              label={t('performance.average')}
              seconds={engineer.avgDurationSeconds}
              maxSeconds={maxSeconds}
              color="bg-blue-500"
            />
            <SpeedBar
              label={t('performance.slowest')}
              seconds={engineer.maxDurationSeconds}
              maxSeconds={maxSeconds}
              color="bg-red-500"
            />
          </div>
        </div>
      )}

      {/* Recent readings */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t('performance.recentReadings')}
          </h2>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              placeholder={t('common.from') ?? 'From'}
            />
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              placeholder={t('common.to') ?? 'To'}
            />
            <select
              value={cycleId}
              onChange={e => setCycleId(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none"
            >
              <option value="">All Cycles</option>
              {cycles.map(c => (
                <option key={c.id} value={c.id}>{c.cycleName ?? c.contractNumber}</option>
              ))}
            </select>
            {(from || to || cycleId) && (
              <button
                onClick={() => { setFrom(''); setTo(''); setCycleId('') }}
                className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400"
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        {!engineer.recentReadings?.length ? (
          <EmptyState title={t('performance.noReadings')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {['Printer', 'Customer', 'Cycle', t('meterReadings.submittedAt'), t('performance.duration'), t('performance.photos'), t('performance.flagged')].map(h => (
                    <th key={h} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {engineer.recentReadings.map(r => (
                  <tr key={r.readingId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-sm">
                      <Link
                        to={`/printers/${r.printerId}`}
                        className="font-mono text-brand-600 dark:text-brand-400 hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        {r.serialNumber}
                      </Link>
                      <span className="block text-xs text-gray-400 dark:text-gray-500">{r.model}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.customerName}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        to={`/billing-cycles/${r.cycleId}`}
                        className="text-brand-600 dark:text-brand-400 hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        {r.cycleName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {fmtDateTime(r.submittedAt)}
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${durationColor(r.durationSeconds)}`}>
                      {fmtDuration(r.durationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {r.photoCount > 0 ? (
                        <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                          <Camera className="h-3.5 w-3.5" />
                          {r.photoCount}
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {r.flagged ? <AlertTriangle className="h-4 w-4 text-red-500" /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
