import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Plus, Trash2, Layers, BarChart2 } from 'lucide-react'
import SearchableSelect from '../../components/SearchableSelect'
import {
  useContractGroup,
  useContractGroupSummary,
  useAddGroupMember,
  useRemoveGroupMember,
} from '../../api/hooks/useContractGroups'
import { useContracts } from '../../api/hooks/useContracts'
import { useToast } from '../../components/Toast'
import { useDocTitle } from '../../hooks/useDocTitle'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import ConfirmDialog from '../../components/ConfirmDialog'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import Breadcrumb from '../../components/Breadcrumb'
import { formatAmount, formatNumber } from '../../utils/currency'
// ── Add member modal ──────────────────────────────────────────────────────────
function AddMemberModal({ open, onClose, groupId, existingContractIds }) {
  const { t } = useTranslation()
  const { data: allContracts = [] } = useContracts({ isActive: true })
  const addMember = useAddGroupMember()
  const { showToast } = useToast()
  const [contractId, setContractId] = useState(null)
  const [err, setErr] = useState('')

  const available = allContracts.filter(c => !existingContractIds.includes(c.id))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!contractId) return setErr(t('contractGroups.selectContract'))
    setErr('')
    try {
      await addMember.mutateAsync({ groupId, contractId })
      showToast({ title: t('common.saved'), variant: 'success' })
      setContractId(null)
      onClose()
    } catch (ex) {
      setErr(ex.response?.data?.error || ex.message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('contractGroups.addMember')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={addMember.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="submit" form="add-member-form" disabled={addMember.isPending}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {addMember.isPending ? t('common.loading') : t('common.add')}
          </button>
        </>
      }
    >
      <form id="add-member-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t('nav.contracts')} required>
          <SearchableSelect
            value={contractId}
            onChange={setContractId}
            clearable={false}
            placeholder="—"
            options={available.map(c => ({
              value: c.id,
              label: `${c.contractNumber} — ${c.customerName}`,
              group: c.customerName ?? '',
            }))}
          />
        </FormField>
        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      </form>
    </Modal>
  )
}

// ── Summary table ─────────────────────────────────────────────────────────────
function GroupSummaryPanel({ groupId, currency, t }) {
  const now = new Date()
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [period, setPeriod] = useState(defaultPeriod)
  const periodStart = period ? `${period}-01` : null
  const { data: summary, isLoading, isError } = useContractGroupSummary(groupId, periodStart)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-gray-400" />
          {t('contractGroups.groupSummary')}
        </h2>
        <input
          type="month"
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300"
        />
      </div>
      <div className="px-5 py-4">
        {isLoading && <LoadingSpinner />}
        {isError && <p className="text-sm text-red-500">{t('common.error')}</p>}
        {summary && (
          <div className="space-y-4">
            {/* Group totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t('contractGroups.totalBw'),    value: formatNumber(summary.totalBw) },
                { label: t('contractGroups.totalColor'), value: formatNumber(summary.totalColor) },
                { label: t('contractGroups.groupMinBw'),    value: formatNumber(summary.groupMinBw) },
                { label: t('contractGroups.groupMinColor'), value: formatNumber(summary.groupMinColor) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-gray-100 dark:border-gray-800 px-4 py-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{value}</p>
                </div>
              ))}
            </div>

            {/* Exceeded banner */}
            {(summary.groupBwExceeded || summary.groupColorExceeded) && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {t('contractGroups.groupExceeded', {
                  bwExcess:    formatNumber(summary.groupBwExcess    ?? 0),
                  colorExcess: formatNumber(summary.groupColorExcess ?? 0),
                })}
              </div>
            )}

            {/* Per-contract breakdown */}
            <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-4 py-2 text-start font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase">{t('contracts.contractNumber')}</th>
                    <th className="px-4 py-2 text-end font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase">{t('contractGroups.billableBw')}</th>
                    <th className="px-4 py-2 text-end font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase">{t('contractGroups.billableColor')}</th>
                    <th className="px-4 py-2 text-end font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase">{t('billingCycles.fixedCharge')}</th>
                    <th className="px-4 py-2 text-end font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase">{t('billingCycles.total')}</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {(summary.contracts ?? []).map(c => (
                    <tr key={c.contractId}
                      className={c.isBreachingContract ? 'bg-red-50/60 dark:bg-red-950/20' : ''}>
                      <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-200">
                        {c.contractNumber}
                        {c.isBreachingContract && (
                          <span className="ml-2 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400">
                            {t('contractGroups.breaching')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-end text-gray-600 dark:text-gray-400">{formatNumber(c.billableBw)}</td>
                      <td className="px-4 py-2 text-end text-gray-600 dark:text-gray-400">{formatNumber(c.billableColor)}</td>
                      <td className="px-4 py-2 text-end text-gray-600 dark:text-gray-400">{formatAmount(c.fixedCharge, currency)}</td>
                      <td className="px-4 py-2 text-end font-semibold text-gray-900 dark:text-gray-100">{formatAmount(c.total, currency)}</td>
                      <td className="px-4 py-2 text-end">
                        {c.cycleId && (
                          <Link to={`/billing-cycles/${c.cycleId}`}
                            className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                            {t('contractGroups.viewCycle')}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ContractGroupDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const { data: group, isLoading } = useContractGroup(id)
  useDocTitle(group?.name ?? t('contractGroups.title'))
  const removeMember = useRemoveGroupMember()
  const { showToast } = useToast()

  const [addOpen, setAddOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState(null)

  async function handleRemove(contractId) {
    try {
      await removeMember.mutateAsync({ groupId: id, contractId })
      showToast({ title: t('common.deleted'), variant: 'success' })
    } catch (err) {
      showToast({ title: err.response?.data?.error || err.message, variant: 'error' })
    }
    setRemoveTarget(null)
  }

  if (isLoading) return <LoadingSpinner />
  if (!group) return <EmptyState icon={Layers} title={t('contractGroups.notFound')} />

  const existingIds = (group.members ?? []).map(m => m.contractId)

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: t('contractGroups.title'), to: '/contract-groups' },
        { label: group.name },
      ]} />

      <PageHeader
        title={group.name}
        subtitle={`${t('contractGroups.groupMinBw')}: ${formatNumber(group.groupMinBw)} | ${t('contractGroups.groupMinColor')}: ${formatNumber(group.groupMinColor)}`}
        actions={
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            <Plus className="h-4 w-4" />
            {t('contractGroups.addMember')}
          </button>
        }
      />

      {/* Members table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('contractGroups.members')}</h2>
        </div>
        {group.members?.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">{t('contractGroups.noMembers')}</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-50 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('contracts.contractNumber')}</th>
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('customers.title')}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {group.members.map(m => (
                <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <Link to={`/contracts/${m.contractId}`}
                      className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">
                      {m.contractNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">{m.customerName}</td>
                  <td className="px-5 py-3 text-end">
                    <button onClick={() => setRemoveTarget(m)}
                      className="rounded p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary panel */}
      <GroupSummaryPanel groupId={id} currency="IQD" t={t} />

      <AddMemberModal open={addOpen} onClose={() => setAddOpen(false)} groupId={id} existingContractIds={existingIds} />

      <ConfirmDialog
        open={!!removeTarget}
        title={t('contractGroups.removeMember')}
        description={t('contractGroups.removeConfirm', { contract: removeTarget?.contractNumber })}
        onConfirm={() => handleRemove(removeTarget.contractId)}
        onClose={() => setRemoveTarget(null)}
        loading={removeMember.isPending}
      />
    </div>
  )
}
