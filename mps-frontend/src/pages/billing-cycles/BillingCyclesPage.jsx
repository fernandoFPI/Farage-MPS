import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Eye, CheckCircle, Link2, List, LayoutGrid, Trash2, RotateCcw } from 'lucide-react'
import AccordionGroup from '../../components/AccordionGroup'
import {
  useBillingCycles,
  useCreateBillingCycle,
  useConfirmCycle,
  useDeletedCycles,
  useHardDeleteCycle,
  useRestoreCycle,
} from '../../api/hooks/useBillingCycles'
import { useContracts } from '../../api/hooks/useContracts'
import { usePermission } from '../../hooks/usePermission'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import PageHeader from '../../components/PageHeader'
import DataTable from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import ConfirmDialog from '../../components/ConfirmDialog'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import { formatPeriod } from '../../utils/dates'
import { fmtDate, fmtDateTime } from '../../utils/format'

const STATUSES = ['open', 'pending_confirmation', 'confirmed', 'pending_quarterly', 'disputed', 'invoiced']
const VIEW_KEY = 'mps_billing_cycles_view'

function BaselineBadge({ label }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
      <span className="me-1">📌</span>
      {label}
    </span>
  )
}

const CITY_DOT_COLOR = {
  complete:  'bg-green-500',
  confirmed: 'bg-green-500',
  partial:   'bg-amber-400',
  pending:   'bg-gray-300 dark:bg-gray-600',
}

function CityDots({ cityStatuses }) {
  if (!cityStatuses || cityStatuses.length <= 1) return null
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {cityStatuses.map(c => (
        <span key={c.city} className="flex items-center gap-0.5" title={`${c.city}: ${c.status}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${CITY_DOT_COLOR[c.status] ?? 'bg-gray-300'}`} />
          <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">{c.city}</span>
        </span>
      ))}
    </div>
  )
}

function ViewToggle({ view, onChange, t }) {
  const btn = (v, Icon, label) => (
    <button
      onClick={() => onChange(v)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        view === v
          ? 'bg-brand-500 text-white'
          : 'border border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400 dark:hover:text-brand-400'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  )
  return (
    <div className="flex gap-1">
      {btn('list', List, t('common.listView'))}
      {btn('customer', LayoutGrid, t('common.customerView'))}
    </div>
  )
}

function CreateCycleModal({ onClose }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [form, setForm] = useState({ contractId: '', periodStart: '', periodEnd: '' })
  const [error, setError] = useState('')
  const { data: contracts = [] } = useContracts({ isActive: true })
  const create = useCreateBillingCycle()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.contractId || !form.periodStart || !form.periodEnd)
      return setError(t('billingCycles.requiredFields'))
    if (form.periodEnd <= form.periodStart)
      return setError(t('billingCycles.periodEndError'))
    setError('')
    try {
      await create.mutateAsync(form)
      showToast({ title: t('billingCycles.newCycle'), description: formatPeriod(form.periodStart, form.periodEnd), variant: 'success' })
      onClose()
    } catch (err) {
      setError(err.response?.status === 409
        ? t('billingCycles.alreadyExists')
        : (err.response?.data?.error || err.message))
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={t('billingCycles.newCycle')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={create.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="submit" form="create-cycle-form" disabled={create.isPending}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {create.isPending ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="create-cycle-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t('contracts.title')} required>
          <select className={inputCls} value={form.contractId} onChange={e => set('contractId', e.target.value)}>
            <option value="">—</option>
            {contracts.map(c => (
              <option key={c.id} value={c.id}>
                {c.contractNumber} — {c.customerName ?? c.customer?.name ?? ''}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('xsmImport.periodStart')} required>
            <input type="date" className={inputCls} value={form.periodStart} onChange={e => set('periodStart', e.target.value)} />
          </FormField>
          <FormField label={t('xsmImport.periodEnd')} required>
            <input type="date" className={inputCls} value={form.periodEnd} onChange={e => set('periodEnd', e.target.value)} />
          </FormField>
        </div>
        {error && <ErrorAlert message={error} />}
      </form>
    </Modal>
  )
}

export default function BillingCyclesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role?.name === 'admin'
  const canManage = usePermission('can_manage_billing')
  const canConfirm = usePermission('can_confirm_billing')
  const [tab, setTab] = useState('active')

  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) ?? 'list')
  const [contractId, setContractId] = useState('')
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '')

  function changeView(v) {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  useEffect(() => {
    const s = searchParams.get('status')
    if (s) setStatus(s)
  }, [])
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmingCycle, setConfirmingCycle] = useState(null)
  const [confirmError, setConfirmError] = useState('')

  const params = {}
  if (contractId) params.contractId = contractId
  if (status) params.status = status

  const { data: cycles = [], isLoading } = useBillingCycles(params)
  const { data: allContracts = [] } = useContracts()
  const confirmMutation = useConfirmCycle()
  const { data: deletedCycles = [], isLoading: deletedLoading } = useDeletedCycles()
  const hardDeleteMutation = useHardDeleteCycle()
  const restoreMutation = useRestoreCycle()
  const [purgingCycle, setPurgingCycle] = useState(null)
  const [restoringCycle, setRestoringCycle] = useState(null)

  // Group cycles by customer name for accordion view
  const customerCycleGroups = useMemo(() => {
    const groups = {}
    for (const c of cycles) {
      // Extract customer name from cycleName: everything before " — "
      const customer = c.cycleName?.split(' — ')[0] ?? c.customerName ?? 'Unknown'
      if (!groups[customer]) groups[customer] = []
      groups[customer].push(c)
    }
    // Sort each customer's cycles by period_start descending
    for (const customer of Object.keys(groups)) {
      groups[customer].sort((a, b) => new Date(b.periodStart) - new Date(a.periodStart))
    }
    return groups
  }, [cycles])

  async function handlePurge() {
    try {
      await hardDeleteMutation.mutateAsync(purgingCycle.id)
      showToast({ title: t('billingCycles.purged'), variant: 'success' })
      setPurgingCycle(null)
    } catch (err) {
      showToast({ title: err.response?.data?.error || err.message, variant: 'error' })
    }
  }

  async function handleRestore() {
    try {
      await restoreMutation.mutateAsync(restoringCycle.id)
      showToast({ title: t('billingCycles.restored'), variant: 'success' })
      setRestoringCycle(null)
    } catch (err) {
      showToast({ title: err.response?.data?.error || err.message, variant: 'error' })
    }
  }

  async function handleQuickConfirm() {
    setConfirmError('')
    try {
      await confirmMutation.mutateAsync(confirmingCycle.id)
      showToast({
        title: t('billingCycles.confirmCycle'),
        description: formatPeriod(confirmingCycle.periodStart, confirmingCycle.periodEnd),
        variant: 'success',
      })
      setConfirmingCycle(null)
    } catch (err) {
      setConfirmError(err.response?.data?.error || err.message)
    }
  }

  const selectCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none'

  const columns = [
    {
      key: 'cycleName',
      label: 'Cycle',
      render: r => (
        <div>
          <div className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-gray-100">
            {r.cycleName ?? `${r.customerName ?? '—'} — ${formatPeriod(r.periodStart, r.periodEnd)}`}
            {r.status === 'pending_quarterly' && r.cycleGroupId && (
              <Link
                to={`/cycle-groups/${r.cycleGroupId}`}
                onClick={e => e.stopPropagation()}
                className="text-teal-600 hover:text-teal-700 dark:text-teal-400"
                title="Part of quarterly group"
              >
                <Link2 className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500">
            <Link to={`/contracts/${r.contractId}`} className="hover:text-brand-600 dark:hover:text-brand-400">
              {r.contractNumber ?? r.contract?.contractNumber ?? '—'}
            </Link>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: t('common.status'),
      render: r => (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={r.status} />
          {r.isBaseline && <BaselineBadge label={t('billingCycles.baseline')} />}
          <CityDots cityStatuses={r.cityStatuses} />
        </div>
      ),
    },
    {
      key: 'specialist',
      label: t('billingCycles.specialist'),
      className: 'hidden lg:table-cell',
      render: r => r.specialist?.fullName ?? r.specialistName ?? '—',
    },
    {
      key: 'createdAt',
      label: t('common.createdAt'),
      className: 'hidden lg:table-cell',
      render: r => fmtDate(r.createdAt),
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: r => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/billing-cycles/${r.id}`)}
            className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"
            title={t('common.actions')}
          >
            <Eye className="h-4 w-4" />
          </button>
          {canConfirm && (r.status === 'open' || r.status === 'pending_confirmation') && (
            <button
              onClick={() => { setConfirmError(''); setConfirmingCycle(r) }}
              className="p-1 text-gray-400 hover:text-green-600 dark:hover:text-green-400"
              title={t('billingCycles.confirmCycle')}
            >
              <CheckCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ]

  const cancelledColumns = [
    {
      key: 'cycleName',
      label: t('billingCycles.title'),
      render: r => (
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{r.cycleName}</p>
          <p className="text-xs text-gray-400">{r.contractNumber ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'period',
      label: t('billingCycles.period'),
      render: r => formatPeriod(r.periodStart, r.periodEnd),
    },
    {
      key: 'deletedAt',
      label: t('billingCycles.deletedAt'),
      render: r => (
        <div>
          <p className="text-sm text-gray-700 dark:text-gray-300">{fmtDateTime(r.deletedAt)}</p>
          {r.deletedByName && <p className="text-xs text-gray-400">{r.deletedByName}</p>}
        </div>
      ),
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: r => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRestoringCycle(r)}
            className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-brand-800/50 dark:text-brand-400 dark:hover:bg-brand-900/20"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('billingCycles.restore')}
          </button>
          <button
            onClick={() => setPurgingCycle(r)}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800/50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('billingCycles.purge')}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('billingCycles.title')}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <select value={contractId} onChange={e => setContractId(e.target.value)} className={selectCls}>
              <option value="">{t('billingCycles.contract')}: All</option>
              {allContracts.map(c => (
                <option key={c.id} value={c.id}>{c.contractNumber}</option>
              ))}
            </select>
            <select value={status} onChange={e => setStatus(e.target.value)} className={selectCls}>
              <option value="">{t('common.status')}: All</option>
              {STATUSES.map(s => (
                <option key={s} value={s}>{t(`billingCycles.status.${s}`)}</option>
              ))}
            </select>
            <ViewToggle view={view} onChange={changeView} t={t} />
            {canManage && (
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />{t('billingCycles.newCycle')}
              </button>
            )}
          </div>
        }
      />

      {/* Admin tab bar */}
      {isAdmin && (
        <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setTab('active')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'active'
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            {t('billingCycles.title')}
          </button>
          <button
            onClick={() => setTab('deleted')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'deleted'
                ? 'border-red-500 text-red-600 dark:text-red-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('billingCycles.deletedCycles')}
            {deletedCycles.length > 0 && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                {deletedCycles.length}
              </span>
            )}
          </button>
        </div>
      )}

      {tab === 'deleted' && isAdmin ? (
        <DataTable columns={cancelledColumns} data={deletedCycles} loading={deletedLoading} emptyMessage={t('billingCycles.recycleBinEmpty')} />
      ) : view === 'list' ? (
        <DataTable columns={columns} data={cycles} loading={isLoading} emptyMessage={t('common.noData')} />
      ) : isLoading ? (
        <div className="py-20 text-center text-sm text-gray-400">{t('common.loading')}</div>
      ) : Object.keys(customerCycleGroups).length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">{t('common.noCyclesForCustomer')}</p>
      ) : (
        <AccordionGroup
          groups={Object.entries(customerCycleGroups).sort(([a], [b]) => a.localeCompare(b)).map(([customerName, customerCycles]) => ({
            key: customerName,
            label: customerName,
            items: customerCycles,
          }))}
          renderItem={r => (
            <div key={r.id} className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {r.cycleName ?? `${r.customerName ?? '—'} — ${formatPeriod(r.periodStart, r.periodEnd)}`}
                </span>
                {r.isBaseline && <BaselineBadge label={t('billingCycles.baseline')} />}
                {r.status === 'pending_quarterly' && r.cycleGroupId && (
                  <Link
                    to={`/cycle-groups/${r.cycleGroupId}`}
                    onClick={e => e.stopPropagation()}
                    className="text-teal-600 hover:text-teal-700 dark:text-teal-400"
                    title="Part of quarterly group"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
              <StatusBadge status={r.status} />
              <CityDots cityStatuses={r.cityStatuses} />
              <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap hidden sm:block">
                {formatPeriod(r.periodStart, r.periodEnd)}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 hidden md:block">
                {r.specialist?.fullName ?? r.specialistName ?? '—'}
              </span>
              <div className="flex items-center gap-1 ms-auto">
                <button
                  onClick={() => navigate(`/billing-cycles/${r.id}`)}
                  className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"
                  title={t('common.actions')}
                >
                  <Eye className="h-4 w-4" />
                </button>
                {canConfirm && (r.status === 'open' || r.status === 'pending_confirmation') && (
                  <button
                    onClick={() => { setConfirmError(''); setConfirmingCycle(r) }}
                    className="p-1 text-gray-400 hover:text-green-600 dark:hover:text-green-400"
                    title={t('billingCycles.confirmCycle')}
                  >
                    <CheckCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        />
      )}

      {createOpen && <CreateCycleModal onClose={() => setCreateOpen(false)} />}

      <ConfirmDialog
        open={!!confirmingCycle}
        onClose={() => setConfirmingCycle(null)}
        onConfirm={handleQuickConfirm}
        title={t('billingCycles.confirmCycle')}
        description={confirmingCycle
          ? `${t('billingCycles.period')}: ${formatPeriod(confirmingCycle.periodStart, confirmingCycle.periodEnd)}\n${t('billingCycles.contract')}: ${confirmingCycle.contract?.contractNumber ?? '—'}`
          : ''}
        loading={confirmMutation.isPending}
        confirmLabel={t('billingCycles.confirmCycle')}
        confirmClassName="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      />

      <ConfirmDialog
        open={!!purgingCycle}
        onClose={() => setPurgingCycle(null)}
        onConfirm={handlePurge}
        title={t('billingCycles.purgeTitle')}
        description={purgingCycle
          ? `${t('billingCycles.purgeWarning')}\n\n${purgingCycle.cycleName}\n${t('billingCycles.period')}: ${formatPeriod(purgingCycle.periodStart, purgingCycle.periodEnd)}`
          : ''}
        loading={hardDeleteMutation.isPending}
        confirmLabel={t('billingCycles.purge')}
        confirmClassName="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      />

      <ConfirmDialog
        open={!!restoringCycle}
        onClose={() => setRestoringCycle(null)}
        onConfirm={handleRestore}
        title={t('billingCycles.restoreTitle')}
        description={restoringCycle
          ? `${restoringCycle.cycleName}\n${t('billingCycles.period')}: ${formatPeriod(restoringCycle.periodStart, restoringCycle.periodEnd)}`
          : ''}
        loading={restoreMutation.isPending}
        confirmLabel={t('billingCycles.restore')}
        confirmClassName="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
      />
    </div>
  )
}
