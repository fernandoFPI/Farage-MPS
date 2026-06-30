import { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Clock, Camera, ImagePlus, X } from 'lucide-react'
import { useBillingCycles } from '../../api/hooks/useBillingCycles'
import { useAssignments } from '../../api/hooks/useAssignments'
import { useSubmitReading } from '../../api/hooks/useMeterReadings'
import { useToast } from '../../components/Toast'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import { fmtDate } from '../../utils/format'

const mobileInputCls = [
  'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900',
  'placeholder-gray-400 transition min-h-[48px]',
  'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
  'disabled:bg-gray-50 disabled:text-gray-400',
  'dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500',
  'dark:disabled:bg-gray-900',
].join(' ')

const empty = { billingCycleId: '', printerId: '', a4Bw: '', a3Bw: '', a4Color: '', a3Color: '', xls: '' }

function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</span>
      <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
    </div>
  )
}

export default function SubmitReadingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [form, setForm] = useState(empty)
  const [photos, setPhotos] = useState([])
  const [error, setError] = useState('')
  const submit = useSubmitReading()

  const { data: cycles = [] } = useBillingCycles({ status: 'open' })
  const selectedCycle = cycles.find(c => c.id === form.billingCycleId)
  const { data: assignments = [] } = useAssignments(
    selectedCycle ? { contractId: selectedCycle.contractId } : {},
  )
  const selectedAssignment = assignments.find(a => a.printerId === form.printerId)
  const isPsg = selectedCycle?.contract?.contractMode === 'psg'
  const isBwOnly = selectedAssignment?.printer?.isBwOnly ?? false

  const groupedCycles = useMemo(() => {
    const groups = {}
    for (const cycle of cycles) {
      const key = cycle.contract?.contractNumber || cycle.contractNumber || '—'
      if (!groups[key]) groups[key] = []
      groups[key].push(cycle)
    }
    return groups
  }, [cycles])

  function fmtPeriod(cycle) {
    const start = cycle.periodStart ? fmtDate(cycle.periodStart) : '?'
    const end = cycle.periodEnd ? fmtDate(cycle.periodEnd) : '?'
    return `${start} → ${end}`
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleCycleChange(cycleId) {
    setForm(f => ({ ...f, billingCycleId: cycleId, printerId: '' }))
  }

  function handlePrinterChange(printerId) {
    setForm(f => ({ ...f, printerId, xls: '' }))
  }

  function counterInput(key, label) {
    return (
      <FormField key={key} label={label}>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          className={mobileInputCls}
          value={form[key]}
          onChange={e => set(key, e.target.value)}
          placeholder="0"
        />
      </FormField>
    )
  }

  function handlePhotoFiles(files) {
    for (const file of files) {
      if (photos.length >= 5) break
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target.result
        const mimeType = file.type || 'image/jpeg'
        const data = dataUrl.replace(/^data:[^;]+;base64,/, '')
        setPhotos(prev => prev.length < 5 ? [...prev, { mimeType, data, preview: dataUrl }] : prev)
      }
      reader.readAsDataURL(file)
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

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.billingCycleId || !form.printerId) {
      return setError(t('meterReadings.requiredFields'))
    }
    if (photos.length === 0) {
      return setError(t('meterReadings.photoRequired'))
    }
    setError('')
    try {
      const payload = {
        billingCycleId: form.billingCycleId,
        printerId: form.printerId,
        a4Bw: Number(form.a4Bw) || 0,
        a3Bw: Number(form.a3Bw) || 0,
        a4Color: isBwOnly ? 0 : (Number(form.a4Color) || 0),
        a3Color: isBwOnly ? 0 : (Number(form.a3Color) || 0),
        xls: (isPsg && !isBwOnly) ? (Number(form.xls) || 0) : 0,
        source: 'manual',
        photos: photos.map(p => ({ mimeType: p.mimeType, data: p.data })),
      }
      const result = await submit.mutateAsync(payload)

      const desc = result.isBaseline
        ? 'Baseline reading saved — nothing billed this period'
        : `BW: ${result.billableBw ?? 0} | Color: ${result.billableColor ?? 0}`

      showToast({
        title: t('meterReadings.submitSuccess'),
        description: desc,
        variant: 'success',
      })

      if (result.flagged) {
        showToast({
          title: t('meterReadings.flaggedWarning'),
          description: result.flagReason,
          variant: 'warning',
          duration: 8000,
        })
      }

      setPhotos([])
      setForm(f => ({ ...empty, billingCycleId: f.billingCycleId }))
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('meterReadings.submit')}</h1>
        </div>
      </div>

      {/* Form */}
      <form id="submit-reading-form" onSubmit={handleSubmit} className="mx-auto max-w-lg px-4 pb-28 pt-5 space-y-5">

        <FormField label={t('meterReadings.selectCycle')} required>
          <select
            className={mobileInputCls}
            value={form.billingCycleId}
            onChange={e => handleCycleChange(e.target.value)}
          >
            <option value="">—</option>
            {Object.entries(groupedCycles).map(([contractNo, group]) => (
              <optgroup key={contractNo} label={contractNo}>
                {group.map(cycle => (
                  <option key={cycle.id} value={cycle.id}>{cycle.cycleName ?? fmtPeriod(cycle)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </FormField>

        <FormField label={t('meterReadings.selectPrinter')} required>
          <select
            className={mobileInputCls}
            value={form.printerId}
            onChange={e => handlePrinterChange(e.target.value)}
            disabled={!form.billingCycleId}
          >
            <option value="">—</option>
            {assignments.map(a => (
              <option key={a.id} value={a.printerId}>
                {a.printer?.serialNumber} — {a.printer?.model}
              </option>
            ))}
          </select>
        </FormField>

        <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-4 dark:border-gray-800 dark:bg-gray-900">
          <SectionDivider label={t('meterReadings.blackCounters')} />
          {counterInput('a4Bw', t('meterReadings.a4Bw'))}
          {counterInput('a3Bw', t('meterReadings.a3Bw'))}
        </div>

        {isBwOnly ? (
          <div className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
            <span className="text-gray-400 text-sm mt-0.5">ℹ</span>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('meterReadings.bwOnlyNote')}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-4 dark:border-gray-800 dark:bg-gray-900">
            <SectionDivider label={t('meterReadings.colorCounters')} />
            {counterInput('a4Color', t('meterReadings.a4Color'))}
            {counterInput('a3Color', t('meterReadings.a3Color'))}
            {isPsg && counterInput('xls', t('meterReadings.xls'))}
          </div>
        )}

        <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-blue-900/20">
          <Clock className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-400">{t('meterReadings.readAtAutoSet')}</p>
        </div>

        {/* Photo upload */}
        <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-3 dark:border-gray-800 dark:bg-gray-900">
          <SectionDivider label={t('meterReadings.photos')} />
          {photos.length > 0 && (
            <div className="flex gap-2 flex-wrap">
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
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={openCamera}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-brand-500 transition-colors"
                >
                  <Camera className="h-4 w-4" />
                  {t('meterReadings.takePhoto')}
                </button>
                <button
                  type="button"
                  onClick={openGallery}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-brand-500 transition-colors"
                >
                  <ImagePlus className="h-4 w-4" />
                  {t('meterReadings.uploadPhoto')}
                  <span className="text-xs text-gray-400">({photos.length}/5)</span>
                </button>
              </div>
          )}
        </div>

        {error && <ErrorAlert message={error} />}
      </form>

      {/* Sticky submit button */}
      <div className="fixed bottom-0 start-0 end-0 border-t border-gray-200 bg-white px-4 pb-safe-area-inset-bottom pt-3 pb-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto max-w-lg">
          <button
            type="submit"
            form="submit-reading-form"
            disabled={submit.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-4 text-base font-semibold text-white hover:bg-brand-600 disabled:opacity-60 transition-colors min-h-[56px]"
          >
            {submit.isPending ? t('common.loading') : t('meterReadings.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
