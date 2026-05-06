import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Pencil, UserPlus, RefreshCw, X, MapPin } from 'lucide-react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { usePrinter, useUpdatePrinterCoordinates } from '../../api/hooks/usePrinters'
import { useAssignments, useUpdateAssignment } from '../../api/hooks/useAssignments'
import { useContract } from '../../api/hooks/useContracts'
import { useDocTitle } from '../../hooks/useDocTitle'
import { useToast } from '../../components/Toast'
import PageHeader from '../../components/PageHeader'
import Breadcrumb from '../../components/Breadcrumb'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import EmptyState from '../../components/EmptyState'
import ConfirmDialog from '../../components/ConfirmDialog'
import PinDropModal from '../../components/PinDropModal'
import PrinterFormModal from './PrinterFormModal'
import PrinterAssignModal from './PrinterAssignModal'
import { formatAmount } from '../../utils/currency'
import { fmtDate } from '../../utils/format'

const today = new Date().toISOString().slice(0, 10)

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{value ?? '—'}</span>
    </div>
  )
}

function PriceRow({ label, override, contractVal }) {
  const hasOverride = override !== null && override !== undefined && override !== ''
  const value = hasOverride ? override : contractVal
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {value !== null && value !== undefined ? formatAmount(Number(value)) : '—'}
        </span>
        {hasOverride
          ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">override</span>
          : <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400 dark:bg-gray-800 dark:text-gray-500">contract</span>
        }
      </div>
    </div>
  )
}

export default function PrinterDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const { data: printer, isLoading } = usePrinter(id)
  const { data: assignments = [] } = useAssignments({ printerId: id })
  const updateAssignment = useUpdateAssignment()

  const updateCoords = useUpdatePrinterCoordinates()
  const [editing, setEditing] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [pinModalOpen, setPinModalOpen] = useState(false)

  async function handleUpdateCoordinates({ latitude, longitude }) {
    try {
      await updateCoords.mutateAsync({ id, latitude, longitude })
      showToast({ variant: 'success', title: t('map.locationSaved') })
    } catch (err) {
      showToast({ variant: 'error', title: err.response?.data?.error || err.message })
    }
  }

  useDocTitle(printer?.serialNumber)

  // Sort assignments newest-first; find active one
  const sortedAssignments = useMemo(() =>
    [...assignments].sort((a, b) =>
      new Date(b.assignedFrom) - new Date(a.assignedFrom)
    ), [assignments])

  const activeAssignment = useMemo(() =>
    sortedAssignments.find(a => !a.assignedUntil || a.assignedUntil.slice(0, 10) >= today) ?? null,
    [sortedAssignments])

  const { data: contract } = useContract(activeAssignment?.contractId)

  async function handleEndAssignment() {
    try {
      await updateAssignment.mutateAsync({ id: activeAssignment.id, assignedUntil: today })
      setConfirmEnd(false)
      showToast({ variant: 'success', title: 'Assignment ended' })
    } catch (err) {
      showToast({ variant: 'error', title: err.response?.data?.error || err.message })
    }
  }

  if (isLoading) return <LoadingSpinner className="py-20" />
  if (!printer) return <p className="text-gray-500 p-6">{t('common.noData')}</p>

  return (
    <div>
      <Breadcrumb items={[{ label: t('nav.printers'), to: '/printers' }, { label: printer.serialNumber }]} />
      <PageHeader
        title={printer.serialNumber}
        subtitle={
          <span className="flex items-center gap-2">
            {printer.model}
            {printer.isBwOnly && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {t('printers.bwOnlyBadge')}
              </span>
            )}
          </span>
        }
        actions={
          <div className="flex gap-2">
            <button onClick={() => navigate(-1)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:text-gray-300">
              <ArrowLeft className="h-4 w-4" />{t('common.back')}
            </button>
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              <Pencil className="h-4 w-4" />{t('common.edit')}
            </button>
          </div>
        }
      />

      <div className="space-y-6">
        {/* Top row: printer info + current assignment */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Printer info */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t('printers.title')}
            </h2>
            <InfoRow label={t('printers.serialNumber')} value={printer.serialNumber} />
            <InfoRow label={t('printers.model')} value={printer.model} />
            <InfoRow label={t('printers.city')} value={printer.city} />
            <InfoRow label={t('printers.location')} value={printer.location} />
            <InfoRow label={t('printers.xsmDeviceId')} value={printer.xsmDeviceId} />
            <InfoRow label={t('printers.xsmEnabled')} value={<StatusBadge status={printer.xsmEnabled} />} />
            <InfoRow label={t('printers.isBwOnly')} value={<StatusBadge status={printer.isBwOnly} />} />
            <InfoRow label={t('printers.lastSeen')} value={fmtDate(printer.lastSeenAt)} />
          </div>

          {/* Current assignment */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Current Assignment
              </h2>
              {activeAssignment ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setAssignModalOpen(true)}
                    className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400 dark:hover:text-brand-400"
                  >
                    <RefreshCw className="h-3 w-3" /> Reassign
                  </button>
                  <button
                    onClick={() => setConfirmEnd(true)}
                    className="flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20"
                  >
                    <X className="h-3 w-3" /> End Assignment
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAssignModalOpen(true)}
                  className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400 dark:hover:text-brand-400"
                >
                  <UserPlus className="h-3 w-3" /> Assign
                </button>
              )}
            </div>

            {activeAssignment ? (
              <div>
                <InfoRow
                  label="Customer"
                  value={
                    <Link to={`/contracts/${activeAssignment.contractId}`}
                      className="text-brand-600 hover:underline dark:text-brand-400">
                      {activeAssignment.contract?.customerName ?? '—'}
                    </Link>
                  }
                />
                <InfoRow
                  label={t('contracts.contractNumber')}
                  value={
                    <Link to={`/contracts/${activeAssignment.contractId}`}
                      className="text-brand-600 hover:underline dark:text-brand-400">
                      {activeAssignment.contract?.contractNumber ?? '—'}
                    </Link>
                  }
                />
                <InfoRow
                  label={t('assignments.printerType')}
                  value={
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-400">
                      {activeAssignment.contractType?.toUpperCase()}
                    </span>
                  }
                />
                <InfoRow label={t('assignments.assignedFrom')} value={fmtDate(activeAssignment.assignedFrom)} />
                <PriceRow
                  label={t('contracts.fixedCharge')}
                  override={activeAssignment.fixedCharge}
                  contractVal={contract?.fixedCharge}
                />
                <PriceRow
                  label={t('contracts.bwPrice')}
                  override={activeAssignment.bwPrice}
                  contractVal={contract?.bwPrice}
                />
                <PriceRow
                  label={t('contracts.colorPrice')}
                  override={activeAssignment.colorPrice}
                  contractVal={contract?.colorPrice}
                />
              </div>
            ) : (
              <EmptyState title="No active contract assigned" />
            )}
          </div>
        </div>

        {/* Location card */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t('printers.location')}
            </h2>
            <button
              onClick={() => setPinModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400 dark:hover:text-brand-400"
            >
              <MapPin className="h-3.5 w-3.5" />
              {printer.latitude ? t('map.updateLocation') : t('map.addLocation')}
            </button>
          </div>
          <InfoRow label={t('printers.city')} value={printer.city} />
          <InfoRow label={t('printers.location')} value={printer.location} />
          {printer.latitude != null && printer.longitude != null ? (
            <>
              <div style={{ height: '200px', borderRadius: '8px', overflow: 'hidden', margin: '12px 0', border: '1px solid #e5e7eb' }}>
                <MapContainer
                  key={`${printer.latitude}-${printer.longitude}`}
                  center={[printer.latitude, printer.longitude]}
                  zoom={14}
                  zoomControl={false}
                  dragging={false}
                  scrollWheelZoom={false}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[printer.latitude, printer.longitude]} />
                </MapContainer>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                {printer.latitude.toFixed(6)}, {printer.longitude.toFixed(6)}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">{t('map.noLocationSet')}</p>
          )}
        </div>

        <PinDropModal
          open={pinModalOpen}
          onClose={() => setPinModalOpen(false)}
          onConfirm={handleUpdateCoordinates}
          initialLatitude={printer.latitude ?? undefined}
          initialLongitude={printer.longitude ?? undefined}
        />

        {/* Assignment history */}
        {sortedAssignments.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Assignment History
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 uppercase">
                    <th className="px-5 py-3 text-start font-medium">Customer</th>
                    <th className="px-5 py-3 text-start font-medium">{t('contracts.contractNumber')}</th>
                    <th className="px-5 py-3 text-start font-medium">{t('assignments.printerType')}</th>
                    <th className="px-5 py-3 text-start font-medium">{t('assignments.assignedFrom')}</th>
                    <th className="px-5 py-3 text-start font-medium">{t('assignments.assignedUntil')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAssignments.map(a => {
                    const isActive = !a.assignedUntil || a.assignedUntil.slice(0, 10) >= today
                    return (
                      <tr
                        key={a.id}
                        className={`border-b border-gray-50 dark:border-gray-800/50 last:border-0 ${
                          isActive
                            ? 'bg-brand-50/50 dark:bg-brand-900/10'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                        }`}
                      >
                        <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {a.contract?.customerName ?? '—'}
                          {isActive && (
                            <span className="ms-2 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <Link to={`/contracts/${a.contractId}`}
                            className="text-brand-600 hover:underline dark:text-brand-400">
                            {a.contract?.contractNumber ?? '—'}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                          {a.contractType?.toUpperCase()}
                        </td>
                        <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                          {fmtDate(a.assignedFrom)}
                        </td>
                        <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                          {a.assignedUntil ? fmtDate(a.assignedUntil) : <span className="text-gray-400 dark:text-gray-500">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <PrinterFormModal open={editing} onClose={() => setEditing(false)} initial={printer} />

      <PrinterAssignModal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        printerId={id}
        initial={activeAssignment}
      />

      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={handleEndAssignment}
        title="End Assignment"
        description={`End the current assignment for "${printer.serialNumber}"? This will set the end date to today.`}
        loading={updateAssignment.isPending}
      />
    </div>
  )
}
