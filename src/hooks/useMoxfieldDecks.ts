import { useCallback, useEffect, useState } from 'react'
import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { parseDeckList } from '../lib/deckMatcher'
import { lookupCardsByName } from '../lib/scryfallClient'
import type { MoxfieldDeck } from '../types/moxfield'

const SECTION_HEADERS = new Set([
  'commander',
  'commanders',
  'mainboard',
  'main deck',
  'deck',
])

const SKIP_SECTION_HEADERS = new Set([
  'sideboard',
  'maybeboard',
  'considering',
  'tokens',
  'token',
  'stickers',
  'attractions',
])

const MOXFIELD_DECKS_KEY = 'mtg-hub-moxfield-decks'

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        Array.isArray(value)
          ? value.map((item) => typeof item === 'object' && item !== null ? stripUndefined(item) : item)
          : typeof value === 'object' && value !== null
          ? stripUndefined(value as Record<string, unknown>)
          : value,
      ])
  ) as T
}

function normalizeMoxfieldExport(text: string) {
  const result: string[] = []
  let skippingSection = false

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || /^\//.test(line)) continue

    const cleaned = line.replace(/:$/, '').toLowerCase()
    if (SECTION_HEADERS.has(cleaned)) {
      skippingSection = false
      continue
    }
    if (SKIP_SECTION_HEADERS.has(cleaned)) {
      skippingSection = true
      continue
    }
    if (skippingSection || !/^\d+x?\s+/.test(line)) continue

    result.push(line.replace(/\s+\*F\*$/i, '').replace(/\s+\*E\*$/i, ''))
  }

  return result.join('\n')
}

function saveCachedDecks(decks: MoxfieldDeck[]) {
  localStorage.setItem(MOXFIELD_DECKS_KEY, JSON.stringify(decks))
}

function readCachedDecks(): MoxfieldDeck[] {
  const cached = localStorage.getItem(MOXFIELD_DECKS_KEY)
  if (!cached) return []
  try {
    return JSON.parse(cached) as MoxfieldDeck[]
  } catch {
    return []
  }
}

export function useMoxfieldDecks(uid: string | null) {
  const [decks, setDecks] = useState<MoxfieldDeck[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const cached = readCachedDecks()
    if (cached.length > 0) setDecks(cached)

    if (!uid) return
    setLoading(true)
    setError('')
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'moxfieldDecks'))
      const loaded = snap.docs
        .map((d) => d.data() as MoxfieldDeck)
        .sort((a, b) => a.name.localeCompare(b.name))
      setDecks(loaded)
      saveCachedDecks(loaded)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load Moxfield decks.')
    } finally {
      setLoading(false)
    }
  }, [uid])

  useEffect(() => {
    load()
  }, [load])

  const importFromText = useCallback(async ({
    name,
    deckText,
    publicUrl,
  }: {
    name: string
    deckText: string
    publicUrl?: string
  }) => {
    if (!uid) return null
    const trimmedName = name.trim()
    const trimmedText = normalizeMoxfieldExport(deckText)
    if (!trimmedName || !trimmedText) return null

    setSyncing(true)
    setError('')
    try {
      const lines = parseDeckList(trimmedText)
      if (lines.length === 0) {
        throw new Error('Could not parse any card lines. Use Moxfield exported text like "1 Sol Ring".')
      }

      const scryfallMap = await lookupCardsByName(lines.map((line) => line.name))
      const cards = lines.map((line, index) => {
        const scryfallCard = scryfallMap.get(line.name.toLowerCase())
        return {
          name: line.name,
          quantity: line.quantity,
          board: index === 0 ? 'commander' as const : 'mainboard' as const,
          scryfallId: scryfallCard?.id,
          imageUriNormal: scryfallCard?.image_uris?.normal ?? scryfallCard?.card_faces?.[0]?.image_uris?.normal,
        }
      })

      const id = publicUrl?.match(/moxfield\.com\/decks\/([^/?#]+)/i)?.[1] ?? `${Date.now()}`
      const deck: MoxfieldDeck = {
        id,
        name: trimmedName,
        publicUrl: publicUrl?.trim() || `https://www.moxfield.com/decks/${id}`,
        deckText: lines.map((line) => `${line.quantity} ${line.name}`).join('\n'),
        cards,
        syncedAt: new Date().toISOString(),
      }

      const batch = writeBatch(db)
      batch.set(doc(db, 'users', uid, 'moxfieldDecks', deck.id), stripUndefined(deck))
      await batch.commit()
      setDecks((prev) => {
        const next = [...prev.filter((d) => d.id !== deck.id), deck]
          .sort((a, b) => a.name.localeCompare(b.name))
        saveCachedDecks(next)
        return next
      })
      return deck
    } catch (e: any) {
      setError(e.message ?? 'Failed to import Moxfield deck.')
      return null
    } finally {
      setSyncing(false)
    }
  }, [load, uid])

  const updateName = useCallback(async (deckId: string, name: string) => {
    if (!uid) return false
    const trimmedName = name.trim()
    if (!deckId || !trimmedName) return false

    setDecks((prev) => {
      const next = prev
        .map((deck) => deck.id === deckId ? { ...deck, name: trimmedName } : deck)
        .sort((a, b) => a.name.localeCompare(b.name))
      saveCachedDecks(next)
      return next
    })

    try {
      await setDoc(
        doc(db, 'users', uid, 'moxfieldDecks', deckId),
        { name: trimmedName },
        { merge: true }
      )
      return true
    } catch (e: any) {
      setError(e.message ?? 'Failed to rename Moxfield deck.')
      await load()
      return false
    }
  }, [load, uid])

  return { decks, loading, syncing, error, load, importFromText, updateName }
}
