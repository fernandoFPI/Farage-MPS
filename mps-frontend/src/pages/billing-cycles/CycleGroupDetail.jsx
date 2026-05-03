import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useCycleGroup, useDeleteCycleGroup } from '../../api/hooks/useCycleGroups'
import { useBillingCycleGroupSummary } from '../../api/hooks/useCycleGroups'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import PageHeader from '../../components/PageHeader'
import Breadcrumb from '../../components/Breadcrumb'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useDocTitle } from '../../hooks/useDocTitle'
import { formatAmount } from '../../utils/currency'
import { useState } from 'react'

export default function CycleGroupDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role?.name === 'admin'

  const [deleteOpen, setDeleteOpen] = useState(false)
  const { data: group, isLoading: groupLoading } = useCycleGroup(id)
  const deleteMutation = useDeleteCycleGroup()

  // Group summary fetched from the invoicing cycle (position 3)
  const invoicingCycle = group?.cycles?.find(c => c.groupPosition === 3)
  const { data: groupSummary, isLoading: summaryLoading } = useBillingCycleGroupSummary(
    invoicingCycle?.id ?? null
  )

  useDocTitle(group ? `Quarterly Group — ${group.cycles?.[0]?.cycleName ?? ''}` : undefined)

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(id)
      showToast({ title: 'Cycle group deleted', variant: 'success' })
      navigate('/billing-cycles')
    } catch (err) {
      showToast({ title: err.response?.data?.error || err.message, variant: 'error' })
      setDeleteOpen(false)
    }
  }

  if (groupLoading) return <LoadingSpinner className="py-20" />
  if (!group) return <p className="p-6 text-gray-500">{t('common.noData')}</p>

  const currency = groupSummary?.currency ?? 'IQD'

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: t('nav.billingCycles'), to: '/billing-cycles' },
        { label: t('billingCycles.quarterlyInvoiceSummary') },
      ]} />
      <PageHeader
        title={t('billingCycles.quarterlyInvoiceSummary')}
        subtitle={groupSummary ? `${groupSummary.customerName} — ${groupSummary.contractNumber}` : undefined}
        actions={
          <div className="flex gap-2">
            <button onClick={() => navigate(-1)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:text-gray-300">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t('common.back')}
            </button>
            {isAdmin && (
              <button
                onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20"
              >
                <Trash2 className="h-4 w-4" />Unlink Group
              </button>
            )}
          </div>
        }
      />

      {/* Cycles */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Cycles</h2>
        <div className="space-y-2">
          {group.cycles?.map(c => (
            <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 dark:text-gray-500 w-14">Month {c.groupPosition}</span>
                <Link to={`/billing-cycles/${c.id}`} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
                  {c.cycleName}
                </Link>
              </div>
              <StatusBadge status={c.status} />
            </div>
          ))}
        </div>
      </div>

      {/* Group summary */}
      {summaryLoading ? (
        <LoadingSpinner className="py-10" />
      ) : groupSummary ? (
        <div className="rounded-lg border border-teal-200 bg-white p-5 shadow-sm dark:border-teal-800 dark:bg-gray-900">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
            {t('billingCycles.quarterlyInvoiceSummary')}
          </h2>
          <div className="space-y-2">
            {groupSummary.cycles?.map((c, i) => (
              <div key={i}>
                {groupSummary.combinedInvoice ? (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{c.cycleName}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatAmount(c.total, currency)}</span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-3 mb-2">
                    <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 mb-2">{c.cycleName}</p>
                    {c.billing && (
                      <div className="space-y-1 text-sm">
                        {c.billing.bwCost != null && <div className="flex justify-between"><span className="text-gray-500">{t('billingCycles.bwCost')}</span><span>{formatAmount(c.billing.bwCost, currency)}</span></div>}
                        {c.billing.colorCost != null && <div className="flex justify-between"><span className="text-gray-500">{t('billingCycles.colorCost')}</span><span>{formatAmount(c.billing.colorCost, currency)}</span></div>}
                        {c.billing.fixedCharge != null && <div className="flex justify-between"><span className="text-gray-500">{t('billingCycles.fixedCharge')}</span><span>{formatAmount(c.billing.fixedCharge, currency)}</span></div>}
                        <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-1 font-semibold">
                          <span>{t('billingCycles.total')}</span>
                          <span className="text-brand-600 dark:text-brand-400">{formatAmount(c.total, currency)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between border-t-2 border-teal-200 dark:border-teal-700 pt-3 mt-2">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('billingCycles.grandTotal')}</span>
              <span className="text-base font-bold text-teal-600 dark:text-teal-400">{formatAmount(groupSummary.grandTotal, currency)}</span>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Unlink Quarterly Group"
        description="This will restore all 3 cycles to confirmed status and delete the group. The cycles will no longer be grouped for invoicing."
        loading={deleteMutation.isPending}
        confirmLabel="Unlink Group"
        confirmClassName="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      />
    </div>
  )
}
