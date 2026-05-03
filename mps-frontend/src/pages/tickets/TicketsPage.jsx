import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, ChevronDown, CheckCircle, Clock, Circle, AlertTriangle, X, Camera, Image, ChevronRight } from 'lucide-react'
import { useBillingCycles, useBillingCycle, useLockPrinter, useUnlockPrinter } from '../../api/hooks/useBillingCycles'
import { useMeterReadings, useSubmitReading } from '../../api/hooks/useMeterReadings'
import { useSubmitConsumableReading } from '../../api/hooks/useConsumableReadings'
import { useCustomerStorage, useUpdateCustomerStorage } from '../../api/hooks/useCustomerStorage'
import { useAssignments } from '../../api/hooks/useAssignments'
import { usePrinters } from '../../api/hooks/usePrinters'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
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

// ── Searchable Cycle Dropdown ────────────────────────────────────────────────

function CycleDropdown({ cycles, value, onChange, t }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = cycles.find(c => c.id === value)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? cycles.filter(c => (c.cycleName ?? '').toLowerCase().includes(q)) : cycles
  }, [cycles, search])

  const grouped = useMemo(() => {
    const g = {}
    for (const c of filtered) {
      const customer = c.customerName ?? c.cycleName?.split(' — ')[0] ?? '—'
      if (!g[customer]) g[customer] = []
      g[customer].push(c)
    }
    return g
  }, [filtered])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-start dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      >
        <span className={selected ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
          {selected ? selected.cycleName : t('tickets.selectCycle')}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900 max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('common.search')}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          <div className="overflow-y-auto">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([customer, customerCycles]) => (
              <div key={customer}>
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50">
                  {customer}
                </div>
                {customerCycles.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onChange(c.id); setOpen(false); setSearch('') }}
                    className={`w-full text-start px-4 py-2 text-sm transition-colors ${
                      c.id === value
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    {c.cycleName}
                  </button>
                ))}
              </div>
            ))}
            {Object.keys(grouped).length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">{t('common.noData')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
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
  const [storageExpanded, setStorageExpanded] = useState(false)
  const [storageFields, setStorageFields] = useState({})
  const [storageInitialized, setStorageInitialized] = useState(false)
  const fileInputRef = useRef(null)
  const isPsg = cycle?.contract?.contractMode === 'psg'
  const customerId = cycle?.contract?.customer?.id
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: storageData = [] } = useCustomerStorage(customerId)

  // Pre-fill storage fields once data loads
  useEffect(() => {
    if (storageData.length > 0 && !storageInitialized) {
      const init = {}
      storageData.forEach(s => {
        init[s.printerModel] = {
          cQty: s.cQty ?? 0,
          mQty: s.mQty ?? 0,
          yQty: s.yQty ?? 0,
          kQty: s.kQty ?? 0,
          r1Qty: s.r1Qty ?? 0,
          r2Qty: s.r2Qty ?? 0,
          r3Qty: s.r3Qty ?? 0,
          r4Qty: s.r4Qty ?? 0,
          wasteTonQty: s.wasteTonQty ?? 0,
          isBwOnly: s.isBwOnly ?? false,
          _original: {
            cQty: s.cQty ?? 0,
            mQty: s.mQty ?? 0,
            yQty: s.yQty ?? 0,
            kQty: s.kQty ?? 0,
            r1Qty: s.r1Qty ?? 0,
            r2Qty: s.r2Qty ?? 0,
            r3Qty: s.r3Qty ?? 0,
            r4Qty: s.r4Qty ?? 0,
            wasteTonQty: s.wasteTonQty ?? 0,
          },
        }
      })
      setStorageFields(init)
      setStorageInitialized(true)
    }
  }, [storageData, storageInitialized])

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

  function removePhoto(i) {
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
  }

  function setConsumable(key, value) {
    setConsumables(prev => ({ ...prev, [key]: value }))
  }

  function setStorageField(model, field, value) {
    setStorageFields(prev => ({
      ...prev,
      [model]: { ...prev[model], [field]: value === '' ? '' : Number(value) },
    }))
  }

  function getStorageChanges() {
    return Object.entries(storageFields)
      .filter(([, fields]) => {
        const orig = fields._original
        return Object.keys(orig).some(k => Number(fields[k]) !== Number(orig[k]))
      })
      .map(([model, fields]) => ({
        printerModel: model,
        cQty: Number(fields.cQty) || 0,
        mQty: Number(fields.mQty) || 0,
        yQty: Number(fields.yQty) || 0,
        kQty: Number(fields.kQty) || 0,
        r1Qty: Number(fields.r1Qty) || 0,
        r2Qty: Number(fields.r2Qty) || 0,
        r3Qty: Number(fields.r3Qty) || 0,
        r4Qty: Number(fields.r4Qty) || 0,
        wasteTonQty: Number(fields.wasteTonQty) || 0,
        isBwOnly: fields.isBwOnly,
      }))
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

  function handleSubmit(e) {
    e.preventDefault()
    const colorRequired = !isBwOnly
    if (!form.a4Bw || !form.a3Bw || (colorRequired && (!form.a4Color || !form.a3Color))) return
    if (photos.length === 0) return

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

    onSubmit(meterPayload, buildConsumablePayload(), getStorageChanges())
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
                {t('consumables.title')}
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
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => { handlePhotoFiles(Array.from(e.target.files)); e.target.value = '' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-brand-500 dark:hover:text-brand-400 transition-colors"
                >
                  <Camera className="h-4 w-4" />
                  {t('meterReadings.addPhoto')}
                  <span className="text-xs text-gray-400 dark:text-gray-500">({photos.length}/5)</span>
                </button>
              </>
            )}
          </div>

          {/* ── Customer Storage (collapsible) ──────────────────────────────── */}
          {storageData.length > 0 && (
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setStorageExpanded(e => !e)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 text-start"
              >
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {t('consumables.storageUpdate')}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('consumables.storageNote')}</p>
                </div>
                {storageExpanded
                  ? <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                }
              </button>

              {storageExpanded && (
                <div className="px-3 py-3 space-y-4">
                  {storageData.map(s => {
                    const modelKey = s.printerModel
                    const fields = storageFields[modelKey] ?? {}
                    const modelConsumables = getConsumablesForPrinter(s.isBwOnly)
                    return (
                      <div key={modelKey}>
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{modelKey}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {modelConsumables.map(c => {
                            const { qtyKey, labelKey } = CONSUMABLE_FIELD_MAP[c]
                            return (
                              <FormField key={c} label={t(labelKey)}>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  step="1"
                                  className={inputCls}
                                  value={fields[qtyKey] ?? 0}
                                  onChange={e => setStorageField(modelKey, qtyKey, e.target.value)}
                                />
                              </FormField>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {error && <ErrorAlert message={error} />}

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

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: openCycles = [] } = useBillingCycles({ status: 'open' })
  const { data: cycle } = useBillingCycle(selectedCycleId, { refetchInterval: selectedCycleId ? 30000 : false })
  const { data: allAssignments = [] } = useAssignments()
  const { data: allPrinters = [] } = usePrinters()
  const { data: cycleReadings = [] } = useMeterReadings(
    selectedCycleId ? { billingCycleId: selectedCycleId } : {},
    { enabled: !!selectedCycleId },
  )

  const lockMutation         = useLockPrinter()
  const unlockMutation       = useUnlockPrinter()
  const submitMutation       = useSubmitReading()
  const consumablesMutation  = useSubmitConsumableReading()
  const storageUpdateMutation = useUpdateCustomerStorage()

  // ── Derived data ──────────────────────────────────────────────────────────
  const printerMap = useMemo(
    () => Object.fromEntries(allPrinters.map(p => [p.id, p])),
    [allPrinters],
  )

  const contractPrinters = useMemo(() => {
    if (!cycle?.contractId) return []
    return allAssignments.filter(
      a => a.contractId === cycle.contractId &&
           (!a.assignedUntil || a.assignedUntil.slice(0, 10) >= today),
    )
  }, [allAssignments, cycle?.contractId])

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

  async function handleSubmit(meterPayload, consumablePayload, storageChanges) {
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

    // Meter reading saved — now submit consumable reading (non-blocking)
    if (consumablePayload && meterReading?.id) {
      try {
        await consumablesMutation.mutateAsync({
          meterReadingId: meterReading.id,
          printerId: meterPayload.printerId,
          billingCycleId: meterPayload.billingCycleId,
          ...consumablePayload,
        })
      } catch {
        showToast({ title: t('consumables.consumableSaveError'), variant: 'warning' })
      }
    }

    // Submit storage updates (non-blocking, per model)
    const customerId = cycle?.contract?.customer?.id
    if (customerId && storageChanges.length > 0) {
      const failed = []
      await Promise.allSettled(
        storageChanges.map(change =>
          storageUpdateMutation.mutateAsync({
            customerId,
            printerModel: change.printerModel,
            billingCycleId: meterPayload.billingCycleId,
            ...change,
          }).catch(() => { failed.push(change.printerModel) }),
        ),
      )
      if (failed.length > 0) {
        showToast({ title: t('consumables.storageSaveError'), variant: 'warning' })
      }
    }

    showToast({
      title: `${t('tickets.submitSuccess')} ${selectedPrinter?.serialNumber}`,
      variant: 'success',
    })
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
            <CycleDropdown cycles={openCycles} value={selectedCycleId} onChange={handleCycleChange} t={t} />
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

          {/* Printer cards */}
          <div className="space-y-2">
            {printerRows.length === 0 && (
              <p className="text-center py-10 text-sm text-gray-400">{t('common.noData')}</p>
            )}
            {printerRows.map(({ printer, assignment, status }) => {
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
                    {/* Lock / check icon */}
                    <div className="flex-shrink-0 w-5 text-center">
                      {status.type === 'submitted' && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {status.type === 'in_progress' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      {status.type === 'you_in_progress' && <Clock className="h-4 w-4 text-blue-500" />}
                    </div>

                    {/* Printer info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{printer.serialNumber}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{printer.model}</span>
                        {printer.isBwOnly && (
                          <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">{t('printers.bwOnlyBadge')}</span>
                        )}
                      </div>
                      {printer.city && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{printer.city}{printer.location ? ` · ${printer.location}` : ''}</p>
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

                    {/* Status badge */}
                    <PrinterStatusBadge status={status} t={t} />
                  </div>

                  {/* Inline submit form for selected printer */}
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
      )}
    </div>
  )
}
