import { describe, expect, it } from 'vitest'
import { generateExercise } from '../model/exercise'
import { createBuildingNode, createEnemy, createRouteEdge, createUnit } from '../model/factory'
import { seedFrom } from '../engine/rng'
import { initSim, step } from '../engine/sim'
import type { AreaNode } from '../model/types'

const strip = (p: ReturnType<typeof generateExercise>) => p.nodes.map((n) => ({ type: n.type, pos: n.position, data: n.data.name }))

describe('exercise', () => {
  it('same seed, same ground; ground is locked with an enemy land', () => {
    expect(strip(generateExercise('ABC12'))).toEqual(strip(generateExercise('ABC12')))
    expect(strip(generateExercise('ABC12'))).not.toEqual(strip(generateExercise('ZZZ99')))
    const p = generateExercise('ABC12')
    const areas = p.nodes.filter((n): n is AreaNode => n.type === 'area')
    expect(areas.every((a) => a.data.locked)).toBe(true)
    expect(areas.filter((a) => a.data.control <= -50)).toHaveLength(1)
    expect(areas.some((a) => a.data.terrain === 'fiume')).toBe(true)
    expect(p.nodes.some((n) => n.type === 'building' && n.data.kind === 'castello')).toBe(true)
  })

  it('an enemy force marches from its camp to the target, then fights there', () => {
    const p = generateExercise('ABC12')
    const areas = p.nodes.filter((n): n is AreaNode => n.type === 'area')
    const enemyLand = areas.find((a) => a.data.control < 0)!
    const front = areas.find((a) => a.data.front)!
    const post = createBuildingNode('schieramento', { x: 100, y: 100 }, {}, front.id)
    const castle = p.nodes.find((n) => n.type === 'building')!
    p.nodes.push(post)
    p.edges.push(createRouteEdge(castle.id, post.id))
    p.units.push(createUnit('fanteria', post.id, { men: 300 }))
    p.enemies.push(createEnemy({ originAreaId: enemyLand.id, targetAreaId: front.id, men: 2000, startTurn: 1 }))
    let s = initSim(p, seedFrom('t'))
    const e = () => Object.values(s.enemies)[0]
    expect(e().at).toBe(enemyLand.id)
    s = step(p, s)
    expect(e().march?.to).toBe(front.id)
    let turns = 1
    while (e().at !== front.id && turns < 20) {
      s = step(p, s)
      turns++
    }
    expect(e().at).toBe(front.id)
    s = step(p, s)
    s = step(p, s)
    expect(s.areas[front.id].control).toBeLessThan(100)
  })
})
