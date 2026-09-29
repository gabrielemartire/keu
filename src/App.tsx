import { useCallback, useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { projectOf, useStore } from './store/store'
import { isAutosaveEnabled, restoreAutosave, setAutosaveEnabled, startAutosave } from './store/autosave'
import { live, useLive, useLiveDriver } from './live/liveStore'
import { Canvas } from './editor/Canvas'
import { Palette } from './ui/Palette'
import { Inspector } from './ui/Inspector'
import { ChecksPanel, SituationPanel, TestPanel } from './ui/SidePanels'
import { TopBar } from './ui/TopBar'
import { BalanceView, InventoryView, LogView, RoutesView, UnitsView } from './ui/TableViews'
import { ReportView } from './ui/ReportView'
import { Guide } from './ui/Guide'
import { MessageDialog, NewProjectDialog } from './ui/Dialogs'
import { Icon } from './ui/Icon'
import { TEMPLATES } from './model/templates'
import { importProject, projectToJson } from './model/schema'
import { dateStamp, downloadBlob, pickFile, slugify } from './lib/files'
import { fmt } from './engine/rates'

type DialogState = null | 'new' | { title: string; message: string }

export default function App() {
  return (
    <ReactFlowProvider>
      <Shell />
    </ReactFlowProvider>
  )
}

function Shell() {
  useLiveDriver()
  const view = useStore((s) => s.view)
  const sidePanel = useStore((s) => s.sidePanel)
  const setSidePanel = useStore((s) => s.setSidePanel)
  const counts = useLive((s) => s.checks?.counts)
  const running = useLive((s) => s.running)
  const turn = useLive((s) => s.sim?.turn)
  const reports = useLive((s) => s.reports.length)
  const nodeCount = useStore((s) => s.nodes.length)
  const edgeCount = useStore((s) => s.edges.length)
  const unitCount = useStore((s) => s.units.length)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [autosave, setAutosave] = useState(isAutosaveEnabled())
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!restoreAutosave()) useStore.getState().loadProject(TEMPLATES.find((t) => t.id === 'livello1')!.build())
    return startAutosave(setSavedAt)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  const save = useCallback(() => {
    const st = projectOf(useStore.getState())
    downloadBlob(projectToJson(st), `${slugify(st.meta.name)}-${dateStamp()}.json`, 'application/json')
    setToast('Battaglia salvata in JSON')
  }, [])

  const open = useCallback(async () => {
    const file = await pickFile('.json,application/json')
    if (!file) return
    const res = importProject(await file.text())
    if (!res.ok) {
      setDialog({ title: 'Impossibile aprire il file', message: res.error })
      return
    }
    live.reset()
    useStore.getState().loadProject(res.state)
    setToast(res.warnings.length ? `Aperto con ${res.warnings.length} avvisi` : `Aperto: ${res.state.meta.name}`)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.closest('input, textarea, select, [contenteditable]')
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        open()
      } else if (!typing && mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) useStore.getState().redo()
        else useStore.getState().undo()
      } else if (!typing && e.key === ' ' && useStore.getState().view === 'mappa') {
        e.preventDefault()
        live.toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, open])

  return (
    <div className="app">
      <TopBar actions={{ onNew: () => setDialog('new'), onOpen: open, onSave: save }} />
      <main className={`main view-${view}`}>
        {view === 'mappa' && <Palette />}
        <section className="center">
          {view === 'mappa' && <Canvas />}
          {view === 'mappa' && <Guide />}
          {view === 'inventario' && <InventoryView />}
          {view === 'reparti' && <UnitsView />}
          {view === 'percorsi' && <RoutesView />}
          {view === 'bilancio' && <BalanceView />}
          {view === 'registro' && <LogView />}
          {view === 'rapporto' && <ReportView />}
        </section>
        <aside className="side">
          <div className="side-tabs">
            <button className={sidePanel === 'proprieta' ? 'on' : ''} onClick={() => setSidePanel('proprieta')}>
              Proprietà
            </button>
            <button className={sidePanel === 'verifiche' ? 'on' : ''} onClick={() => setSidePanel('verifiche')}>
              Verifiche
              {!!counts?.error && <span className="badge badge-error">{counts.error}</span>}
              {!counts?.error && !!counts?.warning && <span className="badge badge-warning">{counts.warning}</span>}
            </button>
            <button className={sidePanel === 'situazione' ? 'on' : ''} onClick={() => setSidePanel('situazione')}>
              Situazione
              {running && <span className="live-dot" title="Simulazione in corso" />}
            </button>
            <button className={sidePanel === 'test' ? 'on' : ''} onClick={() => setSidePanel('test')}>
              Test
              {reports > 0 && <span className="badge badge-info">{reports}</span>}
            </button>
          </div>
          <div className="side-body">
            {sidePanel === 'proprieta' && <Inspector />}
            {sidePanel === 'verifiche' && <ChecksPanel />}
            {sidePanel === 'situazione' && <SituationPanel />}
            {sidePanel === 'test' && <TestPanel />}
          </div>
        </aside>
      </main>
      <footer className="statusbar">
        <span>
          {fmt(nodeCount)} elementi · {fmt(edgeCount)} percorsi · {fmt(unitCount)} reparti
        </span>
        <span>{turn !== undefined ? `Simulazione: turno ${turn}${running ? ' · in corso' : ' · in pausa'}` : 'Pianificazione'}</span>
        <span className="grow" />
        <label className="autosave" title="Salva automaticamente nel browser (resta su questo computer)">
          <input
            type="checkbox"
            checked={autosave}
            onChange={(e) => {
              setAutosaveEnabled(e.target.checked)
              setAutosave(e.target.checked)
            }}
          />
          Salvataggio automatico{savedAt && autosave ? ` · ${savedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </label>
        <a className="statusbar-link" href="https://github.com/gabrielemartire" target="_blank" rel="noopener noreferrer">
          <Icon name="flag" size={12} /> GitHub
        </a>
      </footer>
      {dialog === 'new' && (
        <NewProjectDialog
          onClose={() => setDialog(null)}
          onCreate={(id, seed) => {
            live.reset()
            useStore.getState().loadProject(TEMPLATES.find((t) => t.id === id)!.build(seed))
            setDialog(null)
          }}
        />
      )}
      {dialog && dialog !== 'new' && <MessageDialog title={dialog.title} message={dialog.message} onClose={() => setDialog(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
