import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as Switch from '@radix-ui/react-switch'
import { UserPlus } from 'lucide-react'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import { useCreatePrinter, useUpdatePrinter } from '../../api/hooks/usePrinters'

const empty = { serialNumber: '', model: '', city: '', location: '', xsmDeviceId: '', xsmEnabled: false, isBwOnly: false }

export default function PrinterFormModal({ open, onClose, initial, onSaveAndAssign }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const create = useCreatePrinter()
  const update = useUpdatePrinter()
  const isEdit = !!initial
  const assignAfterSave = useRef(false)

  useEffect(() => {
    setForm(initial ? { ...empty, ...initial, xsmDeviceId: initial.xsmDeviceId || '', isBwOnly: initial.isBwOnly ?? false } : empty)
    setError('')
    assignAfterSave.current = false
  }, [initial, open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const loading = create.isPending || update.isPending

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.serialNumber.trim() || !form.model.trim() || !form.city.trim() || !form.location.trim()) {
      return setError('Serial number, model, city, and location are required')
    }
    setError('')
    try {
      if (isEdit) {
        await update.mutateAsync({ id: initial.id, ...form })
        onClose()
      } else {
        const printer = await create.mutateAsync(form)
        if (assignAfterSave.current && onSaveAndAssign) {
          onSaveAndAssign(printer)
        } else {
          onClose()
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('common.edit') + ' ' + t('printers.title') : t('printers.addPrinter')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          {!isEdit && onSaveAndAssign ? (
            <button
              type="submit"
              form="printer-form"
              disabled={loading}
              onClick={() => { assignAfterSave.current = true }}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {loading ? t('common.loading') : t('printers.saveAndAssign')}
            </button>
          ) : (
            <button
              type="submit"
              form="printer-form"
              disabled={loading}
              onClick={() => { assignAfterSave.current = false }}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('common.save')}
            </button>
          )}
        </>
      }
    >
      <form id="printer-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t('printers.serialNumber')} required>
          <input className={inputCls} value={form.serialNumber} disabled={isEdit}
            onChange={e => set('serialNumber', e.target.value)} />
        </FormField>
        <FormField label={t('printers.model')} required>
          <input className={inputCls} value={form.model} onChange={e => set('model', e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('printers.city')} required>
            <input className={inputCls} value={form.city} onChange={e => set('city', e.target.value)} />
          </FormField>
          <FormField label={t('printers.location')} required>
            <input className={inputCls} value={form.location} onChange={e => set('location', e.target.value)} />
          </FormField>
        </div>
        <FormField label={t('printers.xsmDeviceId')}>
          <input className={inputCls} value={form.xsmDeviceId} onChange={e => set('xsmDeviceId', e.target.value)} />
        </FormField>
        <div className="flex items-center gap-3">
          <Switch.Root checked={form.xsmEnabled} onCheckedChange={v => set('xsmEnabled', v)}
            className="relative h-5 w-9 rounded-full bg-gray-300 transition-colors data-[state=checked]:bg-brand-500 dark:bg-gray-600">
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
          </Switch.Root>
          <span className="text-sm text-gray-700 dark:text-gray-300">{t('printers.xsmEnabled')}</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch.Root checked={form.isBwOnly} onCheckedChange={v => set('isBwOnly', v)}
            className="relative h-5 w-9 rounded-full bg-gray-300 transition-colors data-[state=checked]:bg-brand-500 dark:bg-gray-600">
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
          </Switch.Root>
          <div>
            <span className="text-sm text-gray-700 dark:text-gray-300">{t('printers.isBwOnly')}</span>
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('printers.isBwOnlyHint')}</p>
          </div>
        </div>
        {error && <ErrorAlert message={error} />}
      </form>
    </Modal>
  )
}
