import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import { useCreateAssignment, useUpdateAssignment } from '../../api/hooks/useAssignments'
import { useContracts } from '../../api/hooks/useContracts'

const empty = {
  contractId: '', contractType: 'osg',
  assignedFrom: '', assignedUntil: '',
  fixedCharge: '', bwPrice: '', colorPrice: '',
}

// Props: open, onClose, printerId, initial (assignment object = edit, null = create)
export default function PrinterAssignModal({ open, onClose, printerId, initial }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const create = useCreateAssignment()
  const update = useUpdateAssignment()
  const { data: contracts = [] } = useContracts({ isActive: true })
  const isEdit = !!initial

  useEffect(() => {
    setForm(initial ? {
      contractId:    initial.contractId              || '',
      contractType:  initial.contractType            || 'osg',
      assignedFrom:  initial.assignedFrom?.slice(0, 10) || '',
      assignedUntil: initial.assignedUntil?.slice(0, 10) || '',
      fixedCharge:   initial.fixedCharge  != null ? String(initial.fixedCharge)  : '',
      bwPrice:       initial.bwPrice      != null ? String(initial.bwPrice)      : '',
      colorPrice:    initial.colorPrice   != null ? String(initial.colorPrice)   : '',
    } : empty)
    setError('')
  }, [initial, open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const loading = create.isPending || update.isPending

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.contractId || !form.assignedFrom)
      return setError('Contract and assigned from date are required')
    setError('')
    try {
      const payload = {
        contractId:    form.contractId,
        printerId,
        contractType:  form.contractType,
        assignedFrom:  form.assignedFrom,
        assignedUntil: form.assignedUntil || null,
        fixedCharge:   form.fixedCharge !== '' ? Number(form.fixedCharge) : null,
        bwPrice:       form.bwPrice     !== '' ? Number(form.bwPrice)     : null,
        colorPrice:    form.colorPrice  !== '' ? Number(form.colorPrice)  : null,
      }
      if (isEdit) await update.mutateAsync({ id: initial.id, ...payload })
      else        await create.mutateAsync(payload)
      onClose()
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      setError(msg.includes('already assigned') ? t('assignments.overlapError') : msg)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('common.edit') + ' ' + t('assignments.title') : t('contracts.assignPrinter')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="submit" form="printer-assign-form" disabled={loading}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {loading ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="printer-assign-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t('billingCycles.contract')} required>
          <select className={inputCls} value={form.contractId} onChange={e => set('contractId', e.target.value)}>
            <option value="">—</option>
            {contracts.map(c => (
              <option key={c.id} value={c.id}>
                {c.contractNumber} — {c.customerName ?? c.customer?.name ?? ''}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('assignments.printerType')} required>
          <div className="flex gap-4">
            {['osg', 'psg'].map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="contractType" value={type}
                  checked={form.contractType === type}
                  onChange={() => set('contractType', type)}
                  className="accent-brand-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{type.toUpperCase()}</span>
              </label>
            ))}
          </div>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('assignments.assignedFrom')} required>
            <input type="date" className={inputCls}
              value={form.assignedFrom} onChange={e => set('assignedFrom', e.target.value)} />
          </FormField>
          <FormField label={t('assignments.assignedUntil')}>
            <input type="date" className={inputCls}
              value={form.assignedUntil} onChange={e => set('assignedUntil', e.target.value)} />
          </FormField>
        </div>
        <FormField label={t('assignments.fixedChargeOverride')}>
          <input type="number" step="0.01" min="0" className={inputCls}
            placeholder={t('assignments.fixedChargeOverridePlaceholder')}
            value={form.fixedCharge} onChange={e => set('fixedCharge', e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('assignments.bwPriceOverride')}>
            <input type="number" step="0.0001" min="0" className={inputCls}
              placeholder={t('assignments.contractDefault')}
              value={form.bwPrice} onChange={e => set('bwPrice', e.target.value)} />
          </FormField>
          <FormField label={t('assignments.colorPriceOverride')}>
            <input type="number" step="0.0001" min="0" className={inputCls}
              placeholder={t('assignments.contractDefault')}
              value={form.colorPrice} onChange={e => set('colorPrice', e.target.value)} />
          </FormField>
        </div>
        {error && <ErrorAlert message={error} />}
      </form>
    </Modal>
  )
}
