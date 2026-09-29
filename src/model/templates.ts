import { createAreaNode, createBuildingNode, createEnemy, createMeta, createRouteEdge, createUnit } from './factory'
import { generateExercise, randomSeed } from './exercise'
import type { ProjectState } from './schema'
import type { GuideStep, AreaData, AreaNode, BuildingData, BuildingKind, BuildingNode, RouteData, RouteEdge, UnitDef } from './types'

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
  const road = (a: string, b: string, patch: Partial<RouteData> = {}) => {
    const e = createRouteEdge(a, b, patch)
    edges.push(e)
    return e.id
  }
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
  const bridge = road(depot, tents, { kind: 'ponte', name: 'Ponte sul Sarre' })
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
  const guide: GuideStep[] = [
    {
      title: 'Una battaglia completa',
      text: 'Circa 3.000 uomini su sei aree. La base (Montalto) è oltre il fiume Sarre, il campo di San Vito è al centro, il fronte è sul Colle del Corvo e sulla Piana dei Mulini. Il Marchese arriva da est.',
    },
    {
      title: 'La filiera delle frecce',
      text: 'Nel bosco il taglialegna produce legname, il frecciaio lo trasforma in frecce, la fucina in armi. Se il bosco cade o la strada si interrompe, le frecce smettono di arrivare e gli arcieri valgono un terzo.',
      focus: [lumber, fletcher, forge],
    },
    {
      title: 'Quanti carri servono',
      text: 'In Proprietà della battaglia, “A colpo d’occhio” confronta i carri che servono con quelli che hai. La vista “Bilancio flussi” mostra ogni flusso: da dove parte, dove va, quanti kg a turno.',
    },
    {
      title: 'Il ponte critico',
      text: 'Tutto ciò che viene dalla base passa sul Ponte sul Sarre. C’è un’alternativa, il guado dei Salici, molto più lunga.',
      focus: [bridge],
    },
    {
      title: 'Avvia: arriva il Marchese',
      text: 'Al turno 3 l’Esercito del Marchese (2.200 uomini) marcia sul Colle, al turno 4 i suoi cavalieri sulla Piana. Guarda le pedine rosse attraversare la mappa, poi le barre di controllo delle aree.',
      focus: [foe],
    },
    {
      title: 'Brucia l’armeria',
      text: 'Nel pieno dello scontro, un incendio all’Armeria: dove prenderanno ora frecce e armi? Guarda i convogli cambiare origine.',
      focus: [depot],
      action: { label: 'Incendia l’Armeria', event: { type: 'incendio', nodeId: depot } },
    },
    {
      title: 'Il test completo',
      text: 'Nel pannello Test lancia “Battaglia campale completa”: assalto frontale, razzie sulle linee, pioggia e ponte distrutto. Il rapporto elenca punti deboli e suggerimenti; salvane uno come riferimento e confronta le tue modifiche.',
    },
    {
      title: 'Cosa ti insegna',
      text: 'In una battaglia vera i problemi si sommano: un ponte, una pioggia, un magazzino bruciato. Keu serve a trovare prima quale di questi ti fa crollare, e quanto margine hai. Quando sei pronto, prova un’Esercitazione: il terreno è nuovo e la logistica la costruisci tu.',
    },
  ]
  return {
    meta: createMeta({ guide, name: 'Battaglia del Colle del Corvo', description: 'Esempio: un esercito di circa 3.000 uomini difende il colle; la base è oltre il fiume Sarre.' }),
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
  const strada = road(castle, line, { kind: 'sterrato', name: 'Strada del castello' })
  const guide: GuideStep[] = [
    {
      title: 'La battaglia più piccola possibile',
      text: 'Un castello pieno di scorte, una linea con 800 fanti a circa 25 km, una sola strada. Keu serve a rispondere a una domanda: le scorte arrivano dove servono, in tempo? Qui la risposta è facile, ed è il punto di partenza per capire tutto il resto.',
    },
    {
      title: 'Leggi la linea',
      text: 'Le barrette sotto “Linea” sono le scorte: viveri, acqua, frecce, armi, legname (verde = piena, rossa = vuota). Il badge rosso in alto a destra è l’autonomia: quante ore resiste con quello che ha. Ogni posto cerca di tenere 2 giorni di scorte: è la “Scorta obiettivo” nelle proprietà della battaglia.',
      focus: [line],
    },
    {
      title: 'Leggi la strada',
      text: 'L’etichetta sulla strada dice km, ore di carro e carri a turno su capacità. Un carro a buoi va piano: 25 km di sterrato sono circa 10 ore, quasi due turni. Un turno dura 6 ore (alba, giorno, sera, notte).',
      focus: [strada],
    },
    {
      title: 'Premi Avvia',
      text: 'Premi Avvia (o la barra spaziatrice). Nessuno dà ordini: la linea consuma, scende sotto l’obiettivo, e il castello carica i carri da solo. Il pallino che si muove è un convoglio: il colore è la risorsa principale, il numero sono i carri.',
    },
    {
      title: 'Cosa notare',
      text: 'Il ritardo. La linea ordina ora ma riceve due turni dopo: nel frattempo continua a consumare. Apri la scheda Situazione per la cronaca e la vista Inventario per i numeri turno per turno.',
    },
    {
      title: 'Prova tu',
      text: 'Premi Azzera, poi trascina la Linea molto più lontano, oppure seleziona la strada e cambiala in “sentiero”. Rilancia: le ore di viaggio crescono e l’autonomia della linea scende a ogni convoglio.',
      focus: [strada],
    },
    {
      title: 'Cosa ti insegna',
      text: 'La logistica è una corsa tra consumo e distanza. Se il viaggio (in ore) è più lungo dell’autonomia della linea, la linea resta a secco anche con il castello pieno. Passa al livello 2: tra la base e il fronte c’è un fiume.',
    },
  ]
  return {
    meta: createMeta({ name: 'Primo convoglio', description: 'Livello 1: un castello rifornisce una linea con 800 fanti. Premi Avvia e guarda i carri partire quando le scorte della linea scendono sotto i 2 giorni.', guide }),
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
  const bridge = road(water, line, { kind: 'ponte', name: 'Ponte vecchio' })
  const ford = road(granary, hospital, { kind: 'guado', name: 'Guado basso' })
  road(line, hospital, { kind: 'sentiero' })
  const guide: GuideStep[] = [
    {
      title: 'Un fiume in mezzo',
      text: 'Retrovia, fiume, fronte. Tutto ciò che mangia e combatte al fronte deve attraversare il Sarre. Ci sono due modi: il Ponte vecchio (veloce) e il Guado basso (lento, e con la pioggia quasi impraticabile).',
    },
    {
      title: 'Il punto critico',
      text: 'Il ponte è l’unico passaggio veloce. Spunta “Punti critici” nella barra in alto: Keu evidenzia i percorsi e gli edifici che, se cadono, spezzano la rete.',
      focus: [bridge],
    },
    {
      title: 'Da dove arriva cosa',
      text: 'Avvia la simulazione. L’acqua della linea arriva dalla Presa sul fiume, viveri e frecce dal castello. La vista “Bilancio flussi” in alto mostra chi rifornisce chi e quanti carri servono.',
      focus: [water],
    },
    {
      title: 'Arriva il nemico',
      text: 'All’alba del secondo giorno (turno 5) la Fanteria del Marchese attacca il Fronte. Guarda la barra di controllo dell’area e il “rapporto di forze”. Mentre combattono, arcieri e fanti consumano frecce e armi: la linea ne ordina di più e i carri aumentano.',
      focus: [front],
    },
    {
      title: 'Taglia il ponte',
      text: 'Premi il pulsante qui sotto (o tasto destro sul ponte → Distruggi). I convogli già in viaggio ripianificano e passano dal guado, più lento: guarda il badge di autonomia della linea scendere.',
      focus: [bridge],
      action: { label: 'Distruggi il ponte', event: { type: 'distruggi', routeId: bridge } },
    },
    {
      title: 'E ora la pioggia',
      text: 'Con il ponte rotto, tutto passa dal guado. Fai piovere: il guado rallenta ancora e la linea rischia di restare senz’acqua proprio mentre combatte. Segui la cronaca nella scheda Situazione.',
      focus: [ford],
      action: { label: 'Fai piovere 2 giorni', event: { type: 'meteo', weather: 'pioggia', turns: 8 } },
    },
    {
      title: 'Cosa ti insegna',
      text: 'Un solo passaggio è un solo punto di rottura. I rimedi si provano qui: un secondo ponte, più giorni di scorta al fronte (Scorta obiettivo), una scorta armata sulla strada contro le razzie. Premi Azzera, cambia una cosa e rilancia.',
    },
  ]
  return {
    meta: createMeta({ name: 'Il ponte sul fiume', description: 'Livello 2: il ponte è la via rapida, il guado quella lenta. Dal secondo giorno il nemico attacca il fronte. Prova a distruggere il ponte (tasto destro) e guarda i carri deviare.', guide }),
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

  const guide: GuideStep[] = [
    {
      title: 'Due fronti e un punto cieco',
      text: 'Due linee da tenere, un campo al centro con comando e ospedale. Acqua e foraggio del campo arrivano dalla Valle del fiume, che però nessuno presidia. Qui si vede cosa succede quando un’area “di retrovia” resta scoperta.',
      focus: [valley],
    },
    {
      title: 'Da dove viene il nemico',
      text: 'A est c’è il Campo nemico. Selezionalo: nelle Proprietà trovi le schiere accampate, dove attaccano e da che turno. La fanteria punta al Fronte nord (turno 4), la cavalleria leggera alla Valle del fiume (turno 5).',
      focus: [foe],
    },
    {
      title: 'Avvia e guarda la riserva',
      text: 'I Cavalieri di riserva hanno postura “riserva”: quando un’area vicina è attaccata ci corrono da soli. Ma nella valle non ci sono scorte per loro… Tieni aperta la scheda Situazione e segui la cronaca.',
      focus: [tents],
    },
    {
      title: 'La valle cade',
      text: 'La riserva resta senza viveri e foraggio, il morale crolla e si ritira. La valle diventa contesa, poi perduta (verso il turno 17): il nemico cattura le scorte e la cavalleria avanza sul Campo. Nessuna battaglia persa al fronte, eppure il campo è in pericolo.',
      focus: [valley],
    },
    {
      title: 'Prova tu',
      text: 'Premi Azzera e presidia la valle: seleziona la Presa sul fiume e aggiungi un reparto, oppure costruisci un granaio nella valle così che la riserva abbia di che mangiare. Rilancia e confronta.',
      focus: [riverWater],
    },
    {
      title: 'Misura la differenza',
      text: 'Nel pannello Test scegli “Aggiramento sul fianco” e lancia il test: ottieni un rapporto. Cambia qualcosa, rilancialo e confrontali: Keu ti dice se la modifica ha davvero aiutato (perdite, aree tenute, scorte catturate).',
    },
    {
      title: 'Cosa ti insegna',
      text: 'Il nemico non deve battere il tuo esercito: gli basta tagliarti l’acqua. Le aree da cui dipendi vanno difese, o almeno rifornite, anche se sembrano lontane dal fronte.',
    },
  ]
  return {
    meta: createMeta({ guide, name: 'Due fronti e il fiume scoperto', description: 'Livello 3: due linee da tenere e una valle senza presidio che dà acqua al campo. Dal secondo giorno la cavalleria nemica punta proprio lì.' }),
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
