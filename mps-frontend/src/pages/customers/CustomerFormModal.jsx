import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import * as Switch from '@radix-ui/react-switch'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import { useCreateCustomer, useUpdateCustomer } from '../../api/hooks/useCustomers'

const empty = { name: '', contactPerson: '', phone: '', email: '', requiresConfirmation: false }

export default function CustomerFormModal({ open, onClose, initial }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const create = useCreateCustomer()
  const update = useUpdateCustomer()
  const isEdit = !!initial

  useEffect(() => {
    setForm(initial ? { ...empty, ...initial } : empty)
    setError('')
  }, [initial, open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const loading = create.isPending || update.isPending

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return setError(t('customers.name') + ' ' + t('common.isRequired', 'is required'))
    setError('')
    try {
      if (isEdit) await update.mutateAsync({ id: initial.id, ...form })
      else await create.mutateAsync(form)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('common.edit') + ' ' + t('customers.title') : t('customers.addCustomer')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="submit" form="customer-form" disabled={loading}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {loading ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t('customers.name')} required>
          <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} />
        </FormField>
        <FormField label={t('customers.contactPerson')}>
          <input className={inputCls} value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('customers.phone')}>
            <input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} />
          </FormField>
          <FormField label={t('customers.email')}>
            <input type="email" className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} />
          </FormField>
        </div>
        <div className="flex items-center gap-3">
          <Switch.Root
            checked={form.requiresConfirmation}
            onCheckedChange={v => set('requiresConfirmation', v)}
            className="relative h-5 w-9 rounded-full bg-gray-300 transition-colors data-[state=checked]:bg-brand-500 dark:bg-gray-600"
          >
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
          </Switch.Root>
          <span className="text-sm text-gray-700 dark:text-gray-300">{t('customers.requiresConfirmation')}</span>
        </div>
        {error && <ErrorAlert message={error} />}
      </form>
    </Modal>
  )
}
