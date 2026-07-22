export interface ScryfallPrices {
  usd: string | null
  usd_foil: string | null
  usd_etched: string | null
  eur: string | null
  eur_foil: string | null
  eur_etched: string | null
  tix: string | null
}

export interface ScryfallImageUris {
  small: string
  normal: string
  large: string
  png: string
  art_crop: string
  border_crop: string
}

export interface ScryfallCardFace {
  name: string
  mana_cost: string
  type_line?: string
  oracle_text?: string
  colors?: string[]
  image_uris?: ScryfallImageUris
}

export interface ScryfallCard {
  id: string
  oracle_id: string
  name: string
  set: string
  set_name: string
  collector_number: string
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus'
  mana_cost?: string
  cmc: number
  type_line: string
  oracle_text?: string
  colors?: string[]
  color_identity: string[]
  image_uris?: ScryfallImageUris
  card_faces?: ScryfallCardFace[]
  prices: ScryfallPrices
  legalities: Record<string, 'legal' | 'not_legal' | 'restricted' | 'banned'>
  scryfall_uri: string
  purchase_uris?: {
    tcgplayer?: string
    cardmarket?: string
    cardhoarder?: string
  }
  edhrec_rank?: number
  released_at: string
  layout: string
  finishes: string[]
}

// Enriched card: ManaBox data merged with Scryfall data
export interface EnrichedCard {
  // From ManaBox
  scryfallId: string
  manaboxId: string
  binderName: string
  quantity: number
  foil: 'normal' | 'foil' | 'etched'
  purchasePrice: number
  purchaseCurrency: string
  condition: string
  language: string
  addedAt: string

  // From Scryfall
  name: string
  setCode: string
  setName: string
  collectorNumber: string
  rarity: ScryfallCard['rarity']
  manaCost: string
  cmc: number
  typeLine: string
  oracleText: string
  colors: string[]
  colorIdentity: string[]
  imageUris: ScryfallImageUris | null
  prices: ScryfallPrices
  legalities: Record<string, string>
  scryfallUri: string
  purchaseUris: ScryfallCard['purchase_uris'] | null
  edhrecRank: number | null
  releasedAt: string
}
