import { AREA_COLORS, BUILDING_INFO } from './catalog'
import {
  RESOURCES,
  type AreaData,
  type AreaNode,
  type BuildingData,
  type BuildingKind,
  type BuildingNode,
  type EnemyForce,
  type ProjectMeta,
  type RouteData,
  type RouteEdge,
  type Stock,
  type UnitDef,
  type UnitType,
} from './types'
import { UNIT_INFO } from './catalog'

let counter = 0
export function uid(prefix: string) {
  counter = (counter + 1) % 1296
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 5)}`
}

export const emptyStock = (): Stock => Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Stock
export const stockOf = (p: Partial<Stock> = {}): Stock => ({ ...emptyStock(), ...p })

export function createMeta(patch: Partial<ProjectMeta> = {}): ProjectMeta {
  const now = new Date().toISOString()
  return {
    name: 'Nuova battaglia',
    description: '',
    author: '',
    revision: '1.0',
    createdAt: now,
    updatedAt: now,
    logistics: { cartCapacityKg: 500, targetDays: 2, kmPerPx: 0.025, maxTripHours: 48 },
    ...patch,
  }
}

export function buildingData(kind: BuildingKind, patch: Partial<BuildingData> = {}): BuildingData {
  const d = BUILDING_INFO[kind].defaults
  return {
    kind,
    name: BUILDING_INFO[kind].label,
    garrison: d.garrison,
    stock: stockOf(d.stock),
    capacityT: d.capacityT,
    production: stockOf(d.production),
    fortification: d.fortification,
    priority: d.priority,
    carts: d.carts,
    beds: d.beds,
    notes: '',
    ...patch,
  }
}

export function createBuildingNode(kind: BuildingKind, position: { x: number; y: number }, patch: Partial<BuildingData> = {}, parentId?: string): BuildingNode {
  return { id: uid('b'), type: 'building', position, data: buildingData(kind, patch), ...(parentId ? { parentId } : {}) }
}

export function areaData(index: number, patch: Partial<AreaData> = {}): AreaData {
  return { name: `Area ${index + 1}`, terrain: 'pianura', control: 100, front: false, locked: false, color: AREA_COLORS[index % AREA_COLORS.length], notes: '', ...patch }
}

export function createAreaNode(index: number, position: { x: number; y: number }, patch: Partial<AreaData> = {}, size = { width: 520, height: 300 }): AreaNode {
  return { id: uid('a'), type: 'area', position, width: size.width, height: size.height, style: { width: size.width, height: size.height }, data: areaData(index, patch) }
}

export function routeData(patch: Partial<RouteData> = {}): RouteData {
  return { kind: 'strada', name: '', lengthKm: null, capacity: null, escort: false, notes: '', ...patch }
}

export function createRouteEdge(source: string, target: string, patch: Partial<RouteData> = {}): RouteEdge {
  return { id: uid('r'), type: 'route', source, target, data: routeData(patch) }
}

export function createUnit(type: UnitType, nodeId: string | null, patch: Partial<UnitDef> = {}): UnitDef {
  const men = patch.men ?? 400
  return {
    id: uid('u'),
    name: UNIT_INFO[type].label,
    type,
    men,
    horses: Math.round(men * UNIT_INFO[type].horsesPerMan),
    morale: 75,
    nodeId,
    posture: 'fisso',
    autoRetreat: true,
    notes: '',
    ...patch,
  }
}

export function createEnemy(patch: Partial<EnemyForce> = {}): EnemyForce {
  return { id: uid('e'), name: 'Schiera nemica', type: 'fanteria', men: 1500, originAreaId: null, targetAreaId: null, behavior: 'tieni', startTurn: 0, ...patch }
}
