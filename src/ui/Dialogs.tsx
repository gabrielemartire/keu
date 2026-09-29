import { useEffect, useState, type ReactNode } from 'react'
import { TEMPLATES } from '../model/templates'
import { randomSeed } from '../model/exercise'
import { Icon } from './Icon'

export function Dialog({ title, onClose, children, footer, width = 520 }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" style={{ width }} role="dialog" aria-label={title}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label="Chiudi">
            <Icon name="close" />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function NewProjectDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (templateId: string, seed?: string) => void }) {
  const [choice, setChoice] = useState(TEMPLATES[0].id)
  const [seed, setSeed] = useState(randomSeed)
  return (
    <Dialog
      title="Nuova battaglia"
      onClose={onClose}
      footer={
        <>
          <span className="muted small grow">La battaglia attuale verrà sostituita: salvala prima in JSON se ti serve.</span>
          <button className="btn" onClick={onClose}>
            Annulla
          </button>
          <button className="btn btn-primary" onClick={() => onCreate(choice, seed.trim() || randomSeed())}>
            Crea
          </button>
        </>
      }
    >
      {(['modo', 'demo'] as const).map((g) => (
        <div key={g} className="template-list">
          <h4 className="template-group">{g === 'modo' ? 'Come vuoi iniziare' : 'Esempi pronti, dal più semplice'}</h4>
          {TEMPLATES.filter((t) => t.group === g).map((t) => (
            <label key={t.id} className={`template${choice === t.id ? ' on' : ''}`}>
              <input type="radio" checked={choice === t.id} onChange={() => setChoice(t.id)} />
              <span>
                <strong>{t.name}</strong>
                <span className="small muted">{t.description}</span>
                {t.id === 'esercitazione' && choice === t.id && (
                  <span className="seed-row">
                    Seme
                    <input className="input seed-input" value={seed} onChange={(e) => setSeed(e.target.value.toUpperCase())} title="Stesso seme = stesso terreno" />
                    <button className="btn btn-sm" type="button" onClick={() => setSeed(randomSeed())}>
                      <Icon name="dice" size={13} /> Altro terreno
                    </button>
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      ))}
    </Dialog>
  )
}

export function MessageDialog({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          OK
        </button>
      }
    >
      <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{message}</p>
    </Dialog>
  )
}
