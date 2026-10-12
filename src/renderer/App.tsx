import { useEffect, useState } from 'react'
import {
  Layers,
  FileText,
  History,
  Flame,
} from 'lucide-react'
import { useStore } from './store'
import { waitForBackend, fetchTemplates } from './lib/api'
import { Studio } from './features/studio/Studio'
import { TemplatesList } from './features/templates-list/TemplatesList'
import { LoadingScreen } from './components/LoadingScreen'
import { Submissions } from './features/submissions/Submissions'
import { PdfPreviewer } from './components/PdfPreviewer'
import { cn } from './lib/utils'

const NAV_ITEMS = [
  { id: 'studio', label: 'Studio & Workspace', icon: Layers },
  { id: 'templatesList', label: 'Templates Library', icon: FileText },
  { id: 'submissions', label: 'Submissions & Analytics', icon: History },
]

export function App() {
  const { activeTab, setActiveTab, setTemplates, templates } = useStore(s => ({
    activeTab: s.activeTab,
    setActiveTab: s.setActiveTab,
    setTemplates: s.setTemplates,
    templates: s.templates,
  }))

  const [ready, setReady] = useState(false)

  useEffect(() => {
    waitForBackend().then(async () => {
      setReady(true)
      try {
        const fetched = await fetchTemplates()
        setTemplates(fetched)
      } catch {
        // Fallback handled by store
      }
    })
  }, [])

  if (!ready) return <LoadingScreen />

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-50 text-zinc-950 font-sans overflow-hidden select-none">
      {/* Top Application Header Bar */}
      <header className="h-12 border-b border-zinc-200 bg-white px-4 flex items-center justify-between flex-shrink-0">
        {/* Left: App Title and Logo */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-zinc-900 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <span className="text-sm font-bold tracking-tight text-zinc-900">FireForm</span>
          <span className="text-[11px] font-mono text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-100">
            v1.1.0
          </span>
        </div>

        {/* Center: Top Navigation Links (Photo 2 Pill Style) */}
        <nav className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg border border-zinc-200 text-xs">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const isActive = activeTab === item.id || (item.id === 'studio' && activeTab === 'fillForm')
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 select-none',
                  isActive
                    ? 'bg-white text-zinc-950 font-semibold shadow-xs border border-zinc-200/80'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-zinc-950' : 'text-zinc-500')} />
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Right: Live Connection Status Pill (Photo 2 style: ● Saved · v1) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Connected</span>
          </div>

          <div className="text-[11px] font-mono text-zinc-400">
            <span>{templates.length} {templates.length === 1 ? 'template' : 'templates'}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {(activeTab === 'studio' || activeTab === 'fillForm' || activeTab === 'createTemplate') && (
          <Studio />
        )}
        {activeTab === 'templatesList' && (
          <div className="flex-1 overflow-auto p-6 bg-zinc-50">
            <div className="max-w-6xl mx-auto">
              <TemplatesList />
            </div>
          </div>
        )}
        {activeTab === 'submissions' && (
          <div className="flex-1 overflow-auto p-6 bg-zinc-50">
            <div className="max-w-6xl mx-auto">
              <Submissions />
            </div>
          </div>
        )}
        {activeTab === 'pdfPreviewer' && <PdfPreviewer />}
      </main>
    </div>
  )
}
