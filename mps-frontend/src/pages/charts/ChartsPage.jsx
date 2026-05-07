import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { useAnalytics } from '../../api/hooks/useAnalytics'
import { useCustomers } from '../../api/hooks/useCustomers'
import { useDarkMode } from '../../hooks/useTheme'
import { useDocTitle } from '../../hooks/useDocTitle'
import PageHeader from '../../components/PageHeader'

const COLORS = {
  bw:      '#3B82F6',
  color:   '#8B5CF6',
  revenue: '#10B981',
  warning: '#F59E0B',
  danger:  '#EF4444',
  gray:    '#6B7280',
}

const SELECT_CLS = [
  'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900',
  'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
  'dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100',
].join(' ')

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

function axisProps(isDark) {
  return { tick: { fill: isDark ? '#9CA3AF' : '#6B7280', fontSize: 12 } }
}

function gridProps(isDark) {
  return { stroke: isDark ? '#374151' : '#F3F4F6', strokeDasharray: '3 3' }
}

// ── Chart 1: Monthly Usage Trend ──────────────────────────────────────────────
function MonthlyUsageTrendChart({ data, isDark, t }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid {...gridProps(isDark)} />
        <XAxis dataKey="month" {...axisProps(isDark)} />
        <YAxis tickFormatter={v => v.toLocaleString()} {...axisProps(isDark)} />
        <Tooltip formatter={v => v.toLocaleString()} />
        <Legend />
        <Line type="monotone" dataKey="total_bw"    name={t('charts.bwPages')}    stroke={COLORS.bw}    dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="total_color" name={t('charts.colorPages')} stroke={COLORS.color} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Chart 2: Top Customers by Volume ─────────────────────────────────────────
function TopCustomersChart({ data, isDark, t }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid {...gridProps(isDark)} />
        <XAxis type="number" tickFormatter={v => v.toLocaleString()} {...axisProps(isDark)} />
        <YAxis type="category" dataKey="customer" width={120} {...axisProps(isDark)} />
        <Tooltip formatter={v => v.toLocaleString()} />
        <Legend />
        <Bar dataKey="total_bw"    name={t('charts.bwPages')}    stackId="a" fill={COLORS.bw}    />
        <Bar dataKey="total_color" name={t('charts.colorPages')} stackId="a" fill={COLORS.color} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Chart 4: Contract Utilization ─────────────────────────────────────────────
function ContractUtilizationChart({ data, isDark, t }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid {...gridProps(isDark)} />
        <XAxis dataKey="contract_number" {...axisProps(isDark)} />
        <YAxis tickFormatter={v => v.toLocaleString()} {...axisProps(isDark)} />
        <Tooltip formatter={v => v.toLocaleString()} />
        <Legend />
        <Bar dataKey="min_bw_pages"    name={t('charts.bwMinimum')}    fill={COLORS.gray}    opacity={0.5} />
        <Bar dataKey="used_bw"         name={t('charts.bwUsed')}       fill={COLORS.bw}               />
        <Bar dataKey="min_color_pages" name={t('charts.colorMinimum')} fill={COLORS.warning} opacity={0.5} />
        <Bar dataKey="used_color"      name={t('charts.colorUsed')}    fill={COLORS.color}            />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Chart 5: Revenue by Customer ──────────────────────────────────────────────
function RevenueByCustomerChart({ data, isDark, t }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid {...gridProps(isDark)} />
        <XAxis dataKey="customer" {...axisProps(isDark)} />
        <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} {...axisProps(isDark)} />
        <Tooltip formatter={v => `${Number(v).toLocaleString()} IQD`} />
        <Bar dataKey="estimated_revenue" name={t('charts.revenue')} fill={COLORS.revenue} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Chart 6: Monthly Revenue Trend ───────────────────────────────────────────
function MonthlyRevenueTrendChart({ data, isDark, t }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid {...gridProps(isDark)} />
        <XAxis dataKey="month" {...axisProps(isDark)} />
        <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} {...axisProps(isDark)} />
        <Tooltip formatter={v => `${Number(v).toLocaleString()} IQD`} />
        <Line type="monotone" dataKey="estimated_revenue" name={t('charts.revenue')} stroke={COLORS.revenue} strokeWidth={2} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ChartsPage() {
  const { t } = useTranslation()
  const { isDark } = useDarkMode()
  useDocTitle(t('charts.title'))

  const currentYear = new Date().getFullYear()
  const [year,       setYear]       = useState(currentYear)
  const [customerId, setCustomerId] = useState('')

  const { data: customers = [] } = useCustomers()
  const { data, isLoading }      = useAnalytics({ year, ...(customerId && { customerId }) })

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  const noData = (key) => !data?.[key]?.length

  function chart(key, Component) {
    if (isLoading)   return <ChartSkeleton />
    if (noData(key)) return <ChartEmpty label={t('charts.noData')} />
    return <Component data={data[key]} isDark={isDark} t={t} />
  }

  return (
    <div>
      <PageHeader title={t('charts.title')} subtitle={t('charts.subtitle')} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">{t('charts.year')}:</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className={SELECT_CLS}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">{t('charts.customer')}:</label>
          <select
            value={customerId}
            onChange={e => setCustomerId(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">{t('charts.allCustomers')}</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <ChartCard title={t('charts.monthlyUsageTrend')} subtitle={t('charts.monthlyUsageTrendDesc')} className="lg:col-span-2">
          {chart('monthlyUsageTrend', MonthlyUsageTrendChart)}
        </ChartCard>

        <ChartCard title={t('charts.topCustomers')} subtitle={t('charts.topCustomersDesc')}>
          {chart('topCustomersByVolume', TopCustomersChart)}
        </ChartCard>

        <ChartCard title={t('charts.contractUtilization')} subtitle={t('charts.contractUtilizationDesc')} className="lg:col-span-2">
          {chart('contractUtilization', ContractUtilizationChart)}
        </ChartCard>

        <ChartCard title={t('charts.revenueByCustomer')} subtitle={t('charts.revenueByCustomerDesc')}>
          {chart('revenueByCustomer', RevenueByCustomerChart)}
        </ChartCard>

        <ChartCard title={t('charts.monthlyRevenue')} subtitle={t('charts.monthlyRevenueDesc')}>
          {chart('monthlyRevenueTrend', MonthlyRevenueTrendChart)}
        </ChartCard>

      </div>
    </div>
  )
}
