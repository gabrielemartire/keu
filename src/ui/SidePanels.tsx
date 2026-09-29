import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PHASES, TURNS_PER_DAY, UNIT_INFO } from '../model/catalog'
import { CATEGORIES, SEVERITY_LABEL, type Category, type Issue, type Severity } from '../engine/checks'
import { fmt } from '../engine/rates'
import { INTENSITY, SCENARIOS, type Intensity } from '../engine/scenarios'
import { turnLabel, type LogEntry } from '../engine/sim'
import { live, useLive } from '../live/liveStore'
import { useStore } from '../store/store'
import { Field, NumberInput, Select, TextInput } from './controls'
import { EnemyCard, STATUS_LABEL } from './Inspector'
import { Icon, UnitSymbol } from './Icon'

// ---------------------------------------------------------------------------
// Checks

export function ChecksPanel() {
  const checks = useLive((s) => s.checks)
  const [sev, setSev] = useState<Record<Severity, boolean>>({ error: true, warning: true, info: true })
  const [cat, setCat] = useState<Category | null>(null)
  if (!checks) return null
  const list = checks.issues.filter((i) => sev[i.severity] && (!cat || i.category === cat))
  const cats = CATEGORIES.filter((c) => checks.issues.some((i) => i.category === c))
  return (
    <div className="checks">
      <div className="checks-summary">
        {(['error', 'warning', 'info'] as Severity[]).map((s) => (
          <button key={s} className={`sev-toggle sev-${s}${sev[s] ? ' on' : ''}`} onClick={() => setSev({ ...sev, [s]: !sev[s] })}>
            <Icon name={s === 'error' ? 'error' : s === 'warning' ? 'warning' : 'info'} size={13} /> {checks.counts[s]} {SEVERITY_LABEL[s]}
          </button>
        ))}
      </div>
      {cats.length > 1 && (
        <div className="checks-cats">
          <button className={!cat ? 'on' : ''} onClick={() => setCat(null)}>
            Tutte
          </button>
          {cats.map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(cat === c ? null : c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <div className="checks-empty">
          <Icon name="check" size={32} />
          <strong>Nessun problema</strong>
          <p>La logistica a regime è coerente. Prova uno scenario nel pannello Test.</p>
        </div>
      ) : (
        <ul className="issue-list">
          {list.map((i) => (
            <IssueRow key={i.id} issue={i} />
          ))}
        </ul>
      )}
    </div>
  )
}

function IssueRow({ issue }: { issue: Issue }) {
  const units = useStore((s) => s.units)
  const targets = issue.targets.flatMap((t) => (t.kind === 'unit' ? [units.find((u) => u.id === t.id)?.nodeId ?? ''] : t.kind === 'enemy' ? [] : [t.id])).filter(Boolean)
  return (
    <li>
      <button
        className={`issue sev-${issue.severity}`}
        disabled={!targets.length}
        onClick={() => {
          const st = useStore.getState()
          st.select(targets, true)
          st.setView('mappa')
        }}
      >
        <span className="issue-icon">
          <Icon name={issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info'} size={15} />
        </span>
        <span className="issue-body">
          <span className="issue-msg">{issue.message}</span>
          {issue.hint && <span className="issue-hint">{issue.hint}</span>}
          <span className="issue-meta">{issue.category}</span>
        </span>
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Live situation

export function SituationPanel() {
  const sim = useLive((s) => s.sim)
  const current = useLive((s) => s.current)
  const world = useLive((s) => s.world)
  const enemies = useStore(useShallow((s) => s.enemies.filter((e) => !e.targetAreaId && !e.originAreaId)))
  const scenarioId = useLive((s) => s.scenarioId)
  const last = sim?.series[sim.series.length - 1]
  const first = sim?.series[0]
  const units = Object.values(current?.units ?? {})
  const feed = useMemo(() => (sim ? [...sim.log].reverse().slice(0, 60) : []), [sim])
  return (
    <div className="situation">
      <div className="sit-intro">
        {sim ? (
          <p>
            Turno {sim.turn} · Giorno {turnLabel(sim.turn).day}, {PHASES[turnLabel(sim.turn).phase].toLowerCase()}. Scenario: <strong>{SCENARIOS.find((x) => x.id === scenarioId)?.name}</strong>.
          </p>
        ) : (
          <p>
            Premi <strong>Avvia</strong> sulla mappa: i reparti consumano, i posti ordinano ciò che manca e i carri partono da soli. Tasto destro su edifici, percorsi e aree per cambiare la situazione.
          </p>
        )}
      </div>
      {last && first && (
        <div className="kpis">
          <Kpi label="Uomini" value={fmt(last.men)} delta={last.men - first.men} />
          <Kpi label="Morale medio" value={fmt(last.morale)} delta={last.morale - first.morale} />
          <Kpi label="Feriti" value={fmt(last.wounded)} />
          <Kpi label="Morti" value={fmt(last.dead)} tone={last.dead ? 'bad' : undefined} />
          <Kpi label="Consegnato" value={`${fmt(last.deliveredKg / 1000, 1)} t`} />
          <Kpi label="Perso" value={`${fmt(last.lostKg / 1000, 1)} t`} tone={last.lostKg ? 'bad' : undefined} />
        </div>
      )}
      <div className="sit-section">
        <h3>Reparti</h3>
        <ul className="unit-list">
          {units.map((u) => (
            <li key={u.id} className={`unit-row st-${u.status}`}>
              <UnitSymbol type={u.type} size={18} />
              <span className="unit-row-name" title={u.name}>
                {u.name}
              </span>
              <span className="unit-row-where">{u.leg && u.dest && world ? `→ ${world.name(u.dest)}` : u.nodeId && world ? world.name(u.nodeId) : '—'}</span>
              <span className="mono small">{fmt(u.men)}</span>
              <span className={`morale m-${u.morale >= 60 ? 'ok' : u.morale >= 35 ? 'mid' : 'low'}`} title={`Morale ${fmt(u.morale)} · ${STATUS_LABEL[u.status]}`}>
                {fmt(u.morale)}
              </span>
              {u.status !== 'distrutto' && (
                <button className="btn btn-icon" title="Ordina spostamento: poi clicca l’edificio sulla mappa" onClick={() => useLive.setState({ ordering: u.id })}>
                  <Icon name="march" size={14} />
                </button>
              )}
            </li>
          ))}
          {!units.length && <li className="muted small">Nessun reparto: aggiungili dall’Inspector di un edificio.</li>}
        </ul>
      </div>
      {enemies.length > 0 && (
        <div className="sit-section">
          <h3>Forze nemiche senza bersaglio</h3>
          {enemies.map((e) => (
            <EnemyCard key={e.id} enemy={e} showTarget />
          ))}
        </div>
      )}
      <div className="sit-section">
        <h3>Cronaca</h3>
        <LogList entries={feed} compact />
        {!feed.length && <p className="muted small">Gli eventi della simulazione compariranno qui.</p>}
      </div>
    </div>
  )
}

function Kpi({ label, value, delta, tone }: { label: string; value: string; delta?: number; tone?: 'bad' }) {
  return (
    <div className={`kpi${tone ? ` kpi-${tone}` : ''}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {delta !== undefined && Math.abs(delta) >= 0.5 && <span className={`kpi-delta ${delta < 0 ? 'down' : 'up'}`}>{delta > 0 ? '+' : ''}{fmt(delta)}</span>}
    </div>
  )
}

export function LogList({ entries, compact = false }: { entries: LogEntry[]; compact?: boolean }) {
  const select = (ids: string[]) => {
    const st = useStore.getState()
    const nodeIds = ids.filter((id) => st.nodes.some((n) => n.id === id) || st.edges.some((e) => e.id === id))
    if (nodeIds.length) {
      st.select(nodeIds, true)
      st.setView('mappa')
    }
  }
  return (
    <ul className={`log-list${compact ? ' compact' : ''}`}>
      {entries.map((l, i) => {
        const { day, phase } = turnLabel(l.turn)
        return (
          <li key={`${l.turn}-${i}`} className={`log-entry tone-${l.tone}${l.breaking ? ' breaking' : ''}`} onClick={() => select(l.targets)}>
            <span className="log-time">
              G{day} {PHASES[phase].slice(0, 3)}
            </span>
            <span className="log-text">{l.text}</span>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Scenario tests

export function TestPanel() {
  const scenarioId = useLive((s) => s.scenarioId)
  const params = useLive((s) => s.params)
  const reports = useLive((s) => s.reports)
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]
  const armyMen = useStore((s) => s.units.reduce((x, u) => x + u.men, 0))
  return (
    <div className="testpanel">
      <div className="sit-intro">
        <p>
          Un test esegue l’intera simulazione in un istante con lo scenario scelto. Stesso seme = stesso risultato: cambia la logistica (un ponte in più, un deposito più avanti, una scorta) e rilancialo per confrontare.
        </p>
      </div>
      <div className="scenario-list">
        {SCENARIOS.map((s) => (
          <label key={s.id} className={`template${s.id === scenarioId ? ' on' : ''}`}>
            <input type="radio" checked={s.id === scenarioId} onChange={() => live.setScenario(s.id)} />
            <span>
              <strong>{s.name}</strong>
              <span className="small muted">{s.description}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="test-params">
        <div className="grid2">
          <Field label="Intensità" hint={`Forze in proporzione ai tuoi ${fmt(armyMen)} uomini`}>
            <Select value={params.intensity} onChange={(intensity: Intensity) => live.setParams({ intensity })} options={(Object.keys(INTENSITY) as Intensity[]).map((k) => ({ value: k, label: INTENSITY[k].label }))} />
          </Field>
          <Field label="Il nemico muove il giorno">
            <NumberInput value={params.startDay} min={1} max={30} onChange={(v) => live.setParams({ startDay: v ?? 1 })} />
          </Field>
          <Field label="Durata del test">
            <NumberInput value={params.days} min={1} max={14} suffix="giorni" onChange={(v) => live.setParams({ days: v ?? 7 })} />
          </Field>
          <Field label="Seme" hint="Rende ripetibili le imboscate.">
            <TextInput value={params.seed} onChange={(seed) => live.setParams({ seed })} mono />
          </Field>
        </div>
        <p className="small muted">Mette alla prova {scenario.tests}. Le forze nemiche disegnate sulla mappa agiscono in ogni caso.</p>
        <div className="action-row">
          <button className="btn btn-primary" onClick={() => live.runTest()}>
            <Icon name="report" size={14} /> Esegui test ({params.days * TURNS_PER_DAY} turni)
          </button>
          <button className="btn" onClick={() => { live.reset(); live.play(); useStore.getState().setView('mappa') }} title="Guarda lo stesso scenario scorrere sulla mappa">
            <Icon name="eye" size={14} /> Guardalo dal vivo
          </button>
        </div>
      </div>
      {reports.length > 0 && (
        <div className="sit-section">
          <h3>Test eseguiti</h3>
          <ReportList />
        </div>
      )}
    </div>
  )
}

export function ReportList() {
  const reports = useLive((s) => s.reports)
  const baseline = useLive((s) => s.baselineIndex)
  const index = useLive((s) => s.reportIndex)
  return (
    <ul className="report-list">
      {reports.map((r, i) => (
        <li key={r.createdAt + i} className={`report-row${index === i ? ' on' : ''}`}>
          <button className="linklike" onClick={() => { live.showReport(i); useStore.getState().setView('rapporto') }}>
            <span className={`verdict-dot tone-${r.verdictTone}`} />
            #{i + 1} {r.scenarioName}
          </button>
          <span className="small muted">
            {r.verdict} · {fmt(r.holdDays, 1)} gg
          </span>
          <button className={`btn btn-sm${baseline === i ? ' btn-primary' : ''}`} onClick={() => live.setBaseline(baseline === i ? null : i)} title="Usa come riferimento per il confronto">
            {baseline === i ? 'Riferimento' : 'Confronta'}
          </button>
        </li>
      ))}
    </ul>
  )
}

export const unitLabel = (t: keyof typeof UNIT_INFO) => UNIT_INFO[t].label
