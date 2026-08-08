import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, CheckCircle, Clock, Circle, AlertTriangle, X, Camera, Image, ChevronRight, MapPin, Navigation } from 'lucide-react'
import SearchableSelect from '../../components/SearchableSelect'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { useBillingCycles, useBillingCycle, useLockPrinter, useUnlockPrinter, useSubmitStorage } from '../../api/hooks/useBillingCycles'
import { useMeterReadings, useSubmitReading } from '../../api/hooks/useMeterReadings'
import { useSubmitConsumableReading } from '../../api/hooks/useConsumableReadings'
import { useAssignments } from '../../api/hooks/useAssignments'
import { usePrinters, useUpdatePrinterCoordinates } from '../../api/hooks/usePrinters'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import PinDropModal from '../../components/PinDropModal'
import { fmtDate, fmtDateTime } from '../../utils/format'
import { getConsumablesForPrinter, CONSUMABLE_FIELD_MAP } from '../../utils/consumables'

const today = new Date().toISOString().slice(0, 10)

// ── Helpers ─────────────────────────────────────────────────────────────────

function getPrinterStatus(printerId, submittedIds, locks, currentUserId) {
  if (submittedIds.has(printerId)) return { type: 'submitted' }
  const now = new Date()
  const lock = locks.find(l => l.printerId === printerId && new Date(l.expiresAt) > now)
  if (!lock) return { type: 'not_submitted' }
  if (lock.lockedBy === currentUserId) return { type: 'you_in_progress', lock }
  return { type: 'in_progress', lock }
}

const STATUS_ORDER = { not_submitted: 0, you_in_progress: 1, in_progress: 2, submitted: 3 }

function formatCountdown(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function PrinterStatusBadge({ status, t }) {
  if (status.type === 'submitted') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
        <CheckCircle className="h-3.5 w-3.5" />
        {t('tickets.submitted')}
      </span>
    )
  }
  if (status.type === 'you_in_progress') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
        <Clock className="h-3.5 w-3.5 animate-pulse" />
        {t('tickets.youInProgress')}
      </span>
    )
  }
  if (status.type === 'in_progress') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <Clock className="h-3.5 w-3.5" />
        {t('tickets.lockedBy')} {status.lock.lockedByName}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
      <Circle className="h-3.5 w-3.5" />
      {t('tickets.notSubmitted')}
    </span>
  )
}

// ── Submit Form ───────────────────────────────────────────────────────────────

function SubmitForm({ printer, cycle, assignment, onSubmit, onCancel, isPending, error, lockExpiry, isBwOnly, t }) {
  const [form, setForm] = useState({ a4Bw: '', a3Bw: '', a4Color: '', a3Color: '', xls: '' })
  const [photos, setPhotos] = useState([])
  const [timeLeft, setTimeLeft] = useState(null)
  const [expired, setExpired] = useState(false)
  const [consumables, setConsumables] = useState({})
  const isPsg = cycle?.contract?.contractMode === 'psg'
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── GPS / location state ──────────────────────────────────────────────────
  const [gpsState, setGpsState] = useState('idle') // idle | loading | captured | denied
  const [capturedCoords, setCapturedCoords] = useState(null)
  const [saveLocation, setSaveLocation] = useState(true)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const printerHasCoords = printer.latitude != null && printer.longitude != null

  function captureGPS() {
    if (!navigator.geolocation) { setGpsState('denied'); return }
    setGpsState('loading')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCapturedCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        setGpsState('captured')
      },
      () => setGpsState('denied'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  useEffect(() => {
    if (!lockExpiry) return
    const interval = setInterval(() => {
      const secs = Math.max(0, Math.floor((new Date(lockExpiry) - new Date()) / 1000))
      setTimeLeft(secs)
      if (secs === 0) {
        clearInterval(interval)
        setExpired(true)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lockExpiry])

  function handlePhotoFiles(files) {
    const newPhotos = []
    for (const file of files) {
      if (photos.length + newPhotos.length >= 5) break
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target.result
        const mimeType = file.type || 'image/jpeg'
        const data = dataUrl.replace(/^data:[^;]+;base64,/, '')
        setPhotos(prev => prev.length < 5 ? [...prev, { mimeType, data, preview: dataUrl }] : prev)
      }
      reader.readAsDataURL(file)
      newPhotos.push(file)
    }
  }

  function openCamera() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.setAttribute('capture', 'environment')
    input.style.cssText = 'position:absolute;opacity:0;pointer-events:none;'
    document.body.appendChild(input)
    input.onchange = (e) => {
      if (e.target.files?.length) handlePhotoFiles(Array.from(e.target.files))
      document.body.removeChild(input)
    }
    input.click()
  }

  function openGallery() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.style.cssText = 'position:absolute;opacity:0;pointer-events:none;'
    document.body.appendChild(input)
    input.onchange = (e) => {
      if (e.target.files?.length) handlePhotoFiles(Array.from(e.target.files))
      document.body.removeChild(input)
    }
    input.click()
  }

  function removePhoto(i) {
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
  }

  function setConsumable(key, value) {
    setConsumables(prev => ({ ...prev, [key]: value }))
  }

  function buildConsumablePayload() {
    const keys = Object.keys(consumables).filter(k => consumables[k] !== '' && consumables[k] !== undefined)
    if (keys.length === 0) return null
    const payload = {}
    for (const c of getConsumablesForPrinter(isBwOnly)) {
      const { pctKey } = CONSUMABLE_FIELD_MAP[c]
      const val = consumables[c]
      if (val !== '' && val !== undefined) payload[pctKey] = Number(val)
    }
    return Object.keys(payload).length > 0 ? payload : null
  }

  const [localError, setLocalError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    setLocalError('')
    const colorRequired = !isBwOnly
    if (!form.a4Bw || !form.a3Bw || (colorRequired && (!form.a4Color || !form.a3Color))) return
    if (photos.length === 0) return
    if (!printerHasCoords && !capturedCoords) {
      setLocalError(t('tickets.locationRequired'))
      return
    }
    const missingConsumables = consumableKeys.filter(c => consumables[c] === '' || consumables[c] === undefined)
    if (missingConsumables.length > 0) {
      setLocalError(t('consumables.allRequired'))
      return
    }

    const meterPayload = {
      printerId: printer.id,
      billingCycleId: cycle.id,
      source: 'manual',
      a4Bw: Number(form.a4Bw) || 0,
      a3Bw: Number(form.a3Bw) || 0,
      a4Color: isBwOnly ? 0 : (Number(form.a4Color) || 0),
      a3Color: isBwOnly ? 0 : (Number(form.a3Color) || 0),
      xls: (isPsg && !isBwOnly) ? (Number(form.xls) || 0) : 0,
      photos: photos.map(p => ({ mimeType: p.mimeType, data: p.data })),
    }

    const locationPayload = (gpsState === 'captured' || capturedCoords) && saveLocation
      ? { printerId: printer.id, ...capturedCoords }
      : null

    onSubmit(meterPayload, buildConsumablePayload(), locationPayload)
  }

  const consumableKeys = getConsumablesForPrinter(isBwOnly)

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{printer.serialNumber} — {printer.model}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{cycle.cycleName}</p>
        </div>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Countdown */}
      {timeLeft !== null && !expired && (
        <div className={`px-4 py-2 text-xs flex items-center gap-2 ${
          timeLeft <= 300
            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
            : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
        }`}>
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          {timeLeft <= 300
            ? t('tickets.lockWarning')
            : `Session expires in ${formatCountdown(timeLeft)}`}
        </div>
      )}

      {expired && (
        <div className="px-4 py-3">
          <ErrorAlert message={t('tickets.lockExpired')} />
        </div>
      )}

      {!expired && (
        <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
          {/* BW counters */}
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('meterReadings.bwCounters')}</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('meterReadings.a4Bw')} required>
              <input type="number" inputMode="numeric" min="0" className={inputCls}
                value={form.a4Bw} onChange={e => set('a4Bw', e.target.value)} />
            </FormField>
            <FormField label={t('meterReadings.a3Bw')} required>
              <input type="number" inputMode="numeric" min="0" className={inputCls}
                value={form.a3Bw} onChange={e => set('a3Bw', e.target.value)} />
            </FormField>
          </div>

          {/* Color counters */}
          {isBwOnly ? (
            <div className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 dark:bg-gray-800/50 dark:border-gray-700">
              <span className="text-gray-400 text-xs mt-0.5">ℹ</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('meterReadings.bwOnlyNote')}</p>
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('meterReadings.colorCounters')}</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t('meterReadings.a4Color')} required>
                  <input type="number" inputMode="numeric" min="0" className={inputCls}
                    value={form.a4Color} onChange={e => set('a4Color', e.target.value)} />
                </FormField>
                <FormField label={t('meterReadings.a3Color')} required>
                  <input type="number" inputMode="numeric" min="0" className={inputCls}
                    value={form.a3Color} onChange={e => set('a3Color', e.target.value)} />
                </FormField>
              </div>
              {isPsg && (
                <FormField label={t('meterReadings.xls')}>
                  <input type="number" inputMode="numeric" min="0" className={inputCls}
                    value={form.xls} onChange={e => set('xls', e.target.value)} />
                </FormField>
              )}
            </>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 dark:bg-blue-900/20 dark:border-blue-800/50">
            <Clock className="h-3.5 w-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-400">{t('meterReadings.readAtAutoSet')}</p>
          </div>

          {/* ── Consumable levels ──────────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('consumables.title')} <span className="font-normal normal-case text-red-500">*</span>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('consumables.percentageNote')}</p>
            </div>
            <div className="px-3 py-3 grid grid-cols-2 gap-3">
              {consumableKeys.map(c => {
                const { labelKey } = CONSUMABLE_FIELD_MAP[c]
                return (
                  <FormField key={c} label={t(labelKey)}>
                    <div className="relative">
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="100"
                        step="1"
                        className={inputCls + ' pe-7'}
                        value={consumables[c] ?? ''}
                        onChange={e => setConsumable(c, e.target.value)}
                      />
                      <span className="absolute end-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                    </div>
                  </FormField>
                )
              })}
            </div>
          </div>

          {/* ── Printer location ──────────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('printers.location')}
              </p>
            </div>
            <div className="px-3 py-3">
              {printerHasCoords ? (
                <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <MapPin className="h-4 w-4" />
                  {t('map.locationOnFile')}
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    {t('map.noLocationSet')}
                  </p>

                  {gpsState === 'idle' && (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={captureGPS}
                        className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
                      >
                        <Navigation className="h-4 w-4" />
                        {t('map.captureLocation')}
                      </button>
                      <div className="flex items-center gap-2">
                        <hr className="flex-1 border-gray-200 dark:border-gray-700" />
                        <span className="text-xs text-gray-400">or</span>
                        <hr className="flex-1 border-gray-200 dark:border-gray-700" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setPinModalOpen(true)}
                        className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400"
                      >
                        <MapPin className="h-4 w-4" />
                        {t('map.dropPinAlternative')}
                      </button>
                    </div>
                  )}

                  {gpsState === 'loading' && (
                    <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Clock className="h-4 w-4 animate-spin" />
                      {t('map.gettingLocation')}
                    </p>
                  )}

                  {gpsState === 'captured' && capturedCoords && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        {t('map.locationCaptured')}
                      </p>
                      <div style={{ height: '100px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                        <MapContainer
                          key={`gps-${capturedCoords.latitude}-${capturedCoords.longitude}`}
                          center={[capturedCoords.latitude, capturedCoords.longitude]}
                          zoom={15}
                          zoomControl={false}
                          dragging={false}
                          scrollWheelZoom={false}
                          style={{ height: '100%', width: '100%' }}
                        >
                          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                          <Marker position={[capturedCoords.latitude, capturedCoords.longitude]} />
                        </MapContainer>
                      </div>
                      <p className="text-xs text-gray-400 font-mono">
                        {capturedCoords.latitude.toFixed(6)}, {capturedCoords.longitude.toFixed(6)}
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveLocation}
                          onChange={e => setSaveLocation(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{t('map.saveToRecord')}</span>
                      </label>
                    </div>
                  )}

                  {gpsState === 'denied' && (
                    <div className="space-y-2">
                      <p className="text-sm text-amber-600 dark:text-amber-400">{t('map.locationDenied')}</p>
                      <button
                        type="button"
                        onClick={() => setPinModalOpen(true)}
                        className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400"
                      >
                        <MapPin className="h-4 w-4" />
                        {t('map.dropPinAlternative')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <PinDropModal
            open={pinModalOpen}
            onClose={() => setPinModalOpen(false)}
            onConfirm={({ latitude, longitude }) => {
              setCapturedCoords({ latitude, longitude })
              setGpsState('captured')
            }}
          />

          {/* Photo upload */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t('meterReadings.photos')} <span className="font-normal normal-case text-red-500">*</span></p>
            {photos.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    <img src={p.preview} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-0.5 end-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length < 5 && (
              <>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={openCamera}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-brand-300 px-3 py-2.5 text-sm text-brand-600 hover:border-brand-400 hover:bg-brand-50 dark:border-brand-600 dark:text-brand-400 dark:hover:bg-brand-900/10 transition-colors"
                  >
                    <Camera className="h-4 w-4" />
                    {t('meterReadings.takePhoto')}
                  </button>
                  <button
                    type="button"
                    onClick={openGallery}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-brand-500 dark:hover:text-brand-400 transition-colors"
                  >
                    <Image className="h-4 w-4" />
                    {t('meterReadings.addPhoto')}
                    <span className="text-xs text-gray-400 dark:text-gray-500">({photos.length}/5)</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {(localError || error) && <ErrorAlert message={localError || error} />}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t('tickets.cancelLock')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {isPending ? t('common.loading') : t('meterReadings.submit')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Storage Submit Modal ──────────────────────────────────────────────────────

function StorageSubmitModal({ open, onClose, cycle, contractPrinters, printerMap, onSuccess, t }) {
  const submitStorageMutation = useSubmitStorage()

  const [fields, setFields] = useState({})
  const [location, setLocation] = useState(null) // null = not selected yet
  const [error, setError] = useState('')
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const [unavailableReason, setUnavailableReason] = useState('')

  // Group contract printers by their location field
  const printersByLocation = useMemo(() => {
    const groups = {}
    contractPrinters.forEach(a => {
      const printer = printerMap[a.printerId]
      if (!printer) return
      const loc = printer.location ?? ''
      if (!groups[loc]) groups[loc] = []
      groups[loc].push(printer)
    })
    return groups
  }, [contractPrinters, printerMap])

  // Sorted location options — named locations first, blank last
  const locationOptions = useMemo(() => {
    return Object.keys(printersByLocation).sort((a, b) => {
      if (a === '') return 1
      if (b === '') return -1
      return a.localeCompare(b)
    })
  }, [printersByLocation])

  // Unique models at the selected location, with serial numbers for context
  const modelsAtLocation = useMemo(() => {
    if (location === null) return []
    const printersHere = printersByLocation[location] ?? []
    const modelMap = {}
    printersHere.forEach(p => {
      if (!modelMap[p.model]) {
        modelMap[p.model] = { model: p.model, isBwOnly: p.isBwOnly ?? false, serials: [] }
      }
      if (p.serialNumber) modelMap[p.model].serials.push(p.serialNumber)
    })
    return Object.values(modelMap)
  }, [printersByLocation, location])

  // Reset when modal opens / closes; auto-select if only one location
  useEffect(() => {
    if (!open) { setLocation(null); setFields({}); setError(''); setStorageUnavailable(false); setUnavailableReason(''); return }
    if (locationOptions.length === 1) setLocation(locationOptions[0])
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset fields whenever location changes
  const prevLocationRef = useRef(null)
  useEffect(() => {
    if (prevLocationRef.current === location) return
    prevLocationRef.current = location
    const printersHere = location !== null ? (printersByLocation[location] ?? []) : []
    const seen = new Set()
    const init = {}
    printersHere.forEach(p => {
      if (seen.has(p.model)) return
      seen.add(p.model)
      init[p.model] = { cQty: 0, mQty: 0, yQty: 0, kQty: 0, r1Qty: 0, r2Qty: 0, r3Qty: 0, r4Qty: 0, wasteTonQty: 0, isBwOnly: p.isBwOnly ?? false }
    })
    setFields(init)
  }, [location, printersByLocation])

  function setField(model, key, val) {
    setFields(prev => ({ ...prev, [model]: { ...prev[model], [key]: val === '' ? '' : Number(val) } }))
  }

  async function handleSubmit() {
    setError('')
    if (storageUnavailable) {
      if (!unavailableReason.trim()) { setError(t('tickets.storageUnavailableReasonRequired')); return }
      try {
        await submitStorageMutation.mutateAsync({ id: cycle.id, storageUnavailableReason: unavailableReason.trim() })
        onSuccess()
        onClose()
      } catch (err) {
        const data = err.response?.data
        if (err.response?.status === 409) {
          setError(`${t('tickets.storageAlreadySubmitted')} — ${t('tickets.storageSubmittedBy')} ${data?.submittedByName ?? ''}`)
        } else {
          setError(data?.error || err.message)
        }
      }
      return
    }
    if (location === null) { setError(t('tickets.storageBranchRequired')); return }
    const storageUpdates = Object.entries(fields).map(([printerModel, f]) => ({
      printerModel,
      location,
      cQty: Number(f.cQty) || 0, mQty: Number(f.mQty) || 0,
      yQty: Number(f.yQty) || 0, kQty: Number(f.kQty) || 0,
      r1Qty: Number(f.r1Qty) || 0, r2Qty: Number(f.r2Qty) || 0,
      r3Qty: Number(f.r3Qty) || 0, r4Qty: Number(f.r4Qty) || 0,
      wasteTonQty: Number(f.wasteTonQty) || 0,
    }))
    try {
      await submitStorageMutation.mutateAsync({ id: cycle.id, storageUpdates })
      onSuccess()
      onClose()
    } catch (err) {
      const data = err.response?.data
      if (err.response?.status === 409) {
        setError(`${t('tickets.storageAlreadySubmitted')} — ${t('tickets.storageSubmittedBy')} ${data?.submittedByName ?? ''}`)
      } else {
        setError(data?.error || err.message)
      }
    }
  }

  if (!open) return null

  const allConsumablesByModel = [
    { key: 'cQty',        label: 'Cyan (C)',    colorOnly: true },
    { key: 'mQty',        label: 'Magenta (M)', colorOnly: true },
    { key: 'yQty',        label: 'Yellow (Y)',  colorOnly: true },
    { key: 'kQty',        label: 'Black (K)',   colorOnly: false },
    { key: 'r1Qty',       label: 'Drum R1',     colorOnly: false },
    { key: 'r2Qty',       label: 'Drum R2',     colorOnly: false },
    { key: 'r3Qty',       label: 'Drum R3',     colorOnly: false },
    { key: 'r4Qty',       label: 'Drum R4',     colorOnly: false },
    { key: 'wasteTonQty', label: 'Waste Toner', colorOnly: false },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('tickets.storageSubmitTitle')}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{cycle?.cycleName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('tickets.storageSubmitNote')}</p>

          {/* Storage unavailable toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-700/60 dark:bg-amber-900/10">
            <input
              type="checkbox"
              checked={storageUnavailable}
              onChange={e => setStorageUnavailable(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">{t('tickets.storageUnavailable')}</span>
          </label>

          {storageUnavailable ? (
            <FormField label={t('tickets.storageUnavailableReason')} required>
              <textarea
                className={inputCls + ' min-h-[90px] resize-none'}
                value={unavailableReason}
                onChange={e => setUnavailableReason(e.target.value)}
                placeholder={t('tickets.storageUnavailableReasonPlaceholder')}
              />
            </FormField>
          ) : (
            <>
          {/* Branch / Location dropdown */}
          <FormField label={t('tickets.storageBranch')} required>
            <select
              className={inputCls}
              value={location ?? ''}
              onChange={e => setLocation(e.target.value)}
            >
              <option value="" disabled>{t('tickets.storageBranchPlaceholder')}</option>
              {locationOptions.map(loc => (
                <option key={loc || '__none__'} value={loc}>
                  {loc || t('consumables.storageMainBranch')}
                </option>
              ))}
            </select>
          </FormField>

          {/* Models at selected location */}
          {location === null ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6 italic">
              {t('tickets.selectLocationFirst')}
            </p>
          ) : modelsAtLocation.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">{t('common.noData')}</p>
          ) : (
            modelsAtLocation.map(m => {
              const modelFields = fields[m.model] ?? {}
              const modelConsumables = allConsumablesByModel.filter(c => !c.colorOnly || !m.isBwOnly)
              return (
                <div key={m.model} className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{m.model}</p>
                    {m.serials.length > 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{m.serials.join(' · ')}</p>
                    )}
                  </div>
                  <div className="px-3 py-3 grid grid-cols-2 gap-2">
                    {modelConsumables.map(c => (
                      <FormField key={c.key} label={c.label}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          className={inputCls}
                          value={modelFields[c.key] ?? 0}
                          onChange={e => setField(m.model, c.key, e.target.value)}
                        />
                      </FormField>
                    ))}
                  </div>
                </div>
              )
            })
          )}
            </>
          )}

          {error && <ErrorAlert message={error} />}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitStorageMutation.isPending || (!storageUnavailable && (location === null || modelsAtLocation.length === 0))}
            className="flex-1 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {submitStorageMutation.isPending ? t('common.loading') : t('tickets.submitStorage')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()

  const [selectedCycleId, setSelectedCycleId] = useState('')
  const [serialQuery, setSerialQuery] = useState('')
  const [serialError, setSerialError] = useState('')
  const [printerFilter, setPrinterFilter] = useState('')
  const [selectedPrinterId, setSelectedPrinterId] = useState(null)
  const [lockExpiry, setLockExpiry] = useState(null)
  const [lockAcquiredAt, setLockAcquiredAt] = useState(null)
  const [lockError, setLockError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [storageModalOpen, setStorageModalOpen] = useState(false)

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: openCycles = [] } = useBillingCycles({ status: 'open' })
  const { data: cycle } = useBillingCycle(selectedCycleId, { refetchInterval: selectedCycleId ? 30000 : false })
  const { data: allAssignments = [] } = useAssignments()
  const { data: allPrinters = [] } = usePrinters()
  const { data: cycleReadings = [] } = useMeterReadings(
    selectedCycleId ? { billingCycleId: selectedCycleId } : {},
    { enabled: !!selectedCycleId },
  )

  const lockMutation        = useLockPrinter()
  const unlockMutation      = useUnlockPrinter()
  const submitMutation      = useSubmitReading()
  const consumablesMutation = useSubmitConsumableReading()
  const coordsMutation      = useUpdatePrinterCoordinates()
  const storageSubmitMutation = useSubmitStorage()

  // ── Derived data ──────────────────────────────────────────────────────────
  const printerMap = useMemo(
    () => Object.fromEntries(allPrinters.map(p => [p.id, p])),
    [allPrinters],
  )

  const contractPrinters = useMemo(() => {
    if (!cycle?.contractId) return []
    // Use the cycle's period start as the reference so printers that were
    // active when the cycle opened remain submittable even if assignedUntil
    // has since passed (e.g. an assignment that ended with the prior month).
    const ref = cycle.periodStart?.slice(0, 10) ?? today
    return allAssignments.filter(
      a => a.contractId === cycle.contractId &&
           (!a.assignedUntil || a.assignedUntil.slice(0, 10) >= ref),
    )
  }, [allAssignments, cycle?.contractId, cycle?.periodStart])

  const submittedIds = useMemo(
    () => new Set(cycleReadings.map(r => r.printerId)),
    [cycleReadings],
  )

  const readingByPrinterId = useMemo(
    () => Object.fromEntries(cycleReadings.map(r => [r.printerId, r])),
    [cycleReadings],
  )

  const activeLocks = useMemo(
    () => (cycle?.lockedPrinters ?? []).filter(l => new Date(l.expiresAt) > new Date()),
    [cycle?.lockedPrinters],
  )

  const printerRows = useMemo(() => {
    const q = printerFilter.toLowerCase()
    return contractPrinters
      .map(a => {
        const printer = printerMap[a.printerId]
        if (!printer) return null
        if (q && !printer.serialNumber.toLowerCase().includes(q) && !printer.model.toLowerCase().includes(q)) return null
        const status = getPrinterStatus(printer.id, submittedIds, activeLocks, user?.id)
        return { printer, assignment: a, status }
      })
      .filter(Boolean)
      .sort((a, b) => STATUS_ORDER[a.status.type] - STATUS_ORDER[b.status.type])
  }, [contractPrinters, printerMap, submittedIds, activeLocks, printerFilter, user?.id])

  const cityGroups = useMemo(() => {
    const groups = {}
    for (const row of printerRows) {
      const city = row.printer.city || '—'
      if (!groups[city]) groups[city] = []
      groups[city].push(row)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [printerRows])

  const isMultiCity = cityGroups.length > 1

  const selectedPrinter = selectedPrinterId ? printerMap[selectedPrinterId] : null
  const selectedAssignment = selectedPrinterId
    ? contractPrinters.find(a => a.printerId === selectedPrinterId)
    : null

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleCycleChange(id) {
    setSelectedCycleId(id)
    setSelectedPrinterId(null)
    setLockExpiry(null)
    setLockError('')
    setSubmitError('')
    setPrinterFilter('')
    setSerialError('')
  }

  async function handleSelectPrinterCard(printer, status) {
    if (status.type === 'submitted' || status.type === 'in_progress') return
    setLockError('')
    setSubmitError('')
    try {
      const result = await lockMutation.mutateAsync({ cycleId: selectedCycleId, printerId: printer.id })
      setSelectedPrinterId(printer.id)
      setLockExpiry(result.expiresAt)
      setLockAcquiredAt(result.lockedAt ?? new Date().toISOString())
    } catch (err) {
      const data = err.response?.data
      if (err.response?.status === 423) {
        setLockError(`${t('tickets.lockedError')} ${data?.lockedBy ?? ''}`)
      } else {
        setLockError(data?.error || err.message)
      }
    }
  }

  async function handleCancel() {
    if (selectedPrinterId && selectedCycleId) {
      try {
        await unlockMutation.mutateAsync({ cycleId: selectedCycleId, printerId: selectedPrinterId })
      } catch {} // silent — lock expires naturally
    }
    setSelectedPrinterId(null)
    setLockExpiry(null)
    setLockAcquiredAt(null)
    setSubmitError('')
  }

  async function handleSubmit(meterPayload, consumablePayload, locationPayload) {
    setSubmitError('')
    let meterReading
    try {
      meterReading = await submitMutation.mutateAsync({ ...meterPayload, lockAcquiredAt })
    } catch (err) {
      const data = err.response?.data
      if (err.response?.status === 423) {
        setSubmitError(`${t('tickets.lockedError')} ${data?.lockedBy ?? ''}`)
      } else {
        setSubmitError(data?.error || err.message)
      }
      return
    }

    // Consumable reading — saved separately, non-blocking but errors are surfaced
    let consumablesSaved = false
    if (consumablePayload && meterReading?.id) {
      try {
        await consumablesMutation.mutateAsync({
          meterReadingId: meterReading.id,
          printerId: meterPayload.printerId,
          billingCycleId: meterPayload.billingCycleId,
          ...consumablePayload,
        })
        consumablesSaved = true
      } catch (err) {
        const msg = err.response?.data?.error || t('consumables.consumableSaveError')
        showToast({ title: msg, variant: 'warning' })
      }
    }

    const successMsg = consumablePayload
      ? `${t('tickets.submitSuccess')} ${selectedPrinter?.serialNumber}${consumablesSaved ? ` · ${t('consumables.levelsSaved')}` : ''}`
      : `${t('tickets.submitSuccess')} ${selectedPrinter?.serialNumber}`
    showToast({ title: successMsg, variant: 'success' })

    // Save printer coordinates if captured
    if (locationPayload) {
      try {
        await coordsMutation.mutateAsync({
          id: locationPayload.printerId,
          latitude: locationPayload.latitude,
          longitude: locationPayload.longitude,
        })
        showToast({ title: t('map.locationSaved'), variant: 'success' })
      } catch {
        showToast({ title: t('map.locationSaveError'), variant: 'warning' })
      }
    }

    setSelectedPrinterId(null)
    setLockExpiry(null)
    setLockAcquiredAt(null)
  }

  async function handleSerialSearch() {
    setSerialError('')
    const q = serialQuery.trim().toLowerCase()
    if (!q) return
    const found = allPrinters.find(p => p.serialNumber.toLowerCase() === q)
    if (!found) { setSerialError(t('tickets.printerNotFound')); return }

    const assignment = allAssignments.find(
      a => a.printerId === found.id && (!a.assignedUntil || a.assignedUntil.slice(0, 10) >= today),
    )
    if (!assignment) { setSerialError(t('tickets.printerNotFound')); return }

    const openCycle = openCycles.find(c => c.contractId === assignment.contractId)
    if (!openCycle) { setSerialError(t('tickets.noOpenCycle')); return }

    handleCycleChange(openCycle.id)
    setSerialQuery('')
  }

  const cardCls = (status) => {
    const base = 'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors'
    if (status.type === 'submitted') return `${base} border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/20 opacity-60 cursor-default`
    if (status.type === 'in_progress') return `${base} border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-900/10 cursor-default`
    if (status.type === 'you_in_progress') return `${base} border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30`
    return `${base} border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 cursor-pointer hover:border-brand-300 hover:bg-brand-50/30 dark:hover:border-brand-600 dark:hover:bg-brand-900/10`
  }

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">{t('tickets.title')}</h1>

      {/* Step 1 — Cycle selection */}
      {!selectedCycleId && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('nav.billingCycles')}</p>
            <SearchableSelect
              value={selectedCycleId || null}
              onChange={v => handleCycleChange(v ?? '')}
              clearable={false}
              placeholder={t('tickets.selectCycle')}
              options={openCycles.map(c => ({
                value: c.id,
                label: c.cycleName ?? c.contractNumber,
                group: c.customerName ?? c.cycleName?.split(' — ')[0] ?? '',
              }))}
            />
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 italic">
              ℹ {t('tickets.openCyclesOnly')}{' '}
              <span className="not-italic">{t('tickets.viewPastReadings')}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <hr className="flex-1 border-gray-200 dark:border-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500">{t('tickets.searchBySerial')}</span>
            <hr className="flex-1 border-gray-200 dark:border-gray-700" />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 p-4 shadow-sm space-y-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('printers.serialNumber')}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={serialQuery}
                onChange={e => { setSerialQuery(e.target.value); setSerialError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSerialSearch()}
                placeholder={t('printers.serialNumber') + '...'}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <button
                onClick={handleSerialSearch}
                className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
              >
                <Search className="h-4 w-4" />
                {t('tickets.search')}
              </button>
            </div>
            {serialError && <ErrorAlert message={serialError} />}
          </div>
        </div>
      )}

      {/* Step 2 — Cycle selected: printer list */}
      {selectedCycleId && cycle && (
        <div className="space-y-4">
          {/* Cycle header with change option */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{cycle.cycleName}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{fmtDate(cycle.periodStart)} → {fmtDate(cycle.periodEnd)}</p>
            </div>
            <button
              onClick={() => handleCycleChange('')}
              className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium"
            >
              {t('common.back')}
            </button>
          </div>

          {/* Search printers */}
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={printerFilter}
              onChange={e => setPrinterFilter(e.target.value)}
              placeholder={t('printers.serialNumber') + ' / ' + t('printers.model') + '...'}
              className="w-full rounded-lg border border-gray-300 ps-9 pe-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          {lockError && <ErrorAlert message={lockError} />}

          {/* Printer cards — grouped by city when multi-city */}
          <div className="space-y-4" id="printer-cards">
            {printerRows.length === 0 && (
              <p className="text-center py-10 text-sm text-gray-400">{t('common.noData')}</p>
            )}
            {cityGroups.map(([city, rows]) => {
              const citySubmitted = rows.filter(r => r.status.type === 'submitted').length
              const cityTotal = rows.length
              const cityPct = cityTotal > 0 ? Math.round((citySubmitted / cityTotal) * 100) : 0
              return (
                <div key={city}>
                  {/* City header — only shown for multi-city */}
                  {isMultiCity && (
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        <ChevronRight className="h-3.5 w-3.5 text-brand-500" />
                        📍 {city}
                        <span className="font-normal text-gray-400">({cityTotal})</span>
                      </div>
                      <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${cityPct}%`, backgroundColor: cityPct === 100 ? '#10B981' : cityPct > 0 ? '#F59E0B' : '#D1D5DB' }}
                        />
                      </div>
                      <span className="text-xs font-mono text-gray-400 whitespace-nowrap">
                        {citySubmitted}/{cityTotal}
                        {cityPct === 100 ? ' ✓' : ''}
                      </span>
                    </div>
                  )}

                  <div className="space-y-2">
                    {rows.map(({ printer, assignment, status }) => {
                      const isSelected = printer.id === selectedPrinterId
                      const submittedReading = status.type === 'submitted' ? readingByPrinterId[printer.id] : null
                      return (
                        <div key={assignment.id}>
                          <div
                            className={cardCls(status)}
                            onClick={() => handleSelectPrinterCard(printer, status)}
                            role={status.type === 'not_submitted' || status.type === 'you_in_progress' ? 'button' : undefined}
                            tabIndex={status.type === 'not_submitted' || status.type === 'you_in_progress' ? 0 : undefined}
                            onKeyDown={e => e.key === 'Enter' && handleSelectPrinterCard(printer, status)}
                          >
                            <div className="flex-shrink-0 w-5 text-center">
                              {status.type === 'submitted' && <CheckCircle className="h-4 w-4 text-green-500" />}
                              {status.type === 'in_progress' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                              {status.type === 'you_in_progress' && <Clock className="h-4 w-4 text-blue-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{printer.serialNumber}</span>
                                <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{printer.model}</span>
                                {printer.isBwOnly && (
                                  <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">{t('printers.bwOnlyBadge')}</span>
                                )}
                              </div>
                              {!isMultiCity && printer.city && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{printer.city}{printer.location ? ` · ${printer.location}` : ''}</p>
                              )}
                              {isMultiCity && printer.location && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{printer.location}</p>
                              )}
                              {submittedReading && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1.5">
                                  {submittedReading.submittedByName && <span>{submittedReading.submittedByName}</span>}
                                  {submittedReading.submittedAt && <span>· {fmtDateTime(submittedReading.submittedAt)}</span>}
                                  {submittedReading.photos?.length > 0 && (
                                    <span className="flex items-center gap-0.5">· <Image className="h-3 w-3" /> {submittedReading.photos.length}</span>
                                  )}
                                </p>
                              )}
                            </div>
                            <PrinterStatusBadge status={status} t={t} />
                          </div>
                          {isSelected && selectedPrinter && cycle && (
                            <div className="mt-2">
                              <SubmitForm
                                printer={selectedPrinter}
                                cycle={cycle}
                                assignment={selectedAssignment}
                                onSubmit={handleSubmit}
                                onCancel={handleCancel}
                                isPending={submitMutation.isPending}
                                error={submitError}
                                lockExpiry={lockExpiry}
                                isBwOnly={selectedPrinter?.isBwOnly ?? false}
                                t={t}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Submit Storage ─────────────────────────────────────────────── */}
          {cycle?.contract?.customer?.id && (
            <div className="mt-4">
              <div className="flex items-center gap-3 mb-3">
                <hr className="flex-1 border-gray-200 dark:border-gray-700" />
                <span className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">
                  {t('consumables.title')}
                </span>
                <hr className="flex-1 border-gray-200 dark:border-gray-700" />
              </div>

              {cycle.storageSubmitted ? (
                <div className={`rounded-xl border px-4 py-3 ${cycle.storageUnavailableReason
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-900/10'
                  : 'border-green-200 bg-green-50 dark:border-green-800/50 dark:bg-green-900/10'}`}>
                  <p className={`flex items-center gap-2 text-sm font-medium ${cycle.storageUnavailableReason
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-green-700 dark:text-green-400'}`}>
                    <CheckCircle className="h-4 w-4" />
                    {cycle.storageUnavailableReason ? t('tickets.storageUnavailableNote') : t('tickets.storageSubmitted')}
                  </p>
                  {cycle.storageUnavailableReason && (
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 italic">"{cycle.storageUnavailableReason}"</p>
                  )}
                  {cycle.storageSubmittedByName && (
                    <p className={`text-xs mt-1 ${cycle.storageUnavailableReason ? 'text-amber-600 dark:text-amber-500' : 'text-green-600 dark:text-green-500'}`}>
                      {t('tickets.storageSubmittedBy')} {cycle.storageSubmittedByName}
                      {cycle.storageSubmittedAt && (
                        <span> · {new Date(cycle.storageSubmittedAt).toLocaleString()}</span>
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setStorageModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-4 py-3 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 dark:hover:border-brand-500 dark:hover:text-brand-400 transition-colors"
                >
                  📦 {t('tickets.submitStorage')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Storage modal */}
      {selectedCycleId && cycle && (
        <StorageSubmitModal
          open={storageModalOpen}
          onClose={() => setStorageModalOpen(false)}
          cycle={cycle}
          contractPrinters={contractPrinters}
          printerMap={printerMap}
          onSuccess={() => showToast({ title: t('tickets.storageSubmitSuccess'), variant: 'success' })}
          t={t}
        />
      )}
    </div>
  )
}
