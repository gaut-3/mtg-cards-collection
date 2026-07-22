import { useState, useEffect } from 'react'
import { Layers, CheckCircle, XCircle, ExternalLink, ShoppingCart } from 'lucide-react'
import { useAuthContext } from '../components/shared/AuthContext'
import { useCollection } from '../hooks/useCollection'
import { parseDeckList, buildDeckDiff } from '../lib/deckMatcher'
import type { DeckDiffResult } from '../types/deck'

const PLACEHOLDER = `1 Sol Ring
1 Command Tower
1 Lightning Bolt
4 Counterspell
1 Rhystic Study
`

export default function Decks() {
  const { user } = useAuthContext()
  const { cards } = useCollection(user?.uid ?? null)

  // Pre-populate from Builder page if available — DECK BUILDER integration
  const [deckText, setDeckText] = useState(() => {
    const fromBuilder = sessionStorage.getItem('builder_deck')
    if (fromBuilder) {
      sessionStorage.removeItem('builder_deck')
      return fromBuilder
    }
    return ''
  })
  const [loading, setLoading] = useState(false)
  const [diff, setDiff] = useState<DeckDiffResult | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'owned' | 'missing'>('missing')

  // Auto-analyze if pre-populated from Builder
  useEffect(() => {
    if (deckText && cards.length > 0 && !diff) {
      handleAnalyze()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards])

  const handleAnalyze = async () => {
    if (!deckText.trim()) return
    setLoading(true)
    setError('')
    setDiff(null)
    try {
      const lines = parseDeckList(deckText)
      if (lines.length === 0) {
        setError('Could not parse any card lines. Use format: "4 Lightning Bolt"')
        return
      }
      const result = await buildDeckDiff(lines, cards)
      setDiff(result)
      setTab('missing')
    } catch (e: any) {
      setError(e.message ?? 'Failed to analyze deck.')
    } finally {
      setLoading(false)
    }
  }

  const ownedPct = diff
    ? Math.round((diff.owned.length / (diff.owned.length + diff.missing.length)) * 100)
    : 0

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <Layers className="w-6 h-6 text-violet-400" />
        <h1 className="text-2xl font-bold text-white">Deck Analyzer</h1>
      </div>
      <p className="text-gray-400 text-sm mb-6">
        Paste a decklist to see what you already own and what you still need to buy.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Decklist</label>
          <textarea
            value={deckText}
            onChange={(e) => setDeckText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={16}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-violet-500 transition resize-none"
          />
          <p className="text-gray-600 text-xs mt-1 mb-3">
            Supports: "4 Lightning Bolt", "4x Lightning Bolt (M21) 149", MTGO/Arena format
          </p>
          <button
            onClick={handleAnalyze}
            disabled={loading || !deckText.trim() || cards.length === 0}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyzing…
              </>
            ) : (
              'Analyze deck'
            )}
          </button>
          {cards.length === 0 && (
            <p className="text-amber-500 text-xs mt-2">
              Import your collection first to use the deck analyzer.
            </p>
          )}
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </div>

        {/* Results */}
        <div>
          {diff ? (
            <div>
              {/* Summary bar */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-green-400 font-medium">
                    {diff.owned.length} owned
                  </span>
                  <span className="text-red-400 font-medium">
                    {diff.missing.length} missing
                  </span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${ownedPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">{ownedPct}% owned</span>
                  <span className="text-amber-400 text-xs font-semibold">
                    Buy list total: ${diff.totalMissingUsd.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mb-3">
                {(['missing', 'owned'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      tab === t
                        ? 'bg-violet-600/20 text-violet-300 border border-violet-600/40'
                        : 'text-gray-500 hover:text-white'
                    }`}
                  >
                    {t === 'missing' ? `Missing (${diff.missing.length})` : `Owned (${diff.owned.length})`}
                  </button>
                ))}
              </div>

              {/* Card list */}
              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {tab === 'missing' &&
                  diff.missing.map((c, i) => (
                    <DiffRow
                      key={i}
                      name={c.name}
                      quantity={c.quantity}
                      price={c.priceUsd}
                      owned={false}
                      imageUri={c.imageUriNormal}
                      scryfallId={c.scryfallId}
                    />
                  ))}
                {tab === 'owned' &&
                  diff.owned.map((c, i) => (
                    <DiffRow
                      key={i}
                      name={c.name}
                      quantity={c.quantity}
                      price={c.priceUsd}
                      owned={true}
                      imageUri={c.imageUriNormal}
                      scryfallId={c.scryfallId}
                    />
                  ))}
              </div>

              {/* Export buy list */}
              {diff.missing.length > 0 && (
                <button
                  onClick={() => {
                    const text = diff.missing
                      .map((c) => `${c.quantity} ${c.name}`)
                      .join('\n')
                    navigator.clipboard.writeText(text)
                  }}
                  className="mt-3 flex items-center gap-2 text-xs text-gray-400 hover:text-white transition"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Copy buy list to clipboard
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-600 pt-12">
              <Layers className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Paste a decklist and click Analyze</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DiffRow({
  name, quantity, price, owned, imageUri, scryfallId,
}: {
  name: string
  quantity: number
  price?: number
  owned: boolean
  imageUri?: string
  scryfallId?: string
}) {
  const [hover, setHover] = useState(false)

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
        owned ? 'bg-green-900/10 border border-green-900/30' : 'bg-red-900/10 border border-red-900/30'
      }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {owned ? (
        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
      )}

      {/* Mini card image tooltip */}
      <div className="relative shrink-0">
        {imageUri && hover && (
          <div className="absolute bottom-6 left-0 z-50 w-36 rounded-lg overflow-hidden shadow-2xl border border-gray-700">
            <img src={imageUri} alt={name} className="w-full" />
          </div>
        )}
        <span className="text-gray-500 text-xs w-5 text-center block">×{quantity}</span>
      </div>

      <span className="text-white text-sm flex-1 truncate">{name}</span>

      {price !== undefined && price > 0 && (
        <span className="text-gray-400 text-xs shrink-0">${price.toFixed(2)}</span>
      )}

      {scryfallId && (
        <a
          href={`https://scryfall.com/card/${scryfallId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-600 hover:text-white transition shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  )
}
