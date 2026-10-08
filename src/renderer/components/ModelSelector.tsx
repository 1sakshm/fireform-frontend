import { useEffect, useState } from 'react'
import { listModels, pullModel, type ModelInfo, type ModelProgress } from '../lib/api'
import { loadSelectedModel, saveSelectedModel } from '../lib/storage'

interface ModelSelectorProps {
  value: string
  onChange: (model: string) => void
  onBusyChange?: (busy: boolean) => void
}

export function ModelSelector({ value, onChange, onBusyChange }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState(value)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<ModelProgress | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    listModels()
      .then(data => {
        if (!active) return
        setModels(data.models)
        const saved = loadSelectedModel()
        const initial = saved && data.models.some(model => model.name === saved)
          ? saved
          : data.current_model
        setSelectedModel(initial)
        onChange(initial)
      })
      .catch(error => {
        if (active) setError((error as Error).message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [onChange])

  async function handleChange(model: string) {
    const selected = models.find(item => item.name === model)
    const previous = selectedModel
    setError('')
    setSelectedModel(model)
    onChange(model)

    if (!selected || selected.installed) {
      saveSelectedModel(model)
      return
    }

    setBusy(true)
    onBusyChange?.(true)
    setProgress(null)
    try {
      await pullModel(model, event => setProgress(event))
      const refreshed = await listModels()
      setModels(refreshed.models)
      saveSelectedModel(model)
    } catch (error) {
      setSelectedModel(previous)
      onChange(previous)
      setError((error as Error).message)
    } finally {
      setBusy(false)
      onBusyChange?.(false)
      setProgress(null)
    }
  }

  const percentage = progress?.completed != null && progress.total
    ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
    : 0

  return (
    <div className="stacked-form">
      <label htmlFor="fillModel">AI model</label>
      <select
        id="fillModel"
        value={selectedModel}
        disabled={loading || busy}
        onChange={event => void handleChange(event.target.value)}
      >
        {loading && <option value="">Loading models…</option>}
        {!loading && !models.length && <option value="">No models available</option>}
        {models.map(model => (
          <option key={model.name} value={model.name}>
            {model.name}
            {!model.installed ? ' (download)' : ''}
            {model.recommended ? ' (recommended)' : ''}
          </option>
        ))}
      </select>
      {busy && (
        <div aria-live="polite">
          <progress value={percentage} max={100} />
          <span>{progress?.status || 'Downloading model…'}{progress?.total ? ` (${percentage}%)` : ''}</span>
        </div>
      )}
      {error && <p className="status error" role="alert">{error}</p>}
    </div>
  )
}
