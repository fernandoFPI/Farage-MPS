import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Users, FileText, Printer } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePermission } from '../hooks/usePermission'
import { getRoleLabel } from '../utils/roleLabels'
import { useBillingCycles } from '../api/hooks/useBillingCycles'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import i18n from '../i18n'

function getGreetingKey() {
  const h = new Date().getHours()
  if (h < 12) return 'dashboard.greeting_morning'
  if (h < 18) return 'dashboard.greeting_afternoon'
  return 'dashboard.greeting_evening'
}

export default function Dashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canSubmitReadings = usePermission('can_submit_readings')
  const canManageBilling  = usePermission('can_manage_billing')
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const roleLabel = getRoleLabel(user?.role?.name, lang)

  const greeting = `${t(getGreetingKey())}, ${user?.fullName?.split(' ')[0] ?? ''}`

  const { data: recentCycles = [] } = useBillingCycles()
  const displayCycles = recentCycles.slice(0, 8)

  return (
    <div>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{greeting}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('dashboard.role')}: <span className="font-medium text-gray-700 dark:text-gray-300">{roleLabel}</span>
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <StatCard title={t('nav.customers')} value="—" icon={Users}    color="blue" />
        <StatCard title={t('nav.contracts')} value="—" icon={FileText} color="green" />
        <StatCard title={t('nav.printers')}  value="—" icon={Printer}  color="amber" />
      </div>

      {/* Quick actions */}
      {(canSubmitReadings || canManageBilling) && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t('dashboard.quickActions')}
          </h2>
          <div className="flex flex-wrap gap-3">
            {canSubmitReadings && (
              <Link
                to="/meter-readings"
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
          </div>
        </div>
      )}

      {/* Recent billing cycles */}
      {displayCycles.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t('dashboard.recentActivity')}
            </h2>
            <Link to="/billing-cycles" className="text-xs text-brand-600 hover:underline dark:text-brand-400">
              View all
            </Link>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 overflow-hidden">
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {displayCycles.map(cycle => (
                <li key={cycle.id}>
                  <Link
                    to={`/billing-cycles/${cycle.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {cycle.cycleName ?? `${cycle.customerName ?? '—'}`}
                    </span>
                    <StatusBadge status={cycle.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
