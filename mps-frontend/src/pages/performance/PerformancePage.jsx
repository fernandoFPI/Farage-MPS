import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Users, Clock, Image, AlertTriangle } from 'lucide-react'
import {
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { useEngineersPerformance } from '../../api/hooks/usePerformance'
import { useAnalytics } from '../../api/hooks/useAnalytics'
import { useDarkMode } from '../../hooks/useTheme'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import { fmtDuration, fmtDateShort } from '../../utils/format'

const STATUS_COLORS = {
  open:      '#F59E0B',
  confirmed: '#10B981',
  closed:    '#6B7280',
  active:    '#3B82F6',
  draft:     '#9CA3AF',
}

function axisProps(isDark) {
  return { tick: { fill: isDark ? '#9CA3AF' : '#6B7280', fontSize: 12 } }
}
function gridProps(isDark) {
  return { stroke: isDark ? '#374151' : '#F3F4F6', strokeDasharray: '3 3' }
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function ChartSkeleton() {
  return <div className="animate-pulse bg-gray-100 dark:bg-gray-800 rounded-lg h-[300px]" />
}

function ChartEmpty({ label }) {
  return (
    <div className="flex items-center justify-center h-[300px] text-gray-400 dark:text-gray-500">
      <p className="text-sm">{label}</p>
    </div>
  )
}

function BillingCycleStatusChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={100} label={({ status, count }) => `${status}: ${count}`}>
          {data.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#9CA3AF'} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}

function EngineerPerformanceChart({ data, isDark, t }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid {...gridProps(isDark)} />
        <XAxis dataKey="engineer" {...axisProps(isDark)} />
        <YAxis {...axisProps(isDark)} />
        <Tooltip />
        <Legend />
        <Bar dataKey="total_readings" name={t('charts.readings')} fill="#3B82F6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="flagged_readings" name={t('charts.flagged')} fill="#EF4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function photoColor(withPhotos, total) {
  if (total === 0) return 'text-gray-400'
  const pct = withPhotos / total
  if (pct === 1) return 'text-green-600 dark:text-green-400'
  if (pct >= 0.8) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export default function PerformancePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isDark } = useDarkMode()
  const { data: engineers = [], isLoading } = useEngineersPerformance()
  const currentYear = new Date().getFullYear()
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics({ year: currentYear })

  const summary = useMemo(() => {
    const total = engineers.length
    const totalReadings = engineers.reduce((s, e) => s + e.totalReadings, 0)
    const totalWithPhotos = engineers.reduce((s, e) => s + e.readingsWithPhotos, 0)
    const totalFlagged = engineers.reduce((s, e) => s + e.flaggedReadings, 0)
    const durEngineers = engineers.filter(e => e.avgDurationSeconds != null)
    const avgDuration = durEngineers.length
      ? Math.round(durEngineers.reduce((s, e) => s + e.avgDurationSeconds, 0) / durEngineers.length)
      : null
    const photoCoverage = totalReadings > 0 ? Math.round((totalWithPhotos / totalReadings) * 100) : 0
    return { total, avgDuration, photoCoverage, totalFlagged }
  }, [engineers])

  return (
    <div className="space-y-6">
      <PageHeader title={t('performance.title')} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title={t('performance.totalEngineers')}   value={summary.total}                       icon={Users}          color="blue"  />
        <StatCard title={t('performance.avgSubmissionTime')} value={fmtDuration(summary.avgDuration)}   icon={Clock}          color="teal"  />
        <StatCard title={t('performance.photoCoverage')}    value={`${summary.photoCoverage}%`}         icon={Image}          color="green" />
        <StatCard title={t('performance.flaggedReadings')}  value={summary.totalFlagged}                icon={AlertTriangle}  color={summary.totalFlagged > 0 ? 'red' : 'gray'} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t('performance.engineerOverview')}
          </h2>
        </div>

        {isLoading ? (
          <LoadingSpinner className="py-16" />
        ) : !engineers.length ? (
          <EmptyState title={t('performance.noReadings')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {[
                    t('performance.engineer'),
                    t('performance.readings'),
                    t('performance.cycles'),
                    t('performance.avgTime'),
                    t('performance.minTime'),
                    t('performance.maxTime'),
                    t('performance.photos'),
                    t('performance.flagged'),
                    t('performance.last'),
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {engineers.map(e => {
                  const pctColor = photoColor(e.readingsWithPhotos, e.totalReadings)
                  return (
                    <tr
                      key={e.userId}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/performance/${e.userId}`)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-brand-600 dark:text-brand-400 whitespace-nowrap">
                        {e.fullName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{e.totalReadings}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{e.totalCycles}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtDuration(e.avgDurationSeconds)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDuration(e.minDurationSeconds)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDuration(e.maxDurationSeconds)}</td>
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${pctColor}`}>
                        {e.readingsWithPhotos}/{e.totalReadings}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {e.flaggedReadings > 0 ? (
                          <span className="font-medium text-red-600 dark:text-red-400">{e.flaggedReadings}</span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {fmtDateShort(e.lastSubmissionAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title={t('charts.billingCycleStatus')} subtitle={t('charts.billingCycleStatusDesc')}>
          {analyticsLoading
            ? <ChartSkeleton />
            : !analytics?.billingCycleStatus?.length
              ? <ChartEmpty label={t('charts.noData')} />
              : <BillingCycleStatusChart data={analytics.billingCycleStatus} />
          }
        </ChartCard>

        <ChartCard title={t('charts.engineerPerformance')} subtitle={t('charts.engineerPerformanceDesc')}>
          {analyticsLoading
            ? <ChartSkeleton />
            : !analytics?.engineerPerformance?.length
              ? <ChartEmpty label={t('charts.noData')} />
              : <EngineerPerformanceChart data={analytics.engineerPerformance} isDark={isDark} t={t} />
          }
        </ChartCard>
      </div>
    </div>
  )
}
