import { useState } from 'react'
import { Check, Copy, KeyRound, Loader2, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { useAuthContext } from '../components/shared/AuthContext'
import { useChatGptToken } from '../hooks/useChatGptToken'

const ENDPOINT = 'https://europe-west6-mtg-cards-56fbc.cloudfunctions.net/chatgptContext'

const OPENAPI_SCHEMA = `openapi: 3.1.0
info:
  title: MTG Collection Context
  version: 1.0.0
servers:
  - url: https://europe-west6-mtg-cards-56fbc.cloudfunctions.net
paths:
  /chatgptContext:
    get:
      operationId: getMtgContext
      summary: Get the user's MTG collection and imported Moxfield decks
      parameters:
        - name: include
          in: query
          schema:
            type: string
            enum: [all, collection, decks]
        - name: search
          in: query
          schema:
            type: string
        - name: deckId
          in: query
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        "200":
          description: MTG context
          content:
            application/json:
              schema:
                type: object
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
security:
  - bearerAuth: []`

export default function Settings() {
  const { user } = useAuthContext()
  const { settings, generatedToken, loading, saving, error, generate, revoke } = useChatGptToken(user?.uid ?? null)
  const [copied, setCopied] = useState('')

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 2000)
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="w-6 h-6 text-violet-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-gray-400 text-sm">Manage ChatGPT access to your MTG collection data.</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-white font-semibold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-violet-400" />
              ChatGPT Access Token
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              Generate a private bearer token for a Custom GPT action. The raw token is shown only once.
            </p>
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-violet-400" />}
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={generate}
            disabled={saving || !user}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {settings ? 'Regenerate token' : 'Generate token'}
          </button>

          {settings && (
            <button
              onClick={revoke}
              disabled={saving}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-red-300 px-4 py-2 rounded-lg text-sm transition"
            >
              <Trash2 className="w-4 h-4" />
              Revoke token
            </button>
          )}
        </div>

        <p className="text-sm text-gray-400 mb-3">
          Status: {settings ? <span className="text-green-400">enabled</span> : <span className="text-gray-500">disabled</span>}
        </p>

        {generatedToken && (
          <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 p-3 mb-4">
            <p className="text-amber-200 text-sm font-medium mb-2">Copy this token now. It will not be shown again.</p>
            <div className="flex gap-2">
              <code className="flex-1 bg-black/30 rounded-lg px-3 py-2 text-xs text-amber-100 break-all">{generatedToken}</code>
              <button
                onClick={() => copy('token', generatedToken)}
                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-2 rounded-lg text-xs transition"
              >
                {copied === 'token' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === 'token' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-xs text-gray-500">Endpoint</label>
          <div className="flex gap-2">
            <code className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 break-all">{ENDPOINT}</code>
            <button
              onClick={() => copy('endpoint', ENDPOINT)}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-2 rounded-lg text-xs transition"
            >
              {copied === 'endpoint' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === 'endpoint' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-white font-semibold">Custom GPT Action Schema</h2>
            <p className="text-gray-500 text-sm">Use bearer auth in ChatGPT and paste your generated token there.</p>
          </div>
          <button
            onClick={() => copy('schema', OPENAPI_SCHEMA)}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-2 rounded-lg text-xs transition"
          >
            {copied === 'schema' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied === 'schema' ? 'Copied' : 'Copy Schema'}
          </button>
        </div>
        <pre className="bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto text-xs text-gray-300">
          {OPENAPI_SCHEMA}
        </pre>
      </div>
    </div>
  )
}
