import { useRef, useState, type PointerEvent } from 'react'
import { PHASES, RESOURCE_INFO, TURNS_PER_DAY } from '../model/catalog'
import { COMPARE_ROWS, type Report } from '../engine/report'
import { fmt } from '../engine/rates'
import { INTENSITY } from '../engine/scenarios'
import { turnLabel } from '../engine/sim'
import { live, useLive } from '../live/liveStore'
import { useStore } from '../store/store'
import { Icon } from './Icon'
import { LogList, ReportList } from './SidePanels'
import { STATUS_LABEL } from './Inspector'

export function ReportView() {
  const reports = useLive((s) => s.reports)
  const index = useLive((s) => s.reportIndex)
  const baseline = useLive((s) => s.baselineIndex)
  const r = index !== null ? reports[index] : undefined
  if (!r) {
    return (
      <div className="table-view">
        <div className="empty-state">
          <Icon name="report" size={36} />
          <h2>Nessun test eseguito</h2>
          <p>Scegli uno scenario nel pannello <strong>Test</strong> a destra ed eseguilo: il rapporto comparirà qui.</p>
          <button className="btn btn-primary" onClick={() => useStore.getState().setSidePanel('test')}>
            <Icon name="swords" size={14} /> Apri il pannello Test
          </button>
        </div>
      </div>
    )
  }
  const base = baseline !== null && baseline !== index ? reports[baseline] : undefined
  const first = r.state.series[0]
  return (
    <div className="table-view">
      <div className="table-scroll report">
        <header className="report-head">
          <div>
            <h2>
              {r.scenarioName} <span className="muted">· test #{(index ?? 0) + 1}</span>
            </h2>
            <p className="muted small">
              Intensità {INTENSITY[r.params.intensity].label.toLowerCase()} · il nemico muove il giorno {r.params.startDay} · {r.params.days} giorni · seme «{r.params.seed}». Mette alla prova {r.tests}.
            </p>
          </div>
          <div className="report-actions">
            <button className="btn btn-sm" onClick={() => live.runTest()} title="Rilancia lo stesso scenario sulla mappa attuale">
              <Icon name="restart" size={13} /> Rilancia
            </button>
            <button className={`btn btn-sm${baseline === index ? ' btn-primary' : ''}`} onClick={() => live.setBaseline(baseline === index ? null : index)}>
              <Icon name="compare" size={13} /> {baseline === index ? 'È il riferimento' : 'Usa come riferimento'}
            </button>
          </div>
        </header>

        <div className={`verdict tone-${r.verdictTone}`}>
          <Icon name={r.verdictTone === 'good' ? 'check' : r.verdictTone === 'warn' ? 'warning' : 'error'} size={20} />
          <div>
            <strong>{r.verdict}</strong>
            <span>{r.verdictDetail}</span>
            {r.firstBreak && (
              <span className="verdict-first">
                Primo cedimento — giorno {turnLabel(r.firstBreak.turn).day}, {PHASES[turnLabel(r.firstBreak.turn).phase].toLowerCase()}: {r.firstBreak.text}
              </span>
            )}
          </div>
        </div>

        <div className="kpis wide">
          <Tile label="Tenuta senza cedimenti" value={`${fmt(r.holdDays, 1)} gg`} sub={`su ${r.days}`} />
          <Tile label="Uomini a fine test" value={fmt(r.menEnd)} sub={`da ${fmt(r.menStart)}`} />
          <Tile label="Morti" value={fmt(r.dead)} sub={`${fmt(r.woundedNow)} feriti in carico`} />
          <Tile label="Aree perdute" value={fmt(r.lostAreas.length)} sub={r.lostAreas.map((a) => a.name).join(', ') || 'nessuna'} />
          <Tile label="Consegnato" value={`${fmt(r.deliveredT, 1)} t`} sub={`perso ${fmt(r.lostT, 1)} t · catturato ${fmt(r.capturedT, 1)} t`} />
          <Tile label="Perdite nemiche" value={fmt(r.enemyDead)} />
        </div>

        {base && <Compare a={base} b={r} ai={baseline!} bi={index!} />}

        <div className="chart-grid">
          <LineChart
            title="Uomini"
            unit="uomini"
            series={[
              { name: 'Abili', color: '#1f4e79', values: r.state.series.map((s) => s.men) },
              { name: 'Feriti', color: '#c0561b', values: r.state.series.map((s) => s.wounded) },
            ]}
          />
          <LineChart title="Morale medio" unit="" max={100} series={[{ name: 'Morale', color: '#1f4e79', values: r.state.series.map((s) => s.morale) }]} />
          <LineChart
            title="Scorte dell’esercito"
            unit="t"
            series={(['viveri', 'acqua', 'foraggio'] as const).map((k) => ({ name: RESOURCE_INFO[k].label, color: RESOURCE_INFO[k].color, values: r.state.series.map((s) => s.stock[k] / 1000) }))}
          />
          <LineChart
            title="Carri disponibili"
            unit="carri"
            series={[
              { name: 'Liberi', color: '#1f4e79', values: r.state.series.map((s) => s.cartsFree) },
              { name: 'Totali', color: '#8a94a3', values: r.state.series.map((s) => s.cartsTotal) },
            ]}
          />
        </div>

        <ControlHeatmap report={r} />

        <div className="report-cols">
          <section>
            <h3 className="table-subtitle">Cedimenti ({r.breaks.length})</h3>
            {r.breaks.length ? <LogList entries={r.breaks.slice(0, 30)} /> : <p className="muted">Nessuno.</p>}
          </section>
          <section>
            <h3 className="table-subtitle">Reparti</h3>
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Reparto</th>
                  <th className="num">Uomini</th>
                  <th className="num">Morti</th>
                  <th className="num">Feriti</th>
                  <th className="num">Morale min.</th>
                  <th className="num">Turni a corto</th>
                  <th>Stato finale</th>
                </tr>
              </thead>
              <tbody>
                {r.units.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td className="num mono">
                      {fmt(u.men)} <span className="muted">/ {fmt(u.menStart)}</span>
                    </td>
                    <td className="num mono">{fmt(u.killed)}</td>
                    <td className="num mono">{fmt(u.wounded)}</td>
                    <td className={`num mono ${u.minMorale < 20 ? 'cell-bad' : u.minMorale < 40 ? 'cell-warn' : ''}`}>{fmt(u.minMorale)}</td>
                    <td className={`num mono ${u.hungryTurns > 4 ? 'cell-bad' : u.hungryTurns ? 'cell-warn' : ''}`}>{fmt(u.hungryTurns)}</td>
                    <td>{STATUS_LABEL[u.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <details className="report-log">
          <summary>Cronaca completa ({r.state.log.length} eventi)</summary>
          <LogList entries={r.state.log} />
        </details>

        {reports.length > 1 && (
          <section>
            <h3 className="table-subtitle">Tutti i test</h3>
            <ReportList />
          </section>
        )}
        <p className="small muted">Primo turno: {first ? `${fmt(first.men)} uomini` : '—'}. I test usano la mappa com’era al momento dell’esecuzione.</p>
      </div>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  )
}

function Compare({ a, b, ai, bi }: { a: Report; b: Report; ai: number; bi: number }) {
  return (
    <section className="compare">
      <h3 className="table-subtitle">
        Confronto con il test #{ai + 1} ({a.scenarioName})
      </h3>
      <table className="data-table compact">
        <thead>
          <tr>
            <th>Indicatore</th>
            <th className="num">Riferimento #{ai + 1}</th>
            <th className="num">Questo test #{bi + 1}</th>
            <th className="num">Differenza</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Esito</td>
            <td className="num">{a.verdict}</td>
            <td className="num">{b.verdict}</td>
            <td />
          </tr>
          {COMPARE_ROWS.map((row) => {
            const va = row.get(a)
            const vb = row.get(b)
            const d = vb - va
            const better = Math.abs(d) < 1e-6 ? 0 : (d > 0) === (row.better === 'up') ? 1 : -1
            return (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="num mono">
                  {fmt(va, row.digits ?? 0)} {row.unit}
                </td>
                <td className="num mono">
                  {fmt(vb, row.digits ?? 0)} {row.unit}
                </td>
                <td className={`num mono ${better > 0 ? 'cell-good' : better < 0 ? 'cell-bad' : 'muted'}`}>
                  {better !== 0 && <Icon name={better > 0 ? 'check' : 'warning'} size={12} />} {d > 0 ? '+' : ''}
                  {fmt(d, row.digits ?? 0)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Charts (SVG, crosshair + tooltip)

interface Series {
  name: string
  color: string
  values: number[]
}

const W = 460
const H = 190
const M = { l: 44, r: 64, t: 12, b: 26 }

function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

function LineChart({ title, series, unit, max }: { title: string; series: Series[]; unit: string; max?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const n = Math.max(...series.map((s) => s.values.length))
  const top = max ?? niceMax(Math.max(1, ...series.flatMap((s) => s.values)))
  const x = (i: number) => M.l + (i / Math.max(1, n - 1)) * (W - M.l - M.r)
  const y = (v: number) => M.t + (1 - v / top) * (H - M.t - M.b)
  const ticks = [0, top / 2, top]
  const days = Math.floor((n - 1) / TURNS_PER_DAY)
  const onMove = (e: PointerEvent) => {
    const box = ref.current!.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const i = Math.round(((px - M.l) / (W - M.l - M.r)) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }
  return (
    <figure className="chart">
      <figcaption>
        <strong>{title}</strong>
        {series.length > 1 && (
          <span className="legend">
            {series.map((s) => (
              <span key={s.name} className="legend-item">
                <span className="legend-line" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div className="chart-box">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart-svg" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={M.l - 6} y={y(t) + 3.5} className="axis" textAnchor="end">
                {fmt(t, t < 10 && t % 1 ? 1 : 0)}
              </text>
            </g>
          ))}
          {Array.from({ length: days + 1 }, (_, d) => (
            <text key={d} x={x(d * TURNS_PER_DAY)} y={H - 8} className="axis" textAnchor="middle">
              {d === 0 ? 'inizio' : `g${d}`}
            </text>
          ))}
          {series.map((s) => (
            <path key={s.name} d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
          ))}
          {series.length <= 4 &&
            series.map((s) => {
              const v = s.values[s.values.length - 1]
              return (
                <text key={s.name} x={x(s.values.length - 1) + 6} y={y(v) + 3.5} className="direct-label">
                  {series.length > 1 ? s.name : fmt(v, v < 10 ? 1 : 0)}
                </text>
              )
            })}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} className="crosshair" />
              {series.map((s) => (
                <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <div className="chart-tip-head">
              Giorno {turnLabel(hover).day} · {PHASES[turnLabel(hover).phase]}
            </div>
            {series.map((s) => (
              <div key={s.name} className="chart-tip-row">
                <span className="legend-line" style={{ background: s.color }} />
                <strong>
                  {fmt(s.values[hover] ?? 0, (s.values[hover] ?? 0) < 10 ? 1 : 0)} {unit}
                </strong>
                <span className="muted">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}

/** Control of every area over time: diverging blue (ours) ↔ gray ↔ red (enemy). */
function ControlHeatmap({ report }: { report: Report }) {
  const world = useLive((s) => s.world)
  const [tip, setTip] = useState<{ area: string; turn: number; v: number } | null>(null)
  const areas = Object.keys(report.state.areas)
  if (!areas.length) return null
  const turns = report.state.series.length
  const color = (v: number) => {
    const k = Math.min(1, Math.abs(v) / 100)
    // Neutral gray midpoint, two poles.
    const [r, g, b] = v >= 0 ? [31, 78, 121] : [179, 38, 30]
    const mix = (c: number, n: number) => Math.round(n + (c - n) * k)
    return `rgb(${mix(r, 214)}, ${mix(g, 218)}, ${mix(b, 224)})`
  }
  return (
    <section className="heatmap">
      <h3 className="table-subtitle">Controllo delle aree nel tempo</h3>
      <div className="heat-legend small muted">
        <span className="heat-swatch" style={{ background: color(100) }} /> nostro
        <span className="heat-swatch" style={{ background: color(0) }} /> conteso
        <span className="heat-swatch" style={{ background: color(-100) }} /> nemico
      </div>
      <div className="heat-grid" style={{ gridTemplateColumns: `160px repeat(${turns}, minmax(4px, 1fr))` }} onPointerLeave={() => setTip(null)}>
        {areas.map((a) => [
          <div key={`${a}-l`} className="heat-label" title={world?.name(a)}>
            {world?.areaById.has(a) ? world.name(a) : a}
          </div>,
          ...report.state.series.map((s, i) => {
            const v = s.control[a] ?? 0
            return <div key={`${a}-${i}`} className={`heat-cell${tip && tip.area === a && tip.turn === i ? ' hot' : ''}`} style={{ background: color(v) }} onPointerEnter={() => setTip({ area: a, turn: i, v })} />
          }),
        ])}
      </div>
      <div className="heat-tip small">
        {tip ? (
          <>
            <strong>{world?.name(tip.area)}</strong> · giorno {turnLabel(tip.turn).day}, {PHASES[turnLabel(tip.turn).phase].toLowerCase()} · controllo <strong>{fmt(tip.v)}</strong>
          </>
        ) : (
          <span className="muted">Passa sopra una cella per il valore.</span>
        )}
      </div>
    </section>
  )
}
