import { useCallback, useEffect, useState } from 'react'
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { fetchMoxfieldDecks } from '../lib/moxfieldClient'
import type { MoxfieldDeck } from '../types/moxfield'

const USERNAME_KEY = 'mtg-hub-moxfield-username'

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

export function useMoxfieldDecks(uid: string | null) {
  const [decks, setDecks] = useState<MoxfieldDeck[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    setError('')
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'moxfieldDecks'))
      const loaded = snap.docs
        .map((d) => d.data() as MoxfieldDeck)
        .sort((a, b) => a.name.localeCompare(b.name))
      setDecks(loaded)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load Moxfield decks.')
    } finally {
      setLoading(false)
    }
  }, [uid])

  useEffect(() => {
    load()
  }, [load])

  const sync = useCallback(async (username: string) => {
    if (!uid) return []
    const trimmed = username.trim()
    if (!trimmed) return []

    setSyncing(true)
    setError('')
    try {
      localStorage.setItem(USERNAME_KEY, trimmed)
      const synced = await fetchMoxfieldDecks(trimmed)
      const batch = writeBatch(db)
      for (const deck of synced) {
        batch.set(doc(db, 'users', uid, 'moxfieldDecks', deck.id), stripUndefined(deck))
      }
      await batch.commit()
      await load()
      return synced
    } catch (e: any) {
      setError(e.message ?? 'Failed to sync Moxfield decks.')
      return []
    } finally {
      setSyncing(false)
    }
  }, [load, uid])

  return { decks, loading, syncing, error, load, sync }
}

export function getStoredMoxfieldUsername() {
  return localStorage.getItem(USERNAME_KEY) ?? 'bashstar'
}
