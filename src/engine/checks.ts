import { BUILDING_INFO, RESOURCE_INFO, ROUTE_INFO, UNIT_INFO } from '../model/catalog'
import type { ProjectState } from '../model/schema'
import { RESOURCES } from '../model/types'
import { analyzeFlows, cartHours, initiallyLost, type FlowAnalysis } from './flow'
import { fmt, fmtDays, fmtHours, isHospital, stockKg } from './rates'
import { criticalPoints, shortestPaths, World } from './world'

export type Severity = 'error' | 'warning' | 'info'
export const CATEGORIES = ['Rifornimenti', 'Acqua', 'Carri', 'Percorsi', 'Sanità', 'Comando', 'Fronte', 'Magazzini', 'Mappa'] as const
export type Category = (typeof CATEGORIES)[number]

export interface IssueTarget {
  kind: 'node' | 'edge' | 'unit' | 'enemy'
  id: string
}

export interface Issue {
  id: string
  code: string
  severity: Severity
  category: Category
  message: string
  hint?: string
  targets: IssueTarget[]
}

export const SEVERITY_LABEL: Record<Severity, string> = { error: 'Critico', warning: 'Avviso', info: 'Nota' }
export const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

export interface CheckResult {
  issues: Issue[]
  world: World
  flow: FlowAnalysis
  counts: Record<Severity, number>
  worstByTarget: Map<string, Severity>
  critical: { nodes: Set<string>; routes: Set<string> }
}

const node = (id: string): IssueTarget => ({ kind: 'node', id })
const edge = (id: string): IssueTarget => ({ kind: 'edge', id })

export function runChecks(state: ProjectState): CheckResult {
  const w = new World(state)
  const flow = analyzeFlows(w)
  const critical = criticalPoints(w)
  const issues: Issue[] = []
  const seen = new Set<string>()
  const emit = (code: string, severity: Severity, category: Category, message: string, targets: IssueTarget[], hint?: string) => {
    const id = `${code}:${targets.map((t) => t.id).join(',')}`
    if (seen.has(id)) return
    seen.add(id)
    issues.push({ id, code, severity, category, message, hint, targets })
  }
  const name = (id: string) => w.name(id)
  const deployed = w.units.filter((u) => u.nodeId && w.buildingById.has(u.nodeId))
  const hours = cartHours(w)

  // ---- Map ----
  if (!w.buildings.length) emit('empty', 'info', 'Mappa', 'Nessun edificio: trascina aree ed edifici dalla palette.', [])
  for (const b of w.buildings) {
    if (!w.areaOf.get(b.id)) emit('no-area', 'warning', 'Mappa', `${name(b.id)} non è dentro nessuna area geografica.`, [node(b.id)], 'Senza area non partecipa al controllo del territorio.')
    if (!w.adjacency.get(b.id)!.length && w.buildings.length > 1) emit('isolated', 'warning', 'Percorsi', `${name(b.id)} non è collegato a nessun percorso.`, [node(b.id)], 'Trascina da un bordo dell’edificio a un altro per creare una strada.')
  }
  for (const a of w.areas) if (!w.buildingsIn.get(a.id)!.length) emit('area-empty', 'info', 'Mappa', `L’area ${a.data.name} non contiene edifici.`, [node(a.id)])

  // ---- Supplies ----
  for (const u of flow.unmet) {
    const water = u.resource === 'acqua'
    emit(
      `unmet-${u.resource}`,
      'error',
      water ? 'Acqua' : 'Rifornimenti',
      `${name(u.nodeId)}: nessun fornitore raggiungibile di ${RESOURCE_INFO[u.resource].label.toLowerCase()} (servono ${fmt(u.perTurn)} ${RESOURCE_INFO[u.resource].unit} a turno).`,
      [node(u.nodeId)],
      'Collega un magazzino o una fonte, oppure aggiungi produzione locale.',
    )
  }
  for (const r of RESOURCES) {
    const d = flow.totals.autonomyDays[r]
    if (!Number.isFinite(d) || flow.totals.consumption[r] < 0.01) continue
    if (d < 1) emit(`army-${r}`, 'error', r === 'acqua' ? 'Acqua' : 'Rifornimenti', `${RESOURCE_INFO[r].label}: l’esercito ha scorte per ${fmtDays(d)}.`, [], 'Consumo superiore alla produzione: aumenta scorte o fonti.')
    else if (d < 4) emit(`army-${r}`, 'warning', r === 'acqua' ? 'Acqua' : 'Rifornimenti', `${RESOURCE_INFO[r].label}: autonomia complessiva ${fmtDays(d)}.`, [])
  }
  for (const f of flow.flows) {
    if (f.resource === 'acqua' && f.hours > 6) emit('water-far', 'warning', 'Acqua', `${name(f.to)} prende l’acqua a ${fmtHours(f.hours)} di carro (da ${name(f.from)}).`, [node(f.to)], 'L’acqua è pesante: serve una fonte o un pozzo vicino.')
  }

  // ---- Carts & routes ----
  if (flow.cartsNeeded > flow.cartsAvailable + 0.01) {
    emit('carts', 'error', 'Carri', `Servono circa ${fmt(Math.ceil(flow.cartsNeeded))} carri in circolazione, ne hai ${fmt(flow.cartsAvailable)}.`, [], 'Aggiungi un parco carri o avvicina fonti e magazzini ai reparti.')
  } else if (flow.cartsNeeded > flow.cartsAvailable * 0.8 && flow.cartsNeeded > 0) {
    emit('carts', 'warning', 'Carri', `Carri quasi tutti impegnati: ${fmt(Math.ceil(flow.cartsNeeded))} su ${fmt(flow.cartsAvailable)}.`, [])
  }
  for (const r of w.routes) {
    const carts = flow.routeCarts.get(r.id) ?? 0
    const capacity = w.capacity(r)
    if (carts > capacity) emit('route-over', 'error', 'Percorsi', `${name(r.id)}: ${fmt(carts, 1)} carri a turno su una capacità di ${fmt(capacity)}.`, [edge(r.id)], 'Collo di bottiglia: aggiungi un percorso parallelo o migliora la strada.')
    else if (carts > capacity * 0.8) emit('route-busy', 'warning', 'Percorsi', `${name(r.id)} è al ${fmt((carts / capacity) * 100)}% della capacità.`, [edge(r.id)])
    if (critical.routes.has(r.id) && carts > 0) emit('route-critical', 'warning', 'Percorsi', `${name(r.id)} è l’unico collegamento per una parte dell’esercito.`, [edge(r.id)], 'Se viene tagliato, i reparti oltre restano senza rifornimenti.')
    const exposed = ROUTE_INFO[r.data!.kind].exposure >= 0.7 && !r.data!.escort && carts > 0
    const nearFront = w.routeAreas(r).some((a) => w.areaById.get(a)!.data.front)
    if (exposed && nearFront) emit('route-exposed', 'info', 'Percorsi', `${name(r.id)} è esposto alle imboscate ed è senza scorta.`, [edge(r.id)])
  }
  for (const id of critical.nodes) {
    const through = flow.flows.some((f) => f.path.nodes.slice(1, -1).includes(id))
    if (through) emit('node-critical', 'warning', 'Percorsi', `${name(id)} è un passaggio obbligato: se cade, la rete si spezza.`, [node(id)])
  }

  // ---- Storage ----
  for (const b of w.buildings) {
    const kg = stockKg(b.data.stock)
    if (kg > b.data.capacityT * 1000 + 1) emit('overstock', 'warning', 'Magazzini', `${name(b.id)}: ${fmt(kg / 1000, 1)} t di scorte su ${fmt(b.data.capacityT)} t di capacità.`, [node(b.id)], 'L’eccesso andrebbe perso: aumenta la capacità o riduci le scorte.')
  }

  // ---- Medical ----
  const hospitals = w.buildings.filter((b) => isHospital(b.data.kind) && !initiallyLost(w, b.id))
  const frontPosts = w.buildings.filter((b) => b.data.kind === 'schieramento' && deployed.some((u) => u.nodeId === b.id))
  if (deployed.length && !hospitals.length) emit('no-hospital', state.enemies.length ? 'error' : 'warning', 'Sanità', 'Nessun ospedale da campo: i feriti moriranno sul posto.', [])
  else if (hospitals.length) {
    for (const f of frontPosts) {
      const sp = shortestPaths(w, f.id, hours)
      const best = Math.min(...hospitals.map((h) => sp.dist.get(h.id) ?? Infinity))
      if (!Number.isFinite(best)) emit('hospital-unreachable', 'error', 'Sanità', `Da ${name(f.id)} non si raggiunge nessun ospedale.`, [node(f.id)])
      else if (best > 6) emit('hospital-far', 'warning', 'Sanità', `Da ${name(f.id)} l’ospedale più vicino è a ${fmtHours(best)}.`, [node(f.id)], 'Oltre un turno di viaggio, molti feriti non arrivano.')
    }
    const frontMen = frontPosts.flatMap((f) => deployed.filter((u) => u.nodeId === f.id)).reduce((s, u) => s + u.men, 0)
    const beds = hospitals.reduce((s, h) => s + h.data.beds, 0)
    if (frontMen > 0 && beds < frontMen * 0.08) emit('beds', 'warning', 'Sanità', `${fmt(beds)} posti letto per ${fmt(frontMen)} uomini in prima linea.`, hospitals.map((h) => node(h.id)), 'In una giornata di battaglia i feriti possono essere il 10–20%.')
  }

  // ---- Command ----
  const commands = w.buildings.filter((b) => BUILDING_INFO[b.data.kind].command && !initiallyLost(w, b.id))
  if (deployed.length && !commands.length) emit('no-command', 'error', 'Comando', 'Nessuna tenda di comando o castello: gli ordini non partono.', [])
  else if (commands.length) {
    const reached = new Set<string>()
    for (const c of commands) for (const id of shortestPaths(w, c.id, () => 1).dist.keys()) reached.add(id)
    for (const u of deployed) if (!reached.has(u.nodeId!)) emit('out-of-command', 'warning', 'Comando', `${u.name} (${name(u.nodeId!)}) è fuori dalla catena di comando.`, [{ kind: 'unit', id: u.id }, node(u.nodeId!)])
  }

  // ---- Units & front ----
  for (const u of w.units) {
    if (!u.nodeId || !w.buildingById.has(u.nodeId)) emit('unit-free', 'info', 'Fronte', `${u.name} non è assegnato a nessun edificio.`, [{ kind: 'unit', id: u.id }])
    if (UNIT_INFO[u.type].horsesPerMan > 0 && u.horses === 0) emit('no-horses', 'warning', 'Fronte', `${u.name}: cavalleria senza cavalli.`, [{ kind: 'unit', id: u.id }])
  }
  for (const e of state.enemies) {
    if (!e.targetAreaId || !w.areaById.has(e.targetAreaId)) {
      emit('enemy-target', 'warning', 'Fronte', `${e.name}: nessuna area bersaglio.`, [{ kind: 'enemy', id: e.id }])
      continue
    }
    const defenders = w.buildingsIn.get(e.targetAreaId)!.flatMap((b) => w.unitsAt(b.id)).reduce((s, u) => s + u.men, 0)
    if (!defenders) emit('undefended', 'warning', 'Fronte', `L’area ${name(e.targetAreaId)} è attaccata da ${e.name} ma non ha reparti.`, [node(e.targetAreaId), { kind: 'enemy', id: e.id }])
  }
  for (const a of w.areas) {
    if (a.data.front && !w.buildingsIn.get(a.id)!.some((b) => b.data.kind === 'schieramento')) emit('front-no-line', 'info', 'Fronte', `L’area di fronte ${a.data.name} non ha una posizione di schieramento.`, [node(a.id)])
  }

  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.category.localeCompare(b.category))
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  const worstByTarget = new Map<string, Severity>()
  for (const i of issues) {
    counts[i.severity]++
    for (const t of i.targets) {
      const cur = worstByTarget.get(t.id)
      if (!cur || SEVERITY_ORDER[i.severity] < SEVERITY_ORDER[cur]) worstByTarget.set(t.id, i.severity)
    }
  }
  return { issues, world: w, flow, counts, worstByTarget, critical }
}
