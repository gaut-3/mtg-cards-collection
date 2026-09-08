import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db } from '../lib/firebase'

interface ChatGptSettings {
  enabled: boolean
  tokenHash: string
  createdAt?: unknown
  lastUsedAt?: unknown
}

const functions = getFunctions(undefined, 'europe-west6')

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
      const callable = httpsCallable(functions, 'generateChatgptToken')
      const result = await callable()
      const { token, tokenHash } = result.data as { token: string; tokenHash: string }
      setSettings({ enabled: true, tokenHash })
      setGeneratedToken(token)
      return token
    } catch (e: any) {
      setError(e.message ?? 'Failed to generate token.')
      return ''
    } finally {
      setSaving(false)
    }
  }, [uid])

  const revoke = useCallback(async () => {
    if (!uid || !settings?.tokenHash) return
    setSaving(true)
    setError('')
    try {
      const callable = httpsCallable(functions, 'revokeChatgptToken')
      await callable()
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
