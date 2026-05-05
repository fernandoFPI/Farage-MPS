import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, XCircle, RotateCcw, ArrowUpCircle, Trash2, ChevronDown, ChevronRight, Info, Link2, Layers, Image, Package, Bookmark } from 'lucide-react'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  useBillingCycle,
  useBillingCycleSummary,
  useConfirmCycle,
  useDisputeCycle,
  useReopenCycle,
  useCancelCycle,
  useSetBaseline,
} from '../../api/hooks/useBillingCycles'
import { useBillingCycleGroupSummary, useDeleteCycleGroup, useCycleGroup } from '../../api/hooks/useCycleGroups'
import { useMeterReadings, usePreviousReading } from '../../api/hooks/useMeterReadings'
import { useConsumableReadings } from '../../api/hooks/useConsumableReadings'
import { useCustomerStorage } from '../../api/hooks/useCustomerStorage'
import { useContractGroups } from '../../api/hooks/useContractGroups'
import { CONSUMABLE_FIELD_MAP, COLOR_CONSUMABLES, BW_CONSUMABLES } from '../../utils/consumables'
import PhotoViewerModal from '../../components/PhotoViewerModal'
import GroupCyclesModal from './GroupCyclesModal'
import { usePermission } from '../../hooks/usePermission'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import ConfirmDialog from '../../components/ConfirmDialog'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import { formatPeriod } from '../../utils/dates'
import { formatAmount, formatNumber } from '../../utils/currency'
import { useDocTitle } from '../../hooks/useDocTitle'
import Breadcrumb from '../../components/Breadcrumb'
import { fmtDate, fmtDateTime } from '../../utils/format'

// ── Section heading ──────────────────────────────────────────────────────────
function SectionHeader({ label, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</h2>
      {action}
    </div>
  )
}

// ── Key-value info row ────────────────────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 text-end">{value ?? '—'}</span>
    </div>
  )
}

// ── Billing breakdown row ─────────────────────────────────────────────────────
// badge: 'override' (amber) | 'contract' (gray) | null (no badge)
function BillingRow({ label, units, price, total, isTotal, currency, badge }) {
  const badgeEl = badge ? (
    <span className={`ml-1 text-xs font-normal ${badge === 'override' ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`}>
      ({badge})
    </span>
  ) : null

  return (
    <div className={[
      'flex items-center justify-between py-2',
      isTotal ? 'border-t-2 border-gray-200 dark:border-gray-600 mt-1 pt-3' : 'border-b border-gray-100 dark:border-gray-800',
    ].join(' ')}>
      <span className={`text-sm ${isTotal ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
        {label}{units == null && !isTotal && badgeEl}
      </span>
      <div className="flex items-center gap-3 text-end">
        {units != null && price != null && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatNumber(units)} × {formatNumber(price)}{badgeEl}
          </span>
        )}
        <span className={isTotal
          ? 'text-base font-bold text-brand-600 dark:text-brand-400'
          : 'text-sm font-medium text-gray-900 dark:text-gray-100'}>
          {formatAmount(total, currency)}
        </span>
      </div>
    </div>
  )
}

// ── Simple label/value row (no currency) ─────────────────────────────────────
function MinVolRow({ label, value, badge }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
      <span className="text-sm text-gray-500 dark:text-gray-400">
        {label}
        {badge && (
          <span className={`ml-1.5 text-xs font-normal ${badge === 'override' ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`}>
            ({badge})
          </span>
        )}
      </span>
      <span className="text-sm text-gray-700 dark:text-gray-300">{value}</span>
    </div>
  )
}

// ── Per-printer calculation card ──────────────────────────────────────────────
// reading: the actual meter reading row (has a4Bw, a3Bw, etc.)
// summaryPrinter: the summary entry (has billableBw, billableColor, isBaseline)
function PrinterCalcCard({ reading, summaryPrinter, cycleStart }) {
  const { data: prev } = usePreviousReading(reading.printerId, cycleStart)
  const isBaseline = summaryPrinter?.isBaseline
  const isBwOnly = summaryPrinter?.isBwOnly ?? false

  const n = v => (v ?? 0).toLocaleString()

  const prevA4Bw   = prev?.a4Bw   ?? 0
  const prevA3Bw   = prev?.a3Bw   ?? 0
  const prevA4Color= prev?.a4Color ?? 0
  const prevA3Color= prev?.a3Color ?? 0
  const prevBwTotal = prevA4Bw + prevA3Bw
  const prevColorTotal = prevA4Color + prevA3Color

  const currA4Bw   = reading.a4Bw   ?? 0
  const currA3Bw   = reading.a3Bw   ?? 0
  const currA4Color= reading.a4Color ?? 0
  const currA3Color= reading.a3Color ?? 0
  const currBwTotal    = currA4Bw + currA3Bw
  const currColorTotal = currA4Color + currA3Color

  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{reading.serialNumber}</span>
        <span className="mx-2 text-gray-300 dark:text-gray-600">—</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">{reading.model}</span>
      </div>
      {isBaseline || !prev ? (
        <div className="px-4 py-3 text-sm text-amber-600 dark:text-amber-400 italic">
          Baseline — no previous month
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-4 py-2 text-start font-medium text-gray-400 dark:text-gray-500 w-24"></th>
                <th className="px-3 py-2 text-end font-medium text-gray-400 dark:text-gray-500">A4 BW</th>
                <th className="px-3 py-2 text-end font-medium text-gray-400 dark:text-gray-500">A3 BW</th>
                <th className="px-3 py-2 text-end font-medium text-gray-500 dark:text-gray-400 bg-gray-50/80 dark:bg-gray-800/30">BW Total</th>
                {!isBwOnly && <th className="px-3 py-2 text-end font-medium text-gray-400 dark:text-gray-500">A4 Color</th>}
                {!isBwOnly && <th className="px-3 py-2 text-end font-medium text-gray-400 dark:text-gray-500">A3 Color</th>}
                {!isBwOnly && <th className="px-3 py-2 text-end font-medium text-gray-500 dark:text-gray-400 bg-gray-50/80 dark:bg-gray-800/30">Color Total</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              <tr>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Previous</td>
                <td className="px-3 py-2 text-end text-gray-600 dark:text-gray-400">{n(prevA4Bw)}</td>
                <td className="px-3 py-2 text-end text-gray-600 dark:text-gray-400">{n(prevA3Bw)}</td>
                <td className="px-3 py-2 text-end font-medium text-gray-700 dark:text-gray-300 bg-gray-50/80 dark:bg-gray-800/30">{n(prevBwTotal)}</td>
                {!isBwOnly && <td className="px-3 py-2 text-end text-gray-600 dark:text-gray-400">{n(prevA4Color)}</td>}
                {!isBwOnly && <td className="px-3 py-2 text-end text-gray-600 dark:text-gray-400">{n(prevA3Color)}</td>}
                {!isBwOnly && <td className="px-3 py-2 text-end font-medium text-gray-700 dark:text-gray-300 bg-gray-50/80 dark:bg-gray-800/30">{n(prevColorTotal)}</td>}
              </tr>
              <tr>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Current</td>
                <td className="px-3 py-2 text-end text-gray-600 dark:text-gray-400">{n(currA4Bw)}</td>
                <td className="px-3 py-2 text-end text-gray-600 dark:text-gray-400">{n(currA3Bw)}</td>
                <td className="px-3 py-2 text-end font-medium text-gray-700 dark:text-gray-300 bg-gray-50/80 dark:bg-gray-800/30">{n(currBwTotal)}</td>
                {!isBwOnly && <td className="px-3 py-2 text-end text-gray-600 dark:text-gray-400">{n(currA4Color)}</td>}
                {!isBwOnly && <td className="px-3 py-2 text-end text-gray-600 dark:text-gray-400">{n(currA3Color)}</td>}
                {!isBwOnly && <td className="px-3 py-2 text-end font-medium text-gray-700 dark:text-gray-300 bg-gray-50/80 dark:bg-gray-800/30">{n(currColorTotal)}</td>}
              </tr>
              <tr className="bg-brand-50/60 dark:bg-brand-900/10">
                <td className="px-4 py-2 font-semibold text-brand-700 dark:text-brand-400">Excess ↑</td>
                <td className="px-3 py-2 text-end font-semibold text-brand-600 dark:text-brand-400">{n(Math.max(0, currA4Bw - prevA4Bw))}</td>
                <td className="px-3 py-2 text-end font-semibold text-brand-600 dark:text-brand-400">{n(Math.max(0, currA3Bw - prevA3Bw))}</td>
                <td className="px-3 py-2 text-end font-bold text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20">{n(Math.max(0, currBwTotal - prevBwTotal))}</td>
                {!isBwOnly && <td className="px-3 py-2 text-end font-semibold text-brand-600 dark:text-brand-400">{n(Math.max(0, currA4Color - prevA4Color))}</td>}
                {!isBwOnly && <td className="px-3 py-2 text-end font-semibold text-brand-600 dark:text-brand-400">{n(Math.max(0, currA3Color - prevA3Color))}</td>}
                {!isBwOnly && <td className="px-3 py-2 text-end font-bold text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20">{n(Math.max(0, currColorTotal - prevColorTotal))}</td>}
              </tr>
            </tbody>
          </table>
          <div className="flex items-center gap-6 px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Billable BW: <span className="font-semibold text-gray-900 dark:text-gray-100">{n(summaryPrinter?.billableBw)} pages</span></span>
            {!isBwOnly && <span className="text-gray-500 dark:text-gray-400">Billable Color: <span className="font-semibold text-gray-900 dark:text-gray-100">{n(summaryPrinter?.billableColor)} pages</span></span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Calculation details collapsible panel ─────────────────────────────────────
function CalcDetailsPanel({ readings, summary, cycleStart }) {
  const [open, setOpen] = useState(false)
  if (!readings?.length) return null

  const summaryPrinterMap = Object.fromEntries(
    (summary?.printers ?? []).map(p => [p.printerId, p])
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors text-start"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          Calculation Details
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">for reference only</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-4 space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              These figures are for reference only and are not included in the invoice.
            </p>
          </div>
          {readings.map(r => (
            <PrinterCalcCard
              key={r.id}
              reading={r}
              summaryPrinter={summaryPrinterMap[r.printerId]}
              cycleStart={cycleStart}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Billing breakdown section ─────────────────────────────────────────────────
// overrides: { fixedCharge: bool, bwPrice: bool, colorPrice: bool } | null (null = default group, no badges)
function BillingBreakdown({ billing, t, currency, overrides, allBwOnly }) {
  if (!billing) return null
  const type = billing.billingType

  const bwBadge    = overrides ? (overrides.bwPrice     ? 'override' : 'contract') : null
  const colorBadge = overrides ? (overrides.colorPrice   ? 'override' : 'contract') : null
  const fixedBadge = overrides ? (overrides.fixedCharge  ? 'override' : 'contract') : null
  const exBwBadge  = overrides ? (overrides.bwPrice      ? 'override' : 'contract') : null
  const exClBadge  = overrides ? (overrides.colorPrice   ? 'override' : 'contract') : null

  if (type === 'per_click') {
    return (
      <div>
        <BillingRow label={t('billingCycles.bwCost')} units={billing.bwUnits} price={billing.bwPrice} total={billing.bwCost} currency={currency} badge={bwBadge} />
        {!allBwOnly && <BillingRow label={t('billingCycles.colorCost')} units={billing.colorUnits} price={billing.colorPrice} total={billing.colorCost} currency={currency} badge={colorBadge} />}
        <BillingRow label={t('billingCycles.fixedCharge')} total={billing.fixedCharge} currency={currency} badge={fixedBadge} />
        <BillingRow label={t('billingCycles.total')} total={billing.total} isTotal currency={currency} />
      </div>
    )
  }

  if (type === 'minimum_volume') {
    const bwExceeded    = (billing.bwExcess    ?? 0) > 0
    const colorExceeded = (billing.colorExcess ?? 0) > 0
    const bwMinBadge    = overrides ? (overrides.minBwPages    ? 'override' : 'contract') : null
    const colorMinBadge = overrides ? (overrides.minColorPages ? 'override' : 'contract') : null
    return (
      <div>
        {/* BW section */}
        <MinVolRow label={t('billingCycles.bwPagesUsed')}  value={formatNumber(billing.bwPages    ?? 0)} />
        <MinVolRow label={t('billingCycles.bwMinimum')}    value={formatNumber(billing.bwMinimum  ?? 0)} badge={bwMinBadge} />
        <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
          <span className="text-sm text-gray-600 dark:text-gray-400">{t('billingCycles.excessBw')}</span>
          {bwExceeded ? (
            <div className="flex items-center gap-2 text-end">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {formatNumber(billing.bwExcess)} × {formatNumber(billing.bwPrice)}
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                = {formatAmount(billing.bwCost, currency)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-500">{t('billingCycles.notExceeded')}</span>
          )}
        </div>

        {/* Color section */}
        <MinVolRow label={t('billingCycles.colorPagesUsed')} value={formatNumber(billing.colorPages   ?? 0)} />
        <MinVolRow label={t('billingCycles.colorMinimum')}   value={formatNumber(billing.colorMinimum ?? 0)} badge={colorMinBadge} />
        <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
          <span className="text-sm text-gray-600 dark:text-gray-400">{t('billingCycles.excessColor')}</span>
          {colorExceeded ? (
            <div className="flex items-center gap-2 text-end">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {formatNumber(billing.colorExcess)} × {formatNumber(billing.colorPrice)}
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                = {formatAmount(billing.colorCost, currency)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-500">{t('billingCycles.notExceeded')}</span>
          )}
        </div>

        {/* Fixed charge & total */}
        <BillingRow label={t('billingCycles.fixedCharge')} total={billing.fixedCharge} currency={currency} badge={fixedBadge} />
        <BillingRow label={t('billingCycles.total')} total={billing.total} isTotal currency={currency} />
      </div>
    )
  }

  // PSG Simple
  if (type === 'psg_simple') {
    return (
      <div>
        <BillingRow label={t('billingCycles.bwCost')} units={billing.bwUnits} price={billing.a4Price} total={billing.bwCost} currency={currency} />
        <BillingRow label={t('billingCycles.colorCost')} units={billing.colorUnits} price={billing.a4Price} total={billing.colorCost} currency={currency} />
        <BillingRow label={t('billingCycles.total')} total={billing.total} isTotal currency={currency} />
      </div>
    )
  }

  // PSG
  return (
    <div>
      <div className="mb-1 text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">A4</div>
      <BillingRow label={t('billingCycles.a4BwPages')}    units={billing.a4BwUsage}    currency={currency} />
      <BillingRow label={t('billingCycles.a4ColorPages')} units={billing.a4ColorUsage} currency={currency} />
      <BillingRow label={t('billingCycles.totalA4Pages')} units={billing.totalA4} price={billing.a4Price} total={billing.a4Cost} currency={currency} />
      <div className="mb-1 mt-3 text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">A3</div>
      <BillingRow label={t('billingCycles.a3BwPages')}    units={billing.a3BwUsage}    currency={currency} />
      <BillingRow label={t('billingCycles.a3ColorPages')} units={billing.a3ColorUsage} currency={currency} />
      <BillingRow label={t('billingCycles.totalA3Pages')} units={billing.totalA3} price={billing.a3Price} total={billing.a3Cost} currency={currency} />
      <BillingRow label={t('billingCycles.total')} total={billing.total} isTotal currency={currency} />
    </div>
  )
}

// ── Dispute modal ─────────────────────────────────────────────────────────────
function DisputeModal({ open, onClose, onSubmit, loading }) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!note.trim()) return setError(t('billingCycles.disputeNoteRequired'))
    onSubmit(note.trim())
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('billingCycles.disputeCycle')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="submit" form="dispute-form" disabled={loading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {loading ? t('common.loading') : t('billingCycles.disputeCycle')}
          </button>
        </>
      }
    >
      <form id="dispute-form" onSubmit={handleSubmit} className="space-y-3">
        <FormField label={t('billingCycles.disputeNote')} required>
          <textarea
            rows={4}
            className={`${inputCls} resize-none`}
            placeholder={t('billingCycles.disputeNotePlaceholder')}
            value={note}
            onChange={e => { setNote(e.target.value); setError('') }}
          />
        </FormField>
        {error && <ErrorAlert message={error} />}
      </form>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BillingCycleDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const canConfirm = usePermission('can_confirm_billing')
  const canManage = usePermission('can_manage_billing')
  const canPushToOdoo = usePermission('can_push_to_odoo')
  const { user } = useAuth()
  const isAdmin = user?.role?.name === 'admin'
  const isEngineer = user?.role?.name === 'engineer'
  const [photoReadingId, setPhotoReadingId] = useState(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [baselineOpen, setBaselineOpen] = useState(false)
  const [removeBaselineOpen, setRemoveBaselineOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [groupCyclesOpen, setGroupCyclesOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const [consumablesOpen, setConsumablesOpen] = useState(false)

  const cancelMutation = useCancelCycle()
  const deleteGroupMutation = useDeleteCycleGroup()
  const setBaselineMutation = useSetBaseline()

  // Parallel fetches — independent loading states
  const { data: cycle, isLoading: cycleLoading, refetch: refetchCycle } = useBillingCycle(id)
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useBillingCycleSummary(id)
  const { data: readings = [], isLoading: readingsLoading } = useMeterReadings({ billingCycleId: id })
  const { data: consumableReadings = [] } = useConsumableReadings({ billingCycleId: id })
  const customerId = cycle?.contract?.customer?.id
  const { data: storageSnapshot = [] } = useCustomerStorage(customerId)
  const { data: groupSummary } = useBillingCycleGroupSummary(
    cycle?.groupPosition === 3 && cycle?.cycleGroupId ? id : null
  )
  const { data: groupInfo } = useCycleGroup(cycle?.cycleGroupId ?? null)
  const contractId = cycle?.contractId ?? null
  const { data: contractGroupMemberships = [] } = useContractGroups({ contractId: contractId ?? undefined })
  const contractGroup = contractId && contractGroupMemberships[0] ? contractGroupMemberships[0] : null

  const confirmMutation = useConfirmCycle()
  const disputeMutation = useDisputeCycle()
  const reopenMutation = useReopenCycle()

  // ── Action handlers ──────────────────────────────────────────────────────
  async function handleConfirm() {
    setActionError('')
    try {
      await confirmMutation.mutateAsync(id)
      showToast({ title: t('billingCycles.confirmCycle'), variant: 'success' })
      setConfirmOpen(false)
    } catch (err) {
      setActionError(err.response?.data?.error || err.message)
    }
  }

  async function handleDispute(reason) {
    try {
      await disputeMutation.mutateAsync({ id, reason })
      showToast({ title: t('billingCycles.disputeCycle'), variant: 'warning' })
      setDisputeOpen(false)
    } catch (err) {
      setActionError(err.response?.data?.error || err.message)
    }
  }

  async function handleReopen() {
    setActionError('')
    try {
      await reopenMutation.mutateAsync(id)
      showToast({ title: t('billingCycles.reopenCycle'), variant: 'info' })
      setReopenOpen(false)
    } catch (err) {
      setActionError(err.response?.data?.error || err.message)
    }
  }

  function handlePushToOdoo() {
    showToast({ title: t('billingCycles.pushToOdoo'), description: t('billingCycles.odooComingSoon'), variant: 'info' })
  }

  async function handleCancel() {
    setActionError('')
    try {
      await cancelMutation.mutateAsync(id)
      showToast({ title: 'Billing cycle cancelled', variant: 'success' })
      navigate('/billing-cycles')
    } catch (err) {
      setActionError(err.response?.data?.error || err.message)
      setDeleteOpen(false)
    }
  }

  async function handleSetBaseline(isBaseline) {
    setActionError('')
    try {
      await setBaselineMutation.mutateAsync({ id, isBaseline })
      showToast({ title: isBaseline ? t('billingCycles.markAsBaseline') : t('billingCycles.removeBaseline'), variant: 'success' })
      setBaselineOpen(false)
      setRemoveBaselineOpen(false)
      await Promise.all([refetchCycle(), refetchSummary()])
    } catch (err) {
      setActionError(err.response?.data?.error || err.message)
    }
  }

  useDocTitle(cycle?.cycleName ?? (cycle ? `${cycle.contract?.contractNumber ?? ''} — ${formatPeriod(cycle.periodStart, cycle.periodEnd)}` : undefined))

  // ── Loading / not found ──────────────────────────────────────────────────
  if (cycleLoading) return <LoadingSpinner className="py-20" />
  if (!cycle) return <p className="p-6 text-gray-500">{t('common.noData')}</p>

  const { status } = cycle
  const currency = cycle.contract?.currency ?? 'IQD'
  const hasReadings = (summary?.printers?.length ?? 0) > 0
  const isThreeCycleQuarterly = cycle.contract?.invoiceFrequency === 'three_cycle_quarterly'
  const canGroupCycles = isThreeCycleQuarterly && status === 'confirmed' && !cycle.cycleGroupId
  const isPendingQuarterly = status === 'pending_quarterly'
  const isInvoicingCycle = cycle.groupPosition === 3 && !!cycle.cycleGroupId

  return (
    <>
    <Tooltip.Provider delayDuration={200}>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: t('nav.billingCycles'), to: '/billing-cycles' }, { label: cycle.cycleName ?? `${cycle.contract?.contractNumber ?? '—'} — ${formatPeriod(cycle.periodStart, cycle.periodEnd)}` }]} />
        {/* ── Header ── */}
        <PageHeader
          title={cycle.cycleName ?? cycle.contract?.contractNumber ?? '—'}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
              <span>
                <span className="text-gray-400">Customer:</span>{' '}
                <Link to={`/customers/${cycle.contract?.customerId}`}
                  className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                  {cycle.contract?.customer?.name ?? '—'}
                </Link>
              </span>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>
                <span className="text-gray-400">Contract:</span>{' '}
                <Link to={`/contracts/${cycle.contractId}`}
                  className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                  {cycle.contract?.contractNumber ?? '—'}
                </Link>
              </span>
              {cycle.contract?.officialContractNumber && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span>
                    <span className="text-gray-400">{t('contracts.invoiceReference')}:</span>{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-300">{cycle.contract.officialContractNumber}</span>
                  </span>
                </>
              )}
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                cycle.contract?.contractMode === 'psg'
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  : cycle.contract?.contractMode === 'psg_simple'
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {cycle.contract?.contractMode === 'psg' ? 'PSG'
                  : cycle.contract?.contractMode === 'psg_simple' ? 'PSG Simple'
                  : 'OSG'}
              </span>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>
                <span className="text-gray-400">Period:</span>{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">{formatPeriod(cycle.periodStart, cycle.periodEnd)}</span>
              </span>
            </span>
          }
          actions={
            <div className="flex gap-2">
              <button onClick={() => navigate(-1)}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:text-gray-300">
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t('common.back')}
              </button>
            </div>
          }
        />

        {/* ── Cycle info card ── */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            <div>
              <InfoRow label={t('billingCycles.period')} value={formatPeriod(cycle.periodStart, cycle.periodEnd)} />
              <InfoRow label={t('common.status')} value={<StatusBadge status={cycle.status} />} />
              <InfoRow label={t('billingCycles.specialist')} value={cycle.specialist?.fullName ?? cycle.specialistName ?? '—'} />
            </div>
            <div>
              <InfoRow label={t('billingCycles.contract')} value={
                <Link to={`/contracts/${cycle.contractId}`} className="text-brand-600 hover:underline dark:text-brand-400">
                  {cycle.contract?.contractNumber ?? '—'}
                </Link>
              } />
              {cycle.contract?.officialContractNumber && (
                <InfoRow label={t('contracts.invoiceReference')} value={cycle.contract.officialContractNumber} />
              )}
              <InfoRow label={t('billingCycles.customer')} value={
                cycle.contract?.customerId
                  ? <Link to={`/customers/${cycle.contract.customerId}`} className="text-brand-600 hover:underline dark:text-brand-400">
                      {cycle.contract?.customer?.name ?? '—'}
                    </Link>
                  : '—'
              } />
              <InfoRow label={t('common.createdAt')} value={fmtDate(cycle.createdAt)} />
            </div>
          </div>
        </div>

        {/* ── Contract Group banner ── */}
        {contractGroup && (
          <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-900/40 dark:bg-indigo-950/20 px-4 py-3">
            <Layers className="h-4 w-4 shrink-0 text-indigo-500" />
            <p className="text-sm text-indigo-700 dark:text-indigo-300 flex-1">
              {t('contractGroups.memberBanner', { name: contractGroup.name })}
            </p>
            <Link to={`/contract-groups/${contractGroup.id}`}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap">
              {t('contractGroups.viewGroup')} →
            </Link>
          </div>
        )}

        {/* ── Baseline banner ── */}
        {cycle.isBaseline && (
          <div className="rounded-lg bg-blue-600 dark:bg-blue-700 px-5 py-4 text-white shadow">
            <div className="flex items-start gap-3">
              <Bookmark className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{t('billingCycles.baselineBanner')}</p>
                <p className="mt-0.5 text-sm text-blue-100">{t('billingCycles.baselineBannerDesc')}</p>
                {cycle.baselineSetBy && cycle.baselineSetAt && (
                  <p className="mt-1.5 text-xs text-blue-200">
                    {t('billingCycles.baselineSetBy')} {cycle.baselineSetByName ?? cycle.baselineSetBy} {t('common.on')} {fmtDate(cycle.baselineSetAt)}
                  </p>
                )}
              </div>
              {isAdmin && (
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">Admin</span>
              )}
            </div>
          </div>
        )}

        {/* ── Billing Summary ── */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <SectionHeader
            label={t('billingCycles.summary')}
            action={
              <button onClick={() => refetchSummary()}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                <RefreshCw className="h-3 w-3" />{t('billingCycles.refreshSummary')}
              </button>
            }
          />

          {summaryLoading ? (
            <LoadingSpinner className="py-10" />
          ) : !hasReadings ? (
            <div className="py-6 text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('billingCycles.noReadings')}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('billingCycles.noReadingsDesc')}</p>
              <Link to="/meter-readings/submit"
                className="mt-4 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400">
                {t('billingCycles.submitReading')} →
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Printers usage table */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('billingCycles.printers')}</p>
                <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
                  <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        {['', t('printers.serialNumber'), t('printers.model'), 'Type',
                          t('billingCycles.excessBw'), t('billingCycles.excessColor'),
                          t('meterReadings.usage') + ' BW', t('meterReadings.usage') + ' Color',
                        ].map((h, i) => (
                          <th key={i} className="px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {summary.printers.map(p => (
                        <tr key={p.printerId ?? p.serialNumber}
                          className={p.flagged ? 'bg-amber-50 dark:bg-amber-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}>
                          <td className="w-8 px-3 py-2">
                            {p.flagged ? (
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <button className="flex items-center">
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                  </button>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content side="top"
                                    className="max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-gray-700">
                                    {p.flagReason}
                                    <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">{p.serialNumber ?? '—'}</td>
                          <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{p.model ?? '—'}</td>
                          <td className="px-3 py-2 text-sm">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <StatusBadge status={p.contractType} />
                              {p.isBwOnly && (
                                <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">{t('printers.bwOnlyBadge')}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{formatNumber(p.excessBw ?? 0)}</td>
                          <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{p.isBwOnly ? '—' : formatNumber(p.excessColor ?? 0)}</td>
                          <td className="px-3 py-2 text-sm">
                            {p.isBaseline
                              ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">baseline</span>
                              : <span className="font-semibold text-brand-600 dark:text-brand-400">{formatNumber(p.billableBw ?? 0)}</span>}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {p.isBwOnly
                              ? <span className="text-gray-400 dark:text-gray-500">—</span>
                              : p.isBaseline
                              ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">baseline</span>
                              : <span className="font-semibold text-brand-600 dark:text-brand-400">{formatNumber(p.billableColor ?? 0)}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Billing breakdown — one card per invoice */}
              {summary.isBaseline ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('billingCycles.billing')}</p>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">{t('billingCycles.baselineSummary')}</p>
                      <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">{t('billingCycles.total')}: {formatAmount(0, currency)}</p>
                    </div>
                  </div>
                </div>
              ) : summary.invoices?.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('billingCycles.billing')}</p>
                  <div className="space-y-3">
                    {summary.invoices.map((inv, i) => (
                      <div key={i} className="rounded-lg border border-gray-100 p-4 dark:border-gray-800">
                        {/* Card header — title + printer list */}
                        <div className="mb-3 pb-2 border-b border-gray-100 dark:border-gray-800">
                          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                            {inv.type === 'osg_default'
                              ? t('billingCycles.defaultGroup')
                              : inv.type === 'osg_override'
                              ? `${t('printers.serialNumber')}: ${inv.serialNumber}`
                              : inv.type === 'psg_simple'
                              ? 'PSG Simple'
                              : 'PSG'}
                          </p>
                          {inv.type === 'osg_default' && inv.serialNumbers?.length > 0 && (
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {inv.serialNumbers.join(', ')}
                            </p>
                          )}
                        </div>
                        <BillingBreakdown billing={inv.billing} t={t} currency={currency} overrides={inv.overrides ?? null} allBwOnly={inv.allBwOnly ?? false} />
                      </div>
                    ))}
                    {/* Grand total — only shown when multiple invoices */}
                    {summary.invoices.length > 1 && (
                      <div className="rounded-lg border-2 border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/20">
                        <BillingRow label={t('billingCycles.grandTotal')} total={summary.billing.total} isTotal currency={currency} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Meter Readings ── */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <SectionHeader label={t('meterReadings.title')} />
          {readingsLoading ? (
            <LoadingSpinner className="py-10" />
          ) : !readings.length ? (
            <EmptyState title={t('common.noData')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    {[
                      t('printers.serialNumber'), t('meterReadings.source'),
                      t('meterReadings.a4Bw'), t('meterReadings.a3Bw'),
                      t('meterReadings.a4Color'), t('meterReadings.a3Color'),
                      t('meterReadings.readAt'),
                      t('meterReadings.submittedBy'),
                      t('meterReadings.submittedAt'),
                      t('meterReadings.flagged'),
                      ...(!isEngineer ? [t('meterReadings.photos')] : []),
                    ].map(h => (
                      <th key={h} className="px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {readings.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">{r.serialNumber ?? '—'}</td>
                      <td className="px-3 py-2 text-sm"><StatusBadge status={r.source} /></td>
                      <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{r.a4Bw ?? '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{r.a3Bw ?? '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{r.a4Color ?? '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{r.a3Color ?? '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtDateTime(r.readAt)}</td>
                      <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{r.submittedByName ?? '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{r.submittedAt ? fmtDateTime(r.submittedAt) : '—'}</td>
                      <td className="px-3 py-2 text-sm">
                        {r.flagged ? (
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button><AlertTriangle className="h-4 w-4 text-red-500" /></button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content side="top"
                                className="max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-xs text-white dark:bg-gray-700">
                                {r.flagReason}
                                <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        ) : null}
                      </td>
                      {!isEngineer && (
                        <td className="px-3 py-2 text-sm">
                          {r.photos?.length > 0 ? (
                            <button
                              onClick={() => setPhotoReadingId(r.id)}
                              className="flex items-center gap-1 text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                            >
                              <Image className="h-4 w-4" />
                              <span className="text-xs">{r.photos.length}</span>
                            </button>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Calculation Details ── */}
        <CalcDetailsPanel readings={readings} summary={summary} cycleStart={cycle.periodStart} />

        {/* ── Quarterly Invoice Summary (invoicing cycle only) ── */}
        {isInvoicingCycle && groupSummary && (
          <div className="rounded-lg border border-teal-200 bg-white p-5 shadow-sm dark:border-teal-800 dark:bg-gray-900">
            <SectionHeader label={t('billingCycles.quarterlyInvoiceSummary')} />
            <div className="space-y-2">
              {groupSummary.cycles?.map((c, i) => (
                <div key={i}>
                  {groupSummary.combinedInvoice ? (
                    <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{c.cycleName}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatAmount(c.total, currency)}</span>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-3 mb-2">
                      <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 mb-2">{c.cycleName}</p>
                      {c.billing && (
                        <div className="space-y-1 text-sm">
                          {c.billing.bwCost != null && <div className="flex justify-between"><span className="text-gray-500">{t('billingCycles.bwCost')}</span><span>{formatAmount(c.billing.bwCost, currency)}</span></div>}
                          {c.billing.colorCost != null && <div className="flex justify-between"><span className="text-gray-500">{t('billingCycles.colorCost')}</span><span>{formatAmount(c.billing.colorCost, currency)}</span></div>}
                          {c.billing.fixedCharge != null && <div className="flex justify-between"><span className="text-gray-500">{t('billingCycles.fixedCharge')}</span><span>{formatAmount(c.billing.fixedCharge, currency)}</span></div>}
                          <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-1 font-semibold"><span>{t('billingCycles.total')}</span><span className="text-brand-600 dark:text-brand-400">{formatAmount(c.total, currency)}</span></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between border-t-2 border-teal-200 dark:border-teal-700 pt-3 mt-2">
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('billingCycles.grandTotal')}</span>
                <span className="text-base font-bold text-teal-600 dark:text-teal-400">{formatAmount(groupSummary.grandTotal, currency)}</span>
              </div>
            </div>
            {canPushToOdoo && (
              <div className="mt-4">
                <button
                  onClick={handlePushToOdoo}
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
                >
                  <ArrowUpCircle className="h-4 w-4" />{t('billingCycles.pushQuarterlyInvoice')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Consumable Readings ── */}
        {(consumableReadings.length > 0 || storageSnapshot.length > 0) && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 overflow-hidden">
            <button
              type="button"
              onClick={() => setConsumablesOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 text-start"
            >
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t('consumables.title')}</span>
              </div>
              {consumablesOpen
                ? <ChevronDown className="h-4 w-4 text-gray-400" />
                : <ChevronRight className="h-4 w-4 text-gray-400" />
              }
            </button>

            {consumablesOpen && (
              <div className="px-5 pb-5 space-y-5 border-t border-gray-100 dark:border-gray-800 pt-4">
                {/* Printer levels */}
                {consumableReadings.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{t('consumables.printerLevels')}</p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800/50">
                          <tr>
                            <th className="px-3 py-2 text-start text-gray-500 dark:text-gray-400 font-semibold">{t('printers.serialNumber')}</th>
                            <th className="px-3 py-2 text-start text-gray-500 dark:text-gray-400 font-semibold">{t('printers.model')}</th>
                            {COLOR_CONSUMABLES.map(c => (
                              <th key={c} className="px-2 py-2 text-center text-gray-500 dark:text-gray-400 font-semibold whitespace-nowrap">{c === 'wasteToner' ? 'WT' : c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {consumableReadings.map(r => (
                            <tr key={r.id}>
                              <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300">{r.printerSerial}</td>
                              <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{r.printerModel}</td>
                              {COLOR_CONSUMABLES.map(c => {
                                const { pctKey } = CONSUMABLE_FIELD_MAP[c]
                                const isNA = r.isBwOnly && !BW_CONSUMABLES.includes(c)
                                const val = r[pctKey]
                                let cls = 'text-gray-300 dark:text-gray-600'
                                if (!isNA && val != null) {
                                  if (val <= 20) cls = 'text-red-600 dark:text-red-400 font-semibold'
                                  else if (val <= 40) cls = 'text-amber-600 dark:text-amber-400 font-semibold'
                                  else cls = 'text-green-600 dark:text-green-400'
                                }
                                return (
                                  <td key={c} className="px-2 py-1.5 text-center">
                                    {isNA || val == null
                                      ? <span className="text-gray-300 dark:text-gray-600">—</span>
                                      : <span className={cls}>{val}%</span>
                                    }
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Storage snapshot */}
                {storageSnapshot.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{t('consumables.customerStorage')}</p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800/50">
                          <tr>
                            <th className="px-3 py-2 text-start text-gray-500 dark:text-gray-400 font-semibold">{t('printers.model')}</th>
                            {COLOR_CONSUMABLES.map(c => (
                              <th key={c} className="px-2 py-2 text-center text-gray-500 dark:text-gray-400 font-semibold whitespace-nowrap">{c === 'wasteToner' ? 'WT' : c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {storageSnapshot.map(s => (
                            <tr key={s.printerModel}>
                              <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{s.printerModel}</td>
                              {COLOR_CONSUMABLES.map(c => {
                                const { qtyKey } = CONSUMABLE_FIELD_MAP[c]
                                const isNA = s.isBwOnly && !BW_CONSUMABLES.includes(c)
                                const val = s[qtyKey]
                                let cls = 'text-gray-700 dark:text-gray-300'
                                if (!isNA) {
                                  if (val === 0) cls = 'text-red-600 dark:text-red-400 font-semibold'
                                  else if (val <= 2) cls = 'text-amber-600 dark:text-amber-400 font-semibold'
                                  else cls = 'text-green-600 dark:text-green-400'
                                }
                                return (
                                  <td key={c} className="px-2 py-1.5 text-center">
                                    {isNA
                                      ? <span className="text-gray-300 dark:text-gray-600">—</span>
                                      : <span className={cls}>{val}</span>
                                    }
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Actions ── */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <SectionHeader label={t('common.actions')} />

          {actionError && <div className="mb-4"><ErrorAlert message={actionError} /></div>}

          {/* Pending quarterly banner */}
          {isPendingQuarterly && groupInfo && (
            <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/20">
              <div className="flex items-center gap-2 mb-1.5">
                <Link2 className="h-4 w-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-teal-800 dark:text-teal-300">{t('billingCycles.pendingQuarterlyBanner')}</span>
              </div>
              <p className="text-xs text-teal-700 dark:text-teal-400 mb-1">It will be invoiced together with:</p>
              <ul className="space-y-0.5">
                {groupInfo.cycles?.filter(c => c.id !== id).map(c => (
                  <li key={c.id} className="text-xs text-teal-700 dark:text-teal-400">
                    • {c.cycleName}
                    {c.groupPosition === 3 && <span className="ml-1 opacity-60">({t('billingCycles.invoicingCycle')})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Disputed note display */}
          {status === 'disputed' && cycle.disputeNote && (
            <div className="mb-4 rounded-lg border-s-4 border-red-500 bg-amber-50 p-4 dark:bg-amber-900/10">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t(`billingCycles.status.disputed`)}</span>
              </div>
              <p className="text-sm italic text-amber-700 dark:text-amber-400">"{cycle.disputeNote}"</p>
            </div>
          )}

          {/* Invoiced state */}
          {status === 'invoiced' && (
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/10">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="text-sm font-semibold text-green-800 dark:text-green-300">Invoice pushed to Odoo</span>
              </div>
              {cycle.odooInvoiceId && (
                <p className="text-sm text-green-700 dark:text-green-400">
                  {t('billingCycles.odooInvoiceId')}: <span className="font-mono font-medium">{cycle.odooInvoiceId}</span>
                </p>
              )}
              {cycle.invoicedAt && (
                <p className="text-sm text-green-700 dark:text-green-400">
                  {t('billingCycles.invoicedAt')}: {fmtDateTime(cycle.invoicedAt)}
                </p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 mt-3">
            {/* Confirm */}
            {canConfirm && (status === 'open' || status === 'pending_confirmation') && (
              <button
                onClick={() => { setActionError(''); setConfirmOpen(true) }}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4" />{t('billingCycles.confirmCycle')}
              </button>
            )}

            {/* Dispute */}
            {canConfirm && (status === 'open' || status === 'pending_confirmation') && !isPendingQuarterly && (
              <button
                onClick={() => { setActionError(''); setDisputeOpen(true) }}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                <XCircle className="h-4 w-4" />{t('billingCycles.disputeCycle')}
              </button>
            )}

            {/* Reopen */}
            {canManage && status === 'disputed' && (
              <button
                onClick={() => { setActionError(''); setReopenOpen(true) }}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              >
                <RotateCcw className="h-4 w-4" />{t('billingCycles.reopenCycle')}
              </button>
            )}

            {/* Push to Odoo */}
            {canPushToOdoo && status === 'confirmed' && (
              <button
                onClick={handlePushToOdoo}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
              >
                <ArrowUpCircle className="h-4 w-4" />{t('billingCycles.pushToOdoo')}
              </button>
            )}

            {/* Group Cycles — three_cycle_quarterly + confirmed + not grouped */}
            {canGroupCycles && (
              <button
                onClick={() => { setActionError(''); setGroupCyclesOpen(true) }}
                className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                <Layers className="h-4 w-4" />{t('billingCycles.groupCycles')}
              </button>
            )}

            {/* Baseline toggle — admin only */}
            {isAdmin && (
              cycle.isBaseline ? (
                <button
                  onClick={() => { setActionError(''); setRemoveBaselineOpen(true) }}
                  disabled={status === 'invoiced'}
                  className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Bookmark className="h-4 w-4" />{t('billingCycles.removeBaseline')}
                </button>
              ) : (
                <button
                  onClick={() => { setActionError(''); setBaselineOpen(true) }}
                  disabled={status === 'invoiced'}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Bookmark className="h-4 w-4" />{t('billingCycles.markAsBaseline')}
                </button>
              )
            )}

            {/* Delete — admin only */}
            {isAdmin && (
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span>
                    <button
                      onClick={() => { setActionError(''); setDeleteOpen(true) }}
                      disabled={status === 'invoiced'}
                      className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-4 w-4" />Delete Cycle
                    </button>
                  </span>
                </Tooltip.Trigger>
                {status === 'invoiced' && (
                  <Tooltip.Portal>
                    <Tooltip.Content side="top"
                      className="rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-gray-700">
                      Cannot cancel an invoiced cycle
                      <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                )}
              </Tooltip.Root>
            )}
          </div>
        </div>

        {/* ── Dialogs ── */}
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={handleConfirm}
          title={t('billingCycles.confirmCycle')}
          description={[
            t('billingCycles.confirmPrompt'),
            summary?.billing?.total != null ? `\n${t('billingCycles.total')}: ${formatAmount(summary.billing.total, currency)}` : '',
          ].join('')}
          loading={confirmMutation.isPending}
          confirmLabel={t('billingCycles.confirmCycle')}
          confirmClassName="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        />

        <DisputeModal
          open={disputeOpen}
          onClose={() => setDisputeOpen(false)}
          onSubmit={handleDispute}
          loading={disputeMutation.isPending}
        />

        <ConfirmDialog
          open={reopenOpen}
          onClose={() => setReopenOpen(false)}
          onConfirm={handleReopen}
          title={t('billingCycles.reopenCycle')}
          description={t('billingCycles.reopenPrompt')}
          loading={reopenMutation.isPending}
          confirmLabel={t('billingCycles.reopenCycle')}
          confirmClassName="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        />

        <GroupCyclesModal
          open={groupCyclesOpen}
          onClose={() => setGroupCyclesOpen(false)}
          cycle={cycle}
        />

        <ConfirmDialog
          open={baselineOpen}
          onClose={() => setBaselineOpen(false)}
          onConfirm={() => handleSetBaseline(true)}
          title={t('billingCycles.baselineConfirmTitle')}
          description={[
            cycle.cycleName ?? cycle.contract?.contractNumber ?? '—',
            `\n\n${t('billingCycles.baselineConfirmDesc')}`,
          ].join('')}
          loading={setBaselineMutation.isPending}
          confirmLabel={t('billingCycles.markAsBaseline')}
          confirmClassName="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        />

        <ConfirmDialog
          open={removeBaselineOpen}
          onClose={() => setRemoveBaselineOpen(false)}
          onConfirm={() => handleSetBaseline(false)}
          title={t('billingCycles.removeBaselineTitle')}
          description={[
            cycle.cycleName ?? cycle.contract?.contractNumber ?? '—',
            `\n\n${t('billingCycles.removeBaselineDesc')}`,
          ].join('')}
          loading={setBaselineMutation.isPending}
          confirmLabel={t('billingCycles.removeBaseline')}
          confirmClassName="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        />

        <ConfirmDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleCancel}
          title="Delete Billing Cycle"
          description={[
            `${cycle.cycleName ?? cycle.contract?.contractNumber ?? '—'}`,
            '\n\nThis will mark the cycle as cancelled. Meter readings will be preserved. The cycle will no longer appear in the list.',
          ].join('')}
          loading={cancelMutation.isPending}
          confirmLabel="Delete Cycle"
          confirmClassName="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        />
      </div>
    </Tooltip.Provider>

    {photoReadingId && (
      <PhotoViewerModal readingId={photoReadingId} onClose={() => setPhotoReadingId(null)} />
    )}
  </>
  )
}
