import type { ScryfallCard, EnrichedCard } from '../types/scryfall'
import type { ManaBoxCard } from '../types/manabox'
import type { ScryfallPrinting } from '../types/deck'

const BASE = 'https://api.scryfall.com'
const BATCH_SIZE = 75
const DELAY_MS = 180 // stay well under Scryfall rate limits
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

type CacheEntry<T> = {
  savedAt: number
  value: T
}

const inFlightCardBatches = new Map<string, Promise<ScryfallCard[]>>()
const inFlightNameBatches = new Map<string, Promise<Map<string, ScryfallCard>>>()
const inFlightPrintings = new Map<string, Promise<ScryfallPrinting[]>>()

function cacheKey(prefix: string, key: string) {
  return `${prefix}:${key.trim().toLowerCase()}`
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (!entry.savedAt || Date.now() - entry.savedAt > CACHE_TTL_MS) {
      localStorage.removeItem(key)
      return null
    }
    return entry.value
  } catch {
    return null
  }
}

function writeCache<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value } satisfies CacheEntry<T>))
  } catch {
    // Ignore quota/security errors; network fetching still works.
  }
}

function cardIdKey(id: string) {
  return cacheKey('mtg-scryfall-card-id', id)
}

function cardNameKey(name: string) {
  return cacheKey('mtg-scryfall-card-name', name)
}

function printingsKey(name: string) {
  return cacheKey('mtg-scryfall-printings', name)
}

function cacheCard(card: ScryfallCard, requestedName?: string) {
  writeCache(cardIdKey(card.id), card)
  writeCache(cardNameKey(card.name), card)
  if (requestedName) writeCache(cardNameKey(requestedName), card)
}

// ---------------------------------------------------------------------------
// Batch card fetch by Scryfall IDs
// ---------------------------------------------------------------------------
async function fetchCardsBatch(ids: string[]): Promise<ScryfallCard[]> {
  const result: ScryfallCard[] = []
  const missing = ids.filter((id) => {
    const cached = readCache<ScryfallCard>(cardIdKey(id))
    if (cached) result.push(cached)
    return !cached
  })

  if (missing.length === 0) return result

  const inFlightKey = missing.slice().sort().join('|')
  const existing = inFlightCardBatches.get(inFlightKey)
  if (existing) return [...result, ...await existing]

  const request = (async () => {
    const identifiers = missing.map((id) => ({ id }))
    const response = await fetch(`${BASE}/cards/collection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'MTGHub/1.0',
      },
      body: JSON.stringify({ identifiers }),
    })
    if (!response.ok) {
      console.error('Scryfall batch fetch failed', response.status)
      return []
    }
    const data = await response.json()
    const cards = (data.data ?? []) as ScryfallCard[]
    cards.forEach((card) => cacheCard(card))
    return cards
  })()

  inFlightCardBatches.set(inFlightKey, request)
  try {
    return [...result, ...await request]
  } finally {
    inFlightCardBatches.delete(inFlightKey)
  }
}

// ---------------------------------------------------------------------------
// Enrich ManaBox collection
// ---------------------------------------------------------------------------
export async function enrichCollection(
  manaboxCards: ManaBoxCard[],
  onProgress?: (done: number, total: number) => void
): Promise<EnrichedCard[]> {
  const idToManabox = new Map<string, ManaBoxCard>()
  for (const card of manaboxCards) {
    const existing = idToManabox.get(card.scryfallId)
    if (existing) {
      existing.quantity += card.quantity
    } else {
      idToManabox.set(card.scryfallId, { ...card })
    }
  }

  const uniqueIds = Array.from(idToManabox.keys())
  const batches: string[][] = []
  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    batches.push(uniqueIds.slice(i, i + BATCH_SIZE))
  }

  const enriched: EnrichedCard[] = []
  let done = 0

  for (const batch of batches) {
    const scryfallCards = await fetchCardsBatch(batch)
    for (const sc of scryfallCards) {
      const mb = idToManabox.get(sc.id)
      if (!mb) continue

      const imageUris = sc.image_uris ?? sc.card_faces?.[0]?.image_uris ?? null
      const colors =
        sc.colors ?? sc.card_faces?.flatMap((f) => f.colors ?? []) ?? []

      enriched.push({
        scryfallId: sc.id,
        manaboxId: mb.manaboxId,
        binderName: mb.binderName,
        quantity: mb.quantity,
        foil: mb.foil,
        purchasePrice: mb.purchasePrice,
        purchaseCurrency: mb.purchaseCurrency,
        condition: mb.condition,
        language: mb.language,
        addedAt: mb.addedAt,
        name: sc.name,
        setCode: sc.set,
        setName: sc.set_name,
        collectorNumber: sc.collector_number,
        rarity: sc.rarity,
        manaCost: sc.mana_cost ?? sc.card_faces?.[0]?.mana_cost ?? '',
        cmc: sc.cmc,
        typeLine: sc.type_line,
        oracleText: sc.oracle_text ?? sc.card_faces?.[0]?.oracle_text ?? '',
        colors: [...new Set(colors)],
        colorIdentity: sc.color_identity,
        imageUris,
        prices: sc.prices,
        legalities: sc.legalities,
        scryfallUri: sc.scryfall_uri,
        purchaseUris: sc.purchase_uris ?? null,
        edhrecRank: sc.edhrec_rank ?? null,
        releasedAt: sc.released_at,
      })
    }

    done += batch.length
    onProgress?.(Math.min(done, uniqueIds.length), uniqueIds.length)
    if (batches.indexOf(batch) < batches.length - 1) {
      await sleep(DELAY_MS)
    }
  }

  return enriched
}

// ---------------------------------------------------------------------------
// Lookup cards by name (for deck diff)
// ---------------------------------------------------------------------------
export async function lookupCardsByName(
  names: string[]
): Promise<Map<string, ScryfallCard>> {
  const result = new Map<string, ScryfallCard>()
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
  const missing = unique.filter((name) => {
    const cached = readCache<ScryfallCard>(cardNameKey(name))
    if (cached) result.set(name.toLowerCase(), cached)
    return !cached
  })
  if (missing.length === 0) return result

  const batches: string[][] = []
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    batches.push(missing.slice(i, i + BATCH_SIZE))
  }

  for (const batch of batches) {
    const inFlightKey = batch.slice().sort((a, b) => a.localeCompare(b)).join('|').toLowerCase()
    const existing = inFlightNameBatches.get(inFlightKey)
    if (existing) {
      const cards = await existing
      cards.forEach((card, key) => result.set(key, card))
      continue
    }

    const request = (async () => {
      const batchResult = new Map<string, ScryfallCard>()
    const identifiers = batch.map((name) => ({ name }))
    const response = await fetch(`${BASE}/cards/collection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'MTGHub/1.0',
      },
      body: JSON.stringify({ identifiers }),
    })
    if (!response.ok) return batchResult
    const data = await response.json()
    for (const card of (data.data ?? []) as ScryfallCard[]) {
        cacheCard(card)
        batchResult.set(card.name.toLowerCase(), card)
        const requested = batch.find((name) => name.toLowerCase() === card.name.toLowerCase())
        if (requested) {
          cacheCard(card, requested)
          batchResult.set(requested.toLowerCase(), card)
        }
    }
      return batchResult
    })()

    inFlightNameBatches.set(inFlightKey, request)
    try {
      const cards = await request
      cards.forEach((card, key) => result.set(key, card))
    } finally {
      inFlightNameBatches.delete(inFlightKey)
    }

    if (batches.indexOf(batch) < batches.length - 1) await sleep(DELAY_MS)
  }
  return result
}

// ---------------------------------------------------------------------------
// Fetch all printings of a single card by exact name
// ---------------------------------------------------------------------------
export async function fetchAllPrintings(
  cardName: string
): Promise<ScryfallPrinting[]> {
  const cached = readCache<ScryfallPrinting[]>(printingsKey(cardName))
  if (cached) return cached

  const key = cardName.trim().toLowerCase()
  const existing = inFlightPrintings.get(key)
  if (existing) return existing

  const request = fetchAllPrintingsUncached(cardName)
  inFlightPrintings.set(key, request)
  try {
    const printings = await request
    writeCache(printingsKey(cardName), printings)
    return printings
  } finally {
    inFlightPrintings.delete(key)
  }
}

async function fetchAllPrintingsUncached(cardName: string): Promise<ScryfallPrinting[]> {
  const printings: ScryfallPrinting[] = []
  // Encode the exact name query: !"Card Name"
  const q = encodeURIComponent(`!"${cardName}"`)
  let url: string | null =
    `${BASE}/cards/search?q=${q}&unique=prints&order=released&dir=asc`

  while (url) {
    const res: Response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MTGHub/1.0',
      },
    })
    if (!res.ok) break
    const data: { data: ScryfallCard[]; has_more: boolean; next_page?: string } =
      await res.json()

    for (const sc of (data.data ?? []) as ScryfallCard[]) {
      // Skip digital-only, tokens, etc.
      if (sc.layout === 'token' || sc.layout === 'art_series') continue
      const imageUriNormal =
        sc.image_uris?.normal ?? sc.card_faces?.[0]?.image_uris?.normal

      printings.push({
        scryfallId: sc.id,
        setName: sc.set_name,
        setCode: sc.set,
        collectorNumber: sc.collector_number,
        releasedAt: sc.released_at,
        imageUriNormal,
        prices: sc.prices,
        purchaseUris: {
          tcgplayer: sc.purchase_uris?.tcgplayer,
          cardmarket: sc.purchase_uris?.cardmarket,
        },
      })
    }

    // Paginate if there are more pages
    url = data.has_more ? (data.next_page ?? null) : null
    if (url) await sleep(DELAY_MS)
  }

  return printings
}

// ---------------------------------------------------------------------------
// EUR → CHF exchange rate (cached in sessionStorage)
// ---------------------------------------------------------------------------
const CHF_CACHE_KEY = 'eur_chf_rate'
const CHF_FALLBACK = 0.95

export async function getEurToChf(): Promise<number> {
  const cached = sessionStorage.getItem(CHF_CACHE_KEY)
  if (cached) return parseFloat(cached)

  try {
    const res = await fetch(
      'https://api.frankfurter.app/latest?from=EUR&to=CHF',
      { headers: { Accept: 'application/json' } }
    )
    if (!res.ok) throw new Error('rate fetch failed')
    const data = await res.json()
    const rate: number = data.rates?.CHF ?? CHF_FALLBACK
    sessionStorage.setItem(CHF_CACHE_KEY, String(rate))
    return rate
  } catch {
    return CHF_FALLBACK
  }
}
