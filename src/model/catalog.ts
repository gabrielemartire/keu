import type { BuildingKind, EnemyBehavior, Posture, ResourceId, RouteKind, Stock, Terrain, UnitType } from './types'

/**
 * Reference values. Semi-historical: plausible orders of magnitude for a
 * 13th–15th century field army, every value can be changed per building / route.
 */

export const TURN_HOURS = 6
export const TURNS_PER_DAY = 4
export const PHASES = ['Alba', 'Giorno', 'Sera', 'Notte'] as const

/** Per turn phase: fighting intensity, work in the fields/workshops, speed of carts and marching troops. */
export const PHASE_INFO = [
  { combat: 0.8, labour: 1, cart: 0.9, march: 1 },
  { combat: 1, labour: 1, cart: 1, march: 1 },
  { combat: 0.6, labour: 0.6, cart: 0.8, march: 0.8 },
  { combat: 0.15, labour: 0, cart: 0.45, march: 0.3 },
] as const

export const WEATHERS = ['sereno', 'pioggia', 'nebbia'] as const
export type Weather = (typeof WEATHERS)[number]
export const WEATHER_INFO: Record<Weather, { label: string; archers: number; cavalry: number; ambush: number }> = {
  sereno: { label: 'Sereno', archers: 1, cavalry: 1, ambush: 1 },
  pioggia: { label: 'Pioggia', archers: 0.7, cavalry: 0.75, ambush: 1.2 },
  nebbia: { label: 'Nebbia', archers: 0.5, cavalry: 0.9, ambush: 2 },
}

export interface ResourceInfo {
  label: string
  short: string
  unit: string
  /** Kilograms per unit of measure. */
  kg: number
  color: string
}

export const RESOURCE_INFO: Record<ResourceId, ResourceInfo> = {
  viveri: { label: 'Viveri', short: 'VIV', unit: 'kg', kg: 1, color: '#b8860b' },
  acqua: { label: 'Acqua', short: 'H2O', unit: 'L', kg: 1, color: '#1f6fb0' },
  foraggio: { label: 'Foraggio', short: 'FOR', unit: 'kg', kg: 1, color: '#5e8a1f' },
  frecce: { label: 'Frecce e dardi', short: 'FRC', unit: 'pz', kg: 0.06, color: '#8e44ad' },
  armi: { label: 'Armi e armature', short: 'ARM', unit: 'pz', kg: 4, color: '#5b6b7f' },
  legname: { label: 'Legname', short: 'LEG', unit: 'kg', kg: 1, color: '#8a5a2b' },
}

/** Daily needs, per man and per horse. */
export const DAILY = {
  man: { viveri: 1.5, acqua: 3, legname: 0.5 },
  horse: { foraggio: 10, acqua: 30 },
  patient: { viveri: 1.2, acqua: 4, legname: 1 },
} as const

/** Consumed per turn of full-intensity fighting. */
export const COMBAT_USE = { arrowsPerArcher: 12, boltsPerCrossbowman: 6, armsPerMan: 0.01 } as const

/** Wounded men per cart. */
export const WOUNDED_PER_CART = 6

export type BuildingGroup = 'Comando e difesa' | 'Truppe e sanità' | 'Magazzini' | 'Fonti e produzione'
export const BUILDING_GROUPS: BuildingGroup[] = ['Comando e difesa', 'Truppe e sanità', 'Magazzini', 'Fonti e produzione']

export interface BuildingInfo {
  label: string
  short: string
  color: string
  group: BuildingGroup
  description: string
  /** Issues orders (command source). */
  command?: boolean
  /** Speeds up messages on the routes it touches. */
  relay?: boolean
  /** Where troops recover morale. */
  rest?: boolean
  hospital?: boolean
  defaults: {
    garrison: number
    capacityT: number
    carts: number
    beds: number
    fortification: 0 | 1 | 2 | 3
    priority: 1 | 2 | 3
    stock: Partial<Stock>
    production: Partial<Stock>
  }
}

export const BUILDING_INFO: Record<BuildingKind, BuildingInfo> = {
  castello: {
    label: 'Castello / base',
    short: 'Castello',
    color: '#1f4e79',
    group: 'Comando e difesa',
    description: 'Base fortificata: grandi magazzini, presidio, comando.',
    command: true,
    rest: true,
    defaults: { garrison: 150, capacityT: 250, carts: 20, beds: 0, fortification: 3, priority: 3, stock: { viveri: 60000, acqua: 40000, foraggio: 30000, frecce: 30000, armi: 800, legname: 20000 }, production: { acqua: 6000 } },
  },
  comando: {
    label: 'Tenda di comando',
    short: 'Comando',
    color: '#243b53',
    group: 'Comando e difesa',
    description: 'Da qui partono gli ordini: se i reparti sono irraggiungibili il morale cala.',
    command: true,
    defaults: { garrison: 30, capacityT: 8, carts: 0, beds: 0, fortification: 1, priority: 2, stock: { viveri: 800, acqua: 1500 }, production: {} },
  },
  torre: {
    label: 'Torre di segnalazione',
    short: 'Torre',
    color: '#4a5d73',
    group: 'Comando e difesa',
    description: 'Fuochi e bandiere: i messaggi sui percorsi collegati viaggiano quasi istantanei.',
    relay: true,
    defaults: { garrison: 10, capacityT: 2, carts: 0, beds: 0, fortification: 1, priority: 3, stock: { viveri: 200, acqua: 300 }, production: {} },
  },
  schieramento: {
    label: 'Posizione di schieramento',
    short: 'Schieramento',
    color: '#b03a2e',
    group: 'Comando e difesa',
    description: 'Linea di battaglia. Le fortificazioni (palizzata, fossato) aumentano la difesa.',
    defaults: { garrison: 0, capacityT: 12, carts: 0, beds: 0, fortification: 1, priority: 1, stock: { viveri: 2500, acqua: 4000, frecce: 16000, armi: 60, legname: 600 }, production: {} },
  },
  accampamento: {
    label: 'Accampamento',
    short: 'Campo',
    color: '#7a4b2a',
    group: 'Truppe e sanità',
    description: 'Tende e cucine: le truppe rifornite recuperano il morale.',
    rest: true,
    defaults: { garrison: 0, capacityT: 60, carts: 4, beds: 0, fortification: 0, priority: 2, stock: { viveri: 6000, acqua: 6000, foraggio: 3000, legname: 2000 }, production: {} },
  },
  ospedale: {
    label: 'Ospedale da campo',
    short: 'Ospedale',
    color: '#c0392b',
    group: 'Truppe e sanità',
    description: 'Cura i feriti: se arrivano in tempo, molti tornano al reparto.',
    hospital: true,
    defaults: { garrison: 0, capacityT: 8, carts: 6, beds: 200, fortification: 0, priority: 1, stock: { viveri: 1500, acqua: 3000, legname: 800 }, production: {} },
  },
  granaio: {
    label: 'Granaio',
    short: 'Granaio',
    color: '#b8860b',
    group: 'Magazzini',
    description: 'Scorte di viveri e foraggio.',
    defaults: { garrison: 10, capacityT: 120, carts: 0, beds: 0, fortification: 0, priority: 3, stock: { viveri: 50000, foraggio: 40000 }, production: {} },
  },
  deposito: {
    label: 'Deposito / armeria',
    short: 'Deposito',
    color: '#6b5b95',
    group: 'Magazzini',
    description: 'Magazzino generico: frecce, armi, legname, viveri.',
    defaults: { garrison: 10, capacityT: 60, carts: 0, beds: 0, fortification: 0, priority: 3, stock: { frecce: 40000, armi: 600, legname: 6000, viveri: 8000 }, production: {} },
  },
  parcocarri: {
    label: 'Parco carri e scuderie',
    short: 'Carri',
    color: '#5b6b7f',
    group: 'Magazzini',
    description: 'Carri, buoi e conducenti: è la capacità di trasporto dell’esercito.',
    defaults: { garrison: 10, capacityT: 20, carts: 40, beds: 0, fortification: 0, priority: 3, stock: { foraggio: 6000 }, production: {} },
  },
  villaggio: {
    label: 'Villaggio (requisizioni)',
    short: 'Villaggio',
    color: '#557a3a',
    group: 'Fonti e produzione',
    description: 'Fornisce viveri e foraggio finché l’area è sotto controllo.',
    defaults: { garrison: 0, capacityT: 30, carts: 5, beds: 0, fortification: 0, priority: 3, stock: { viveri: 4000, foraggio: 5000 }, production: { viveri: 450, foraggio: 700, acqua: 1500 } },
  },
  pozzo: {
    label: 'Pozzo / cisterna',
    short: 'Pozzo',
    color: '#2e6f95',
    group: 'Fonti e produzione',
    description: 'Acqua: pesa quanto il cibo e serve il doppio, soprattutto ai cavalli.',
    defaults: { garrison: 0, capacityT: 15, carts: 0, beds: 0, fortification: 0, priority: 3, stock: { acqua: 8000 }, production: { acqua: 5000 } },
  },
  fiume: {
    label: 'Punto d’acqua (fiume)',
    short: 'Fiume',
    color: '#1f8a8a',
    group: 'Fonti e produzione',
    description: 'Presa d’acqua abbondante.',
    defaults: { garrison: 0, capacityT: 30, carts: 0, beds: 0, fortification: 0, priority: 3, stock: { acqua: 20000 }, production: { acqua: 25000 } },
  },
  taglialegna: {
    label: 'Taglialegna',
    short: 'Legna',
    color: '#8a5a2b',
    group: 'Fonti e produzione',
    description: 'Legna da ardere e legname per le botteghe.',
    defaults: { garrison: 0, capacityT: 20, carts: 0, beds: 0, fortification: 0, priority: 3, stock: { legname: 3000 }, production: { legname: 1500 } },
  },
  frecciaio: {
    label: 'Bottega del frecciaio',
    short: 'Frecciaio',
    color: '#8e44ad',
    group: 'Fonti e produzione',
    description: 'Trasforma il legname in frecce e dardi.',
    defaults: { garrison: 0, capacityT: 10, carts: 0, beds: 0, fortification: 0, priority: 2, stock: { legname: 600, frecce: 4000 }, production: {} },
  },
  fucina: {
    label: 'Fucina',
    short: 'Fucina',
    color: '#4d4d4d',
    group: 'Fonti e produzione',
    description: 'Ripara e forgia armi e armature, consuma legna (carbone).',
    defaults: { garrison: 0, capacityT: 10, carts: 0, beds: 0, fortification: 0, priority: 2, stock: { legname: 1000, armi: 60 }, production: {} },
  },
}

/** Workshops: per turn at full labour, `in` is consumed to make `out`. */
export const RECIPES: Partial<Record<BuildingKind, { in: Partial<Stock>; out: Partial<Stock> }>> = {
  frecciaio: { in: { legname: 60 }, out: { frecce: 1200 } },
  fucina: { in: { legname: 200 }, out: { armi: 18 } },
}

export interface UnitInfo {
  label: string
  short: string
  /** Fighting value of one man, infantry = 1. */
  power: number
  /** March speed, km/h. */
  marchKmh: number
  horsesPerMan: number
  /** Uses arrows or bolts in combat. */
  missile: 'frecce' | 'dardi' | null
  /** NATO-like frame symbol drawn inside the unit box. */
  symbol: 'x' | 'slash' | 'arrow' | 'bolt' | 'bridge' | 'dot'
}

export const UNIT_INFO: Record<UnitType, UnitInfo> = {
  fanteria: { label: 'Fanteria', short: 'FAN', power: 1, marchKmh: 4, horsesPerMan: 0, missile: null, symbol: 'x' },
  arcieri: { label: 'Arcieri', short: 'ARC', power: 1.1, marchKmh: 4, horsesPerMan: 0, missile: 'frecce', symbol: 'arrow' },
  balestrieri: { label: 'Balestrieri', short: 'BAL', power: 1.2, marchKmh: 3.5, horsesPerMan: 0, missile: 'dardi', symbol: 'bolt' },
  cavalleria: { label: 'Cavalleria', short: 'CAV', power: 2.6, marchKmh: 8, horsesPerMan: 1.5, missile: null, symbol: 'slash' },
  genieri: { label: 'Genieri', short: 'GEN', power: 0.5, marchKmh: 3.5, horsesPerMan: 0, missile: null, symbol: 'bridge' },
  milizia: { label: 'Milizia', short: 'MIL', power: 0.6, marchKmh: 3.5, horsesPerMan: 0, missile: null, symbol: 'dot' },
}

export const POSTURE_INFO: Record<Posture, { label: string; description: string }> = {
  fisso: { label: 'Fisso', description: 'Tiene la posizione; si sposta solo con un tuo ordine.' },
  mobile: { label: 'Mobile', description: 'Esegue i tuoi ordini di spostamento.' },
  riserva: { label: 'Riserva', description: 'Esegue gli ordini e rinforza da solo le aree in difficoltà.' },
}

export const BEHAVIOR_INFO: Record<EnemyBehavior, string> = {
  tieni: 'Preme sull’area bersaglio',
  avanza: 'Conquistata l’area, avanza verso la base',
}

export interface RouteInfo {
  label: string
  /** Speed multiplier for carts (base 3 km/h) and troops. */
  speed: number
  /** Carts entering per turn. */
  capacity: number
  /** Speed multiplier under rain. */
  rain: number
  /** How easy it is to ambush a convoy here (0..1). */
  exposure: number
  color: string
  width: number
  dash?: number[]
  /** Can be destroyed (and rebuilt by engineers). */
  destroyable: boolean
}

export const CART_KMH = 3

export const ROUTE_INFO: Record<RouteKind, RouteInfo> = {
  strada: { label: 'Strada', speed: 1, capacity: 30, rain: 0.85, exposure: 0.3, color: '#4a5564', width: 3.5, destroyable: false },
  sterrato: { label: 'Sterrato', speed: 0.8, capacity: 16, rain: 0.4, exposure: 0.5, color: '#8a6d3b', width: 2.5, dash: [9, 4], destroyable: false },
  sentiero: { label: 'Sentiero', speed: 0.6, capacity: 6, rain: 0.5, exposure: 0.75, color: '#7d8b6a', width: 1.6, dash: [3, 4], destroyable: false },
  ponte: { label: 'Ponte', speed: 1, capacity: 20, rain: 1, exposure: 0.4, color: '#1f4e79', width: 4, destroyable: true },
  guado: { label: 'Guado', speed: 0.5, capacity: 8, rain: 0.2, exposure: 0.8, color: '#1f8a8a', width: 2.5, dash: [2, 3], destroyable: false },
  fluviale: { label: 'Via fluviale (chiatte)', speed: 1.2, capacity: 40, rain: 0.8, exposure: 0.3, color: '#2e6f95', width: 3, dash: [12, 4, 2, 4], destroyable: true },
}

export interface TerrainInfo {
  label: string
  /** Defender multiplier. */
  defense: number
  /** Cavalry multiplier (both sides). */
  cavalry: number
}

export const TERRAIN_INFO: Record<Terrain, TerrainInfo> = {
  pianura: { label: 'Pianura', defense: 1, cavalry: 1.15 },
  collina: { label: 'Collina', defense: 1.2, cavalry: 0.9 },
  altura: { label: 'Altura', defense: 1.4, cavalry: 0.7 },
  bosco: { label: 'Bosco', defense: 1.25, cavalry: 0.5 },
  palude: { label: 'Palude', defense: 1.15, cavalry: 0.4 },
  fiume: { label: 'Fiume / sponde', defense: 1.3, cavalry: 0.6 },
}

export const AREA_COLORS = ['#2e6f95', '#2f7d4f', '#8a6d3b', '#6b5b95', '#c0561b', '#1f8a8a', '#5b6b7f', '#b03a2e']

export const PRIORITY_LABEL: Record<1 | 2 | 3, string> = { 1: 'Alta', 2: 'Normale', 3: 'Bassa' }

/** Control thresholds of an area. */
export const CONTROL = { ours: 30, enemy: -30 } as const
export type AreaStatus = 'nostro' | 'conteso' | 'nemico'
export const areaStatus = (control: number): AreaStatus => (control >= CONTROL.ours ? 'nostro' : control <= CONTROL.enemy ? 'nemico' : 'conteso')
export const AREA_STATUS_LABEL: Record<AreaStatus, string> = { nostro: 'Sotto controllo', conteso: 'Conteso', nemico: 'In mano nemica' }
