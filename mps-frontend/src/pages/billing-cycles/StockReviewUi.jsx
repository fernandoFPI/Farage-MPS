import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, ClipboardList, Pencil, Plus, ShieldCheck } from 'lucide-react'
import Modal from '../../components/Modal'
import ErrorAlert from '../../components/ErrorAlert'
import FormField, { inputCls } from '../../components/FormField'
import { useToast } from '../../components/Toast'
import { usePermission } from '../../hooks/usePermission'
import {
  useStockReview,
  useConfirmStock,
  useAdjustStock,
  useAddStock,
  useAcknowledgeStockAnomaly,
  useCycleActivity,
} from '../../api/hooks/useStockReview'
import { fmtDateTime } from '../../utils/format'

const errMsg = (err) => err?.response?.data?.error || err?.message || ''

// Same nine stored quantities the engineer enters. Colour items are hidden for B&W-only models.
const ITEMS = [
  { key: 'cQty', short: 'C', colorOnly: true },
  { key: 'mQty', short: 'M', colorOnly: true },
  { key: 'yQty', short: 'Y', colorOnly: true },
  { key: 'kQty', short: 'K', colorOnly: false },
  { key: 'r1Qty', short: 'R1', colorOnly: false },
  { key: 'r2Qty', short: 'R2', colorOnly: false },
  { key: 'r3Qty', short: 'R3', colorOnly: false },
  { key: 'r4Qty', short: 'R4', colorOnly: false },
  { key: 'wasteTonQty', short: 'W', colorOnly: false },
]

// ── Small badge for the cycles list ──────────────────────────────────────────

export function StockAnomalyBadge({ count, label, title }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
    >
      <AlertTriangle className="h-3 w-3" />
      {label}{count > 1 ? ` ×${count}` : ''}
    </span>
  )
}

// Human text for one flagged group, e.g. "Toner 4 → 175 (+171)"
function anomalyText(t, kind) {
  return `${t(`billingCycles.stockGroup.${kind.key}`)} ${kind.previous} → ${kind.current} (+${kind.rise})`
}

// ── Adjust dialog ────────────────────────────────────────────────────────────

function AdjustStockModal({ open, onClose, cycleId, row }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const adjustMutation = useAdjustStock()
  const [qty, setQty] = useState(() => ({ ...row.quantities }))
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (reason.trim().length < 3) { setError(t('billingCycles.stockReasonRequired')); return }
    const quantities = {}
    for (const item of ITEMS) {
      const v = Number(qty[item.key])
      if (qty[item.key] === '' || !Number.isInteger(v) || v < 0) { setError(t('billingCycles.stockQtyInvalid')); return }
      quantities[item.key] = v
    }
    try {
      await adjustMutation.mutateAsync({ cycleId, historyId: row.historyId, quantities, reason: reason.trim() })
      showToast({ title: t('billingCycles.stockAdjusted'), variant: 'success' })
      onClose()
    } catch (err) {
      setError(errMsg(err))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('billingCycles.stockAdjustTitle')}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={adjustMutation.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={save}
            disabled={adjustMutation.isPending}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {adjustMutation.isPending ? t('common.loading') : t('billingCycles.stockAdjustSave')}
          </button>
        </>
      }
    >
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {row.printerModel}{row.location ? ` — ${row.location}` : ''}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('billingCycles.stockAdjustNote')}</p>
      <div className="grid grid-cols-3 gap-3">
        {ITEMS.filter(i => !i.colorOnly || !row.isBwOnly).map(i => (
          <FormField key={i.key} label={`${i.short}${row.quantities[i.key] !== undefined ? ` (${t('billingCycles.stockWas')} ${row.quantities[i.key]})` : ''}`}>
            <input
              type="number" min="0" inputMode="numeric" className={inputCls}
              value={qty[i.key] ?? ''}
              onChange={e => setQty(q => ({ ...q, [i.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
            />
          </FormField>
        ))}
      </div>
      <FormField label={t('billingCycles.stockReason')} required>
        <textarea
          className={inputCls + ' min-h-[80px] resize-none'}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={t('billingCycles.stockReasonPlaceholder')}
        />
      </FormField>
      {error && <ErrorAlert message={error} />}
    </Modal>
  )
}

// ── Add a stock entry where none was submitted ───────────────────────────────

function AddStockModal({ open, onClose, cycleId, options, initialKey }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const addMutation = useAddStock()
  const [index, setIndex] = useState(() => Math.max(0, options.findIndex(o => `${o.location}|${o.printerModel}` === initialKey)))
  const [qty, setQty] = useState(() => Object.fromEntries(ITEMS.map(i => [i.key, 0])))
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const slot = options[index] ?? options[0]

  async function save() {
    setError('')
    if (reason.trim().length < 3) { setError(t('billingCycles.stockReasonRequired')); return }
    const quantities = {}
    for (const item of ITEMS) {
      if (slot.isBwOnly && item.colorOnly) { quantities[item.key] = 0; continue }
      const v = Number(qty[item.key])
      if (qty[item.key] === '' || !Number.isInteger(v) || v < 0) { setError(t('billingCycles.stockQtyInvalid')); return }
      quantities[item.key] = v
    }
    try {
      await addMutation.mutateAsync({ cycleId, printerModel: slot.printerModel, location: slot.location, quantities, reason: reason.trim() })
      showToast({ title: t('billingCycles.stockAdded'), variant: 'success' })
      onClose()
    } catch (err) {
      setError(errMsg(err))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('billingCycles.stockAddTitle')}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={addMutation.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={save}
            disabled={addMutation.isPending}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {addMutation.isPending ? t('common.loading') : t('billingCycles.stockAddSave')}
          </button>
        </>
      }
    >
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('billingCycles.stockAddNote')}</p>
      <FormField label={t('billingCycles.stockLocationModel')} required>
        <select className={inputCls} value={index} onChange={e => setIndex(Number(e.target.value))}>
          {options.map((o, i) => (
            <option key={`${o.location}|${o.printerModel}`} value={i}>
              {(o.location || t('consumables.storageMainBranch'))} — {o.printerModel}
            </option>
          ))}
        </select>
      </FormField>
      {slot?.serials?.length > 0 && <p className="text-xs text-gray-400">{slot.serials.join(' · ')}</p>}
      <div className="grid grid-cols-3 gap-3">
        {ITEMS.filter(i => !i.colorOnly || !slot?.isBwOnly).map(i => (
          <FormField key={i.key} label={i.short}>
            <input
              type="number" min="0" inputMode="numeric" className={inputCls}
              value={qty[i.key] ?? ''}
              onChange={e => setQty(q => ({ ...q, [i.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
            />
          </FormField>
        ))}
      </div>
      <FormField label={t('billingCycles.stockReason')} required>
        <textarea
          className={inputCls + ' min-h-[80px] resize-none'}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={t('billingCycles.stockAddReasonPlaceholder')}
        />
      </FormField>
      {error && <ErrorAlert message={error} />}
    </Modal>
  )
}

// ── Stock review panel on the cycle detail page ─────────────────────────────

export function StockReviewPanel({ cycle }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const canView = usePermission('can_view_operational_data')
  const canReview = usePermission('can_review_stock')
  const { data: review, isLoading } = useStockReview(cycle.id, canView)
  const confirmMutation = useConfirmStock()
  const ackMutation = useAcknowledgeStockAnomaly()
  const [adjusting, setAdjusting] = useState(null)
  const [adding, setAdding] = useState(null)
  const [error, setError] = useState('')

  if (!canView || isLoading || !review || !review.stockRequired) return null

  const canAct = canReview && review.editable
  const confirmed = !!review.stockConfirmedAt

  async function handleConfirm() {
    setError('')
    try {
      await confirmMutation.mutateAsync(cycle.id)
      showToast({ title: t('billingCycles.stockConfirmedToast'), variant: 'success' })
    } catch (err) { setError(errMsg(err)) }
  }

  async function handleAck(historyId) {
    setError('')
    try {
      await ackMutation.mutateAsync({ cycleId: cycle.id, historyId })
    } catch (err) { setError(errMsg(err)) }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('billingCycles.stockReview')}</h3>
        </div>
        {confirmed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('billingCycles.stockConfirmedBy', { name: review.stockConfirmedByName ?? '—', date: fmtDateTime(review.stockConfirmedAt) })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {t('billingCycles.stockNotConfirmed')}
          </span>
        )}
      </div>

      {review.unacknowledgedCount > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-800/60 dark:bg-red-900/10">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700 dark:text-red-300">{t('billingCycles.stockAnomalyBanner', { count: review.unacknowledgedCount })}</p>
        </div>
      )}

      {review.addOptions?.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800/60 dark:bg-amber-900/10">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800 dark:text-amber-300">{t('billingCycles.stockMissingBanner', { count: review.addOptions.length })}</p>
        </div>
      )}

      {review.rows.length === 0 && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t('billingCycles.stockNoneSubmitted')}</p>
      )}

      {(review.rows.length > 0 || review.addOptions?.length > 0) && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('billingCycles.stockLocationModel')}</th>
                {ITEMS.map(i => <th key={i.key} className="px-2 py-2 text-center font-medium">{i.short}</th>)}
                <th className="px-3 py-2 text-start font-medium">{t('billingCycles.stockSubmittedBy')}</th>
                {canAct && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {review.rows.map(row => {
                const flagged = !!row.anomaly && !row.anomalyAcknowledgedAt
                return (
                  <tr key={row.historyId} className={flagged ? 'bg-red-50/60 dark:bg-red-900/10' : ''}>
                    <td className="px-3 py-2 align-top">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{row.printerModel}</p>
                      <p className="text-gray-500 dark:text-gray-400">{row.location || t('consumables.storageMainBranch')}</p>
                      {row.anomaly && (
                        <p className={`mt-1 ${flagged ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                          {row.anomaly.kinds.map(k => anomalyText(t, k)).join(' · ')}
                          {row.anomalyAcknowledgedAt && ` — ${t('billingCycles.stockAnomalyAcked', { name: row.anomalyAcknowledgedByName ?? '—' })}`}
                        </p>
                      )}
                    </td>
                    {ITEMS.map(i => {
                      const now = row.quantities[i.key]
                      const was = row.previous?.[i.key]
                      const hidden = i.colorOnly && row.isBwOnly
                      return (
                        <td key={i.key} className="px-2 py-2 text-center align-top text-gray-800 dark:text-gray-200">
                          {hidden ? <span className="text-gray-300">–</span> : (
                            <>
                              <span className="font-medium">{now}</span>
                              {was != null && was !== now && <span className="block text-[10px] text-gray-400">{t('billingCycles.stockWas')} {was}</span>}
                            </>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 align-top text-gray-600 dark:text-gray-400">
                      {row.submittedByName ?? '—'}
                      <span className="block text-[10px] text-gray-400">{fmtDateTime(row.submittedAt)}</span>
                    </td>
                    {canAct && (
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-col items-end gap-1">
                          {flagged && (
                            <button
                              onClick={() => handleAck(row.historyId)}
                              disabled={ackMutation.isPending}
                              className="rounded border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20 disabled:opacity-50"
                            >
                              {t('billingCycles.stockAcknowledge')}
                            </button>
                          )}
                          <button
                            onClick={() => setAdjusting(row)}
                            className="flex items-center gap-1 rounded border border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            <Pencil className="h-3 w-3" />{t('billingCycles.stockAdjust')}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
              {/* Locations with active printers where nothing was submitted for this cycle */}
              {(review.addOptions ?? []).map(o => (
                <tr key={`missing-${o.location}|${o.printerModel}`} className="bg-amber-50/60 dark:bg-amber-900/10">
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{o.printerModel}</p>
                    <p className="text-gray-500 dark:text-gray-400">{o.location || t('consumables.storageMainBranch')}</p>
                  </td>
                  <td colSpan={ITEMS.length + 1} className="px-3 py-2 align-middle text-amber-700 dark:text-amber-400">
                    {t('billingCycles.stockMissingRow')}
                    {o.serials?.length > 0 && <span className="ms-2 text-[10px] text-gray-400">{o.serials.join(' · ')}</span>}
                  </td>
                  {canAct && (
                    <td className="px-3 py-2 align-middle">
                      <button
                        onClick={() => setAdding({ key: `${o.location}|${o.printerModel}` })}
                        className="flex items-center gap-1 whitespace-nowrap rounded border border-amber-300 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20"
                      >
                        <Plus className="h-3 w-3" />{t('billingCycles.stockAddShort')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="mt-3"><ErrorAlert message={error} /></div>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {!review.editable ? t('billingCycles.stockLockedNote') : !canReview ? t('billingCycles.stockReviewerOnly') : t('billingCycles.stockConfirmHint')}
        </p>
        {canAct && review.addOptions?.length > 0 && (
          <button
            onClick={() => setAdding({ key: null })}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />{t('billingCycles.stockAdd')}
          </button>
        )}
        {canAct && !confirmed && (
          <button
            onClick={handleConfirm}
            disabled={confirmMutation.isPending || !review.canConfirmStock}
            title={!review.canConfirmStock ? t('billingCycles.stockResolveAnomalies') : undefined}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmMutation.isPending ? t('common.loading') : review.rows.length === 0 ? t('billingCycles.stockConfirmNone') : t('billingCycles.stockConfirm')}
          </button>
        )}
      </div>

      {adding && (
        <AddStockModal open onClose={() => setAdding(null)} cycleId={cycle.id} options={review.addOptions} initialKey={adding.key} />
      )}

      {adjusting && (
        <AdjustStockModal key={adjusting.historyId} open onClose={() => setAdjusting(null)} cycleId={cycle.id} row={adjusting} />
      )}
    </div>
  )
}

// ── Activity log ─────────────────────────────────────────────────────────────

function eventText(t, e) {
  const d = e.detail ?? {}
  const where = d.printerModel ? `${d.printerModel}${d.location ? ` — ${d.location}` : ''}` : ''
  switch (e.type) {
    case 'stock_submitted': return t('billingCycles.activity.stock_submitted', { where })
    case 'stock_adjusted': {
      if (d.added) return t('billingCycles.activity.stock_added', { where, reason: d.reason ?? '' })
      const changes = Object.entries(d.changes ?? {}).map(([k, v]) => `${ITEMS.find(i => i.key === k)?.short ?? k}: ${v.from} → ${v.to}`).join(', ')
      return t('billingCycles.activity.stock_adjusted', { where, changes, reason: d.reason ?? '' })
    }
    case 'stock_anomaly_acknowledged': return t('billingCycles.activity.stock_anomaly_acknowledged', { where })
    case 'stock_confirmed': return d.noStockSubmitted ? t('billingCycles.activity.stock_confirmed_none') : t('billingCycles.activity.stock_confirmed')
    case 'stock_confirmation_reset': return t('billingCycles.activity.stock_confirmation_reset', { reason: d.reason ?? '' })
    case 'cycle_confirmed': return d.userNotRecorded ? t('billingCycles.activity.cycle_confirmed_legacy') : t('billingCycles.activity.cycle_confirmed')
    case 'cycle_unconfirmed': return t('billingCycles.activity.cycle_unconfirmed')
    default: return e.type
  }
}

const DOT = {
  stock_submitted: 'bg-blue-500', stock_adjusted: 'bg-amber-500', stock_anomaly_acknowledged: 'bg-red-400',
  stock_confirmed: 'bg-green-500', stock_confirmation_reset: 'bg-gray-400',
  cycle_confirmed: 'bg-green-600', cycle_unconfirmed: 'bg-gray-500',
}

export function CycleActivityLog({ cycleId }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data: events = [], isLoading } = useCycleActivity(cycleId, open)

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 px-5 py-3 text-start"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <ClipboardList className="h-4 w-4 text-brand-500" />{t('billingCycles.activityTitle')}
        </span>
        <span className="text-xs text-gray-400">{open ? t('billingCycles.activityHide') : t('billingCycles.activityShow')}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          {isLoading ? (
            <p className="text-sm text-gray-400">{t('common.loading')}</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-gray-400">{t('billingCycles.activityNone')}</p>
          ) : (
            <ol className="space-y-3">
              {events.map(e => (
                <li key={e.id} className="flex gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[e.type] ?? 'bg-gray-400'}`} />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200">{eventText(t, e)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {e.userName ?? t('billingCycles.activityUnknownUser')}
                      {e.roleName ? ` (${e.roleName})` : ''} · {fmtDateTime(e.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
