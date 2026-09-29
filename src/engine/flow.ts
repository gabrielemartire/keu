import { areaStatus, BUILDING_INFO, RESOURCE_INFO, TURN_HOURS, TURNS_PER_DAY } from '../model/catalog'
import { emptyStock } from '../model/factory'
import { RESOURCES, type ResourceId, type RouteEdge, type Stock } from '../model/types'
import { addTo, avgProduction, avgRecipeInput, garrisonTroop, reserveRate, troopNeeds, type Troop } from './rates'
import { cartKmh, CLEAR_DAY, pathTo, shortestPaths, World, type Path } from './world'

/**
 * Steady-state picture of the logistics, before any simulation:
 * who needs what, who supplies it, along which routes and with how many carts.
 */

export interface Flow {
  from: string
  to: string
  resource: ResourceId
  /** Units of the resource per turn. */
  perTurn: number
  kgPerTurn: number
  hours: number
  path: Path
}

export interface NodeBalance {
  consumption: Stock
  production: Stock
  /** Consumption not covered by local production, per turn. */
  deficit: Stock
  /** Days the local stock lasts on its own (per resource). */
  autonomy: Stock
}

export interface FlowAnalysis {
  world: World
  balance: Map<string, NodeBalance>
  flows: Flow[]
  /** Resource needed at a building but no reachable supplier. */
  unmet: { nodeId: string; resource: ResourceId; perTurn: number }[]
  /** kg per turn over each route. */
  routeKg: Map<string, number>
  /** Carts per turn entering each route. */
  routeCarts: Map<string, number>
  cartsNeeded: number
  cartsAvailable: number
  totals: { stock: Stock; production: Stock; consumption: Stock; autonomyDays: Stock }
}

/** Troops that are stationed at a building at turn 0 (units + garrison). */
export function troopsAt(w: World, nodeId: string): Troop[] {
  const b = w.buildingById.get(nodeId)
  const out: Troop[] = w.unitsAt(nodeId).map((u) => ({ type: u.type, men: u.men, horses: u.horses }))
  if (b && b.data.garrison > 0) out.push(garrisonTroop(b.data.garrison))
  return out
}

export function cartHours(w: World) {
  return (r: RouteEdge) => w.routeKm.get(r.id)! / cartKmh(r, CLEAR_DAY)
}

/** Buildings in an area held by the enemy at turn 0 cannot trade. */
export function initiallyLost(w: World, nodeId: string) {
  const a = w.areaOf.get(nodeId)
  return !!a && areaStatus(w.areaById.get(a)!.data.control) === 'nemico'
}

export function analyzeFlows(w: World): FlowAnalysis {
  const cap = w.meta.logistics.cartCapacityKg
  const hours = cartHours(w)
  const balance = new Map<string, NodeBalance>()
  const totals = { stock: emptyStock(), production: emptyStock(), consumption: emptyStock(), autonomyDays: emptyStock() }

  for (const b of w.buildings) {
    if (initiallyLost(w, b.id)) continue
    const consumption = emptyStock()
    for (const t of troopsAt(w, b.id)) addTo(consumption, troopNeeds(t))
    addTo(consumption, avgRecipeInput(b.data))
    const production = avgProduction(b.data)
    const deficit = emptyStock()
    const autonomy = emptyStock()
    for (const r of RESOURCES) {
      deficit[r] = Math.max(0, consumption[r] - production[r])
      autonomy[r] = deficit[r] > 0 ? b.data.stock[r] / deficit[r] / TURNS_PER_DAY : Infinity
    }
    balance.set(b.id, { consumption, production, deficit, autonomy })
    addTo(totals.stock, b.data.stock)
    addTo(totals.production, production)
    addTo(totals.consumption, consumption)
  }
  for (const r of RESOURCES) {
    const net = totals.consumption[r] - totals.production[r]
    totals.autonomyDays[r] = net > 0 ? totals.stock[r] / net / TURNS_PER_DAY : Infinity
  }

  // Suppliers: first the sustainable surplus of producers (limited rate), then
  // buildings holding stock beyond their own reserve (finite, but any rate).
  const days = w.meta.logistics.targetDays
  const rateLeft = new Map([...balance].map(([id, bal]) => {
    const s = emptyStock()
    for (const r of RESOURCES) s[r] = Math.max(0, bal.production[r] - bal.consumption[r])
    return [id, s]
  }))
  const holdsStock = (id: string, r: ResourceId) => {
    const b = w.buildingById.get(id)!
    const reserve = troopsAt(w, id).reduce((s, t) => s + reserveRate(t)[r], 0) * days * TURNS_PER_DAY
    return b.data.stock[r] > reserve + 1
  }

  const passable = (r: RouteEdge) => (initiallyLost(w, r.source) || initiallyLost(w, r.target) ? Infinity : hours(r))
  const flows: Flow[] = []
  const unmet: FlowAnalysis['unmet'] = []
  const consumers = [...balance.entries()].sort((a, b) => w.buildingById.get(a[0])!.data.priority - w.buildingById.get(b[0])!.data.priority)
  for (const [id, bal] of consumers) {
    const need = RESOURCES.filter((r) => bal.deficit[r] > 0.01)
    if (!need.length) continue
    const sp = shortestPaths(w, id, passable)
    const reachable = [...sp.dist.entries()].filter(([n]) => n !== id && balance.has(n)).sort((a, b) => a[1] - b[1])
    const add = (src: string, h: number, r: ResourceId, perTurn: number) => {
      // Path is found from the consumer: reverse it so it reads supplier → consumer.
      const p = pathTo(sp, id, src)!
      flows.push({ from: src, to: id, resource: r, perTurn, kgPerTurn: perTurn * RESOURCE_INFO[r].kg, hours: h, path: { nodes: [...p.nodes].reverse(), edges: [...p.edges].reverse() } })
    }
    for (const r of need) {
      let left = bal.deficit[r]
      for (const [src, h] of reachable) {
        if (left <= 0.01) break
        const avail = rateLeft.get(src)![r]
        if (avail <= 0.01) continue
        const k = Math.min(left, avail)
        rateLeft.get(src)![r] -= k
        left -= k
        add(src, h, r, k)
      }
      if (left > 0.01) {
        const stock = reachable.find(([n]) => holdsStock(n, r))
        if (stock) add(stock[0], stock[1], r, left)
        // A base living off its own stores is not cut off: its autonomy says how long it lasts.
        else if (!holdsStock(id, r)) unmet.push({ nodeId: id, resource: r, perTurn: left })
      }
    }
  }

  const routeKg = new Map<string, number>()
  for (const f of flows) for (const e of f.path.edges) routeKg.set(e, (routeKg.get(e) ?? 0) + f.kgPerTurn)
  const routeCarts = new Map([...routeKg].map(([k, v]) => [k, v / cap]))
  // A cart is busy for the round trip: departures per turn × turns away.
  const cartsNeeded = flows.reduce((s, f) => s + (f.kgPerTurn / cap) * Math.max(1, Math.ceil((2 * f.hours) / TURN_HOURS)), 0)
  const cartsAvailable = w.buildings.filter((b) => !initiallyLost(w, b.id)).reduce((s, b) => s + b.data.carts, 0)

  return { world: w, balance, flows, unmet, routeKg, routeCarts, cartsNeeded, cartsAvailable, totals }
}

export const isCommandPost = (w: World, id: string) => !!BUILDING_INFO[w.buildingById.get(id)!.data.kind].command
