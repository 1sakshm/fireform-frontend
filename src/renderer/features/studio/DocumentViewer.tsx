import { useState, useEffect, useRef } from 'react'
import {
  FileText,
  ExternalLink,
  Eye,
  Upload,
} from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { resolvePreviewUrl } from '../../lib/api'
import { withPdfViewerParams } from '../../lib/utils'
import type { Template } from '../../types'

interface DocumentViewerProps {
  template: Template | null
  fields: Array<{ name: string; type: string; key?: string }>
  pdfPath?: string | null
  onFileSelect?: (file: File) => void
}

export function DocumentViewer({
  template,
  fields,
  pdfPath,
  onFileSelect,
}: DocumentViewerProps) {
  const [frameUrl, setFrameUrl] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const activeBlobUrlRef = useRef<string | null>(null)

  const templateName = template?.name || (pdfPath ? pdfPath.split('/').pop() : 'Document Preview')
  const totalFields = fields.length

  const loadPdf = async (path: string) => {
    setLoadError(null)
    try {
      const url = await resolvePreviewUrl(path)
      if (url) {
        setFrameUrl(url)
      } else {
        // Drop the previous document so a failed load can't leave a stale PDF on screen
        setFrameUrl('')
        setLoadError(`Unable to preview PDF at path "${path}".`)
      }
    } catch (err: any) {
      setFrameUrl('')
      setLoadError(err?.message || 'Error loading PDF preview.')
    }
  }

  useEffect(() => {
    if (pdfPath && pdfPath.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadPdf(pdfPath.trim())
    } else {
      setFrameUrl('')
      setLoadError(null)
    }
  }, [pdfPath])

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current)
    }
    const blobUrl = URL.createObjectURL(file)
    activeBlobUrlRef.current = blobUrl
    setFrameUrl(blobUrl)
    setLoadError(null)

    if (onFileSelect) {
      onFileSelect(file)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-100 overflow-hidden border-r border-zinc-200">
      {/* Top Document Toolbar */}
      <div className="h-11 bg-white border-b border-zinc-200 px-4 flex items-center justify-between select-none flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-xs text-zinc-900 truncate">
            <FileText className="w-4 h-4 text-zinc-700 flex-shrink-0" />
            <span className="truncate">{templateName}</span>
          </div>

          <Badge variant="outline" className="text-[10px] bg-zinc-50 border-zinc-200 font-mono text-zinc-600">
            {totalFields} {totalFields === 1 ? 'field' : 'fields'}
          </Badge>

          {pdfPath && (
            <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[200px] hidden md:inline">
              {pdfPath}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {frameUrl && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => window.open(frameUrl, '_blank')}
              className="text-zinc-700 hover:text-zinc-900 bg-white text-[11px]"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Open External
            </Button>
          )}
        </div>
      </div>

      {/* Main PDF Viewport Frame */}
      <div className="flex-1 bg-zinc-200/60 p-3 overflow-hidden flex items-center justify-center">
        {frameUrl ? (
          <div className="w-full h-full bg-white rounded-md shadow-sm border border-zinc-300 overflow-hidden">
            <iframe
              id="documentPdfFrame"
              title="Template Document PDF Viewer"
              src={withPdfViewerParams(frameUrl)}
              className="w-full h-full border-0 bg-white"
            />
          </div>
        ) : (
          <div className="text-center p-8 max-w-sm space-y-3 bg-white border border-dashed border-zinc-300 rounded-lg shadow-xs">
            <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto text-zinc-500">
              <Eye className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">No PDF Loaded</p>
              <p className="text-xs text-zinc-500 mt-1">
                {loadError || 'Select a template or upload a new PDF form on the right.'}
              </p>
            </div>

            <label className="cursor-pointer inline-block pt-1">
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleLocalFileChange}
              />
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium shadow-xs transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload PDF Document</span>
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
