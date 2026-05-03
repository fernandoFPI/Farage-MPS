import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Layers } from 'lucide-react'
import {
  useContractGroups,
  useCreateContractGroup,
  useUpdateContractGroup,
  useDeleteContractGroup,
} from '../../api/hooks/useContractGroups'
import { useToast } from '../../components/Toast'
import { useDocTitle } from '../../hooks/useDocTitle'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import ConfirmDialog from '../../components/ConfirmDialog'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'

function GroupFormModal({ open, onClose, initial }) {
  const { t } = useTranslation()
  const create = useCreateContractGroup()
  const update = useUpdateContractGroup()
  const { showToast } = useToast()
  const isEdit = !!initial

  const [form, setForm] = useState({ name: '', groupMinBw: '', groupMinColor: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (initial) {
      setForm({ name: initial.name, groupMinBw: initial.groupMinBw ?? '', groupMinColor: initial.groupMinColor ?? '' })
    } else {
      setForm({ name: '', groupMinBw: '', groupMinColor: '' })
    }
    setError('')
  }, [initial, open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const loading = create.isPending || update.isPending

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return setError(t('contractGroups.nameRequired'))
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        groupMinBw:    Number(form.groupMinBw)    || 0,
        groupMinColor: Number(form.groupMinColor) || 0,
      }
      if (isEdit) await update.mutateAsync({ id: initial.id, ...payload })
      else await create.mutateAsync(payload)
      showToast({ title: isEdit ? t('common.saved') : t('common.created'), variant: 'success' })
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('contractGroups.editGroup') : t('contractGroups.createGroup')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="submit" form="group-form" disabled={loading}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {loading ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="group-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t('contractGroups.name')} required>
          <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('contractGroups.groupMinBw')}>
            <input type="number" min="0" className={inputCls} value={form.groupMinBw} onChange={e => set('groupMinBw', e.target.value)} />
          </FormField>
          <FormField label={t('contractGroups.groupMinColor')}>
            <input type="number" min="0" className={inputCls} value={form.groupMinColor} onChange={e => set('groupMinColor', e.target.value)} />
          </FormField>
        </div>
        {error && <ErrorAlert message={error} />}
      </form>
    </Modal>
  )
}

export default function ContractGroupsPage() {
  const { t } = useTranslation()
  useDocTitle(t('contractGroups.title'))
  const { data: groups = [], isLoading } = useContractGroups()
  const deleteGroup = useDeleteContractGroup()
  const { showToast } = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(g) { setEditing(g); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(null) }

  async function handleDelete(g) {
    try {
      await deleteGroup.mutateAsync(g.id)
      showToast({ title: t('common.deleted'), variant: 'success' })
    } catch (err) {
      showToast({ title: err.response?.data?.error || err.message, variant: 'error' })
    }
    setDeleteTarget(null)
  }

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('contractGroups.title')}
        actions={
          <button onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            <Plus className="h-4 w-4" />
            {t('contractGroups.createGroup')}
          </button>
        }
      />

      {groups.length === 0 ? (
        <EmptyState icon={Layers} title={t('contractGroups.noGroups')} />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-5 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('contractGroups.name')}</th>
                <th className="px-5 py-3 text-end text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('contractGroups.groupMinBw')}</th>
                <th className="px-5 py-3 text-end text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('contractGroups.groupMinColor')}</th>
                <th className="px-5 py-3 text-end text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('contractGroups.members')}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {groups.map(g => (
                <tr key={g.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <Link to={`/contract-groups/${g.id}`}
                      className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-2">
                      <Layers className="h-4 w-4 text-gray-400" />
                      {g.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-end text-sm text-gray-600 dark:text-gray-400">{(g.groupMinBw ?? 0).toLocaleString()}</td>
                  <td className="px-5 py-3 text-end text-sm text-gray-600 dark:text-gray-400">{(g.groupMinColor ?? 0).toLocaleString()}</td>
                  <td className="px-5 py-3 text-end text-sm text-gray-600 dark:text-gray-400">{g.memberCount ?? 0}</td>
                  <td className="px-5 py-3 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(g)}
                        className="rounded p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDeleteTarget(g)}
                        className="rounded p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GroupFormModal open={modalOpen} onClose={closeModal} initial={editing} />

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('contractGroups.deleteGroup')}
        description={t('contractGroups.deleteConfirm', { name: deleteTarget?.name })}
        onConfirm={() => handleDelete(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        loading={deleteGroup.isPending}
      />
    </div>
  )
}
