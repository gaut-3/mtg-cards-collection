import { onRequest } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'

type Board = 'commander' | 'mainboard'

interface MoxfieldCardEntry {
  quantity?: number
  card?: {
    id?: string
    name?: string
    scryfall_id?: string
    scryfallId?: string
    image_uris?: { normal?: string }
    imageUris?: { normal?: string }
    card_faces?: Array<{ image_uris?: { normal?: string } }>
  }
}

interface SyncedCard {
  name: string
  quantity: number
  board: Board
  scryfallId?: string
  imageUriNormal?: string
}

interface SyncedDeck {
  id: string
  name: string
  publicUrl: string
  format?: string
  deckText: string
  cards: SyncedCard[]
  syncedAt: string
}

const MOXFIELD_API = 'https://api2.moxfield.com'
const MAX_DECKS = 100

function setCors(res: Parameters<Parameters<typeof onRequest>[0]>[1]) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
}

function imageUri(entry: MoxfieldCardEntry): string | undefined {
  return entry.card?.image_uris?.normal ??
    entry.card?.imageUris?.normal ??
    entry.card?.card_faces?.[0]?.image_uris?.normal
}

function scryfallId(entry: MoxfieldCardEntry): string | undefined {
  return entry.card?.scryfall_id ?? entry.card?.scryfallId ?? entry.card?.id
}

function addBoardCards(cards: SyncedCard[], board: Record<string, MoxfieldCardEntry> | undefined, boardName: Board) {
  if (!board) return

  for (const entry of Object.values(board)) {
    const name = entry.card?.name
    if (!name) continue

    cards.push({
      name,
      quantity: entry.quantity ?? 1,
      board: boardName,
      scryfallId: scryfallId(entry),
      imageUriNormal: imageUri(entry),
    })
  }
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'mtg-cards-collection/1.0 (+https://mtg-cards-56fbc.web.app)',
    },
  })

  if (!res.ok) {
    throw new Error(`Moxfield returned ${res.status}`)
  }

  return res.json()
}

function extractDeckSummaries(data: unknown): Array<{ id: string; name?: string; publicUrl?: string; format?: string }> {
  const obj = data as any
  const candidates = obj.data ?? obj.decks ?? obj.items ?? obj
  if (!Array.isArray(candidates)) return []

  return candidates
    .map((deck: any) => ({
      id: deck.id ?? deck.publicId ?? deck.public_id,
      name: deck.name,
      publicUrl: deck.publicUrl ?? deck.public_url,
      format: deck.format,
    }))
    .filter((deck) => typeof deck.id === 'string' && deck.id.length > 0)
}

function normalizeDeck(deck: any): SyncedDeck {
  const cards: SyncedCard[] = []
  addBoardCards(cards, deck.commanders, 'commander')
  addBoardCards(cards, deck.mainboard, 'mainboard')

  const deckText = cards.map((card) => `${card.quantity} ${card.name}`).join('\n')
  const id = deck.id ?? deck.publicId ?? deck.public_id

  return {
    id,
    name: deck.name ?? 'Untitled Moxfield deck',
    publicUrl: deck.publicUrl ?? deck.public_url ?? `https://www.moxfield.com/decks/${id}`,
    format: deck.format,
    deckText,
    cards,
    syncedAt: new Date().toISOString(),
  }
}

export const syncMoxfieldDecks = onRequest(
  { region: 'europe-west6', timeoutSeconds: 300, memory: '512MiB' },
  async (req, res) => {
    setCors(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const username = String(req.body?.username ?? '').trim()
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(username)) {
      res.status(400).json({ error: 'Invalid Moxfield username.' })
      return
    }

    try {
      const listingUrls = [
        `${MOXFIELD_API}/v2/decks/search-sfw?pageNumber=1&pageSize=${MAX_DECKS}&authorUserNames=${encodeURIComponent(username)}`,
        `${MOXFIELD_API}/v2/decks/search?pageNumber=1&pageSize=${MAX_DECKS}&authorUserNames=${encodeURIComponent(username)}`,
      ]

      let summaries: Array<{ id: string; name?: string; publicUrl?: string; format?: string }> = []
      let lastError: unknown = null
      for (const url of listingUrls) {
        try {
          summaries = extractDeckSummaries(await fetchJson(url))
          if (summaries.length > 0) break
        } catch (e) {
          lastError = e
          logger.warn('Moxfield listing endpoint failed', { url, error: e })
        }
      }

      if (summaries.length === 0 && lastError) {
        throw lastError
      }

      const decks: SyncedDeck[] = []
      for (const summary of summaries.slice(0, MAX_DECKS)) {
        const detail = await fetchJson(`${MOXFIELD_API}/v3/decks/all/${encodeURIComponent(summary.id)}`)
        decks.push(normalizeDeck({ ...detail, ...summary }))
      }

      res.json({ decks })
    } catch (e: any) {
      logger.error('Failed to sync Moxfield decks', e)
      res.status(502).json({ error: e.message ?? 'Failed to sync Moxfield decks.' })
    }
  }
)
