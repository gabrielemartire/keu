import { useEffect, useState } from 'react'
import { live, useLive } from '../live/liveStore'
import { useStore } from '../store/store'
import { Icon } from './Icon'

interface GuideState {
  step: number
  open: boolean
}

// Where the reader is in the guide, per battle: survives a reload, not a new battle.
const keyOf = (createdAt: string) => `keu-guide-${createdAt}`

function load(key: string): GuideState {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return { step: 0, open: true, ...JSON.parse(raw) }
  } catch {
    // Storage unavailable: start from the first step.
  }
  return { step: 0, open: true }
}

/** Step-by-step walkthrough of a demo or exercise, floating over the map. */
export function Guide() {
  const steps = useStore((s) => s.meta.guide)
  const key = keyOf(useStore((s) => s.meta.createdAt))
  const running = useLive((s) => s.running)
  const [st, setSt] = useState<GuideState>(() => load(key))

  useEffect(() => setSt(load(key)), [key])
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(st))
    } catch {
      // Not remembered: fine.
    }
  }, [key, st])

  if (!steps?.length) return null
  if (!st.open)
    return (
      <button className="btn btn-sm guide-reopen" onClick={() => setSt({ ...st, open: true })}>
        <Icon name="info" size={13} /> Guida
      </button>
    )

  const i = Math.min(st.step, steps.length - 1)
  const step = steps[i]
  const go = (n: number) => setSt({ ...st, step: Math.max(0, Math.min(steps.length - 1, n)) })
  return (
    <div className="guide" role="dialog" aria-label="Guida">
      <div className="guide-head">
        <span className="guide-count">
          Guida · {i + 1}/{steps.length}
        </span>
        <span className="grow" />
        <button className="btn btn-icon" onClick={() => setSt({ ...st, open: false })} aria-label="Chiudi la guida" title="Chiudi (la riapri dal pulsante Guida)">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="guide-progress">
        <span style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
      </div>
      <h3>{step.title}</h3>
      <p>{step.text}</p>
      {(step.focus?.length || step.action) && (
        <div className="guide-actions">
          {!!step.focus?.length && (
            <button className="btn btn-sm" onClick={() => useStore.getState().select(step.focus!, true)}>
              <Icon name="eye" size={13} /> Mostrami
            </button>
          )}
          {step.action && (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => {
                live.act(step.action!.event)
                if (!running) live.play()
              }}
            >
              <Icon name="swords" size={13} /> {step.action.label}
            </button>
          )}
        </div>
      )}
      <div className="guide-foot">
        <button className="btn btn-sm" disabled={i === 0} onClick={() => go(i - 1)}>
          Indietro
        </button>
        <span className="grow" />
        {i < steps.length - 1 ? (
          <button className="btn btn-sm btn-primary" onClick={() => go(i + 1)}>
            Avanti
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={() => setSt({ step: 0, open: false })}>
            Fine
          </button>
        )}
      </div>
    </div>
  )
}
