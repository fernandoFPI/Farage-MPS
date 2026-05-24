import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import * as Switch from '@radix-ui/react-switch'
import { ChevronDown } from 'lucide-react'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import { useCreateContract, useUpdateContract } from '../../api/hooks/useContracts'
import { useCustomers } from '../../api/hooks/useCustomers'

const SERVICE_TYPES = {
  osg:        ['MPS', 'FSMA', 'LS', 'LO'],
  psg:        ['FSMA', 'SMA', 'LO'],
  psg_simple: ['FSMA', 'SMA', 'LO'],
}

const DEFAULT_INVOICE_RULES = {
  fixedChargeFrequency:    'monthly',
  excessFrequency:         'monthly',
  overrideInvoicing:       'separate',
  groupingStrategy:        'contract',
  contractStartDate:       '',
  quarterlyBreakdownStyle: 'monthly',
}

const empty = {
  customerId: '', contractNumber: '', officialContractNumber: '', billingType: 'per_click', contractMode: 'osg', currency: 'IQD',
  fixedCharge: '', bwPrice: '', colorPrice: '',
  excessBwPrice: '', excessColorPrice: '', minBwPages: '', minColorPages: '',
  a4Price: '', a3Price: '', startDate: '', endDate: '',
  confirmationSlaDays: '5', isActive: true,
  serviceType: '',
  invoiceRules: { ...DEFAULT_INVOICE_RULES },
}

function ModeBadge({ mode }) {
  const cfg = mode === 'psg'
    ? { cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', label: 'PSG' }
    : mode === 'psg_simple'
    ? { cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', label: 'PSG Simple' }
    : { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'OSG' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

export default function ContractFormModal({ open, onClose, initial, defaultCustomerId }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const create = useCreateContract()
  const update = useUpdateContract()
  const { data: customers = [] } = useCustomers()
  const isEdit = !!initial
  const isMinVol = form.billingType === 'minimum_volume'
  const isPsg = form.contractMode === 'psg'
  const isPsgSimple = form.contractMode === 'psg_simple'
  const isPsgAny = isPsg || isPsgSimple
  useEffect(() => {
    if (initial) {
      setForm({ ...empty, ...initial,
        contractMode: initial.contractMode ?? 'osg',
        billingType: initial.billingType ?? 'per_click',
        currency: initial.currency ?? 'IQD',
        fixedCharge: initial.fixedCharge ?? '', bwPrice: initial.bwPrice ?? '',
        colorPrice: initial.colorPrice ?? '', excessBwPrice: initial.excessBwPrice ?? '',
        excessColorPrice: initial.excessColorPrice ?? '', minBwPages: initial.minBwPages ?? '',
        minColorPages: initial.minColorPages ?? '', a4Price: initial.a4Price ?? '',
        a3Price: initial.a3Price ?? '', confirmationSlaDays: initial.confirmationSlaDays ?? '5',
        startDate: initial.startDate?.slice(0, 10) ?? '', endDate: initial.endDate?.slice(0, 10) ?? '',
        officialContractNumber: initial.officialContractNumber ?? '',
        serviceType: initial.serviceType ?? '',
        invoiceRules: {
          ...DEFAULT_INVOICE_RULES,
          ...(initial.invoiceRules ?? {}),
          contractStartDate:       initial.invoiceRules?.contractStartDate ?? '',
          overrideInvoicing:       initial.invoiceRules?.overrideInvoicing === 'merge' ? 'combined' : (initial.invoiceRules?.overrideInvoicing ?? DEFAULT_INVOICE_RULES.overrideInvoicing),
          quarterlyBreakdownStyle: initial.invoiceRules?.quarterlyBreakdownStyle ?? DEFAULT_INVOICE_RULES.quarterlyBreakdownStyle,
        },
      })
    } else {
      setForm({ ...empty, customerId: defaultCustomerId || '' })
    }
    setError('')
    setRulesOpen(false)
  }, [initial, open, defaultCustomerId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setRule = (k, v) => setForm(f => ({ ...f, invoiceRules: { ...f.invoiceRules, [k]: v } }))
  const loading = create.isPending || update.isPending

  function setMode(mode) {
    setForm(f => ({
      ...f,
      contractMode: mode,
      billingType: (mode === 'psg' || mode === 'psg_simple') ? 'per_click' : f.billingType,
      serviceType: SERVICE_TYPES[mode]?.includes(f.serviceType) ? f.serviceType : '',
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.customerId || !form.contractNumber || !form.startDate) return setError('Customer, contract number and start date are required')
    if (isPsgAny && (!form.a4Price || Number(form.a4Price) <= 0)) return setError('A4 Price is required and must be > 0 for PSG contracts')
    if (isPsg && (!form.a3Price || Number(form.a3Price) <= 0)) return setError('A3 Price is required and must be > 0 for PSG contracts')
    const rules = form.invoiceRules ?? DEFAULT_INVOICE_RULES
    const rulesNeedStartDate = rules.fixedChargeFrequency !== 'monthly' || rules.excessFrequency !== 'monthly'
    if (rulesNeedStartDate && !rules.contractStartDate) {
      return setError(t('contracts.invoiceRulesStartDateRequired'))
    }
    setError('')
    try {
      const payload = {
        customerId: form.customerId,
        contractNumber: form.contractNumber,
        officialContractNumber: form.officialContractNumber?.trim() || null,
        contractMode: form.contractMode,
        billingType: isPsg ? 'per_click' : form.billingType,
        currency: form.currency,
        startDate: form.startDate,
        endDate: form.endDate || null,
        confirmationSlaDays: Number(form.confirmationSlaDays) || 5,
        isActive: form.isActive,
        // OSG fields
        fixedCharge:      isPsgAny ? 0 : (Number(form.fixedCharge) || 0),
        bwPrice:          isPsgAny ? 0 : (Number(form.bwPrice) || 0),
        colorPrice:       isPsgAny ? 0 : (Number(form.colorPrice) || 0),
        excessBwPrice:    isPsgAny ? 0 : (Number(form.excessBwPrice) || 0),
        excessColorPrice: isPsgAny ? 0 : (Number(form.excessColorPrice) || 0),
        minBwPages:       isPsgAny ? 0 : (Number(form.minBwPages) || 0),
        minColorPages:    isPsgAny ? 0 : (Number(form.minColorPages) || 0),
        // PSG fields
        a4Price: isPsgAny ? (Number(form.a4Price) || 0) : 0,
        a3Price: isPsg    ? (Number(form.a3Price) || 0) : 0,
        serviceType: form.serviceType || null,
        invoiceRules: {
          fixedChargeFrequency:    rules.fixedChargeFrequency,
          excessFrequency:         rules.excessFrequency,
          overrideInvoicing:       rules.overrideInvoicing,
          groupingStrategy:        rules.groupingStrategy,
          contractStartDate:       rules.contractStartDate || null,
          quarterlyBreakdownStyle: rules.quarterlyBreakdownStyle || 'monthly',
        },
      }
      if (isEdit) await update.mutateAsync({ id: initial.id, ...payload })
      else await create.mutateAsync(payload)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    }
  }

  const numInput = (key, label, req) => (
    <FormField label={label} required={req}>
      <input type="number" step="any" min="0" className={inputCls} value={form[key]} onChange={e => set(key, e.target.value)} />
    </FormField>
  )

  return (
    <Modal open={open} onClose={onClose}
      title={isEdit ? t('common.edit') + ' ' + t('contracts.title') : t('contracts.addContract')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="submit" form="contract-form" disabled={loading}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {loading ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="contract-form" onSubmit={handleSubmit} className="space-y-4">

        {/* ── Contract Mode — first field ── */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('contracts.contractMode')} <span className="text-red-500">*</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { mode: 'osg',        label: t('contracts.osg'),       color: 'blue'   },
              { mode: 'psg',        label: t('contracts.psg'),       color: 'purple' },
              { mode: 'psg_simple', label: t('contracts.psgSimple'), color: 'violet' },
            ].map(({ mode, label, color }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setMode(mode)}
                className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm transition-colors ${
                  form.contractMode === mode
                    ? color === 'purple'
                      ? 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-500 dark:bg-purple-900/20 dark:text-purple-300'
                      : color === 'violet'
                      ? 'border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-900/20 dark:text-violet-300'
                      : 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                <span className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${
                  form.contractMode === mode
                    ? color === 'purple' ? 'border-purple-500 bg-purple-500'
                    : color === 'violet' ? 'border-violet-500 bg-violet-500'
                    : 'border-blue-500 bg-blue-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {isPsg && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-purple-600 dark:text-purple-400">
              <span className="mt-0.5">ℹ</span>
              {t('contracts.psgNote')}
            </p>
          )}
          {isPsgSimple && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-violet-600 dark:text-violet-400">
              <span className="mt-0.5">ℹ</span>
              {t('contracts.psgSimpleNote')}
            </p>
          )}
        </div>

        <FormField label={t('customers.title')} required>
          <select className={inputCls} value={form.customerId} onChange={e => set('customerId', e.target.value)} disabled={isEdit}>
            <option value="">—</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('contracts.contractNumber')} required>
            <input className={inputCls} value={form.contractNumber} disabled={isEdit} onChange={e => set('contractNumber', e.target.value)} />
          </FormField>
          <FormField label="Currency" required>
            <select className={inputCls} value={form.currency} onChange={e => set('currency', e.target.value)}>
              <option value="IQD">IQD — Iraqi Dinar</option>
              <option value="USD">USD — US Dollar</option>
            </select>
          </FormField>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('contracts.officialContractNumber')}
            <span className="ms-1 text-xs font-normal text-gray-400">({t('common.optional')})</span>
          </label>
          <input className={inputCls} value={form.officialContractNumber} onChange={e => set('officialContractNumber', e.target.value)} placeholder={form.contractNumber || '—'} />
          <p className="text-xs text-gray-400 dark:text-gray-500">{t('contracts.officialContractNumberHelper')}</p>
        </div>

        {/* Service Type */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('contracts.serviceType')}
            <span className="ms-1 text-xs font-normal text-gray-400">({t('common.optional')})</span>
          </label>
          <select className={inputCls} value={form.serviceType} onChange={e => set('serviceType', e.target.value)}>
            <option value="">—</option>
            {(SERVICE_TYPES[form.contractMode] ?? []).map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 dark:text-gray-500">{t('contracts.serviceTypeHelper')}</p>
        </div>

        {/* OSG-only fields */}
        {!isPsgAny && (
          <>
            <FormField label={t('contracts.billingType')} required>
              <select className={inputCls} value={form.billingType} onChange={e => set('billingType', e.target.value)}>
                <option value="per_click">{t('contracts.perClick')}</option>
                <option value="minimum_volume">{t('contracts.minimumVolume')}</option>
              </select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              {numInput('fixedCharge', t('contracts.fixedCharge'))}
              {numInput('bwPrice', t('contracts.bwPrice'))}
              {numInput('colorPrice', t('contracts.colorPrice'))}
              {numInput('confirmationSlaDays', t('contracts.confirmationSlaDays'))}
            </div>
            {isMinVol && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
                {numInput('minBwPages', t('contracts.minBwPages'))}
                {numInput('minColorPages', t('contracts.minColorPages'))}
                {numInput('excessBwPrice', t('contracts.excessBwPrice'))}
                {numInput('excessColorPrice', t('contracts.excessColorPrice'))}
              </div>
            )}
          </>
        )}

        {/* PSG-only fields */}
        {isPsg && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-900/40 dark:bg-purple-900/10">
            {numInput('a4Price', t('contracts.a4Price'), true)}
            {numInput('a3Price', t('contracts.a3Price'), true)}
            {numInput('confirmationSlaDays', t('contracts.confirmationSlaDays'))}
          </div>
        )}

        {/* PSG Simple-only fields */}
        {isPsgSimple && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-900/10 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {numInput('a4Price', t('contracts.a4Price'), true)}
              {numInput('confirmationSlaDays', t('contracts.confirmationSlaDays'))}
            </div>
            <p className="text-xs text-violet-600 dark:text-violet-400">{t('contracts.psgSimpleFieldNote')}</p>
          </div>
        )}

        {/* Invoice Rules — collapsible */}
        {(() => {
          const rules = form.invoiceRules ?? DEFAULT_INVOICE_RULES
          const isNonDefault =
            rules.fixedChargeFrequency !== 'monthly' ||
            rules.excessFrequency !== 'monthly' ||
            rules.overrideInvoicing !== 'separate' ||
            rules.groupingStrategy !== 'contract'
          const needsStartDate = rules.fixedChargeFrequency !== 'monthly' || rules.excessFrequency !== 'monthly'
          return (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setRulesOpen(o => !o)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
              >
                <span className="flex items-center gap-2">
                  {t('contracts.invoiceRules')}
                  {isNonDefault && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      {t('contracts.customRules')}
                    </span>
                  )}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${rulesOpen ? 'rotate-180' : ''}`} />
              </button>

              {rulesOpen && (
                <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 space-y-4">
                  <p className="text-xs text-gray-400 dark:text-gray-500">{t('contracts.invoiceRulesNote')}</p>

                  {/* Fixed Charge Frequency */}
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">{t('contracts.fixedChargeFrequency')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['monthly', t('contracts.freqMonthly')],
                        ['quarterly', t('contracts.freqQuarterly')],
                        ['semi_annual', t('contracts.freqSemiAnnual')],
                        ['annual', t('contracts.freqAnnual')],
                      ].map(([val, label]) => (
                        <label key={val} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          rules.fixedChargeFrequency === val
                            ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/20 dark:text-brand-300'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                        }`}>
                          <input type="radio" className="sr-only" name="fixedChargeFrequency" value={val}
                            checked={rules.fixedChargeFrequency === val} onChange={() => setRule('fixedChargeFrequency', val)} />
                          <span className={`h-3 w-3 rounded-full border-2 flex-shrink-0 ${
                            rules.fixedChargeFrequency === val ? 'border-brand-500 bg-brand-500' : 'border-gray-300 dark:border-gray-600'
                          }`} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Excess Frequency */}
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">{t('contracts.excessFrequency')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['monthly', t('contracts.freqMonthly')],
                        ['quarterly', t('contracts.freqQuarterly')],
                        ['semi_annual', t('contracts.freqSemiAnnual')],
                        ['annual', t('contracts.freqAnnual')],
                      ].map(([val, label]) => (
                        <label key={val} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          rules.excessFrequency === val
                            ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/20 dark:text-brand-300'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                        }`}>
                          <input type="radio" className="sr-only" name="excessFrequency" value={val}
                            checked={rules.excessFrequency === val} onChange={() => setRule('excessFrequency', val)} />
                          <span className={`h-3 w-3 rounded-full border-2 flex-shrink-0 ${
                            rules.excessFrequency === val ? 'border-brand-500 bg-brand-500' : 'border-gray-300 dark:border-gray-600'
                          }`} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Override Invoicing */}
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">{t('contracts.overrideInvoicing')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['separate', t('contracts.overrideSeparate')],
                        ['combined', t('contracts.overrideMerge')],
                      ].map(([val, label]) => (
                        <label key={val} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          rules.overrideInvoicing === val
                            ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/20 dark:text-brand-300'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                        }`}>
                          <input type="radio" className="sr-only" name="overrideInvoicing" value={val}
                            checked={rules.overrideInvoicing === val} onChange={() => setRule('overrideInvoicing', val)} />
                          <span className={`h-3 w-3 rounded-full border-2 flex-shrink-0 ${
                            rules.overrideInvoicing === val ? 'border-brand-500 bg-brand-500' : 'border-gray-300 dark:border-gray-600'
                          }`} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Grouping Strategy */}
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">{t('contracts.groupingStrategy')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['contract', t('contracts.groupContract')],
                        ['city', t('contracts.groupCity')],
                        ['location', t('contracts.groupLocation')],
                        ['printer', t('contracts.groupPrinter')],
                      ].map(([val, label]) => (
                        <label key={val} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          rules.groupingStrategy === val
                            ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/20 dark:text-brand-300'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                        }`}>
                          <input type="radio" className="sr-only" name="groupingStrategy" value={val}
                            checked={rules.groupingStrategy === val} onChange={() => setRule('groupingStrategy', val)} />
                          <span className={`h-3 w-3 rounded-full border-2 flex-shrink-0 ${
                            rules.groupingStrategy === val ? 'border-brand-500 bg-brand-500' : 'border-gray-300 dark:border-gray-600'
                          }`} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Quarterly Breakdown Style — only shown when any frequency is non-monthly */}
                  {needsStartDate && (
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">{t('contracts.quarterlyBreakdownStyle')}</p>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          ['monthly',         t('contracts.breakdownStyleMonthly')],
                          ['quarterly_total', t('contracts.breakdownStyleQuarterlyTotal')],
                        ].map(([val, label]) => (
                          <label key={val} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                            rules.quarterlyBreakdownStyle === val
                              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/20 dark:text-brand-300'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                          }`}>
                            <input type="radio" className="sr-only" name="quarterlyBreakdownStyle" value={val}
                              checked={rules.quarterlyBreakdownStyle === val} onChange={() => setRule('quarterlyBreakdownStyle', val)} />
                            <span className={`h-3 w-3 rounded-full border-2 flex-shrink-0 ${
                              rules.quarterlyBreakdownStyle === val ? 'border-brand-500 bg-brand-500' : 'border-gray-300 dark:border-gray-600'
                            }`} />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contract Start Date — only shown when any frequency is non-monthly */}
                  {needsStartDate && (
                    <div>
                      <FormField label={t('contracts.contractStartDate')} required>
                        <input type="date" className={inputCls} value={rules.contractStartDate ?? ''}
                          onChange={e => setRule('contractStartDate', e.target.value)} />
                        <p className="mt-1 text-xs text-gray-400">{t('contracts.contractStartDateHelper')}</p>
                      </FormField>

                      {/* Period preview */}
                      {rules.contractStartDate && (() => {
                        const freqMonths = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
                        const periodMonths = Math.max(
                          freqMonths[rules.fixedChargeFrequency] || 1,
                          freqMonths[rules.excessFrequency] || 1,
                        )
                        const start = new Date(rules.contractStartDate + 'T00:00:00')
                        const periods = Array.from({ length: 4 }, (_, i) => {
                          const pStart = new Date(start)
                          pStart.setMonth(start.getMonth() + i * periodMonths)
                          const pEnd = new Date(start)
                          pEnd.setMonth(start.getMonth() + (i + 1) * periodMonths)
                          pEnd.setDate(pEnd.getDate() - 1)
                          const fmt = d => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                          const fmtFull = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          return { label: `Period ${i + 1}`, range: `${fmt(pStart)} – ${fmt(pEnd)}`, end: `ends ${fmtFull(pEnd)}` }
                        })
                        return (
                          <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                            <table className="min-w-full text-xs">
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {periods.map(p => (
                                  <tr key={p.label} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                    <td className="px-3 py-1.5 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{p.label}</td>
                                    <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{p.range}</td>
                                    <td className="px-3 py-1.5 text-gray-400 dark:text-gray-500 whitespace-nowrap">{p.end}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('contracts.startDate')} required>
            <input type="date" className={inputCls} value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          </FormField>
          <FormField label={t('contracts.endDate')}>
            <input type="date" className={inputCls} value={form.endDate} onChange={e => set('endDate', e.target.value)} />
          </FormField>
        </div>

        <div className="flex items-center gap-3">
          <Switch.Root checked={form.isActive} onCheckedChange={v => set('isActive', v)}
            className="relative h-5 w-9 rounded-full bg-gray-300 transition-colors data-[state=checked]:bg-brand-500 dark:bg-gray-600">
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
          </Switch.Root>
          <span className="text-sm text-gray-700 dark:text-gray-300">{t('contracts.isActive')}</span>
        </div>

        {error && <ErrorAlert message={error} />}
      </form>
    </Modal>
  )
}
