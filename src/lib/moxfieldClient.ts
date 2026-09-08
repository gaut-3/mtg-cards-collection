import type { MoxfieldDeck } from '../types/moxfield'

const DEFAULT_SYNC_URL = 'https://europe-west6-mtg-cards-56fbc.cloudfunctions.net/syncMoxfieldDecks'

export async function fetchMoxfieldDecks(username: string): Promise<MoxfieldDeck[]> {
  const syncUrl = import.meta.env.VITE_MOXFIELD_SYNC_URL ?? DEFAULT_SYNC_URL
  const res = await fetch(syncUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error ?? `Moxfield sync failed with ${res.status}`)
  }

  return data.decks ?? []
}
