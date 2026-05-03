import { useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useReadingPhotos } from '../api/hooks/useMeterReadings'

export default function PhotoViewerModal({ readingId, onClose }) {
  const { data: photos = [], isLoading } = useReadingPhotos(readingId)
  const [index, setIndex] = useState(0)

  const current = photos[index]
  const src = current ? `data:${current.mimeType};base64,${current.data}` : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl bg-gray-900 overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 end-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex min-h-[300px] items-center justify-center bg-black">
          {isLoading ? (
            <span className="text-gray-400 text-sm">Loading…</span>
          ) : photos.length === 0 ? (
            <span className="text-gray-400 text-sm">No photos</span>
          ) : src ? (
            <img
              src={src}
              alt={`Photo ${index + 1}`}
              className="max-h-[70vh] max-w-full object-contain"
            />
          ) : null}
        </div>

        {photos.length > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
            <button
              disabled={index === 0}
              onClick={() => setIndex(i => i - 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
            </button>
            <span className="text-sm text-gray-400">{index + 1} / {photos.length}</span>
            <button
              disabled={index === photos.length - 1}
              onClick={() => setIndex(i => i + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5 rtl:rotate-180" />
            </button>
          </div>
        )}

        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-4 pt-1">
            {photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setIndex(i)}
                className={`shrink-0 h-14 w-14 rounded-lg overflow-hidden border-2 transition-colors ${i === index ? 'border-brand-500' : 'border-transparent'}`}
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
