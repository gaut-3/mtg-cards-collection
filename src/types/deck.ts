import type { ScryfallPrices } from './scryfall'

export interface DeckLine {
  quantity: number
  name: string
  setCode?: string
  collectorNumber?: string
}

export interface ScryfallPrinting {
  scryfallId: string
  setName: string
  setCode: string
  collectorNumber: string
  releasedAt: string
  imageUriNormal?: string
  prices: ScryfallPrices
  purchaseUris?: {
    tcgplayer?: string
    cardmarket?: string
  }
}

export type DeckDiffMissingEntry = DeckLine & {
  scryfallId?: string
  imageUriNormal?: string
  priceUsd?: number
  setName?: string
  setCode?: string
  collectorNumber?: string
  releasedAt?: string
  purchaseUris?: { tcgplayer?: string; cardmarket?: string }
  prices?: ScryfallPrices
  allPrintings?: ScryfallPrinting[]
}

export type DeckDiffOwnedEntry = DeckLine & {
  haveQuantity: number
  scryfallId: string
  imageUriNormal?: string
  priceUsd?: number
}

export interface DeckDiffResult {
  owned: DeckDiffOwnedEntry[]
  missing: DeckDiffMissingEntry[]
  totalMissingUsd: number
}

export interface Wishlist {
  id: string
  name: string
  createdAt: string
  deckText: string
  diff?: DeckDiffResult
}

export interface PriceSnapshot {
  date: string
  totalUsd: number
  totalEur: number
  cardCount: number
}
