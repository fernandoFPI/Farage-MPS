import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Pencil, Eye, Trash2 } from 'lucide-react'
import { useCustomers, useDeleteCustomer } from '../../api/hooks/useCustomers'
import { useDebounce } from '../../hooks/useDebounce'
import PageHeader from '../../components/PageHeader'
import DataTable from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import ConfirmDialog from '../../components/ConfirmDialog'
import ErrorAlert from '../../components/ErrorAlert'
import CustomerFormModal from './CustomerFormModal'

export default function CustomersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const debouncedSearch = useDebounce(search)
  const { data, isLoading } = useCustomers(debouncedSearch ? { name: debouncedSearch } : {})
  const deleteMutation = useDeleteCustomer()

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(row) { setEditing(row); setModalOpen(true) }

  async function handleDelete() {
    setDeleteError('')
    try {
      await deleteMutation.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      setDeleteError(msg.includes('active contracts') ? t('customers.hasActiveContracts') : msg)
    }
  }

  const columns = [
    { key: 'name', label: t('customers.name') },
    { key: 'contactPerson', label: t('customers.contactPerson'), className: 'hidden md:table-cell' },
    { key: 'email', label: t('customers.email'), className: 'hidden md:table-cell' },
    { key: 'phone', label: t('customers.phone'), className: 'hidden lg:table-cell' },
    { key: 'requiresConfirmation', label: t('customers.requiresConfirmation'), className: 'hidden lg:table-cell',
      render: (r) => <StatusBadge status={r.requiresConfirmation} /> },
    { key: 'actions', label: t('common.actions'),
      render: (r) => (
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/customers/${r.id}`)} className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"><Eye className="h-4 w-4" /></button>
          <button onClick={() => openEdit(r)} className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => { setDeleteError(''); setDeleting(r) }} className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('customers.title')}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('common.search')}
                className="rounded-lg border border-gray-300 bg-white ps-9 pe-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              <Plus className="h-4 w-4" />
              {t('customers.addCustomer')}
            </button>
          </div>
        }
      />
      {deleteError && <div className="mb-4"><ErrorAlert message={deleteError} /></div>}
      <DataTable columns={columns} data={data} loading={isLoading} emptyMessage={t('common.noData')} />
      <CustomerFormModal open={modalOpen} onClose={() => setModalOpen(false)} initial={editing} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('common.delete') + ' ' + t('customers.title')}
        description={`${t('common.confirm')} delete "${deleting?.name}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
