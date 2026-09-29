import {
  areaStatus,
  BUILDING_INFO,
  PHASE_INFO,
  RECIPES,
  RESOURCE_INFO,
  ROUTE_INFO,
  TERRAIN_INFO,
  TURN_HOURS,
  TURNS_PER_DAY,
  UNIT_INFO,
  WEATHER_INFO,
  WOUNDED_PER_CART,
  type AreaStatus,
  type Weather,
} from '../model/catalog'
import { emptyStock } from '../model/factory'
import type { ProjectState } from '../model/schema'
import { RESOURCES, type EnemyBehavior, type ResourceId, type RouteEdge, type Stock, type UnitType } from '../model/types'
import type { ScheduledEvent, SimEvent } from './events'
import { addTo, combatNeeds, fmt, garrisonTroop, isHospital, LABOUR_BOUND, patientNeeds, reserveRate, stockKg, troopNeeds } from './rates'
import { nextRandom } from './rng'
import { cartKmh, marchKmh, pathTo, shortestPaths, World, type Conditions } from './world'

// ---------------------------------------------------------------------------
// State

export interface WoundedGroup {
  unitId: string
  count: number
}

export interface Patient extends WoundedGroup {
  since: number
}

export interface NodeState {
  stock: Stock
  seized: boolean
  burnedUntil: number
  poisonedUntil: number
  epidemicUntil: number
  fortBonus: number
  fortProgress: number
  garrisonLost: number
  /** Wounded waiting for transport to a hospital. */
  wounded: WoundedGroup[]
  /** Wounded in care (hospitals only). */
  patients: Patient[]
  /** Share of patients' needs met last turn. */
  care: number
}

/** Position along a path: on edges[idx], `km` from nodes[idx]. */
export interface Leg {
  nodes: string[]
  edges: string[]
  idx: number
  km: number
}

export type UnitStatus = 'pronto' | 'combatte' | 'marcia' | 'ritirata' | 'circondato' | 'distrutto'

export interface UnitState {
  id: string
  name: string
  type: UnitType
  men: number
  horses: number
  morale: number
  nodeId: string | null
  /** nodeId declared in the project at the last sync: a change there is a move order. */
  defNode: string | null
  fromProject: boolean
  leg: Leg | null
  prev: { idx: number; km: number } | null
  dest: string | null
  retreating: boolean
  /** Regrouping after a retreat: no new morale-driven retreat until morale recovers. */
  rally: boolean
  /** Where a reserve returns once the danger is over. */
  home: string | null
  /** Supplies carried on the march (baggage train), unloaded on arrival. */
  pack: Partial<Stock>
  quietTurns: number
  status: UnitStatus
  fed: number
  water: number
  forage: number
  ammo: number
  hungryTurns: number
  minMorale: number
  killed: number
  woundedTotal: number
  alerted: Record<string, boolean>
}

export interface Convoy {
  id: string
  from: string
  to: string
  cargo: Partial<Stock>
  wounded: WoundedGroup[]
  carts: number
  departed: number
  leg: Leg
  prev: { idx: number; km: number }
}

export interface Arrival {
  id: string
  kind: 'convoy' | 'unit'
  leg: Leg
  prev: { idx: number; km: number }
  /** Convoys only. */
  cargo?: Partial<Stock>
  wounded?: number
  carts?: number
  /** Units only. */
  type?: UnitType
  men?: number
}

export interface EnemyState {
  id: string
  name: string
  type: UnitType
  men: number
  initialMen: number
  target: string | null
  defTarget: string | null
  behavior: EnemyBehavior
  startTurn: number
  routed: boolean
  fromProject: boolean
  /** Area where it stands (null = not on the field yet). */
  at: string | null
  /** Cross-country march between two areas; `arrived` keeps it one more turn for the map animation. */
  march: EnemyMarch | null
}

export interface EnemyMarch {
  from: string
  to: string
  km: number
  done: number
  prev: number
  arrived: boolean
}

export interface AreaState {
  control: number
  status: AreaStatus
  attacked: boolean
  /** Our share of the strength in the last fight (0..1). */
  ratio: number
  raidUntil: number
  raidStrength: number
  lostAt: number | null
}

export interface RouteState {
  destroyed: boolean
  blockedUntil: number
  raidUntil: number
  raidStrength: number
  repair: number
  cartsThisTurn: number
  kgThisTurn: number
}

export type Tone = 'info' | 'good' | 'warn' | 'bad'

export interface LogEntry {
  turn: number
  tone: Tone
  text: string
  targets: string[]
  /** A failure of the logistic system (first one = "primo cedimento"). */
  breaking?: boolean
}

export interface TurnStats {
  turn: number
  stock: Stock
  men: number
  wounded: number
  dead: number
  morale: number
  deliveredKg: number
  lostKg: number
  cartsFree: number
  cartsTotal: number
  hungryUnits: number
  enemyMen: number
  control: Record<string, number>
  convoys: number
}

export interface SimState {
  turn: number
  seed: number
  rng: number
  weather: Weather
  weatherUntil: number
  nodes: Record<string, NodeState>
  units: Record<string, UnitState>
  enemies: Record<string, EnemyState>
  areas: Record<string, AreaState>
  routes: Record<string, RouteState>
  convoys: Convoy[]
  /** Trips that ended during the last turn: kept one turn so the map can show them reaching the end. */
  arrived: Arrival[]
  cartReturns: { turn: number; carts: number }[]
  cartsLost: number
  pending: { turn: number; unitId: string; nodeId: string }[]
  /** Hours for an order to reach each building (Infinity = cut off). */
  orderDelay: Record<string, number>
  log: LogEntry[]
  series: TurnStats[]
  scheduled: ScheduledEvent[]
  deliveredKg: number
  lostKg: number
  dead: number
  capturedKg: number
  enemyDead: number
  nextId: number
}

// ---------------------------------------------------------------------------
// Setup

function newNodeState(stock: Stock): NodeState {
  return { stock: { ...stock }, seized: false, burnedUntil: -1, poisonedUntil: -1, epidemicUntil: -1, fortBonus: 0, fortProgress: 0, garrisonLost: 0, wounded: [], patients: [], care: 1 }
}

function newRouteState(): RouteState {
  return { destroyed: false, blockedUntil: -1, raidUntil: -1, raidStrength: 0, repair: 0, cartsThisTurn: 0, kgThisTurn: 0 }
}

function newUnitState(id: string, name: string, type: UnitType, men: number, horses: number, morale: number, nodeId: string | null, fromProject: boolean): UnitState {
  return {
    id,
    name,
    type,
    men,
    horses,
    morale,
    nodeId,
    defNode: nodeId,
    fromProject,
    leg: null,
    prev: null,
    dest: null,
    retreating: false,
    rally: false,
    home: nodeId,
    pack: {},
    quietTurns: 0,
    status: 'pronto',
    fed: 1,
    water: 1,
    forage: 1,
    ammo: 1,
    hungryTurns: 0,
    minMorale: morale,
    killed: 0,
    woundedTotal: 0,
    alerted: {},
  }
}

export function initSim(project: ProjectState, seed: number, scheduled: ScheduledEvent[] = []): SimState {
  const s: SimState = {
    turn: 0,
    seed,
    rng: seed >>> 0,
    weather: 'sereno',
    weatherUntil: -1,
    nodes: {},
    units: {},
    enemies: {},
    areas: {},
    routes: {},
    convoys: [],
    arrived: [],
    cartReturns: [],
    cartsLost: 0,
    pending: [],
    orderDelay: {},
    log: [],
    series: [],
    scheduled: [...scheduled].sort((a, b) => a.turn - b.turn),
    deliveredKg: 0,
    lostKg: 0,
    dead: 0,
    capturedKg: 0,
    enemyDead: 0,
    nextId: 1,
  }
  const w = new World(project)
  sync(w, s)
  for (const a of w.areas) {
    const st = s.areas[a.id]
    if (st.status === 'nemico') for (const b of w.buildingsIn.get(a.id)!) s.nodes[b.id].seized = true
  }
  s.series.push(stats(w, s))
  return s
}

/** Align the dynamic state with the project: things added or removed while the simulation runs. */
function sync(w: World, s: SimState) {
  for (const b of w.buildings) if (!s.nodes[b.id]) s.nodes[b.id] = newNodeState(b.data.stock)
  for (const id of Object.keys(s.nodes)) if (!w.buildingById.has(id)) delete s.nodes[id]
  for (const a of w.areas) {
    if (!s.areas[a.id]) {
      const control = Math.max(-100, Math.min(100, a.data.control))
      s.areas[a.id] = { control, status: areaStatus(control), attacked: false, ratio: 1, raidUntil: -1, raidStrength: 0, lostAt: null }
    }
  }
  for (const id of Object.keys(s.areas)) if (!w.areaById.has(id)) delete s.areas[id]
  for (const r of w.routes) if (!s.routes[r.id]) s.routes[r.id] = newRouteState()
  for (const id of Object.keys(s.routes)) if (!w.routeById.has(id)) delete s.routes[id]

  const defs = new Map(w.units.map((u) => [u.id, u]))
  for (const u of w.units) {
    const cur = s.units[u.id]
    if (!cur) {
      s.units[u.id] = newUnitState(u.id, u.name, u.type, u.men, u.horses, u.morale, u.nodeId && w.buildingById.has(u.nodeId) ? u.nodeId : null, true)
      continue
    }
    cur.name = u.name
    const declared = u.nodeId && w.buildingById.has(u.nodeId) ? u.nodeId : null
    if (declared !== cur.defNode) {
      cur.defNode = declared
      if (declared && s.turn > 0 && cur.status !== 'distrutto') queueOrder(s, cur, declared)
      else if (declared && s.turn === 0) cur.nodeId = declared
    }
  }
  for (const [id, u] of Object.entries(s.units)) if (u.fromProject && !defs.has(id)) delete s.units[id]
  for (const u of Object.values(s.units)) {
    if (u.nodeId && !w.buildingById.has(u.nodeId)) {
      u.nodeId = null
      u.leg = null
    }
  }

  const enemies = new Map(w.state.enemies.map((e) => [e.id, e]))
  for (const e of w.state.enemies) {
    const target = e.targetAreaId && w.areaById.has(e.targetAreaId) ? e.targetAreaId : null
    const cur = s.enemies[e.id]
    const origin = e.originAreaId && w.areaById.has(e.originAreaId) ? e.originAreaId : null
    if (!cur) {
      s.enemies[e.id] = { id: e.id, name: e.name, type: e.type, men: e.men, initialMen: e.men, target, defTarget: target, behavior: e.behavior, startTurn: e.startTurn, routed: false, fromProject: true, at: origin, march: null }
      continue
    }
    if (s.turn === 0) cur.at = origin
    cur.name = e.name
    cur.behavior = e.behavior
    if (target !== cur.defTarget) {
      cur.defTarget = target
      cur.target = target
    }
  }
  for (const [id, e] of Object.entries(s.enemies)) {
    if (e.fromProject && !enemies.has(id)) delete s.enemies[id]
    else if (e.target && !w.areaById.has(e.target)) e.target = null
  }
  // Convoys whose ends were deleted are dropped (their cargo is lost in the confusion).
  s.convoys = s.convoys.filter((c) => w.buildingById.has(c.to) && w.buildingById.has(c.from))
}

// ---------------------------------------------------------------------------
// Helpers

/** Water is drawn continuously, not stockpiled: posts keep a shorter reserve of it. */
const TARGET_SHARE: Record<ResourceId, number> = { viveri: 1, acqua: 0.5, foraggio: 1, frecce: 1, armi: 1, legname: 1 }

const log = (s: SimState, tone: Tone, text: string, targets: string[] = [], breaking = false) => s.log.push({ turn: s.turn, tone, text, targets, breaking })

const conditions = (s: SimState): Conditions => ({ weather: s.weather, phase: s.turn % TURNS_PER_DAY })

export function areaStatusOf(w: World, s: SimState, nodeId: string): AreaStatus {
  const a = w.areaOf.get(nodeId)
  return a && s.areas[a] ? s.areas[a].status : 'nostro'
}

export function routeOpen(s: SimState, id: string) {
  const r = s.routes[id]
  return !!r && !r.destroyed && r.blockedUntil < s.turn
}

/** Chance per 6 h that a convoy on this route is attacked (before exposure and escort). */
export function routeThreat(w: World, s: SimState, route: RouteEdge): number {
  const rs = s.routes[route.id]
  let t = rs && rs.raidUntil >= s.turn ? rs.raidStrength : 0
  for (const a of w.routeAreas(route)) {
    const as = s.areas[a]
    if (!as) continue
    if (as.raidUntil >= s.turn) t = Math.max(t, as.raidStrength)
    if (as.status === 'conteso') t = Math.max(t, 0.15)
  }
  return t
}

function cartsTotal(w: World, s: SimState) {
  return Math.max(0, w.buildings.reduce((sum, b) => sum + (s.nodes[b.id]?.seized ? 0 : b.data.carts), 0) - s.cartsLost)
}

export function cartsBusy(s: SimState) {
  return s.convoys.reduce((sum, c) => sum + c.carts, 0) + s.cartReturns.reduce((sum, r) => sum + r.carts, 0)
}

const unitsAtNode = (s: SimState, nodeId: string) => Object.values(s.units).filter((u) => u.nodeId === nodeId && !u.leg && u.status !== 'distrutto')

const garrisonOf = (w: World, s: SimState, id: string) => Math.max(0, w.buildingById.get(id)!.data.garrison - s.nodes[id].garrisonLost)

function reserveAt(w: World, s: SimState, id: string): Stock {
  const out = emptyStock()
  const area = w.areaOf.get(id)
  const fighting = !!area && !!s.areas[area]?.attacked
  // Units on their way are counted too: supplies are sent ahead of them.
  const expected = Object.values(s.units).filter((u) => u.status !== 'distrutto' && (u.leg ? u.dest === id : u.nodeId === id))
  for (const u of expected) {
    addTo(out, reserveRate(u))
    // Under attack, ammunition is drawn at battle rate.
    if (fighting) addTo(out, combatNeeds(u, 0.6))
  }
  addTo(out, reserveRate(garrisonTroop(garrisonOf(w, s, id))))
  const inbound = s.convoys.filter((c) => c.to === id).reduce((n, c) => n + c.wounded.reduce((m, g) => m + g.count, 0), 0)
  const patients = s.nodes[id].patients.reduce((n, p) => n + p.count, 0) + inbound
  addTo(out, patientNeeds(patients))
  const recipe = RECIPES[w.buildingById.get(id)!.data.kind]
  if (recipe) addTo(out, recipe.in)
  return out
}

function freeKg(w: World, s: SimState, id: string) {
  return Math.max(0, w.buildingById.get(id)!.data.capacityT * 1000 - stockKg(s.nodes[id].stock))
}

function canEnter(s: SimState, to: string) {
  const n = s.nodes[to]
  return !!n && !n.seized
}

/** Moves along a leg for `hours`; returns what happened. */
function advance(w: World, s: SimState, leg: Leg, hours: number, kmh: (r: RouteEdge) => number, onEdge?: (r: RouteEdge, h: number) => void): 'arrived' | 'blocked' | 'moving' {
  let left = hours
  while (left > 1e-6) {
    if (leg.idx >= leg.edges.length) return 'arrived'
    const route = w.routeById.get(leg.edges[leg.idx])
    const next = leg.nodes[leg.idx + 1]
    if (!route || !routeOpen(s, route.id) || !canEnter(s, next)) {
      leg.km = 0
      return 'blocked'
    }
    const v = kmh(route)
    if (v <= 0) return 'moving'
    const len = w.routeKm.get(route.id)!
    const t = (len - leg.km) / v
    if (t <= left) {
      left -= t
      onEdge?.(route, t)
      leg.idx++
      leg.km = 0
    } else {
      leg.km += v * left
      onEdge?.(route, left)
      left = 0
    }
  }
  return leg.idx >= leg.edges.length ? 'arrived' : 'moving'
}

function cartCost(w: World, s: SimState, c: Conditions) {
  return (r: RouteEdge, _from: string, to: string) => {
    if (!routeOpen(s, r.id) || !canEnter(s, to)) return Infinity
    const h = w.routeKm.get(r.id)! / cartKmh(r, c)
    // Prefer safe roads: danger counts as extra hours.
    return h + routeThreat(w, s, r) * 24
  }
}

function marchCost(w: World, s: SimState, type: UnitType, c: Conditions) {
  const day = { ...c, phase: 1 }
  return (r: RouteEdge, _from: string, to: string) => (!routeOpen(s, r.id) || !canEnter(s, to) ? Infinity : w.routeKm.get(r.id)! / marchKmh(r, type, day))
}

function startMarch(w: World, s: SimState, u: UnitState, dest: string, retreat: boolean): boolean {
  if (!u.nodeId || u.nodeId === dest) return false
  const sp = shortestPaths(w, u.nodeId, marchCost(w, s, u.type, conditions(s)))
  const p = pathTo(sp, u.nodeId, dest)
  if (!p) return false
  u.leg = { nodes: p.nodes, edges: p.edges, idx: 0, km: 0 }
  u.prev = { idx: 0, km: 0 }
  u.dest = dest
  // The unit's own baggage: up to a day of food, water and fodder from where it leaves.
  const origin = s.nodes[u.nodeId]
  if (origin && !origin.seized) {
    const day = troopNeeds(u)
    // Water is found on the way; never strip the post it leaves.
    for (const r of ['viveri', 'foraggio'] as const) {
      const k = Math.min(origin.stock[r] * 0.5, day[r] * TURNS_PER_DAY)
      origin.stock[r] -= k
      u.pack[r] = (u.pack[r] ?? 0) + k
    }
  }
  u.retreating = retreat
  u.status = retreat ? 'ritirata' : 'marcia'
  return true
}

function queueOrder(s: SimState, u: UnitState, nodeId: string) {
  const at = u.nodeId ?? nodeId
  const delay = s.orderDelay[at] ?? 0
  if (!Number.isFinite(delay)) {
    log(s, 'warn', `L’ordine per ${u.name} non può essere recapitato: il reparto è isolato dal comando.`, [u.id])
    return
  }
  const turns = delay <= 2 ? 0 : Math.ceil(delay / TURN_HOURS)
  s.pending = s.pending.filter((p) => p.unitId !== u.id)
  s.pending.push({ turn: s.turn + turns, unitId: u.id, nodeId })
  if (turns > 0) log(s, 'info', `Ordine per ${u.name} in viaggio: arriverà tra ${turns} turni.`, [u.id])
}

// ---------------------------------------------------------------------------
// Events

export function applyEvent(w: World, s: SimState, e: SimEvent) {
  const t = s.turn
  switch (e.type) {
    case 'incendio': {
      const n = s.nodes[e.nodeId]
      if (!n) return
      const before = stockKg(n.stock)
      n.stock.viveri *= 0.1
      n.stock.foraggio *= 0.05
      n.stock.legname *= 0.1
      n.stock.frecce *= 0.3
      n.stock.armi *= 0.8
      n.burnedUntil = t + 8
      log(s, 'bad', `Incendio a ${w.name(e.nodeId)}: perse ${fmt((before - stockKg(n.stock)) / 1000, 1)} t di scorte, produzione ferma per 2 giorni.`, [e.nodeId])
      return
    }
    case 'avvelena': {
      const n = s.nodes[e.nodeId]
      if (!n) return
      n.stock.acqua = 0
      n.poisonedUntil = t + e.turns
      log(s, 'bad', `Acqua avvelenata a ${w.name(e.nodeId)}.`, [e.nodeId])
      return
    }
    case 'distruggi': {
      const r = w.routeById.get(e.routeId)
      const rs = s.routes[e.routeId]
      if (!r || !rs) return
      if (ROUTE_INFO[r.data!.kind].destroyable) {
        rs.destroyed = true
        rs.repair = 0
        log(s, 'bad', `${w.name(r.id)} distrutto: servono i genieri per ricostruirlo.`, [r.id])
      } else {
        rs.blockedUntil = t + 8
        log(s, 'bad', `${w.name(r.id)} interrotto (frana, alberi abbattuti) per 2 giorni.`, [r.id])
      }
      return
    }
    case 'ripara': {
      const rs = s.routes[e.routeId]
      if (!rs) return
      rs.destroyed = false
      rs.blockedUntil = -1
      log(s, 'good', `${w.name(e.routeId)} di nuovo percorribile.`, [e.routeId])
      return
    }
    case 'raid': {
      if (e.routeId && s.routes[e.routeId]) {
        Object.assign(s.routes[e.routeId], { raidUntil: t + e.turns - 1, raidStrength: e.strength })
        log(s, 'bad', `Razziatori nemici su ${w.name(e.routeId)}.`, [e.routeId])
      }
      if (e.areaId && s.areas[e.areaId]) {
        Object.assign(s.areas[e.areaId], { raidUntil: t + e.turns - 1, raidStrength: e.strength })
        log(s, 'bad', `Cavalleria nemica in razzia nell’area ${w.name(e.areaId)}.`, [e.areaId])
      }
      return
    }
    case 'meteo':
      s.weather = e.weather
      s.weatherUntil = e.weather === 'sereno' ? -1 : t + e.turns - 1
      log(s, e.weather === 'sereno' ? 'good' : 'warn', e.weather === 'sereno' ? 'Il tempo torna sereno.' : `${WEATHER_INFO[e.weather].label}: strade più lente${e.weather === 'nebbia' ? ', imboscate più facili' : ''}.`)
      return
    case 'epidemia': {
      const n = s.nodes[e.nodeId]
      if (!n) return
      n.epidemicUntil = t + e.turns - 1
      log(s, 'bad', `Epidemia a ${w.name(e.nodeId)}.`, [e.nodeId])
      return
    }
    case 'attacco': {
      if (!s.areas[e.areaId]) return
      const id = `sim-e${s.nextId++}`
      // It comes from the nearest enemy territory, if the map has one; otherwise it falls on the area at once.
      const from = w.enemyBaseNear(e.areaId)
      s.enemies[id] = { id, name: e.name, type: e.unitType, men: e.men, initialMen: e.men, target: e.areaId, defTarget: e.areaId, behavior: e.behavior, startTurn: t, routed: false, fromProject: false, at: from, march: null }
      log(s, 'bad', from ? `${e.name} (${fmt(e.men)} ${UNIT_INFO[e.unitType].label.toLowerCase()}) parte da ${w.name(from)} verso ${w.name(e.areaId)}.` : `${e.name} (${fmt(e.men)} ${UNIT_INFO[e.unitType].label.toLowerCase()}) attacca ${w.name(e.areaId)}.`, [e.areaId])
      return
    }
    case 'rinforzi': {
      if (!s.nodes[e.nodeId]) return
      const id = `sim-u${s.nextId++}`
      s.units[id] = newUnitState(id, e.name, e.unitType, e.men, Math.round(e.men * UNIT_INFO[e.unitType].horsesPerMan), 80, e.nodeId, false)
      log(s, 'good', `Arrivano rinforzi a ${w.name(e.nodeId)}: ${e.name}, ${fmt(e.men)} uomini.`, [e.nodeId, id])
      return
    }
    case 'ordine': {
      const u = s.units[e.unitId]
      if (!u || u.status === 'distrutto' || !s.nodes[e.nodeId]) return
      queueOrder(s, u, e.nodeId)
      return
    }
    case 'controllo': {
      const a = s.areas[e.areaId]
      if (!a) return
      a.control = Math.max(-100, Math.min(100, e.control))
      updateAreaStatus(w, s, e.areaId)
      return
    }
    case 'rifornisci': {
      const n = s.nodes[e.nodeId]
      if (!n) return
      n.stock[e.resource] += e.amount
      log(s, 'good', `Rifornimento d’emergenza a ${w.name(e.nodeId)}: +${fmt(e.amount)} ${RESOURCE_INFO[e.resource].unit} di ${RESOURCE_INFO[e.resource].label.toLowerCase()}.`, [e.nodeId])
      return
    }
  }
}

function updateAreaStatus(w: World, s: SimState, areaId: string) {
  const a = s.areas[areaId]
  const next = areaStatus(a.control)
  if (next === a.status) return
  const was = a.status
  a.status = next
  const name = w.name(areaId)
  if (next === 'nemico') {
    a.lostAt = s.turn
    let kg = 0
    let prisoners = 0
    for (const b of w.buildingsIn.get(areaId)!) {
      const n = s.nodes[b.id]
      n.seized = true
      kg += stockKg(n.stock)
      n.stock = emptyStock()
      prisoners += n.wounded.reduce((x, g) => x + g.count, 0) + n.patients.reduce((x, g) => x + g.count, 0)
      n.wounded = []
      n.patients = []
    }
    s.capturedKg += kg
    s.dead += prisoners
    log(s, 'bad', `Area ${name} perduta: il nemico cattura ${fmt(kg / 1000, 1)} t di scorte${prisoners ? ` e ${fmt(prisoners)} feriti` : ''}.`, [areaId], true)
    for (const u of Object.values(s.units)) u.morale = Math.max(0, u.morale - 4)
  } else if (was === 'nemico') {
    for (const b of w.buildingsIn.get(areaId)!) s.nodes[b.id].seized = false
    a.lostAt = null
    log(s, 'good', `Area ${name} riconquistata.`, [areaId])
  } else if (next === 'conteso') {
    log(s, 'warn', `Area ${name} contesa: produzione dimezzata, convogli a rischio.`, [areaId])
  } else {
    log(s, 'good', `Area ${name} di nuovo sotto controllo.`, [areaId])
  }
}

// ---------------------------------------------------------------------------
// Step

/** Advances the simulation by one turn (6 h). Pure: returns a new state. */
export function step(project: ProjectState, prev: SimState, manual: SimEvent[] = [], world?: World): SimState {
  const w = world ?? new World(project)
  const s: SimState = structuredClone(prev)
  s.turn++
  const t = s.turn
  const phase = t % TURNS_PER_DAY
  sync(w, s)
  s.arrived = []
  for (const r of Object.values(s.routes)) {
    r.cartsThisTurn = 0
    r.kgThisTurn = 0
  }
  if (s.weatherUntil >= 0 && s.weatherUntil < t) {
    s.weather = 'sereno'
    s.weatherUntil = -1
    log(s, 'good', 'Il tempo torna sereno.')
  }
  while (s.scheduled.length && s.scheduled[0].turn <= t) applyEvent(w, s, s.scheduled.shift()!.event)
  for (const e of manual) applyEvent(w, s, e)

  commandNetwork(w, s)
  production(w, s, phase)
  moveConvoys(w, s)
  moveUnits(w, s)
  consumption(w, s)
  enemyMarches(w, s)
  combat(w, s, phase)
  medical(w, s)
  morale(w, s)
  autonomousUnits(w, s)
  orders(w, s)
  dispatch(w, s)
  s.cartReturns = s.cartReturns.filter((r) => r.turn > t)
  s.series.push(stats(w, s))
  return s
}

function commandNetwork(w: World, s: SimState) {
  const sources = w.buildings.filter((b) => BUILDING_INFO[b.data.kind].command && !s.nodes[b.id].seized)
  const relay = (id: string) => BUILDING_INFO[w.buildingById.get(id)!.data.kind].relay && !s.nodes[id].seized
  const cost = (r: RouteEdge) => {
    if (!routeOpen(s, r.id)) return Infinity
    const h = w.routeKm.get(r.id)! / (12 * (0.5 + ROUTE_INFO[r.data!.kind].speed / 2))
    return relay(r.source) || relay(r.target) ? h * 0.1 : h
  }
  const delay: Record<string, number> = {}
  for (const b of w.buildings) delay[b.id] = Infinity
  for (const c of sources) for (const [id, h] of shortestPaths(w, c.id, cost).dist) delay[id] = Math.min(delay[id], h)
  s.orderDelay = delay
}

function production(w: World, s: SimState, phase: number) {
  const labour = PHASE_INFO[phase].labour
  for (const b of w.buildings) {
    const n = s.nodes[b.id]
    if (n.seized || n.burnedUntil >= s.turn) continue
    const status = areaStatusOf(w, s, b.id)
    const k = (status === 'conteso' ? 0.5 : 1) * (LABOUR_BOUND.has(b.data.kind) ? labour : 1)
    if (k <= 0) continue
    const made = emptyStock()
    addTo(made, b.data.production, k)
    if (n.poisonedUntil >= s.turn) made.acqua = 0
    const recipe = RECIPES[b.data.kind]
    if (recipe) {
      let share = k
      for (const r of RESOURCES) {
        const need = recipe.in[r] ?? 0
        if (need > 0) share = Math.min(share, n.stock[r] / need)
      }
      if (share > 0) {
        addTo(n.stock, recipe.in, -share)
        addTo(made, recipe.out, share)
      }
    }
    const kg = stockKg(made)
    const free = freeKg(w, s, b.id)
    addTo(n.stock, made, kg > free ? free / kg : 1)
  }
}

function deliver(w: World, s: SimState, c: Convoy) {
  const n = s.nodes[c.to]
  if (!n || n.seized) {
    const kg = stockKg(c.cargo)
    s.lostKg += kg
    s.capturedKg += kg
    return
  }
  const kg = stockKg(c.cargo)
  const free = freeKg(w, s, c.to)
  addTo(n.stock, c.cargo, kg > free && kg > 0 ? free / kg : 1)
  s.deliveredKg += Math.min(kg, free)
  for (const g of c.wounded) {
    if (isHospital(w.buildingById.get(c.to)!.data.kind)) n.patients.push({ ...g, since: s.turn })
    else n.wounded.push(g)
  }
  s.cartReturns.push({ turn: s.turn + Math.max(1, s.turn - c.departed), carts: c.carts })
}

function moveConvoys(w: World, s: SimState) {
  const c0 = conditions(s)
  const keep: Convoy[] = []
  for (const c of s.convoys) {
    c.prev = { idx: c.leg.idx, km: c.leg.km }
    let ambushed = false
    const res = advance(w, s, c.leg, TURN_HOURS, (r) => cartKmh(r, c0), (r, h) => {
      if (ambushed) return
      const threat = routeThreat(w, s, r)
      if (threat <= 0) return
      const p = 1 - (1 - Math.min(0.95, threat * ROUTE_INFO[r.data!.kind].exposure * WEATHER_INFO[s.weather].ambush * (r.data!.escort ? 0.3 : 1))) ** (h / TURN_HOURS)
      if (nextRandom(s) < p) {
        ambushed = true
        const loss = 0.5 + nextRandom(s) * 0.5
        const kg = stockKg(c.cargo) * loss
        for (const k of Object.keys(c.cargo) as ResourceId[]) c.cargo[k] = (c.cargo[k] ?? 0) * (1 - loss)
        const lostMen = c.wounded.reduce((x, g) => x + Math.round(g.count * loss), 0)
        c.wounded = c.wounded.map((g) => ({ ...g, count: g.count - Math.round(g.count * loss) })).filter((g) => g.count > 0)
        const carts = Math.max(1, Math.round(c.carts * loss * 0.6))
        c.carts -= Math.min(c.carts, carts)
        s.cartsLost += carts
        s.lostKg += kg
        s.dead += lostMen
        log(s, 'bad', `Imboscata su ${w.name(r.id)}: convoglio per ${w.name(c.to)} perde ${fmt(kg / 1000, 1)} t${lostMen ? ` e ${fmt(lostMen)} feriti` : ''}, ${fmt(carts)} carri.`, [r.id, c.to])
      }
    })
    if (c.carts <= 0 || (stockKg(c.cargo) < 1 && !c.wounded.length)) continue
    if (res === 'arrived') {
      deliver(w, s, c)
      s.arrived.push({ id: c.id, kind: 'convoy', leg: c.leg, prev: c.prev, cargo: c.cargo, wounded: c.wounded.reduce((x, g) => x + g.count, 0), carts: c.carts })
      continue
    }
    if (res === 'blocked') {
      // Re-plan from where it stands; if nothing works, go back to the depot.
      const at = c.leg.nodes[c.leg.idx]
      const sp = shortestPaths(w, at, cartCost(w, s, c0), w.meta.logistics.maxTripHours)
      const p = pathTo(sp, at, c.to) ?? pathTo(sp, at, c.from)
      if (!p) {
        if (at === c.to || at === c.from) deliver(w, s, { ...c, to: at })
        else {
          const kg = stockKg(c.cargo)
          s.lostKg += kg
          log(s, 'bad', `Convoglio per ${w.name(c.to)} bloccato a ${w.name(at)}: carico abbandonato.`, [at, c.to])
          s.cartReturns.push({ turn: s.turn + 2, carts: c.carts })
        }
        continue
      }
      if (p.nodes[p.nodes.length - 1] !== c.to) {
        log(s, 'warn', `Convoglio per ${w.name(c.to)} costretto a tornare indietro.`, [c.to])
        c.to = c.from
      }
      c.leg = { nodes: p.nodes, edges: p.edges, idx: 0, km: 0 }
      c.prev = { idx: 0, km: 0 }
      if (p.edges.length === 0) {
        deliver(w, s, c)
        continue
      }
    }
    keep.push(c)
  }
  s.convoys = keep
}

function moveUnits(w: World, s: SimState) {
  const c0 = conditions(s)
  for (const u of Object.values(s.units)) {
    if (!u.leg || u.status === 'distrutto') continue
    u.prev = { idx: u.leg.idx, km: u.leg.km }
    const res = advance(w, s, u.leg, TURN_HOURS, (r) => marchKmh(r, u.type, c0))
    if (res === 'arrived') {
      s.arrived.push({ id: u.id, kind: 'unit', leg: u.leg, prev: u.prev, type: u.type, men: u.men })
      const n = s.nodes[u.dest!]
      if (n && !n.seized) addTo(n.stock, u.pack)
      u.pack = {}
      u.nodeId = u.dest
      u.leg = null
      u.prev = null
      u.status = 'pronto'
      log(s, 'info', `${u.name} è arrivato a ${w.name(u.dest!)}.`, [u.id, u.dest!])
      u.dest = null
      if (u.retreating) u.rally = true
      u.retreating = false
    } else if (res === 'blocked') {
      const at = u.leg.nodes[u.leg.idx]
      u.nodeId = at
      u.leg = null
      u.prev = null
      const dest = u.dest!
      if (!startMarch(w, s, u, dest, u.retreating)) {
        u.status = 'pronto'
        u.dest = null
        log(s, 'warn', `${u.name} non può proseguire verso ${w.name(dest)}: si ferma a ${w.name(at)}.`, [u.id, at])
      }
    }
  }
}

function consumption(w: World, s: SimState) {
  for (const b of w.buildings) {
    const n = s.nodes[b.id]
    const units = unitsAtNode(s, b.id)
    const patients = n.patients.reduce((x, p) => x + p.count, 0)
    const need = emptyStock()
    for (const u of units) addTo(need, troopNeeds(u))
    addTo(need, troopNeeds(garrisonTroop(garrisonOf(w, s, b.id))))
    addTo(need, patientNeeds(patients))
    const frac = emptyStock()
    for (const r of RESOURCES) {
      if (need[r] <= 0) {
        frac[r] = 1
        continue
      }
      const got = Math.min(need[r], n.stock[r])
      n.stock[r] -= got
      frac[r] = got / need[r]
    }
    n.care = Math.min(frac.viveri, frac.acqua)
    for (const u of units) {
      u.fed = frac.viveri
      u.water = frac.acqua
      u.forage = u.horses > 0 ? frac.foraggio : 1
      if (u.horses > 0 && u.forage < 0.6) u.horses = Math.max(0, Math.floor(u.horses * (1 - 0.03 * (1 - u.forage))))
      if (frac.legname < 0.5) u.morale -= 1
    }
  }
  for (const u of Object.values(s.units)) {
    if (u.leg) {
      u.fed = 1
      u.water = 1
      u.forage = 1
    }
  }
}

/** Fighting value of one of our units. */
function unitPower(w: World, s: SimState, u: UnitState, terrainDefense: number, cavalry: number) {
  const info = UNIT_INFO[u.type]
  const supply = Math.max(0.3, Math.sqrt(Math.min(u.fed, u.water)))
  const ammo = info.missile ? (0.35 + 0.65 * u.ammo) * WEATHER_INFO[s.weather].archers : 1
  const horse = u.type === 'cavalleria' ? cavalry * WEATHER_INFO[s.weather].cavalry * (0.5 + 0.5 * u.forage) * Math.min(1, u.horses / Math.max(1, u.men)) : 1
  const node = u.nodeId ? w.buildingById.get(u.nodeId) : undefined
  const fort = node ? 1 + 0.15 * Math.min(3, node.data.fortification + s.nodes[node.id].fortBonus) : 1
  return u.men * info.power * (0.4 + (0.6 * u.morale) / 100) * supply * ammo * horse * terrainDefense * fort
}

/** Enemy forces move cross-country from area to area, then fight where they stand. */
function enemyMarches(w: World, s: SimState) {
  const c0 = conditions(s)
  for (const e of Object.values(s.enemies)) {
    if (e.march?.arrived) e.march = null
    if (e.routed || e.men <= 0 || e.startTurn > s.turn) continue
    if (!e.at) {
      e.at = e.target
      continue
    }
    if (!e.march && e.target && e.at !== e.target) {
      e.march = { from: e.at, to: e.target, km: w.areaKm(e.at, e.target), done: 0, prev: 0, arrived: false }
      if (e.fromProject || s.turn > e.startTurn) log(s, 'warn', `${e.name} (${fmt(e.men)}) marcia verso ${w.name(e.target)}.`, [e.target])
    }
    const m = e.march
    if (!m) continue
    m.prev = m.done
    const kmh = UNIT_INFO[e.type].marchKmh * 0.8 * (c0.weather === 'pioggia' ? 0.7 : 1)
    m.done = Math.min(m.km, m.done + kmh * TURN_HOURS)
    if (m.done >= m.km) {
      m.arrived = true
      e.at = m.to
      log(s, 'bad', `${e.name} raggiunge ${w.name(m.to)} e attacca.`, [m.to])
    }
  }
}

function combat(w: World, s: SimState, phase: number) {
  const intensity = PHASE_INFO[phase].combat
  for (const a of w.areas) s.areas[a.id].attacked = false
  const byArea = new Map<string, EnemyState[]>()
  for (const e of Object.values(s.enemies)) {
    if (e.routed || e.men <= 0 || !e.at || e.startTurn > s.turn || (e.march && !e.march.arrived)) continue
    // A force resting in territory already held by the enemy has nothing to fight there.
    if (e.at !== e.target && s.areas[e.at]?.status === 'nemico') continue
    byArea.set(e.at, [...(byArea.get(e.at) ?? []), e])
  }
  for (const a of w.areas) {
    const as = s.areas[a.id]
    const terrain = TERRAIN_INFO[a.data.terrain]
    const nodes = w.buildingsIn.get(a.id)!.map((b) => b.id)
    const ours = Object.values(s.units).filter((u) => u.nodeId && nodes.includes(u.nodeId) && !u.leg && u.status !== 'distrutto')
    const enemies = byArea.get(a.id) ?? []
    if (!enemies.length) {
      for (const u of ours) if (u.status === 'combatte') u.status = 'pronto'
      if (ours.length && as.control < 100) {
        as.control = Math.min(100, as.control + 8)
        updateAreaStatus(w, s, a.id)
      }
      continue
    }
    as.attacked = true
    // Ammunition and weapons are drawn from the stores of the building each unit stands at.
    for (const u of ours) {
      const n = s.nodes[u.nodeId!]
      const need = combatNeeds(u, intensity)
      u.ammo = 1
      for (const r of ['frecce', 'armi'] as const) {
        if (need[r] <= 0) continue
        const got = Math.min(need[r], n.stock[r])
        n.stock[r] -= got
        if (r === 'frecce') u.ammo = got / need[r]
      }
      u.status = 'combatte'
    }
    const garrison = nodes.reduce((sum, id) => sum + (s.nodes[id].seized ? 0 : garrisonOf(w, s, id)), 0)
    const unitEff = ours.map((u) => unitPower(w, s, u, terrain.defense, terrain.cavalry))
    const S = unitEff.reduce((x, y) => x + y, 0) + garrison * UNIT_INFO.milizia.power * 0.8 * terrain.defense
    const E = enemies.reduce((sum, e) => {
      const cav = e.type === 'cavalleria' ? terrain.cavalry * WEATHER_INFO[s.weather].cavalry : 1
      const miss = UNIT_INFO[e.type].missile ? WEATHER_INFO[s.weather].archers : 1
      return sum + e.men * UNIT_INFO[e.type].power * 0.85 * cav * miss
    }, 0)
    const ratio = S / (S + E)
    as.ratio = ratio
    const vary = () => 0.85 + nextRandom(s) * 0.3
    const ourMen = ours.reduce((x, u) => x + u.men, 0) + garrison
    const ourLoss = Math.min(ourMen * 0.25, E * 0.035 * intensity * vary())
    const theirLoss = S * 0.035 * intensity * vary()
    // Our losses: shared by units in proportion to their men; a quarter die, the rest are wounded.
    if (ourMen > 0) {
      for (const u of ours) {
        const loss = Math.min(u.men, Math.round((ourLoss * u.men) / ourMen))
        if (!loss) continue
        const killed = Math.round(loss * 0.25)
        u.men -= loss
        u.killed += killed
        u.woundedTotal += loss - killed
        s.dead += killed
        const n = s.nodes[u.nodeId!]
        const g = n.wounded.find((x) => x.unitId === u.id)
        if (g) g.count += loss - killed
        else n.wounded.push({ unitId: u.id, count: loss - killed })
      }
      const gLoss = Math.round((ourLoss * garrison) / ourMen)
      if (gLoss > 0) {
        const posts = nodes.filter((id) => !s.nodes[id].seized && garrisonOf(w, s, id) > 0)
        for (const id of posts) s.nodes[id].garrisonLost += Math.ceil(gLoss / posts.length)
        s.dead += gLoss
      }
    }
    for (const e of enemies) {
      const l = Math.min(e.men, Math.round((theirLoss * e.men) / enemies.reduce((x, y) => x + y.men, 0)))
      e.men -= l
      s.enemyDead += l
    }
    for (const u of ours) {
      if (ratio < 0.4) u.morale -= 5 * intensity
      else if (ratio > 0.6) u.morale += 2 * intensity
    }
    const delta = S > 0 ? (ratio - 0.5) * 50 * intensity : -30 * Math.max(0.3, intensity)
    as.control = Math.max(-100, Math.min(100, as.control + delta))
    updateAreaStatus(w, s, a.id)

    for (const e of enemies) {
      // Medieval armies broke long before being destroyed.
      if (e.men < e.initialMen * 0.55) {
        e.routed = true
        log(s, 'good', `${e.name} ripiega dopo pesanti perdite.`, [a.id])
        continue
      }
      if (e.behavior === 'avanza' && as.control <= -60) {
        const next = w
          .areaNeighbors(a.id)
          .filter((id) => s.areas[id].status !== 'nemico')
          .map((id) => {
            const bs = w.buildingsIn.get(id)!
            const value = bs.reduce((v, b) => v + 1 + (BUILDING_INFO[b.data.kind].command ? 100 : 0), 0)
            return { id, value }
          })
          .sort((x, y) => y.value - x.value || x.id.localeCompare(y.id))[0]
        if (next) {
          e.target = next.id
          log(s, 'bad', `${e.name} avanza verso ${w.name(next.id)}.`, [next.id])
        }
      }
    }
  }
}

function medical(w: World, s: SimState) {
  for (const b of w.buildings) {
    const n = s.nodes[b.id]
    const hospital = isHospital(b.data.kind)
    // Wounded left at a post: some die every turn. At a hospital they are admitted right away.
    for (const g of n.wounded) {
      const die = Math.round(g.count * 0.06)
      g.count -= die
      s.dead += die
      const u = s.units[g.unitId]
      if (u) u.killed += die
    }
    if (hospital) {
      for (const g of n.wounded) if (g.count > 0) n.patients.push({ ...g, since: s.turn })
      n.wounded = []
    }
    n.wounded = n.wounded.filter((g) => g.count > 0)
    if (!n.patients.length) continue
    const total = n.patients.reduce((x, p) => x + p.count, 0)
    const bedShare = Math.min(1, b.data.beds / Math.max(1, total))
    const deathRate = 0.01 + 0.05 * (1 - n.care * bedShare)
    const healed = new Map<string, number>()
    for (const p of n.patients) {
      const die = Math.round(p.count * deathRate)
      p.count -= die
      s.dead += die
      if (s.turn - p.since >= 12) {
        const back = Math.round(p.count * 0.75)
        healed.set(p.unitId, (healed.get(p.unitId) ?? 0) + back)
        p.count = 0
      }
    }
    n.patients = n.patients.filter((p) => p.count > 0)
    let back = 0
    for (const [id, count] of healed) {
      const u = s.units[id]
      if (u && u.status !== 'distrutto') {
        u.men += count
        back += count
      }
    }
    if (back > 0) log(s, 'good', `${fmt(back)} feriti guariti tornano ai reparti da ${w.name(b.id)}.`, [b.id])
  }
  for (const b of w.buildings) {
    const n = s.nodes[b.id]
    if (n.epidemicUntil < s.turn) continue
    for (const u of unitsAtNode(s, b.id)) {
      const sick = Math.ceil(u.men * 0.01)
      u.men -= sick
      u.morale -= 2
      const g = n.wounded.find((x) => x.unitId === u.id)
      if (g) g.count += sick
      else n.wounded.push({ unitId: u.id, count: sick })
    }
  }
}

function morale(w: World, s: SimState) {
  for (const u of Object.values(s.units)) {
    if (u.status === 'distrutto') continue
    if (u.men < 5) {
      u.status = 'distrutto'
      u.leg = null
      log(s, 'bad', `${u.name} è stato annientato.`, [u.id], true)
      continue
    }
    const at = u.nodeId
    let d = 0
    d -= 8 * (1 - u.fed) + 12 * (1 - u.water)
    if (u.horses > 0) d -= 4 * (1 - u.forage)
    if (at) {
      const n = s.nodes[at]
      const own = n.wounded.find((g) => g.unitId === u.id)?.count ?? 0
      d -= Math.min(4, (own / Math.max(1, u.men)) * 20)
      if (!Number.isFinite(s.orderDelay[at] ?? Infinity)) d -= 2
      const rest = BUILDING_INFO[w.buildingById.get(at)!.data.kind].rest
      if (u.status !== 'combatte' && u.fed > 0.95 && u.water > 0.95) d += rest ? 4 : 2
    }
    u.morale = Math.max(0, Math.min(100, u.morale + d))
    u.minMorale = Math.min(u.minMorale, u.morale)
    const hungry = u.fed < 0.8 || u.water < 0.8
    if (hungry) u.hungryTurns++
    const lack = u.water < 0.5 ? 'acqua' : u.fed < 0.5 ? 'viveri' : u.forage < 0.5 ? 'foraggio' : u.ammo < 0.3 && UNIT_INFO[u.type].missile ? 'frecce' : null
    if (lack && !u.alerted[lack]) {
      u.alerted[lack] = true
      log(s, 'bad', `${u.name} è rimasto senza ${lack}${at ? ` a ${w.name(at)}` : ''}.`, [u.id, ...(at ? [at] : [])], true)
    }
    if (!lack) u.alerted = {}
    if (at && s.nodes[at].seized && !u.leg && u.status !== 'circondato') {
      u.status = 'circondato'
      log(s, 'bad', `${u.name} è circondato a ${w.name(at)}.`, [u.id, at], true)
    }
  }
}

function findRefuge(w: World, s: SimState, u: UnitState): string | null {
  const sp = shortestPaths(w, u.nodeId!, marchCost(w, s, u.type, conditions(s)))
  let best: { id: string; score: number } | null = null
  for (const [id, h] of sp.dist) {
    if (id === u.nodeId) continue
    const a = w.areaOf.get(id)
    const as = a ? s.areas[a] : null
    if (as && (as.status !== 'nostro' || as.attacked)) continue
    if (s.nodes[id].seized) continue
    const rest = BUILDING_INFO[w.buildingById.get(id)!.data.kind].rest
    const score = h + (rest ? 0 : 24)
    if (!best || score < best.score) best = { id, score }
  }
  return best?.id ?? null
}

function autonomousUnits(w: World, s: SimState) {
  const units = Object.values(s.units).filter((u) => u.status !== 'distrutto' && !u.leg && u.nodeId)
  const defs = new Map(w.units.map((u) => [u.id, u]))
  const posture = (u: UnitState) => defs.get(u.id)?.posture ?? 'mobile'
  const autoRetreat = (u: UnitState) => defs.get(u.id)?.autoRetreat ?? true

  // Retreat.
  for (const u of units) {
    const lost = s.nodes[u.nodeId!].seized || areaStatusOf(w, s, u.nodeId!) === 'nemico'
    if (u.rally && u.morale >= 45) {
      u.rally = false
      log(s, 'good', `${u.name} si è riorganizzato.`, [u.id])
    }
    if (!autoRetreat(u) || !((u.morale < 20 && !u.rally) || lost)) continue
    const to = findRefuge(w, s, u)
    if (to && startMarch(w, s, u, to, true)) {
      log(s, 'bad', `${u.name} ${lost ? 'abbandona la posizione' : 'si ritira, morale a pezzi,'} e ripiega su ${w.name(to)}.`, [u.id, u.nodeId!], true)
      s.pending = s.pending.filter((p) => p.unitId !== u.id)
    }
  }

  // Reserves reinforce the weakest area under attack (one unit per area per turn).
  const threatened = w.areas
    .filter((a) => s.areas[a.id].attacked && s.areas[a.id].ratio < 0.5 && s.areas[a.id].status !== 'nemico')
    .sort((a, b) => s.areas[a.id].ratio - s.areas[b.id].ratio)
  for (const a of threatened) {
    const inside = new Set(w.buildingsIn.get(a.id)!.map((b) => b.id))
    const posts = [...inside].filter((id) => !s.nodes[id].seized)
    const target = posts.find((id) => w.buildingById.get(id)!.data.kind === 'schieramento') ?? posts[0]
    if (!target) continue
    let best: { u: UnitState; h: number } | null = null
    for (const u of units) {
      if (u.leg || posture(u) !== 'riserva' || inside.has(u.nodeId!) || u.morale < 40) continue
      const ua = w.areaOf.get(u.nodeId!)
      if (ua && s.areas[ua].attacked) continue
      const h = shortestPaths(w, u.nodeId!, marchCost(w, s, u.type, conditions(s)), 24).dist.get(target)
      if (h !== undefined && (!best || h < best.h)) best = { u, h }
    }
    if (best && startMarch(w, s, best.u, target, false)) log(s, 'info', `${best.u.name} (riserva) parte in rinforzo verso ${w.name(target)}.`, [best.u.id, target])
  }

  // Reserves go back to their post once their area has been quiet for a day.
  for (const u of units) {
    if (u.leg || posture(u) !== 'riserva' || !u.home || u.nodeId === u.home || u.rally) continue
    const ua = w.areaOf.get(u.nodeId!)
    u.quietTurns = ua && s.areas[ua].attacked ? 0 : u.quietTurns + 1
    if (u.quietTurns >= TURNS_PER_DAY && !s.nodes[u.home]?.seized && startMarch(w, s, u, u.home, false)) {
      u.quietTurns = 0
      log(s, 'info', `${u.name} (riserva) rientra a ${w.name(u.home)}.`, [u.id, u.home])
    }
  }

  // Engineers: repair what is broken next to them, otherwise dig in; mobile ones go where they are needed.
  const labour = PHASE_INFO[s.turn % TURNS_PER_DAY].labour
  for (const u of units) {
    if (u.type !== 'genieri' || u.leg || !u.nodeId) continue
    const broken = (w.adjacency.get(u.nodeId) ?? []).map((x) => x.route).find((r) => s.routes[r.id].destroyed)
    if (broken) {
      const rs = s.routes[broken.id]
      rs.repair += (u.men / 80) * 0.25 * labour
      if (rs.repair >= 1) {
        rs.destroyed = false
        rs.repair = 0
        log(s, 'good', `${u.name} ha ricostruito ${w.name(broken.id)}.`, [broken.id, u.id])
      }
      continue
    }
    const b = w.buildingById.get(u.nodeId)!
    const n = s.nodes[u.nodeId]
    if ((b.data.kind === 'schieramento' || b.data.kind === 'castello') && b.data.fortification + n.fortBonus < 3) {
      n.fortProgress += (u.men / 80) * 0.08 * labour
      if (n.fortProgress >= 1) {
        n.fortProgress = 0
        n.fortBonus++
        log(s, 'good', `${u.name} rafforza le difese di ${w.name(b.id)}.`, [b.id])
      }
      continue
    }
    if (posture(u) === 'fisso') continue
    const sp = shortestPaths(w, u.nodeId, marchCost(w, s, u.type, conditions(s)), 24)
    let target: { id: string; h: number } | null = null
    for (const r of w.routes) {
      if (!s.routes[r.id].destroyed) continue
      for (const end of [r.source, r.target]) {
        const h = sp.dist.get(end)
        if (h !== undefined && !s.nodes[end].seized && (!target || h < target.h)) target = { id: end, h }
      }
    }
    if (target && startMarch(w, s, u, target.id, false)) log(s, 'info', `${u.name} parte per riparare un percorso distrutto.`, [u.id])
  }
}

function orders(w: World, s: SimState) {
  const due = s.pending.filter((p) => p.turn <= s.turn)
  s.pending = s.pending.filter((p) => p.turn > s.turn)
  for (const p of due) {
    const u = s.units[p.unitId]
    if (!u || u.status === 'distrutto') continue
    if (u.leg) {
      // Already marching: re-plan from the next building on the way.
      u.nodeId = u.leg.nodes[Math.min(u.leg.idx + (u.leg.km > 0 ? 1 : 0), u.leg.nodes.length - 1)]
      u.leg = null
      u.prev = null
    }
    if (u.nodeId === p.nodeId) continue
    if (startMarch(w, s, u, p.nodeId, false)) log(s, 'info', `${u.name} in marcia verso ${w.name(p.nodeId)}.`, [u.id, p.nodeId])
    else log(s, 'warn', `${u.name} non trova una strada per ${w.name(p.nodeId)}.`, [u.id, p.nodeId])
  }
}

/** Automatic supply: every post orders what it lacks from the nearest store that has it. */
function dispatch(w: World, s: SimState) {
  const L = w.meta.logistics
  const c0 = conditions(s)
  const cap = L.cartCapacityKg
  let free = cartsTotal(w, s) - cartsBusy(s)
  if (free <= 0) return
  const targetTurns = L.targetDays * TURNS_PER_DAY
  const live = w.buildings.filter((b) => !s.nodes[b.id].seized)
  const reserve = new Map(live.map((b) => [b.id, reserveAt(w, s, b.id)]))
  const inbound = new Map<string, Stock>()
  for (const c of s.convoys) addTo(inbound.get(c.to) ?? inbound.set(c.to, emptyStock()).get(c.to)!, c.cargo)
  const surplus = new Map<string, Stock>()
  for (const b of live) {
    const n = s.nodes[b.id]
    const res = reserve.get(b.id)!
    const sp = emptyStock()
    for (const r of RESOURCES) sp[r] = n.burnedUntil >= s.turn && r !== 'acqua' ? 0 : Math.max(0, n.stock[r] - res[r] * targetTurns)
    surplus.set(b.id, sp)
  }
  const routeRoom = (id: string) => w.capacity(w.routeById.get(id)!) - s.routes[id].cartsThisTurn
  const send = (from: string, to: string, path: { nodes: string[]; edges: string[] }, cargo: Partial<Stock>, wounded: WoundedGroup[], carts: number) => {
    const n = s.nodes[from]
    addTo(n.stock, cargo, -1)
    for (const e of path.edges) {
      s.routes[e].cartsThisTurn += carts
      s.routes[e].kgThisTurn += stockKg(cargo) + wounded.reduce((x, g) => x + g.count, 0) * 80
    }
    s.convoys.push({ id: `c${s.nextId++}`, from, to, cargo, wounded, carts, departed: s.turn, leg: { nodes: path.nodes, edges: path.edges, idx: 0, km: 0 }, prev: { idx: 0, km: 0 } })
    free -= carts
  }
  const bottleneck = (edges: string[]) => Math.min(Infinity, ...edges.map(routeRoom))

  // 1. Wounded to hospitals.
  const hospitals = live.filter((b) => isHospital(b.data.kind))
  const bedsLeft = new Map(
    hospitals.map((h) => {
      const n = s.nodes[h.id]
      const coming = s.convoys.filter((c) => c.to === h.id).reduce((x, c) => x + c.wounded.reduce((m, g) => m + g.count, 0), 0)
      return [h.id, h.data.beds - n.patients.reduce((x, p) => x + p.count, 0) - coming]
    }),
  )
  for (const b of live) {
    const n = s.nodes[b.id]
    if (isHospital(b.data.kind) || !n.wounded.length || free <= 0) continue
    const sp = shortestPaths(w, b.id, cartCost(w, s, c0), L.maxTripHours)
    const h = hospitals.filter((x) => (bedsLeft.get(x.id) ?? 0) > 0 && sp.dist.has(x.id)).sort((x, y) => sp.dist.get(x.id)! - sp.dist.get(y.id)!)[0]
    if (!h) continue
    const path = pathTo(sp, b.id, h.id)!
    const room = Math.min(bedsLeft.get(h.id)!, free * WOUNDED_PER_CART, bottleneck(path.edges) * WOUNDED_PER_CART)
    if (room < 1) continue
    const groups: WoundedGroup[] = []
    let left = room
    for (const g of n.wounded) {
      if (left <= 0) break
      const k = Math.min(g.count, left)
      groups.push({ unitId: g.unitId, count: k })
      g.count -= k
      left -= k
    }
    n.wounded = n.wounded.filter((g) => g.count > 0)
    const men = groups.reduce((x, g) => x + g.count, 0)
    bedsLeft.set(h.id, bedsLeft.get(h.id)! - men)
    send(b.id, h.id, path, {}, groups, Math.ceil(men / WOUNDED_PER_CART))
  }

  // 2. Supplies, most urgent posts first.
  const needs = live
    .map((b) => {
      const res = reserve.get(b.id)!
      const n = s.nodes[b.id]
      const inc = inbound.get(b.id) ?? emptyStock()
      const need = emptyStock()
      let urgency = 1
      for (const r of RESOURCES) {
        const target = res[r] * targetTurns * TARGET_SHARE[r]
        if (target <= 0) continue
        need[r] = Math.max(0, target - n.stock[r] - inc[r])
        urgency = Math.min(urgency, (n.stock[r] + inc[r]) / target)
      }
      const attacked = w.areaOf.get(b.id) ? s.areas[w.areaOf.get(b.id)!].attacked : false
      return { id: b.id, need, score: b.data.priority - (attacked ? 1 : 0) + urgency }
    })
    .filter((x) => RESOURCES.some((r) => x.need[r] * RESOURCE_INFO[r].kg >= 100))
    .sort((a, b) => a.score - b.score)

  for (const c of needs) {
    if (free <= 0) break
    const sp = shortestPaths(w, c.id, cartCost(w, s, c0), L.maxTripHours)
    const nearby = [...sp.dist.entries()].filter(([id]) => id !== c.id && surplus.has(id)).sort((a, b) => a[1] - b[1])
    const bundles = new Map<string, Partial<Stock>>()
    // Storage room is shared among resources in proportion to what is missing.
    const room0 = freeKg(w, s, c.id) - stockKg(inbound.get(c.id) ?? {})
    const needKg = stockKg(c.need)
    for (const r of RESOURCES) {
      let want = c.need[r]
      if (want * RESOURCE_INFO[r].kg < 100) continue
      let room = needKg > 0 ? Math.min(want * RESOURCE_INFO[r].kg, (room0 * want * RESOURCE_INFO[r].kg) / needKg) : 0
      for (const [src] of nearby) {
        if (want <= 0 || room <= 0) break
        const avail = surplus.get(src)![r]
        if (avail <= 0) continue
        const k = Math.min(want, avail, room / RESOURCE_INFO[r].kg)
        if (k * RESOURCE_INFO[r].kg < 50) continue
        const b = bundles.get(src) ?? bundles.set(src, {}).get(src)!
        b[r] = (b[r] ?? 0) + k
        surplus.get(src)![r] -= k
        want -= k
        room -= k * RESOURCE_INFO[r].kg
      }
    }
    for (const [src, cargo] of bundles) {
      const path = pathTo(sp, c.id, src)!
      const fwd = { nodes: [...path.nodes].reverse(), edges: [...path.edges].reverse() }
      const kg = stockKg(cargo)
      let carts = Math.ceil(kg / cap)
      const limit = Math.min(free, bottleneck(fwd.edges))
      if (limit < 1) {
        for (const r of RESOURCES) surplus.get(src)![r] += cargo[r] ?? 0
        continue
      }
      if (carts > limit) {
        const k = (limit * cap) / kg
        for (const r of RESOURCES) if (cargo[r]) cargo[r]! *= k
        carts = Math.floor(limit)
      }
      send(src, c.id, fwd, cargo, [], carts)
    }
  }
}

// ---------------------------------------------------------------------------
// Statistics

function stats(w: World, s: SimState): TurnStats {
  const stock = emptyStock()
  for (const b of w.buildings) if (!s.nodes[b.id].seized) addTo(stock, s.nodes[b.id].stock)
  const units = Object.values(s.units).filter((u) => u.status !== 'distrutto')
  const men = units.reduce((x, u) => x + u.men, 0)
  const wounded = Object.values(s.nodes).reduce((x, n) => x + n.wounded.reduce((a, g) => a + g.count, 0) + n.patients.reduce((a, g) => a + g.count, 0), 0) +
    s.convoys.reduce((x, c) => x + c.wounded.reduce((a, g) => a + g.count, 0), 0)
  const moraleAvg = men ? units.reduce((x, u) => x + u.morale * u.men, 0) / men : 0
  const total = cartsTotal(w, s)
  return {
    turn: s.turn,
    stock,
    men,
    wounded,
    dead: s.dead,
    morale: moraleAvg,
    deliveredKg: s.deliveredKg,
    lostKg: s.lostKg,
    cartsTotal: total,
    cartsFree: Math.max(0, total - cartsBusy(s)),
    hungryUnits: units.filter((u) => u.fed < 0.8 || u.water < 0.8).length,
    enemyMen: Object.values(s.enemies).filter((e) => !e.routed && e.startTurn <= s.turn).reduce((x, e) => x + e.men, 0),
    control: Object.fromEntries(Object.entries(s.areas).map(([id, a]) => [id, a.control])),
    convoys: s.convoys.length,
  }
}

// ---------------------------------------------------------------------------
// Queries used by the UI

export function turnLabel(turn: number) {
  const day = Math.floor(turn / TURNS_PER_DAY) + 1
  return { day, phase: turn % TURNS_PER_DAY }
}

/** Stock a building would like to hold (per resource). */
export function targetStock(w: World, s: SimState, id: string): Stock {
  const res = reserveAt(w, s, id)
  const out = emptyStock()
  for (const r of RESOURCES) out[r] = res[r] * w.meta.logistics.targetDays * TURNS_PER_DAY * TARGET_SHARE[r]
  return out
}

/** Days the current stock of a building lasts at the current consumption (worst resource). */
export function nodeAutonomy(w: World, s: SimState, id: string): { days: number; resource: ResourceId | null } {
  const res = reserveAt(w, s, id)
  const n = s.nodes[id]
  let best = { days: Infinity, resource: null as ResourceId | null }
  for (const r of ['viveri', 'acqua', 'foraggio'] as const) {
    if (res[r] <= 0) continue
    const d = n.stock[r] / res[r] / TURNS_PER_DAY
    if (d < best.days) best = { days: d, resource: r }
  }
  return best
}

export { cartsTotal }
