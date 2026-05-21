import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import SearchableSelect from '../../components/SearchableSelect'
import { customerOptions, billingCycleOptions, printerOptions } from '../../utils/filterOptions'
import { Plus, Trash2, AlertTriangle, Pencil, X, Info, List, LayoutGrid, Image, FileUp } from 'lucide-react'
import ReadingImportModal from './ReadingImportModal'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useMeterReadings, useDeleteReading, useUpdateReading, useBulkDeleteReadings } from '../../api/hooks/useMeterReadings'
import PhotoViewerModal from '../../components/PhotoViewerModal'
import { useBillingCycles } from '../../api/hooks/useBillingCycles'
import { usePrinters } from '../../api/hooks/usePrinters'
import { useCustomers } from '../../api/hooks/useCustomers'
import { usePermission } from '../../hooks/usePermission'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import FormField, { inputCls } from '../../components/FormField'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import ConfirmDialog from '../../components/ConfirmDialog'
import ErrorAlert from '../../components/ErrorAlert'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import AccordionGroup from '../../components/AccordionGroup'
import { fmtDateTime, fmtDate } from '../../utils/format'

const VIEW_KEY = 'mps_meter_readings_view'

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

function toDateTimeLocal(iso) {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 16)
}

export default function MeterReadingsPage() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role?.name === 'admin'
  const isEngineer = user?.role?.name === 'engineer'
  const canSubmit = usePermission('can_submit_readings')
  const canManage = usePermission('can_manage_billing')

  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) ?? 'list')
  const [billingCycleId, setBillingCycleId] = useState(null)
  const [source, setSource] = useState(null)
  const [printerId, setPrinterId] = useState(null)
  const [customerId, setCustomerId] = useState(null)

  function changeView(v) {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  const [deleting, setDeleting] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editError, setEditError] = useState('')
  const [photoReadingId, setPhotoReadingId] = useState(null)
  const [showImportModal, setShowImportModal] = useState(false)

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleteConfirmed, setBulkDeleteConfirmed] = useState(false)
  const [bulkDeleteError, setBulkDeleteError] = useState('')

  const params = {}
  if (billingCycleId) params.billingCycleId = billingCycleId
  if (source) params.source = source
  if (printerId) params.printerId = printerId
  if (customerId) params.customerId = customerId

  const { data: readings = [], isLoading } = useMeterReadings(params)
  const { data: cycles = [] } = useBillingCycles()
  const { data: printers = [] } = usePrinters()
  const { data: customers = [] } = useCustomers()
  const deleteMutation = useDeleteReading()
  const updateMutation = useUpdateReading()
  const bulkDeleteMutation = useBulkDeleteReadings()

  const printerMap = useMemo(() => Object.fromEntries(printers.map(p => [p.id, p])), [printers])
  const cycleMap   = useMemo(() => Object.fromEntries(cycles.map(c => [c.id, c])), [cycles])

  // Group readings by customer → cycle for the accordion view
  const customerGroups = useMemo(() => {
    const groups = {}
    for (const r of readings) {
      const customer = r.customerName ?? 'Unknown'
      const cycle    = r.cycleName   ?? '—'
      if (!groups[customer]) groups[customer] = {}
      if (!groups[customer][cycle]) groups[customer][cycle] = []
      groups[customer][cycle].push(r)
    }
    return groups
  }, [readings])

  async function handleDelete() {
    setDeleteError('')
    try {
      await deleteMutation.mutateAsync(deleting.id)
      setDeleting(null)
      showToast({ title: t('meterReadings.deleteSuccess'), variant: 'success' })
    } catch (err) {
      setDeleteError(err.response?.data?.error || err.message)
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === readings.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(readings.map(r => r.id)))
    }
  }

  function openBulkDelete() {
    setBulkDeleteError('')
    setBulkDeleteConfirmed(false)
    setBulkDeleteOpen(true)
  }

  async function handleBulkDelete() {
    setBulkDeleteError('')
    try {
      const result = await bulkDeleteMutation.mutateAsync({
        ids: [...selectedIds],
        confirmDelete: bulkDeleteConfirmed,
      })
      showToast({ title: t('meterReadings.bulkDeleteSuccess', { count: result.deleted }), variant: 'success' })
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
    } catch (err) {
      if (err.response?.status === 409) {
        setBulkDeleteError(t('meterReadings.bulkDeleteConfirmedWarning', { count: err.response.data.confirmedCount }))
        setBulkDeleteConfirmed(false)
      } else {
        setBulkDeleteError(err.response?.data?.error || err.message)
      }
    }
  }

  function handleEditOpen(r) {
    setEditing(r)
    setEditError('')
    setEditForm({
      a4Bw:   String(r.a4Bw   ?? 0),
      a3Bw:   String(r.a3Bw   ?? 0),
      a4Color: String(r.a4Color ?? 0),
      a3Color: String(r.a3Color ?? 0),
      xls:    String(r.xls    ?? 0),
      readAt: toDateTimeLocal(r.readAt),
    })
  }

  async function handleEditSave() {
    setEditError('')
    try {
      const isPsg = editing.contractType === 'psg'
      const payload = {
        id:      editing.id,
        a4Bw:    Number(editForm.a4Bw)    || 0,
        a3Bw:    Number(editForm.a3Bw)    || 0,
        a4Color: Number(editForm.a4Color) || 0,
        a3Color: Number(editForm.a3Color) || 0,
        xls:     isPsg ? (Number(editForm.xls) || 0) : 0,
        readAt:  new Date(editForm.readAt).toISOString(),
      }
      const result = await updateMutation.mutateAsync(payload)

      showToast({ title: t('meterReadings.editSuccess'), variant: 'success' })

      if (result.warning) {
        showToast({
          title: 'Later cycle affected',
          description: t('meterReadings.laterCycleWarning'),
          variant: 'warning',
          duration: 8000,
        })
      }

      setEditing(null)
    } catch (err) {
      setEditError(err.response?.data?.error || err.message)
    }
  }

  const setEdit = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  const editingCycle = editing ? cycleMap[editing.billingCycleId] : null

  return (
    <>
    <Tooltip.Provider delayDuration={200}>
      <div>
        <PageHeader
          title={t('meterReadings.title')}
          actions={
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <ViewToggle view={view} onChange={changeView} t={t} />
              {canManage && (
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-500 dark:hover:text-brand-400 transition-colors"
                >
                  <FileUp className="h-4 w-4" />{t('meterReadings.importReadings')}
                </button>
              )}
              {canSubmit && !isEngineer && (
                <Link
                  to="/meter-readings/submit"
                  className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  <Plus className="h-4 w-4" />{t('meterReadings.submit')}
                </Link>
              )}
            </div>
          }
        />

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <SearchableSelect
            className="w-44"
            value={customerId}
            onChange={setCustomerId}
            options={customerOptions(customers)}
          />
          <SearchableSelect
            className="w-56"
            value={billingCycleId}
            onChange={setBillingCycleId}
            options={billingCycleOptions(cycles)}
          />
          <SearchableSelect
            className="w-36"
            value={source}
            onChange={setSource}
            options={[
              { value: null, label: `${t('meterReadings.source')}: All` },
              { value: 'manual', label: t('meterReadings.manual') },
              { value: 'xsm', label: t('meterReadings.xsm') },
              { value: 'odoo', label: t('meterReadings.odoo') },
            ]}
          />
          <SearchableSelect
            className="w-52"
            value={printerId}
            onChange={setPrinterId}
            options={printerOptions(printers)}
          />
        </div>

        {deleteError && <div className="mb-4"><ErrorAlert message={deleteError} /></div>}

        {/* Bulk selection toolbar */}
        {isAdmin && selectedIds.size > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-800/40 dark:bg-red-950/20">
            <span className="text-sm font-medium text-red-700 dark:text-red-400">
              {t('meterReadings.selectedCount', { count: selectedIds.size })}
            </span>
            <button
              onClick={openBulkDelete}
              className="ms-auto flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('meterReadings.bulkDelete')}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <X className="h-3.5 w-3.5" />
              {t('common.cancel')}
            </button>
          </div>
        )}

        {isLoading ? (
          <LoadingSpinner className="py-20" />
        ) : !readings.length ? (
          <EmptyState title={t('common.noData')} />
        ) : view === 'list' ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {isAdmin && (
                    <th className="px-4 py-3 text-start">
                      <input
                        type="checkbox"
                        checked={readings.length > 0 && selectedIds.size === readings.length}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                    </th>
                  )}
                  {[
                    t('printers.serialNumber'),
                    t('printers.model'),
                    'Customer',
                    'Cycle',
                    t('meterReadings.source'),
                    t('meterReadings.a4Bw'),
                    t('meterReadings.a3Bw'),
                    t('meterReadings.a4Color'),
                    t('meterReadings.a3Color'),
                    t('meterReadings.readAt'),
                    t('meterReadings.submittedBy'),
                    t('meterReadings.submittedAt'),
                    t('meterReadings.flagged'),
                    ...(!isEngineer ? [t('meterReadings.photos')] : []),
                    t('common.actions'),
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {readings.map(r => {
                  const cycle         = cycleMap[r.billingCycleId]
                  const cycleOpen     = cycle?.status === 'open'
                  const cycleEditable = cycle && ['open', 'pending_confirmation'].includes(cycle.status)
                  const isSelected    = selectedIds.has(r.id)
                  return [
                    <tr key={r.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(r.id)}
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        <span className="flex items-center gap-1.5">
                          {r.serialNumber ?? '—'}
                          {r.isBwOnly && (
                            <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">{t('printers.bwOnlyBadge')}</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.model ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{r.customerName ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.cycleName ?? cycle?.contractNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-sm"><StatusBadge status={r.source} /></td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.a4Bw ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.a3Bw ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.isBwOnly ? '—' : (r.a4Color ?? '—')}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.isBwOnly ? '—' : (r.a3Color ?? '—')}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtDateTime(r.readAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{r.submittedByName ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{r.submittedAt ? fmtDateTime(r.submittedAt) : '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        {r.flagged ? (
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button className="flex items-center"><AlertTriangle className="h-4 w-4 text-red-500" /></button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content side="top" className="max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-gray-700">
                                {r.flagReason}
                                <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        ) : null}
                      </td>
                      {!isEngineer && (
                        <td className="px-4 py-3 text-sm">
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
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-1">
                          {canSubmit && cycleEditable && !isEngineer && (
                            <button onClick={() => handleEditOpen(r)} className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400" title={t('meterReadings.edit')}>
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {cycleOpen && canManage && (
                            <button onClick={() => { setDeleteError(''); setDeleting(r) }} className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>,
                    r.usage ? (
                      <tr key={`${r.id}-usage`} className="bg-gray-50/50 dark:bg-gray-800/20">
                        <td colSpan={isEngineer ? (isAdmin ? 15 : 14) : (isAdmin ? 16 : 15)} className="px-4 py-1.5 text-xs text-gray-500 dark:text-gray-500">
                          <span className="font-medium text-gray-400 dark:text-gray-500">{t('meterReadings.usage')}:</span>
                          {' '}A4 BW: {r.usage.a4Bw ?? 0}
                          {' | '}A3 BW: {r.usage.a3Bw ?? 0}
                          {' | '}A4 Color: {r.usage.a4Color ?? 0}
                          {' | '}A3 Color: {r.usage.a3Color ?? 0}
                          {r.usage.xls != null && r.usage.xls > 0 ? ` | XLS: ${r.usage.xls}` : ''}
                        </td>
                      </tr>
                    ) : null,
                  ]
                })}
              </tbody>
            </table>
          </div>
        ) : (
          // ── By Customer accordion view ──
          Object.keys(customerGroups).length === 0 ? (
            <EmptyState title={t('common.noReadingsForCustomer')} />
          ) : (
            <AccordionGroup
              groups={Object.entries(customerGroups).sort(([a], [b]) => a.localeCompare(b)).map(([customerName, cycleGroups]) => ({
                key: customerName,
                label: customerName,
                subGroups: Object.entries(cycleGroups).map(([cycleName, cycleReadings]) => ({
                  key: cycleName,
                  label: cycleName,
                  items: [...cycleReadings].sort((a, b) => new Date(b.readAt) - new Date(a.readAt)),
                })),
              }))}
              renderItem={r => {
                const cycle         = cycleMap[r.billingCycleId]
                const cycleOpen     = cycle?.status === 'open'
                const cycleEditable = cycle && ['open', 'pending_confirmation'].includes(cycle.status)
                return (
                  <div key={r.id} className="flex items-center gap-3 px-8 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors flex-wrap">
                    <div className="flex items-center gap-1.5 w-28">
                      <Link to={`/printers/${r.printerId}`} className="font-mono text-sm text-brand-600 hover:underline dark:text-brand-400">
                        {r.serialNumber ?? '—'}
                      </Link>
                      {r.isBwOnly && (
                        <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">{t('printers.bwOnlyBadge')}</span>
                      )}
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300 w-36">{r.model ?? '—'}</span>
                    <StatusBadge status={r.source} />
                    <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                      {r.isBaseline ? (
                        <>
                          <span>BW: <span className="font-medium text-gray-500 dark:text-gray-400">—</span></span>
                          {!r.isBwOnly && <span>Color: <span className="font-medium text-gray-500 dark:text-gray-400">—</span></span>}
                        </>
                      ) : (
                        <>
                          <span>BW: <span className="font-medium text-gray-900 dark:text-gray-100">{(r.a4Bw ?? 0) + (r.a3Bw ?? 0)}</span></span>
                          {r.isBwOnly
                            ? <span>Color: <span className="font-medium text-gray-400 dark:text-gray-500">—</span></span>
                            : <span>Color: <span className="font-medium text-gray-900 dark:text-gray-100">{(r.a4Color ?? 0) + (r.a3Color ?? 0)}</span></span>
                          }
                        </>
                      )}
                    </div>
                    {r.submittedByName && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 hidden lg:block">{r.submittedByName}</span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{fmtDate(r.readAt)}</span>
                    {r.flagged && (
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button className="flex items-center"><AlertTriangle className="h-4 w-4 text-red-500" /></button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content side="top" className="max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-gray-700">
                            {r.flagReason}
                            <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    )}
                    <div className="flex items-center gap-1 ms-auto">
                      {canSubmit && cycleEditable && !isEngineer && (
                        <button onClick={() => handleEditOpen(r)} className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400" title={t('meterReadings.edit')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {cycleOpen && canManage && (
                        <button onClick={() => { setDeleteError(''); setDeleting(r) }} className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              }}
            />
          )
        )}

        {/* Mobile FAB */}
        {canSubmit && !isEngineer && (
          <Link
            to="/meter-readings/submit"
            className="fixed bottom-6 end-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg hover:bg-brand-600 md:hidden"
          >
            <Plus className="h-6 w-6" />
          </Link>
        )}

        <ConfirmDialog
          open={!!deleting}
          onClose={() => setDeleting(null)}
          onConfirm={handleDelete}
          title={t('meterReadings.deleteConfirm')}
          description={`${t('common.confirm')} delete reading for "${deleting?.printer?.serialNumber}"?`}
          loading={deleteMutation.isPending}
        />

        {/* Edit modal */}
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-gray-900 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between border-b px-5 py-4 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t('meterReadings.edit')}
                </h2>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto px-5 py-4 space-y-4">
                {/* Read-only info */}
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{t('printers.serialNumber')}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{editing.serialNumber ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{t('nav.billingCycles')}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {editingCycle
                        ? `${fmtDate(editingCycle.periodStart)} → ${fmtDate(editingCycle.periodEnd)}`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{t('meterReadings.source')}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{editing.source}</span>
                  </div>
                </div>

                {/* Counter fields */}
                <FormField label={t('meterReadings.a4Bw')}>
                  <input
                    type="number" inputMode="numeric" min="0"
                    className={inputCls}
                    value={editForm.a4Bw}
                    onChange={e => setEdit('a4Bw', e.target.value)}
                  />
                </FormField>
                <FormField label={t('meterReadings.a3Bw')}>
                  <input
                    type="number" inputMode="numeric" min="0"
                    className={inputCls}
                    value={editForm.a3Bw}
                    onChange={e => setEdit('a3Bw', e.target.value)}
                  />
                </FormField>
                <FormField label={t('meterReadings.a4Color')}>
                  <input
                    type="number" inputMode="numeric" min="0"
                    className={inputCls}
                    value={editForm.a4Color}
                    onChange={e => setEdit('a4Color', e.target.value)}
                  />
                </FormField>
                <FormField label={t('meterReadings.a3Color')}>
                  <input
                    type="number" inputMode="numeric" min="0"
                    className={inputCls}
                    value={editForm.a3Color}
                    onChange={e => setEdit('a3Color', e.target.value)}
                  />
                </FormField>
                {editing.contractType === 'psg' && (
                  <FormField label={t('meterReadings.xls')}>
                    <input
                      type="number" inputMode="numeric" min="0"
                      className={inputCls}
                      value={editForm.xls}
                      onChange={e => setEdit('xls', e.target.value)}
                    />
                  </FormField>
                )}
                <FormField label={t('meterReadings.readAt')}>
                  <input
                    type="datetime-local"
                    className={inputCls}
                    value={editForm.readAt}
                    onChange={e => setEdit('readAt', e.target.value)}
                  />
                </FormField>

                {/* Note */}
                <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 px-3 py-2.5">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                  <p className="text-xs text-blue-600 dark:text-blue-400">{t('meterReadings.editNote')}</p>
                </div>

                {editError && <ErrorAlert message={editError} />}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 border-t px-5 py-4 dark:border-gray-700">
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={updateMutation.isPending}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {updateMutation.isPending ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Tooltip.Provider>

    {photoReadingId && (
      <PhotoViewerModal readingId={photoReadingId} onClose={() => setPhotoReadingId(null)} />
    )}

    {showImportModal && (
      <ReadingImportModal onClose={() => setShowImportModal(false)} />
    )}

    {bulkDeleteOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-gray-900">
          <div className="border-b px-5 py-4 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('meterReadings.bulkDeleteTitle')}
            </h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('meterReadings.bulkDeleteDescription', { count: selectedIds.size })}
            </p>
            {bulkDeleteError && (
              <div className="space-y-3">
                <ErrorAlert message={bulkDeleteError} />
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkDeleteConfirmed}
                    onChange={e => setBulkDeleteConfirmed(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('meterReadings.bulkDeleteConfirmCheckbox')}
                  </span>
                </label>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t px-5 py-4 dark:border-gray-700">
            <button
              onClick={() => setBulkDeleteOpen(false)}
              disabled={bulkDeleteMutation.isPending}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending || (!!bulkDeleteError && !bulkDeleteConfirmed)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {bulkDeleteMutation.isPending ? t('common.loading') : t('meterReadings.bulkDelete')}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}
