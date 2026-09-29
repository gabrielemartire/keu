import { BUILDING_INFO, CART_KMH, PHASE_INFO, ROUTE_INFO, UNIT_INFO, type Weather } from '../model/catalog'
import type { ProjectState } from '../model/schema'
import { BUILDING_SIZE, type AreaNode, type BuildingNode, type MapNode, type RouteEdge, type UnitDef, type UnitType } from '../model/types'

export interface Adj {
  neighbor: string
  route: RouteEdge
}

export interface Path {
  nodes: string[]
  edges: string[]
}

/** Read-only structure of the battlefield, rebuilt whenever the project changes. */
export class World {
  readonly buildings: BuildingNode[]
  readonly areas: AreaNode[]
  readonly routes: RouteEdge[] = []
  readonly units: UnitDef[]
  readonly buildingById = new Map<string, BuildingNode>()
  readonly areaById = new Map<string, AreaNode>()
  readonly routeById = new Map<string, RouteEdge>()
  readonly areaOf = new Map<string, string | null>()
  readonly center = new Map<string, { x: number; y: number }>()
  /** Centre of each area (canvas coordinates): where enemy forces stand and march to. */
  readonly areaCenter = new Map<string, { x: number; y: number }>()
  readonly adjacency = new Map<string, Adj[]>()
  readonly routeKm = new Map<string, number>()
  readonly buildingsIn = new Map<string, BuildingNode[]>()

  constructor(readonly state: ProjectState) {
    const nodes = state.nodes
    this.buildings = nodes.filter((n): n is BuildingNode => n.type === 'building')
    this.areas = nodes.filter((n): n is AreaNode => n.type === 'area')
    this.units = state.units
    for (const a of this.areas) {
      this.areaById.set(a.id, a)
      this.buildingsIn.set(a.id, [])
      this.areaCenter.set(a.id, { x: a.position.x + (a.width ?? 520) / 2, y: a.position.y + (a.height ?? 300) / 2 })
    }
    for (const b of this.buildings) {
      this.buildingById.set(b.id, b)
      this.adjacency.set(b.id, [])
      const parent = b.parentId ? this.areaById.get(b.parentId) : undefined
      this.areaOf.set(b.id, parent?.id ?? null)
      if (parent) this.buildingsIn.get(parent.id)!.push(b)
      const p = absolutePosition(b, nodes)
      this.center.set(b.id, { x: p.x + BUILDING_SIZE.width / 2, y: p.y + BUILDING_SIZE.height / 2 })
    }
    for (const r of state.edges) {
      if (!r.data || !this.buildingById.has(r.source) || !this.buildingById.has(r.target) || r.source === r.target) continue
      this.routes.push(r)
      this.routeById.set(r.id, r)
      this.adjacency.get(r.source)!.push({ neighbor: r.target, route: r })
      this.adjacency.get(r.target)!.push({ neighbor: r.source, route: r })
      this.routeKm.set(r.id, r.data.lengthKm ?? this.mapKm(r.source, r.target))
    }
  }

  get meta() {
    return this.state.meta
  }

  mapKm(a: string, b: string) {
    const p = this.center.get(a)!
    const q = this.center.get(b)!
    return Math.max(0.3, Math.round(Math.hypot(p.x - q.x, p.y - q.y) * this.state.meta.logistics.kmPerPx * 10) / 10)
  }

  /** Cross-country distance between two areas, km (enemies do not need our roads). */
  areaKm(a: string, b: string) {
    const p = this.areaCenter.get(a)
    const q = this.areaCenter.get(b)
    if (!p || !q) return 0
    return Math.max(0.5, Math.hypot(p.x - q.x, p.y - q.y) * this.state.meta.logistics.kmPerPx)
  }

  /** Enemy-held area closest to `areaId`: where a new attack comes from. */
  enemyBaseNear(areaId: string): string | null {
    const held = this.areas.filter((a) => a.id !== areaId && a.data.control <= -50)
    held.sort((x, y) => this.areaKm(x.id, areaId) - this.areaKm(y.id, areaId) || x.id.localeCompare(y.id))
    return held[0]?.id ?? null
  }

  name(id: string): string {
    const b = this.buildingById.get(id)
    if (b) return b.data.name || BUILDING_INFO[b.data.kind].label
    const a = this.areaById.get(id)
    if (a) return a.data.name
    const r = this.routeById.get(id)
    if (r) return r.data!.name || `${this.name(r.source)} – ${this.name(r.target)}`
    return '?'
  }

  capacity(route: RouteEdge) {
    return route.data!.capacity ?? ROUTE_INFO[route.data!.kind].capacity
  }

  /** Areas touched by a route (one or two). */
  routeAreas(route: RouteEdge): string[] {
    const out = new Set<string>()
    for (const id of [route.source, route.target]) {
      const a = this.areaOf.get(id)
      if (a) out.add(a)
    }
    return [...out]
  }

  /** Areas connected to `areaId` by at least one route. */
  areaNeighbors(areaId: string): string[] {
    const out = new Set<string>()
    for (const r of this.routes) {
      const a = this.areaOf.get(r.source)
      const b = this.areaOf.get(r.target)
      if (a && b && a !== b) {
        if (a === areaId) out.add(b)
        if (b === areaId) out.add(a)
      }
    }
    return [...out]
  }

  unitsAt(nodeId: string) {
    return this.units.filter((u) => u.nodeId === nodeId)
  }
}

export function absolutePosition(node: MapNode, nodes: MapNode[]) {
  if (!node.parentId) return node.position
  const parent = nodes.find((n) => n.id === node.parentId)
  return parent ? { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y } : node.position
}

export interface Conditions {
  weather: Weather
  phase: number
}

export const CLEAR_DAY: Conditions = { weather: 'sereno', phase: 1 }

/** km/h of a cart convoy on a route. */
export function cartKmh(route: RouteEdge, c: Conditions) {
  const info = ROUTE_INFO[route.data!.kind]
  return CART_KMH * info.speed * (c.weather === 'pioggia' ? info.rain : 1) * PHASE_INFO[c.phase].cart
}

/** km/h of a marching unit on a route. */
export function marchKmh(route: RouteEdge, type: UnitType, c: Conditions) {
  const info = ROUTE_INFO[route.data!.kind]
  // Troops are less bound to the road surface than carts.
  const surface = 0.5 + info.speed / 2
  return UNIT_INFO[type].marchKmh * surface * (c.weather === 'pioggia' ? 0.5 + info.rain / 2 : 1) * PHASE_INFO[c.phase].march
}

export interface ShortestPaths {
  dist: Map<string, number>
  prev: Map<string, { node: string; route: string }>
}

/** Dijkstra from `from`; `cost` returns hours to cross a route (Infinity = impassable). */
export function shortestPaths(w: World, from: string, cost: (r: RouteEdge, from: string, to: string) => number, maxHours = Infinity): ShortestPaths {
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, { node: string; route: string }>()
  const done = new Set<string>()
  // Graphs are small (tens of nodes): a linear scan beats a heap here.
  const open = new Set([from])
  while (open.size) {
    let cur = ''
    let best = Infinity
    for (const id of open) {
      const d = dist.get(id)!
      if (d < best) {
        best = d
        cur = id
      }
    }
    open.delete(cur)
    done.add(cur)
    for (const { neighbor, route } of w.adjacency.get(cur) ?? []) {
      if (done.has(neighbor)) continue
      const h = cost(route, cur, neighbor)
      if (!Number.isFinite(h)) continue
      const nd = best + h
      if (nd > maxHours) continue
      if (nd < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, nd)
        prev.set(neighbor, { node: cur, route: route.id })
        open.add(neighbor)
      }
    }
  }
  return { dist, prev }
}

export function pathTo(sp: ShortestPaths, from: string, to: string): Path | null {
  if (!sp.dist.has(to)) return null
  const nodes = [to]
  const edges: string[] = []
  let n = to
  while (n !== from) {
    const p = sp.prev.get(n)
    if (!p) return null
    edges.unshift(p.route)
    nodes.unshift(p.node)
    n = p.node
  }
  return { nodes, edges }
}

/** Routes and buildings whose loss splits the network (Tarjan bridges + articulation points). */
export function criticalPoints(w: World): { nodes: Set<string>; routes: Set<string> } {
  const disc = new Map<string, number>()
  const low = new Map<string, number>()
  const nodes = new Set<string>()
  const routes = new Set<string>()
  let time = 0
  const visit = (u: string, parentRoute: string | null) => {
    disc.set(u, time)
    low.set(u, time)
    time++
    let children = 0
    for (const { neighbor: v, route } of w.adjacency.get(u) ?? []) {
      if (route.id === parentRoute) continue
      if (!disc.has(v)) {
        children++
        visit(v, route.id)
        low.set(u, Math.min(low.get(u)!, low.get(v)!))
        if (low.get(v)! > disc.get(u)!) routes.add(route.id)
        if (parentRoute !== null && low.get(v)! >= disc.get(u)!) nodes.add(u)
      } else {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!))
      }
    }
    if (parentRoute === null && children > 1) nodes.add(u)
  }
  for (const b of w.buildings) if (!disc.has(b.id)) visit(b.id, null)
  // Parallel routes between the same two buildings are never bridges.
  for (const id of [...routes]) {
    const r = w.routeById.get(id)!
    const twins = w.routes.filter((x) => (x.source === r.source && x.target === r.target) || (x.source === r.target && x.target === r.source))
    if (twins.length > 1) routes.delete(id)
  }
  return { nodes, routes }
}
