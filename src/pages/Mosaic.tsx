import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Image as ImageIcon, Download, Loader2, Upload, Shuffle } from 'lucide-react'
import { useAuthContext } from '../components/shared/AuthContext'
import { useCollection } from '../hooks/useCollection'

const GRID_SIZES = [4, 6, 8, 10, 12]
const TILE_PX = 200 // art_crop is roughly 626×457, we'll render at fixed tile size

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Mosaic() {
  const { user } = useAuthContext()
  const { cards } = useCollection(user?.uid ?? null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cols, setCols] = useState(8)
  const [rows, setRows] = useState(5)
  const [rendering, setRendering] = useState(false)
  const [rendered, setRendered] = useState(false)
  const [error, setError] = useState('')

  // Collect art_crop URLs from collection
  const artUrls = cards
    .flatMap((c) => {
      const base = c.imageUris?.art_crop
      if (base) return Array(c.quantity).fill(base)
      return []
    })
    .filter(Boolean) as string[]

  const totalTiles = cols * rows

  const render = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || artUrls.length === 0) return

    setRendering(true)
    setRendered(false)
    setError('')

    try {
      const shuffled = shuffleArray(artUrls)

      // Tile dimensions — art_crop is landscape ~1.37:1
      const tileW = TILE_PX
      const tileH = Math.round(TILE_PX / 1.37)

      canvas.width = cols * tileW
      canvas.height = rows * tileH

      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#0f0f0f'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Load and draw tiles concurrently in batches
      const needed = Math.min(totalTiles, shuffled.length)
      const loadImage = (url: string): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
          const img = new window.Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => res(img)
          img.onerror = () => rej(new Error(`Failed: ${url}`))
          img.src = url
        })

      const CONCURRENCY = 20
      const tileImages: (HTMLImageElement | null)[] = new Array(needed).fill(null)

      for (let i = 0; i < needed; i += CONCURRENCY) {
        const batch = shuffled.slice(i, i + CONCURRENCY)
        const results = await Promise.allSettled(batch.map(loadImage))
        results.forEach((r, j) => {
          if (r.status === 'fulfilled') tileImages[i + j] = r.value
        })
      }

      // Draw tiles
      for (let idx = 0; idx < needed; idx++) {
        const img = tileImages[idx]
        if (!img) continue
        const col = idx % cols
        const row = Math.floor(idx / cols)
        const x = col * tileW
        const y = row * tileH

        // Center-crop the image into the tile
        const srcAspect = img.naturalWidth / img.naturalHeight
        const dstAspect = tileW / tileH
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight
        if (srcAspect > dstAspect) {
          sw = img.naturalHeight * dstAspect
          sx = (img.naturalWidth - sw) / 2
        } else {
          sh = img.naturalWidth / dstAspect
          sy = (img.naturalHeight - sh) / 2
        }
        ctx.drawImage(img, sx, sy, sw, sh, x, y, tileW, tileH)
      }

      setRendered(true)
    } catch (e: any) {
      setError('Some images failed to load. Try a smaller grid or re-render.')
      setRendered(true) // show partial result
    } finally {
      setRendering(false)
    }
  }, [artUrls, cols, rows, totalTiles])

  const download = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `mtg-mosaic-${cols}x${rows}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const reshuffle = () => {
    setRendered(false)
    render()
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-400">Import your collection first to generate a mosaic.</p>
        <Link
          to="/upload"
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition"
        >
          <Upload className="w-4 h-4" />
          Upload CSV
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <ImageIcon className="w-6 h-6 text-violet-400" />
        <h1 className="text-2xl font-bold text-white">Art Mosaic</h1>
      </div>
      <p className="text-gray-400 text-sm mb-6">
        Generate a poster of your collection's card art. {artUrls.length} art crops available.
      </p>

      {/* Controls */}
      <div className="flex flex-wrap gap-6 items-end mb-6 p-4 bg-gray-900 border border-gray-800 rounded-xl">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Columns</label>
          <div className="flex gap-1">
            {GRID_SIZES.map((n) => (
              <button
                key={n}
                onClick={() => setCols(n)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition ${
                  cols === n
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Rows</label>
          <div className="flex gap-1">
            {[3, 4, 5, 6, 8].map((n) => (
              <button
                key={n}
                onClick={() => setRows(n)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition ${
                  rows === n
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="text-gray-500 text-xs">
          {cols} × {rows} = {totalTiles} tiles
          {totalTiles > artUrls.length && (
            <span className="text-amber-500 ml-1">
              (only {artUrls.length} available — some will repeat)
            </span>
          )}
        </div>

        <div className="flex gap-2 ml-auto">
          {rendered && (
            <>
              <button
                onClick={reshuffle}
                disabled={rendering}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm transition"
              >
                <Shuffle className="w-4 h-4" />
                Reshuffle
              </button>
              <button
                onClick={download}
                className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                <Download className="w-4 h-4" />
                Download PNG
              </button>
            </>
          )}
          <button
            onClick={render}
            disabled={rendering}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            {rendering ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Rendering…
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4" />
                {rendered ? 'Re-render' : 'Generate'}
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-amber-400 text-sm mb-4">{error}</p>
      )}

      {/* Canvas */}
      <div className="rounded-xl overflow-hidden border border-gray-800 bg-gray-950">
        <canvas
          ref={canvasRef}
          className={`w-full ${!rendered ? 'hidden' : ''}`}
        />
        {!rendered && !rendering && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-600">
            <ImageIcon className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">Click Generate to render your mosaic</p>
          </div>
        )}
        {rendering && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-500">
            <Loader2 className="w-10 h-10 animate-spin mb-3 text-violet-500" />
            <p className="text-sm">Loading {totalTiles} art crops…</p>
          </div>
        )}
      </div>

      <p className="text-gray-600 text-xs mt-3">
        Card art © Wizards of the Coast. Images served via Scryfall.
      </p>
    </div>
  )
}
