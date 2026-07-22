import type { ScryfallCard, EnrichedCard } from '../types/scryfall'
import type { ManaBoxCard } from '../types/manabox'
import type { ScryfallPrinting } from '../types/deck'

const BASE = 'https://api.scryfall.com'
const BATCH_SIZE = 75
const DELAY_MS = 120 // stay well under 10 req/s

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

// ---------------------------------------------------------------------------
// Batch card fetch by Scryfall IDs
// ---------------------------------------------------------------------------
async function fetchCardsBatch(ids: string[]): Promise<ScryfallCard[]> {
  const identifiers = ids.map((id) => ({ id }))
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
  return (data.data ?? []) as ScryfallCard[]
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
  const unique = [...new Set(names)]
  const batches: string[][] = []
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    batches.push(unique.slice(i, i + BATCH_SIZE))
  }

  for (const batch of batches) {
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
    if (!response.ok) continue
    const data = await response.json()
    for (const card of (data.data ?? []) as ScryfallCard[]) {
      result.set(card.name.toLowerCase(), card)
    }
    await sleep(DELAY_MS)
  }
  return result
}

// ---------------------------------------------------------------------------
// Fetch all printings of a single card by exact name
// ---------------------------------------------------------------------------
export async function fetchAllPrintings(
  cardName: string
): Promise<ScryfallPrinting[]> {
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
