import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Eye, Trash2 } from 'lucide-react'
import { useContracts, useDeleteContract } from '../../api/hooks/useContracts'
import { useCustomers } from '../../api/hooks/useCustomers'
import PageHeader from '../../components/PageHeader'
import DataTable from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import ConfirmDialog from '../../components/ConfirmDialog'
import ErrorAlert from '../../components/ErrorAlert'
import ContractFormModal from './ContractFormModal'
import { fmtDate, fmtMoney } from '../../utils/format'

export default function ContractsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [customerId, setCustomerId] = useState('')
  const [isActive, setIsActive] = useState('')
  const [contractMode, setContractMode] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  const params = {}
  if (customerId) params.customerId = customerId
  if (isActive !== '') params.isActive = isActive
  if (contractMode) params.contractMode = contractMode
  if (serviceType) params.serviceType = serviceType

  const { data, isLoading } = useContracts(params)
  const { data: customers = [] } = useCustomers()
  const deleteMutation = useDeleteContract()

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(row) { setEditing(row); setModalOpen(true) }

  async function handleDelete() {
    setDeleteError('')
    try {
      await deleteMutation.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (err) {
      setDeleteError(err.response?.data?.error || err.message)
    }
  }

  const columns = [
    { key: 'contractNumber', label: t('contracts.contractNumber') },
    { key: 'customerName', label: t('customers.title'), className: 'hidden md:table-cell' },
    { key: 'contractMode', label: t('contracts.contractMode'), className: 'hidden sm:table-cell',
      render: r => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          r.contractMode === 'psg'
            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
            : r.contractMode === 'psg_simple'
            ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        }`}>
          {r.contractMode === 'psg' ? t('contracts.modeBadgePsg')
            : r.contractMode === 'psg_simple' ? t('contracts.modeBadgePsgSimple')
            : t('contracts.modeBadgeOsg')}
        </span>
      ),
    },
    { key: 'serviceType', label: t('contracts.serviceType'), className: 'hidden md:table-cell',
      render: r => r.serviceType
        ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{r.serviceType}</span>
        : <span className="text-xs text-gray-400">—</span>,
    },
    { key: 'billingType', label: t('contracts.billingType'), className: 'hidden lg:table-cell',
      render: r => r.contractMode !== 'osg' ? <span className="text-xs text-gray-400">—</span> : <StatusBadge status={r.billingType} /> },
    { key: 'fixedCharge', label: t('contracts.fixedCharge'), className: 'hidden lg:table-cell',
      render: r => r.contractMode !== 'osg' ? <span className="text-xs text-gray-400">—</span> : fmtMoney(r.fixedCharge) },
    { key: 'startDate', label: t('contracts.startDate'), className: 'hidden lg:table-cell',
      render: r => fmtDate(r.startDate) },
    { key: 'endDate', label: t('contracts.endDate'), className: 'hidden lg:table-cell',
      render: r => fmtDate(r.endDate) },
    { key: 'isActive', label: t('contracts.isActive'),
      render: r => <StatusBadge status={r.isActive ? 'active' : 'inactive'} /> },
    { key: 'actions', label: t('common.actions'),
      render: r => (
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/contracts/${r.id}`)} className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"><Eye className="h-4 w-4" /></button>
          <button onClick={() => openEdit(r)} className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => { setDeleteError(''); setDeleting(r) }} className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('contracts.title')}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none">
              <option value="">{t('customers.title')}: All</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={isActive} onChange={e => setIsActive(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none">
              <option value="">{t('contracts.isActive')}: All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <select value={contractMode} onChange={e => setContractMode(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none">
              <option value="">{t('contracts.contractMode')}: All</option>
              <option value="osg">{t('contracts.modeBadgeOsg')}</option>
              <option value="psg">{t('contracts.modeBadgePsg')}</option>
              <option value="psg_simple">{t('contracts.modeBadgePsgSimple')}</option>
            </select>
            <select value={serviceType} onChange={e => setServiceType(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none">
              <option value="">{t('contracts.serviceType')}: All</option>
              {['MPS', 'FSMA', 'LS', 'LO', 'SMA'].map(st => <option key={st} value={st}>{st}</option>)}
            </select>
            <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              <Plus className="h-4 w-4" />{t('contracts.addContract')}
            </button>
          </div>
        }
      />
      {deleteError && <div className="mb-4"><ErrorAlert message={deleteError} /></div>}
      <DataTable columns={columns} data={data} loading={isLoading} emptyMessage={t('common.noData')} />
      <ContractFormModal open={modalOpen} onClose={() => setModalOpen(false)} initial={editing} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('common.delete') + ' ' + t('contracts.title')}
        description={`${t('common.confirm')} delete "${deleting?.contractNumber}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
