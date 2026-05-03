import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useAssignments, useDeleteAssignment } from '../../api/hooks/useAssignments'
import { useContracts } from '../../api/hooks/useContracts'
import PageHeader from '../../components/PageHeader'
import DataTable from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import ConfirmDialog from '../../components/ConfirmDialog'
import ErrorAlert from '../../components/ErrorAlert'
import AssignmentFormModal from './AssignmentFormModal'
import { fmtDate } from '../../utils/format'

export default function AssignmentsPage() {
  const { t } = useTranslation()
  const [contractId, setContractId] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  const params = {}
  if (contractId) params.contractId = contractId

  const { data, isLoading } = useAssignments(params)
  const { data: contracts = [] } = useContracts()
  const deleteMutation = useDeleteAssignment()

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
    { key: 'contractNumber', label: t('contracts.contractNumber'),
      render: r => r.contract?.contractNumber ?? '—' },
    { key: 'customerName', label: t('customers.title'), className: 'hidden md:table-cell',
      render: r => r.contract?.customerName ?? '—' },
    { key: 'serialNumber', label: t('printers.serialNumber'),
      render: r => r.printer?.serialNumber ?? r.serialNumber ?? '—' },
    { key: 'model', label: t('printers.model'), className: 'hidden lg:table-cell',
      render: r => r.printer?.model ?? r.model ?? '—' },
    { key: 'contractType', label: t('assignments.printerType'),
      render: r => <StatusBadge status={r.contractType} /> },
    { key: 'assignedFrom', label: t('assignments.assignedFrom'),
      render: r => fmtDate(r.assignedFrom) },
    { key: 'assignedUntil', label: t('assignments.assignedUntil'), className: 'hidden lg:table-cell',
      render: r => fmtDate(r.assignedUntil) },
    { key: 'actions', label: t('common.actions'),
      render: r => (
        <div className="flex items-center gap-2">
          <button onClick={() => openEdit(r)} className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => { setDeleteError(''); setDeleting(r) }} className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('assignments.title')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select value={contractId} onChange={e => setContractId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none">
              <option value="">{t('contracts.title')}: All</option>
              {contracts.map(c => <option key={c.id} value={c.id}>{c.contractNumber}</option>)}
            </select>
            <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              <Plus className="h-4 w-4" />{t('assignments.addAssignment')}
            </button>
          </div>
        }
      />
      {deleteError && <div className="mb-4"><ErrorAlert message={deleteError} /></div>}
      <DataTable columns={columns} data={data} loading={isLoading} emptyMessage={t('common.noData')} />
      <AssignmentFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null) }} initial={editing} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={`${t('common.delete')} ${t('assignments.title')}`}
        description={`${t('common.confirm')} delete assignment for "${deleting?.printer?.serialNumber ?? deleting?.serialNumber}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
