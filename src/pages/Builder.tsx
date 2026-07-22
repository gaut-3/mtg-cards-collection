/**
 * Builder.tsx
 *
 * "What Commander decks can I build?" page.
 *
 * TO REMOVE: delete this file + deckBuilder.ts, remove /builder route from
 * App.tsx, remove Builder link from Navbar.tsx.
 */

import { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Wand2, ChevronDown, ChevronUp, Copy, Check,
  AlertTriangle, Upload, Sparkles,
} from 'lucide-react'
import { useAuthContext } from '../components/shared/AuthContext'
import { useCollection } from '../hooks/useCollection'
import {
  analyzeCollection,
  deckToText,
  type CommanderCandidate,
  type RoleCoverage,
} from '../lib/deckBuilder'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLOR_PIPS: Record<string, { bg: string; text: string; label: string }> = {
  W: { bg: 'bg-yellow-100', text: 'text-yellow-900', label: 'W' },
  U: { bg: 'bg-blue-600',   text: 'text-white',      label: 'U' },
  B: { bg: 'bg-gray-800',   text: 'text-gray-100',   label: 'B' },
  R: { bg: 'bg-red-600',    text: 'text-white',       label: 'R' },
  G: { bg: 'bg-green-600',  text: 'text-white',       label: 'G' },
}

const ROLE_META: {
  key: keyof RoleCoverage
  label: string
  target: number
  icon: string
}[] = [
  { key: 'ramp',       label: 'Ramp',       target: 6,  icon: '⚡' },
  { key: 'draw',       label: 'Draw',       target: 5,  icon: '📖' },
  { key: 'removal',    label: 'Removal',    target: 4,  icon: '⚔️' },
  { key: 'wipe',       label: 'Wipes',      target: 2,  icon: '💥' },
  { key: 'tutor',      label: 'Tutors',     target: 1,  icon: '🔍' },
  { key: 'protection', label: 'Protection', target: 2,  icon: '🛡️' },
  { key: 'wincon',     label: 'Win-cons',   target: 4,  icon: '👑' },
]

const SORT_OPTIONS = [
  { key: 'score',   label: 'Buildability' },
  { key: 'pool',    label: 'Pool size' },
  { key: 'staples', label: 'Staples' },
  { key: 'name',    label: 'Name' },
]

type SortKey = 'score' | 'pool' | 'staples' | 'name'

const COLOR_FILTER_OPTIONS = [
  { value: '',  label: 'All colors' },
  { value: 'W', label: 'White' },
  { value: 'U', label: 'Blue' },
  { value: 'B', label: 'Black' },
  { value: 'R', label: 'Red' },
  { value: 'G', label: 'Green' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ColorPip({ color }: { color: string }) {
  const meta = COLOR_PIPS[color]
  if (!meta) return null
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${meta.bg} ${meta.text}`}>
      {meta.label}
    </span>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? 'text-green-400 border-green-700 bg-green-900/20'
    : score >= 45 ? 'text-amber-400 border-amber-700 bg-amber-900/20'
    : 'text-red-400 border-red-800 bg-red-900/20'
  return (
    <span className={`text-xs font-bold border rounded-lg px-2 py-0.5 ${color}`}>
      {score}%
    </span>
  )
}

function RoleBar({
  role,
}: {
  role: { key: keyof RoleCoverage; label: string; target: number; icon: string }
  count: number
}) {
  return role as any // placeholder — used inline below
}
void RoleBar // suppress unused warning

// ---------------------------------------------------------------------------
// Deck detail panel
// ---------------------------------------------------------------------------

function DeckDetail({
  candidate,
  onClose,
}: {
  candidate: CommanderCandidate
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const deckText = deckToText(candidate.card, candidate.suggestedDeck)

  const copyDeck = () => {
    navigator.clipboard.writeText(deckText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sendToAnalyzer = () => {
    // Store in sessionStorage so the Decks page can pick it up
    sessionStorage.setItem('builder_deck', deckText)
    navigate('/decks')
  }

  // Group suggested deck by type
  const byType = useMemo(() => {
    const groups: Record<string, typeof candidate.suggestedDeck> = {}
    for (const card of candidate.suggestedDeck) {
      const type =
        card.typeLine.includes('Creature') ? 'Creatures'
        : card.typeLine.includes('Instant') ? 'Instants'
        : card.typeLine.includes('Sorcery') ? 'Sorceries'
        : card.typeLine.includes('Enchantment') ? 'Enchantments'
        : card.typeLine.includes('Artifact') ? 'Artifacts'
        : card.typeLine.includes('Planeswalker') ? 'Planeswalkers'
        : 'Other'
      if (!groups[type]) groups[type] = []
      groups[type].push(card)
    }
    return groups
  }, [candidate.suggestedDeck])

  const typeOrder = ['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Other']

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl my-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 p-5 border-b border-gray-800">
          {candidate.card.imageUris?.normal && (
            <img
              src={candidate.card.imageUris.normal}
              alt={candidate.card.name}
              className="w-24 rounded-lg shadow-lg shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-white font-bold text-xl">{candidate.card.name}</h2>
              <ScoreBadge score={candidate.buildabilityScore} />
            </div>
            <p className="text-gray-400 text-sm mb-2">{candidate.card.typeLine}</p>
            <div className="flex gap-1">
              {candidate.card.colorIdentity.map((c) => (
                <ColorPip key={c} color={c} />
              ))}
              {candidate.card.colorIdentity.length === 0 && (
                <span className="text-gray-600 text-xs">Colorless</span>
              )}
            </div>
            <p className="text-gray-500 text-xs mt-2">
              {candidate.eligiblePool.length} eligible cards from your collection ·{' '}
              {candidate.suggestedDeck.length} in suggested deck + ~35 basics
            </p>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition shrink-0">
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>

        {/* Role coverage */}
        <div className="p-5 border-b border-gray-800">
          <h3 className="text-white font-semibold text-sm mb-3">Role Coverage</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ROLE_META.map((role) => {
              const count = candidate.coverage[role.key].length
              const pct = Math.min(100, Math.round((count / role.target) * 100))
              const good = count >= role.target
              const warn = count > 0 && count < role.target
              return (
                <div key={role.key} className="bg-gray-800 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">{role.icon} {role.label}</span>
                    <span className={`text-xs font-bold ${good ? 'text-green-400' : warn ? 'text-amber-400' : 'text-red-400'}`}>
                      {count}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${good ? 'bg-green-500' : warn ? 'bg-amber-500' : 'bg-red-600'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-gray-600 text-xs mt-1">target {role.target}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Gaps */}
        {candidate.gaps.length > 0 && (
          <div className="px-5 py-3 border-b border-gray-800 flex flex-wrap gap-2">
            {candidate.gaps.map((gap, i) => (
              <span key={i} className="flex items-center gap-1 text-xs text-amber-400 bg-amber-900/20 border border-amber-800/40 px-2 py-1 rounded-lg">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {gap}
              </span>
            ))}
          </div>
        )}

        {/* Suggested deck cards */}
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm">
              Suggested Deck ({candidate.suggestedDeck.length} cards)
            </h3>
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs text-gray-500 hover:text-white transition"
            >
              {showAll ? 'Show less' : 'Show all cards'}
            </button>
          </div>

          {showAll ? (
            <div className="space-y-4">
              {typeOrder.map((type) => {
                const group = byType[type]
                if (!group?.length) return null
                return (
                  <div key={type}>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">
                      {type} ({group.length})
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {group.map((card) => (
                        <div key={card.scryfallId} className="flex items-center gap-2 bg-gray-800 rounded-lg p-2">
                          {card.imageUris?.small && (
                            <img src={card.imageUris.small} alt={card.name} className="w-8 rounded shrink-0" />
                          )}
                          <span className="text-white text-xs truncate">{card.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              <p className="text-gray-600 text-xs">+ ~35 basic lands (not in your collection)</p>
            </div>
          ) : (
            // Preview — top 8 cards as images
            <div>
              <div className="flex gap-2 flex-wrap">
                {candidate.suggestedDeck.slice(0, 8).map((card) => (
                  card.imageUris?.normal && (
                    <img
                      key={card.scryfallId}
                      src={card.imageUris.normal}
                      alt={card.name}
                      title={card.name}
                      className="w-16 rounded-lg shadow"
                    />
                  )
                ))}
                {candidate.suggestedDeck.length > 8 && (
                  <div className="w-16 aspect-[5/7] bg-gray-800 rounded-lg flex items-center justify-center">
                    <span className="text-gray-500 text-xs text-center">+{candidate.suggestedDeck.length - 8}</span>
                  </div>
                )}
              </div>
              <p className="text-gray-600 text-xs mt-2">Click "Show all cards" to see the full list</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-5 flex flex-wrap gap-3">
          <button
            onClick={copyDeck}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm transition"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy decklist'}
          </button>
          <button
            onClick={sendToAnalyzer}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            <Sparkles className="w-4 h-4" />
            Analyze in Deck Analyzer
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Commander card (list item)
// ---------------------------------------------------------------------------

function CommanderCard({
  candidate,
  onSelect,
}: {
  candidate: CommanderCandidate
  onSelect: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className="group cursor-pointer bg-gray-900 border border-gray-800 hover:border-violet-600/50 rounded-xl p-4 flex gap-4 transition hover:shadow-lg hover:shadow-violet-900/20"
    >
      {/* Card image */}
      <div className="shrink-0">
        {candidate.card.imageUris?.normal ? (
          <img
            src={candidate.card.imageUris.normal}
            alt={candidate.card.name}
            className="w-20 rounded-lg shadow group-hover:scale-105 transition duration-200"
          />
        ) : (
          <div className="w-20 aspect-[5/7] bg-gray-800 rounded-lg flex items-center justify-center">
            <span className="text-gray-600 text-xs text-center px-1">{candidate.card.name}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-white font-bold text-base leading-tight truncate">{candidate.card.name}</h3>
          <ScoreBadge score={candidate.buildabilityScore} />
        </div>

        <p className="text-gray-500 text-xs mb-2 truncate">{candidate.card.typeLine}</p>

        {/* Color pips */}
        <div className="flex gap-1 mb-3">
          {candidate.card.colorIdentity.map((c) => (
            <ColorPip key={c} color={c} />
          ))}
          {candidate.card.colorIdentity.length === 0 && (
            <span className="text-gray-600 text-xs">Colorless</span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
          <span>{candidate.eligiblePool.length} eligible cards</span>
          <span>{candidate.stapleCount} staples</span>
          <span>{candidate.suggestedDeck.length} suggested</span>
        </div>

        {/* Role coverage pills */}
        <div className="flex flex-wrap gap-1">
          {ROLE_META.map((role) => {
            const count = candidate.coverage[role.key].length
            if (count === 0) return null
            const good = count >= role.target
            const warn = !good
            return (
              <span
                key={role.key}
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  good
                    ? 'bg-green-900/30 text-green-400'
                    : warn
                    ? 'bg-amber-900/30 text-amber-400'
                    : 'bg-red-900/30 text-red-400'
                }`}
              >
                {role.icon} {count} {role.label}
              </span>
            )
          })}
          {candidate.gaps.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 font-medium">
              ⚠ {candidate.gaps.length} gap{candidate.gaps.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 self-center text-gray-600 group-hover:text-violet-400 transition">
        <ChevronDown className="w-5 h-5" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Builder() {
  const { user } = useAuthContext()
  const { cards, loading } = useCollection(user?.uid ?? null)

  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [filterColor, setFilterColor] = useState('')
  const [selected, setSelected] = useState<CommanderCandidate | null>(null)

  // Analyze once — memoized on cards
  const candidates = useMemo(() => analyzeCollection(cards), [cards])

  const displayed = useMemo(() => {
    let result = [...candidates]

    if (filterColor) {
      result = result.filter((c) =>
        c.card.colorIdentity.includes(filterColor)
      )
    }

    result.sort((a, b) => {
      if (sortKey === 'score') return b.buildabilityScore - a.buildabilityScore
      if (sortKey === 'pool') return b.eligiblePool.length - a.eligiblePool.length
      if (sortKey === 'staples') return b.stapleCount - a.stapleCount
      if (sortKey === 'name') return a.card.name.localeCompare(b.card.name)
      return 0
    })

    return result
  }, [candidates, sortKey, filterColor])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-400">Import your collection first to discover what decks you can build.</p>
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
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Wand2 className="w-6 h-6 text-violet-400" />
        <h1 className="text-2xl font-bold text-white">Deck Builder</h1>
      </div>
      <p className="text-gray-400 text-sm mb-6">
        {candidates.length} possible Commander decks from your collection. Scores are based on
        eligible card pool size, role coverage, and EDHREC staple density.
      </p>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        {/* Sort */}
        <div className="flex gap-1">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setSortKey(o.key as SortKey)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                sortKey === o.key
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Color filter */}
        <select
          value={filterColor}
          onChange={(e) => setFilterColor(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500 ml-auto"
        >
          {COLOR_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Score legend */}
      <div className="flex gap-4 mb-4 text-xs text-gray-600">
        <span className="text-green-400">■</span> 70%+ great
        <span className="text-amber-400 ml-2">■</span> 45–69% decent
        <span className="text-red-400 ml-2">■</span> &lt;45% thin pool
      </div>

      {/* Commander list */}
      {displayed.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-12">
          No commanders found matching your filters.
        </p>
      )}

      <div className="space-y-3">
        {displayed.map((candidate) => (
          <CommanderCard
            key={candidate.card.scryfallId}
            candidate={candidate}
            onSelect={() => setSelected(candidate)}
          />
        ))}
      </div>

      {/* Disclaimer */}
      <p className="text-gray-700 text-xs mt-6">
        Suggestions are based on color identity rules, Commander legality, and EDHREC popularity
        rankings from Scryfall. Role detection uses oracle text pattern matching. Basic lands are
        excluded from the eligible pool — add ~35 basics to complete any deck.
      </p>

      {/* Detail modal */}
      {selected && (
        <DeckDetail
          candidate={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
