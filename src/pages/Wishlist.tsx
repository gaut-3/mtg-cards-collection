import { useState, useEffect, useCallback } from 'react'
import {
  BookMarked, Plus, Trash2, ChevronDown, ChevronUp,
  ExternalLink, ShoppingCart, Check, ChevronRight, Loader2, Pencil,
} from 'lucide-react'
import { useAuthContext } from '../components/shared/AuthContext'
import { useCollection, useWishlists } from '../hooks/useCollection'
import { parseDeckList, buildDeckDiff, enrichWithPrintings } from '../lib/deckMatcher'
import { getEurToChf } from '../lib/scryfallClient'
import type { DeckDiffResult, DeckDiffMissingEntry, ScryfallPrinting } from '../types/deck'

const PLACEHOLDER = `1 Rhystic Study
1 Smothering Tithe
1 Cyclonic Rift
1 Dockside Extortionist
`
const COLLAPSED_SETS = 5

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtUsd(v: string | null | undefined): string | null {
  const n = parseFloat(v ?? '')
  return isNaN(n) ? null : `$${n.toFixed(2)}`
}
function fmtEur(v: string | null | undefined): string | null {
  const n = parseFloat(v ?? '')
  return isNaN(n) ? null : `€${n.toFixed(2)}`
}
function fmtChf(eurStr: string | null | undefined, rate: number): string | null {
  const n = parseFloat(eurStr ?? '')
  if (isNaN(n)) return null
  return `CHF ~${(n * rate).toFixed(2)}`
}
function setYear(releasedAt: string | undefined): string {
  return releasedAt?.slice(0, 4) ?? ''
}

// ---------------------------------------------------------------------------
// Price block for one finish (non-foil or foil)
// ---------------------------------------------------------------------------
function PriceRow({
  label,
  usd,
  eur,
  eurFoil,
  chfRate,
  foil,
}: {
  label: string
  usd: string | null | undefined
  eur: string | null | undefined
  eurFoil: string | null | undefined
  chfRate: number
  foil: boolean
}) {
  const eurVal = foil ? eurFoil : eur
  const usdFmt = fmtUsd(usd)
  const eurFmt = fmtEur(eurVal)
  const chfFmt = fmtChf(eurVal, chfRate)

  if (!usdFmt && !eurFmt) return null

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className="text-gray-500 text-xs w-16 shrink-0">{label}</span>
      {usdFmt && <span className="text-green-400 text-sm font-semibold">{usdFmt}</span>}
      {eurFmt && <span className="text-blue-400 text-sm font-semibold">{eurFmt}</span>}
      {chfFmt && <span className="text-amber-300 text-sm font-semibold">{chfFmt} <span className="text-gray-600 text-xs font-normal">est.</span></span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Set row (clickable)
// ---------------------------------------------------------------------------
function SetRow({
  printing,
  selected,
  onSelect,
  chfRate,
}: {
  printing: ScryfallPrinting
  selected: boolean
  onSelect: () => void
  chfRate: number
}) {
  const usd = fmtUsd(printing.prices.usd)
  const eur = fmtEur(printing.prices.eur)
  const chf = fmtChf(printing.prices.eur, chfRate)

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition ${
        selected
          ? 'bg-violet-600/20 border border-violet-600/40'
          : 'hover:bg-gray-800 border border-transparent'
      }`}
    >
      {/* checkmark */}
      <div className="w-4 shrink-0">
        {selected && <Check className="w-3.5 h-3.5 text-violet-400" />}
      </div>

      {/* set info */}
      <div className="flex-1 min-w-0">
        <span className="text-white text-xs font-medium">{printing.setName}</span>
        <span className="text-gray-500 text-xs ml-2">
          {printing.setCode.toUpperCase()} · #{printing.collectorNumber} · {setYear(printing.releasedAt)}
        </span>
      </div>

      {/* price summary */}
      <div className="flex gap-2 shrink-0 text-xs">
        {usd && <span className="text-green-400">{usd}</span>}
        {eur && <span className="text-blue-400">{eur}</span>}
        {chf && <span className="text-amber-300">{chf}</span>}
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Full rich card panel for one missing card
// ---------------------------------------------------------------------------
function MissingCardPanel({
  entry,
  chfRate,
  onPrintingsEnriched,
  isExpanded,
  onToggle,
}: {
  entry: DeckDiffMissingEntry
  chfRate: number
  onPrintingsEnriched: (updated: DeckDiffMissingEntry) => void
  isExpanded: boolean
  onToggle: () => void
}) {
  const [loadingPrintings, setLoadingPrintings] = useState(false)
  const [selectedPrintingId, setSelectedPrintingId] = useState<string | null>(null)
  const [showAllSets, setShowAllSets] = useState(false)

  // Kick off printing enrichment as soon as the panel mounts and we don't have data yet
  useEffect(() => {
    if (entry.allPrintings !== undefined) return
    setLoadingPrintings(true)
    enrichWithPrintings(entry, (updated) => {
      onPrintingsEnriched(updated)
      setLoadingPrintings(false)
      // Default select the first (cheapest) printing
      if (updated.allPrintings?.[0]) {
        setSelectedPrintingId(updated.allPrintings[0].scryfallId)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.name])

  // When printings arrive, default-select the cheapest
  useEffect(() => {
    if (entry.allPrintings && entry.allPrintings.length > 0 && !selectedPrintingId) {
      setSelectedPrintingId(entry.allPrintings[0].scryfallId)
    }
  }, [entry.allPrintings, selectedPrintingId])

  const printings = entry.allPrintings ?? []
  const selected: ScryfallPrinting | undefined =
    printings.find((p) => p.scryfallId === selectedPrintingId) ?? printings[0]

  // Use selected printing data if available, else fall back to entry defaults
  const displayImage = selected?.imageUriNormal ?? entry.imageUriNormal
  const displayPrices = selected?.prices ?? entry.prices
  const displayPurchaseUris = selected?.purchaseUris ?? entry.purchaseUris
  const scryfallLink = selected
    ? `https://scryfall.com/card/${selected.setCode}/${selected.collectorNumber}`
    : entry.scryfallId
    ? `https://scryfall.com/card/${entry.scryfallId}`
    : null

  const visibleSets = showAllSets ? printings : printings.slice(0, COLLAPSED_SETS)
  const hiddenCount = printings.length - COLLAPSED_SETS

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition text-left"
      >
        <ChevronRight
          className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
        />
        <span className="text-white font-medium flex-1 truncate">{entry.name}</span>
        <span className="text-red-400 text-sm font-semibold shrink-0">×{entry.quantity} needed</span>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-gray-800 flex flex-col sm:flex-row">
          {/* Card image */}
          <div className="sm:w-40 shrink-0 bg-gray-950 flex items-start justify-center p-3">
            {displayImage ? (
              <a href={scryfallLink ?? '#'} target="_blank" rel="noopener noreferrer">
                <img
                  src={displayImage}
                  alt={entry.name}
                  className="rounded-lg shadow-lg w-full sm:w-36 hover:scale-105 transition duration-200"
                  loading="lazy"
                />
              </a>
            ) : (
              <div className="w-full sm:w-36 aspect-[5/7] bg-gray-800 rounded-lg flex items-center justify-center">
                <span className="text-gray-600 text-xs text-center px-2">{entry.name}</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 p-4 min-w-0 space-y-3">
            {/* Sets list */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-gray-500 text-xs uppercase tracking-wide">Printings</p>
                {loadingPrintings && (
                  <span className="flex items-center gap-1 text-gray-500 text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading…
                  </span>
                )}
              </div>

              {printings.length === 0 && !loadingPrintings && (
                <p className="text-gray-600 text-xs">No printings found.</p>
              )}

              {printings.length > 0 && (
                <div className="space-y-0.5">
                  {visibleSets.map((p) => (
                    <SetRow
                      key={p.scryfallId}
                      printing={p}
                      selected={selectedPrintingId === p.scryfallId}
                      onSelect={() => setSelectedPrintingId(p.scryfallId)}
                      chfRate={chfRate}
                    />
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      onClick={() => setShowAllSets((v) => !v)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition px-3 py-1"
                    >
                      <ChevronRight
                        className={`w-3 h-3 transition ${showAllSets ? 'rotate-90' : ''}`}
                      />
                      {showAllSets ? 'Show fewer' : `Show all ${printings.length} printings`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Price breakdown */}
            {displayPrices && (
              <div className="border-t border-gray-800 pt-3 space-y-1.5">
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">
                  Prices — {selected?.setName ?? entry.setName ?? ''}
                </p>
                <PriceRow
                  label="Non-foil"
                  usd={displayPrices.usd}
                  eur={displayPrices.eur}
                  eurFoil={displayPrices.eur_foil}
                  chfRate={chfRate}
                  foil={false}
                />
                {(displayPrices.usd_foil || displayPrices.eur_foil) && (
                  <PriceRow
                    label="Foil"
                    usd={displayPrices.usd_foil}
                    eur={displayPrices.eur_foil}
                    eurFoil={displayPrices.eur_foil}
                    chfRate={chfRate}
                    foil={true}
                  />
                )}
                {displayPrices.usd_etched && (
                  <PriceRow
                    label="Etched"
                    usd={displayPrices.usd_etched}
                    eur={displayPrices.eur_etched}
                    eurFoil={displayPrices.eur_foil}
                    chfRate={chfRate}
                    foil={true}
                  />
                )}
              </div>
            )}

            {/* Buy links */}
            <div className="flex flex-wrap gap-2 pt-1">
              {displayPurchaseUris?.tcgplayer && (
                <a
                  href={displayPurchaseUris.tcgplayer}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition"
                >
                  TCGPlayer <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {displayPurchaseUris?.cardmarket && (
                <a
                  href={displayPurchaseUris.cardmarket}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition"
                >
                  CardMarket <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {scryfallLink && (
                <a
                  href={scryfallLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition"
                >
                  Scryfall <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compact row for owned cards
// ---------------------------------------------------------------------------
function OwnedRow({ name, quantity, haveQuantity, imageUriNormal, scryfallId }: {
  name: string
  quantity: number
  haveQuantity: number
  imageUriNormal?: string
  scryfallId: string
}) {
  const [hover, setHover] = useState(false)

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-green-900/10 border border-green-900/30"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Check className="w-4 h-4 text-green-500 shrink-0" />

      <div className="relative shrink-0">
        {imageUriNormal && hover && (
          <div className="absolute bottom-6 left-0 z-50 w-36 rounded-lg overflow-hidden shadow-2xl border border-gray-700">
            <img src={imageUriNormal} alt={name} className="w-full" />
          </div>
        )}
        <span className="text-gray-500 text-xs">×{quantity}</span>
      </div>

      <span className="text-white text-sm flex-1 truncate">{name}</span>
      <span className="text-gray-600 text-xs shrink-0">have {haveQuantity}</span>

      <a
        href={`https://scryfall.com/card/${scryfallId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-600 hover:text-white transition shrink-0"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Wishlist() {
  const { user } = useAuthContext()
  const { cards } = useCollection(user?.uid ?? null)
  const { wishlists, save, update, remove } = useWishlists(user?.uid ?? null)

  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [deckText, setDeckText] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [diffs, setDiffs] = useState<Record<string, DeckDiffResult>>({})
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [tab, setTab] = useState<Record<string, 'missing' | 'owned'>>({})
  const [chfRate, setChfRate] = useState(0.95)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDeckText, setEditDeckText] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const startEdit = (id: string, currentName: string, currentDeckText: string) => {
    setEditingId(id)
    setEditName(currentName)
    setEditDeckText(currentDeckText)
    // Collapse expanded panel while editing
    if (expanded === id) setExpanded(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditDeckText('')
  }

  const handleUpdate = async (id: string) => {
    if (!editName.trim() || !editDeckText.trim()) return
    setEditSaving(true)
    await update(id, editName.trim(), editDeckText.trim())
    // Clear cached diff so it re-analyzes on next expand
    setDiffs((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setEditingId(null)
    setEditName('')
    setEditDeckText('')
    setEditSaving(false)
  }

  // Per-wishlist expanded card sets: wlId → Set<cardName>
  const [expandedCards, setExpandedCards] = useState<Record<string, Set<string>>>({})

  const toggleCard = (wlId: string, cardName: string) => {
    setExpandedCards((prev) => {
      const current = new Set(prev[wlId] ?? [])
      current.has(cardName) ? current.delete(cardName) : current.add(cardName)
      return { ...prev, [wlId]: current }
    })
  }

  const expandAll = (wlId: string, names: string[]) => {
    setExpandedCards((prev) => ({ ...prev, [wlId]: new Set(names) }))
  }

  const collapseAll = (wlId: string) => {
    setExpandedCards((prev) => ({ ...prev, [wlId]: new Set() }))
  }

  // Fetch CHF rate once on mount
  useEffect(() => {
    getEurToChf().then(setChfRate)
  }, [])

  const handleSave = async () => {
    if (!name.trim() || !deckText.trim()) return
    setSaving(true)
    await save(name.trim(), deckText.trim())
    setName('')
    setDeckText('')
    setShowNew(false)
    setSaving(false)
  }

  const handleExpand = async (id: string, wlDeckText: string) => {
    if (expanded === id) {
      setExpanded(null)
      setExpandedCards((prev) => ({ ...prev, [id]: new Set() }))
      return
    }
    setExpanded(id)
    if (!diffs[id]) {
      setAnalyzing(id)
      try {
        const lines = parseDeckList(wlDeckText)
        const result = await buildDeckDiff(lines, cards)
        setDiffs((prev) => ({ ...prev, [id]: result }))
        setTab((prev) => ({ ...prev, [id]: 'missing' }))
      } finally {
        setAnalyzing(null)
      }
    }
  }

  // Called by each MissingCardPanel when its printings finish loading
  const handlePrintingsEnriched = useCallback(
    (wlId: string, updated: DeckDiffMissingEntry) => {
      setDiffs((prev) => {
        const diff = prev[wlId]
        if (!diff) return prev
        return {
          ...prev,
          [wlId]: {
            ...diff,
            missing: diff.missing.map((m) =>
              m.name === updated.name ? updated : m
            ),
          },
        }
      })
    },
    []
  )

  return (
    <div className="max-w-3xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BookMarked className="w-6 h-6 text-violet-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Wishlists</h1>
            <p className="text-gray-400 text-sm">
              Save target decklists and track what you still need to buy.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>

      {/* New wishlist form */}
      {showNew && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-white font-medium mb-4">New Wishlist</h2>
          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wishlist name (e.g. Atraxa Superfriends)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
            />
            <textarea
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={8}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-violet-500 transition resize-none"
            />
            <p className="text-gray-600 text-xs">
              Supports: "4 Lightning Bolt", "4x Lightning Bolt (M21) 149"
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !name.trim() || !deckText.trim()}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setShowNew(false)}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {wishlists.length === 0 && !showNew && (
        <div className="text-center py-16 text-gray-600">
          <BookMarked className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No wishlists yet. Create one to track cards you want.</p>
        </div>
      )}

      {/* Wishlist items */}
      <div className="space-y-4">
        {wishlists.map((wl) => {
          const diff = diffs[wl.id]
          const isExpanded = expanded === wl.id
          const isAnalyzing = analyzing === wl.id
          const currentTab = tab[wl.id] ?? 'missing'

          return (
            <div key={wl.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* Wishlist header — edit mode */}
              {editingId === wl.id ? (
                <div className="p-4 space-y-3">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
                    placeholder="Wishlist name"
                    autoFocus
                  />
                  <textarea
                    value={editDeckText}
                    onChange={(e) => setEditDeckText(e.target.value)}
                    rows={8}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-violet-500 transition resize-none"
                    placeholder={PLACEHOLDER}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdate(wl.id)}
                      disabled={editSaving || !editName.trim() || !editDeckText.trim()}
                      className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                    >
                      {editSaving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Wishlist header — view mode */
                <div className="flex items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium">{wl.name}</p>
                    <p className="text-gray-500 text-xs">
                      {new Date(wl.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {diff && (
                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      <span className="text-green-400">{diff.owned.length} owned</span>
                      <span className="text-red-400">{diff.missing.length} missing</span>
                      {diff.totalMissingUsd > 0 && (
                        <span className="text-amber-400 font-semibold">
                          ${diff.totalMissingUsd.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => handleExpand(wl.id, wl.deckText)}
                    className="text-gray-500 hover:text-white transition p-1"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => startEdit(wl.id, wl.name, wl.deckText)}
                    className="text-gray-600 hover:text-violet-400 transition p-1"
                    title="Edit wishlist"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => remove(wl.id)}
                    className="text-gray-600 hover:text-red-400 transition p-1"
                    title="Delete wishlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-800 p-4">
                  {isAnalyzing && (
                    <div className="flex items-center gap-2 text-gray-400 text-sm py-4 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                      Analyzing against your collection…
                    </div>
                  )}

                  {diff && !isAnalyzing && (
                    <div>
                      {/* Completion bar */}
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-4">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{
                            width: `${Math.round(
                              (diff.owned.length /
                                Math.max(1, diff.owned.length + diff.missing.length)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>

                      {/* Tabs + expand/collapse all */}
                      <div className="flex gap-2 mb-4 items-center">
                        {(['missing', 'owned'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setTab((prev) => ({ ...prev, [wl.id]: t }))}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                              currentTab === t
                                ? 'bg-violet-600/20 text-violet-300 border border-violet-600/40'
                                : 'text-gray-500 hover:text-white'
                            }`}
                          >
                            {t === 'missing'
                              ? `Missing (${diff.missing.length})`
                              : `Owned (${diff.owned.length})`}
                          </button>
                        ))}

                        {currentTab === 'missing' && diff.missing.length > 0 && (
                          <button
                            onClick={() => {
                              const wlExpanded = expandedCards[wl.id] ?? new Set()
                              const allExpanded = diff.missing.every((c) => wlExpanded.has(c.name))
                              allExpanded
                                ? collapseAll(wl.id)
                                : expandAll(wl.id, diff.missing.map((c) => c.name))
                            }}
                            className="text-xs text-gray-500 hover:text-white transition"
                          >
                            {diff.missing.every((c) => (expandedCards[wl.id] ?? new Set()).has(c.name))
                              ? 'Collapse all'
                              : 'Expand all'}
                          </button>
                        )}

                        {/* Copy buy list */}
                        {currentTab === 'missing' && diff.missing.length > 0 && (
                          <button
                            onClick={() => {
                              const text = diff.missing
                                .map((c) => `${c.quantity} ${c.name}`)
                                .join('\n')
                              navigator.clipboard.writeText(text)
                            }}
                            className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            Copy buy list
                          </button>
                        )}
                      </div>

                      {/* Missing — rich card panels */}
                      {currentTab === 'missing' && (
                        <div className="space-y-3">
                          {diff.missing.length === 0 && (
                            <p className="text-green-400 text-sm font-medium py-4 text-center">
                              You own all cards in this wishlist!
                            </p>
                          )}
                          {diff.missing.map((entry, i) => (
                            <MissingCardPanel
                              key={`${entry.name}-${i}`}
                              entry={entry}
                              chfRate={chfRate}
                              onPrintingsEnriched={(updated) =>
                                handlePrintingsEnriched(wl.id, updated)
                              }
                              isExpanded={(expandedCards[wl.id] ?? new Set()).has(entry.name)}
                              onToggle={() => toggleCard(wl.id, entry.name)}
                            />
                          ))}
                        </div>
                      )}

                      {/* Owned — compact rows */}
                      {currentTab === 'owned' && (
                        <div className="space-y-1.5">
                          {diff.owned.map((entry, i) => (
                            <OwnedRow
                              key={`${entry.name}-${i}`}
                              name={entry.name}
                              quantity={entry.quantity}
                              haveQuantity={entry.haveQuantity}
                              imageUriNormal={entry.imageUriNormal}
                              scryfallId={entry.scryfallId}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* CHF disclaimer */}
      {Object.keys(diffs).length > 0 && (
        <p className="text-gray-700 text-xs mt-6">
          CHF prices are estimates converted from EUR at the daily rate via frankfurter.app. 
          USD prices from TCGPlayer, EUR prices from CardMarket via Scryfall.
        </p>
      )}
    </div>
  )
}
