// Phone cameras produce 3–8 MB JPEGs. Resize and re-encode before storing so
// photos stay small (and quick to open) — and so drafts don't bloat the database.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.7

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

const stripPrefix = dataUrl => dataUrl.replace(/^data:[^;]+;base64,/, '')

// Resolves { mimeType, data (base64, no prefix), preview (data URL) }.
// Falls back to the untouched file if the browser can't decode it (e.g. HEIC).
export async function compressImageFile(file) {
  const original = await readAsDataUrl(file)
  const untouched = () => ({
    mimeType: file.type || 'image/jpeg',
    data: stripPrefix(original),
    preview: original,
  })

  try {
    const img = await loadImage(original)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(img, 0, 0, width, height)

    const preview = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    // Never make an already-small photo bigger.
    if (preview.length >= original.length) return untouched()
    return { mimeType: 'image/jpeg', data: stripPrefix(preview), preview }
  } catch {
    return untouched()
  }
}
