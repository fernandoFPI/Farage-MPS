import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, UserX, AlertTriangle } from 'lucide-react'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeactivateUser,
} from '../../api/hooks/useUsers'
import { useRoles } from '../../api/hooks/useRoles'
import { useAuth } from '../../context/AuthContext'
import { usePermission } from '../../hooks/usePermission'
import { useDocTitle } from '../../hooks/useDocTitle'
import { useToast } from '../../components/Toast'
import PageHeader from '../../components/PageHeader'
import DataTable from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ConfirmDialog from '../../components/ConfirmDialog'
import ErrorAlert from '../../components/ErrorAlert'
import { fmtDate } from '../../utils/format'

const PERMISSION_FLAGS = [
  'can_submit_readings',
  'can_manage_billing',
  'can_confirm_billing',
  'can_manage_users',
  'can_manage_contracts',
]

function UserFormModal({ initial, onClose }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { data: roles = [] } = useRoles()
  const create = useCreateUser()
  const update = useUpdateUser()
  const isEdit = !!initial

  const [form, setForm] = useState({
    fullName: initial?.fullName ?? '',
    email: initial?.email ?? '',
    password: '',
    roleId: initial?.roleId ?? initial?.role?.id ?? '',
  })
  const [error, setError] = useState('')

  const selectedRole = roles.find(r => String(r.id) === String(form.roleId))
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.fullName || !form.email || !form.roleId)
      return setError(t('users.requiredFields'))
    if (!isEdit && !form.password)
      return setError(t('users.passwordRequired'))
    setError('')

    const payload = { fullName: form.fullName, email: form.email, roleId: form.roleId }
    if (form.password) payload.password = form.password

    try {
      if (isEdit) {
        await update.mutateAsync({ id: initial.id, ...payload })
        showToast({ title: t('users.updated'), variant: 'success' })
      } else {
        await create.mutateAsync(payload)
        showToast({ title: t('users.created'), variant: 'success' })
      }
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const isPending = create.isPending || update.isPending

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={isEdit ? t('common.edit') : t('users.addUser')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="submit" form="user-form" disabled={isPending}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {isPending ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t('users.fullName')} required>
          <input className={inputCls} value={form.fullName} onChange={e => set('fullName', e.target.value)} />
        </FormField>
        <FormField label={t('users.email')} required>
          <input type="email" className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} />
        </FormField>
        <FormField label={t('users.password')} required={!isEdit}>
          <input
            type="password"
            className={inputCls}
            value={form.password}
            onChange={e => set('password', e.target.value)}
            placeholder={isEdit ? t('users.passwordPlaceholder') : ''}
          />
        </FormField>
        <FormField label={t('users.role')} required>
          <select className={inputCls} value={form.roleId} onChange={e => set('roleId', e.target.value)}>
            <option value="">—</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </FormField>

        {selectedRole?.name === 'odoo_integration' && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">{t('users.odooIntegrationWarning')}</p>
          </div>
        )}

        {selectedRole && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('users.permissions')}
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {PERMISSION_FLAGS.filter(f => f in selectedRole).map(flag => (
                <div key={flag} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${selectedRole[flag] ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                  <span className="text-xs text-gray-600 dark:text-gray-400">{flag}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <ErrorAlert message={error} />}
      </form>
    </Modal>
  )
}

export default function UsersPage() {
  const { t } = useTranslation()
  useDocTitle(t('users.title'))

  const { user: currentUser } = useAuth()
  const canManage = usePermission('can_manage_users')
  const { showToast } = useToast()

  const { data: users = [], isLoading, error, refetch } = useUsers()
  const deactivate = useDeactivateUser()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deactivating, setDeactivating] = useState(null)

  async function handleDeactivate() {
    try {
      await deactivate.mutateAsync(deactivating.id)
      showToast({ title: t('users.deactivated'), variant: 'success' })
      setDeactivating(null)
    } catch (err) {
      showToast({ title: err.response?.data?.error || err.message, variant: 'error' })
      setDeactivating(null)
    }
  }

  const columns = [
    {
      key: 'fullName',
      label: t('users.fullName'),
      render: r => <span className="font-medium text-gray-900 dark:text-gray-100">{r.fullName}</span>,
    },
    {
      key: 'email',
      label: t('users.email'),
      className: 'hidden sm:table-cell',
    },
    {
      key: 'role',
      label: t('users.role'),
      render: r => r.role?.name ?? '—',
    },
    {
      key: 'isActive',
      label: t('users.isActive'),
      render: r => <StatusBadge status={r.isActive ? 'active' : 'inactive'} />,
    },
    {
      key: 'createdAt',
      label: t('common.createdAt'),
      className: 'hidden lg:table-cell',
      render: r => fmtDate(r.createdAt),
    },
    ...(canManage ? [{
      key: 'actions',
      label: t('common.actions'),
      render: r => {
        const isSelf = r.id === currentUser?.id
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setEditing(r); setFormOpen(true) }}
              className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"
              title={t('common.edit')}
            >
              <Pencil className="h-4 w-4" />
            </button>
            {r.isActive && (
              <Tooltip.Provider delayDuration={200}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <span>
                      <button
                        onClick={() => !isSelf && setDeactivating(r)}
                        disabled={isSelf}
                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                        title={t('users.deactivate')}
                      >
                        <UserX className="h-4 w-4" />
                      </button>
                    </span>
                  </Tooltip.Trigger>
                  {isSelf && (
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white shadow dark:bg-gray-700"
                        sideOffset={4}
                      >
                        {t('users.deactivateSelf')}
                        <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  )}
                </Tooltip.Root>
              </Tooltip.Provider>
            )}
          </div>
        )
      },
    }] : []),
  ]

  return (
    <div>
      <PageHeader
        title={t('users.title')}
        actions={
          canManage && (
            <button
              onClick={() => { setEditing(null); setFormOpen(true) }}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" />{t('users.addUser')}
            </button>
          )
        }
      />

      <DataTable
        columns={columns}
        data={users}
        loading={isLoading}
        emptyMessage={t('common.noData')}
        error={error ? { message: t('common.loadError') } : null}
        onRetry={refetch}
      />

      {formOpen && (
        <UserFormModal
          initial={editing}
          onClose={() => { setFormOpen(false); setEditing(null) }}
        />
      )}

      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={handleDeactivate}
        title={t('users.deactivate')}
        description={deactivating ? `${t('users.deactivateConfirm')}\n${deactivating.fullName}` : ''}
        loading={deactivate.isPending}
      />
    </div>
  )
}
