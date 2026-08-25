import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import { useCreateAssignment, useUpdateAssignment } from '../../api/hooks/useAssignments'
import { useContracts } from '../../api/hooks/useContracts'
import { usePrinters } from '../../api/hooks/usePrinters'

const empty = { contractId: '', printerId: '', contractType: 'osg', assignedFrom: '', assignedUntil: '', overrideMinBwPages: '', overrideMinColorPages: '' }

export default function AssignmentFormModal({ open, onClose, initial }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const create = useCreateAssignment()
  const update = useUpdateAssignment()
  const { data: contracts = [] } = useContracts()
  const { data: printers = [] } = usePrinters({ isActive: true })
  const isEdit = !!initial

  useEffect(() => {
    setForm(initial
      ? {
          contractId:            initial.contractId || '',
          printerId:             initial.printerId || '',
          contractType:          initial.contractType || 'osg',
          assignedFrom:          initial.assignedFrom?.slice(0, 10) || '',
          assignedUntil:         initial.assignedUntil?.slice(0, 10) || '',
          overrideMinBwPages:    initial.overrideMinBwPages    != null ? String(initial.overrideMinBwPages)    : '',
          overrideMinColorPages: initial.overrideMinColorPages != null ? String(initial.overrideMinColorPages) : '',
        }
      : empty)
    setError('')
  }, [initial, open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const loading = create.isPending || update.isPending
  const selectedContract = contracts.find(c => c.id === form.contractId)
  const isMinVol = selectedContract?.billingType === 'minimum_volume'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.contractId || !form.printerId || !form.assignedFrom)
      return setError(t('assignments.requiredFields'))
    setError('')
    try {
      const payload = {
        ...form,
        assignedUntil:         form.assignedUntil         || null,
        overrideMinBwPages:    form.overrideMinBwPages    !== '' ? Number(form.overrideMinBwPages)    : null,
        overrideMinColorPages: form.overrideMinColorPages !== '' ? Number(form.overrideMinColorPages) : null,
      }
      if (isEdit) await update.mutateAsync({ id: initial.id, ...payload })
      else await create.mutateAsync(payload)
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
      title={isEdit ? `${t('common.edit')} ${t('assignments.title')}` : t('assignments.addAssignment')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="submit" form="assignment-form" disabled={loading}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {loading ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="assignment-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t('contracts.title')} required>
          <select className={inputCls} value={form.contractId} onChange={e => set('contractId', e.target.value)} disabled={isEdit}>
            <option value="">—</option>
            {contracts.map(c => (
              <option key={c.id} value={c.id}>{c.contractNumber} — {c.customerName}</option>
            ))}
          </select>
        </FormField>
        <FormField label={t('printers.title')} required>
          <select className={inputCls} value={form.printerId} onChange={e => set('printerId', e.target.value)} disabled={isEdit}>
            <option value="">—</option>
            {printers.map(p => (
              <option key={p.id} value={p.id}>{p.serialNumber} — {p.model}</option>
            ))}
          </select>
        </FormField>
        <FormField label={t('assignments.printerType')} required>
          <div className="flex gap-4">
            {['osg', 'psg'].map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="contractType" value={type} checked={form.contractType === type}
                  onChange={() => set('contractType', type)} className="accent-brand-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{type.toUpperCase()}</span>
              </label>
            ))}
          </div>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('assignments.assignedFrom')} required>
            <input type="date" className={inputCls} value={form.assignedFrom} onChange={e => set('assignedFrom', e.target.value)} />
          </FormField>
          <FormField label={t('assignments.assignedUntil')}>
            <input type="date" className={inputCls} value={form.assignedUntil} onChange={e => set('assignedUntil', e.target.value)} />
          </FormField>
        </div>
        {isMinVol && (
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('assignments.overrideMinBwPages')}>
              <input type="number" step="1" min="0" className={inputCls}
                placeholder={selectedContract?.minBwPages != null ? `${t('assignments.overrideMinBwPagesHint')} (${selectedContract.minBwPages})` : t('assignments.overrideMinBwPagesHint')}
                value={form.overrideMinBwPages} onChange={e => set('overrideMinBwPages', e.target.value)} />
            </FormField>
            <FormField label={t('assignments.overrideMinColorPages')}>
              <input type="number" step="1" min="0" className={inputCls}
                placeholder={selectedContract?.minColorPages != null ? `${t('assignments.overrideMinColorPagesHint')} (${selectedContract.minColorPages})` : t('assignments.overrideMinColorPagesHint')}
                value={form.overrideMinColorPages} onChange={e => set('overrideMinColorPages', e.target.value)} />
            </FormField>
          </div>
        )}
        {error && <ErrorAlert message={error} />}
      </form>
    </Modal>
  )
}
