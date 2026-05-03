import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import { useBillingCycles } from '../../api/hooks/useBillingCycles'
import { useCreateCycleGroup } from '../../api/hooks/useCycleGroups'
import { useToast } from '../../components/Toast'

export default function GroupCyclesModal({ open, onClose, cycle }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [month1Id, setMonth1Id] = useState('')
  const [month2Id, setMonth2Id] = useState('')
  const [error, setError] = useState('')

  const { data: allCycles = [] } = useBillingCycles(
    { contractId: cycle?.contractId },
    { enabled: !!cycle?.contractId }
  )
  const createGroup = useCreateCycleGroup()

  useEffect(() => {
    if (open) { setMonth1Id(''); setMonth2Id(''); setError('') }
  }, [open])

  // Confirmed cycles for same contract that are not in a group and not the current cycle
  const eligibleCycles = allCycles.filter(c =>
    c.id !== cycle?.id &&
    c.status === 'confirmed' &&
    !c.cycleGroupId
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!month1Id || !month2Id) return setError('Both Month 1 and Month 2 must be selected')
    if (month1Id === month2Id) return setError('Month 1 and Month 2 must be different cycles')

    const m1 = allCycles.find(c => c.id === month1Id)
    const m2 = allCycles.find(c => c.id === month2Id)
    const m3 = cycle

    if (!m1 || !m2) return setError('Selected cycles not found')
    if (new Date(m1.periodStart) >= new Date(m2.periodStart))
      return setError('Month 1 must be earlier than Month 2')
    if (new Date(m2.periodStart) >= new Date(m3.periodStart))
      return setError('Month 2 must be earlier than Month 3 (this cycle)')

    setError('')
    try {
      await createGroup.mutateAsync({
        contractId: cycle.contractId,
        cycleIds: [month1Id, month2Id, cycle.id],
      })
      showToast({ title: t('billingCycles.groupCycles'), variant: 'success' })
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const cycleLabel = c => c.cycleName ?? `${c.customerName ?? ''} — ${c.periodStart?.slice(0, 7) ?? ''}`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('billingCycles.groupCyclesTitle')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={createGroup.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="submit" form="group-cycles-form" disabled={createGroup.isPending}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {createGroup.isPending ? t('common.loading') : t('billingCycles.groupCycles')}
          </button>
        </>
      }
    >
      <form id="group-cycles-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select the 3 cycles to group together. The current cycle will be the invoicing cycle (Month 3).
        </p>
        <FormField label={t('billingCycles.month1')} required>
          <select className={inputCls} value={month1Id} onChange={e => setMonth1Id(e.target.value)}>
            <option value="">—</option>
            {eligibleCycles.map(c => (
              <option key={c.id} value={c.id}>{cycleLabel(c)}</option>
            ))}
          </select>
        </FormField>
        <FormField label={t('billingCycles.month2')} required>
          <select className={inputCls} value={month2Id} onChange={e => setMonth2Id(e.target.value)}>
            <option value="">—</option>
            {eligibleCycles.map(c => (
              <option key={c.id} value={c.id}>{cycleLabel(c)}</option>
            ))}
          </select>
        </FormField>
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('billingCycles.month3')}</p>
          <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50">
            {cycle ? cycleLabel(cycle) : '—'}
          </div>
        </div>
        {error && <ErrorAlert message={error} />}
      </form>
    </Modal>
  )
}
