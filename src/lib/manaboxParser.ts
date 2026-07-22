import Papa from 'papaparse'
import type { ManaBoxRow, ManaBoxCard } from '../types/manabox'

export function parseManaBoxCSV(csvText: string): ManaBoxCard[] {
  const result = Papa.parse<ManaBoxRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  return result.data
    .filter((row) => row['Scryfall ID'] && row['Name'])
    .map((row): ManaBoxCard => ({
      binderName: row['Binder Name'] ?? '',
      name: row['Name'] ?? '',
      setCode: row['Set code'] ?? '',
      setName: row['Set name'] ?? '',
      collectorNumber: row['Collector number'] ?? '',
      foil: (row['Foil'] as ManaBoxCard['foil']) ?? 'normal',
      rarity: (row['Rarity'] as ManaBoxCard['rarity']) ?? 'common',
      quantity: parseInt(row['Quantity'] ?? '1', 10) || 1,
      manaboxId: row['ManaBox ID'] ?? '',
      scryfallId: row['Scryfall ID'] ?? '',
      purchasePrice: parseFloat(row['Purchase price'] ?? '0') || 0,
      purchaseCurrency: row['Purchase price currency'] ?? 'USD',
      condition: row['Condition'] ?? '',
      language: row['Language'] ?? 'en',
      addedAt: row['Added'] ?? '',
    }))
}
