import { BUILDING_INFO, ROUTE_INFO, TURNS_PER_DAY } from '../model/catalog'
import type { ProjectState } from '../model/schema'
import type { ScheduledEvent } from './events'
import { analyzeFlows, type FlowAnalysis } from './flow'
import { stockKg } from './rates'
import { seedFrom } from './rng'
import { initSim, step, type SimState } from './sim'
import { World } from './world'

export type Intensity = 'bassa' | 'media' | 'alta'
export const INTENSITY: Record<Intensity, { label: string; k: number }> = {
  bassa: { label: 'Bassa', k: 0.6 },
  media: { label: 'Media', k: 1 },
  alta: { label: 'Alta', k: 1.6 },
}

export interface ScenarioParams {
  intensity: Intensity
  /** Day the enemy moves (1 = first day). */
  startDay: number
  /** Length of the test. */
  days: number
  seed: string
}

export const DEFAULT_PARAMS: ScenarioParams = { intensity: 'media', startDay: 1, days: 7, seed: 'keu' }

interface Ctx {
  w: World
  flow: FlowAnalysis
  p: ScenarioParams
  /** First turn of the enemy action: dawn of the start day. */
  t0: number
  k: number
  army: number
}

export interface ScenarioDef {
  id: string
  name: string
  description: string
  /** What the scenario tests, shown in the report. */
  tests: string
  build: (c: Ctx) => ScheduledEvent[]
}

// ---- Target selection: deterministic, from the steady-state analysis ----

function frontAreas(c: Ctx): string[] {
  const flagged = c.w.areas.filter((a) => a.data.front).map((a) => a.id)
  if (flagged.length) return flagged
  const withLine = c.w.areas.filter((a) => c.w.buildingsIn.get(a.id)!.some((b) => b.data.kind === 'schieramento')).map((a) => a.id)
  return withLine.length ? withLine : c.w.areas.slice(0, 1).map((a) => a.id)
}

function baseArea(c: Ctx): string | null {
  const b = c.w.buildings.find((x) => x.data.kind === 'castello') ?? c.w.buildings.find((x) => BUILDING_INFO[x.data.kind].command)
  return b ? c.w.areaOf.get(b.id) ?? null : null
}

function busiestRoutes(c: Ctx, n: number, filter: (id: string) => boolean = () => true): string[] {
  return [...c.flow.routeKg.entries()].filter(([id]) => filter(id)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([id]) => id)
}

function defenders(c: Ctx, areaId: string) {
  return c.w.buildingsIn.get(areaId)!.flatMap((b) => c.w.unitsAt(b.id)).reduce((s, u) => s + u.men, 0)
}

const men = (c: Ctx, share: number) => Math.max(100, Math.round((c.army * share * c.k) / 50) * 50)

// ---- Library ----

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'libera',
    name: 'Situazione libera',
    description: 'Nessun evento: agiscono solo le schiere nemiche disegnate sulla mappa.',
    tests: 'la tenuta della logistica a regime',
    build: () => [],
  },
  {
    id: 'raid',
    name: 'Razzie sulle linee',
    description: 'Cavalleria leggera nemica colpisce i tre percorsi più trafficati, poi torna due giorni dopo.',
    tests: 'la vulnerabilità delle linee di rifornimento e l’effetto delle scorte',
    build: (c) =>
      busiestRoutes(c, 3).flatMap((id, i) => [
        { turn: c.t0 + i, event: { type: 'raid', routeId: id, turns: 8, strength: Math.min(0.9, 0.45 * c.k) } },
        { turn: c.t0 + 2 * TURNS_PER_DAY + i, event: { type: 'raid', routeId: id, turns: 6, strength: Math.min(0.9, 0.5 * c.k) } },
      ]),
  },
  {
    id: 'frontale',
    name: 'Assalto frontale',
    description: 'Il grosso dell’esercito nemico attacca le aree del fronte e, se sfonda, avanza verso la base.',
    tests: 'la capacità di rifornire la prima linea sotto pressione, feriti e munizioni',
    build: (c) => {
      const fronts = frontAreas(c)
      return fronts.flatMap((a, i) => [
        { turn: c.t0, event: { type: 'attacco', areaId: a, men: men(c, 0.6 / fronts.length), unitType: 'fanteria', behavior: 'avanza', name: `Fanteria nemica ${i + 1}` } },
        { turn: c.t0 + 1, event: { type: 'attacco', areaId: a, men: men(c, 0.15 / fronts.length), unitType: 'arcieri', behavior: 'tieni', name: `Arcieri nemici ${i + 1}` } },
      ])
    },
  },
  {
    id: 'aggiramento',
    name: 'Aggiramento sul fianco',
    description: 'Una finta sul fronte mentre la cavalleria nemica colpisce l’area vicina meno difesa.',
    tests: 'le riserve, i tempi di reazione e la catena di comando',
    build: (c) => {
      const fronts = frontAreas(c)
      const base = baseArea(c)
      const flank = c.w.areas
        .map((a) => a.id)
        .filter((id) => !fronts.includes(id) && id !== base && c.w.areaById.get(id)!.data.control > 0)
        .filter((id) => fronts.some((f) => c.w.areaNeighbors(f).includes(id)))
        .sort((a, b) => defenders(c, a) - defenders(c, b) || a.localeCompare(b))[0]
      const out: ScheduledEvent[] = fronts.slice(0, 1).map((a) => ({ turn: c.t0, event: { type: 'attacco', areaId: a, men: men(c, 0.4), unitType: 'fanteria', behavior: 'tieni', name: 'Finta frontale' } }))
      const target = flank ?? fronts[fronts.length - 1]
      if (target) out.push({ turn: c.t0 + 1, event: { type: 'attacco', areaId: target, men: men(c, 0.25), unitType: 'cavalleria', behavior: 'avanza', name: 'Cavalleria di aggiramento' } })
      return out
    },
  },
  {
    id: 'sabotaggio',
    name: 'Sabotaggio',
    description: 'Infiltrati incendiano il magazzino più grande, avvelenano la fonte principale e distruggono il ponte più usato.',
    tests: 'la dipendenza da singoli magazzini, fonti e passaggi',
    build: (c) => {
      const out: ScheduledEvent[] = []
      const store = [...c.w.buildings].filter((b) => ['granaio', 'deposito', 'castello'].includes(b.data.kind)).sort((a, b) => stockKg(b.data.stock) - stockKg(a.data.stock))[0]
      if (store) out.push({ turn: c.t0, event: { type: 'incendio', nodeId: store.id } })
      const water = [...c.w.buildings].filter((b) => b.data.production.acqua > 0).sort((a, b) => b.data.production.acqua - a.data.production.acqua)[0]
      if (water) out.push({ turn: c.t0 + 1, event: { type: 'avvelena', nodeId: water.id, turns: Math.round(8 * c.k) } })
      const bridge = busiestRoutes(c, 1, (id) => ROUTE_INFO[c.w.routeById.get(id)!.data!.kind].destroyable)[0] ?? busiestRoutes(c, 1)[0]
      if (bridge) out.push({ turn: c.t0 + 2, event: { type: 'distruggi', routeId: bridge } })
      return out
    },
  },
  {
    id: 'maltempo',
    name: 'Maltempo',
    description: 'Tre giorni di pioggia (sterrati e guadi quasi impraticabili), poi nebbia.',
    tests: 'la dipendenza da strade non lastricate e i tempi di consegna',
    build: (c) => [
      { turn: c.t0, event: { type: 'meteo', weather: 'pioggia', turns: Math.round(12 * c.k) } },
      { turn: c.t0 + Math.round(12 * c.k), event: { type: 'meteo', weather: 'nebbia', turns: 4 } },
    ],
  },
  {
    id: 'epidemia',
    name: 'Epidemia al campo',
    description: 'Dissenteria nel luogo più affollato: malati da portare all’ospedale ogni turno.',
    tests: 'la capacità degli ospedali e dei carri per i feriti',
    build: (c) => {
      const crowd = [...c.w.buildings].sort((a, b) => c.w.unitsAt(b.id).reduce((s, u) => s + u.men, 0) - c.w.unitsAt(a.id).reduce((s, u) => s + u.men, 0))[0]
      return crowd ? [{ turn: c.t0, event: { type: 'epidemia', nodeId: crowd.id, turns: Math.round(16 * c.k) } }] : []
    },
  },
  {
    id: 'assedio',
    name: 'Blocco / assedio',
    description: 'Il nemico preme su tutte le aree attorno alla base e razzia ogni percorso che vi entra.',
    tests: 'l’autonomia delle scorte quando i rifornimenti esterni si interrompono',
    build: (c) => {
      const base = baseArea(c)
      if (!base) return []
      const around = c.w.areaNeighbors(base)
      const out: ScheduledEvent[] = around.map((a, i) => ({ turn: c.t0 + i, event: { type: 'attacco', areaId: a, men: men(c, 0.5 / Math.max(1, around.length)), unitType: 'fanteria', behavior: 'avanza', name: `Assedianti ${i + 1}` } }))
      for (const r of c.w.routes) {
        const areas = c.w.routeAreas(r)
        if (areas.includes(base) && areas.length > 1) out.push({ turn: c.t0, event: { type: 'raid', routeId: r.id, turns: c.p.days * TURNS_PER_DAY, strength: Math.min(0.9, 0.4 * c.k) } })
      }
      return out
    },
  },
  {
    id: 'campale',
    name: 'Battaglia campale completa',
    description: 'Assalto frontale, razzie sulle linee, pioggia dal secondo giorno e il ponte principale distrutto.',
    tests: 'l’intero sistema in condizioni realistiche',
    build: (c) => {
      const pick = (id: string) => SCENARIOS.find((s) => s.id === id)!.build(c)
      const out = [...pick('frontale'), ...pick('raid').slice(0, 2)]
      out.push({ turn: c.t0 + TURNS_PER_DAY, event: { type: 'meteo', weather: 'pioggia', turns: 6 } })
      const bridge = busiestRoutes(c, 1, (id) => ROUTE_INFO[c.w.routeById.get(id)!.data!.kind].destroyable)[0]
      if (bridge) out.push({ turn: c.t0 + 3, event: { type: 'distruggi', routeId: bridge } })
      return out
    },
  },
]

export function scenarioEvents(project: ProjectState, scenarioId: string, p: ScenarioParams): ScheduledEvent[] {
  const def = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]
  const w = new World(project)
  const flow = analyzeFlows(w)
  const army = project.units.reduce((s, u) => s + u.men, 0) || 1000
  const t0 = Math.max(1, (p.startDay - 1) * TURNS_PER_DAY + 1)
  return def.build({ w, flow, p, t0, k: INTENSITY[p.intensity].k, army }).sort((a, b) => a.turn - b.turn)
}

/** Runs a whole test headless. Same project + scenario + params = same result. */
export function runScenario(project: ProjectState, scenarioId: string, p: ScenarioParams): SimState {
  const w = new World(project)
  let s = initSim(project, seedFrom(p.seed), scenarioEvents(project, scenarioId, p))
  const turns = p.days * TURNS_PER_DAY
  for (let i = 0; i < turns; i++) s = step(project, s, [], w)
  return s
}
