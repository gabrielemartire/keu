import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '../model/templates'
import { runChecks } from '../engine/checks'
import { DEFAULT_PARAMS, runScenario } from '../engine/scenarios'

describe('demo battles', () => {
  for (const t of TEMPLATES.filter((x) => x.group === 'demo')) {
    it(`${t.name}: no blocking errors, supplies move`, () => {
      const p = t.build()
      expect(runChecks(p).counts.error).toBe(0)
      const s = runScenario(p, 'libera', { ...DEFAULT_PARAMS, days: 4 })
      expect(s.deliveredKg).toBeGreaterThan(0)
    })
  }
})
