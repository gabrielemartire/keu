import { BUILDING_INFO, COMBAT_USE, DAILY, PHASE_INFO, RECIPES, RESOURCE_INFO, TURNS_PER_DAY, UNIT_INFO } from '../model/catalog'
import { emptyStock } from '../model/factory'
import { RESOURCES, type BuildingData, type BuildingKind, type Stock, type UnitType } from '../model/types'

export interface Troop {
  type: UnitType
  men: number
  horses: number
}

/** Production that depends on daylight work (fields, workshops). Water flows day and night. */
export const LABOUR_BOUND = new Set<BuildingKind>(['villaggio', 'taglialegna', 'frecciaio', 'fucina'])
export const AVG_LABOUR = PHASE_INFO.reduce((s, p) => s + p.labour, 0) / PHASE_INFO.length

export function addTo(a: Stock, b: Partial<Stock>, k = 1) {
  for (const r of RESOURCES) a[r] += (b[r] ?? 0) * k
  return a
}

export const stockKg = (s: Partial<Stock>) => RESOURCES.reduce((sum, r) => sum + (s[r] ?? 0) * RESOURCE_INFO[r].kg, 0)

/** What a body of troops eats and drinks in one turn (6 h). */
export function troopNeeds(t: Troop): Stock {
  const s = emptyStock()
  s.viveri = (t.men * DAILY.man.viveri) / TURNS_PER_DAY
  s.acqua = (t.men * DAILY.man.acqua + t.horses * DAILY.horse.acqua) / TURNS_PER_DAY
  s.legname = (t.men * DAILY.man.legname) / TURNS_PER_DAY
  s.foraggio = (t.horses * DAILY.horse.foraggio) / TURNS_PER_DAY
  return s
}

/** Ammunition and weapons used in one turn of full-intensity fighting. */
export function combatNeeds(t: Troop, intensity: number): Stock {
  const s = emptyStock()
  const missile = UNIT_INFO[t.type].missile
  if (missile === 'frecce') s.frecce = t.men * COMBAT_USE.arrowsPerArcher * intensity
  if (missile === 'dardi') s.frecce = t.men * COMBAT_USE.boltsPerCrossbowman * intensity
  s.armi = t.men * COMBAT_USE.armsPerMan * intensity
  return s
}

/**
 * Rate used to size the stock a post wants to keep: daily needs plus a
 * standing allowance of ammunition (about one hour of shooting per day).
 */
export function reserveRate(t: Troop): Stock {
  const s = troopNeeds(t)
  addTo(s, combatNeeds(t, 1), 1 / TURNS_PER_DAY)
  return s
}

export function patientNeeds(n: number): Stock {
  const s = emptyStock()
  s.viveri = (n * DAILY.patient.viveri) / TURNS_PER_DAY
  s.acqua = (n * DAILY.patient.acqua) / TURNS_PER_DAY
  s.legname = (n * DAILY.patient.legname) / TURNS_PER_DAY
  return s
}

export const garrisonTroop = (men: number): Troop => ({ type: 'milizia', men, horses: 0 })

/** Average production per turn of a building (labour-bound output averaged over the day). */
export function avgProduction(d: BuildingData): Stock {
  const s = { ...d.production }
  if (LABOUR_BOUND.has(d.kind)) for (const r of RESOURCES) s[r] *= AVG_LABOUR
  const recipe = RECIPES[d.kind]
  if (recipe) addTo(s, recipe.out, AVG_LABOUR)
  return s
}

/** Average inputs per turn of a workshop. */
export function avgRecipeInput(d: BuildingData): Stock {
  const s = emptyStock()
  const recipe = RECIPES[d.kind]
  if (recipe) addTo(s, recipe.in, AVG_LABOUR)
  return s
}

export const isHospital = (k: BuildingKind) => !!BUILDING_INFO[k].hospital

export function fmt(n: number, digits = 0) {
  if (!Number.isFinite(n)) return '∞'
  return n.toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

/** 12400 kg → "12,4 t". */
export function fmtQty(n: number, unit: string) {
  if (unit === 'kg' && Math.abs(n) >= 1000) return `${fmt(n / 1000, 1)} t`
  if (unit === 'L' && Math.abs(n) >= 1000) return `${fmt(n / 1000, 1)} m³`
  return `${fmt(n)} ${unit}`
}

export function fmtHours(h: number) {
  if (!Number.isFinite(h)) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 48) return `${fmt(h, 1)} h`
  return `${fmt(h / 24, 1)} gg`
}

export function fmtDays(d: number) {
  if (!Number.isFinite(d)) return 'illimitata'
  if (d < 1) return `${fmt(d * 24)} h`
  return `${fmt(d, 1)} gg`
}
