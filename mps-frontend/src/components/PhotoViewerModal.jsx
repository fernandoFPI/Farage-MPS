import { useState, useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import client from '../api/client'

function PhotoImage({ photo, zoom, rotation, position, isDragging }) {
  const [loaded, setLoaded] = useState(false)
  const src = `data:${photo.mimeType};base64,${photo.data}`

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {!loaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          transform: `scale(${zoom}) rotate(${rotation}deg) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
          transformOrigin: 'center center',
          userSelect: 'none',
        }}
      />
    </div>
  )
}

export default function PhotoViewerModal({ readingId, onClose }) {
  const { t } = useTranslation()
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [index, setIndex] = useState(0)

  // Zoom / pan state
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const lastTouchDistance = useRef(null)

  // Rotation state
  const [rotation, setRotation] = useState(0)

  // Lazy load — only fetch when modal mounts
  useEffect(() => {
    setLoading(true)
    client.get(`/api/meter-readings/${readingId}/photos`)
      .then(r => setPhotos(r.data ?? []))
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false))
  }, [readingId])

  // Reset zoom and rotation whenever the photo changes
  useEffect(() => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
    setRotation(0)
  }, [index])

  const zoomIn    = () => setZoom(z => Math.min(z + 0.5, 4))
  const zoomOut   = () => setZoom(z => Math.max(z - 0.5, 1))
  const resetZoom = () => { setZoom(1); setPosition({ x: 0, y: 0 }) }

  const rotateLeft  = () => setRotation(r => r - 90)
  const rotateRight = () => setRotation(r => r + 90)

  // Mouse drag for pan when zoomed
  const handleMouseDown = (e) => {
    if (zoom <= 1) return
    isDragging.current = true
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y }
  }
  const handleMouseMove = (e) => {
    if (!isDragging.current) return
    const deltaX = e.clientX - dragStart.current.x
    const deltaY = e.clientY - dragStart.current.y
    const rad = (rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    setPosition({
      x: deltaX * cos + deltaY * sin,
      y: -deltaX * sin + deltaY * cos,
    })
  }
  const handleMouseUp = () => { isDragging.current = false }

  const handleTouchStart = (e) => {
    if (e.touches.length === 1 && zoom > 1) {
      isDragging.current = true
      dragStart.current = { x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y }
    }
  }

  // Pinch to zoom + single-finger pan on mobile
  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isDragging.current && zoom > 1) {
      const deltaX = e.touches[0].clientX - dragStart.current.x
      const deltaY = e.touches[0].clientY - dragStart.current.y
      const rad = (rotation * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      setPosition({
        x: deltaX * cos + deltaY * sin,
        y: -deltaX * sin + deltaY * cos,
      })
    } else if (e.touches.length === 2) {
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
  const handleTouchEnd = () => { isDragging.current = false; lastTouchDistance.current = null }

  const currentPhoto = photos[index]

  // Download current photo — applies rotation via canvas if needed
  const handleDownload = () => {
    if (!currentPhoto) return
    const ext = currentPhoto.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
    const filename = `reading-photo-${index + 1}.${ext}`

    if (rotation === 0) {
      const a = document.createElement('a')
      a.href = `data:${currentPhoto.mimeType};base64,${currentPhoto.data}`
      a.download = filename
      a.click()
      return
    }

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const isVertical = rotation % 180 !== 0
      canvas.width  = isVertical ? img.height : img.width
      canvas.height = isVertical ? img.width  : img.height

      const ctx = canvas.getContext('2d')
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)

      const a = document.createElement('a')
      a.href = canvas.toDataURL(currentPhoto.mimeType)
      a.download = filename
      a.click()
    }
    img.src = `data:${currentPhoto.mimeType};base64,${currentPhoto.data}`
  }

  const handlePopOut = () => {
    if (!currentPhoto) return
    const src = `data:${currentPhoto.mimeType};base64,${currentPhoto.data}`
    const filename = currentPhoto.filename ?? `reading-photo-${index + 1}`
    const win = window.open('', '_blank', 'width=800,height=600,resizable=yes,scrollbars=yes')
    if (!win) return
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${filename.replace(/</g, '&lt;')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1a1a1a; display: flex; flex-direction: column; align-items: center; min-height: 100vh; font-family: Arial, sans-serif; color: white; }
    .toolbar { width: 100%; padding: 8px 16px; background: #2a2a2a; display: flex; gap: 8px; align-items: center; font-size: 13px; flex-wrap: wrap; }
    .toolbar button { padding: 4px 12px; background: #444; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 13px; }
    .toolbar button:hover { background: #555; }
    .toolbar span { color: #aaa; }
    .img-wrapper { flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; overflow: hidden; padding: 8px; }
    img { max-width: 100%; max-height: calc(100vh - 56px); object-fit: contain; transition: transform 0.2s; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span>${filename.replace(/</g, '&lt;')}</span>
    <span>|</span>
    <button onclick="rotate(-90)">&#8634; Left</button>
    <button onclick="rotate(90)">&#8635; Right</button>
    <span>|</span>
    <button onclick="zoomOut()">&#8722;</button>
    <span id="zlabel">100%</span>
    <button onclick="zoomIn()">+</button>
    <button onclick="resetView()">Reset</button>
  </div>
  <div class="img-wrapper">
    <img id="photo" src="${src}" />
  </div>
  <script>
    var r = 0, z = 1;
    var img = document.getElementById('photo');
    function update() {
      img.style.transform = 'rotate(' + r + 'deg) scale(' + z + ')';
      document.getElementById('zlabel').textContent = Math.round(z * 100) + '%';
    }
    function rotate(deg) { r += deg; update(); }
    function zoomIn()  { z = Math.min(z + 0.25, 4); update(); }
    function zoomOut() { z = Math.max(z - 0.25, 0.25); update(); }
    function resetView() { r = 0; z = 1; update(); }
  </script>
</body>
</html>`)
    win.document.close()
  }

  const btnCls = 'flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30 transition-colors'

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
          onTouchStart={handleTouchStart}
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
              rotation={rotation}
              position={position}
              isDragging={isDragging.current}
            />
          ) : null}
        </div>

        {/* Controls bar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-900 flex-wrap">
          {/* Left: rotation + zoom */}
          <div className="flex items-center gap-1.5">
            {/* Rotation */}
            <button onClick={rotateLeft} title={t('meterReadings.rotateLeft')} className={btnCls}>
              <span className="text-base leading-none select-none">↺</span>
            </button>
            <button onClick={rotateRight} title={t('meterReadings.rotateRight')} className={btnCls}>
              <span className="text-base leading-none select-none">↻</span>
            </button>

            <span className="text-gray-700 dark:text-gray-600 mx-1 select-none">|</span>

            {/* Zoom */}
            <button onClick={zoomOut} disabled={zoom <= 1} className={btnCls}>
              <span className="text-lg leading-none">−</span>
            </button>
            <span className="text-xs text-gray-400 w-10 text-center tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={zoomIn} disabled={zoom >= 4} className={btnCls}>
              <span className="text-lg leading-none">+</span>
            </button>
            {(zoom > 1 || rotation !== 0) && (
              <button
                onClick={() => { resetZoom(); setRotation(0) }}
                className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {/* Right: navigation + download */}
          <div className="flex items-center gap-2">
            {photos.length > 1 && (
              <>
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
                <span className="text-gray-700 dark:text-gray-600 mx-0.5 select-none">|</span>
              </>
            )}
            <button
              onClick={handlePopOut}
              disabled={!currentPhoto}
              title={t('meterReadings.popOut')}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            <button
              onClick={handleDownload}
              disabled={!currentPhoto}
              title={t('meterReadings.download')}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30 transition-colors"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
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
