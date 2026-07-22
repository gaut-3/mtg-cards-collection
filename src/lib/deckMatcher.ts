import type { DeckLine, DeckDiffResult, DeckDiffMissingEntry, DeckDiffOwnedEntry } from '../types/deck'
import type { EnrichedCard } from '../types/scryfall'
import { lookupCardsByName, fetchAllPrintings } from './scryfallClient'

const DELAY_MS = 150

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

// ---------------------------------------------------------------------------
// Parse standard deck text:
//   4 Lightning Bolt
//   4x Lightning Bolt
//   4 Lightning Bolt (M21) 149
// ---------------------------------------------------------------------------
export function parseDeckList(text: string): DeckLine[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('#'))

  const result: DeckLine[] = []
  for (const line of lines) {
    if (/^(deck|sideboard|commander|companion|maybeboard)$/i.test(line)) continue
    const match = line.match(/^(\d+)x?\s+(.+?)(?:\s+\((\w+)\)\s*(\S+.*))?$/)
    if (!match) continue
    const [, qty, name, setCode, collectorNumber] = match
    result.push({
      quantity: parseInt(qty, 10),
      name: name.trim(),
      setCode,
      collectorNumber,
    })
  }
  return result
}

// ---------------------------------------------------------------------------
// Build deck diff — basic pass (fast, no all-printings data)
// ---------------------------------------------------------------------------
export async function buildDeckDiff(
  deckLines: DeckLine[],
  collection: EnrichedCard[]
): Promise<DeckDiffResult> {
  const collectionByName = new Map<string, EnrichedCard>()
  for (const card of collection) {
    collectionByName.set(card.name.toLowerCase(), card)
  }

  const allNames = deckLines.map((l) => l.name)
  const scryfallMap = await lookupCardsByName(allNames)

  const owned: DeckDiffOwnedEntry[] = []
  const missing: DeckDiffMissingEntry[] = []

  for (const line of deckLines) {
    const key = line.name.toLowerCase()
    const collectionCard = collectionByName.get(key)
    const scryfallCard = scryfallMap.get(key)
    const imageUriNormal =
      scryfallCard?.image_uris?.normal ??
      scryfallCard?.card_faces?.[0]?.image_uris?.normal
    const priceUsd = scryfallCard?.prices.usd
      ? parseFloat(scryfallCard.prices.usd)
      : undefined

    if (collectionCard && collectionCard.quantity >= line.quantity) {
      owned.push({
        ...line,
        haveQuantity: collectionCard.quantity,
        scryfallId: collectionCard.scryfallId,
        imageUriNormal,
        priceUsd,
      })
    } else {
      const haveQuantity = collectionCard?.quantity ?? 0
      const neededQuantity = line.quantity - haveQuantity

      missing.push({
        ...line,
        quantity: neededQuantity,
        scryfallId: scryfallCard?.id,
        imageUriNormal,
        priceUsd,
        setName: scryfallCard?.set_name,
        setCode: scryfallCard?.set,
        collectorNumber: scryfallCard?.collector_number,
        releasedAt: scryfallCard?.released_at,
        prices: scryfallCard?.prices,
        purchaseUris: {
          tcgplayer: scryfallCard?.purchase_uris?.tcgplayer,
          cardmarket: scryfallCard?.purchase_uris?.cardmarket,
        },
        // allPrintings populated later via enrichMissingWithPrintings
        allPrintings: undefined,
      })

      if (haveQuantity > 0) {
        owned.push({
          ...line,
          quantity: haveQuantity,
          haveQuantity,
          scryfallId: collectionCard!.scryfallId,
          imageUriNormal,
          priceUsd,
        })
      }
    }
  }

  const totalMissingUsd = missing.reduce(
    (sum, c) => sum + (c.priceUsd ?? 0) * c.quantity,
    0
  )

  missing.sort((a, b) => (a.priceUsd ?? 0) - (b.priceUsd ?? 0))

  return { owned, missing, totalMissingUsd }
}

// ---------------------------------------------------------------------------
// Second pass: enrich a single missing entry with all its printings
// Call this per-card lazily from the UI so the panel feels progressive.
// ---------------------------------------------------------------------------
export async function enrichWithPrintings(
  entry: DeckDiffMissingEntry,
  onDone: (updated: DeckDiffMissingEntry) => void
): Promise<void> {
  await sleep(0) // yield to UI first
  const printings = await fetchAllPrintings(entry.name)
  await sleep(DELAY_MS)

  // Sort: cheapest non-foil USD first, then by release date
  const sorted = [...printings].sort((a, b) => {
    const pa = parseFloat(a.prices.usd ?? '9999')
    const pb = parseFloat(b.prices.usd ?? '9999')
    return pa - pb
  })

  // Pick the cheapest printing as the default image/prices
  const cheapest = sorted[0]
  const updated: DeckDiffMissingEntry = {
    ...entry,
    allPrintings: sorted,
    imageUriNormal: cheapest?.imageUriNormal ?? entry.imageUriNormal,
    setName: cheapest?.setName ?? entry.setName,
    setCode: cheapest?.setCode ?? entry.setCode,
    collectorNumber: cheapest?.collectorNumber ?? entry.collectorNumber,
    releasedAt: cheapest?.releasedAt ?? entry.releasedAt,
    prices: cheapest?.prices ?? entry.prices,
    purchaseUris: cheapest?.purchaseUris ?? entry.purchaseUris,
    priceUsd: cheapest?.prices.usd ? parseFloat(cheapest.prices.usd) : entry.priceUsd,
  }

  onDone(updated)
}
