import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  AREA_COLORS,
  AREA_STATUS_LABEL,
  BEHAVIOR_INFO,
  BUILDING_INFO,
  POSTURE_INFO,
  PRIORITY_LABEL,
  RESOURCE_INFO,
  ROUTE_INFO,
  TERRAIN_INFO,
  TURNS_PER_DAY,
  UNIT_INFO,
} from '../model/catalog'
import {
  BUILDING_KINDS,
  RESOURCES,
  ROUTE_KINDS,
  TERRAINS,
  UNIT_TYPES,
  type AreaNode,
  type BuildingNode,
  type EnemyForce,
  type Fortification,
  type Posture,
  type Priority,
  type RouteEdge,
  type UnitDef,
  type UnitType,
} from '../model/types'
import { cartHours } from '../engine/flow'
import { fmt, fmtDays, fmtHours, fmtQty, stockKg } from '../engine/rates'
import { live, useLive } from '../live/liveStore'
import { useStore } from '../store/store'
import { Checkbox, Field, NumberInput, Section, Select, TextArea, TextInput } from './controls'
import { BuildingIcon, Icon, ResourceIcon, UnitSymbol } from './Icon'
import { SEVERITY_ORDER } from '../engine/checks'

export function Inspector() {
  // Joined ids: a string compares by value, arrays would re-render forever.
  const nodeKey = useStore((s) => s.nodes.filter((n) => n.selected).map((n) => n.id).join('|'))
  const edgeKey = useStore((s) => s.edges.filter((e) => e.selected).map((e) => e.id).join('|'))
  const sel = { nodes: nodeKey ? nodeKey.split('|') : [], edges: edgeKey ? edgeKey.split('|') : [] }
  const count = sel.nodes.length + sel.edges.length
  if (count === 0) return <ProjectInspector />
  if (count > 1) return <MultiInspector count={count} />
  if (sel.edges.length) return <RouteInspector id={sel.edges[0]} />
  return <NodeInspector id={sel.nodes[0]} />
}

function NodeInspector({ id }: { id: string }) {
  const node = useStore((s) => s.nodes.find((n) => n.id === id))
  if (!node) return null
  return node.type === 'area' ? <AreaInspector node={node} /> : <BuildingInspector node={node} />
}

function InlineIssues({ id }: { id: string }) {
  const issues = useLive(useShallow((s) => (s.checks?.issues ?? []).filter((i) => i.targets.some((t) => t.id === id))))
  if (!issues.length) return null
  return (
    <div className="inline-issues">
      {[...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]).map((i) => (
        <div key={i.id} className={`inline-issue sev-${i.severity}`}>
          <Icon name={i.severity === 'error' ? 'error' : i.severity === 'warning' ? 'warning' : 'info'} size={14} />
          <span>{i.message}</span>
        </div>
      ))}
    </div>
  )
}

function DeleteButton({ id, label }: { id: string; label: string }) {
  return (
    <div className="inspector-foot">
      <button className="btn btn-danger" onClick={() => useStore.getState().deleteElement(id)}>
        <Icon name="trash" size={14} /> {label}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function BuildingInspector({ node }: { node: BuildingNode }) {
  const update = useStore((s) => s.updateBuilding)
  const units = useStore(useShallow((s) => s.units.filter((u) => u.nodeId === node.id)))
  const areaName = useStore((s) => (node.parentId ? (s.nodes.find((n) => n.id === node.parentId) as AreaNode | undefined)?.data.name : undefined))
  const running = useLive((s) => !!s.sim)
  const v = useLive((s) => s.view?.buildings[node.id])
  const balance = useLive((s) => s.checks?.flow.balance.get(node.id))
  const d = node.data
  const info = BUILDING_INFO[d.kind]
  const kg = stockKg(v?.stock ?? d.stock)
  return (
    <div className="inspector">
      <header className="panel-header">
        <span className="kind-chip" style={{ background: info.color }}>
          <BuildingIcon kind={d.kind} size={20} color="#fff" />
        </span>
        <div className="panel-header-text">
          <div className="panel-title">{d.name || info.label}</div>
          <div className="panel-subtitle">
            {info.label}
            {areaName ? ` · ${areaName}` : ' · fuori dalle aree'}
          </div>
        </div>
      </header>
      <InlineIssues id={node.id} />

      <Section title={running ? 'Situazione attuale' : 'Situazione al turno 0'}>
        {v && (
          <>
            {(v.seized || v.burned || v.poisoned || v.epidemic) && (
              <div className="chips">
                {v.seized && <span className="status status-error">In mano nemica</span>}
                {v.burned && <span className="status status-error">Incendiato</span>}
                {v.poisoned && <span className="status status-error">Acqua avvelenata</span>}
                {v.epidemic && <span className="status status-warning">Epidemia</span>}
              </div>
            )}
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Risorsa</th>
                  <th className="num">Scorta</th>
                  <th>Copertura</th>
                </tr>
              </thead>
              <tbody>
                {RESOURCES.filter((r) => v.stock[r] > 0.5 || Number.isFinite(v.fill[r]) || d.production[r] > 0).map((r) => (
                  <tr key={r}>
                    <td>
                      <ResourceIcon id={r} size={12} color={RESOURCE_INFO[r].color} /> {RESOURCE_INFO[r].label}
                    </td>
                    <td className="num mono">{fmtQty(v.stock[r], RESOURCE_INFO[r].unit)}</td>
                    <td>
                      {Number.isFinite(v.fill[r]) ? (
                        <span className="usage">
                          <span className="usage-bar">
                            <span className={`usage-fill ${v.fill[r] < 0.35 ? 'over' : v.fill[r] < 0.75 ? 'high' : ''}`} style={{ width: `${Math.min(100, v.fill[r] * 100)}%` }} />
                          </span>
                          <span className="small mono">{fmt(v.fill[r] * 100)}%</span>
                        </span>
                      ) : (
                        <span className="muted small">{d.production[r] > 0 ? `+${fmtQty(d.production[r], RESOURCE_INFO[r].unit)}/turno` : '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="facts">
              <dt>Magazzino</dt>
              <dd>
                {fmt(kg / 1000, 1)} t su {fmt(d.capacityT)} t
              </dd>
              {Number.isFinite(v.autonomyDays) && (
                <>
                  <dt>Autonomia</dt>
                  <dd>
                    {fmtDays(v.autonomyDays)} {v.short && <span className="muted">({RESOURCE_INFO[v.short].label.toLowerCase()})</span>}
                  </dd>
                </>
              )}
              {(v.wounded > 0 || info.hospital) && (
                <>
                  <dt>Feriti</dt>
                  <dd>{info.hospital ? `${fmt(v.patients)} ricoverati su ${fmt(d.beds)} letti` : `${fmt(v.wounded)} in attesa di trasporto`}</dd>
                </>
              )}
              {v.fortBonus > 0 && (
                <>
                  <dt>Difese</dt>
                  <dd>+{v.fortBonus} livelli costruiti dai genieri</dd>
                </>
              )}
            </dl>
          </>
        )}
        {!running && balance && (
          <p className="small muted">
            Consumo al giorno:{' '}
            {RESOURCES.filter((r) => balance.consumption[r] > 0.5)
              .map((r) => `${RESOURCE_INFO[r].label.toLowerCase()} ${fmtQty(balance.consumption[r] * TURNS_PER_DAY, RESOURCE_INFO[r].unit)}`)
              .join(', ') || 'nessuno'}
            .
          </p>
        )}
        <div className="action-row">
          <button className="btn btn-sm btn-danger" onClick={() => live.act({ type: 'incendio', nodeId: node.id })} title="Simula un incendio: si perde la maggior parte delle scorte">
            <Icon name="fire" size={13} /> Incendia
          </button>
          <button className="btn btn-sm" onClick={() => live.act({ type: 'rifornisci', nodeId: node.id, resource: 'viveri', amount: 5000 })}>
            <Icon name="box" size={13} /> +5 t viveri
          </button>
          <button className="btn btn-sm" onClick={() => live.act({ type: 'rinforzi', nodeId: node.id, men: 300, unitType: 'fanteria', name: 'Rinforzi' })}>
            <Icon name="users" size={13} /> Rinforzi
          </button>
        </div>
      </Section>

      <Section title={`Reparti di stanza (${units.length})`}>
        {units.map((u) => (
          <UnitCard key={u.id} unit={u} />
        ))}
        <AddUnit nodeId={node.id} />
      </Section>

      <Section title="Configurazione">
        <Field label="Nome">
          <TextInput value={d.name} onChange={(name) => update(node.id, { name })} />
        </Field>
        <Field label="Tipo" hint={info.description}>
          <Select value={d.kind} onChange={(kind) => update(node.id, { kind })} options={BUILDING_KINDS.map((k) => ({ value: k, label: BUILDING_INFO[k].label }))} />
        </Field>
        <div className="grid2">
          <Field label="Presidio (uomini)" hint="Difendono e consumano.">
            <NumberInput value={d.garrison} min={0} onChange={(v) => update(node.id, { garrison: v ?? 0 })} />
          </Field>
          <Field label="Priorità rifornimenti">
            <Select value={String(d.priority) as '1' | '2' | '3'} onChange={(v) => update(node.id, { priority: Number(v) as Priority })} options={[1, 2, 3].map((p) => ({ value: String(p) as '1' | '2' | '3', label: PRIORITY_LABEL[p as Priority] }))} />
          </Field>
          <Field label="Capacità magazzino">
            <NumberInput value={d.capacityT} min={0} decimal suffix="t" onChange={(v) => update(node.id, { capacityT: v ?? 0 })} />
          </Field>
          <Field label="Carri" hint="Entrano nel parco dell’esercito.">
            <NumberInput value={d.carts} min={0} onChange={(v) => update(node.id, { carts: v ?? 0 })} />
          </Field>
          <Field label="Fortificazioni">
            <Select
              value={String(d.fortification) as '0' | '1' | '2' | '3'}
              onChange={(v) => update(node.id, { fortification: Number(v) as Fortification })}
              options={[
                { value: '0', label: 'Nessuna' },
                { value: '1', label: 'Palizzata (+15%)' },
                { value: '2', label: 'Palizzata e fossato (+30%)' },
                { value: '3', label: 'Mura (+45%)' },
              ]}
            />
          </Field>
          {(info.hospital || d.beds > 0) && (
            <Field label="Posti letto">
              <NumberInput value={d.beds} min={0} onChange={(v) => update(node.id, { beds: v ?? 0 })} />
            </Field>
          )}
        </div>
      </Section>

      <Section title={running ? 'Scorte iniziali (turno 0)' : 'Scorte iniziali'}>
        <ResourceGrid values={d.stock} onChange={(r, v) => update(node.id, { stock: { ...d.stock, [r]: v } })} />
      </Section>
      <Section title="Produzione per turno (6 ore)">
        <ResourceGrid values={d.production} onChange={(r, v) => update(node.id, { production: { ...d.production, [r]: v } })} />
        <p className="small muted">Villaggi, taglialegna e botteghe lavorano di giorno; l’acqua scorre sempre. Un’area contesa dimezza la produzione.</p>
      </Section>
      <Section title="Note">
        <TextArea value={d.notes} onChange={(notes) => update(node.id, { notes })} />
      </Section>
      <DeleteButton id={node.id} label="Elimina edificio" />
    </div>
  )
}

function ResourceGrid({ values, onChange }: { values: Record<string, number>; onChange: (r: (typeof RESOURCES)[number], v: number) => void }) {
  return (
    <div className="resource-grid">
      {RESOURCES.map((r) => (
        <Field key={r} label={RESOURCE_INFO[r].label}>
          <NumberInput value={values[r] ?? 0} min={0} suffix={RESOURCE_INFO[r].unit} onChange={(v) => onChange(r, v ?? 0)} />
        </Field>
      ))}
    </div>
  )
}

function AddUnit({ nodeId }: { nodeId: string }) {
  return (
    <div className="add-row">
      <span className="small muted">Aggiungi:</span>
      {UNIT_TYPES.map((t) => (
        <button key={t} className="btn btn-sm add-unit" title={UNIT_INFO[t].label} onClick={() => useStore.getState().addUnit(t, nodeId)}>
          <UnitSymbol type={t} size={16} /> {UNIT_INFO[t].short}
        </button>
      ))}
    </div>
  )
}

export function UnitCard({ unit, showPlace = false }: { unit: UnitDef; showPlace?: boolean }) {
  const update = useStore((s) => s.updateUnit)
  const remove = useStore((s) => s.removeUnit)
  const nodes = useStore((s) => s.nodes)
  const buildings = useMemo(() => nodes.filter((n): n is BuildingNode => n.type === 'building').map((n) => ({ id: n.id, name: n.data.name })), [nodes])
  const st = useLive((s) => s.current?.units[unit.id])
  const running = useLive((s) => !!s.sim)
  const ordering = useLive((s) => s.ordering === unit.id)
  const world = useLive((s) => s.world)
  return (
    <div className="unit-card">
      <div className="unit-card-head">
        <UnitSymbol type={unit.type} size={22} />
        <input className="input unit-name" value={unit.name} onChange={(e) => update(unit.id, { name: e.target.value })} />
        <button className="btn btn-icon btn-danger-ghost" title="Elimina reparto" onClick={() => remove(unit.id)}>
          <Icon name="trash" size={14} />
        </button>
      </div>
      {running && st && (
        <div className={`unit-live st-${st.status}`}>
          <span className="unit-status">{STATUS_LABEL[st.status]}</span>
          <span className="mono">{fmt(st.men)} uomini</span>
          <span className="mono">morale {fmt(st.morale)}</span>
          <SupplyDot label="Viveri" v={st.fed} />
          <SupplyDot label="Acqua" v={st.water} />
          {UNIT_INFO[st.type].missile && <SupplyDot label="Frecce" v={st.ammo} />}
          {st.leg && st.dest && world && <span className="small">→ {world.name(st.dest)}</span>}
        </div>
      )}
      <div className="grid3">
        <Field label="Tipo">
          <Select value={unit.type} onChange={(type: UnitType) => update(unit.id, { type, horses: Math.round(unit.men * UNIT_INFO[type].horsesPerMan) })} options={UNIT_TYPES.map((t) => ({ value: t, label: UNIT_INFO[t].label }))} />
        </Field>
        <Field label="Uomini">
          <NumberInput value={unit.men} min={0} onChange={(v) => update(unit.id, { men: v ?? 0 })} />
        </Field>
        <Field label="Cavalli">
          <NumberInput value={unit.horses} min={0} onChange={(v) => update(unit.id, { horses: v ?? 0 })} />
        </Field>
        <Field label="Morale iniziale">
          <NumberInput value={unit.morale} min={0} max={100} onChange={(v) => update(unit.id, { morale: v ?? 0 })} />
        </Field>
        <Field label="Postura" hint={POSTURE_INFO[unit.posture].description}>
          <Select value={unit.posture} onChange={(posture: Posture) => update(unit.id, { posture })} options={(['fisso', 'mobile', 'riserva'] as Posture[]).map((p) => ({ value: p, label: POSTURE_INFO[p].label }))} />
        </Field>
        {showPlace && (
          <Field label="Posizione">
            <Select value={unit.nodeId ?? ''} onChange={(v) => update(unit.id, { nodeId: v || null })} options={[{ value: '', label: '— nessuna —' }, ...buildings.map((b) => ({ value: b.id, label: b.name }))]} />
          </Field>
        )}
      </div>
      <div className="unit-card-foot">
        <Checkbox checked={unit.autoRetreat} onChange={(autoRetreat) => update(unit.id, { autoRetreat })} label="Ritirata automatica" />
        <button
          className={`btn btn-sm${ordering ? ' btn-primary' : ''}`}
          onClick={() => useLive.setState({ ordering: ordering ? null : unit.id })}
          title="Scegli sulla mappa dove mandarlo: l’ordine parte dal comando e può arrivare in ritardo"
        >
          <Icon name="march" size={13} /> {ordering ? 'Clicca sulla mappa…' : 'Ordina spostamento'}
        </button>
      </div>
    </div>
  )
}

export const STATUS_LABEL: Record<string, string> = {
  pronto: 'Pronto',
  combatte: 'In combattimento',
  marcia: 'In marcia',
  ritirata: 'In ritirata',
  circondato: 'Circondato',
  distrutto: 'Annientato',
}

function SupplyDot({ label, v }: { label: string; v: number }) {
  return (
    <span className={`supply-dot ${v >= 0.95 ? 'ok' : v >= 0.5 ? 'mid' : 'low'}`} title={`${label}: ${fmt(v * 100)}% del fabbisogno`}>
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------

function AreaInspector({ node }: { node: AreaNode }) {
  const update = useStore((s) => s.updateArea)
  const enemies = useStore(useShallow((s) => s.enemies.filter((e) => e.targetAreaId === node.id && e.originAreaId !== node.id)))
  const camped = useStore(useShallow((s) => s.enemies.filter((e) => e.originAreaId === node.id)))
  const world = useLive((s) => s.world)
  const buildings = useStore(useShallow((s) => s.nodes.filter((n) => n.parentId === node.id).map((n) => (n as BuildingNode).data.name)))
  const v = useLive((s) => s.view?.areas[node.id])
  const running = useLive((s) => !!s.sim)
  const d = node.data
  return (
    <div className="inspector">
      <header className="panel-header">
        <span className="kind-chip" style={{ background: d.color }}>
          <Icon name="area" size={20} />
        </span>
        <div className="panel-header-text">
          <div className="panel-title">{d.name}</div>
          <div className="panel-subtitle">
            Area geografica · {TERRAIN_INFO[d.terrain].label} · {buildings.length} edifici
          </div>
        </div>
      </header>
      <InlineIssues id={node.id} />
      {v && (
        <Section title={running ? 'Situazione' : 'Situazione al turno 0'}>
          <dl className="facts">
            <dt>Stato</dt>
            <dd>
              <span className={`area-status s-${v.status}`}>{AREA_STATUS_LABEL[v.status]}</span> controllo {fmt(v.control)}
            </dd>
            {v.attacked && (
              <>
                <dt>Scontro</dt>
                <dd>nostro rapporto di forze {fmt(v.ratio * 100)}%</dd>
              </>
            )}
            {v.enemies.length > 0 && (
              <>
                <dt>Nemici</dt>
                <dd>{v.enemies.map((e) => `${e.name} (${fmt(e.men)})`).join(', ')}</dd>
              </>
            )}
          </dl>
          <div className="action-row">
            <button className="btn btn-sm btn-danger" onClick={() => live.act({ type: 'attacco', areaId: node.id, men: 1500, unitType: 'fanteria', behavior: 'tieni', name: 'Assalto nemico' })}>
              <Icon name="swords" size={13} /> Attacco
            </button>
            <button className="btn btn-sm btn-danger" onClick={() => live.act({ type: 'raid', areaId: node.id, turns: 8, strength: 0.5 })}>
              <Icon name="raid" size={13} /> Razzie
            </button>
            {v.status === 'nemico' ? (
              <button className="btn btn-sm" onClick={() => live.act({ type: 'controllo', areaId: node.id, control: 60 })}>
                <Icon name="flag" size={13} /> Riconquista
              </button>
            ) : (
              <button className="btn btn-sm btn-danger" onClick={() => live.act({ type: 'controllo', areaId: node.id, control: -100 })}>
                <Icon name="flag" size={13} /> Cede al nemico
              </button>
            )}
          </div>
        </Section>
      )}
      <Section title="Configurazione">
        <Field label="Nome">
          <TextInput value={d.name} onChange={(name) => update(node.id, { name })} />
        </Field>
        <Field label="Terreno" hint={`Difesa ×${TERRAIN_INFO[d.terrain].defense} · cavalleria ×${TERRAIN_INFO[d.terrain].cavalry}`}>
          <Select disabled={d.locked} value={d.terrain} onChange={(terrain) => update(node.id, { terrain })} options={TERRAINS.map((t) => ({ value: t, label: TERRAIN_INFO[t].label }))} />
        </Field>
        <Field label={`Controllo iniziale: ${fmt(d.control)}`} hint="+100 nostro · 0 conteso · −100 nemico">
          <input type="range" min={-100} max={100} step={10} value={d.control} onChange={(e) => update(node.id, { control: Number(e.target.value) })} className="range" />
        </Field>
        <Checkbox checked={d.front} onChange={(front) => update(node.id, { front })} label="Area di fronte (gli scenari attaccano qui)" />
        <Field label="Colore">
          <div className="colors">
            {AREA_COLORS.map((c) => (
              <button key={c} className={`swatch${d.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => update(node.id, { color: c })} aria-label={c} />
            ))}
          </div>
        </Field>
      </Section>
      <Section
        title={`Schiere nemiche accampate qui (${camped.length})`}
        actions={
          <button className="btn btn-sm" onClick={() => useStore.getState().addEnemy({ originAreaId: node.id })}>
            <Icon name="plus" size={13} /> Aggiungi
          </button>
        }
      >
        {camped.map((e) => (
          <EnemyCard key={e.id} enemy={e} />
        ))}
        {!camped.length && <p className="small muted">Nessuna. Metti qui le schiere nemiche e scegli quale area attaccano e da che turno: marceranno sulla mappa.</p>}
      </Section>
      <Section
        title={`Forze nemiche che attaccano quest’area (${enemies.length})`}
        actions={
          <button className="btn btn-sm" onClick={() => useStore.getState().addEnemy({ targetAreaId: node.id, originAreaId: world?.enemyBaseNear(node.id) ?? null })}>
            <Icon name="plus" size={13} /> Aggiungi
          </button>
        }
      >
        {enemies.map((e) => (
          <EnemyCard key={e.id} enemy={e} />
        ))}
        {!enemies.length && <p className="small muted">Nessuna. Gli scenari del pannello Test e il tasto destro “Attacco” ne aggiungono durante la simulazione.</p>}
      </Section>
      <Section title="Note">
        <TextArea value={d.notes} onChange={(notes) => update(node.id, { notes })} />
      </Section>
      {d.locked ? <p className="small muted">Area fissa dell’esercitazione: non si sposta, non si ridimensiona e non si elimina.</p> : <DeleteButton id={node.id} label="Elimina area (gli edifici restano)" />}
    </div>
  )
}

export function EnemyCard({ enemy }: { enemy: EnemyForce; showTarget?: boolean }) {
  const update = useStore((s) => s.updateEnemy)
  const remove = useStore((s) => s.removeEnemy)
  const nodes = useStore((s) => s.nodes)
  const areas = useMemo(() => nodes.filter((n): n is AreaNode => n.type === 'area').map((n) => ({ id: n.id, name: n.data.name })), [nodes])
  const st = useLive((s) => s.current?.enemies[enemy.id])
  const running = useLive((s) => !!s.sim)
  const turn = useLive((s) => s.sim?.turn ?? 0)
  return (
    <div className="unit-card enemy">
      <div className="unit-card-head">
        <UnitSymbol type={enemy.type} hostile size={22} />
        <input className="input unit-name" value={enemy.name} onChange={(e) => update(enemy.id, { name: e.target.value })} />
        <button className="btn btn-icon btn-danger-ghost" title="Elimina" onClick={() => remove(enemy.id)}>
          <Icon name="trash" size={14} />
        </button>
      </div>
      {running && st && (
        <div className="unit-live">
          <span className="mono">{fmt(st.men)} uomini</span>
          {st.routed && <span className="status status-ok">In rotta</span>}
          {st.startTurn > turn && <span className="status status-off">In attesa</span>}
          {st.march && !st.march.arrived && <span className="status status-warning">In marcia · {fmt(st.march.km - st.march.done, 1)} km</span>}
        </div>
      )}
      <div className="grid3">
        <Field label="Tipo">
          <Select value={enemy.type} onChange={(type: UnitType) => update(enemy.id, { type })} options={UNIT_TYPES.map((t) => ({ value: t, label: UNIT_INFO[t].label }))} />
        </Field>
        <Field label="Uomini">
          <NumberInput value={enemy.men} min={0} onChange={(v) => update(enemy.id, { men: v ?? 0 })} />
        </Field>
        <Field label="Parte al turno" hint={`giorno ${Math.floor(enemy.startTurn / TURNS_PER_DAY) + 1}`}>
          <NumberInput value={enemy.startTurn} min={0} onChange={(v) => update(enemy.id, { startTurn: v ?? 0 })} />
        </Field>
        <Field label="Comportamento" hint={BEHAVIOR_INFO[enemy.behavior]}>
          <Select value={enemy.behavior} onChange={(behavior) => update(enemy.id, { behavior })} options={[{ value: 'tieni', label: 'Preme' }, { value: 'avanza', label: 'Avanza' }]} />
        </Field>
        <Field label="Parte da">
          <Select value={enemy.originAreaId ?? ''} onChange={(v) => update(enemy.id, { originAreaId: v || null })} options={[{ value: '', label: '— compare sul bersaglio —' }, ...areas.map((a) => ({ value: a.id, label: a.name }))]} />
        </Field>
        <Field label="Attacca">
          <Select value={enemy.targetAreaId ?? ''} onChange={(v) => update(enemy.id, { targetAreaId: v || null })} options={[{ value: '', label: '— resta dov’è —' }, ...areas.map((a) => ({ value: a.id, label: a.name }))]} />
        </Field>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function RouteInspector({ id }: { id: string }) {
  const route = useStore((s) => s.edges.find((e) => e.id === id)) as RouteEdge | undefined
  const update = useStore((s) => s.updateRoute)
  const world = useLive((s) => s.world)
  const v = useLive((s) => s.view?.routes[id])
  const staticCarts = useLive((s) => s.checks?.flow.routeCarts.get(id) ?? 0)
  const critical = useLive((s) => !!s.checks?.critical.routes.has(id))
  if (!route?.data || !world) return null
  const d = route.data
  const info = ROUTE_INFO[d.kind]
  const r = world.routeById.get(id)
  const measured = world.mapKm(route.source, route.target)
  const hours = r ? cartHours(world)(r) : NaN
  return (
    <div className="inspector">
      <header className="panel-header">
        <span className="kind-chip" style={{ background: info.color }}>
          <Icon name="route" size={20} />
        </span>
        <div className="panel-header-text">
          <div className="panel-title">{d.name || `${world.name(route.source)} – ${world.name(route.target)}`}</div>
          <div className="panel-subtitle">
            {info.label} · {fmt(world.routeKm.get(id) ?? measured, 1)} km · {fmtHours(hours)} di carro
          </div>
        </div>
      </header>
      <InlineIssues id={id} />
      <Section title="Traffico">
        <dl className="facts">
          <dt>Flusso teorico</dt>
          <dd>
            {fmt(staticCarts, 1)} carri a turno su {fmt(d.capacity ?? info.capacity)}
          </dd>
          {v && (
            <>
              <dt>Ora</dt>
              <dd>
                {v.destroyed ? 'distrutto' : !v.open ? 'interrotto' : `${fmt(v.carts)} carri partiti in questo turno`}
                {v.raided && ' · razzie in corso'}
              </dd>
              {v.threat > 0 && (
                <>
                  <dt>Pericolo</dt>
                  <dd>{fmt(v.threat * info.exposure * (d.escort ? 0.3 : 1) * 100)}% di imboscata ogni 6 h</dd>
                </>
              )}
            </>
          )}
          {critical && (
            <>
              <dt>Criticità</dt>
              <dd>unico collegamento per una parte della rete</dd>
            </>
          )}
        </dl>
        <div className="action-row">
          {v && !v.open ? (
            <button className="btn btn-sm" onClick={() => live.act({ type: 'ripara', routeId: id })}>
              <Icon name="wrench" size={13} /> Ripara
            </button>
          ) : (
            <button className="btn btn-sm btn-danger" onClick={() => live.act({ type: 'distruggi', routeId: id })}>
              <Icon name="broken" size={13} /> {info.destroyable ? 'Distruggi' : 'Interrompi'}
            </button>
          )}
          <button className="btn btn-sm btn-danger" onClick={() => live.act({ type: 'raid', routeId: id, turns: 4, strength: 0.6 })}>
            <Icon name="raid" size={13} /> Razzia
          </button>
        </div>
      </Section>
      <Section title="Configurazione">
        <Field label="Nome">
          <TextInput value={d.name} onChange={(name) => update(id, { name })} placeholder={`${world.name(route.source)} – ${world.name(route.target)}`} />
        </Field>
        <Field label="Tipo" hint={`Velocità ×${info.speed} · con pioggia ×${info.rain} · esposizione ${fmt(info.exposure * 100)}%`}>
          <Select value={d.kind} onChange={(kind) => update(id, { kind })} options={ROUTE_KINDS.map((k) => ({ value: k, label: ROUTE_INFO[k].label }))} />
        </Field>
        <div className="grid2">
          <Field label="Lunghezza" hint={d.lengthKm === null ? 'Misurata sulla mappa' : `Sulla mappa: ${fmt(measured, 1)} km`}>
            <NumberInput value={d.lengthKm} min={0} decimal suffix="km" placeholder={fmt(measured, 1)} onChange={(v) => update(id, { lengthKm: v && v > 0 ? v : null })} />
          </Field>
          <Field label="Capacità" hint={`Predefinita: ${info.capacity}`}>
            <NumberInput value={d.capacity} min={1} suffix="carri/turno" placeholder={String(info.capacity)} onChange={(v) => update(id, { capacity: v && v > 0 ? v : null })} />
          </Field>
        </div>
        <Checkbox checked={d.escort} onChange={(escort) => update(id, { escort })} label="Scortato (imboscate −70%)" />
      </Section>
      <Section title="Note">
        <TextArea value={d.notes} onChange={(notes) => update(id, { notes })} />
      </Section>
      <DeleteButton id={id} label="Elimina percorso" />
    </div>
  )
}

// ---------------------------------------------------------------------------

function ProjectInspector() {
  const meta = useStore((s) => s.meta)
  const updateMeta = useStore((s) => s.updateMeta)
  const counts = useStore(useShallow((s) => ({ b: s.nodes.filter((n) => n.type === 'building').length, a: s.nodes.filter((n) => n.type === 'area').length, r: s.edges.length, u: s.units.length, men: s.units.reduce((x, u) => x + u.men, 0) })))
  const flow = useLive((s) => s.checks?.flow)
  const L = meta.logistics
  const setL = (patch: Partial<typeof L>) => updateMeta({ logistics: { ...L, ...patch } })
  return (
    <div className="inspector">
      <header className="panel-header">
        <span className="kind-chip" style={{ background: 'var(--brand)' }}>
          <Icon name="flag" size={20} />
        </span>
        <div className="panel-header-text">
          <div className="panel-title">{meta.name}</div>
          <div className="panel-subtitle">
            {counts.a} aree · {counts.b} edifici · {counts.r} percorsi · {counts.u} reparti ({fmt(counts.men)} uomini)
          </div>
        </div>
      </header>
      <Section title="Battaglia">
        <Field label="Descrizione">
          <TextArea value={meta.description} onChange={(description) => updateMeta({ description })} />
        </Field>
        <div className="grid2">
          <Field label="Autore">
            <TextInput value={meta.author} onChange={(author) => updateMeta({ author })} />
          </Field>
          <Field label="Revisione">
            <TextInput value={meta.revision} onChange={(revision) => updateMeta({ revision })} />
          </Field>
        </div>
      </Section>
      <Section title="Regole logistiche">
        <div className="grid2">
          <Field label="Portata di un carro" hint="Carro a buoi: 400–700 kg.">
            <NumberInput value={L.cartCapacityKg} min={50} suffix="kg" onChange={(v) => setL({ cartCapacityKg: v ?? 500 })} />
          </Field>
          <Field label="Scorta obiettivo" hint="Giorni che ogni posto cerca di tenere.">
            <NumberInput value={L.targetDays} min={0.5} decimal suffix="gg" onChange={(v) => setL({ targetDays: v ?? 2 })} />
          </Field>
          <Field label="Scala della mappa" hint="Km per 100 pixel.">
            <NumberInput value={L.kmPerPx * 100} min={0.1} decimal suffix="km" onChange={(v) => setL({ kmPerPx: (v ?? 2.5) / 100 })} />
          </Field>
          <Field label="Viaggio massimo" hint="Oltre, un convoglio non parte.">
            <NumberInput value={L.maxTripHours} min={6} suffix="h" onChange={(v) => setL({ maxTripHours: v ?? 48 })} />
          </Field>
        </div>
      </Section>
      {flow && (
        <Section title="A colpo d’occhio">
          <dl className="facts">
            <dt>Carri</dt>
            <dd>
              ne servono ~{fmt(Math.ceil(flow.cartsNeeded))} su {fmt(flow.cartsAvailable)}
            </dd>
            {RESOURCES.filter((r) => flow.totals.consumption[r] > 0.5).map((r) => (
              <FactRow key={r} label={RESOURCE_INFO[r].label} value={`autonomia ${fmtDays(flow.totals.autonomyDays[r])}`} />
            ))}
          </dl>
        </Section>
      )}
      <Section title="Come si usa">
        <ol className="tips">
          <li>Disegna le <strong>aree</strong>, mettici dentro gli <strong>edifici</strong> e collegali con i <strong>percorsi</strong>.</li>
          <li>Assegna i <strong>reparti</strong> agli edifici e le <strong>forze nemiche</strong> alle aree.</li>
          <li>Premi <strong>Avvia</strong>: i posti ordinano ciò che manca e i carri partono da soli.</li>
          <li>Cambia la situazione col <strong>tasto destro</strong> su edifici, percorsi e aree e guarda come si riorganizza il flusso.</li>
          <li>Nel pannello <strong>Test</strong> lancia uno scenario nemico, modifica la logistica e rilancialo per confrontare.</li>
        </ol>
      </Section>
    </div>
  )
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

function MultiInspector({ count }: { count: number }) {
  const deleteSelection = useStore((s) => s.deleteSelection)
  return (
    <div className="inspector">
      <header className="panel-header">
        <div className="panel-header-text">
          <div className="panel-title">{count} elementi selezionati</div>
        </div>
      </header>
      <div className="inspector-foot">
        <button className="btn btn-danger" onClick={deleteSelection}>
          <Icon name="trash" size={14} /> Elimina selezione
        </button>
      </div>
    </div>
  )
}
