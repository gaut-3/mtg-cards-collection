// Raw row from ManaBox CSV export
export interface ManaBoxRow {
  'Binder Name': string
  'Binder Type': string
  Name: string
  'Set code': string
  'Set name': string
  'Collector number': string
  Foil: 'normal' | 'foil' | 'etched'
  Rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus'
  Quantity: string
  'ManaBox ID': string
  'Scryfall ID': string
  'Purchase price': string
  Misprint: string
  Altered: string
  Condition: string
  Language: string
  'Purchase price currency': string
  Added: string
}

// Parsed and typed version
export interface ManaBoxCard {
  binderName: string
  name: string
  setCode: string
  setName: string
  collectorNumber: string
  foil: 'normal' | 'foil' | 'etched'
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus'
  quantity: number
  manaboxId: string
  scryfallId: string
  purchasePrice: number
  purchaseCurrency: string
  condition: string
  language: string
  addedAt: string
}
