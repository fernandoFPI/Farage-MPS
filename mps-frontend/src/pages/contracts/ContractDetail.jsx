import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'
import { useContract } from '../../api/hooks/useContracts'
import { useDeleteAssignment } from '../../api/hooks/useAssignments'
import { useDocTitle } from '../../hooks/useDocTitle'
import PageHeader from '../../components/PageHeader'
import Breadcrumb from '../../components/Breadcrumb'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import EmptyState from '../../components/EmptyState'
import ConfirmDialog from '../../components/ConfirmDialog'
import ContractFormModal from './ContractFormModal'
import AssignPrinterModal from './AssignPrinterModal'
import { usePermission } from '../../hooks/usePermission'
import { fmtDate, fmtMoney } from '../../utils/format'
import { formatAmount } from '../../utils/currency'

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{value ?? '—'}</span>
    </div>
  )
}

export default function ContractDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: contract, isLoading } = useContract(id)
  const deleteAssignment = useDeleteAssignment()
  const [editing, setEditing] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [editAssign, setEditAssign] = useState(null)
  const [removingAssign, setRemovingAssign] = useState(null)

  useDocTitle(contract?.contractNumber)

  if (isLoading) return <LoadingSpinner className="py-20" />
  if (!contract) return <p className="text-gray-500 p-6">{t('common.noData')}</p>

  const canViewFinancial = usePermission('can_view_contract_pricing')
  const canManageContracts = usePermission('can_edit_contracts')
  const isMinVol = contract.billingType === 'minimum_volume'
  const isPsg = contract.contractMode === 'psg' || contract.contractMode === 'psg_simple'

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: t('nav.contracts'), to: '/contracts' }, { label: contract.contractNumber }]} />
      <PageHeader
        title={contract.contractNumber}
        subtitle={contract.customer?.name}
        actions={
          <div className="flex gap-2">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:text-gray-300">
              <ArrowLeft className="h-4 w-4" />{t('common.back')}
            </button>
            {canManageContracts && (
              <button onClick={() => setEditing(true)} className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                <Pencil className="h-4 w-4" />{t('common.edit')}
              </button>
            )}
          </div>
        }
      />

      {/* Contract info */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('contracts.title')}</h2>
        <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
          <div>
            <InfoRow label={t('customers.title')} value={<Link to={`/customers/${contract.customerId}`} className="text-brand-600 dark:text-brand-400 hover:underline">{contract.customer?.name}</Link>} />
            <InfoRow label={t('contracts.contractNumber')} value={contract.contractNumber} />
            {contract.officialContractNumber && (
              <InfoRow label={t('contracts.officialContractNumber')} value={
                <span className="flex items-center gap-1.5">
                  {contract.officialContractNumber}
                  <span className="text-xs text-gray-400 dark:text-gray-500">({t('contracts.invoiceReference')})</span>
                </span>
              } />
            )}
            <InfoRow label={t('contracts.contractMode')} value={
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                contract.contractMode === 'psg'
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  : contract.contractMode === 'psg_simple'
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {contract.contractMode === 'psg' ? t('contracts.modeBadgePsg')
                  : contract.contractMode === 'psg_simple' ? t('contracts.modeBadgePsgSimple')
                  : t('contracts.modeBadgeOsg')}
              </span>
            } />
            {contract.serviceType && (
              <InfoRow label={t('contracts.serviceType')} value={
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {contract.serviceType}
                </span>
              } />
            )}
            {!isPsg && <InfoRow label={t('contracts.billingType')} value={<StatusBadge status={contract.billingType} />} />}
            <InfoRow label={t('contracts.isActive')} value={<StatusBadge status={contract.isActive ? 'active' : 'inactive'} />} />
            <InfoRow label={t('contracts.startDate')} value={fmtDate(contract.startDate)} />
            <InfoRow label={t('contracts.endDate')} value={fmtDate(contract.endDate)} />
            <InfoRow label={t('contracts.confirmationSlaDays')} value={contract.confirmationSlaDays} />
          </div>
          {canViewFinancial && (
          <div>
            {isPsg ? (
              <>
                <InfoRow label={t('contracts.a4Price')} value={fmtMoney(contract.a4Price)} />
                <InfoRow label={t('contracts.a3Price')} value={fmtMoney(contract.a3Price)} />
              </>
            ) : (
              <>
                <InfoRow label={t('contracts.fixedCharge')} value={fmtMoney(contract.fixedCharge)} />
                <InfoRow label={t('contracts.bwPrice')} value={fmtMoney(contract.bwPrice)} />
                <InfoRow label={t('contracts.colorPrice')} value={fmtMoney(contract.colorPrice)} />
                {isMinVol && <>
                  <InfoRow label={t('contracts.minBwPages')} value={contract.minBwPages} />
                  <InfoRow label={t('contracts.minColorPages')} value={contract.minColorPages} />
                  <InfoRow label={t('contracts.excessBwPrice')} value={fmtMoney(contract.excessBwPrice)} />
                  <InfoRow label={t('contracts.excessColorPrice')} value={fmtMoney(contract.excessColorPrice)} />
                </>}
              </>
            )}
          </div>
          )}
        </div>
      </div>

      {/* Invoice Rules */}
      {canViewFinancial && contract.invoiceRules && (() => {
        const r = contract.invoiceRules
        const DEFAULT = { fixedChargeFrequency: 'monthly', excessFrequency: 'monthly', overrideInvoicing: 'separate', groupingStrategy: 'contract' }
        const badge = (val, def) => val !== def
          ? <span className="ms-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{val}</span>
          : <span className="text-gray-700 dark:text-gray-300">{val}</span>
        return (
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('contracts.invoiceRules')}</h2>
            <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
              <div>
                <InfoRow label={t('contracts.fixedChargeFrequency')} value={badge(r.fixedChargeFrequency, DEFAULT.fixedChargeFrequency)} />
                <InfoRow label={t('contracts.excessFrequency')} value={badge(r.excessFrequency, DEFAULT.excessFrequency)} />
                {r.contractStartDate && <InfoRow label={t('contracts.contractStartDate')} value={r.contractStartDate} />}
              </div>
              <div>
                <InfoRow label={t('contracts.overrideInvoicing')} value={badge(r.overrideInvoicing, DEFAULT.overrideInvoicing)} />
                <InfoRow label={t('contracts.groupingStrategy')} value={badge(r.groupingStrategy, DEFAULT.groupingStrategy)} />
              </div>
            </div>
          </div>
        )
      })()}

      {/* Printers */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('printers.title')}</h2>
          {canManageContracts && (
            <button onClick={() => { setEditAssign(null); setAssignOpen(true) }}
              className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">
              <Plus className="h-3.5 w-3.5" />{t('contracts.assignPrinter')}
            </button>
          )}
        </div>
        {contract.printers?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead><tr>
                {[
                  t('printers.serialNumber'), t('printers.model'), t('printers.city'),
                  t('assignments.assignedFrom'), t('assignments.assignedUntil'),
                  ...(!isPsg && canViewFinancial ? [t('assignments.fixedChargeOverride'), t('assignments.bwPriceOverride'), t('assignments.colorPriceOverride')] : []),
                  ...(!isPsg && isMinVol && canViewFinancial ? [t('assignments.overrideMinBwPages'), t('assignments.overrideMinColorPages')] : []),
                  ...(canManageContracts ? [t('common.actions')] : []),
                ].map(h => (
                  <th key={h} className="px-3 py-2 text-start text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {contract.printers.map(cp => (
                  <tr key={cp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-3 py-2 text-sm"><Link to={`/printers/${cp.printerId}`} className="text-brand-600 dark:text-brand-400 hover:underline">{cp.printer?.serialNumber}</Link></td>
                    <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{cp.printer?.model}</td>
                    <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{cp.printer?.city}</td>
                    <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{fmtDate(cp.assignedFrom)}</td>
                    <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{fmtDate(cp.assignedUntil)}</td>
                    {!isPsg && canViewFinancial && (
                      <td className="px-3 py-2 text-sm">
                        {cp.fixedCharge != null
                          ? <span className="font-medium text-brand-600 dark:text-brand-400">{formatAmount(cp.fixedCharge, contract.currency)}</span>
                          : <span className="text-gray-400 dark:text-gray-500 italic text-xs">{t('assignments.contractDefault')}</span>
                        }
                      </td>
                    )}
                    {!isPsg && canViewFinancial && (
                      <td className="px-3 py-2 text-sm">
                        {cp.bwPrice != null
                          ? <span className="font-medium text-brand-600 dark:text-brand-400">{formatAmount(cp.bwPrice, contract.currency)}</span>
                          : <span className="text-gray-400 dark:text-gray-500 italic text-xs">{t('assignments.contractDefault')}</span>
                        }
                      </td>
                    )}
                    {!isPsg && canViewFinancial && (
                      <td className="px-3 py-2 text-sm">
                        {cp.colorPrice != null
                          ? <span className="font-medium text-brand-600 dark:text-brand-400">{formatAmount(cp.colorPrice, contract.currency)}</span>
                          : <span className="text-gray-400 dark:text-gray-500 italic text-xs">{t('assignments.contractDefault')}</span>
                        }
                      </td>
                    )}
                    {!isPsg && isMinVol && canViewFinancial && (
                      <td className="px-3 py-2 text-sm">
                        {cp.overrideMinBwPages != null
                          ? <span className="font-medium text-amber-600 dark:text-amber-400">{cp.overrideMinBwPages.toLocaleString()}</span>
                          : <span className="text-gray-400 dark:text-gray-500 italic text-xs">{t('assignments.contractDefault')}</span>
                        }
                      </td>
                    )}
                    {!isPsg && isMinVol && canViewFinancial && (
                      <td className="px-3 py-2 text-sm">
                        {cp.overrideMinColorPages != null
                          ? <span className="font-medium text-amber-600 dark:text-amber-400">{cp.overrideMinColorPages.toLocaleString()}</span>
                          : <span className="text-gray-400 dark:text-gray-500 italic text-xs">{t('assignments.contractDefault')}</span>
                        }
                      </td>
                    )}
                    {canManageContracts && (
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button onClick={() => { setEditAssign(cp); setAssignOpen(true) }} className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setRemovingAssign(cp)} className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400">✕</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title={t('common.noData')} />}
      </div>


<ContractFormModal open={editing} onClose={() => setEditing(false)} initial={contract} />
      <AssignPrinterModal open={assignOpen} onClose={() => { setAssignOpen(false); setEditAssign(null) }}
        contractId={id} contract={contract} initial={editAssign} />
      <ConfirmDialog
        open={!!removingAssign}
        onClose={() => setRemovingAssign(null)}
        onConfirm={async () => { await deleteAssignment.mutateAsync(removingAssign.id); setRemovingAssign(null) }}
        title="Remove Assignment"
        description={`Remove ${removingAssign?.printer?.serialNumber} from this contract?`}
        loading={deleteAssignment.isPending}
      />
    </div>
  )
}
