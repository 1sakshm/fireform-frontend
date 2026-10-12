import { useState, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../../store'
import type { FieldRow, Template } from '../../types'
import { DocumentViewer } from './DocumentViewer'
import { StudioSidebar } from './StudioSidebar'
import { useFieldRows } from '../template-builder/hooks'
import { useSpeechRecording } from '../fill-form/hooks'
import {
  uploadTemplatePdf,
  createTemplate,
  makeFillable,
  fetchTemplates,
  fetchModels,
  fillTemplate,
} from '../../lib/api'
import { saveLastOutputPath } from '../../lib/storage'
import { WeatherModal } from '../weather-forecast/WeatherForecast'
import { ZipcodeModal } from '../zipcode-resolver/ZipcodeResolver'
import { DEFAULT_TEMPLATE_DIRECTORY } from '../../lib/constants'

export function Studio() {
  const {
    templates,
    setTemplates,
    upsertTemplate,
    activeTemplateId,
    setActiveTemplateId,
    selectedFieldKey,
    setSelectedFieldKey,
    setPreviewPath,
    narrativeText,
    setNarrativeText,
  } = useStore(s => ({
    templates: s.templates,
    setTemplates: s.setTemplates,
    upsertTemplate: s.upsertTemplate,
    activeTemplateId: s.activeTemplateId,
    setActiveTemplateId: s.setActiveTemplateId,
    selectedFieldKey: s.selectedFieldKey,
    setSelectedFieldKey: s.setSelectedFieldKey,
    setPreviewPath: s.setPreviewPath,
    narrativeText: s.narrativeText,
    setNarrativeText: s.setNarrativeText,
  }))

  const [mode, setMode] = useState<'builder' | 'filler'>('builder')
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadedPdfPath, setUploadedPdfPath] = useState<string | null>(null)

  // Filler state
  const [availableModels, setAvailableModels] = useState<string[]>(['qwen2.5:3b', 'llama3.2', 'mistral'])
  const [selectedModel, setSelectedModel] = useState('qwen2.5:3b')

  // Modals & Loaders
  const [isMakeFillableLoading, setIsMakeFillableLoading] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [isFilling, setIsFilling] = useState(false)
  const [isWeatherOpen, setIsWeatherOpen] = useState(false)
  const [isZipcodeOpen, setIsZipcodeOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null)

  const { fieldRows, seedFromApiFields, resetRows, ...rowEdits } = useFieldRows()
  // Studio's flat {label: type} dict is lossy (it drops the extracted schema/tables and merges
  // duplicate labels), so fields are only sent once the user has edited the rows; otherwise
  // the backend extracts (create) or keeps (update) the PDF's own schema.
  const fieldsEditedRef = useRef(false)
  const addRow = () => {
    fieldsEditedRef.current = true
    rowEdits.addRow()
  }
  const removeRow = (index: number) => {
    fieldsEditedRef.current = true
    rowEdits.removeRow(index)
  }
  const updateRow = (index: number, updates: Partial<FieldRow>) => {
    fieldsEditedRef.current = true
    rowEdits.updateRow(index, updates)
  }

  // Hook for voice transcription
  const { sttState, sttStatus, start: startRecording, stop: stopRecording } = useSpeechRecording(transcript => {
    if (transcript) {
      setNarrativeText((prev: string) => (prev ? `${prev}\n${transcript}` : transcript))
      setStatusMessage({ text: 'Voice transcript added to narrative.', type: 'success' })
    }
  })

  // Surface recorder progress and failures (permission denied, no speech, ...) in the status banner
  useEffect(() => {
    if (!sttStatus || sttStatus === 'Transcription added.') return
    const isError = /denied|failed|not available|no speech|nothing recorded/i.test(sttStatus)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatusMessage({ text: `Voice: ${sttStatus}`, type: isError ? 'error' : 'info' })
  }, [sttStatus])

  // Load models on mount
  useEffect(() => {
    fetchModels()
      .then(res => {
        if (res && res.models && res.models.length > 0) {
          setAvailableModels(res.models)
          setSelectedModel(res.default || res.models[0])
        }
      })
      .catch(() => {})
  }, [])

  // Active template from the store; null means "new template" (clean slate)
  const activeTemplate = useMemo(() => {
    if (activeTemplateId) {
      return templates.find(t => t.id === activeTemplateId) || null
    }
    return null
  }, [activeTemplateId, templates])

  // Re-seed whenever a different template becomes active (not only on first load)
  const seededTemplateIdRef = useRef<number | null>(null)
  useEffect(() => {
    if (activeTemplate && activeTemplate.id !== seededTemplateIdRef.current) {
      setTemplateName(activeTemplate.name)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUploadedPdfPath(activeTemplate.pdf_path)

      // Seed fields from active template
      const fieldsObj = activeTemplate.fields || {}
      if (typeof fieldsObj === 'object') {
        const schema = (fieldsObj as any).schema?.properties || fieldsObj
        const entries = Object.entries(schema).map(([k, v]: [string, any]) => ({
          name: typeof v === 'object' && v.description ? v.description : k,
          type: typeof v === 'object' && v.type ? v.type : typeof v === 'string' ? v : 'string',
        }))
        if (entries.length > 0) {
          seedFromApiFields(entries, false)
        } else {
          resetRows()
        }
      }
      setSelectedFile(null)
      fieldsEditedRef.current = false
      seededTemplateIdRef.current = activeTemplate.id
    } else if (!activeTemplate && seededTemplateIdRef.current !== null) {
      // Switched to "New Template": clear the previous template's data
      setTemplateName('')
      setUploadedPdfPath(null)
      resetRows()
      setSelectedFile(null)
      fieldsEditedRef.current = false
      seededTemplateIdRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate])

  // Handle PDF file selection & upload
  const handleFileSelect = async (file: File) => {
    setSelectedFile(file)
    if (!templateName) {
      setTemplateName(file.name.replace(/\.[^/.]+$/, ''))
    }
    try {
      setStatusMessage({ text: 'Uploading template PDF...', type: 'info' })
      const res: any = await uploadTemplatePdf(file, DEFAULT_TEMPLATE_DIRECTORY)
      const path = typeof res?.pdf_path === 'string' ? res.pdf_path : ''
      setUploadedPdfPath(path)
      // Seed the field list from the fillable fields the backend extracted
      const fields = Array.isArray(res?.fields) ? res.fields : []
      const seeded = fields.length > 0 ? seedFromApiFields(fields) : null
      if (seeded === 'seeded') fieldsEditedRef.current = false
      const detail =
        seeded === 'seeded'
          ? ` — loaded ${fields.length} field${fields.length === 1 ? '' : 's'} from the PDF`
          : seeded === 'kept'
            ? ' — kept your existing fields'
            : res?.field_count === 0
              ? ' — no fillable fields found; try AI Schema'
              : ''
      setStatusMessage({ text: `Uploaded ${file.name}${detail}`, type: 'success' })
    } catch (err: any) {
      setStatusMessage({ text: `Upload failed: ${err.message}`, type: 'error' })
    }
  }

  // Handle Make Fillable / AI Schema Extraction
  const handleMakeFillable = async () => {
    if (!uploadedPdfPath && !selectedFile) {
      setStatusMessage({ text: 'Please select or upload a PDF first.', type: 'error' })
      return
    }

    setIsMakeFillableLoading(true)
    setStatusMessage({ text: 'Detecting form fields and creating a fillable PDF (this can take a minute)...', type: 'info' })
    try {
      let path = uploadedPdfPath
      if (!path && selectedFile) {
        const res: any = await uploadTemplatePdf(selectedFile, DEFAULT_TEMPLATE_DIRECTORY)
        path = typeof res?.pdf_path === 'string' ? res.pdf_path : null
        setUploadedPdfPath(path)
      }

      if (!path) throw new Error('No PDF path available.')

      // Backend returns { pdf_path, field_count } for the fillable copy; failures are errors
      // (MAKE_FILLABLE_FAILED) and land in the catch below.
      const res: any = await makeFillable(path)
      const count = typeof res?.field_count === 'number' ? res.field_count : null
      setUploadedPdfPath(typeof res?.pdf_path === 'string' && res.pdf_path ? res.pdf_path : path)
      // Drop the original upload's rows; with no fields sent, Register extracts them from the fillable PDF
      seedFromApiFields([], false)
      fieldsEditedRef.current = false
      const countText = count !== null ? ` with ${count} field${count === 1 ? '' : 's'} detected` : ''
      setStatusMessage({ text: `Fillable PDF created${countText}. Its fields are read from the PDF when you register.`, type: 'success' })
    } catch (err: any) {
      setStatusMessage({ text: `Extraction failed: ${err.message}`, type: 'error' })
    } finally {
      setIsMakeFillableLoading(false)
    }
  }

  // Handle Register Template
  const handleRegisterTemplate = async () => {
    if (!templateName.trim()) {
      setStatusMessage({ text: 'Please provide a template name.', type: 'error' })
      return
    }
    if (!uploadedPdfPath) {
      setStatusMessage({ text: 'Upload a PDF template before registering.', type: 'error' })
      return
    }

    setIsRegistering(true)
    setStatusMessage({ text: 'Registering template in database...', type: 'info' })
    try {
      // Empty fields ({}) let the backend extract the PDF's schema; see fieldsEditedRef
      const fieldsDict: Record<string, string> = {}
      if (fieldsEditedRef.current) fieldRows.forEach(f => {
        if (f.name.trim()) fieldsDict[f.name.trim()] = f.type || 'string'
      })

      const created: any = await createTemplate({
        name: templateName.trim(),
        pdf_path: uploadedPdfPath || 'src/inputs/sample.pdf',
        fields: fieldsDict,
      })

      const newTemplate: Template = {
        id: Number(created.id),
        name: created.name || templateName.trim(),
        pdf_path: created.pdf_path || uploadedPdfPath || '',
        fields: created.fields || fieldsDict,
        field_count: created.field_count,
      }

      upsertTemplate(newTemplate)
      setActiveTemplateId(newTemplate.id)
      setStatusMessage({ text: `Template "${newTemplate.name}" registered!`, type: 'success' })

      // Refresh templates
      fetchTemplates().then(setTemplates)
    } catch (err: any) {
      setStatusMessage({ text: `Registration failed: ${err.message}`, type: 'error' })
    } finally {
      setIsRegistering(false)
    }
  }

  // Handle Auto-Fill Form
  const handleFillForm = async () => {
    if (!narrativeText.trim()) {
      setStatusMessage({ text: 'Please enter incident narrative or notes.', type: 'error' })
      return
    }

    const tplId = activeTemplate?.id ?? null
    if (!tplId) {
      setStatusMessage({ text: 'Please select or register a template first.', type: 'error' })
      return
    }

    setIsFilling(true)
    setStatusMessage({ text: 'Running LLM pipeline to fill document...', type: 'info' })
    try {
      const combinedInput = templateDescription.trim()
        ? `[FORM / TEMPLATE CONTEXT: ${templateDescription.trim()}]\n\n${narrativeText.trim()}`
        : narrativeText.trim()

      const res: any = await fillTemplate({
        template_id: tplId,
        input_text: combinedInput,
        model: selectedModel,
      })

      const outPath = typeof res?.output_pdf_path === 'string' ? res.output_pdf_path : ''
      if (outPath) {
        setPreviewPath(outPath)
        setUploadedPdfPath(outPath)
        saveLastOutputPath(outPath)
        setStatusMessage({ text: 'Document filled and PDF created!', type: 'success' })
      }
    } catch (err: any) {
      setStatusMessage({ text: `Fill failed: ${err.message}`, type: 'error' })
    } finally {
      setIsFilling(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-100">
      {/* Status banner if active */}
      {statusMessage && (
        <div
          className={`px-4 py-1.5 text-xs font-medium flex items-center justify-between transition-all ${
            statusMessage.type === 'error'
              ? 'bg-red-600 text-white'
              : statusMessage.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-zinc-900 text-white'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-xs hover:opacity-80 px-1"
          >
            ×
          </button>
        </div>
      )}

      {/* Main 2/3 and 1/3 Split Workspace (Layout from Photo 1) */}
      <div className="flex-1 flex h-full overflow-hidden">
        {/* Left Pane (2/3 width): Real PDF Document Viewer */}
        <DocumentViewer
          template={activeTemplate}
          fields={fieldRows}
          pdfPath={uploadedPdfPath || activeTemplate?.pdf_path}
          onFileSelect={handleFileSelect}
        />

        {/* Right Pane (1/3 width): Studio Sidebar */}
        <StudioSidebar
          mode={mode}
          onModeChange={setMode}
          templateName={templateName}
          onTemplateNameChange={setTemplateName}
          templateDescription={templateDescription}
          onTemplateDescriptionChange={setTemplateDescription}
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          fieldRows={fieldRows}
          onAddField={addRow}
          onRemoveField={removeRow}
          onUpdateField={updateRow}
          selectedFieldKey={selectedFieldKey}
          onSelectField={setSelectedFieldKey}
          onMakeFillable={handleMakeFillable}
          isMakeFillableLoading={isMakeFillableLoading}
          onRegisterTemplate={handleRegisterTemplate}
          isRegistering={isRegistering}
          narrativeText={narrativeText}
          onNarrativeChange={setNarrativeText}
          isRecording={sttState === 'recording'}
          isTranscribing={sttState === 'transcribing'}
          onToggleRecording={() => {
            if (sttState === 'recording') stopRecording()
            else startRecording()
          }}
          availableModels={availableModels}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          onFillForm={handleFillForm}
          isFilling={isFilling}
          onOpenWeather={() => setIsWeatherOpen(true)}
          onOpenZipcode={() => setIsZipcodeOpen(true)}
        />
      </div>

      {/* Assistant Modals */}
      <WeatherModal
        isOpen={isWeatherOpen}
        onClose={() => setIsWeatherOpen(false)}
        onAgree={weatherText => {
          setNarrativeText((prev: string) => (prev ? `${prev}\n\n[WEATHER CONDITIONS]\n${weatherText}` : weatherText))
          setIsWeatherOpen(false)
        }}
      />

      <ZipcodeModal
        isOpen={isZipcodeOpen}
        onClose={() => setIsZipcodeOpen(false)}
        onFetchWeather={(lat, lon) => {
          setIsZipcodeOpen(false)
          setIsWeatherOpen(true)
          setStatusMessage({ text: `Address located at ${lat.toFixed(4)}, ${lon.toFixed(4)}`, type: 'info' })
        }}
      />
    </div>
  )
}
