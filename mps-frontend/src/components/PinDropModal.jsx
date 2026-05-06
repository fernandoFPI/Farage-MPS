import { useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import { X, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const IRAQ_CENTER = [33.3, 43.6]
const IRAQ_DEFAULT_ZOOM = 6

const RED_ICON_HTML = `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:#ef4444;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);transform:rotate(-45deg)"></div>`

function redIcon() {
  const L = window.L ?? (typeof require !== 'undefined' ? require('leaflet') : null)
  if (!L) return null
  return L.divIcon({
    className: '',
    html: RED_ICON_HTML,
    iconSize: [20, 20],
    iconAnchor: [10, 20],
    popupAnchor: [0, -22],
  })
}

// ── Geocoding search (Iraq-restricted) ────────────────────────────────────────
function GeoSearch({ t }) {
  const map = useMap()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  async function search() {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=iq`,
        { headers: { 'Accept-Language': 'en' } },
      )
      setResults(await res.json())
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  function selectResult(r) {
    map.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 14)
    setResults([])
    setQuery(r.display_name.split(',')[0])
  }

  return (
    <div className="leaflet-top leaflet-left" style={{ marginTop: '10px', marginLeft: '10px', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: '8px', padding: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', width: '220px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder={t('map.searchPlaceholder')}
            style={{ flex: 1, border: '1px solid #ddd', borderRadius: '4px', padding: '4px 8px', fontSize: '12px' }}
          />
          <button
            onClick={search}
            style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}
          >
            {loading ? '…' : '🔍'}
          </button>
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: '4px', maxHeight: '140px', overflowY: 'auto' }}>
            {results.map((r, i) => (
              <div
                key={i}
                onClick={() => selectResult(r)}
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
                style={{ padding: '5px 8px', cursor: 'pointer', fontSize: '11px', borderBottom: '1px solid #f0f0f0' }}
              >
                {r.display_name.split(',').slice(0, 3).join(', ')}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Clickable + draggable pin ─────────────────────────────────────────────────
function PinDropMap({ onPinChange, initialLat, initialLng }) {
  const [position, setPosition] = useState(
    initialLat && initialLng ? [initialLat, initialLng] : null,
  )
  const icon = redIcon()

  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng])
      onPinChange(e.latlng.lat, e.latlng.lng)
    },
  })

  if (!position || !icon) return null
  return (
    <Marker
      position={position}
      icon={icon}
      draggable
      eventHandlers={{
        dragend(e) {
          const { lat, lng } = e.target.getLatLng()
          setPosition([lat, lng])
          onPinChange(lat, lng)
        },
      }}
    />
  )
}

// ── Public component ──────────────────────────────────────────────────────────
export default function PinDropModal({
  open,
  onClose,
  onConfirm,
  initialLatitude,
  initialLongitude,
  title,
}) {
  const { t } = useTranslation()
  const [pin, setPin] = useState(
    initialLatitude && initialLongitude
      ? { lat: initialLatitude, lng: initialLongitude }
      : null,
  )

  const mapCenter = (initialLatitude && initialLongitude)
    ? [initialLatitude, initialLongitude]
    : IRAQ_CENTER

  const mapZoom = (initialLatitude && initialLongitude) ? 14 : IRAQ_DEFAULT_ZOOM

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl dark:bg-gray-900 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {title ?? t('map.dropPinTitle')}
          </h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('map.dropPinInstruction')}</p>

          {/* Map */}
          <div style={{ height: '360px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            <MapContainer
              key={`${initialLatitude}-${initialLongitude}`}
              center={mapCenter}
              zoom={mapZoom}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <PinDropMap
                onPinChange={(lat, lng) => setPin({ lat, lng })}
                initialLat={initialLatitude}
                initialLng={initialLongitude}
              />
              <GeoSearch t={t} />
            </MapContainer>
          </div>

          {/* Coordinates readout */}
          {pin ? (
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                📍 {t('map.selectedLocation')}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('printers.latitude')}: <span className="font-mono font-medium">{pin.lat.toFixed(6)}</span>
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('printers.longitude')}: <span className="font-mono font-medium">{pin.lng.toFixed(6)}</span>
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 px-4 py-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">{t('map.dropPinInstruction')}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!pin}
            onClick={() => { onConfirm({ latitude: pin.lat, longitude: pin.lng }); onClose() }}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            <MapPin className="h-4 w-4" />
            {t('map.confirmLocation')}
          </button>
        </div>
      </div>
    </div>
  )
}
