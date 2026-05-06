import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Users, FileText, Printer, CheckCircle, Clock,
  AlertTriangle, Receipt, Wifi,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePermission } from '../../hooks/usePermission'
import { useDocTitle } from '../../hooks/useDocTitle'
import { useDashboardStats } from '../../api/hooks/useDashboardStats'
import { usePrinters } from '../../api/hooks/usePrinters'
import { useAssignments } from '../../api/hooks/useAssignments'
import { getRoleLabel } from '../../utils/roleLabels'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import PrinterMap from '../../components/PrinterMap'
import { formatPeriod } from '../../utils/dates'
import i18n from '../../i18n'

function getGreetingKey() {
  const h = new Date().getHours()
  if (h < 12) return 'dashboard.greeting_morning'
  if (h < 18) return 'dashboard.greeting_afternoon'
  return 'dashboard.greeting_evening'
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canSubmitReadings = usePermission('can_submit_readings')
  const canManageBilling  = usePermission('can_manage_billing')
  const canManageUsers    = usePermission('can_manage_users')
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const roleLabel = getRoleLabel(user?.role?.name, lang)

  useDocTitle(t('nav.dashboard'))

  const canManageContracts = usePermission('can_manage_contracts')

  const { isLoading, stats, recentCycles } = useDashboardStats()
  const { data: printers = [] } = usePrinters()
  const { data: assignments = [] } = useAssignments()

  const today = new Date().toISOString().slice(0, 10)
  const activeAssignmentMap = Object.fromEntries(
    assignments
      .filter(a => !a.assignedUntil || a.assignedUntil.slice(0, 10) >= today)
      .reduce((map, a) => { if (!map.has(a.printerId)) map.set(a.printerId, a); return map }, new Map())
  )

  const greeting = `${t(getGreetingKey())}, ${user?.fullName?.split(' ')[0] ?? ''}`

  return (
    <div>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{greeting}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('dashboard.role')}: <span className="font-medium text-gray-700 dark:text-gray-300">{roleLabel}</span>
        </p>
      </div>

      {/* Overview stats */}
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {t('dashboard.overview')}
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 mb-8">
        <StatCard
          title={t('dashboard.totalCustomers')}
          value={isLoading ? '—' : stats.totalCustomers}
          icon={Users}
          color="blue"
        />
        <StatCard
          title={t('dashboard.activeContracts')}
          value={isLoading ? '—' : stats.activeContracts}
          icon={FileText}
          color="green"
        />
        <StatCard
          title={t('dashboard.totalPrinters')}
          value={isLoading ? '—' : stats.totalPrinters}
          icon={Printer}
          color="amber"
          subtitle={isLoading ? '' : `${stats.xsmEnabledPrinters} ${t('dashboard.xsmEnabled')}`}
        />
        <StatCard
          title={t('dashboard.openCycles')}
          value={isLoading ? '—' : stats.openCycles}
          icon={Clock}
          color="gray"
        />
      </div>

      {/* Billing cycle stats */}
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {t('dashboard.billingCycles')}
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        <Link to="/billing-cycles?status=pending_confirmation" className="block">
          <StatCard
            title={t('dashboard.pendingCycles')}
            value={isLoading ? '—' : stats.pendingCycles}
            icon={Clock}
            color="amber"
          />
        </Link>
        <Link to="/billing-cycles?status=confirmed" className="block">
          <StatCard
            title={t('dashboard.confirmedCycles')}
            value={isLoading ? '—' : stats.confirmedCycles}
            icon={CheckCircle}
            color="green"
          />
        </Link>
        <Link to="/billing-cycles?status=disputed" className="block">
          <StatCard
            title={t('dashboard.disputedCycles')}
            value={isLoading ? '—' : stats.disputedCycles}
            icon={AlertTriangle}
            color="red"
          />
        </Link>
        <Link to="/billing-cycles?status=invoiced" className="block">
          <StatCard
            title={t('dashboard.invoicedCycles')}
            value={isLoading ? '—' : stats.invoicedCycles}
            icon={Receipt}
            color="purple"
          />
        </Link>
      </div>

      {/* Recent billing cycles */}
      {recentCycles.length > 0 && (
        <div className="mb-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t('dashboard.recentActivity')}
          </p>
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
            {recentCycles.map(cycle => (
              <Link
                key={cycle.id}
                to={`/billing-cycles/${cycle.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {cycle.contract?.contractNumber ?? '—'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatPeriod(cycle.periodStart, cycle.periodEnd)}
                  </p>
                </div>
                <StatusBadge status={cycle.status} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Map widget */}
      {canManageContracts && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t('map.widgetTitle')}
            </p>
            <Link
              to="/map"
              className="text-xs text-brand-600 hover:underline dark:text-brand-400"
            >
              {t('map.widgetViewAll')} →
            </Link>
          </div>
          <PrinterMap
            printers={printers}
            activeAssignmentMap={activeAssignmentMap}
            height="350px"
            showSearch={false}
            showFullscreen={true}
            showResetView={false}
          />
        </div>
      )}

      {/* Quick actions */}
      {(canSubmitReadings || canManageBilling || canManageUsers) && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t('dashboard.quickActions')}
          </p>
          <div className="flex flex-wrap gap-3">
            {canSubmitReadings && (
              <Link
                to="/meter-readings/submit"
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-800 dark:hover:bg-brand-900/20 dark:hover:text-brand-400"
              >
                {t('dashboard.submitReading')}
              </Link>
            )}
            {canManageBilling && (
              <>
                <Link
                  to="/billing-cycles"
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-800 dark:hover:bg-brand-900/20 dark:hover:text-brand-400"
                >
                  {t('dashboard.viewBillingCycles')}
                </Link>
                <Link
                  to="/xsm-import"
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-800 dark:hover:bg-brand-900/20 dark:hover:text-brand-400"
                >
                  {t('dashboard.xsmImport')}
                </Link>
              </>
            )}
            {canManageUsers && (
              <Link
                to="/users"
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-800 dark:hover:bg-brand-900/20 dark:hover:text-brand-400"
              >
                {t('users.title')}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
