import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, XCircle, RotateCcw, ArrowUpCircle, Trash2, ChevronDown, ChevronRight, Info, Link2, Layers, Image, Package, Bookmark, Clock, Pencil, Check, X } from 'lucide-react'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  useBillingCycle,
  useBillingCycleSummary,
  useConfirmCycle,
  useDisputeCycle,
  useReopenCycle,
  useUnconfirmCycle,
  useCancelCycle,
  useSetBaseline,
  useCityStatuses,
  useConfirmCity,
  useResetCity,
  useUpdateCyclePeriod,
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
import { useSettings } from '../../api/hooks/useSettings'

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
function CalcSec({ children }) {
  return <div className="mt-4 mb-1.5 first:mt-0 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{children}</div>
}
function Mono({ hi, children }) {
  return <div className={`font-mono text-xs leading-5 ${hi ? 'font-semibold text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'}`}>{children}</div>
}
function CalcResult({ label, value }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-sm text-gray-600 dark:text-gray-400 w-40">{label}</span>
      <span className="text-sm font-bold text-brand-600 dark:text-brand-400">{Number(value).toLocaleString()} pages</span>
    </div>
  )
}

function PrinterCalcCard({ reading, summaryPrinter, cycleStart, cycleId }) {
  const { data: prev } = usePreviousReading(reading.printerId, cycleStart, cycleId, cycleStart)
  const isBaseline   = summaryPrinter?.isBaseline
  const isBwOnly     = summaryPrinter?.isBwOnly ?? false
  const contractType = summaryPrinter?.contractType ?? 'osg'

  const n   = v => Number(v ?? 0).toLocaleString()
  const sgn = v => { const a = Math.abs(v).toLocaleString(); return v < 0 ? `−${a}` : a }

  const c = {
    a4Bw: reading.a4Bw ?? 0, a3Bw: reading.a3Bw ?? 0,
    a4Color: reading.a4Color ?? 0, a3Color: reading.a3Color ?? 0, xls: reading.xls ?? 0,
    excessBw: reading.excessBw ?? 0, excessColor: reading.excessColor ?? 0,
  }
  const p = prev ? {
    a4Bw: prev.a4Bw ?? 0, a3Bw: prev.a3Bw ?? 0,
    a4Color: prev.a4Color ?? 0, a3Color: prev.a3Color ?? 0, xls: prev.xls ?? 0,
    excessBw: prev.excessBw ?? 0, excessColor: prev.excessColor ?? 0,
  } : null

  const modeCls = contractType === 'psg'
    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    : contractType === 'psg_simple'
    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  const modeLabel = contractType === 'psg' ? 'PSG' : contractType === 'psg_simple' ? 'PSG Simple' : 'OSG'

  function renderBaseline() {
    return (
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
          <span className="text-base select-none">📌</span>
          <div>
            <p className="text-sm font-semibold">Baseline reading — this cycle is the starting point.</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">No pages billed. Next cycle will calculate from these readings.</p>
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
          <CalcSec>Raw readings stored</CalcSec>
          <div className="flex flex-wrap gap-4 font-mono text-xs text-gray-600 dark:text-gray-400 mt-1">
            <span>A4 BW: <strong className="text-gray-800 dark:text-gray-200">{n(c.a4Bw)}</strong></span>
            <span>A3 BW: <strong className="text-gray-800 dark:text-gray-200">{n(c.a3Bw)}</strong></span>
            {!isBwOnly && <span>A4 Color: <strong className="text-gray-800 dark:text-gray-200">{n(c.a4Color)}</strong></span>}
            {!isBwOnly && <span>A3 Color: <strong className="text-gray-800 dark:text-gray-200">{n(c.a3Color)}</strong></span>}
          </div>
        </div>
      </div>
    )
  }

  function renderOsg() {
    const currBwTotal    = c.a4Bw + c.a3Bw
    const currColorTotal = c.a4Color + c.a3Color
    const prevBwTotal    = p.a4Bw + p.a3Bw
    const prevColorTotal = p.a4Color + p.a3Color
    const exBw    = currBwTotal - prevBwTotal
    const exColor = currColorTotal - prevColorTotal
    const billBw    = summaryPrinter?.billableBw    ?? 0
    const billColor = summaryPrinter?.billableColor ?? 0

    return (
      <div className="px-4 py-4">
        <CalcSec>Raw Meter Readings</CalcSec>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="py-1.5 pr-3 text-start w-20 text-gray-400 dark:text-gray-500 font-medium" />
                <th className="py-1.5 px-2 text-end text-gray-400 dark:text-gray-500 font-medium">A4 BW</th>
                <th className="py-1.5 px-2 text-end text-gray-400 dark:text-gray-500 font-medium">A3 BW</th>
                <th className="py-1.5 px-2 text-end text-gray-500 dark:text-gray-400 font-semibold bg-gray-50/80 dark:bg-gray-800/30">BW Total</th>
                {!isBwOnly && <th className="py-1.5 px-2 text-end text-gray-400 dark:text-gray-500 font-medium">A4 Color</th>}
                {!isBwOnly && <th className="py-1.5 px-2 text-end text-gray-400 dark:text-gray-500 font-medium">A3 Color</th>}
                {!isBwOnly && <th className="py-1.5 px-2 text-end text-gray-500 dark:text-gray-400 font-semibold bg-gray-50/80 dark:bg-gray-800/30">Color Total</th>}
              </tr>
            </thead>
            <tbody>
              {[['Previous', p, prevBwTotal, prevColorTotal], ['Current', c, currBwTotal, currColorTotal]].map(([lbl, r, bwT, colorT]) => (
                <tr key={lbl} className="border-b border-gray-50 dark:border-gray-800/50">
                  <td className="py-1.5 pr-3 text-gray-500 dark:text-gray-400 font-sans">{lbl}</td>
                  <td className="py-1.5 px-2 text-end text-gray-600 dark:text-gray-400">{n(r.a4Bw)}</td>
                  <td className="py-1.5 px-2 text-end text-gray-600 dark:text-gray-400">{n(r.a3Bw)}</td>
                  <td className="py-1.5 px-2 text-end font-medium text-gray-700 dark:text-gray-300 bg-gray-50/80 dark:bg-gray-800/30">{n(bwT)}</td>
                  {!isBwOnly && <td className="py-1.5 px-2 text-end text-gray-600 dark:text-gray-400">{n(r.a4Color)}</td>}
                  {!isBwOnly && <td className="py-1.5 px-2 text-end text-gray-600 dark:text-gray-400">{n(r.a3Color)}</td>}
                  {!isBwOnly && <td className="py-1.5 px-2 text-end font-medium text-gray-700 dark:text-gray-300 bg-gray-50/80 dark:bg-gray-800/30">{n(colorT)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CalcSec>Calculation</CalcSec>
        <p className="mt-2 mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">Step 1 — Billable pages from raw counter subtraction:</p>
        <div className="space-y-3 pl-3 mb-2">
          <div>
            <Mono>Billable BW    = ({n(c.a4Bw)} + {n(c.a3Bw)}) - ({n(p.a4Bw)} + {n(p.a3Bw)})</Mono>
            <Mono>               = {n(currBwTotal)} - {n(prevBwTotal)}</Mono>
            <Mono hi>               = {n(exBw)} pages</Mono>
          </div>
          {!isBwOnly && (
            <div>
              <Mono>Billable Color = ({n(c.a4Color)} + {n(c.a3Color)}) - ({n(p.a4Color)} + {n(p.a3Color)})</Mono>
              <Mono>               = {n(currColorTotal)} - {n(prevColorTotal)}</Mono>
              <Mono hi>               = {n(exColor)} pages</Mono>
            </div>
          )}
        </div>

        <CalcSec>Result</CalcSec>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-4 py-3 space-y-1">
          <CalcResult label="Billable BW:" value={billBw} />
          {!isBwOnly && <CalcResult label="Billable Color:" value={billColor} />}
        </div>
      </div>
    )
  }

  function renderPsg() {
    const cA4BwNet    = c.a4Bw - c.a3Bw
    const cA3BwNet    = c.a3Bw
    const cA4ColorNet = (c.a4Color + c.xls) - c.a3Color
    const cA3ColorNet = c.a3Color
    const pA4BwNet    = p.a4Bw - p.a3Bw
    const pA3BwNet    = p.a3Bw
    const pA4ColorNet = (p.a4Color + p.xls) - p.a3Color
    const pA3ColorNet = p.a3Color
    const a4BwPg    = cA4BwNet    - pA4BwNet
    const a3BwPg    = cA3BwNet    - pA3BwNet
    const a4ColorPg = cA4ColorNet - pA4ColorNet
    const a3ColorPg = cA3ColorNet - pA3ColorNet
    const totalA4   = Math.max(0, a4BwPg) + Math.max(0, a4ColorPg)
    const totalA3   = Math.max(0, a3BwPg) + Math.max(0, a3ColorPg)

    const xCols = isBwOnly
      ? [['A4 BW', 'a4Bw'], ['A3 BW', 'a3Bw']]
      : [['A4 BW', 'a4Bw'], ['A3 BW', 'a3Bw'], ['A4 Color', 'a4Color'], ['A3 Color', 'a3Color'], ['XLS', 'xls']]

    return (
      <div className="px-4 py-4">
        <CalcSec>Raw Meter Readings</CalcSec>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="py-1.5 pr-3 text-start w-20 text-gray-400 dark:text-gray-500 font-medium" />
                {xCols.map(([l]) => (
                  <th key={l} className="py-1.5 px-2 text-end text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[['Previous', p], ['Current', c]].map(([lbl, r]) => (
                <tr key={lbl} className="border-b border-gray-50 dark:border-gray-800/50">
                  <td className="py-1.5 pr-3 text-gray-500 dark:text-gray-400 font-sans">{lbl}</td>
                  {xCols.map(([, k]) => (
                    <td key={k} className="py-1.5 px-2 text-end text-gray-600 dark:text-gray-400">{n(r[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CalcSec>Step 1 — Derive true net counters from current reading</CalcSec>
        <div className="space-y-1.5 pl-3">
          <div>
            <Mono>True A4 BW    = A4 BW - A3 BW = {n(c.a4Bw)} - {n(c.a3Bw)}</Mono>
            <Mono hi>              = {sgn(cA4BwNet)}</Mono>
          </div>
          <Mono>True A3 BW    = A3 BW = {n(c.a3Bw)}</Mono>
          {!isBwOnly && (
            <>
              <div>
                <Mono>True A4 Color = (A4 Color + XLS) - A3 Color = ({n(c.a4Color)} + {n(c.xls)}) - {n(c.a3Color)}</Mono>
                <Mono hi>              = {sgn(cA4ColorNet)}</Mono>
              </div>
              <Mono>True A3 Color = A3 Color = {n(c.a3Color)}</Mono>
            </>
          )}
        </div>

        <CalcSec>Step 1 — Derive true net counters from previous reading</CalcSec>
        <div className="space-y-0.5 pl-3">
          <Mono>Prev True A4 BW    = {n(p.a4Bw)} - {n(p.a3Bw)} = {sgn(pA4BwNet)}</Mono>
          <Mono>Prev True A3 BW    = {n(p.a3Bw)}</Mono>
          {!isBwOnly && (
            <>
              <Mono>Prev True A4 Color = ({n(p.a4Color)} + {n(p.xls)}) - {n(p.a3Color)} = {sgn(pA4ColorNet)}</Mono>
              <Mono>Prev True A3 Color = {n(p.a3Color)}</Mono>
            </>
          )}
        </div>

        {!isBwOnly && c.xls !== p.xls && (
          <p className="mt-2 text-xs italic text-gray-400 dark:text-gray-500">
            ℹ XLS changed from {n(p.xls)} to {n(c.xls)} between readings
          </p>
        )}

        <CalcSec>Step 2 — Subtract previous net to get billable pages</CalcSec>
        <div className="space-y-1 pl-3">
          <div>
            <div className="flex items-baseline gap-1.5 font-mono text-xs text-gray-500 dark:text-gray-400">
              <span>A4 BW pages    = {sgn(cA4BwNet)} - ({sgn(pA4BwNet)}) =</span>
              {a4BwPg < 0 ? (
                <>
                  <span>{sgn(a4BwPg)}</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">→ 0 (clamped)</span>
                </>
              ) : (
                <span className="font-semibold text-brand-600 dark:text-brand-400">{sgn(a4BwPg)} pages</span>
              )}
            </div>
            {a4BwPg < 0 && (
              <p className="mt-0.5 pl-1 text-xs italic text-gray-400 dark:text-gray-500">
                ℹ Negative result clamped to 0. The A3 BW pages ({n(Math.max(0, a3BwPg))}) are billed under A3 Total.
              </p>
            )}
          </div>
          <div>
            <div className="flex items-baseline gap-1.5 font-mono text-xs text-gray-500 dark:text-gray-400">
              <span>A3 BW pages    = {n(cA3BwNet)} - {n(pA3BwNet)} =</span>
              {a3BwPg < 0 ? (
                <>
                  <span>{sgn(a3BwPg)}</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">→ 0 (clamped)</span>
                </>
              ) : (
                <span className="font-semibold text-brand-600 dark:text-brand-400">{sgn(a3BwPg)} pages</span>
              )}
            </div>
            {a3BwPg < 0 && (
              <p className="mt-0.5 pl-1 text-xs italic text-gray-400 dark:text-gray-500">
                ℹ Negative result clamped to 0. The A4 BW pages ({n(Math.max(0, a4BwPg))}) are billed under A4 Total.
              </p>
            )}
          </div>
          {!isBwOnly && (
            <>
              <div>
                <div className="flex items-baseline gap-1.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                  <span>A4 Color pages = {sgn(cA4ColorNet)} - ({sgn(pA4ColorNet)}) =</span>
                  {a4ColorPg < 0 ? (
                    <>
                      <span>{sgn(a4ColorPg)}</span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">→ 0 (clamped)</span>
                    </>
                  ) : (
                    <span className="font-semibold text-brand-600 dark:text-brand-400">{sgn(a4ColorPg)} pages</span>
                  )}
                </div>
                {a4ColorPg < 0 && (
                  <p className="mt-0.5 pl-1 text-xs italic text-gray-400 dark:text-gray-500">
                    ℹ Negative result clamped to 0. The A3 Color pages ({n(Math.max(0, a3ColorPg))}) are billed under A3 Total.
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-baseline gap-1.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                  <span>A3 Color pages = {n(cA3ColorNet)} - {n(pA3ColorNet)} =</span>
                  {a3ColorPg < 0 ? (
                    <>
                      <span>{sgn(a3ColorPg)}</span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">→ 0 (clamped)</span>
                    </>
                  ) : (
                    <span className="font-semibold text-brand-600 dark:text-brand-400">{sgn(a3ColorPg)} pages</span>
                  )}
                </div>
                {a3ColorPg < 0 && (
                  <p className="mt-0.5 pl-1 text-xs italic text-gray-400 dark:text-gray-500">
                    ℹ Negative result clamped to 0. The A4 Color pages ({n(Math.max(0, a4ColorPg))}) are billed under A4 Total.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <CalcSec>Totals</CalcSec>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-4 py-3 space-y-1.5">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">Total A4 = A4 BW + A4 Color = {n(Math.max(0, a4BwPg))} + {n(Math.max(0, a4ColorPg))}</span>
            <span className="font-bold text-brand-600 dark:text-brand-400 text-sm">= {n(totalA4)} pages</span>
          </div>
          {!isBwOnly && (
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">Total A3 = A3 BW + A3 Color = {n(Math.max(0, a3BwPg))} + {n(Math.max(0, a3ColorPg))}</span>
              <span className="font-bold text-brand-600 dark:text-brand-400 text-sm">= {n(totalA3)} pages</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderPsgSimple() {
    const a4BwPg    = c.a4Bw    - p.a4Bw
    const a4ColorPg = c.a4Color - p.a4Color
    const totalA4   = Math.max(0, a4BwPg) + Math.max(0, a4ColorPg)

    return (
      <div className="px-4 py-4">
        <CalcSec>Raw Meter Readings</CalcSec>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="py-1.5 pr-3 text-start w-20 text-gray-400 dark:text-gray-500 font-medium" />
                <th className="py-1.5 px-2 text-end text-gray-400 dark:text-gray-500 font-medium">A4 BW</th>
                <th className="py-1.5 px-2 text-end text-gray-400 dark:text-gray-500 font-medium">A4 Color</th>
              </tr>
            </thead>
            <tbody>
              {[['Previous', p], ['Current', c]].map(([lbl, r]) => (
                <tr key={lbl} className="border-b border-gray-50 dark:border-gray-800/50">
                  <td className="py-1.5 pr-3 text-gray-500 dark:text-gray-400 font-sans">{lbl}</td>
                  <td className="py-1.5 px-2 text-end text-gray-600 dark:text-gray-400">{n(r.a4Bw)}</td>
                  <td className="py-1.5 px-2 text-end text-gray-600 dark:text-gray-400">{n(r.a4Color)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CalcSec>Calculation — direct subtraction (no A3 or XLS adjustments)</CalcSec>
        <div className="space-y-1 pl-3 mb-2">
          <div>
            <div className="flex items-baseline gap-1.5 font-mono text-xs text-gray-500 dark:text-gray-400">
              <span>A4 BW pages    = {n(c.a4Bw)} - {n(p.a4Bw)} =</span>
              {a4BwPg < 0 ? (
                <>
                  <span>{sgn(a4BwPg)}</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">→ 0 (clamped)</span>
                </>
              ) : (
                <span className="font-semibold text-brand-600 dark:text-brand-400">{sgn(a4BwPg)} pages</span>
              )}
            </div>
            {a4BwPg < 0 && (
              <p className="mt-0.5 pl-1 text-xs italic text-gray-400 dark:text-gray-500">ℹ Negative result clamped to 0.</p>
            )}
          </div>
          <div>
            <div className="flex items-baseline gap-1.5 font-mono text-xs text-gray-500 dark:text-gray-400">
              <span>A4 Color pages = {n(c.a4Color)} - {n(p.a4Color)} =</span>
              {a4ColorPg < 0 ? (
                <>
                  <span>{sgn(a4ColorPg)}</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">→ 0 (clamped)</span>
                </>
              ) : (
                <span className="font-semibold text-brand-600 dark:text-brand-400">{sgn(a4ColorPg)} pages</span>
              )}
            </div>
            {a4ColorPg < 0 && (
              <p className="mt-0.5 pl-1 text-xs italic text-gray-400 dark:text-gray-500">ℹ Negative result clamped to 0.</p>
            )}
          </div>
        </div>

        <CalcSec>Result</CalcSec>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-4 py-3 space-y-1">
          <CalcResult label="Billable A4 BW:" value={Math.max(0, a4BwPg)} />
          <CalcResult label="Billable A4 Color:" value={Math.max(0, a4ColorPg)} />
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-1">
            <CalcResult label="Total A4 pages:" value={totalA4} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{reading.serialNumber}</span>
        <span className="text-gray-300 dark:text-gray-600">—</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">{reading.model}</span>
        <span className="text-gray-300 dark:text-gray-600">—</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${modeCls}`}>{modeLabel}</span>
        {isBwOnly && <span className="rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">BW Only</span>}
      </div>
      {(isBaseline || !p)
        ? renderBaseline()
        : contractType === 'psg'
        ? renderPsg()
        : contractType === 'psg_simple'
        ? renderPsgSimple()
        : renderOsg()}
    </div>
  )
}

// ── Calculation details collapsible panel ─────────────────────────────────────
function CalcDetailsPanel({ readings, summary, cycleStart, cycleId }) {
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
              cycleId={cycleId}
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
      <MinVolRow label={t('billingCycles.a4BwPages')}    value={formatNumber(billing.a4BwUsage    ?? 0)} />
      <MinVolRow label={t('billingCycles.a4ColorPages')} value={formatNumber(billing.a4ColorUsage ?? 0)} />
      <BillingRow label={t('billingCycles.totalA4Pages')} units={billing.totalA4} price={billing.a4Price} total={billing.a4Cost} currency={currency} />
      <div className="mb-1 mt-3 text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">A3</div>
      <MinVolRow label={t('billingCycles.a3BwPages')}    value={formatNumber(billing.a3BwUsage    ?? 0)} />
      <MinVolRow label={t('billingCycles.a3ColorPages')} value={formatNumber(billing.a3ColorUsage ?? 0)} />
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

// ── City Progress Section ──────────────────────────────────────────────────────

function CityProgressBar({ submitted, total }) {
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden min-w-[80px]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: pct === 100 ? '#10B981' : pct > 0 ? '#F59E0B' : '#D1D5DB',
          }}
        />
      </div>
      <span className="text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{submitted}/{total}</span>
    </div>
  )
}

function CityStatusBadge({ city, t }) {
  if (city.status === 'confirmed') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
        <CheckCircle className="h-3.5 w-3.5" />
        {t('billingCycles.cityConfirmed')} {city.confirmedByName ?? ''}
      </span>
    )
  }
  if (city.status === 'complete') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 whitespace-nowrap">
        <CheckCircle className="h-3.5 w-3.5" />
        {t('billingCycles.cityComplete')}
      </span>
    )
  }
  if (city.status === 'partial') {
    const missing = city.totalPrinters - city.submittedPrinters
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
        ⏳ {t('billingCycles.cityPartial')} ({missing} {missing === 1 ? 'missing' : 'missing'})
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
      ○ {t('billingCycles.cityPending')}
    </span>
  )
}

function ConfirmCityDialog({ city, cycleId, onClose, t }) {
  const confirmMutation = useConfirmCity()
  const { showToast } = useToast()
  const missing = city.totalPrinters - city.submittedPrinters

  async function handleConfirm() {
    try {
      await confirmMutation.mutateAsync({ cycleId, city: city.city })
      showToast({ title: `${city.city} confirmed`, variant: 'success' })
      onClose()
    } catch (err) {
      showToast({ title: err.response?.data?.error || err.message, variant: 'error' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 shadow-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('billingCycles.confirmCityTitle')} {city.city}?
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {city.submittedPrinters} of {city.totalPrinters} printers have submitted readings.
          {missing > 0 && (
            <span className="block mt-1 text-amber-600 dark:text-amber-400">
              {missing} {t('billingCycles.confirmCityWarning')}
            </span>
          )}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirmMutation.isPending}
            className="flex-1 rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {confirmMutation.isPending ? t('common.loading') : t('billingCycles.confirmCity')}
          </button>
        </div>
      </div>
    </div>
  )
}

function CityProgressSection({ cycleId, canConfirmBilling, canManageBilling, t }) {
  const { data: cities = [], isLoading } = useCityStatuses(cycleId)
  const resetMutation = useResetCity()
  const { showToast } = useToast()
  const [confirmingCity, setConfirmingCity] = useState(null)

  if (isLoading) return null
  if (cities.length === 0) return null
  if (cities.length === 1) return null  // single-city contracts don't need this section

  const totalPrinters = cities.reduce((s, c) => s + c.totalPrinters, 0)
  const totalSubmitted = cities.reduce((s, c) => s + c.submittedPrinters, 0)
  const allReady = cities.every(c => c.status === 'complete' || c.status === 'confirmed')

  async function handleReset(city) {
    try {
      await resetMutation.mutateAsync({ cycleId, city: city.city })
      showToast({ title: `${city.city} reset`, variant: 'success' })
    } catch (err) {
      showToast({ title: err.response?.data?.error || err.message, variant: 'error' })
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('billingCycles.cityProgress')}</h3>
        <span className={`text-xs font-medium ${allReady ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {totalSubmitted} {t('billingCycles.overallProgress')} {totalPrinters} — {cities.length} {t('billingCycles.cities')}
        </span>
      </div>

      <div className="space-y-3">
        {cities.map(city => (
          <div key={city.city} className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 w-24 flex-shrink-0 truncate">{city.city}</span>
            <CityProgressBar submitted={city.submittedPrinters} total={city.totalPrinters} />
            <CityStatusBadge city={city} t={t} />
            <div className="flex items-center gap-2 ms-auto">
              {(city.status === 'partial' || city.status === 'complete') && canConfirmBilling && (
                <button
                  onClick={() => setConfirmingCity(city)}
                  className="rounded-md border border-brand-300 px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-400 dark:hover:bg-brand-900/20"
                >
                  {t('billingCycles.confirmCity')}
                </button>
              )}
              {city.status === 'confirmed' && canManageBilling && (
                <button
                  onClick={() => handleReset(city)}
                  disabled={resetMutation.isPending}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  {t('billingCycles.resetCity')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {confirmingCity && (
        <ConfirmCityDialog
          city={confirmingCity}
          cycleId={cycleId}
          onClose={() => setConfirmingCity(null)}
          t={t}
        />
      )}
    </div>
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
  const canViewFinancial = usePermission('can_view_financial_data')
const { data: appSettings } = useSettings()
  const showCalculationDetails = appSettings?.show_calculation_details === 'true'
  const { user } = useAuth()
  const isAdmin = user?.role?.name === 'admin'
  const isEngineer = user?.role?.name === 'engineer'
  const [photoReadingId, setPhotoReadingId] = useState(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [unconfirmOpen, setUnconfirmOpen] = useState(false)
  const [baselineOpen, setBaselineOpen] = useState(false)
  const [removeBaselineOpen, setRemoveBaselineOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [groupCyclesOpen, setGroupCyclesOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const [consumablesOpen, setConsumablesOpen] = useState(false)
  const [editPeriod, setEditPeriod] = useState(false)
  const [periodDraft, setPeriodDraft] = useState({ start: '', end: '' })
  const [periodSaveError, setPeriodSaveError] = useState('')
  const [quarterExpanded, setQuarterExpanded] = useState(false)
  const [overrideExpanded, setOverrideExpanded] = useState({})

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
  const unconfirmMutation = useUnconfirmCycle()
  const updatePeriodMutation = useUpdateCyclePeriod()

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

  async function handleUnconfirm() {
    setActionError('')
    try {
      await unconfirmMutation.mutateAsync(id)
      showToast({ title: t('billingCycles.unconfirmSuccess'), variant: 'success' })
      setUnconfirmOpen(false)
    } catch (err) {
      setActionError(err.response?.data?.error || err.message)
    }
  }

  function openEditPeriod() {
    setPeriodDraft({
      start: cycle.periodStart?.slice(0, 10) ?? '',
      end:   cycle.periodEnd?.slice(0, 10)   ?? '',
    })
    setPeriodSaveError('')
    setEditPeriod(true)
  }

  async function handleSavePeriod() {
    setPeriodSaveError('')
    try {
      await updatePeriodMutation.mutateAsync({ id, periodStart: periodDraft.start, periodEnd: periodDraft.end })
      showToast({ title: 'Period updated', variant: 'success' })
      setEditPeriod(false)
    } catch (err) {
      setPeriodSaveError(err.response?.data?.error || err.message)
    }
  }

  async function handleCancel() {
    setActionError('')
    try {
      await cancelMutation.mutateAsync(id)
      showToast({ title: t('billingCycles.movedToRecycleBin'), variant: 'success' })
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
  const canGroupCycles = false
  const isPendingQuarterly = status === 'pending_quarterly'
  const isInvoicingCycle = cycle.groupPosition === 3 && !!cycle.cycleGroupId
  const cityStatuses = cycle.cityStatuses ?? []
  const isMultiCity = cityStatuses.length > 1
  const allCitiesReady = cycle.allCitiesReady ?? true
  const notReadyCities = cityStatuses.filter(c => c.status !== 'complete' && c.status !== 'confirmed')

  // Quarterly breakdown totals — computed once, used in both collapsed summary and expanded table
  const qb           = summary?.quarterlyBreakdown ?? []
  const qTotalBw     = qb.reduce((s, m) => s + (m.bwCost    ?? 0), 0)
  const qTotalColor  = qb.reduce((s, m) => s + (m.colorCost ?? 0), 0)
  const qTotalFixed  = summary?.quarterlyFixedCharge ?? 0
  const qGrandTotal  = qb.reduce((s, m) => s + (m.total     ?? 0), 0)

  const quarterlyBreakdownStyle = summary?.rulesMeta?.quarterlyBreakdownStyle ?? summary?.quarterlyBreakdownStyle ?? 'monthly'
  const isQuarterlyTotal  = quarterlyBreakdownStyle === 'quarterly_total'
  const isQuarterEnd      = !!(summary?.rulesMeta?.isFixedChargeDue && summary?.rulesMeta?.fixedChargeMultiplier > 1)
  const showInvoiceGroups = !isQuarterlyTotal && (!isQuarterEnd || qb.length === 0)

  return (
    <>
    <Tooltip.Provider delayDuration={200}>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: t('nav.billingCycles'), to: '/billing-cycles', onClick: (e) => { e.preventDefault(); navigate(-1) } }, { label: cycle.cycleName ?? `${cycle.contract?.contractNumber ?? '—'} — ${formatPeriod(cycle.periodStart, cycle.periodEnd)}` }]} />
        {/* ── Header ── */}
        <PageHeader
          title={cycle.cycleName ?? cycle.contract?.contractNumber ?? '—'}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
              <span>
                <span className="text-gray-400">Customer:</span>{' '}
                <Link to={`/customers/${cycle.contract?.customer?.id}`}
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
              {cycle.contract?.serviceType && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {cycle.contract.serviceType}
                  </span>
                </>
              )}
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
              {/* Period row — editable by admin */}
              <div className="flex justify-between gap-4 py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">{t('billingCycles.period')}</span>
                {editPeriod ? (
                  <div className="flex flex-col items-end gap-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <input
                        type="date"
                        value={periodDraft.start}
                        onChange={e => setPeriodDraft(d => ({ ...d, start: e.target.value }))}
                        className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-2 py-1"
                      />
                      <span className="text-gray-400 text-sm">–</span>
                      <input
                        type="date"
                        value={periodDraft.end}
                        onChange={e => setPeriodDraft(d => ({ ...d, end: e.target.value }))}
                        className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-2 py-1"
                      />
                      <button
                        onClick={handleSavePeriod}
                        disabled={updatePeriodMutation.isPending}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-300 rounded hover:bg-green-100 dark:text-green-400 dark:bg-green-900/20 dark:border-green-700"
                      >
                        <Check size={13} />{updatePeriodMutation.isPending ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditPeriod(false)}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-300 rounded hover:bg-gray-100 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-600"
                      >
                        <X size={13} />Cancel
                      </button>
                    </div>
                    {periodSaveError && <p className="text-xs text-red-500">{periodSaveError}</p>}
                  </div>
                ) : (
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {formatPeriod(cycle.periodStart, cycle.periodEnd)}
                    {isAdmin && cycle.status !== 'invoiced' && (
                      <button onClick={openEditPeriod} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <Pencil size={13} />
                      </button>
                    )}
                  </span>
                )}
              </div>
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
                cycle.contract?.customer?.id
                  ? <Link to={`/customers/${cycle.contract.customer.id}`} className="text-brand-600 hover:underline dark:text-brand-400">
                      {cycle.contract.customer.name}
                    </Link>
                  : cycle.contract?.customer?.name ?? '—'
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

        {/* ── City Submission Progress ── */}
        {isMultiCity && (
          <CityProgressSection
            cycleId={id}
            canConfirmBilling={canConfirm}
            canManageBilling={canManage}
            t={t}
          />
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
              {canViewFinancial && (summary.isBaseline ? (
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

                  {/* Invoice rules notices */}
                  {summary.rulesMeta && (
                    <div className="mb-3 space-y-2">
                      {!summary.rulesMeta.isFixedChargeDue && !isQuarterlyTotal && (
                        <div className="flex items-start gap-2 rounded-lg bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-xs text-sky-700 dark:text-sky-400">
                          <span className="mt-0.5 shrink-0">ℹ</span>
                          <span>
                            {t('billingCycles.fixedChargeDeferred')}
                            {summary.rulesMeta.monthInQuarter && summary.rulesMeta.fixedChargePeriodLength > 1 && (
                              <> — {t('billingCycles.monthOf', { n: summary.rulesMeta.monthInQuarter, total: summary.rulesMeta.fixedChargePeriodLength })}</>
                            )}
                            {summary.rulesMeta.nextFixedChargeDate ? ` — ${t('billingCycles.nextChargeDate')}: ${summary.rulesMeta.nextFixedChargeDate}` : ''}
                          </span>
                        </div>
                      )}
                      {summary.rulesMeta.isFixedChargeDue && summary.rulesMeta.fixedChargeMultiplier > 1 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 overflow-hidden">
                          {/* Header — always visible, click to toggle */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setQuarterExpanded(v => !v)}
                            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setQuarterExpanded(v => !v)}
                            className="flex items-start justify-between gap-3 px-3 py-2.5 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors select-none"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="shrink-0 text-amber-600 dark:text-amber-400">ℹ</span>
                                <span className="text-xs text-amber-700 dark:text-amber-400">
                                  {t('billingCycles.fixedChargeMultiplied', { multiplier: summary.rulesMeta.fixedChargeMultiplier })}
                                </span>
                                {summary.rulesMeta.quarterNumber && (
                                  <span className="rounded-full bg-amber-200 dark:bg-amber-900/50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                                    {t('billingCycles.quarterEnd', {
                                      number: summary.rulesMeta.quarterNumber,
                                      period: new Date(summary.periodStart).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                                    })}
                                  </span>
                                )}
                              </div>
                              {!quarterExpanded && qb.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-amber-600 dark:text-amber-400 ps-5">
                                  <span>BW: {formatAmount(qTotalBw, currency)}</span>
                                  <span className="text-amber-400 dark:text-amber-600">|</span>
                                  <span>Color: {formatAmount(qTotalColor, currency)}</span>
                                  <span className="text-amber-400 dark:text-amber-600">|</span>
                                  <span>Fixed: {formatAmount(qTotalFixed, currency)}</span>
                                  <span className="text-amber-400 dark:text-amber-600">|</span>
                                  <span className="font-semibold">Total: {formatAmount(summary?.grandTotal ?? qGrandTotal, currency)}</span>
                                </div>
                              )}
                            </div>
                            <ChevronDown className={`h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5 transition-transform ${quarterExpanded ? 'rotate-180' : ''}`} />
                          </div>

                          {/* Expanded breakdown table */}
                          {quarterExpanded && qb.length > 0 && (
                            <div className="border-t border-amber-200 dark:border-amber-800/40">
                              <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                                {t('billingCycles.quarterlyBreakdown')}
                              </p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-amber-100/60 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
                                      <th className="px-3 py-1.5 text-start font-semibold">{t('billingCycles.period')}</th>
                                      <th className="px-3 py-1.5 text-end font-semibold">{t('billingCycles.bwCost')}</th>
                                      <th className="px-3 py-1.5 text-end font-semibold">{t('billingCycles.colorCost')}</th>
                                      <th className="px-3 py-1.5 text-end font-semibold">{t('billingCycles.fixedCharge')}</th>
                                      <th className="px-3 py-1.5 text-end font-semibold">{t('billingCycles.total')}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {qb.map(month => (
                                      <tr key={month.cycleId}
                                        className={`border-t border-amber-100 dark:border-amber-900/30 ${
                                          month.isCurrentCycle
                                            ? 'bg-brand-50 dark:bg-brand-900/10 font-medium text-gray-900 dark:text-gray-100'
                                            : 'text-gray-700 dark:text-gray-300'
                                        }`}
                                      >
                                        <td className="px-3 py-2">
                                          {month.cycleName}
                                          {month.isCurrentCycle && !month.isQuarterlyTotal && (
                                            <span className="ms-1.5 text-brand-500 dark:text-brand-400 font-normal">← {t('billingCycles.currentMonth')}</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-end">{formatAmount(month.bwCost, currency)}</td>
                                        <td className="px-3 py-2 text-end">{formatAmount(month.colorCost, currency)}</td>
                                        <td className="px-3 py-2 text-end">{formatAmount(month.fixedCharge, currency)}</td>
                                        <td className="px-3 py-2 text-end font-semibold text-brand-600 dark:text-brand-400">{formatAmount(month.total, currency)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t-2 border-amber-300 dark:border-amber-700 font-bold bg-amber-100/60 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
                                      <td className="px-3 py-2">
                                        {summary.rulesMeta.quarterNumber
                                          ? `Q${summary.rulesMeta.quarterNumber} ${t('billingCycles.quarterTotal')}`
                                          : t('billingCycles.quarterTotal')}
                                      </td>
                                      <td className="px-3 py-2 text-end">{formatAmount(qTotalBw, currency)}</td>
                                      <td className="px-3 py-2 text-end">{formatAmount(qTotalColor, currency)}</td>
                                      <td className="px-3 py-2 text-end text-amber-600 dark:text-amber-400">{formatAmount(qTotalFixed, currency)}</td>
                                      <td className="px-3 py-2 text-end text-brand-700 dark:text-brand-300 text-sm">{formatAmount(summary?.grandTotal ?? qGrandTotal, currency)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {!summary.rulesMeta.isExcessDue && !isQuarterlyTotal && (
                        <div className="flex items-start gap-2 rounded-lg bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-xs text-sky-700 dark:text-sky-400">
                          <span className="mt-0.5 shrink-0">ℹ</span>
                          <span>{t('billingCycles.excessDeferred')}{summary.rulesMeta.nextExcessDate ? ` — ${t('billingCycles.nextChargeDate')}: ${summary.rulesMeta.nextExcessDate}` : ''}</span>
                        </div>
                      )}
                      {summary.rulesMeta.groupingStrategy === 'city' && (
                        <div className="flex items-start gap-2 rounded-lg bg-gray-50 dark:bg-gray-800/30 px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                          <span className="mt-0.5 shrink-0">ℹ</span>
                          <span>{t('billingCycles.groupedByCity')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* No-invoice card — quarterly_total non-quarter-end months */}
                  {isQuarterlyTotal && !isQuarterEnd && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800/40">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-amber-500 shrink-0" />
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                          {t('billingCycles.noInvoiceThisMonth')}
                        </p>
                      </div>
                      <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 ms-6">
                        {t('billingCycles.chargesAccumulate')}
                        {summary.rulesMeta?.nextFixedChargeDate && (
                          <> — {new Date(summary.rulesMeta.nextFixedChargeDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                        )}
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-white dark:bg-gray-800 rounded p-2 text-center border border-amber-100 dark:border-amber-900/30">
                          <div className="text-gray-500 dark:text-gray-400">{t('billingCycles.bwCost')}</div>
                          <div className="font-medium text-gray-800 dark:text-gray-200 mt-0.5">{formatAmount(summary.invoices?.[0]?.billing?.bwCost ?? 0, currency)}</div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded p-2 text-center border border-amber-100 dark:border-amber-900/30">
                          <div className="text-gray-500 dark:text-gray-400">{t('billingCycles.colorCost')}</div>
                          <div className="font-medium text-gray-800 dark:text-gray-200 mt-0.5">{formatAmount(summary.invoices?.[0]?.billing?.colorCost ?? 0, currency)}</div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded p-2 text-center border border-amber-100 dark:border-amber-900/30">
                          <div className="text-gray-500 dark:text-gray-400">{t('billingCycles.fixedCharge')} ({t('billingCycles.deferred')})</div>
                          <div className="font-medium text-amber-600 dark:text-amber-400 mt-0.5">{formatAmount(summary.invoices?.[0]?.billing?.fixedCharge ?? 0, currency)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {showInvoiceGroups && (
                  <div className="space-y-3">
                    {summary.invoices.map((inv, i) => {
                      const invQb          = inv.quarterlyBreakdown ?? []
                      const invQTotalBw    = invQb.reduce((s, m) => s + (m.bwCost    ?? 0), 0)
                      const invQTotalColor = invQb.reduce((s, m) => s + (m.colorCost ?? 0), 0)
                      const invQTotalFixed = inv.quarterlyFixedCharge ?? 0
                      const invQGrandTotal = invQb.reduce((s, m) => s + (m.total     ?? 0), 0)
                      const invExpanded    = !!overrideExpanded[i]
                      return (
                      <div key={i} className="rounded-lg border border-gray-100 p-4 dark:border-gray-800">
                        {/* Card header — title + printer list */}
                        <div className="mb-3 pb-2 border-b border-gray-100 dark:border-gray-800">
                          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                            {inv.type === 'osg_default'
                              ? (inv.groupKey ? `${t('billingCycles.city')}: ${inv.groupKey}` : t('billingCycles.defaultGroup'))
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

                        {/* Per-override-printer quarterly breakdown */}
                        {inv.type === 'osg_override' && invQb.length > 0 && (
                          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 overflow-hidden">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setOverrideExpanded(s => ({ ...s, [i]: !s[i] }))}
                              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOverrideExpanded(s => ({ ...s, [i]: !s[i] }))}
                              className="flex items-start justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors select-none"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-xs text-amber-700 dark:text-amber-400">
                                  {t('billingCycles.fixedChargeMultiplied', { multiplier: summary.rulesMeta.fixedChargeMultiplier })}
                                </span>
                                {!invExpanded && (
                                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-amber-600 dark:text-amber-400">
                                    <span>BW: {formatAmount(invQTotalBw, currency)}</span>
                                    <span className="text-amber-400 dark:text-amber-600">|</span>
                                    <span>Color: {formatAmount(invQTotalColor, currency)}</span>
                                    <span className="text-amber-400 dark:text-amber-600">|</span>
                                    <span>Fixed: {formatAmount(invQTotalFixed, currency)}</span>
                                    <span className="text-amber-400 dark:text-amber-600">|</span>
                                    <span className="font-semibold">Total: {formatAmount(invQGrandTotal, currency)}</span>
                                  </div>
                                )}
                              </div>
                              <ChevronDown className={`h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5 transition-transform ${invExpanded ? 'rotate-180' : ''}`} />
                            </div>

                            {invExpanded && (
                              <div className="border-t border-amber-200 dark:border-amber-800/40">
                                <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                                  {t('billingCycles.quarterlyBreakdown')}
                                </p>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-amber-100/60 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
                                        <th className="px-3 py-1.5 text-start font-semibold">{t('billingCycles.period')}</th>
                                        <th className="px-3 py-1.5 text-end font-semibold">{t('billingCycles.bwCost')}</th>
                                        <th className="px-3 py-1.5 text-end font-semibold">{t('billingCycles.colorCost')}</th>
                                        <th className="px-3 py-1.5 text-end font-semibold">{t('billingCycles.fixedCharge')}</th>
                                        <th className="px-3 py-1.5 text-end font-semibold">{t('billingCycles.total')}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {invQb.map((month, mi) => (
                                        <tr key={month.cycleId ?? mi}
                                          className={`border-t border-amber-100 dark:border-amber-900/30 ${
                                            month.isCurrentCycle && !month.isQuarterlyTotal
                                              ? 'bg-brand-50 dark:bg-brand-900/10 font-medium text-gray-900 dark:text-gray-100'
                                              : 'text-gray-700 dark:text-gray-300'
                                          }`}
                                        >
                                          <td className="px-3 py-2">
                                            {month.cycleName}
                                            {month.isCurrentCycle && !month.isQuarterlyTotal && (
                                              <span className="ms-1.5 text-brand-500 dark:text-brand-400 font-normal">← {t('billingCycles.currentMonth')}</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-end">{formatAmount(month.bwCost, currency)}</td>
                                          <td className="px-3 py-2 text-end">{formatAmount(month.colorCost, currency)}</td>
                                          <td className="px-3 py-2 text-end">{formatAmount(month.fixedCharge, currency)}</td>
                                          <td className="px-3 py-2 text-end font-semibold text-brand-600 dark:text-brand-400">{formatAmount(month.total, currency)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t-2 border-amber-300 dark:border-amber-700 font-bold bg-amber-100/60 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
                                        <td className="px-3 py-2">
                                          {summary.rulesMeta.quarterNumber ? `Q${summary.rulesMeta.quarterNumber} ${t('billingCycles.quarterTotal')}` : t('billingCycles.quarterTotal')}
                                        </td>
                                        <td className="px-3 py-2 text-end">{formatAmount(invQTotalBw, currency)}</td>
                                        <td className="px-3 py-2 text-end">{formatAmount(invQTotalColor, currency)}</td>
                                        <td className="px-3 py-2 text-end text-amber-600 dark:text-amber-400">{formatAmount(invQTotalFixed, currency)}</td>
                                        <td className="px-3 py-2 text-end text-brand-700 dark:text-brand-300 text-sm">{formatAmount(invQGrandTotal, currency)}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      )
                    })}
                    {/* Grand total — only shown when multiple invoices */}
                    {summary.invoices.length > 1 && (
                      <div className="rounded-lg border-2 border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/20">
                        <BillingRow label={t('billingCycles.grandTotal')} total={summary.billing.total} isTotal currency={currency} />
                      </div>
                    )}
                  </div>
                  )}

                  {/* Combined quarterly invoice summary card — quarterly_total quarter-end */}
                  {isQuarterlyTotal && isQuarterEnd && qb.length > 0 && (
                    <div className="mt-4 p-4 bg-brand-50 dark:bg-brand-900/10 rounded-lg border border-brand-200 dark:border-brand-700">
                      <p className="text-sm font-semibold text-brand-800 dark:text-brand-400">
                        {t('billingCycles.combinedQuarterlyInvoice')}
                        {summary.rulesMeta?.quarterNumber && ` — Q${summary.rulesMeta.quarterNumber}`}
                      </p>
                      {summary.rulesMeta?.quarterStartDate && (
                        <p className="text-xs text-brand-600 dark:text-brand-500 mt-0.5">
                          {new Date(summary.rulesMeta.quarterStartDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' – '}
                          {new Date(summary.rulesMeta.quarterEndDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                      <p className="text-xs text-brand-500 dark:text-brand-600 mt-1 italic">
                        {t('billingCycles.quarterlyTotalNote')}
                      </p>
                      <div className="mt-3 text-end">
                        <span className="text-2xl font-bold text-brand-700 dark:text-brand-300">
                          {formatAmount(summary.grandTotal ?? qGrandTotal, currency)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
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
        {showCalculationDetails && (
          <CalcDetailsPanel readings={readings} summary={summary} cycleStart={cycle.periodStart} cycleId={cycle.id} />
        )}

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
            {status === 'confirmed' && (
              <div className="mt-4 flex items-center gap-2 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
                <Clock className="text-amber-500 flex-shrink-0" size={18} />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-400">{t('billingCycles.awaitingOdoo')}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">{t('billingCycles.awaitingOdooDesc')}</p>
                </div>
              </div>
            )}
            {status === 'invoiced' && (
              <div className="mt-4 flex items-center gap-2 p-4 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle className="text-green-500 flex-shrink-0" size={18} />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-400">{t('billingCycles.invoicedInOdoo')}</p>
                  {cycle.odooInvoiceId && (
                    <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">{t('billingCycles.odooInvoiceId')}: <span className="font-mono font-medium">{cycle.odooInvoiceId}</span></p>
                  )}
                  {cycle.invoicedAt && (
                    <p className="text-xs text-green-600 dark:text-green-500">{t('billingCycles.invoicedAt')}: {fmtDateTime(cycle.invoicedAt)}</p>
                  )}
                </div>
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
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span>
                    <button
                      onClick={() => { if (allCitiesReady || !isMultiCity) { setActionError(''); setConfirmOpen(true) } }}
                      disabled={isMultiCity && !allCitiesReady}
                      className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="h-4 w-4" />{t('billingCycles.confirmCycle')}
                    </button>
                  </span>
                </Tooltip.Trigger>
                {isMultiCity && !allCitiesReady && (
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="z-50 max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-gray-700"
                      sideOffset={6}
                    >
                      {t('billingCycles.cannotConfirmCities')}:{' '}
                      {notReadyCities.map(c => `${c.city} (${c.submittedPrinters}/${c.totalPrinters})`).join(', ')}
                      <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                )}
              </Tooltip.Root>
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

            {/* Unconfirm — admin only */}
            {isAdmin && status === 'confirmed' && (
              <button
                onClick={() => { setActionError(''); setUnconfirmOpen(true) }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-900/30 transition-colors"
              >
                <RotateCcw size={15} />
                {t('billingCycles.unconfirm')}
              </button>
            )}

            {/* Odoo invoice status */}
            {status === 'confirmed' && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
                <Clock className="text-amber-500 flex-shrink-0 h-4 w-4" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-400">{t('billingCycles.awaitingOdoo')}</span>
              </div>
            )}
            {status === 'invoiced' && (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle className="text-green-500 flex-shrink-0 h-4 w-4" />
                <span className="text-sm font-medium text-green-800 dark:text-green-400">{t('billingCycles.invoicedInOdoo')}</span>
              </div>
            )}

            {canGroupCycles && (
              <button
                onClick={() => { setActionError(''); setGroupCyclesOpen(true) }}
                className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                <Layers className="h-4 w-4" />{t('billingCycles.groupCycles')}
              </button>
            )}

            {/* Baseline toggle — admin and mps_specialist */}
            {(isAdmin || canManage) && (
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
                      <Trash2 className="h-4 w-4" />{t('billingCycles.deleteCycleButton')}
                    </button>
                  </span>
                </Tooltip.Trigger>
                {status === 'invoiced' && (
                  <Tooltip.Portal>
                    <Tooltip.Content side="top"
                      className="rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-gray-700">
                      {t('billingCycles.invoicedCannotDelete')}
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

        <ConfirmDialog
          open={unconfirmOpen}
          onClose={() => setUnconfirmOpen(false)}
          onConfirm={handleUnconfirm}
          title={t('billingCycles.unconfirmTitle')}
          description={[
            cycle.cycleName ?? cycle.contract?.contractNumber ?? '—',
            `\n\n${t('billingCycles.unconfirmDesc')}`,
          ].join('')}
          loading={unconfirmMutation.isPending}
          confirmLabel={t('billingCycles.unconfirm')}
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
          title={t('billingCycles.deleteDialogTitle')}
          description={[
            `${cycle.cycleName ?? cycle.contract?.contractNumber ?? '—'}`,
            summary?.printers?.length > 0
              ? `\n${t('billingCycles.deleteDialogReadings', { count: summary.printers.length })}`
              : '',
            `\n\n${t('billingCycles.deleteDialogBody')}`,
          ].join('')}
          loading={cancelMutation.isPending}
          confirmLabel={t('billingCycles.moveToRecycleBin')}
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
