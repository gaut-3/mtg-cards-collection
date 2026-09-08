import { useCallback, useEffect, useState } from 'react'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

interface ChatGptSettings {
  enabled: boolean
  tokenHash: string
  createdAt?: unknown
  lastUsedAt?: unknown
}

function base64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function newToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `mtg_${base64Url(bytes)}`
}

export function useChatGptToken(uid: string | null) {
  const [settings, setSettings] = useState<ChatGptSettings | null>(null)
  const [generatedToken, setGeneratedToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    setError('')
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'settings', 'chatgpt'))
      setSettings(snap.exists() ? snap.data() as ChatGptSettings : null)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load ChatGPT settings.')
    } finally {
      setLoading(false)
    }
  }, [uid])

  useEffect(() => {
    load()
  }, [load])

  const generate = useCallback(async () => {
    if (!uid) return ''
    setSaving(true)
    setError('')
    try {
      if (settings?.tokenHash) {
        await deleteDoc(doc(db, 'chatgptTokens', settings.tokenHash))
      }

      const token = newToken()
      const tokenHash = await sha256(token)
      const data = {
        uid,
        enabled: true,
        createdAt: serverTimestamp(),
      }

      await setDoc(doc(db, 'chatgptTokens', tokenHash), data)
      await setDoc(doc(db, 'users', uid, 'settings', 'chatgpt'), {
        enabled: true,
        tokenHash,
        createdAt: serverTimestamp(),
      })

      setSettings({ enabled: true, tokenHash })
      setGeneratedToken(token)
      return token
    } catch (e: any) {
      setError(e.message ?? 'Failed to generate token.')
      return ''
    } finally {
      setSaving(false)
    }
  }, [settings?.tokenHash, uid])

  const revoke = useCallback(async () => {
    if (!uid || !settings?.tokenHash) return
    setSaving(true)
    setError('')
    try {
      await deleteDoc(doc(db, 'chatgptTokens', settings.tokenHash))
      await deleteDoc(doc(db, 'users', uid, 'settings', 'chatgpt'))
      setSettings(null)
      setGeneratedToken('')
    } catch (e: any) {
      setError(e.message ?? 'Failed to revoke token.')
    } finally {
      setSaving(false)
    }
  }, [settings?.tokenHash, uid])

  return { settings, generatedToken, loading, saving, error, generate, revoke }
}
