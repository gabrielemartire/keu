import { nextRandom, seedFrom } from '../engine/rng'
import { createAreaNode, createBuildingNode, createMeta } from './factory'
import type { ProjectState } from './schema'
import type { AreaNode, BuildingNode, Terrain } from './types'

/**
 * Exercise: a generated battlefield. Only the ground is fixed (areas, terrain, the river,
 * the enemy lands on the east edge); the player builds the whole logistics on it and then
 * throws enemy attacks at it from the Test panel or with the right click.
 */

const COLS = 4
const ROWS = 3
const CELL = { w: 560, h: 330, gapX: 150, gapY: 110 }

const NAMES: Record<Terrain, string[]> = {
  pianura: ['Piana di Vallerana', 'Campi di Sorbo', 'Piana dei Mulini', 'Prati di Castagneto', 'Piana di San Lazzaro', 'Campi della Pieve'],
  collina: ['Colle di Montorio', 'Poggio Aguzzo', 'Colle del Corvo', 'Poggio dei Frati', 'Colline di Sant’Agata'],
  altura: ['Rocca Nera', 'Monte Calvo', 'Sassi Grossi', 'Costa Pietrosa', 'Balze del Lupo'],
  bosco: ['Bosco di Farneto', 'Selva Oscura', 'Bosco del Cerro', 'Macchia Grande', 'Bosco delle Querce'],
  palude: ['Palude di Canneto', 'Acquitrini del Mulino', 'Pantano Lungo', 'Palude dei Giunchi'],
  fiume: ['Fiume Sarre', 'Guado del Salice', 'Ansa del Sarre', 'Greto del Sarre'],
}
const CASTLES = ['Montalto', 'Roccabruna', 'Castelvecchio', 'Monteferro', 'Torre Alfina', 'Castelguido']
const ENEMIES = ['Terre del Marchese', 'Campo del Duca', 'Terre del Conte di Valmora', 'Accampamento imperiale']

export function randomSeed() {
  return Math.random().toString(36).slice(2, 7).toUpperCase()
}

export function generateExercise(seed: string): ProjectState {
  const rng = { rng: seedFrom(seed) }
  const rand = () => nextRandom(rng)
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)]
  const used = new Set<string>()
  const nameFor = (t: Terrain) => {
    const free = NAMES[t].filter((n) => !used.has(n))
    const n = free.length ? pick(free) : `${pick(NAMES[t])} ${used.size}`
    used.add(n)
    return n
  }
  const terrainRoll = (): Terrain => {
    const r = rand()
    return r < 0.32 ? 'pianura' : r < 0.55 ? 'collina' : r < 0.78 ? 'bosco' : r < 0.9 ? 'altura' : 'palude'
  }

  // The river runs north–south through column 1 or 2, drifting by one column at most.
  let riverCol = 1 + Math.floor(rand() * 2)
  const river: number[] = []
  for (let r = 0; r < ROWS; r++) {
    river.push(riverCol)
    if (rand() < 0.35) riverCol = Math.max(1, Math.min(2, riverCol + (rand() < 0.5 ? -1 : 1)))
  }
  const baseRow = Math.floor(rand() * ROWS)

  const nodes: (AreaNode | BuildingNode)[] = []
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const isBase = c === 0 && r === baseRow
      const isRiver = river[r] === c
      // A couple of empty cells make every map a little different (never the base, river or front).
      if (!isBase && !isRiver && c > 0 && c < COLS - 1 && rand() < 0.15) continue
      const terrain: Terrain = isBase ? (rand() < 0.5 ? 'collina' : 'pianura') : isRiver ? 'fiume' : terrainRoll()
      const w = isRiver ? CELL.w - 80 : CELL.w - Math.floor(rand() * 90)
      const h = CELL.h - Math.floor(rand() * 70)
      const x = c * (CELL.w + CELL.gapX) + Math.floor(rand() * 50)
      const y = r * (CELL.h + CELL.gapY) + Math.floor(rand() * 40)
      const name = isBase ? `Castello di ${pick(CASTLES)}` : nameFor(terrain)
      const area = createAreaNode(nodes.filter((n) => n.type === 'area').length, { x, y }, { name, terrain, front: c === COLS - 1, locked: true }, { width: w, height: h })
      nodes.push(area)
      if (isBase) {
        nodes.push(createBuildingNode('castello', { x: Math.round(w / 2 - 98), y: Math.round(h / 2 - 20) }, { name }, area.id))
      }
    }
  }
  // Enemy lands along the whole east edge.
  const ex = COLS * (CELL.w + CELL.gapX) + 60
  const enemyLand = createAreaNode(nodes.filter((n) => n.type === 'area').length, { x: ex, y: 0 }, { name: pick(ENEMIES), terrain: 'pianura', control: -100, locked: true, color: '#8e2c23', notes: 'Territorio nemico: le schiere partono da qui.' }, { width: 460, height: ROWS * (CELL.h + CELL.gapY) - CELL.gapY + 40 })
  nodes.unshift(enemyLand)

  return {
    meta: createMeta({
      name: `Esercitazione ${seed}`,
      description: `Terreno generato (seme ${seed}): aree, fiume e territorio nemico sono fissi. Costruisci la tua logistica — magazzini, villaggi, strade, ponti, reparti — poi lancia gli attacchi dal pannello Test o col tasto destro su un’area e guarda come regge.`,
    }),
    nodes: [...nodes.filter((n) => n.type === 'area'), ...nodes.filter((n) => n.type !== 'area')],
    edges: [],
    units: [],
    enemies: [],
  }
}
