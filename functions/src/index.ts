import { createHash } from 'crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'

initializeApp()

const db = getFirestore()
const MAX_LIMIT = 2000
const DEFAULT_LIMIT = 500

type Include = 'all' | 'collection' | 'decks'

function setCors(res: Parameters<Parameters<typeof onRequest>[0]>[1]) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function bearerToken(req: Parameters<Parameters<typeof onRequest>[0]>[0]) {
  const header = req.header('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

function includeParam(value: unknown): Include {
  return value === 'collection' || value === 'decks' ? value : 'all'
}

function limitParam(value: unknown) {
  const parsed = Number(value ?? DEFAULT_LIMIT)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(Math.floor(parsed), MAX_LIMIT)
}

function matchesSearch(value: unknown, search: string) {
  return String(value ?? '').toLowerCase().includes(search)
}

function compactCollectionCard(data: any) {
  return {
    name: data.name,
    quantity: data.quantity,
    setCode: data.setCode,
    setName: data.setName,
    collectorNumber: data.collectorNumber,
    foil: data.foil,
    binderName: data.binderName,
    typeLine: data.typeLine,
    rarity: data.rarity,
    cmc: data.cmc,
    colors: data.colors ?? [],
    colorIdentity: data.colorIdentity ?? [],
  }
}

function compactDeck(data: any) {
  return {
    id: data.id,
    name: data.name,
    publicUrl: data.publicUrl,
    cards: (data.cards ?? []).map((card: any) => ({
      name: card.name,
      quantity: card.quantity,
      board: card.board,
    })),
  }
}

async function uidForToken(token: string) {
  if (!token) return null
  const snap = await db.doc(`chatgptTokens/${sha256(token)}`).get()
  if (!snap.exists) return null

  const data = snap.data()
  if (!data?.enabled || typeof data.uid !== 'string') return null

  await snap.ref.set({ lastUsedAt: FieldValue.serverTimestamp() }, { merge: true })
  await db.doc(`users/${data.uid}/settings/chatgpt`).set(
    { lastUsedAt: FieldValue.serverTimestamp() },
    { merge: true }
  )
  return data.uid
}

export const chatgptContext = onRequest(
  { region: 'europe-west6', timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    setCors(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const uid = await uidForToken(bearerToken(req))
    if (!uid) {
      res.status(401).json({ error: 'Invalid or missing token.' })
      return
    }

    const include = includeParam(req.query.include)
    const search = String(req.query.search ?? '').trim().toLowerCase()
    const deckId = String(req.query.deckId ?? '').trim()
    const limit = limitParam(req.query.limit)

    const response: { collection?: unknown[]; moxfieldDecks?: unknown[] } = {}

    if (include === 'all' || include === 'collection') {
      const snap = await db.collection(`users/${uid}/cards`).get()
      response.collection = snap.docs
        .map((doc) => compactCollectionCard(doc.data()))
        .filter((card: any) => !search ||
          matchesSearch(card.name, search) ||
          matchesSearch(card.typeLine, search) ||
          matchesSearch(card.binderName, search) ||
          matchesSearch(card.setName, search)
        )
        .slice(0, limit)
    }

    if (include === 'all' || include === 'decks') {
      const snap = deckId
        ? await db.doc(`users/${uid}/moxfieldDecks/${deckId}`).get()
        : await db.collection(`users/${uid}/moxfieldDecks`).get()
      const docs = 'docs' in snap ? snap.docs : snap.exists ? [snap] : []

      response.moxfieldDecks = docs
        .map((doc) => compactDeck(doc.data()))
        .filter((deck: any) => !search ||
          matchesSearch(deck.name, search) ||
          deck.cards.some((card: any) => matchesSearch(card.name, search))
        )
        .map((deck: any) => ({
          ...deck,
          cards: search
            ? deck.cards.filter((card: any) => matchesSearch(card.name, search))
            : deck.cards,
        }))
        .slice(0, limit)
    }

    res.json(response)
  }
)
