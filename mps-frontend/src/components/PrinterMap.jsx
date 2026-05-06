import { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDarkMode } from '../hooks/useTheme'

const IRAQ_CENTER = [33.3, 43.6]
const IRAQ_DEFAULT_ZOOM = 6
const IRAQ_MIN_ZOOM = 5
const IRAQ_MAX_ZOOM = 18
const IRAQ_BOUNDS = [
  [28.0, 38.0],
  [38.5, 50.0],
]

function colorIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  })
}

const ICON_ASSIGNED   = colorIcon('#22c55e')
const ICON_UNASSIGNED = colorIcon('#ef4444')

// ── Inner map controls ─────────────────────────────────────────────────────────

function FullscreenControl() {
  const map = useMap()
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggle = () => {
    const container = map.getContainer()
    if (!document.fullscreenElement) {
      container.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  return (
    <div className="leaflet-top leaflet-right" style={{ marginTop: '80px' }}>
      <div className="leaflet-control leaflet-bar">
        <a
          href="#"
          title={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
          onClick={e => { e.preventDefault(); toggle() }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '34px', height: '34px', fontSize: '16px',
            textDecoration: 'none', color: '#333',
          }}
        >
          {isFullscreen ? '⛶' : '⛶'}
        </a>
      </div>
    </div>
  )
}

function GeocodingSearch() {
  const map = useMap()
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=iq`,
        { headers: { 'Accept-Language': 'en' } },
      )
      const data = await res.json()
      setResults(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const selectResult = result => {
    map.flyTo([parseFloat(result.lat), parseFloat(result.lon)], 14)
    setResults([])
    setQuery(result.display_name.split(',')[0])
  }

  return (
    <div
      className="leaflet-top leaflet-left"
      style={{ marginTop: '10px', marginLeft: '10px', zIndex: 1000 }}
    >
      <div style={{
        background: 'white', borderRadius: '8px', padding: '6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)', width: '240px',
      }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder={t('map.searchPlaceholder')}
            style={{
              flex: 1, border: '1px solid #ddd', borderRadius: '4px',
              padding: '4px 8px', fontSize: '13px',
            }}
          />
          <button
            onClick={search}
            style={{
              background: '#3B82F6', color: 'white', border: 'none',
              borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '13px',
            }}
          >
            {loading ? '...' : '🔍'}
          </button>
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: '4px', maxHeight: '160px', overflowY: 'auto' }}>
            {results.map((r, i) => (
              <div
                key={i}
                onClick={() => selectResult(r)}
                style={{
                  padding: '6px 8px', cursor: 'pointer',
                  fontSize: '12px', borderBottom: '1px solid #f0f0f0',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
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

function ResetViewControl() {
  const map = useMap()
  const { t } = useTranslation()
  return (
    <div className="leaflet-bottom leaflet-left" style={{ marginBottom: '30px', marginLeft: '10px' }}>
      <div className="leaflet-control leaflet-bar">
        <a
          href="#"
          title={t('map.resetView')}
          onClick={e => { e.preventDefault(); map.flyTo(IRAQ_CENTER, IRAQ_DEFAULT_ZOOM) }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '34px', height: '34px', fontSize: '14px', textDecoration: 'none',
          }}
        >
          🏠
        </a>
      </div>
    </div>
  )
}

function PrinterCountOverlay({ mapped, unmapped }) {
  const { t } = useTranslation()
  return (
    <div className="leaflet-top leaflet-right" style={{ marginTop: '120px', marginRight: '10px' }}>
      <div style={{
        background: 'white', borderRadius: '8px', padding: '8px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)', fontSize: '12px', lineHeight: '1.6',
      }}>
        <div><strong>{mapped}</strong> {t('map.mappedPrinters')}</div>
        {unmapped > 0 && (
          <div style={{ color: '#F59E0B' }}>⚠ {unmapped} {t('map.unmappedWarning')}</div>
        )}
      </div>
    </div>
  )
}

function MapLegend({ assigned, unassigned }) {
  const { t } = useTranslation()
  return (
    <div className="leaflet-bottom leaflet-right" style={{ marginBottom: '30px', marginRight: '10px' }}>
      <div style={{
        background: 'white', borderRadius: '8px', padding: '8px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)', fontSize: '12px', lineHeight: '1.8',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0 }} />
          {t('map.assigned')} ({assigned})
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', flexShrink: 0 }} />
          {t('map.unassigned')} ({unassigned})
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PrinterMap({
  printers = [],
  activeAssignmentMap = {},
  height = '500px',
  showSearch = true,
  showFullscreen = true,
  showResetView = true,
}) {
  const { t } = useTranslation()
  const { isDark } = useDarkMode()

  const mapped   = useMemo(() => printers.filter(p => p.latitude != null && p.longitude != null), [printers])
  const unmapped = printers.length - mapped.length

  const assignedPins   = mapped.filter(p => activeAssignmentMap[p.id])
  const unassignedPins = mapped.filter(p => !activeAssignmentMap[p.id])

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const tileAttribution = isDark
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

  return (
    <div style={{ height, width: '100%' }}>
      <MapContainer
        center={IRAQ_CENTER}
        zoom={IRAQ_DEFAULT_ZOOM}
        minZoom={IRAQ_MIN_ZOOM}
        maxZoom={IRAQ_MAX_ZOOM}
        maxBounds={IRAQ_BOUNDS}
        maxBoundsViscosity={0.8}
        style={{ height: '100%', width: '100%', borderRadius: '12px' }}
      >
        <TileLayer attribution={tileAttribution} url={tileUrl} />

        {mapped.map(p => {
          const assignment = activeAssignmentMap[p.id]
          return (
            <Marker
              key={p.id}
              position={[p.latitude, p.longitude]}
              icon={assignment ? ICON_ASSIGNED : ICON_UNASSIGNED}
            >
              <Popup>
                <div className="text-sm" style={{ minWidth: '160px' }}>
                  <p style={{ fontWeight: 600, marginBottom: 2 }}>{p.serialNumber}</p>
                  <p style={{ color: '#6b7280', marginBottom: 1 }}>{p.model}</p>
                  <p style={{ color: '#6b7280', marginBottom: 4 }}>
                    {p.city}{p.location ? ` — ${p.location}` : ''}
                  </p>
                  {assignment ? (
                    <p style={{ color: '#15803d', fontSize: '12px', fontWeight: 500 }}>
                      {assignment.contract?.customerName ?? '—'}
                    </p>
                  ) : (
                    <p style={{ color: '#dc2626', fontSize: '12px' }}>{t('map.unassigned')}</p>
                  )}
                  <Link
                    to={`/printers/${p.id}`}
                    style={{ display: 'block', marginTop: '6px', fontSize: '12px', color: '#2563eb' }}
                  >
                    {t('map.viewPrinter')}
                  </Link>
                </div>
              </Popup>
            </Marker>
          )
        })}

        {showSearch && <GeocodingSearch />}
        {showFullscreen && <FullscreenControl />}
        {showResetView && <ResetViewControl />}
        <PrinterCountOverlay mapped={mapped.length} unmapped={unmapped} />
        <MapLegend assigned={assignedPins.length} unassigned={unassignedPins.length} />
      </MapContainer>
    </div>
  )
}
