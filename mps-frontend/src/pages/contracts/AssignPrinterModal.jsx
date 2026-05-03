import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import { useCreateAssignment, useUpdateAssignment } from '../../api/hooks/useAssignments'
import { usePrinters } from '../../api/hooks/usePrinters'

const empty = { printerId: '', assignedFrom: '', assignedUntil: '', fixedCharge: '', bwPrice: '', colorPrice: '', overrideMinBwPages: '', overrideMinColorPages: '' }

export default function AssignPrinterModal({ open, onClose, contractId, contract, initial }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const create = useCreateAssignment()
  const update = useUpdateAssignment()
  const { data: printers = [] } = usePrinters()
  const isEdit = !!initial

  useEffect(() => {
    setForm(initial
      ? { ...empty,
          printerId:             initial.printerId,
          assignedFrom:          initial.assignedFrom?.slice(0, 10) || '',
          assignedUntil:         initial.assignedUntil?.slice(0, 10) || '',
          fixedCharge:           initial.fixedCharge           != null ? String(initial.fixedCharge)           : '',
          bwPrice:               initial.bwPrice               != null ? String(initial.bwPrice)               : '',
          colorPrice:            initial.colorPrice            != null ? String(initial.colorPrice)            : '',
          overrideMinBwPages:    initial.overrideMinBwPages    != null ? String(initial.overrideMinBwPages)    : '',
          overrideMinColorPages: initial.overrideMinColorPages != null ? String(initial.overrideMinColorPages) : '',
        }
      : empty)
    setError('')
  }, [initial, open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const loading = create.isPending || update.isPending
  const isPsg = contract?.contractMode === 'psg'
  const isMinVol = !isPsg && contract?.billingType === 'minimum_volume'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.printerId || !form.assignedFrom) return setError('Printer and assigned from date are required')
    setError('')
    try {
      const payload = {
        ...form,
        assignedUntil:         form.assignedUntil         || null,
        fixedCharge:           form.fixedCharge           !== '' ? Number(form.fixedCharge)           : null,
        bwPrice:               form.bwPrice               !== '' ? Number(form.bwPrice)               : null,
        colorPrice:            form.colorPrice            !== '' ? Number(form.colorPrice)            : null,
        overrideMinBwPages:    form.overrideMinBwPages    !== '' ? Number(form.overrideMinBwPages)    : null,
        overrideMinColorPages: form.overrideMinColorPages !== '' ? Number(form.overrideMinColorPages) : null,
      }
      if (isEdit) await update.mutateAsync({ id: initial.id, ...payload })
      else await create.mutateAsync({ contractId, ...payload })
      onClose()
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      setError(msg.includes('already assigned') ? t('assignments.overlapError') : msg)
    }
  }

  return (
    <Modal open={open} onClose={onClose}
      title={isEdit ? t('common.edit') + ' ' + t('assignments.title') : t('contracts.assignPrinter')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="submit" form="assign-form" disabled={loading}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {loading ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="assign-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t('printers.title')} required>
          <select className={inputCls} value={form.printerId} onChange={e => set('printerId', e.target.value)} disabled={isEdit}>
            <option value="">—</option>
            {printers.map(p => <option key={p.id} value={p.id}>{p.serialNumber} — {p.model}</option>)}
          </select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('assignments.assignedFrom')} required>
            <input type="date" className={inputCls} value={form.assignedFrom} onChange={e => set('assignedFrom', e.target.value)} />
          </FormField>
          <FormField label={t('assignments.assignedUntil')}>
            <input type="date" className={inputCls} value={form.assignedUntil} onChange={e => set('assignedUntil', e.target.value)} />
          </FormField>
        </div>
        {!isPsg && (
          <>
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
            {isMinVol && (
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t('assignments.overrideMinBwPages')}>
                  <input type="number" step="1" min="0" className={inputCls}
                    placeholder={contract?.minBwPages != null ? `${t('assignments.overrideMinBwPagesHint')} (${contract.minBwPages})` : t('assignments.overrideMinBwPagesHint')}
                    value={form.overrideMinBwPages} onChange={e => set('overrideMinBwPages', e.target.value)} />
                </FormField>
                <FormField label={t('assignments.overrideMinColorPages')}>
                  <input type="number" step="1" min="0" className={inputCls}
                    placeholder={contract?.minColorPages != null ? `${t('assignments.overrideMinColorPagesHint')} (${contract.minColorPages})` : t('assignments.overrideMinColorPagesHint')}
                    value={form.overrideMinColorPages} onChange={e => set('overrideMinColorPages', e.target.value)} />
                </FormField>
              </div>
            )}
          </>
        )}
        {error && <ErrorAlert message={error} />}
      </form>
    </Modal>
  )
}
