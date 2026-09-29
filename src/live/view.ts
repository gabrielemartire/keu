import { UNIT_INFO, type AreaStatus } from '../model/catalog'
import { RESOURCES, type ResourceId, type Stock, type UnitType } from '../model/types'
import { nodeAutonomy, routeOpen, routeThreat, targetStock, type SimState, type UnitStatus } from '../engine/sim'
import type { World } from '../engine/world'

export interface UnitView {
  id: string
  name: string
  type: UnitType
  men: number
  morale: number
  status: UnitStatus
  fed: number
  water: number
  ammo: number
  marching: boolean
}

export interface BuildingView {
  stock: Stock
  /** stock / target, per resource (Infinity when not needed). */
  fill: Stock
  autonomyDays: number
  short: ResourceId | null
  wounded: number
  patients: number
  seized: boolean
  burned: boolean
  poisoned: boolean
  epidemic: boolean
  fortBonus: number
  units: UnitView[]
  cutOff: boolean
}

export interface AreaView {
  control: number
  status: AreaStatus
  attacked: boolean
  ratio: number
  raided: boolean
  /** Enemy forces standing in the area; `waiting` = camped there, not moving yet. */
  enemies: { id: string; name: string; type: UnitType; men: number; waiting: boolean }[]
}

export interface RouteView {
  open: boolean
  destroyed: boolean
  raided: boolean
  threat: number
  carts: number
  capacity: number
  repair: number
}

export interface LiveView {
  turn: number
  buildings: Record<string, BuildingView>
  areas: Record<string, AreaView>
  routes: Record<string, RouteView>
}

export function computeView(w: World, s: SimState): LiveView {
  const buildings: Record<string, BuildingView> = {}
  const unitsByNode = new Map<string, UnitView[]>()
  for (const u of Object.values(s.units)) {
    if (u.status === 'distrutto') continue
    const at = u.leg ? null : u.nodeId
    if (!at) continue
    const list = unitsByNode.get(at) ?? unitsByNode.set(at, []).get(at)!
    list.push({ id: u.id, name: u.name, type: u.type, men: u.men, morale: u.morale, status: u.status, fed: u.fed, water: u.water, ammo: UNIT_INFO[u.type].missile ? u.ammo : 1, marching: false })
  }
  for (const b of w.buildings) {
    const n = s.nodes[b.id]
    if (!n) continue
    const target = targetStock(w, s, b.id)
    const fill = {} as Stock
    for (const r of RESOURCES) fill[r] = target[r] > 0 ? n.stock[r] / target[r] : Infinity
    const auto = nodeAutonomy(w, s, b.id)
    buildings[b.id] = {
      stock: n.stock,
      fill,
      autonomyDays: auto.days,
      short: auto.resource,
      wounded: n.wounded.reduce((x, g) => x + g.count, 0),
      patients: n.patients.reduce((x, g) => x + g.count, 0),
      seized: n.seized,
      burned: n.burnedUntil >= s.turn,
      poisoned: n.poisonedUntil >= s.turn,
      epidemic: n.epidemicUntil >= s.turn,
      fortBonus: n.fortBonus,
      units: unitsByNode.get(b.id) ?? [],
      cutOff: !Number.isFinite(s.orderDelay[b.id] ?? 0),
    }
  }
  const areas: Record<string, AreaView> = {}
  for (const a of w.areas) {
    const st = s.areas[a.id]
    if (!st) continue
    areas[a.id] = {
      control: st.control,
      status: st.status,
      attacked: st.attacked,
      ratio: st.ratio,
      raided: st.raidUntil >= s.turn,
      enemies: Object.values(s.enemies)
        .filter((e) => e.at === a.id && !e.routed && e.men > 0 && (!e.march || e.march.arrived))
        .map((e) => ({ id: e.id, name: e.name, type: e.type, men: e.men, waiting: e.startTurn > s.turn || e.at !== e.target })),
    }
  }
  const routes: Record<string, RouteView> = {}
  for (const r of w.routes) {
    const st = s.routes[r.id]
    if (!st) continue
    routes[r.id] = {
      open: routeOpen(s, r.id),
      destroyed: st.destroyed,
      raided: st.raidUntil >= s.turn,
      threat: routeThreat(w, s, r),
      carts: st.cartsThisTurn,
      capacity: w.capacity(r),
      repair: st.repair,
    }
  }
  return { turn: s.turn, buildings, areas, routes }
}
