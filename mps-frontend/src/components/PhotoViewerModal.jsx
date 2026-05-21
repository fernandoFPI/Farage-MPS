import { useState, useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import client from '../api/client'

function PhotoImage({ photo, zoom, position, isDragging }) {
  const [loaded, setLoaded] = useState(false)
  const src = `data:${photo.mimeType};base64,${photo.data}`

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="text-gray-400 text-sm">Loading…</span>
        </div>
      )}
      <img
        src={src}
        alt=""
        draggable={false}
        onLoad={() => setLoaded(true)}
        style={{
          maxHeight: '60vh',
          maxWidth: '100%',
          objectFit: 'contain',
          opacity: loaded ? 1 : 0,
          transition: isDragging ? 'opacity 0.3s' : 'opacity 0.3s, transform 0.2s',
          transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
          transformOrigin: 'center center',
          userSelect: 'none',
        }}
      />
    </div>
  )
}

export default function PhotoViewerModal({ readingId, onClose }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [index, setIndex] = useState(0)

  // Zoom / pan state
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const lastTouchDistance = useRef(null)

  // Lazy load — only fetch when modal mounts
  useEffect(() => {
    setLoading(true)
    client.get(`/api/meter-readings/${readingId}/photos`)
      .then(r => setPhotos(r.data ?? []))
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false))
  }, [readingId])

  // Reset zoom whenever the photo changes
  useEffect(() => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
  }, [index])

  const zoomIn  = () => setZoom(z => Math.min(z + 0.5, 4))
  const zoomOut = () => setZoom(z => Math.max(z - 0.5, 1))
  const resetZoom = () => { setZoom(1); setPosition({ x: 0, y: 0 }) }

  // Mouse drag for pan when zoomed
  const handleMouseDown = (e) => {
    if (zoom <= 1) return
    isDragging.current = true
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y }
  }
  const handleMouseMove = (e) => {
    if (!isDragging.current) return
    setPosition({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y })
  }
  const handleMouseUp = () => { isDragging.current = false }

  // Pinch to zoom on mobile
  const handleTouchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      if (lastTouchDistance.current) {
        const delta = distance - lastTouchDistance.current
        setZoom(z => Math.min(Math.max(z + delta * 0.01, 1), 4))
      }
      lastTouchDistance.current = distance
    }
  }
  const handleTouchEnd = () => { lastTouchDistance.current = null }

  const currentPhoto = photos[index]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl bg-gray-900 overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 end-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Photo display */}
        <div
          className="flex min-h-[300px] items-center justify-center bg-black overflow-hidden"
          style={{ cursor: zoom > 1 ? 'grab' : 'default' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {loading ? (
            <span className="text-gray-400 text-sm">Loading…</span>
          ) : photos.length === 0 ? (
            <span className="text-gray-400 text-sm">No photos</span>
          ) : currentPhoto ? (
            <PhotoImage
              key={currentPhoto.id}
              photo={currentPhoto}
              zoom={zoom}
              position={position}
              isDragging={isDragging.current}
            />
          ) : null}
        </div>

        {/* Controls bar: zoom + navigation */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-gray-900">
          {/* Zoom controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={zoomOut}
              disabled={zoom <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30 text-lg leading-none"
            >
              −
            </button>
            <span className="text-xs text-gray-400 w-10 text-center tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={zoomIn}
              disabled={zoom >= 4}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30 text-lg leading-none"
            >
              +
            </button>
            {zoom > 1 && (
              <button
                onClick={resetZoom}
                className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {/* Photo navigation */}
          {photos.length > 1 && (
            <div className="flex items-center gap-3">
              <button
                disabled={index === 0}
                onClick={() => setIndex(i => i - 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
              </button>
              <span className="text-sm text-gray-400 tabular-nums">{index + 1} / {photos.length}</span>
              <button
                disabled={index === photos.length - 1}
                onClick={() => setIndex(i => i + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5 rtl:rotate-180" />
              </button>
            </div>
          )}
        </div>

        {/* Thumbnail strip */}
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-4 pt-1">
            {photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setIndex(i)}
                className={`shrink-0 h-14 w-14 rounded-lg overflow-hidden border-2 transition-colors ${
                  i === index ? 'border-brand-500' : 'border-transparent'
                }`}
              >
                <img
                  src={`data:${p.mimeType};base64,${p.data}`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
