import { useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, Image, Layers, Loader2, Plus, Search } from 'lucide-react'
import { useAuthContext } from '../components/shared/AuthContext'
import { useMoxfieldDecks } from '../hooks/useMoxfieldDecks'
import type { MoxfieldDeck, MoxfieldDeckCard } from '../types/moxfield'

function CardImageGrid({ cards }: { cards: MoxfieldDeckCard[] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3">
      {cards.map((card, i) => {
        const tile = card.imageUriNormal ? (
          <img
            src={card.imageUriNormal}
            alt={card.name}
            className="w-full rounded-lg shadow-lg transition duration-200 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="aspect-[5/7] rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center p-2">
            <span className="text-gray-500 text-xs text-center">{card.name}</span>
          </div>
        )

        return (
          <div key={`${card.name}-${card.board}-${i}`} className="group">
            <div className="relative">
              {card.scryfallId ? (
                <a
                  href={`https://scryfall.com/card/${card.scryfallId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={card.name}
                  className="block"
                >
                  {tile}
                </a>
              ) : (
                <div title={card.name}>{tile}</div>
              )}
              <div className="absolute right-1.5 bottom-1.5 rounded-full bg-black/85 px-2 py-0.5 text-xs font-bold text-white shadow">
                ×{card.quantity}
              </div>
              {card.board === 'commander' && (
                <div className="absolute left-1.5 top-1.5 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                  Cmd
                </div>
              )}
            </div>
            <p className="mt-1.5 text-xs text-gray-300 leading-tight line-clamp-2" title={card.name}>
              {card.name}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function filterDeck(deck: MoxfieldDeck, query: string): MoxfieldDeck | null {
  const q = query.trim().toLowerCase()
  if (!q) return deck

  const deckMatches = deck.name.toLowerCase().includes(q)
  const matchingCards = deck.cards.filter((card) => card.name.toLowerCase().includes(q))
  if (!deckMatches && matchingCards.length === 0) return null


  return {
    ...deck,
    cards: deckMatches ? deck.cards : matchingCards,
  }
}

function decodeImportPayload(hash: string): { name?: string; url?: string; text?: string } | null {
  if (!hash.startsWith('#moxfield-import=')) return null

  try {
    const encoded = hash.slice('#moxfield-import='.length)
    const json = decodeURIComponent(escape(atob(encoded)))
    return JSON.parse(json)
  } catch {
    return null
  }
}

function bookmarkletCode(appUrl: string) {
  return `javascript:(async()=>{const u=location.href;if(!new RegExp('moxfield\\\\.com/decks/','i').test(u)){alert('Open a Moxfield deck page first.');return}const name=(document.querySelector('h1')?.innerText||document.title.replace(/\\s*-\\s*Moxfield.*$/,'')||'Moxfield deck').trim();const id=(u.match(new RegExp('moxfield\\\\.com/decks/([^/?#]+)','i'))||[])[1];let text='';try{const r=await fetch('https://api2.moxfield.com/v2/decks/all/'+id+'/export?arenaOnly=false&format=full&includeFinish=true&pricingProvider=cardkingdom&ignoreFlavorNames=false',{credentials:'include'});if(r.ok)text=await r.text();if(/^\\s*(<!doctype html|<html)/i.test(text))text=''}catch(e){}if(!text.trim())text=prompt('Could not read the export automatically. Paste Moxfield export text here:')||'';if(!text.trim())return;const data=btoa(unescape(encodeURIComponent(JSON.stringify({name,url:u,text}))));location.href='${appUrl}/moxfield#moxfield-import='+data})()`
}

function currentAppUrl() {
  return window.location.hostname === 'localhost'
    ? 'https://mtg-cards-56fbc.web.app'
    : window.location.origin
}

export default function Moxfield() {
  const { user } = useAuthContext()
  const { decks, loading, syncing, error, importFromText } = useMoxfieldDecks(user?.uid ?? null)
  const [showImport, setShowImport] = useState(decks.length === 0)
  const [deckName, setDeckName] = useState('')
  const [deckUrl, setDeckUrl] = useState('')
  const [deckText, setDeckText] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'decks' | 'images'>('images')
  const [lastImportName, setLastImportName] = useState('')
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false)

  useEffect(() => {
    const payload = decodeImportPayload(window.location.hash)
    if (!payload) return

    setDeckName(payload.name ?? '')
    setDeckUrl(payload.url ?? '')
    setDeckText(payload.text ?? '')
    setShowImport(true)
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const filteredDecks = useMemo(
    () => decks.map((deck) => filterDeck(deck, search)).filter(Boolean) as MoxfieldDeck[],
    [decks, search]
  )

  const handleImport = async () => {
    const imported = await importFromText({
      name: deckName,
      deckText,
      publicUrl: deckUrl || undefined,
    })
    if (!imported) return
    setLastImportName(imported.name)
    setDeckName('')
    setDeckUrl('')
    setDeckText('')
    setShowImport(false)
  }

  const handleCopyBookmarklet = async () => {
    await navigator.clipboard.writeText(bookmarkletCode(currentAppUrl()))
    setCopiedBookmarklet(true)
    window.setTimeout(() => setCopiedBookmarklet(false), 2000)
  }

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Layers className="w-6 h-6 text-violet-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Moxfield</h1>
            <p className="text-gray-400 text-sm">
              Import Moxfield export text and search through your decks here.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowImport((v) => !v)}
          className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          Import Deck
        </button>
      </div>

      {showImport && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-white font-medium mb-3">Import Moxfield Deck</h2>
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-white text-sm font-medium">One-click from Moxfield</p>
                  <p className="text-gray-500 text-xs">
                    Copy this bookmarklet, save it as a browser bookmark, then click it on a Moxfield deck page.
                  </p>
                </div>
                <button
                  onClick={handleCopyBookmarklet}
                  className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-2 rounded-lg text-xs transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedBookmarklet ? 'Copied!' : 'Copy Bookmarklet'}
                </button>
              </div>
            </div>
            <input
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="Deck name"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
            />
            <input
              value={deckUrl}
              onChange={(e) => setDeckUrl(e.target.value)}
              placeholder="Moxfield deck URL (optional)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
            />
            <textarea
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              placeholder={'1 Commander Name\n1 Sol Ring\n1 Command Tower'}
              rows={10}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-violet-500 transition resize-none"
            />
            <p className="text-gray-600 text-xs">
              Paste the exported Moxfield deck text. The first parsed card is marked as commander.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={syncing || !deckName.trim() || !deckText.trim() || !user}
                className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                {syncing && <Loader2 className="w-4 h-4 animate-spin" />}
                {syncing ? 'Importing…' : 'Import'}
              </button>
              <button
                onClick={() => setShowImport(false)}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {(error || lastImportName) && (
        <div className="mb-4">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {lastImportName && !error && (
            <p className="text-green-400 text-sm">Imported {lastImportName}.</p>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search decks or cards…"
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500 transition"
          />
        </div>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['decks', 'images'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                view === mode ? 'bg-violet-600 text-white' : 'text-gray-500 hover:text-white'
              }`}
            >
              {mode === 'decks' ? <Layers className="w-4 h-4" /> : <Image className="w-4 h-4" />}
              {mode === 'decks' ? 'Decks' : 'Images'}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-400 text-sm justify-center py-16">
          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
          Loading imported decks…
        </div>
      )}

      {!loading && decks.length === 0 && (
        <div className="text-center py-16 text-gray-600">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No Moxfield decks imported yet.</p>
        </div>
      )}

      {!loading && decks.length > 0 && filteredDecks.length === 0 && (
        <div className="text-center py-16 text-gray-600">
          <p className="text-sm">No imported Moxfield decks match your search.</p>
        </div>
      )}

      {!loading && filteredDecks.length > 0 && view === 'images' && (
        <div className="space-y-8">
          {filteredDecks.map((deck) => (
            <section key={deck.id}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-white font-semibold text-sm">{deck.name}</h2>
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-gray-600 text-xs shrink-0">{deck.cards.length} cards</span>
                <a
                  href={deck.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-white transition"
                  title="Open in Moxfield"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <CardImageGrid cards={deck.cards} />
            </section>
          ))}
        </div>
      )}

      {!loading && filteredDecks.length > 0 && view === 'decks' && (
        <div className="space-y-4">
          {filteredDecks.map((deck) => (
            <section key={deck.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-white font-semibold">{deck.name}</h2>
                  <p className="text-gray-500 text-xs">
                    {deck.cards.length} cards{deck.format ? ` · ${deck.format}` : ''}
                  </p>
                </div>
                <a
                  href={deck.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-white transition shrink-0"
                  title="Open in Moxfield"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {deck.cards.map((card, i) => (
                  <div key={`${card.name}-${card.board}-${i}`} className="flex items-center gap-2 text-sm rounded-lg bg-gray-950/60 px-3 py-2">
                    <span className="text-gray-500 text-xs w-7 shrink-0">×{card.quantity}</span>
                    <span className="text-white truncate flex-1">{card.name}</span>
                    {card.board === 'commander' && (
                      <span className="text-[10px] uppercase tracking-wide text-violet-300 bg-violet-600/20 border border-violet-600/30 rounded-full px-2 py-0.5">
                        Cmd
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
