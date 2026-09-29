import { useStore, type View } from '../store/store'
import { useLive } from '../live/liveStore'
import { Icon, type UiIconName } from './Icon'

const VIEWS: { id: View; label: string; icon: UiIconName }[] = [
  { id: 'mappa', label: 'Mappa', icon: 'map' },
  { id: 'inventario', label: 'Inventario', icon: 'box' },
  { id: 'reparti', label: 'Reparti', icon: 'users' },
  { id: 'percorsi', label: 'Percorsi', icon: 'route' },
  { id: 'bilancio', label: 'Bilancio flussi', icon: 'scale' },
  { id: 'registro', label: 'Registro', icon: 'log' },
  { id: 'rapporto', label: 'Rapporti di test', icon: 'report' },
]

export interface TopBarActions {
  onNew: () => void
  onOpen: () => void
  onSave: () => void
}

export function TopBar({ actions }: { actions: TopBarActions }) {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const name = useStore((s) => s.meta.name)
  const updateMeta = useStore((s) => s.updateMeta)
  const counts = useLive((s) => s.checks?.counts)
  const logCount = useLive((s) => s.sim?.log.length ?? 0)
  const reports = useLive((s) => s.reports.length)
  const mod = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl+'

  return (
    <header className="topbar">
      <div className="brand">
        <img src="/favicon.svg" width="26" height="26" alt="" aria-hidden />
        {/* MedievalSharp (Google Fonts, index.html): used only by the title. */}
        <span className="brand-title">Keu</span>
        <span className="brand-sub">logistica di battaglia</span>
      </div>
      <input className="project-name" value={name} onChange={(e) => updateMeta({ name: e.target.value })} aria-label="Nome della battaglia" spellCheck={false} />

      <div className="toolbar">
        <div className="tool-group">
          <button className="tool" onClick={actions.onNew} title="Nuova battaglia / esempio">
            <Icon name="new" /> Nuovo
          </button>
          <button className="tool" onClick={actions.onOpen} title={`Apri file JSON (${mod}O)`}>
            <Icon name="open" /> Apri
          </button>
          <button className="tool" onClick={actions.onSave} title={`Salva come JSON (${mod}S)`}>
            <Icon name="save" /> Salva JSON
          </button>
        </div>
        <div className="tool-group">
          <button className="tool icon-only" onClick={undo} disabled={!canUndo} title={`Annulla (${mod}Z)`}>
            <Icon name="undo" />
          </button>
          <button className="tool icon-only" onClick={redo} disabled={!canRedo} title={`Ripeti (${mod}⇧Z)`}>
            <Icon name="redo" />
          </button>
        </div>
      </div>

      <nav className="views">
        {VIEWS.map((v) => (
          <button key={v.id} className={`view-tab${view === v.id ? ' on' : ''}`} onClick={() => setView(v.id)}>
            <Icon name={v.icon} size={15} />
            {v.label}
            {v.id === 'registro' && logCount > 0 && <span className="tab-count">{logCount}</span>}
            {v.id === 'rapporto' && reports > 0 && <span className="tab-count">{reports}</span>}
          </button>
        ))}
        <span className="views-spacer" />
        {counts && (
          <span className={`health ${counts.error ? 'bad' : counts.warning ? 'warn' : 'ok'}`}>
            <Icon name={counts.error ? 'error' : counts.warning ? 'warning' : 'check'} size={14} />
            {counts.error ? `${counts.error} criticità` : counts.warning ? `${counts.warning} avvisi` : 'Logistica coerente'}
          </span>
        )}
      </nav>
    </header>
  )
}
