export interface MoxfieldDeckCard {
  name: string
  quantity: number
  board: 'commander' | 'mainboard'
  scryfallId?: string
  imageUriNormal?: string
}

export interface MoxfieldDeck {
  id: string
  name: string
  publicUrl: string
  format?: string
  deckText: string
  cards: MoxfieldDeckCard[]
  syncedAt: string
}
