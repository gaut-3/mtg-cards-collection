import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Upload } from 'lucide-react'
import { useAuthContext } from '../components/shared/AuthContext'
import { useCollection, usePriceHistory } from '../hooks/useCollection'
import type { EnrichedCard } from '../types/scryfall'

const RARITY_COLORS: Record<string, string> = {
  common: '#6b7280',
  uncommon: '#4ade80',
  rare: '#fbbf24',
  mythic: '#f97316',
  special: '#e879f9',
  bonus: '#e879f9',
}

const MANA_COLORS: Record<string, string> = {
  W: '#f9fafb',
  U: '#60a5fa',
  B: '#a855f7',
  R: '#f87171',
  G: '#4ade80',
  C: '#9ca3af',
}

function cardPrice(card: EnrichedCard): number {
  if (card.foil !== 'normal') {
    return parseFloat(card.prices.usd_foil ?? card.prices.usd ?? '0')
  }
  return parseFloat(card.prices.usd ?? '0')
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className="text-white text-2xl font-bold">{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuthContext()
  const { cards, loading } = useCollection(user?.uid ?? null)
  const snapshots = usePriceHistory(user?.uid ?? null)

  const stats = useMemo(() => {
    if (!cards.length) return null

    const totalCards = cards.reduce((s, c) => s + c.quantity, 0)
    const totalUsd = cards.reduce((s, c) => s + cardPrice(c) * c.quantity, 0)
    const totalEur = cards.reduce((s, c) => {
      const p = c.foil !== 'normal'
        ? parseFloat(c.prices.eur_foil ?? c.prices.eur ?? '0')
        : parseFloat(c.prices.eur ?? '0')
      return s + p * c.quantity
    }, 0)

    // Rarity breakdown
    const rarityMap: Record<string, number> = {}
    for (const card of cards) {
      rarityMap[card.rarity] = (rarityMap[card.rarity] ?? 0) + card.quantity
    }
    const rarityData = Object.entries(rarityMap).map(([name, value]) => ({ name, value }))

    // Color distribution
    const colorMap: Record<string, number> = {}
    for (const card of cards) {
      if (card.colorIdentity.length === 0) {
        colorMap['C'] = (colorMap['C'] ?? 0) + card.quantity
      } else {
        for (const c of card.colorIdentity) {
          colorMap[c] = (colorMap[c] ?? 0) + card.quantity
        }
      }
    }
    const colorData = Object.entries(colorMap)
      .map(([name, value]) => ({ name, value, fill: MANA_COLORS[name] ?? '#6b7280' }))
      .sort((a, b) => b.value - a.value)

    // Set completion
    const setMap: Record<string, { have: number; name: string }> = {}
    for (const card of cards) {
      if (!setMap[card.setCode]) {
        setMap[card.setCode] = { have: 0, name: card.setName }
      }
      setMap[card.setCode].have += card.quantity
    }
    const setData = Object.entries(setMap)
      .map(([code, { have, name }]) => ({ code, name, have }))
      .sort((a, b) => b.have - a.have)
      .slice(0, 10)

    // Top valuable cards
    const topCards = [...cards]
      .sort((a, b) => cardPrice(b) * b.quantity - cardPrice(a) * a.quantity)
      .slice(0, 8)

    return { totalCards, totalUsd, totalEur, rarityData, colorData, setData, topCards }
  }, [cards])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-400">Import your collection to see your dashboard.</p>
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total cards" value={stats.totalCards.toLocaleString()} />
        <StatCard label="Unique cards" value={cards.length.toLocaleString()} />
        <StatCard label="Value (USD)" value={`$${stats.totalUsd.toFixed(2)}`} />
        <StatCard label="Value (EUR)" value={`€${stats.totalEur.toFixed(2)}`} />
      </div>

      {/* Price history */}
      {snapshots.length > 1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Collection Value Over Time (USD)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={snapshots}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={(d) => d.slice(5)}
              />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Value']}
              />
              <Line
                type="monotone"
                dataKey="totalUsd"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ fill: '#8b5cf6', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Rarity breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Rarity Breakdown</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={stats.rarityData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {stats.rarityData.map((entry) => (
                  <Cell key={entry.name} fill={RARITY_COLORS[entry.name] ?? '#6b7280'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v) => [Number(v), 'Cards']}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Color distribution */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Color Identity Distribution</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.colorData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v) => [Number(v), 'Cards']}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {stats.colorData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top sets */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">Top Sets by Card Count</h2>
        <div className="space-y-2">
          {stats.setData.map((set) => {
            const max = stats.setData[0].have
            const pct = Math.round((set.have / max) * 100)
            return (
              <div key={set.code} className="flex items-center gap-3">
                <span className="text-gray-400 text-xs w-8 shrink-0">{set.code.toUpperCase()}</span>
                <div className="flex-1 h-5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-600/70 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-gray-400 text-xs w-8 text-right shrink-0">{set.have}</span>
                <span className="text-gray-600 text-xs hidden md:block truncate max-w-40">{set.name}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top valuable cards */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">Most Valuable Cards</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
          {stats.topCards.map((card) => {
            const price = cardPrice(card)
            return (
              <div key={card.scryfallId} className="text-center">
                {card.imageUris?.normal ? (
                  <img
                    src={card.imageUris.normal}
                    alt={card.name}
                    className="rounded-lg w-full shadow"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full aspect-[5/7] bg-gray-800 rounded-lg flex items-center justify-center text-gray-600 text-xs p-1">
                    {card.name}
                  </div>
                )}
                <p className="text-green-400 text-xs font-semibold mt-1">${(price * card.quantity).toFixed(2)}</p>
                <p className="text-gray-500 text-xs truncate">{card.name}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
