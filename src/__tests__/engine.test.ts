import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '../model/templates'
import { runChecks } from '../engine/checks'
import { initSim, step } from '../engine/sim'
import { runScenario, SCENARIOS, DEFAULT_PARAMS } from '../engine/scenarios'
import { buildReport } from '../engine/report'
import { World } from '../engine/world'

const demo = () => TEMPLATES.find((t) => t.id === 'demo')!.build()

describe('engine on the demo battlefield', () => {
  it('static checks run', () => {
    const r = runChecks(demo())
    console.log(r.issues.map((i) => `${i.severity} ${i.message}`).join('\n'))
    console.log('carts', r.flow.cartsNeeded.toFixed(1), '/', r.flow.cartsAvailable, 'flows', r.flow.flows.length)
    expect(r.counts.error).toBe(0)
  })

  it('live simulation moves supplies', () => {
    const p = demo()
    const w = new World(p)
    let s = initSim(p, 1)
    for (let i = 0; i < 28; i++) s = step(p, s, [], w)
    const last = s.series[s.series.length - 1]
    console.log(s.log.slice(0, 60).map((l) => `${l.turn} ${l.tone} ${l.text}`).join('\n'))
    console.log('delivered t', (s.deliveredKg / 1000).toFixed(1), 'men', last.men, 'morale', last.morale.toFixed(0), 'hungry', last.hungryUnits, 'dead', s.dead, 'control', JSON.stringify(last.control))
    expect(s.deliveredKg).toBeGreaterThan(0)
  })

  it('scenarios are deterministic and produce reports', () => {
    const p = demo()
    for (const sc of SCENARIOS) {
      const a = runScenario(p, sc.id, DEFAULT_PARAMS)
      const b = runScenario(p, sc.id, DEFAULT_PARAMS)
      expect(JSON.stringify(a.series)).toBe(JSON.stringify(b.series))
      const r = buildReport(p, a, sc.id, DEFAULT_PARAMS)
      console.log(sc.id.padEnd(12), r.verdict.padEnd(22), 'hold', r.holdDays.toFixed(1), 'men', r.menStart, '→', r.menEnd, 'dead', r.dead, 'lost areas', r.lostAreas.length, 'first:', r.firstBreak?.text ?? '-')
    }
  })
})
