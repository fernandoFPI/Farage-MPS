import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Lock, LockOpen, RefreshCw, History } from 'lucide-react'
import Modal from '../../components/Modal'
import ConfirmDialog from '../../components/ConfirmDialog'
import ErrorAlert from '../../components/ErrorAlert'
import { useToast } from '../../components/Toast'
import {
  useLockCycle,
  useUnlockCycle,
  useRecalculateCycle,
  useRecalculationPreview,
  useLockHistory,
  useLockCandidates,
  lockCyclesBulkChunk,
} from '../../api/hooks/useBillingCycles'
import { formatAmount } from '../../utils/currency'
import { fmtDateTime } from '../../utils/format'

const errMsg = (err) => err?.response?.data?.error || err?.message || ''

// ── Small badge for lists ────────────────────────────────────────────────────

export function LockBadge({ label, title }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
    >
      <Lock className="h-3 w-3" />
      {label}
    </span>
  )
}

// ── Recalculate: frozen vs fresh figures, applied only on confirmation ───────

function RecalculateModal({ open, onClose, cycle }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const currency = cycle.contract?.currency ?? 'IQD'
  const { data: preview, isLoading, error: previewError } = useRecalculationPreview(cycle.id, open)
  const recalcMutation = useRecalculateCycle()
  const [error, setError] = useState('')

  async function apply() {
    setError('')
    try {
      await recalcMutation.mutateAsync(cycle.id)
      showToast({ title: t('billingCycles.recalcApplied'), variant: 'success' })
      onClose()
    } catch (err) {
      setError(errMsg(err))
    }
  }

  const diffCls = !preview || preview.difference === 0
    ? 'text-gray-700 dark:text-gray-300'
    : preview.difference > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('billingCycles.recalcTitle')}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={recalcMutation.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={apply}
            disabled={recalcMutation.isPending || isLoading || !preview?.changed}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {recalcMutation.isPending ? t('common.loading') : t('billingCycles.recalcApply')}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('billingCycles.recalcIntro')}</p>

      {isLoading && <p className="py-6 text-center text-sm text-gray-400">{t('common.loading')}</p>}
      {previewError && <ErrorAlert message={errMsg(previewError)} />}

      {preview && (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('billingCycles.recalcOld')}</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{formatAmount(preview.oldTotal, currency)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('billingCycles.recalcNew')}</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{formatAmount(preview.newTotal, currency)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('billingCycles.recalcDiff')}</p>
              <p className={`mt-1 text-sm font-semibold ${diffCls}`}>
                {preview.difference > 0 ? '+' : ''}{formatAmount(preview.difference, currency)}
              </p>
            </div>
          </div>

          {!preview.changed && (
            <p className="text-sm text-green-700 dark:text-green-400">{t('billingCycles.recalcNoChange')}</p>
          )}

          {preview.changedPrinters.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('billingCycles.recalcPrinters')}
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">{t('printers.serialNumber', 'Serial')}</th>
                      <th className="px-3 py-2 text-end font-medium">{t('billingCycles.billableBw')}</th>
                      <th className="px-3 py-2 text-end font-medium">{t('billingCycles.billableColor')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {preview.changedPrinters.map(p => (
                      <tr key={p.printerId}>
                        <td className="px-3 py-2 font-mono text-gray-900 dark:text-gray-100">{p.serialNumber ?? '—'}</td>
                        <td className="px-3 py-2 text-end text-gray-700 dark:text-gray-300">{p.oldBillableBw.toLocaleString()} → {p.newBillableBw.toLocaleString()}</td>
                        <td className="px-3 py-2 text-end text-gray-700 dark:text-gray-300">{p.oldBillableColor.toLocaleString()} → {p.newBillableColor.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {error && <ErrorAlert message={error} />}
    </Modal>
  )
}

// ── History of locks / unlocks / recalculations ──────────────────────────────

function LockHistory({ cycleId, currency }) {
  const { t } = useTranslation()
  const { data: events = [], isLoading } = useLockHistory(cycleId, true)
  if (isLoading) return <p className="text-xs text-gray-400">{t('common.loading')}</p>
  if (events.length === 0) return <p className="text-xs text-gray-400">{t('common.noData')}</p>
  return (
    <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
      {events.map(e => (
        <li key={e.id}>
          <span className="font-medium text-gray-800 dark:text-gray-200">{t(`billingCycles.lockEvent.${e.action}`)}</span>
          {' · '}{e.userName ?? t('billingCycles.lockAutomatic')}
          {' · '}{fmtDateTime(e.createdAt)}
          {e.action === 'recalculate' && e.oldTotal != null && e.newTotal != null && (
            <span> · {formatAmount(e.oldTotal, currency)} → {formatAmount(e.newTotal, currency)}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

// ── Panel on the cycle detail page ───────────────────────────────────────────
// Locked: everyone sees the banner; admins also get Recalculate / Unlock / history.
// Not locked: admins of a confirmed or invoiced cycle get a Lock button; others see nothing.

export function CycleLockPanel({ cycle, isAdmin }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const lockMutation = useLockCycle()
  const unlockMutation = useUnlockCycle()
  const [lockOpen, setLockOpen] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [recalcOpen, setRecalcOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [error, setError] = useState('')

  const canLock = isAdmin && !cycle.isLocked && !cycle.isBaseline && ['confirmed', 'invoiced'].includes(cycle.status)
  if (!cycle.isLocked && !canLock) return null

  async function handleLock() {
    setError('')
    try {
      await lockMutation.mutateAsync(cycle.id)
      showToast({ title: t('billingCycles.lockedToast'), variant: 'success' })
      setLockOpen(false)
    } catch (err) {
      setError(errMsg(err))
      setLockOpen(false)
    }
  }

  async function handleUnlock() {
    setError('')
    try {
      await unlockMutation.mutateAsync(cycle.id)
      showToast({ title: t('billingCycles.unlockedToast'), variant: 'info' })
      setUnlockOpen(false)
    } catch (err) {
      setError(errMsg(err))
      setUnlockOpen(false)
    }
  }

  if (!cycle.isLocked) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 px-4 py-3 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('billingCycles.lockHint')}</p>
          <button
            onClick={() => { setError(''); setLockOpen(true) }}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Lock className="h-4 w-4" />{t('billingCycles.lockCycle')}
          </button>
        </div>
        {error && <ErrorAlert message={error} />}
        <ConfirmDialog
          open={lockOpen}
          onClose={() => setLockOpen(false)}
          onConfirm={handleLock}
          title={t('billingCycles.lockCycleTitle')}
          description={t('billingCycles.lockCycleDesc')}
          loading={lockMutation.isPending}
          confirmLabel={t('billingCycles.lockCycle')}
          confirmClassName="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        />
      </>
    )
  }

  const currency = cycle.contract?.currency ?? 'IQD'
  return (
    <>
      <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 dark:text-slate-300" />
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('billingCycles.lockedBannerTitle')}</p>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{t('billingCycles.lockedBannerBody')}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {cycle.lockedByName
                  ? t('billingCycles.lockedBy', { name: cycle.lockedByName, date: fmtDateTime(cycle.lockedAt) })
                  : t('billingCycles.lockedAuto', { date: fmtDateTime(cycle.lockedAt) })}
              </p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setError(''); setRecalcOpen(true) }}
                className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
              >
                <RefreshCw className="h-4 w-4" />{t('billingCycles.recalculate')}
              </button>
              <button
                onClick={() => { setError(''); setUnlockOpen(true) }}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <LockOpen className="h-4 w-4" />{t('billingCycles.unlockCycle')}
              </button>
              <button
                onClick={() => setHistoryOpen(o => !o)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title={t('billingCycles.lockHistory')}
              >
                <History className="h-4 w-4" />{t('billingCycles.lockHistory')}
              </button>
            </div>
          )}
        </div>
        {isAdmin && historyOpen && (
          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
            <LockHistory cycleId={cycle.id} currency={currency} />
          </div>
        )}
        {error && <div className="mt-3"><ErrorAlert message={error} /></div>}
      </div>

      {isAdmin && (
        <>
          <RecalculateModal open={recalcOpen} onClose={() => setRecalcOpen(false)} cycle={cycle} />
          <ConfirmDialog
            open={unlockOpen}
            onClose={() => setUnlockOpen(false)}
            onConfirm={handleUnlock}
            title={t('billingCycles.unlockCycleTitle')}
            description={t('billingCycles.unlockCycleDesc')}
            loading={unlockMutation.isPending}
            confirmLabel={t('billingCycles.unlockCycle')}
            confirmClassName="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          />
        </>
      )}
    </>
  )
}

// ── Bulk lock (list page, admin) ─────────────────────────────────────────────
// Locks confirmed + invoiced cycles in chunks of 25 so one slow request never has to hold hundreds.

export function BulkLockModal({ open, onClose, contractId, contractLabel }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: candidates, isLoading } = useLockCandidates(contractId, open)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const total = candidates?.total ?? 0

  function close() {
    if (running) return
    setResult(null); setProgress(0); setError('')
    onClose()
  }

  async function run() {
    setRunning(true); setError(''); setResult(null); setProgress(0)
    let done = 0
    const failed = []
    try {
      for (;;) {
        const r = await lockCyclesBulkChunk({ ...(contractId ? { contractId } : {}), limit: 25 })
        done += r.locked
        failed.splice(0, failed.length, ...r.failed)   // the same failing cycles come back every round
        setProgress(done)
        if (r.locked === 0 || r.remaining === 0) break
      }
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setRunning(false)
      qc.invalidateQueries({ queryKey: ['billing-cycles'] })
    }
    setResult({ done, failed })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('billingCycles.bulkLockTitle')}
      footer={
        <>
          <button
            onClick={close}
            disabled={running}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {result ? t('common.close') : t('common.cancel')}
          </button>
          {!result && (
            <button
              onClick={run}
              disabled={running || isLoading || total === 0}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {running ? t('billingCycles.bulkLockProgress', { done: progress, total }) : t('billingCycles.bulkLockButton')}
            </button>
          )}
        </>
      }
    >
      {contractLabel && (
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('billingCycles.bulkLockScope', { contract: contractLabel })}</p>
      )}
      {isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : total === 0 && !result ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('billingCycles.bulkLockNothing')}</p>
      ) : !result ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('billingCycles.bulkLockDesc', { count: total })}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">{t('billingCycles.bulkLockDone', { count: result.done })}</p>
          {result.failed.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              <p className="font-medium">{t('billingCycles.bulkLockFailed', { count: result.failed.length })}</p>
              <ul className="mt-1 list-disc ps-4">
                {result.failed.slice(0, 5).map(f => <li key={f.cycleId}>{f.error}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      {error && <ErrorAlert message={error} />}
    </Modal>
  )
}
