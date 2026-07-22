import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { EnrichedCard } from '../types/scryfall'
import type { PriceSnapshot } from '../types/deck'

const LOCALSTORAGE_KEY = 'mtg-hub-collection'

// Firestore rejects undefined values — strip them recursively before writing
function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function useCollection(uid: string | null) {
  const [cards, setCards] = useState<EnrichedCard[]>([])
  const [loading, setLoading] = useState(false)

  // Load from Firestore (or localStorage fallback)
  const loadCollection = useCallback(async () => {
    if (!uid) {
      const cached = localStorage.getItem(LOCALSTORAGE_KEY)
      if (cached) setCards(JSON.parse(cached))
      return
    }
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'cards'))
      const loaded = snap.docs.map((d) => d.data() as EnrichedCard)
      setCards(loaded)
      localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(loaded))
    } catch (e) {
      console.error('Failed to load collection', e)
      const cached = localStorage.getItem(LOCALSTORAGE_KEY)
      if (cached) setCards(JSON.parse(cached))
    } finally {
      setLoading(false)
    }
  }, [uid])

  useEffect(() => {
    loadCollection()
  }, [loadCollection])

  // Save enriched cards to Firestore in batches of 500 + write price snapshot
  const saveCollection = useCallback(
    async (enriched: EnrichedCard[]) => {
      setCards(enriched)
      localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(enriched))

      if (!uid) return

      // Save cards in Firestore batches
      const BATCH_LIMIT = 490
      for (let i = 0; i < enriched.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db)
        const slice = enriched.slice(i, i + BATCH_LIMIT)
        for (const card of slice) {
          const ref = doc(db, 'users', uid, 'cards', card.scryfallId)
          batch.set(ref, stripUndefined(card))
        }
        await batch.commit()
      }

      // Write daily price snapshot
      const totalUsd = enriched.reduce((sum, c) => {
        const price = c.foil !== 'normal'
          ? parseFloat(c.prices.usd_foil ?? c.prices.usd ?? '0')
          : parseFloat(c.prices.usd ?? '0')
        return sum + price * c.quantity
      }, 0)
      const totalEur = enriched.reduce((sum, c) => {
        const price = c.foil !== 'normal'
          ? parseFloat(c.prices.eur_foil ?? c.prices.eur ?? '0')
          : parseFloat(c.prices.eur ?? '0')
        return sum + price * c.quantity
      }, 0)
      const snapshot: PriceSnapshot = {
        date: todayStr(),
        totalUsd: Math.round(totalUsd * 100) / 100,
        totalEur: Math.round(totalEur * 100) / 100,
        cardCount: enriched.reduce((s, c) => s + c.quantity, 0),
      }
      await setDoc(
        doc(db, 'users', uid, 'snapshots', todayStr()),
        snapshot
      )
    },
    [uid]
  )

  const clearCollection = useCallback(async () => {
    setCards([])
    localStorage.removeItem(LOCALSTORAGE_KEY)
    if (!uid) return
    const snap = await getDocs(collection(db, 'users', uid, 'cards'))
    const batch = writeBatch(db)
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }, [uid])

  return { cards, loading, loadCollection, saveCollection, clearCollection }
}

export function usePriceHistory(uid: string | null) {
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([])

  useEffect(() => {
    if (!uid) return
    const load = async () => {
      const q = query(
        collection(db, 'users', uid, 'snapshots'),
        orderBy('date', 'asc')
      )
      const snap = await getDocs(q)
      setSnapshots(snap.docs.map((d) => d.data() as PriceSnapshot))
    }
    load()
  }, [uid])

  return snapshots
}

export function useWishlists(uid: string | null) {
  const [wishlists, setWishlists] = useState<
    Array<{ id: string; name: string; deckText: string; createdAt: string }>
  >([])

  const load = useCallback(async () => {
    if (!uid) return
    const snap = await getDocs(collection(db, 'users', uid, 'wishlists'))
    setWishlists(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
    )
  }, [uid])

  useEffect(() => { load() }, [load])

  const save = useCallback(
    async (name: string, deckText: string) => {
      if (!uid) return
      const id = Date.now().toString()
      const data = { name, deckText, createdAt: new Date().toISOString() }
      await setDoc(doc(db, 'users', uid, 'wishlists', id), data)
      await load()
    },
    [uid, load]
  )

  const update = useCallback(
    async (id: string, name: string, deckText: string) => {
      if (!uid) return
      await setDoc(
        doc(db, 'users', uid, 'wishlists', id),
        { name, deckText },
        { merge: true }
      )
      await load()
    },
    [uid, load]
  )

  const remove = useCallback(
    async (id: string) => {
      if (!uid) return
      await deleteDoc(doc(db, 'users', uid, 'wishlists', id))
      await load()
    },
    [uid, load]
  )

  return { wishlists, save, update, remove }
}
