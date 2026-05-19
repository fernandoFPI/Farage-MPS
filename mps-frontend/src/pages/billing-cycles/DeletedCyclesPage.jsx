import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useDeletedCycles, useRestoreCycle } from '../../api/hooks/useBillingCycles'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import PageHeader from '../../components/PageHeader'
import DataTable from '../../components/DataTable'
import ConfirmDialog from '../../components/ConfirmDialog'
import { formatPeriod } from '../../utils/dates'
import { fmtDateTime } from '../../utils/format'

export default function DeletedCyclesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role?.name === 'admin'

  const { data: deletedCycles = [], isLoading } = useDeletedCycles()
  const restoreMutation = useRestoreCycle()
  const [restoring, setRestoring] = useState(null)

  if (!isAdmin) {
    navigate('/billing-cycles', { replace: true })
    return null
  }

  async function handleRestore() {
    try {
      await restoreMutation.mutateAsync(restoring.id)
      showToast({ title: t('billingCycles.restored'), variant: 'success' })
      setRestoring(null)
    } catch (err) {
      showToast({ title: err.response?.data?.error || err.message, variant: 'error' })
    }
  }

  const columns = [
    {
      key: 'cycleName',
      label: t('billingCycles.title'),
      render: r => (
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{r.cycleName}</p>
          <p className="text-xs text-gray-400">{r.contractNumber ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'period',
      label: t('billingCycles.period'),
      render: r => formatPeriod(r.periodStart, r.periodEnd),
    },
    {
      key: 'deletedAt',
      label: t('billingCycles.deletedAt'),
      render: r => (
        <div>
          <p className="text-sm text-gray-700 dark:text-gray-300">{fmtDateTime(r.deletedAt)}</p>
          {r.deletedByName && <p className="text-xs text-gray-400">{r.deletedByName}</p>}
        </div>
      ),
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: r => (
        <button
          onClick={() => setRestoring(r)}
          className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-brand-800/50 dark:text-brand-400 dark:hover:bg-brand-900/20"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('billingCycles.restore')}
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('billingCycles.recycleBin')}
        actions={
          <button
            onClick={() => navigate('/billing-cycles')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('common.back')}
          </button>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
        <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-sm text-amber-700 dark:text-amber-400">{t('billingCycles.recycleBinNote')}</p>
      </div>

      <DataTable
        columns={columns}
        data={deletedCycles}
        loading={isLoading}
        emptyMessage={t('billingCycles.recycleBinEmpty')}
      />

      <ConfirmDialog
        open={!!restoring}
        onClose={() => setRestoring(null)}
        onConfirm={handleRestore}
        title={t('billingCycles.restoreTitle')}
        description={restoring
          ? `${restoring.cycleName}\n${t('billingCycles.period')}: ${formatPeriod(restoring.periodStart, restoring.periodEnd)}`
          : ''}
        loading={restoreMutation.isPending}
        confirmLabel={t('billingCycles.restore')}
        confirmClassName="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
      />
    </div>
  )
}
