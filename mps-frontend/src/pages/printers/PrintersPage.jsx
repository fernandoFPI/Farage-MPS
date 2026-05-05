import { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Eye, Trash2, UserPlus, RefreshCw, List, LayoutGrid, FileUp } from 'lucide-react'
import { usePrinters, useDeletePrinter } from '../../api/hooks/usePrinters'
import { useAssignments } from '../../api/hooks/useAssignments'
import { useCustomers } from '../../api/hooks/useCustomers'
import PageHeader from '../../components/PageHeader'
import DataTable from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import ConfirmDialog from '../../components/ConfirmDialog'
import ErrorAlert from '../../components/ErrorAlert'
import AccordionGroup from '../../components/AccordionGroup'
import PrinterFormModal from './PrinterFormModal'
import PrinterAssignModal from './PrinterAssignModal'
import PrinterImportModal from './PrinterImportModal'

const today = new Date().toISOString().slice(0, 10)
const VIEW_KEY = 'mps_printers_view'

function ViewToggle({ view, onChange }) {
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
      {btn('list', List, 'List')}
      {btn('customer', LayoutGrid, 'By Customer')}
    </div>
  )
}

export default function PrintersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) ?? 'list')
  const [city, setCity] = useState('')
  const [xsmEnabled, setXsmEnabled] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [assigningPrinter, setAssigningPrinter] = useState(null)
  const [assignInitial, setAssignInitial] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  const params = {}
  if (city) params.city = city
  if (xsmEnabled !== '') params.xsmEnabled = xsmEnabled

  const { data: printers = [], isLoading } = usePrinters(params)
  const { data: assignments = [] } = useAssignments()
  const { data: customers = [] } = useCustomers()
  const deleteMutation = useDeletePrinter()

  const printerMap = useMemo(() => Object.fromEntries(printers.map(p => [p.id, p])), [printers])

  // printerId → most recent active assignment
  const activeAssignmentMap = useMemo(() => {
    const map = {}
    for (const a of assignments) {
      if (!a.assignedUntil || a.assignedUntil.slice(0, 10) >= today) {
        if (!map[a.printerId]) map[a.printerId] = a
      }
    }
    return map
  }, [assignments])

  // For list view: filter by selected customer
  const filteredPrinters = useMemo(() => {
    if (!customerFilter) return printers
    return printers.filter(p => {
      const a = activeAssignmentMap[p.id]
      return a?.contract?.customerName === customerFilter
    })
  }, [printers, activeAssignmentMap, customerFilter])

  // For customer view: group active assignments by customer → contract
  const customerGroups = useMemo(() => {
    const groups = {}
    for (const a of Object.values(activeAssignmentMap)) {
      const customerName = a.contract?.customerName ?? 'Unknown'
      const contractNumber = a.contract?.contractNumber ?? '—'
      const contractId = a.contractId
      if (!groups[customerName]) groups[customerName] = {}
      const key = contractId
      if (!groups[customerName][key]) {
        groups[customerName][key] = { contractNumber, contractId, printers: [] }
      }
      const printer = printerMap[a.printerId]
      if (printer) {
        groups[customerName][key].printers.push({ printer, assignment: a })
      }
    }
    return groups
  }, [activeAssignmentMap, printerMap])

  function changeView(v) {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(row) { setEditing(row); setModalOpen(true) }

  function openAssign(printer, initial = null) {
    setAssigningPrinter(printer)
    setAssignInitial(initial ?? activeAssignmentMap[printer.id] ?? null)
  }

  async function handleDelete() {
    setDeleteError('')
    try {
      await deleteMutation.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (err) {
      setDeleteError(err.response?.data?.error || err.message)
    }
  }

  const selectCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none'

  const columns = [
    { key: 'serialNumber', label: t('printers.serialNumber') },
    { key: 'model',        label: t('printers.model') },
    { key: 'city',         label: t('printers.city') },
    { key: 'location',     label: t('printers.location'), className: 'hidden md:table-cell' },
    { key: 'xsmEnabled',   label: t('printers.xsmEnabled'), className: 'hidden lg:table-cell',
      render: r => <StatusBadge status={r.xsmEnabled} /> },
    { key: 'isBwOnly', label: t('printers.bwOnlyBadge'), className: 'hidden lg:table-cell',
      render: r => r.isBwOnly
        ? <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">{t('printers.bwOnlyBadge')}</span>
        : null },
    {
      key: 'assignedTo',
      label: 'Assigned To',
      render: r => {
        const a = activeAssignmentMap[r.id]
        if (!a) return <span className="text-sm text-gray-400 dark:text-gray-500">— Unassigned</span>
        return (
          <Link to={`/contracts/${a.contractId}`}
            className="text-sm text-brand-600 hover:underline dark:text-brand-400">
            {a.contract?.customerName ?? '—'} — {a.contract?.contractNumber ?? '—'}
          </Link>
        )
      },
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: r => {
        const active = activeAssignmentMap[r.id]
        return (
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(`/printers/${r.id}`)}
              className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400">
              <Eye className="h-4 w-4" />
            </button>
            <button onClick={() => openEdit(r)}
              className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400">
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => openAssign(r)}
              className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400 dark:hover:text-brand-400"
            >
              {active
                ? <><RefreshCw className="h-3 w-3" />{' '}Reassign</>
                : <><UserPlus className="h-3 w-3" />{' '}Assign</>
              }
            </button>
            <button onClick={() => { setDeleteError(''); setDeleting(r) }}
              className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('printers.title')}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {view === 'list' && (
              <>
                <input value={city} onChange={e => setCity(e.target.value)} placeholder={t('printers.city')}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/20 w-32" />
                <select value={xsmEnabled} onChange={e => setXsmEnabled(e.target.value)} className={selectCls}>
                  <option value="">{t('printers.xsmEnabled')}: {t('common.status')}</option>
                  <option value="true">{t('printers.xsmEnabled')}</option>
                  <option value="false">Not XSM</option>
                </select>
              </>
            )}
            <ViewToggle view={view} onChange={changeView} />
            <button onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-brand-500 dark:hover:text-brand-400">
              <FileUp className="h-4 w-4" />{t('printers.importPrinters')}
            </button>
            <button onClick={openCreate}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              <Plus className="h-4 w-4" />{t('printers.addPrinter')}
            </button>
          </div>
        }
      />

      {deleteError && <div className="mb-4"><ErrorAlert message={deleteError} /></div>}

      {view === 'list' ? (
        <>
          {/* Customer filter */}
          <div className="mb-4">
            <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} className={selectCls}>
              <option value="">All Customers</option>
              {customers.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <DataTable columns={columns} data={filteredPrinters} loading={isLoading} emptyMessage={t('common.noData')} />
        </>
      ) : (
        <div className="space-y-4">
          {Object.keys(customerGroups).length === 0 ? (
            <p className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">{t('common.noData')}</p>
          ) : (
            <AccordionGroup
              groups={Object.entries(customerGroups).sort(([a], [b]) => a.localeCompare(b)).map(([customerName, contracts]) => ({
                key: customerName,
                label: customerName,
                subGroups: Object.values(contracts).map(({ contractNumber, contractId, printers: cPrinters }) => ({
                  key: contractId,
                  label: (
                    <span className="flex items-center gap-2">
                      <Link
                        to={`/contracts/${contractId}`}
                        onClick={e => e.stopPropagation()}
                        className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                      >
                        {contractNumber}
                      </Link>
                      <span className="text-xs text-gray-400 dark:text-gray-500">({cPrinters.length} printer{cPrinters.length !== 1 ? 's' : ''})</span>
                    </span>
                  ),
                  items: cPrinters,
                })),
              }))}
              renderItem={({ printer, assignment }) => (
                <div key={printer.id} className="flex items-center gap-3 px-8 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <button
                    onClick={() => navigate(`/printers/${printer.id}`)}
                    className="font-mono text-sm text-brand-600 hover:underline dark:text-brand-400 w-32 text-start"
                  >
                    {printer.serialNumber}
                  </button>
                  <span className="text-sm text-gray-700 dark:text-gray-300 w-36">{printer.model}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-24">{printer.city}</span>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/20 dark:text-brand-400">
                    {assignment.contractType?.toUpperCase()}
                  </span>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</span>
                  <div className="flex items-center gap-1 ms-auto">
                    <button onClick={() => openEdit(printer)} className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => openAssign(printer, assignment)}
                      className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400 dark:hover:text-brand-400"
                    >
                      <RefreshCw className="h-3 w-3" /> Reassign
                    </button>
                  </div>
                </div>
              )}
            />
          )}
        </div>
      )}

      <PrinterFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={editing}
        onSaveAndAssign={printer => { setModalOpen(false); openAssign(printer, null) }}
      />

      <PrinterAssignModal
        open={!!assigningPrinter}
        onClose={() => setAssigningPrinter(null)}
        printerId={assigningPrinter?.id}
        initial={assignInitial}
      />

      {importOpen && <PrinterImportModal onClose={() => setImportOpen(false)} />}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t('common.delete') + ' ' + t('printers.title')}
        description={`${t('common.confirm')} delete "${deleting?.serialNumber}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
