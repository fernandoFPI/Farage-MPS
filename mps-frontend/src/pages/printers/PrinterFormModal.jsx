import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as Switch from '@radix-ui/react-switch'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { UserPlus, MapPin } from 'lucide-react'
import Modal from '../../components/Modal'
import FormField, { inputCls } from '../../components/FormField'
import ErrorAlert from '../../components/ErrorAlert'
import PinDropModal from '../../components/PinDropModal'
import { useCreatePrinter, useUpdatePrinter } from '../../api/hooks/usePrinters'

const empty = { serialNumber: '', model: '', city: '', location: '', xsmDeviceId: '', xsmEnabled: false, isBwOnly: false, latitude: '', longitude: '' }

export default function PrinterFormModal({ open, onClose, initial, onSaveAndAssign }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const create = useCreatePrinter()
  const update = useUpdatePrinter()
  const isEdit = !!initial
  const assignAfterSave = useRef(false)

  useEffect(() => {
    setForm(initial ? {
      ...empty,
      ...initial,
      xsmDeviceId: initial.xsmDeviceId || '',
      isBwOnly: initial.isBwOnly ?? false,
      latitude: initial.latitude ?? '',
      longitude: initial.longitude ?? '',
    } : empty)
    setError('')
    assignAfterSave.current = false
  }, [initial, open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const loading = create.isPending || update.isPending
  const [pinModalOpen, setPinModalOpen] = useState(false)

  const parsedLat = form.latitude !== '' ? parseFloat(form.latitude) : null
  const parsedLng = form.longitude !== '' ? parseFloat(form.longitude) : null
  const hasCoords = parsedLat !== null && !isNaN(parsedLat) && parsedLng !== null && !isNaN(parsedLng)

  function buildPayload() {
    const lat = form.latitude !== '' ? parseFloat(form.latitude) : null
    const lng = form.longitude !== '' ? parseFloat(form.longitude) : null
    return { ...form, latitude: lat, longitude: lng }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.serialNumber.trim() || !form.model.trim() || !form.city.trim() || !form.location.trim()) {
      return setError('Serial number, model, city, and location are required')
    }
    const lat = form.latitude !== '' ? parseFloat(form.latitude) : null
    const lng = form.longitude !== '' ? parseFloat(form.longitude) : null
    if ((lat !== null) !== (lng !== null)) {
      return setError('Both latitude and longitude must be provided together')
    }
    if (lat !== null && (lat < -90 || lat > 90)) return setError('Latitude must be between -90 and 90')
    if (lng !== null && (lng < -180 || lng > 180)) return setError('Longitude must be between -180 and 180')
    setError('')
    try {
      const payload = buildPayload()
      if (isEdit) {
        await update.mutateAsync({ id: initial.id, ...payload })
        onClose()
      } else {
        const printer = await create.mutateAsync(payload)
        if (assignAfterSave.current && onSaveAndAssign) {
          onSaveAndAssign(printer)
        } else {
          onClose()
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('common.edit') + ' ' + t('printers.title') : t('printers.addPrinter')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          {!isEdit && onSaveAndAssign ? (
            <button
              type="submit"
              form="printer-form"
              disabled={loading}
              onClick={() => { assignAfterSave.current = true }}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {loading ? t('common.loading') : t('printers.saveAndAssign')}
            </button>
          ) : (
            <button
              type="submit"
              form="printer-form"
              disabled={loading}
              onClick={() => { assignAfterSave.current = false }}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('common.save')}
            </button>
          )}
        </>
      }
    >
      <form id="printer-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t('printers.serialNumber')} required>
          <input className={inputCls} value={form.serialNumber} disabled={isEdit}
            onChange={e => set('serialNumber', e.target.value)} />
        </FormField>
        <FormField label={t('printers.model')} required>
          <input className={inputCls} value={form.model} onChange={e => set('model', e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('printers.city')} required>
            <input className={inputCls} value={form.city} onChange={e => set('city', e.target.value)} />
          </FormField>
          <FormField label={t('printers.location')} required>
            <input className={inputCls} value={form.location} onChange={e => set('location', e.target.value)} />
          </FormField>
        </div>
        <FormField label={t('printers.xsmDeviceId')}>
          <input className={inputCls} value={form.xsmDeviceId} onChange={e => set('xsmDeviceId', e.target.value)} />
        </FormField>
        <div>
          <div className="flex items-end gap-2">
            <div className="flex-1 grid grid-cols-2 gap-3">
              <FormField label={t('printers.latitude')}>
                <input
                  type="number"
                  step="0.0001"
                  min="-90"
                  max="90"
                  className={inputCls}
                  value={form.latitude}
                  onChange={e => set('latitude', e.target.value)}
                  placeholder="e.g. 33.3"
                />
              </FormField>
              <FormField label={t('printers.longitude')}>
                <input
                  type="number"
                  step="0.0001"
                  min="-180"
                  max="180"
                  className={inputCls}
                  value={form.longitude}
                  onChange={e => set('longitude', e.target.value)}
                  placeholder="e.g. 43.6"
                />
              </FormField>
            </div>
            <button
              type="button"
              onClick={() => setPinModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-brand-500 dark:hover:text-brand-400 whitespace-nowrap"
            >
              <MapPin className="h-4 w-4" />
              {t('map.dropPin')}
            </button>
          </div>

          {hasCoords && (
            <div style={{ height: '100px', borderRadius: '8px', overflow: 'hidden', marginTop: '8px', border: '1px solid #e5e7eb' }}>
              <MapContainer
                key={`${parsedLat}-${parsedLng}`}
                center={[parsedLat, parsedLng]}
                zoom={14}
                zoomControl={false}
                dragging={false}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[parsedLat, parsedLng]} />
              </MapContainer>
            </div>
          )}
        </div>

        <PinDropModal
          open={pinModalOpen}
          onClose={() => setPinModalOpen(false)}
          onConfirm={({ latitude, longitude }) => {
            set('latitude', latitude.toFixed(6))
            set('longitude', longitude.toFixed(6))
          }}
          initialLatitude={hasCoords ? parsedLat : undefined}
          initialLongitude={hasCoords ? parsedLng : undefined}
        />
        <div className="flex items-center gap-3">
          <Switch.Root checked={form.xsmEnabled} onCheckedChange={v => set('xsmEnabled', v)}
            className="relative h-5 w-9 rounded-full bg-gray-300 transition-colors data-[state=checked]:bg-brand-500 dark:bg-gray-600">
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
          </Switch.Root>
          <span className="text-sm text-gray-700 dark:text-gray-300">{t('printers.xsmEnabled')}</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch.Root checked={form.isBwOnly} onCheckedChange={v => set('isBwOnly', v)}
            className="relative h-5 w-9 rounded-full bg-gray-300 transition-colors data-[state=checked]:bg-brand-500 dark:bg-gray-600">
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
          </Switch.Root>
          <div>
            <span className="text-sm text-gray-700 dark:text-gray-300">{t('printers.isBwOnly')}</span>
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('printers.isBwOnlyHint')}</p>
          </div>
        </div>
        {error && <ErrorAlert message={error} />}
      </form>
    </Modal>
  )
}
