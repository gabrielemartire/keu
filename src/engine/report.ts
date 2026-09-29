import { BUILDING_INFO, TURNS_PER_DAY, UNIT_INFO } from '../model/catalog'
import type { ProjectState } from '../model/schema'
import { SCENARIOS, type ScenarioParams } from './scenarios'
import type { LogEntry, SimState, Tone } from './sim'
import { World } from './world'

export interface UnitRow {
  id: string
  name: string
  type: string
  menStart: number
  men: number
  killed: number
  wounded: number
  minMorale: number
  morale: number
  hungryTurns: number
  status: string
}

export interface Report {
  scenarioId: string
  scenarioName: string
  tests: string
  params: ScenarioParams
  createdAt: string
  verdict: string
  verdictTone: Tone
  verdictDetail: string
  firstBreak: LogEntry | null
  /** Days before the first failure (or the whole test). */
  holdDays: number
  days: number
  lostAreas: { id: string; name: string; turn: number }[]
  menStart: number
  menEnd: number
  dead: number
  woundedNow: number
  enemyDead: number
  deliveredT: number
  lostT: number
  capturedT: number
  minMorale: number
  hungryUnitTurns: number
  breaks: LogEntry[]
  units: UnitRow[]
  state: SimState
}

export function buildReport(project: ProjectState, s: SimState, scenarioId: string, params: ScenarioParams): Report {
  const w = new World(project)
  const def = SCENARIOS.find((x) => x.id === scenarioId) ?? SCENARIOS[0]
  const first = s.series[0]
  const last = s.series[s.series.length - 1]
  const breaks = s.log.filter((l) => l.breaking)
  const firstBreak = breaks[0] ?? null
  const lostAreas = Object.entries(s.areas)
    .filter(([id, a]) => a.lostAt !== null && w.areaById.get(id)!.data.control > -30)
    .map(([id, a]) => ({ id, name: w.name(id), turn: a.lostAt! }))
    .sort((a, b) => a.turn - b.turn)
  const units: UnitRow[] = Object.values(s.units).map((u) => {
    const def0 = project.units.find((x) => x.id === u.id)
    return {
      id: u.id,
      name: u.name,
      type: UNIT_INFO[u.type].label,
      menStart: def0?.men ?? u.men + u.killed + u.woundedTotal,
      men: u.status === 'distrutto' ? 0 : u.men,
      killed: u.killed,
      wounded: u.woundedTotal,
      minMorale: u.minMorale,
      morale: u.morale,
      hungryTurns: u.hungryTurns,
      status: u.status,
    }
  })
  const menStart = first?.men ?? 0
  const menEnd = last?.men ?? 0
  const commandLost = w.buildings.some((b) => BUILDING_INFO[b.data.kind].command && s.nodes[b.id]?.seized)
  const destroyed = units.filter((u) => u.status === 'distrutto').length
  const hungry = units.reduce((x, u) => x + u.hungryTurns, 0)

  let verdict = 'Tiene'
  let tone: Tone = 'good'
  let detail = 'Nessun cedimento: rifornimenti, sanità e fronte hanno retto per tutto il test.'
  if (commandLost || menEnd < menStart * 0.5) {
    verdict = 'Crollo'
    tone = 'bad'
    detail = commandLost ? 'Il comando è caduto in mano nemica.' : 'L’esercito ha perso più di metà degli uomini.'
  } else if (lostAreas.length || destroyed) {
    verdict = 'Cede'
    tone = 'bad'
    detail = `${lostAreas.length ? `${lostAreas.length} ${lostAreas.length === 1 ? 'area perduta' : 'aree perdute'}` : ''}${lostAreas.length && destroyed ? ', ' : ''}${destroyed ? `${destroyed} reparti annientati` : ''}.`
  } else if (breaks.length) {
    verdict = 'Regge con difficoltà'
    tone = 'warn'
    detail = `${breaks.length} ${breaks.length === 1 ? 'cedimento logistico' : 'cedimenti logistici'} durante il test.`
  }

  return {
    scenarioId,
    scenarioName: def.name,
    tests: def.tests,
    params,
    createdAt: new Date().toISOString(),
    verdict,
    verdictTone: tone,
    verdictDetail: detail,
    firstBreak,
    holdDays: firstBreak ? firstBreak.turn / TURNS_PER_DAY : params.days,
    days: params.days,
    lostAreas,
    menStart,
    menEnd,
    dead: s.dead,
    woundedNow: last?.wounded ?? 0,
    enemyDead: s.enemyDead,
    deliveredT: s.deliveredKg / 1000,
    lostT: s.lostKg / 1000,
    capturedT: s.capturedKg / 1000,
    minMorale: Math.min(100, ...units.map((u) => u.minMorale)),
    hungryUnitTurns: hungry,
    breaks,
    units,
    state: s,
  }
}

/** Rows compared between two reports: label, value, "better when" direction. */
export const COMPARE_ROWS: { label: string; get: (r: Report) => number; better: 'up' | 'down'; digits?: number; unit?: string }[] = [
  { label: 'Giorni prima del primo cedimento', get: (r) => r.holdDays, better: 'up', digits: 1, unit: 'gg' },
  { label: 'Aree perdute', get: (r) => r.lostAreas.length, better: 'down' },
  { label: 'Uomini a fine test', get: (r) => r.menEnd, better: 'up' },
  { label: 'Morti', get: (r) => r.dead, better: 'down' },
  { label: 'Morale minimo', get: (r) => r.minMorale, better: 'up' },
  { label: 'Turni-reparto senza viveri/acqua', get: (r) => r.hungryUnitTurns, better: 'down' },
  { label: 'Consegnato', get: (r) => r.deliveredT, better: 'up', digits: 1, unit: 't' },
  { label: 'Perso o catturato', get: (r) => r.lostT + r.capturedT, better: 'down', digits: 1, unit: 't' },
  { label: 'Perdite nemiche', get: (r) => r.enemyDead, better: 'up' },
]
