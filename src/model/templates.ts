import { createAreaNode, createBuildingNode, createEnemy, createMeta, createRouteEdge, createUnit } from './factory'
import { generateExercise, randomSeed } from './exercise'
import type { ProjectState } from './schema'
import type { AreaData, AreaNode, BuildingData, BuildingKind, BuildingNode, RouteData, RouteEdge, UnitDef } from './types'

export interface Template {
  id: string
  name: string
  description: string
  /** 'modo' = how to start; 'demo' = ready-made examples. */
  group: 'modo' | 'demo'
  build: (seed?: string) => ProjectState
}

function builder() {
  const nodes: (AreaNode | BuildingNode)[] = []
  const edges: RouteEdge[] = []
  const area = (x: number, y: number, w: number, h: number, data: Partial<AreaData>) => {
    const a = createAreaNode(nodes.filter((n) => n.type === 'area').length, { x, y }, data, { width: w, height: h })
    nodes.push(a)
    return a.id
  }
  const bld = (areaId: string, kind: BuildingKind, x: number, y: number, name: string, patch: Partial<BuildingData> = {}) => {
    const b = createBuildingNode(kind, { x, y }, { name, ...patch }, areaId)
    nodes.push(b)
    return b.id
  }
  const road = (a: string, b: string, patch: Partial<RouteData> = {}) => edges.push(createRouteEdge(a, b, patch))
  return { nodes, edges, area, bld, road }
}

function demo(): ProjectState {
  const { nodes, edges, area, bld, road } = builder()
  const rear = area(0, 0, 720, 340, { name: 'Retrovia · Montalto', terrain: 'pianura', notes: 'Base, magazzini e carri.' })
  const wood = area(0, 440, 500, 280, { name: 'Bosco di Farneto', terrain: 'bosco' })
  const camp = area(960, 0, 720, 340, { name: 'Campo di San Vito', terrain: 'collina' })
  const hill = area(1900, 0, 500, 300, { name: 'Colle del Corvo', terrain: 'altura', front: true })
  const left = area(1900, 380, 500, 260, { name: 'Piana dei Mulini', terrain: 'pianura', front: true })
  const ford = area(1300, 440, 480, 260, { name: 'Guado dei Salici', terrain: 'fiume' })
  const foe = area(2600, 0, 440, 640, { name: 'Campo del Marchese', terrain: 'pianura', control: -100, color: '#8e2c23', notes: 'Le schiere nemiche partono da qui.' })

  const castle = bld(rear, 'castello', 30, 70, 'Castello di Montalto')
  const granary = bld(rear, 'granaio', 262, 70, 'Granaio del Borgo')
  const depot = bld(rear, 'deposito', 494, 70, 'Armeria')
  const carts = bld(rear, 'parcocarri', 30, 230, 'Parco carri')
  const village = bld(rear, 'villaggio', 262, 230, 'Villaggio di Pieve')

  const lumber = bld(wood, 'taglialegna', 30, 70, 'Taglialegna')
  const fletcher = bld(wood, 'frecciaio', 262, 70, 'Frecciaio')
  const forge = bld(wood, 'fucina', 30, 180, 'Fucina del bosco')

  const tents = bld(camp, 'accampamento', 30, 70, 'Accampamento', { stock: { viveri: 8000, acqua: 5000, foraggio: 6000, frecce: 20000, armi: 150, legname: 2500 } })
  const hq = bld(camp, 'comando', 262, 70, 'Tenda del Conte')
  const hospital = bld(camp, 'ospedale', 494, 70, 'Ospedale da campo')
  const river = bld(camp, 'fiume', 30, 230, 'Presa sul Sarre')
  const tower = bld(camp, 'torre', 262, 230, 'Torre dei fuochi')

  const center = bld(hill, 'schieramento', 150, 70, 'Linea del Colle', { fortification: 2 })
  const cistern = bld(hill, 'pozzo', 150, 190, 'Cisterna del Colle', { production: { acqua: 1500, viveri: 0, foraggio: 0, frecce: 0, armi: 0, legname: 0 }, stock: { acqua: 4000, viveri: 0, foraggio: 0, frecce: 0, armi: 0, legname: 0 } })
  const mills = bld(left, 'schieramento', 40, 80, 'Linea dei Mulini')
  const millWell = bld(left, 'pozzo', 270, 150, 'Pozzo dei Mulini')

  const salici = bld(ford, 'villaggio', 150, 90, 'Salici', { production: { viveri: 200, foraggio: 400, acqua: 1500, frecce: 0, armi: 0, legname: 0 } })

  road(castle, granary)
  road(granary, depot)
  road(castle, carts)
  road(carts, village, { kind: 'sterrato' })
  road(granary, village, { kind: 'sterrato' })
  road(castle, lumber, { kind: 'sterrato' })
  road(lumber, fletcher, { kind: 'sentiero' })
  road(lumber, forge, { kind: 'sentiero' })
  road(fletcher, depot, { kind: 'sterrato' })
  road(depot, tents, { kind: 'ponte', name: 'Ponte sul Sarre' })
  road(village, salici, { kind: 'guado', name: 'Guado dei Salici' })
  road(tents, hq)
  road(hq, hospital)
  road(tents, river)
  road(hq, tower, { kind: 'sentiero' })
  road(tower, center, { kind: 'sterrato' })
  road(tents, center, { kind: 'sterrato' })
  road(center, cistern, { kind: 'sentiero' })
  road(hospital, mills, { kind: 'sterrato' })
  road(center, mills, { kind: 'sentiero' })
  road(river, salici, { kind: 'sterrato' })
  road(salici, mills, { kind: 'sentiero' })
  road(mills, millWell, { kind: 'sterrato' })

  const units: UnitDef[] = [
    createUnit('fanteria', center, { name: 'Fanti del Conte', men: 1200, morale: 75 }),
    createUnit('arcieri', center, { name: 'Arcieri di Valdarno', men: 400, morale: 70 }),
    createUnit('fanteria', mills, { name: 'Fanteria comunale', men: 600, morale: 65 }),
    createUnit('balestrieri', mills, { name: 'Balestrieri genovesi', men: 250, morale: 70 }),
    createUnit('cavalleria', tents, { name: 'Cavalieri di San Vito', men: 300, morale: 80, posture: 'riserva' }),
    createUnit('genieri', tents, { name: 'Maestri d’ascia', men: 80, morale: 70, posture: 'mobile' }),
    createUnit('milizia', castle, { name: 'Milizia di Montalto', men: 300, morale: 60 }),
  ]
  const enemies = [
    createEnemy({ name: 'Esercito del Marchese', type: 'fanteria', men: 2200, originAreaId: foe, targetAreaId: hill, behavior: 'avanza', startTurn: 3 }),
    createEnemy({ name: 'Cavalieri del Marchese', type: 'cavalleria', men: 350, originAreaId: foe, targetAreaId: left, behavior: 'tieni', startTurn: 4 }),
  ]
  return {
    meta: createMeta({ name: 'Battaglia del Colle del Corvo', description: 'Esempio: un esercito di circa 3.000 uomini difende il colle; la base è oltre il fiume Sarre.' }),
    nodes,
    edges,
    units,
    enemies,
  }
}

/** 1 · Minimal: one depot, one line, one road. Shows how a post orders and carts deliver. */
function primoConvoglio(): ProjectState {
  const { nodes, edges, area, bld, road } = builder()
  const rear = area(0, 0, 460, 220, { name: 'Retrovia', terrain: 'pianura', notes: 'Il castello tiene le scorte e i carri.' })
  const front = area(1000, 0, 460, 220, { name: 'Fronte', terrain: 'collina', front: true })
  const castle = bld(rear, 'castello', 130, 80, 'Castello')
  const line = bld(front, 'schieramento', 130, 80, 'Linea', { stock: { viveri: 1200, acqua: 1500, foraggio: 0, frecce: 2000, armi: 20, legname: 200 } })
  road(castle, line, { kind: 'sterrato', name: 'Strada del castello' })
  return {
    meta: createMeta({ name: 'Primo convoglio', description: 'Livello 1: un castello rifornisce una linea con 800 fanti. Premi Avvia e guarda i carri partire quando le scorte della linea scendono sotto i 2 giorni.' }),
    nodes,
    edges,
    units: [createUnit('fanteria', line, { name: 'Fanti', men: 800, morale: 75 })],
    enemies: [],
  }
}

/** 2 · A river between base and front: a fast bridge, a slow ford, and an attack from day 2. */
function ponteSulFiume(): ProjectState {
  const { nodes, edges, area, bld, road } = builder()
  const rear = area(0, 0, 500, 320, { name: 'Retrovia', terrain: 'pianura' })
  const river = area(700, 60, 420, 200, { name: 'Fiume Sarre', terrain: 'fiume', notes: 'Da qui passano tutti i rifornimenti.' })
  const front = area(1320, 0, 500, 320, { name: 'Fronte', terrain: 'collina', front: true })
  const castle = bld(rear, 'castello', 150, 60, 'Castello')
  const granary = bld(rear, 'granaio', 150, 200, 'Granaio')
  const water = bld(river, 'fiume', 110, 80, 'Presa d’acqua')
  const line = bld(front, 'schieramento', 150, 60, 'Linea del colle', { fortification: 2 })
  const hospital = bld(front, 'ospedale', 150, 200, 'Ospedale da campo')
  road(castle, granary)
  road(castle, water, { kind: 'strada' })
  road(water, line, { kind: 'ponte', name: 'Ponte vecchio' })
  road(granary, hospital, { kind: 'guado', name: 'Guado basso' })
  road(line, hospital, { kind: 'sentiero' })
  return {
    meta: createMeta({ name: 'Il ponte sul fiume', description: 'Livello 2: il ponte è la via rapida, il guado quella lenta. Dal secondo giorno il nemico attacca il fronte. Prova a distruggere il ponte (tasto destro) e guarda i carri deviare.' }),
    nodes,
    edges,
    units: [
      createUnit('fanteria', line, { name: 'Fanti del Conte', men: 900, morale: 75 }),
      createUnit('arcieri', line, { name: 'Arcieri', men: 300, morale: 70 }),
    ],
    enemies: [createEnemy({ name: 'Fanteria del Marchese', type: 'fanteria', men: 1300, targetAreaId: front, behavior: 'tieni', startTurn: 5 })],
  }
}

/** 3 · Two fronts and an undefended river valley that waters the camp: what if nobody guards it? */
function dueFronti(): ProjectState {
  const { nodes, edges, area, bld, road } = builder()
  const rear = area(0, 0, 700, 320, { name: 'Retrovia', terrain: 'pianura' })
  const wood = area(0, 420, 480, 240, { name: 'Bosco', terrain: 'bosco' })
  const camp = area(900, 0, 700, 320, { name: 'Campo', terrain: 'collina' })
  const valley = area(900, 420, 700, 240, { name: 'Valle del fiume', terrain: 'fiume', notes: 'Nessun reparto la presidia: acqua e foraggio del campo arrivano da qui.' })
  const north = area(1800, 0, 460, 260, { name: 'Fronte nord', terrain: 'altura', front: true })
  const south = area(1800, 360, 460, 260, { name: 'Fronte sud', terrain: 'pianura', front: true })
  const foe = area(2480, 0, 420, 620, { name: 'Campo nemico', terrain: 'pianura', control: -100, color: '#8e2c23', notes: 'Le schiere nemiche partono da qui.' })

  const castle = bld(rear, 'castello', 30, 70, 'Castello')
  const granary = bld(rear, 'granaio', 260, 70, 'Granaio')
  const carts = bld(rear, 'parcocarri', 260, 210, 'Parco carri')
  const lumber = bld(wood, 'taglialegna', 30, 70, 'Taglialegna')
  const fletcher = bld(wood, 'frecciaio', 260, 140, 'Frecciaio')
  const tents = bld(camp, 'accampamento', 30, 70, 'Accampamento', { stock: { viveri: 5000, acqua: 2000, foraggio: 2000, frecce: 10000, armi: 80, legname: 1500 } })
  const hq = bld(camp, 'comando', 260, 70, 'Tenda del comando')
  const hospital = bld(camp, 'ospedale', 490, 70, 'Ospedale')
  const riverWater = bld(valley, 'fiume', 40, 90, 'Presa sul fiume')
  const village = bld(valley, 'villaggio', 300, 90, 'Villaggio dei Salici')
  const lineN = bld(north, 'schieramento', 130, 80, 'Linea nord', { fortification: 2 })
  const lineS = bld(south, 'schieramento', 130, 80, 'Linea sud')

  road(castle, granary)
  road(granary, carts)
  road(castle, lumber, { kind: 'sterrato' })
  road(lumber, fletcher, { kind: 'sentiero' })
  road(fletcher, tents, { kind: 'sterrato' })
  road(granary, tents, { kind: 'strada', name: 'Strada maestra' })
  road(tents, hq)
  road(hq, hospital)
  road(tents, riverWater, { kind: 'sterrato' })
  road(riverWater, village, { kind: 'sterrato' })
  road(hq, lineN, { kind: 'sterrato' })
  road(hospital, lineS, { kind: 'sterrato' })
  road(village, lineS, { kind: 'sentiero' })

  return {
    meta: createMeta({ name: 'Due fronti e il fiume scoperto', description: 'Livello 3: due linee da tenere e una valle senza presidio che dà acqua al campo. Dal secondo giorno la cavalleria nemica punta proprio lì.' }),
    nodes,
    edges,
    units: [
      createUnit('fanteria', lineN, { name: 'Fanti nord', men: 900, morale: 75 }),
      createUnit('arcieri', lineN, { name: 'Arcieri nord', men: 300, morale: 70 }),
      createUnit('fanteria', lineS, { name: 'Fanti sud', men: 700, morale: 70 }),
      createUnit('cavalleria', tents, { name: 'Cavalieri di riserva', men: 200, morale: 80, posture: 'riserva' }),
    ],
    enemies: [
      createEnemy({ name: 'Fanteria nemica', type: 'fanteria', men: 1500, originAreaId: foe, targetAreaId: north, behavior: 'tieni', startTurn: 4 }),
      createEnemy({ name: 'Cavalleria leggera', type: 'cavalleria', men: 250, originAreaId: foe, targetAreaId: valley, behavior: 'avanza', startTurn: 5 }),
    ],
  }
}

export const TEMPLATES: Template[] = [
  { id: 'esercitazione', group: 'modo', name: 'Esercitazione', description: 'Terreno generato a caso e fisso: aree, fiume, castello e territorio nemico. Costruisci la tua logistica e poi mettila alla prova.', build: (seed) => generateExercise(seed ?? randomSeed()) },
  { id: 'livello1', group: 'demo', name: '1 · Primo convoglio', description: '2 aree, 2 edifici, 1 strada, nessun nemico: come nasce un rifornimento.', build: primoConvoglio },
  { id: 'livello2', group: 'demo', name: '2 · Il ponte sul fiume', description: '3 aree, un ponte veloce e un guado lento, un attacco al fronte dal secondo giorno.', build: ponteSulFiume },
  { id: 'livello3', group: 'demo', name: '3 · Due fronti e il fiume scoperto', description: '6 aree, due linee e una valle senza presidio che la cavalleria nemica prende di mira.', build: dueFronti },
  { id: 'demo', group: 'demo', name: '4 · Battaglia del Colle del Corvo', description: 'Esempio completo: 6 aree, 17 edifici, 7 reparti, un ponte critico e il nemico che attacca dal secondo giorno.', build: demo },
  { id: 'empty', group: 'modo', name: 'Campo vuoto', description: 'Metti tutto tu: aree, edifici, percorsi, i tuoi reparti e le schiere nemiche (trascinale dalla palette), poi guarda l’assalto.', build: () => ({ meta: createMeta(), nodes: [], edges: [], units: [], enemies: [] }) },
]
