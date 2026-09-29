import { useEffect } from 'react'
import { create } from 'zustand'
import { runChecks, type CheckResult } from '../engine/checks'
import type { SimEvent } from '../engine/events'
import { buildReport, type Report } from '../engine/report'
import { seedFrom } from '../engine/rng'
import { DEFAULT_PARAMS, runScenario, scenarioEvents, type ScenarioParams } from '../engine/scenarios'
import { applyEvent, initSim, step, type SimState } from '../engine/sim'
import { World } from '../engine/world'
import { projectOf, useStore } from '../store/store'
import { computeView, type LiveView } from './view'

/** Milliseconds per turn at each speed. */
export const SPEEDS = [
  { label: '½×', ms: 3200 },
  { label: '1×', ms: 1600 },
  { label: '2×', ms: 800 },
  { label: '4×', ms: 400 },
] as const

interface LiveState {
  /** null = planning mode (turn 0 not started yet). */
  sim: SimState | null
  running: boolean
  speed: number
  /** performance.now() when the current turn was computed: drives the convoy animation. */
  turnAt: number
  scenarioId: string
  params: ScenarioParams
  /** Show the steady-state flows on the map in planning mode. */
  showFlows: boolean
  showCritical: boolean
  /** Unit waiting for the user to click a destination. */
  ordering: string | null
  checks: CheckResult | null
  /** Structure of the battlefield (rebuilt on every project change). */
  world: World | null
  /** The running simulation, or the turn-0 preview in planning mode. */
  current: SimState | null
  view: LiveView | null
  reports: Report[]
  baselineIndex: number | null
  reportIndex: number | null
}

export const useLive = create<LiveState>()(() => ({
  sim: null,
  running: false,
  speed: 1,
  turnAt: 0,
  scenarioId: 'libera',
  params: DEFAULT_PARAMS,
  showFlows: true,
  showCritical: false,
  ordering: null,
  checks: null,
  world: null,
  current: null,
  view: null,
  reports: [],
  baselineIndex: null,
  reportIndex: null,
}))

const project = () => projectOf(useStore.getState())

function fresh(): SimState {
  const { scenarioId, params } = useLive.getState()
  const p = project()
  return initSim(p, seedFrom(params.seed), scenarioEvents(p, scenarioId, params))
}

export const live = {
  play: () => {
    const s = useLive.getState()
    useLive.setState({ sim: s.sim ?? fresh(), running: true, turnAt: performance.now() })
  },
  pause: () => useLive.setState({ running: false }),
  toggle: () => (useLive.getState().running ? live.pause() : live.play()),
  stepOnce: () => {
    const s = useLive.getState()
    const sim = step(project(), s.sim ?? fresh())
    useLive.setState({ sim, turnAt: performance.now() })
  },
  reset: () => useLive.setState({ sim: null, running: false, ordering: null }),
  setSpeed: (speed: number) => useLive.setState({ speed }),
  /** Apply a change to the situation right now (starts the simulation if needed). */
  act: (e: SimEvent) => {
    const s = useLive.getState()
    const sim = structuredClone(s.sim ?? fresh())
    applyEvent(new World(project()), sim, e)
    useLive.setState({ sim })
  },
  setScenario: (scenarioId: string) => useLive.setState({ scenarioId, sim: null, running: false }),
  setParams: (patch: Partial<ScenarioParams>) => useLive.setState((s) => ({ params: { ...s.params, ...patch }, sim: null, running: false })),
  runTest: () => {
    const { scenarioId, params, reports } = useLive.getState()
    const p = project()
    const report = buildReport(p, runScenario(p, scenarioId, params), scenarioId, params)
    const next = [...reports, report].slice(-8)
    useLive.setState((s) => ({
      reports: next,
      reportIndex: next.length - 1,
      baselineIndex: s.baselineIndex === null ? null : Math.max(0, s.baselineIndex - (reports.length + 1 - next.length)),
    }))
    useStore.getState().setView('rapporto')
    return report
  },
  setBaseline: (i: number | null) => useLive.setState({ baselineIndex: i }),
  showReport: (i: number) => useLive.setState({ reportIndex: i }),
}

/** Mounted once: advances turns while running, and keeps the static checks fresh. */
export function useLiveDriver() {
  const running = useLive((s) => s.running)
  const speed = useLive((s) => s.speed)
  const turnAt = useLive((s) => s.turnAt)
  const revision = useStore((s) => s.revision)

  useEffect(() => {
    if (!running) return
    const id = setTimeout(() => {
      const s = useLive.getState()
      if (!s.running || !s.sim) return
      useLive.setState({ sim: step(project(), s.sim), turnAt: performance.now() })
    }, SPEEDS[speed].ms)
    return () => clearTimeout(id)
  }, [running, speed, turnAt])

  useEffect(() => {
    const id = setTimeout(() => useLive.setState({ checks: runChecks(project()) }), 60)
    return () => clearTimeout(id)
  }, [revision])

  const sim = useLive((s) => s.sim)
  useEffect(() => {
    const p = project()
    const world = new World(p)
    const current = sim ?? initSim(p, 0)
    useLive.setState({ world, current, view: computeView(world, current) })
  }, [sim, revision])
}
