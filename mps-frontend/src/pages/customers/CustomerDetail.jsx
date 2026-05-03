import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Pencil } from 'lucide-react'
import { useCustomer } from '../../api/hooks/useCustomers'
import { useDocTitle } from '../../hooks/useDocTitle'
import PageHeader from '../../components/PageHeader'
import Breadcrumb from '../../components/Breadcrumb'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import CustomerFormModal from './CustomerFormModal'
import { fmtDate } from '../../utils/format'

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{value || '—'}</span>
    </div>
  )
}

export default function CustomerDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: customer, isLoading } = useCustomer(id)
  const [editing, setEditing] = useState(false)

  useDocTitle(customer?.name)

  if (isLoading) return <LoadingSpinner className="py-20" />
  if (!customer) return <p className="text-gray-500 p-6">{t('common.noData')}</p>

  return (
    <div>
      <Breadcrumb items={[{ label: t('nav.customers'), to: '/customers' }, { label: customer.name }]} />
      <PageHeader
        title={customer.name}
        subtitle={customer.contactPerson}
        actions={
          <div className="flex gap-2">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:text-gray-300">
              <ArrowLeft className="h-4 w-4" />
              {t('common.back')}
            </button>
            <button onClick={() => setEditing(true)} className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              <Pencil className="h-4 w-4" />
              {t('common.edit')}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Info card */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('customers.title')}</h2>
          <InfoRow label={t('customers.name')} value={customer.name} />
          <InfoRow label={t('customers.contactPerson')} value={customer.contactPerson} />
          <InfoRow label={t('customers.phone')} value={customer.phone} />
          <InfoRow label={t('customers.email')} value={customer.email} />
          <InfoRow label={t('customers.requiresConfirmation')} value={<StatusBadge status={customer.requiresConfirmation} />} />
          <InfoRow label={t('common.createdAt')} value={fmtDate(customer.createdAt)} />
        </div>

        {/* Contracts */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('contracts.title')}</h2>
          {customer.contracts?.length ? (
            <div className="space-y-2">
              {customer.contracts.map(c => (
                <Link key={c.id} to={`/contracts/${c.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:border-brand-200 hover:bg-brand-50 dark:border-gray-800 dark:hover:bg-brand-900/20 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.contractNumber}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(c.startDate)} — {fmtDate(c.endDate)}</p>
                  </div>
                  <div className="flex gap-2">
                    <StatusBadge status={c.billingType} />
                    <StatusBadge status={c.isActive ? 'active' : 'inactive'} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.noData')}</p>
          )}
        </div>
      </div>

      <CustomerFormModal open={editing} onClose={() => setEditing(false)} initial={customer} />
    </div>
  )
}
