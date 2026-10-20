import type { EnrichedCard } from '../types/scryfall'

const DB_NAME = 'mtg-hub-cache'
const DB_VERSION = 1
const CARDS_STORE = 'collectionCards'
const META_STORE = 'collectionMeta'

interface CachedCardRecord {
  key: string
  uid: string
  card: EnrichedCard
}

export interface CollectionCache {
  cards: EnrichedCard[]
  savedAt: number
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is unavailable'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(CARDS_STORE)) {
        const store = database.createObjectStore(CARDS_STORE, { keyPath: 'key' })
        store.createIndex('uid', 'uid', { unique: false })
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: 'uid' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function readCollectionCache(uid: string): Promise<CollectionCache | null> {
  const database = await openCacheDb()
  try {
    const transaction = database.transaction([CARDS_STORE, META_STORE], 'readonly')
    const cardStore = transaction.objectStore(CARDS_STORE)
    const metaStore = transaction.objectStore(META_STORE)
    const recordsRequest = cardStore.index('uid').getAll(uid) as IDBRequest<CachedCardRecord[]>
    const metaRequest = metaStore.get(uid) as IDBRequest<{ uid: string; savedAt: number } | undefined>
    const done = transactionDone(transaction)

    const [records, meta] = await Promise.all([
      new Promise<CachedCardRecord[]>((resolve, reject) => {
        recordsRequest.onsuccess = () => resolve(recordsRequest.result)
        recordsRequest.onerror = () => reject(recordsRequest.error)
      }),
      new Promise<{ uid: string; savedAt: number } | undefined>((resolve, reject) => {
        metaRequest.onsuccess = () => resolve(metaRequest.result)
        metaRequest.onerror = () => reject(metaRequest.error)
      }),
    ])
    await done

    if (!meta) return null
    return { cards: records.map((record) => record.card), savedAt: meta.savedAt }
  } finally {
    database.close()
  }
}

export async function writeCollectionCache(uid: string, cards: EnrichedCard[]): Promise<void> {
  const database = await openCacheDb()
  try {
    const transaction = database.transaction([CARDS_STORE, META_STORE], 'readwrite')
    const cardStore = transaction.objectStore(CARDS_STORE)
    const recordsRequest = cardStore.index('uid').getAllKeys(uid)
    const done = transactionDone(transaction)

    recordsRequest.onsuccess = () => {
      for (const key of recordsRequest.result) cardStore.delete(key)
      for (const card of cards) {
        cardStore.put({ key: `${uid}:${card.scryfallId}`, uid, card } satisfies CachedCardRecord)
      }
      transaction.objectStore(META_STORE).put({ uid, savedAt: Date.now(), count: cards.length })
    }

    await done
  } finally {
    database.close()
  }
}

export async function clearCollectionCache(uid: string): Promise<void> {
  const database = await openCacheDb()
  try {
    const transaction = database.transaction([CARDS_STORE, META_STORE], 'readwrite')
    const cardStore = transaction.objectStore(CARDS_STORE)
    const recordsRequest = cardStore.index('uid').getAllKeys(uid)
    const done = transactionDone(transaction)
    recordsRequest.onsuccess = () => {
      for (const key of recordsRequest.result) cardStore.delete(key)
      transaction.objectStore(META_STORE).delete(uid)
    }
    await done
  } finally {
    database.close()
  }
}

export function removeLegacyCollectionCache() {
  try {
    localStorage.removeItem('mtg-hub-collection')
    localStorage.removeItem('mtg-hub-collection-meta')
  } catch {
    // Legacy cache cleanup is best-effort.
  }
}
