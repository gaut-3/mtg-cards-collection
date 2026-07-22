import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload as UploadIcon, CheckCircle, AlertCircle, FileText } from 'lucide-react'
import { useAuthContext } from '../components/shared/AuthContext'
import { useCollection } from '../hooks/useCollection'
import { parseManaBoxCSV } from '../lib/manaboxParser'
import { enrichCollection } from '../lib/scryfallClient'

type Stage = 'idle' | 'parsing' | 'enriching' | 'saving' | 'done' | 'error'

export default function Upload() {
  const { user } = useAuthContext()
  const { saveCollection } = useCollection(user?.uid ?? null)
  const navigate = useNavigate()

  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [errorMsg, setErrorMsg] = useState('')
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.csv')) {
        setErrorMsg('Please upload a .csv file exported from ManaBox.')
        setStage('error')
        return
      }
      setFileName(file.name)
      setStage('parsing')
      setErrorMsg('')

      try {
        const text = await file.text()
        const manaboxCards = parseManaBoxCSV(text)

        if (manaboxCards.length === 0) {
          setErrorMsg('No cards found in the CSV. Make sure it is a valid ManaBox export.')
          setStage('error')
          return
        }

        setStage('enriching')
        setProgress({ done: 0, total: manaboxCards.length })

        const enriched = await enrichCollection(manaboxCards, (done, total) => {
          setProgress({ done, total })
        })

        setStage('saving')
        await saveCollection(enriched)
        setStage('done')
      } catch (e: any) {
        console.error(e)
        setErrorMsg(e.message ?? 'An unexpected error occurred.')
        setStage('error')
      }
    },
    [saveCollection]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="max-w-lg mx-auto mt-8">
      <h1 className="text-2xl font-bold text-white mb-1">Import Collection</h1>
      <p className="text-gray-400 text-sm mb-8">
        Export your collection from ManaBox (Settings → Export → CSV) then upload it here.
      </p>

      {/* Drop zone */}
      {(stage === 'idle' || stage === 'error') && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition ${
            dragging
              ? 'border-violet-400 bg-violet-500/10'
              : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50'
          }`}
        >
          <UploadIcon className="w-10 h-10 text-gray-500 mx-auto mb-4" />
          <p className="text-white font-medium mb-1">Drop your ManaBox CSV here</p>
          <p className="text-gray-500 text-sm">or click to browse</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFile}
            className="hidden"
          />
        </div>
      )}

      {stage === 'error' && (
        <div className="mt-4 p-4 bg-red-900/30 border border-red-700 rounded-xl flex gap-3 items-start">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{errorMsg}</p>
        </div>
      )}

      {/* Progress states */}
      {(stage === 'parsing' || stage === 'enriching' || stage === 'saving') && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-5 h-5 text-violet-400" />
            <span className="text-white font-medium text-sm truncate">{fileName}</span>
          </div>

          <div className="space-y-4">
            <Step label="Parsing CSV" done={stage !== 'parsing'} active={stage === 'parsing'} />
            <Step
              label={
                stage === 'enriching'
                  ? `Fetching card data from Scryfall… (${progress.done}/${progress.total})`
                  : 'Fetch card data from Scryfall'
              }
              done={(['saving', 'done'] as Stage[]).includes(stage)}
              active={stage === 'enriching'}
            />
            <Step label="Saving to Firestore" done={(['done'] as Stage[]).includes(stage)} active={stage === 'saving'} />
          </div>

          {stage === 'enriching' && progress.total > 0 && (
            <div className="mt-6">
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-gray-500 text-xs mt-2 text-right">{pct}%</p>
            </div>
          )}
        </div>
      )}

      {stage === 'done' && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h2 className="text-white font-semibold text-lg mb-2">Import complete!</h2>
          <p className="text-gray-400 text-sm mb-6">
            Your collection has been saved and is ready to explore.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/collection')}
              className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition"
            >
              View collection
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition"
            >
              Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Step({
  label,
  done,
  active,
}: {
  label: string
  done: boolean
  active: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
          done
            ? 'border-green-500 bg-green-500'
            : active
            ? 'border-violet-400 border-t-transparent animate-spin'
            : 'border-gray-600'
        }`}
      >
        {done && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className={`text-sm ${done ? 'text-gray-400' : active ? 'text-white' : 'text-gray-600'}`}>
        {label}
      </span>
    </div>
  )
}
