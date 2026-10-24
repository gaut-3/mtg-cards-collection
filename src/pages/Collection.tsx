import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Search, SlidersHorizontal, Upload, X } from 'lucide-react'
import { useAuthContext } from '../components/shared/AuthContext'
import { useCollection } from '../hooks/useCollection'
import { useMoxfieldDecks } from '../hooks/useMoxfieldDecks'
import { lookupCardsByName } from '../lib/scryfallClient'
import type { EnrichedCard, ScryfallCard } from '../types/scryfall'
import type { MoxfieldDeckCard } from '../types/moxfield'

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, mythic: 3, special: 4, bonus: 5 }
const COLOR_MAP: Record<string, string> = {
  W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green',
}

const RARITY_COLORS: Record<string, string> = {
  common: 'text-gray-400',
  uncommon: 'text-green-400',
  rare: 'text-amber-400',
  mythic: 'text-orange-400',
  special: 'text-pink-400',
  bonus: 'text-pink-400',
}
const CARD_TYPES = [
  'Creature', 'Instant', 'Sorcery', 'Enchantment',
  'Artifact', 'Planeswalker', 'Land', 'Battle',
]
const FORMATS: { label: string; key: string }[] = [
  { label: 'Standard', key: 'standard' },
  { label: 'Pioneer', key: 'pioneer' },
  { label: 'Modern', key: 'modern' },
  { label: 'Legacy', key: 'legacy' },
  { label: 'Vintage', key: 'vintage' },
  { label: 'Commander', key: 'commander' },
  { label: 'Pauper', key: 'pauper' },
]
const FOIL_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Non-foil', value: 'normal' },
  { label: 'Foil', value: 'foil' },
  { label: 'Etched', value: 'etched' },
]

type SortKey = 'name' | 'price' | 'rarity' | 'cmc' | 'quantity'
type GroupKey = 'none' | 'set' | 'color' | 'rarity' | 'type' | 'binder' | 'cmc'

function deckCardGroup(card: ScryfallCard | undefined, deckName: string, groupBy: GroupKey) {
  switch (groupBy) {
    case 'set': return card?.set_name ?? 'Unknown set'
    case 'color': {
      const identity = card?.color_identity ?? []
      if (identity.length === 0) return 'Colorless'
      if (identity.length > 1) return 'Multicolor'
      return COLOR_MAP[identity[0]] ?? identity[0]
    }
    case 'rarity': return card ? `${card.rarity.charAt(0).toUpperCase()}${card.rarity.slice(1)}` : 'Unknown rarity'
    case 'type': {
      const typeLine = card?.type_line ?? ''
      return CARD_TYPES.find((type) => typeLine.includes(type)) ?? 'Other'
    }
    case 'binder': return `Deck: ${deckName}`
    case 'cmc': return (card?.cmc ?? 0) >= 7 ? '7+' : String(Math.floor(card?.cmc ?? 0))
    default: return ''
  }
}

function cardPrice(card: EnrichedCard): number {
  if (card.foil !== 'normal') {
    return parseFloat(card.prices.usd_foil ?? card.prices.usd ?? '0')
  }
  return parseFloat(card.prices.usd ?? '0')
}

function getCardGroup(card: EnrichedCard, groupBy: GroupKey): string {
  switch (groupBy) {
    case 'set': return card.setName
    case 'color': {
      const ci = card.colorIdentity
      if (ci.length === 0) return 'Colorless'
      if (ci.length > 1) return 'Multicolor'
      return COLOR_MAP[ci[0]] ?? ci[0]
    }
    case 'rarity': return card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)
    case 'type': {
      for (const t of CARD_TYPES) {
        if (card.typeLine.includes(t)) return t
      }
      return 'Other'
    }
    case 'binder': return card.binderName || 'Default'
    case 'cmc': return card.cmc >= 7 ? '7+' : String(Math.floor(card.cmc))
    default: return ''
  }
}

function sortGroups(groups: string[], groupBy: GroupKey): string[] {
  if (groupBy === 'color') {
    const order: string[] = Object.values(COLOR_MAP).concat(['Multicolor', 'Colorless'])
    return groups.sort((a, b) => {
      const ai = order.indexOf(a), bi = order.indexOf(b)
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }
  if (groupBy === 'rarity') {
    const order = ['Common', 'Uncommon', 'Rare', 'Mythic', 'Special', 'Bonus']
    return groups.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  }
  if (groupBy === 'cmc') {
    return groups.sort((a, b) => {
      const an = a === '7+' ? 7 : parseInt(a)
      const bn = b === '7+' ? 7 : parseInt(b)
      return an - bn
    })
  }
  return groups.sort()
}

export default function Collection() {
  const { user } = useAuthContext()
  const { cards, loading, loadCollection } = useCollection(user?.uid ?? null)
  const { decks } = useMoxfieldDecks(user?.uid ?? null)
  const [deckCardMetadata, setDeckCardMetadata] = useState<Map<string, ScryfallCard>>(new Map())

  const [search, setSearch] = useState('')
  const [filterColor, setFilterColor] = useState('')
  const [filterRarity, setFilterRarity] = useState('')
  const [filterSets, setFilterSets] = useState<Set<string>>(new Set())
  const [filterType, setFilterType] = useState('')
  const [filterCmcMin, setFilterCmcMin] = useState('')
  const [filterCmcMax, setFilterCmcMax] = useState('')
  const [filterFoil, setFilterFoil] = useState('')
  const [filterFormat, setFilterFormat] = useState('')
  const [filterBinder, setFilterBinder] = useState('')
  const [groupBy, setGroupBy] = useState<GroupKey>('none')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedCard, setSelectedCard] = useState<EnrichedCard | null>(null)

  useEffect(() => {
    const names = [...new Set(decks.flatMap((deck) => deck.cards.map((card) => card.name)))]
    if (names.length === 0) {
      setDeckCardMetadata(new Map())
      return
    }

    let cancelled = false
    lookupCardsByName(names)
      .then((metadata) => {
        if (!cancelled) setDeckCardMetadata(metadata)
      })
      .catch((error) => console.warn('Could not load metadata for deck cards.', error))

    return () => { cancelled = true }
  }, [decks])

  const sets = useMemo(
    () => [...new Set([
      ...cards.map((card) => card.setName),
      ...[...deckCardMetadata.values()].map((card) => card.set_name),
    ].filter(Boolean))].sort().map((name) => ({ name })),
    [cards, deckCardMetadata]
  )

  const binders = useMemo(
    () => [...new Set([
      ...cards.map((card) => card.binderName).filter(Boolean),
      ...decks.map((deck) => `Deck: ${deck.name}`),
    ])].sort(),
    [cards, decks]
  )

  const filtered = useMemo(() => {
    let result = cards

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.typeLine.toLowerCase().includes(q) ||
          c.oracleText.toLowerCase().includes(q)
      )
    }
    if (filterColor) {
      result = result.filter((c) => c.colorIdentity.includes(filterColor))
    }
    if (filterRarity) {
      result = result.filter((c) => c.rarity === filterRarity)
    }
    if (filterSets.size > 0) {
      result = result.filter((c) => filterSets.has(c.setName))
    }
    if (filterType) {
      result = result.filter((c) => c.typeLine.includes(filterType))
    }
    if (filterCmcMin !== '') {
      result = result.filter((c) => c.cmc >= parseFloat(filterCmcMin))
    }
    if (filterCmcMax !== '') {
      result = result.filter((c) => c.cmc <= parseFloat(filterCmcMax))
    }
    if (filterFoil) {
      result = result.filter((c) => c.foil === filterFoil)
    }
    if (filterFormat) {
      result = result.filter((c) => c.legalities[filterFormat] === 'legal')
    }
    if (filterBinder) {
      result = result.filter((c) => c.binderName === filterBinder)
    }

    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortKey === 'price') cmp = cardPrice(a) - cardPrice(b)
      else if (sortKey === 'rarity')
        cmp = (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0)
      else if (sortKey === 'cmc') cmp = a.cmc - b.cmc
      else if (sortKey === 'quantity') cmp = a.quantity - b.quantity
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [cards, search, filterColor, filterRarity, filterSets, filterType,
      filterCmcMin, filterCmcMax, filterFoil, filterFormat, filterBinder,
      sortKey, sortDir])

  const filteredDecks = useMemo(() => decks.map((deck) => {
    const query = search.trim().toLowerCase()
    const deckNameMatches = !query || deck.name.toLowerCase().includes(query)
    const deckCards = deck.cards
      .map((card, index) => ({
        card,
        index,
        metadata: deckCardMetadata.get(card.name.toLowerCase()),
      }))
      .filter(({ card, metadata }) => {
        const searchMatches = deckNameMatches || [
          card.name,
          metadata?.type_line ?? '',
          metadata?.oracle_text ?? metadata?.card_faces?.[0]?.oracle_text ?? '',
        ].some((value) => value.toLowerCase().includes(query))
        if (query && !searchMatches) return false
        if (filterColor && !metadata?.color_identity.includes(filterColor)) return false
        if (filterRarity && metadata?.rarity !== filterRarity) return false
        if (filterSets.size > 0 && (!metadata || !filterSets.has(metadata.set_name))) return false
        if (filterType && !metadata?.type_line.includes(filterType)) return false
        if (filterCmcMin !== '' && (metadata?.cmc ?? -1) < parseFloat(filterCmcMin)) return false
        if (filterCmcMax !== '' && (metadata?.cmc ?? Number.POSITIVE_INFINITY) > parseFloat(filterCmcMax)) return false
        if (filterFoil && filterFoil !== 'normal') return false
        if (filterFormat && metadata?.legalities[filterFormat] !== 'legal') return false
        if (filterBinder && filterBinder !== `Deck: ${deck.name}`) return false
        return true
      })
      .sort((a, b) => {
        let cmp = 0
        if (sortKey === 'name') cmp = a.card.name.localeCompare(b.card.name)
        else if (sortKey === 'price') {
          cmp = parseFloat(a.metadata?.prices.usd ?? '0') - parseFloat(b.metadata?.prices.usd ?? '0')
        } else if (sortKey === 'rarity') {
          cmp = (RARITY_ORDER[a.metadata?.rarity ?? 'common'] ?? 0) - (RARITY_ORDER[b.metadata?.rarity ?? 'common'] ?? 0)
        } else if (sortKey === 'cmc') cmp = (a.metadata?.cmc ?? 0) - (b.metadata?.cmc ?? 0)
        else if (sortKey === 'quantity') cmp = a.card.quantity - b.card.quantity
        return sortDir === 'asc' ? cmp : -cmp
      })

    const groups = new Map<string, typeof deckCards>()
    for (const entry of deckCards) {
      const group = deckCardGroup(entry.metadata, deck.name, groupBy)
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group)!.push(entry)
    }
    const groupNames = groupBy === 'none' ? [''] : sortGroups([...groups.keys()], groupBy)
    const groupedCards = groupNames.map((label) => ({
      label,
      cards: groupBy === 'none' ? deckCards : groups.get(label) ?? [],
    }))

    return { ...deck, cards: deckCards, groupedCards }
  }), [
    decks, deckCardMetadata, search, filterColor, filterRarity, filterSets,
    filterType, filterCmcMin, filterCmcMax, filterFoil, filterFormat,
    filterBinder, sortKey, sortDir, groupBy,
  ])

  const combinedGroups = useMemo(() => {
    type GridEntry =
      | { key: string; source: 'collection'; card: EnrichedCard }
      | { key: string; source: 'deck'; card: MoxfieldDeckCard; metadata?: ScryfallCard; deckName: string }

    const entries: GridEntry[] = [
      ...filtered.map((card) => ({
        key: `collection:${card.scryfallId}`,
        source: 'collection' as const,
        card,
      })),
      ...filteredDecks.flatMap((deck) => deck.cards.map(({ card, index, metadata }) => ({
        key: `deck:${deck.id}:${card.scryfallId ?? card.name}:${index}`,
        source: 'deck' as const,
        card,
        metadata,
        deckName: deck.name,
      }))),
    ]

    const groupByEntry = (entry: GridEntry) => entry.source === 'collection'
      ? getCardGroup(entry.card, groupBy)
      : deckCardGroup(entry.metadata, entry.deckName, groupBy)
    const groups = new Map<string, GridEntry[]>()
    for (const entry of entries) {
      const label = groupByEntry(entry)
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label)!.push(entry)
    }

    const labels = groupBy === 'none' ? [''] : sortGroups([...groups.keys()], groupBy)
    return labels.map((label) => ({
      label,
      cards: (groups.get(label) ?? []).sort((a, b) => {
        const cardName = (entry: GridEntry) => entry.card.name
        const price = (entry: GridEntry) => entry.source === 'collection'
          ? cardPrice(entry.card)
          : parseFloat(entry.metadata?.prices.usd ?? '0')
        const rarity = (entry: GridEntry) => entry.source === 'collection'
          ? entry.card.rarity
          : entry.metadata?.rarity ?? 'common'
        const cmc = (entry: GridEntry) => entry.source === 'collection'
          ? entry.card.cmc
          : entry.metadata?.cmc ?? 0
        const quantity = (entry: GridEntry) => entry.card.quantity

        let cmp = 0
        if (sortKey === 'name') cmp = cardName(a).localeCompare(cardName(b))
        else if (sortKey === 'price') cmp = price(a) - price(b)
        else if (sortKey === 'rarity') cmp = (RARITY_ORDER[rarity(a)] ?? 0) - (RARITY_ORDER[rarity(b)] ?? 0)
        else if (sortKey === 'cmc') cmp = cmc(a) - cmc(b)
        else if (sortKey === 'quantity') cmp = quantity(a) - quantity(b)
        if (cmp === 0 && a.source !== b.source) cmp = a.source === 'collection' ? -1 : 1
        return sortDir === 'asc' ? cmp : -cmp
      }),
    }))
  }, [filtered, filteredDecks, groupBy, sortKey, sortDir])

  const totalUsd = filtered.reduce((s, c) => s + cardPrice(c) * c.quantity, 0)
  const deckCardCount = filteredDecks.reduce((sum, deck) => sum + deck.cards.length, 0)
  const displayedCardCount = filtered.length + deckCardCount

  const activeFilterCount = [
    filterColor, filterRarity, filterType, filterFoil, filterFormat, filterBinder,
  ].filter(Boolean).length +
    (filterSets.size > 0 ? 1 : 0) +
    (filterCmcMin !== '' || filterCmcMax !== '' ? 1 : 0)

  const clearAll = () => {
    setSearch('')
    setFilterColor('')
    setFilterRarity('')
    setFilterSets(new Set())
    setFilterType('')
    setFilterCmcMin('')
    setFilterCmcMax('')
    setFilterFoil('')
    setFilterFormat('')
    setFilterBinder('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (cards.length === 0 && decks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-400">No cards yet. Import your ManaBox collection to get started.</p>
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

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const selectClass = "bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Collection</h1>
          <p className="text-gray-500 text-sm">
            {filtered.length} owned · {deckCardCount} deck cards · ${totalUsd.toFixed(2)} owned value
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadCollection(true)}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-3 py-2 rounded-lg text-sm transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            to="/upload"
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm transition"
          >
            <Upload className="w-4 h-4" />
            Re-import
          </Link>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cards…"
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition ${
            showFilters
              ? 'bg-violet-600/20 text-violet-300 border border-violet-600/40'
              : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 bg-violet-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-4 mb-4 p-4 bg-gray-900 border border-gray-800 rounded-xl">

          {/* Color */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Color</label>
            <select value={filterColor} onChange={(e) => setFilterColor(e.target.value)} className={selectClass}>
              <option value="">All</option>
              {Object.entries(COLOR_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
              <option value="C">Colorless</option>
            </select>
          </div>

          {/* Rarity */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rarity</label>
            <select value={filterRarity} onChange={(e) => setFilterRarity(e.target.value)} className={selectClass}>
              <option value="">All</option>
              {['common', 'uncommon', 'rare', 'mythic'].map((r) => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Card type</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={selectClass}>
              <option value="">All</option>
              {CARD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* CMC range */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">CMC</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                value={filterCmcMin}
                onChange={(e) => setFilterCmcMin(e.target.value)}
                placeholder="Min"
                className={`${selectClass} w-16 text-center`}
              />
              <span className="text-gray-600 text-xs">to</span>
              <input
                type="number"
                min={0}
                value={filterCmcMax}
                onChange={(e) => setFilterCmcMax(e.target.value)}
                placeholder="Max"
                className={`${selectClass} w-16 text-center`}
              />
            </div>
          </div>

          {/* Foil */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Finish</label>
            <div className="flex gap-1">
              {FOIL_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setFilterFoil(o.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                    filterFoil === o.value
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Format legality */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Format legal in</label>
            <select value={filterFormat} onChange={(e) => setFilterFormat(e.target.value)} className={selectClass}>
              <option value="">All</option>
              {FORMATS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Binder */}
          {binders.length > 1 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Binder</label>
              <select value={filterBinder} onChange={(e) => setFilterBinder(e.target.value)} className={selectClass}>
                <option value="">All</option>
                {binders.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sets */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">
                Sets{filterSets.size > 0 && (
                  <span className="ml-1 text-violet-400">({filterSets.size} selected)</span>
                )}
              </label>
              {filterSets.size > 0 && (
                <button onClick={() => setFilterSets(new Set())} className="text-xs text-gray-600 hover:text-white transition">
                  Clear
                </button>
              )}
            </div>
            <select
              multiple
              size={5}
              value={[...filterSets]}
              onChange={(e) => {
                setFilterSets(new Set(Array.from(e.target.selectedOptions).map((o) => o.value)))
              }}
              className={`${selectClass} w-52`}
            >
              {sets.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
            <p className="text-gray-600 text-xs mt-1">Ctrl+click to select multiple</p>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sort by</label>
            <div className="flex gap-1 flex-wrap">
              {(['name', 'price', 'rarity', 'cmc', 'quantity'] as SortKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => toggleSort(k)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                    sortKey === k
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {k}{sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Group by */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Group by</label>
            <div className="flex gap-1 flex-wrap">
              {(['none', 'set', 'rarity', 'color', 'type', 'binder', 'cmc'] as GroupKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setGroupBy(k)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                    groupBy === k
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {k === 'none' ? 'None' : k.charAt(0).toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-white mt-5 transition"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      )}

      <div className="flex justify-end mb-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-300">
          <span className="w-3 h-3 rounded border-2 border-amber-400" /> Deck card
        </span>
      </div>

      {/* Owned and deck cards share the same searchable, filterable grid. */}
      {combinedGroups.map(({ label, cards: groupCards }) => (
        <div key={label || '__all'} className="mb-6">
          {/* Group header */}
          {groupBy !== 'none' && (
            <div className="flex items-center gap-3 mb-3">
              <span className="text-white font-semibold text-sm">{label}</span>
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-gray-600 text-xs shrink-0">{groupCards.length} cards</span>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {groupCards.map((entry) => (
              entry.source === 'collection' ? (
                <CardTile key={entry.key} card={entry.card} onClick={() => setSelectedCard(entry.card)} />
              ) : (
                <DeckCardTile key={entry.key} card={entry.card} metadata={entry.metadata} />
              )
            ))}
          </div>
        </div>
      ))}

      {displayedCardCount === 0 && (
        <div className="text-center py-16 text-gray-500">No cards match your filters.</div>
      )}

      {/* Card detail modal */}
      {selectedCard && (
        <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  )
}

function CardTile({ card, onClick }: { card: EnrichedCard; onClick: () => void }) {
  const img = card.imageUris?.normal
  const price = cardPrice(card)

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl overflow-hidden bg-gray-900 border border-gray-800 hover:border-violet-600/50 transition shadow hover:shadow-violet-900/30"
    >
      {img ? (
        <img
          src={img}
          alt={card.name}
          loading="lazy"
          className="w-full object-cover aspect-[5/7] group-hover:scale-105 transition duration-300"
        />
      ) : (
        <div className="w-full aspect-[5/7] bg-gray-800 flex items-center justify-center text-gray-600 text-xs p-2 text-center">
          {card.name}
        </div>
      )}
      <div className="px-2 py-1.5">
        <p className={`text-xs font-medium truncate ${RARITY_COLORS[card.rarity] ?? 'text-gray-300'}`}>
          {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}
        </p>
        <p className="text-white text-xs font-semibold truncate">{card.name}</p>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-gray-400 text-xs">×{card.quantity}</span>
          <span className="text-green-400 text-xs">${price.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

function DeckCardTile({ card, metadata }: { card: MoxfieldDeckCard; metadata?: ScryfallCard }) {
  const imageUri = card.imageUriNormal ?? metadata?.image_uris?.normal ?? metadata?.card_faces?.[0]?.image_uris?.normal
  const scryfallId = card.scryfallId ?? metadata?.id

  return (
    <div className="group rounded-xl overflow-hidden bg-gray-900 border-2 border-amber-500/70 shadow shadow-amber-950/30">
      {scryfallId && imageUri ? (
        <a href={`https://scryfall.com/card/${scryfallId}`} target="_blank" rel="noopener noreferrer">
          <img
            src={imageUri}
            alt={card.name}
            loading="lazy"
            className="w-full object-cover aspect-[5/7] group-hover:scale-105 transition duration-300"
          />
        </a>
      ) : (
        <div className="w-full aspect-[5/7] bg-gray-800 flex items-center justify-center text-gray-500 text-xs p-2 text-center">
          {card.name}
        </div>
      )}
      <div className="px-2 py-1.5">
        <span className="inline-flex rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
          Deck card
        </span>
        <p className="mt-1 text-white text-xs font-semibold truncate" title={card.name}>{card.name}</p>
        <div className="flex items-center justify-between mt-0.5">
          {card.board === 'commander' && <span className="text-violet-300 text-[10px]">Commander</span>}
          <span className="ml-auto text-gray-400 text-xs">×{card.quantity}</span>
        </div>
      </div>
    </div>
  )
}

function CardModal({ card, onClose }: { card: EnrichedCard; onClose: () => void }) {
  const price = cardPrice(card)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col sm:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {card.imageUris?.normal && (
          <div className="sm:w-64 shrink-0 bg-gray-950 flex items-center justify-center p-2">
            <img src={card.imageUris.normal} alt={card.name} className="w-full h-full object-contain rounded-xl" />
          </div>
        )}

        <div className="p-5 flex flex-col gap-3 flex-1 overflow-y-auto">
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">{card.name}</h2>
            <p className="text-gray-400 text-sm">{card.typeLine}</p>
          </div>

          {card.oracleText && (
            <p className="text-gray-300 text-sm leading-relaxed border-l-2 border-gray-700 pl-3">
              {card.oracleText}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Set" value={`${card.setName} (${card.setCode.toUpperCase()})`} />
            <Stat label="Collector #" value={card.collectorNumber} />
            <Stat label="CMC" value={String(card.cmc)} />
            <Stat label="Rarity" value={card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)} />
            <Stat label="Quantity" value={`×${card.quantity}`} />
            <Stat label="Condition" value={card.condition || '—'} />
            <Stat label="Foil" value={card.foil !== 'normal' ? card.foil : 'No'} />
            <Stat label="Language" value={card.language.toUpperCase()} />
            <Stat label="Binder" value={card.binderName || '—'} />
          </div>

          <div className="flex gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs">USD</p>
              <p className="text-green-400 font-semibold">${price.toFixed(2)}</p>
            </div>
            {card.prices.eur && (
              <div>
                <p className="text-gray-500 text-xs">EUR</p>
                <p className="text-blue-400 font-semibold">€{parseFloat(card.prices.eur).toFixed(2)}</p>
              </div>
            )}
            <div>
              <p className="text-gray-500 text-xs">Paid (CHF)</p>
              <p className="text-gray-300 font-semibold">CHF {card.purchasePrice.toFixed(2)}</p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap mt-auto pt-2">
            <a href={card.scryfallUri} target="_blank" rel="noopener noreferrer"
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition">
              Scryfall
            </a>
            {card.purchaseUris?.tcgplayer && (
              <a href={card.purchaseUris.tcgplayer} target="_blank" rel="noopener noreferrer"
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition">
                TCGPlayer
              </a>
            )}
            {card.purchaseUris?.cardmarket && (
              <a href={card.purchaseUris.cardmarket} target="_blank" rel="noopener noreferrer"
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition">
                CardMarket
              </a>
            )}
          </div>
        </div>

        <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-white transition">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-white text-xs font-medium">{value}</p>
    </div>
  )
}
