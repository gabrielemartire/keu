import { useMemo, useState, type ReactNode } from 'react'
import { BUILDING_INFO, POSTURE_INFO, RESOURCE_INFO, ROUTE_INFO, TURNS_PER_DAY, UNIT_INFO } from '../model/catalog'
import { RESOURCES, type AreaNode, type BuildingNode } from '../model/types'
import { cartHours } from '../engine/flow'
import { fmt, fmtDays, fmtHours, fmtQty, stockKg } from '../engine/rates'
import { useLive } from '../live/liveStore'
import { useStore } from '../store/store'
import { BuildingIcon, Icon, ResourceIcon, UnitSymbol } from './Icon'
import { STATUS_LABEL, UnitCard } from './Inspector'
import { LogList } from './SidePanels'

function goTo(ids: string[]) {
  const st = useStore.getState()
  st.select(ids, true)
  st.setView('mappa')
}

function TableShell({ title, subtitle, filter, setFilter, children, extra }: { title: string; subtitle?: ReactNode; filter?: string; setFilter?: (v: string) => void; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="table-view">
      <div className="table-head">
        <h2>{title}</h2>
        {subtitle && <span className="muted small">{subtitle}</span>}
        {extra}
        {setFilter && <input className="input table-filter" placeholder="Filtra…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      </div>
      <div className="table-scroll">{children}</div>
    </div>
  )
}

const liveSubtitle = (turn: number | undefined) => (turn ? `situazione al turno ${turn}` : 'situazione iniziale (turno 0)')

// ---------------------------------------------------------------------------

export function InventoryView() {
  const nodes = useStore((s) => s.nodes)
  const view = useLive((s) => s.view)
  const turn = useLive((s) => s.sim?.turn)
  const [filter, setFilter] = useState('')
  const areaName = (id?: string) => (id ? (nodes.find((n) => n.id === id) as AreaNode | undefined)?.data.name ?? '' : '')
  const rows = nodes.filter((n): n is BuildingNode => n.type === 'building').filter((b) => `${b.data.name} ${areaName(b.parentId)}`.toLowerCase().includes(filter.toLowerCase()))
  const totals = RESOURCES.map((r) => rows.reduce((s, b) => s + (view?.buildings[b.id]?.seized ? 0 : (view?.buildings[b.id]?.stock[r] ?? 0)), 0))
  return (
    <TableShell title="Inventario" subtitle={liveSubtitle(turn)} filter={filter} setFilter={setFilter}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Edificio</th>
            <th>Area</th>
            {RESOURCES.map((r) => (
              <th key={r} className="num">
                <ResourceIcon id={r} size={12} color={RESOURCE_INFO[r].color} /> {RESOURCE_INFO[r].label}
              </th>
            ))}
            <th>Magazzino</th>
            <th className="num">Autonomia</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const v = view?.buildings[b.id]
            const kg = stockKg(v?.stock ?? b.data.stock)
            const use = b.data.capacityT > 0 ? kg / (b.data.capacityT * 1000) : 0
            return (
              <tr key={b.id} className={`clickable${v?.seized ? ' row-lost' : ''}`} onClick={() => goTo([b.id])}>
                <td>
                  <span className="cell-icon" style={{ background: BUILDING_INFO[b.data.kind].color }}>
                    <BuildingIcon kind={b.data.kind} size={13} color="#fff" />
                  </span>
                  {b.data.name}
                  {v?.seized && <span className="status status-error"> perso</span>}
                </td>
                <td className="muted">{areaName(b.parentId)}</td>
                {RESOURCES.map((r) => {
                  const f = v?.fill[r] ?? Infinity
                  return (
                    <td key={r} className={`num mono ${Number.isFinite(f) ? (f < 0.35 ? 'cell-bad' : f < 0.75 ? 'cell-warn' : '') : ''}`}>
                      {v && v.stock[r] >= 0.5 ? fmtQty(v.stock[r], RESOURCE_INFO[r].unit) : <span className="muted">—</span>}
                    </td>
                  )
                })}
                <td>
                  <span className="usage">
                    <span className="usage-bar">
                      <span className={`usage-fill ${use > 1 ? 'over' : use > 0.9 ? 'high' : ''}`} style={{ width: `${Math.min(100, use * 100)}%` }} />
                    </span>
                    <span className="small mono">{fmt(use * 100)}%</span>
                  </span>
                </td>
                <td className="num">{v && Number.isFinite(v.autonomyDays) ? fmtDays(v.autonomyDays) : <span className="muted">—</span>}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>
              <strong>Totale (edifici in nostro possesso)</strong>
            </td>
            {totals.map((t, i) => (
              <td key={RESOURCES[i]} className="num mono">
                <strong>{fmtQty(t, RESOURCE_INFO[RESOURCES[i]].unit)}</strong>
              </td>
            ))}
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </TableShell>
  )
}

// ---------------------------------------------------------------------------

export function UnitsView() {
  const units = useStore((s) => s.units)
  const current = useLive((s) => s.current)
  const running = useLive((s) => !!s.sim)
  const world = useLive((s) => s.world)
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const rows = units.filter((u) => u.name.toLowerCase().includes(filter.toLowerCase()))
  const extra = Object.values(current?.units ?? {}).filter((u) => !u.fromProject)
  const men = units.reduce((x, u) => x + u.men, 0)
  return (
    <TableShell title="Reparti" subtitle={`${units.length} reparti · ${fmt(men)} uomini · ${liveSubtitle(current?.turn)}`} filter={filter} setFilter={setFilter}>
      <table className="data-table">
        <thead>
          <tr>
            <th />
            <th>Reparto</th>
            <th>Tipo</th>
            <th>Posizione</th>
            <th>Postura</th>
            <th className="num">Uomini</th>
            <th className="num">Cavalli</th>
            <th className="num">Morale</th>
            {running && <th>Stato</th>}
            {running && <th>Rifornimento</th>}
            {running && <th className="num">Morti / feriti</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => {
            const st = current?.units[u.id]
            const where = st?.leg && st.dest ? `→ ${world?.name(st.dest)}` : (st?.nodeId ?? u.nodeId) && world ? world.name((st?.nodeId ?? u.nodeId)!) : '—'
            return [
              <tr key={u.id} className="clickable" onClick={() => setOpen(open === u.id ? null : u.id)}>
                <td>
                  <Icon name="next" size={10} className={`chev${open === u.id ? ' open' : ''}`} />
                </td>
                <td>
                  <UnitSymbol type={u.type} size={16} /> {u.name}
                </td>
                <td>{UNIT_INFO[u.type].label}</td>
                <td>{where}</td>
                <td>{POSTURE_INFO[u.posture].label}</td>
                <td className="num mono">{fmt(st?.men ?? u.men)}</td>
                <td className="num mono">{fmt(st?.horses ?? u.horses)}</td>
                <td className="num">
                  <span className={`morale m-${(st?.morale ?? u.morale) >= 60 ? 'ok' : (st?.morale ?? u.morale) >= 35 ? 'mid' : 'low'}`}>{fmt(st?.morale ?? u.morale)}</span>
                </td>
                {running && <td>{st ? STATUS_LABEL[st.status] : '—'}</td>}
                {running && (
                  <td className="small">
                    {st ? `viveri ${fmt(st.fed * 100)}% · acqua ${fmt(st.water * 100)}%${UNIT_INFO[u.type].missile ? ` · frecce ${fmt(st.ammo * 100)}%` : ''}` : '—'}
                  </td>
                )}
                {running && <td className="num mono">{st ? `${fmt(st.killed)} / ${fmt(st.woundedTotal)}` : '—'}</td>}
              </tr>,
              open === u.id && (
                <tr key={`${u.id}-d`} className="detail-row">
                  <td colSpan={running ? 11 : 8}>
                    <UnitCard unit={u} showPlace />
                  </td>
                </tr>
              ),
            ]
          })}
          {extra.map((u) => (
            <tr key={u.id}>
              <td />
              <td>
                <UnitSymbol type={u.type} size={16} /> {u.name} <span className="pill">evento</span>
              </td>
              <td>{UNIT_INFO[u.type].label}</td>
              <td>{u.nodeId && world ? world.name(u.nodeId) : '—'}</td>
              <td>—</td>
              <td className="num mono">{fmt(u.men)}</td>
              <td className="num mono">{fmt(u.horses)}</td>
              <td className="num">{fmt(u.morale)}</td>
              {running && <td>{STATUS_LABEL[u.status]}</td>}
              {running && <td />}
              {running && <td className="num mono">{`${fmt(u.killed)} / ${fmt(u.woundedTotal)}`}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted table-note">I valori modificabili sono quelli di partenza. Durante la simulazione, cambiare la posizione di un reparto equivale a dargli un ordine di marcia.</p>
    </TableShell>
  )
}

// ---------------------------------------------------------------------------

export function RoutesView() {
  const edges = useStore((s) => s.edges)
  const world = useLive((s) => s.world)
  const view = useLive((s) => s.view)
  const flow = useLive((s) => s.checks?.flow)
  const critical = useLive((s) => s.checks?.critical.routes)
  const running = useLive((s) => !!s.sim)
  if (!world) return null
  const hours = cartHours(world)
  return (
    <TableShell title="Percorsi" subtitle={`${edges.length} percorsi · tempi per un carro con tempo sereno, di giorno`}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Percorso</th>
            <th>Tipo</th>
            <th className="num">km</th>
            <th className="num">Tempo</th>
            <th className="num">Capacità</th>
            <th>Carico teorico</th>
            {running && <th className="num">Carri ora</th>}
            <th className="num">Esposizione</th>
            <th>Stato</th>
          </tr>
        </thead>
        <tbody>
          {world.routes.map((r) => {
            const d = r.data!
            const cap = world.capacity(r)
            const carts = flow?.routeCarts.get(r.id) ?? 0
            const load = carts / cap
            const v = view?.routes[r.id]
            return (
              <tr key={r.id} className="clickable" onClick={() => goTo([r.id])}>
                <td>
                  <span className="color-bar" style={{ background: ROUTE_INFO[d.kind].color }} />
                  {world.name(r.id)}
                </td>
                <td>{ROUTE_INFO[d.kind].label}</td>
                <td className="num mono">{fmt(world.routeKm.get(r.id)!, 1)}</td>
                <td className="num mono">{fmtHours(hours(r))}</td>
                <td className="num mono">{fmt(cap)}</td>
                <td>
                  <span className="usage">
                    <span className="usage-bar">
                      <span className={`usage-fill ${load > 1 ? 'over' : load > 0.8 ? 'high' : load > 0.5 ? 'mid' : ''}`} style={{ width: `${Math.min(100, load * 100)}%` }} />
                    </span>
                    <span className="small mono">{fmt(carts, 1)}</span>
                  </span>
                </td>
                {running && <td className="num mono">{fmt(v?.carts ?? 0)}</td>}
                <td className="num">
                  {fmt(ROUTE_INFO[d.kind].exposure * 100)}%{d.escort && <span className="pill"> scorta</span>}
                </td>
                <td>
                  {v?.destroyed ? (
                    <span className="status status-error">distrutto</span>
                  ) : v && !v.open ? (
                    <span className="status status-warning">interrotto</span>
                  ) : v?.raided ? (
                    <span className="status status-warning">razzie</span>
                  ) : critical?.has(r.id) ? (
                    <span className="status status-warning">punto critico</span>
                  ) : (
                    <span className="status status-ok">aperto</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableShell>
  )
}

// ---------------------------------------------------------------------------

export function BalanceView() {
  const flow = useLive((s) => s.checks?.flow)
  const world = useLive((s) => s.world)
  const [res, setRes] = useState<(typeof RESOURCES)[number] | 'all'>('all')
  const flows = useMemo(() => (flow ? flow.flows.filter((f) => res === 'all' || f.resource === res).sort((a, b) => b.kgPerTurn - a.kgPerTurn) : []), [flow, res])
  if (!flow || !world) return null
  const t = flow.totals
  return (
    <TableShell
      title="Bilancio dei flussi"
      subtitle="a regime, con lo schieramento iniziale: chi consuma, chi produce, chi rifornisce chi"
    >
      <div className="balance-cards">
        <div className="bal-card">
          <span className="kpi-label">Carri necessari</span>
          <span className={`kpi-value${flow.cartsNeeded > flow.cartsAvailable ? ' bad' : ''}`}>
            {fmt(Math.ceil(flow.cartsNeeded))} <span className="muted">/ {fmt(flow.cartsAvailable)}</span>
          </span>
          <span className="small muted">in circolazione per coprire i flussi</span>
        </div>
        <div className="bal-card">
          <span className="kpi-label">Flussi di rifornimento</span>
          <span className="kpi-value">{flow.flows.length}</span>
          <span className="small muted">{flow.unmet.length ? `${flow.unmet.length} fabbisogni scoperti` : 'nessun fabbisogno scoperto'}</span>
        </div>
      </div>
      <h3 className="table-subtitle">Risorse dell’esercito</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Risorsa</th>
            <th className="num">Scorte</th>
            <th className="num">Produzione / giorno</th>
            <th className="num">Consumo / giorno</th>
            <th className="num">Saldo / giorno</th>
            <th className="num">Autonomia</th>
          </tr>
        </thead>
        <tbody>
          {RESOURCES.map((r) => {
            const u = RESOURCE_INFO[r].unit
            const net = (t.production[r] - t.consumption[r]) * TURNS_PER_DAY
            return (
              <tr key={r}>
                <td>
                  <ResourceIcon id={r} size={13} color={RESOURCE_INFO[r].color} /> {RESOURCE_INFO[r].label}
                </td>
                <td className="num mono">{fmtQty(t.stock[r], u)}</td>
                <td className="num mono">{fmtQty(t.production[r] * TURNS_PER_DAY, u)}</td>
                <td className="num mono">{fmtQty(t.consumption[r] * TURNS_PER_DAY, u)}</td>
                <td className={`num mono ${net < 0 ? 'cell-bad' : ''}`}>
                  {net >= 0 ? '+' : ''}
                  {fmtQty(net, u)}
                </td>
                <td className={`num ${t.autonomyDays[r] < 2 ? 'cell-bad' : t.autonomyDays[r] < 4 ? 'cell-warn' : ''}`}>{fmtDays(t.autonomyDays[r])}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="row table-subtitle-row">
        <h3 className="table-subtitle">Flussi teorici</h3>
        <div className="checks-cats inline">
          <button className={res === 'all' ? 'on' : ''} onClick={() => setRes('all')}>
            Tutti
          </button>
          {RESOURCES.map((r) => (
            <button key={r} className={res === r ? 'on' : ''} onClick={() => setRes(r)}>
              {RESOURCE_INFO[r].label}
            </button>
          ))}
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Da</th>
            <th>A</th>
            <th>Risorsa</th>
            <th className="num">Al giorno</th>
            <th className="num">Carri / giorno</th>
            <th className="num">Viaggio</th>
            <th>Via</th>
          </tr>
        </thead>
        <tbody>
          {flows.map((f, i) => (
            <tr key={i} className="clickable" onClick={() => goTo([f.from, f.to])}>
              <td>{world.name(f.from)}</td>
              <td>{world.name(f.to)}</td>
              <td>
                <ResourceIcon id={f.resource} size={12} color={RESOURCE_INFO[f.resource].color} /> {RESOURCE_INFO[f.resource].label}
              </td>
              <td className="num mono">{fmtQty(f.perTurn * TURNS_PER_DAY, RESOURCE_INFO[f.resource].unit)}</td>
              <td className="num mono">{fmt((f.kgPerTurn * TURNS_PER_DAY) / world.meta.logistics.cartCapacityKg, 1)}</td>
              <td className="num mono">{fmtHours(f.hours)}</td>
              <td className="small muted">{f.path.nodes.slice(1, -1).map((n) => world.name(n)).join(' → ') || 'diretto'}</td>
            </tr>
          ))}
          {flow.unmet
            .filter((u) => res === 'all' || u.resource === res)
            .map((u, i) => (
              <tr key={`u${i}`} className="clickable" onClick={() => goTo([u.nodeId])}>
                <td className="cell-bad">nessun fornitore</td>
                <td>{world.name(u.nodeId)}</td>
                <td>{RESOURCE_INFO[u.resource].label}</td>
                <td className="num mono cell-bad">{fmtQty(u.perTurn * TURNS_PER_DAY, RESOURCE_INFO[u.resource].unit)}</td>
                <td colSpan={3} />
              </tr>
            ))}
        </tbody>
      </table>
    </TableShell>
  )
}

// ---------------------------------------------------------------------------

export function LogView() {
  const sim = useLive((s) => s.sim)
  const [tone, setTone] = useState<'all' | 'bad' | 'breaking'>('all')
  const entries = useMemo(() => (sim ? [...sim.log].reverse().filter((l) => tone === 'all' || (tone === 'bad' ? l.tone === 'bad' || l.tone === 'warn' : l.breaking)) : []), [sim, tone])
  return (
    <TableShell
      title="Registro"
      subtitle={sim ? `${sim.log.length} eventi in ${sim.turn} turni` : 'avvia la simulazione per popolare il registro'}
      extra={
        <div className="checks-cats inline">
          <button className={tone === 'all' ? 'on' : ''} onClick={() => setTone('all')}>
            Tutto
          </button>
          <button className={tone === 'bad' ? 'on' : ''} onClick={() => setTone('bad')}>
            Problemi
          </button>
          <button className={tone === 'breaking' ? 'on' : ''} onClick={() => setTone('breaking')}>
            Cedimenti
          </button>
        </div>
      }
    >
      <LogList entries={entries} />
    </TableShell>
  )
}
