import { z } from 'zod'
import { BUILDING_KINDS, RESOURCES, ROUTE_KINDS, TERRAINS, UNIT_TYPES, type AreaNode, type BuildingNode, type EnemyForce, type MapNode, type ProjectMeta, type RouteEdge, type UnitDef } from './types'
import { areaData, buildingData, createMeta, routeData } from './factory'

export interface ProjectState {
  meta: ProjectMeta
  nodes: MapNode[]
  edges: RouteEdge[]
  units: UnitDef[]
  enemies: EnemyForce[]
}

export const FORMAT = 'keu-battaglia'
export const FORMAT_VERSION = 1

const num = (def = 0) => z.number().finite().catch(def)
const str = (def = '') => z.string().catch(def)
const stock = z.object(Object.fromEntries(RESOURCES.map((r) => [r, num(0)])) as Record<(typeof RESOURCES)[number], z.ZodCatch<z.ZodNumber>>).partial()
const pos = z.object({ x: num(0), y: num(0) })

const buildingSchema = z.object({
  id: z.string(),
  type: z.literal('building'),
  position: pos,
  parentId: z.string().optional(),
  data: z.object({
    kind: z.enum(BUILDING_KINDS),
    name: str(),
    garrison: num(0).optional(),
    stock: stock.optional(),
    capacityT: num(10).optional(),
    production: stock.optional(),
    fortification: z.number().int().min(0).max(3).optional().catch(0),
    priority: z.number().int().min(1).max(3).optional().catch(2),
    carts: num(0).optional(),
    beds: num(0).optional(),
    notes: str().optional(),
  }),
})

const areaSchema = z.object({
  id: z.string(),
  type: z.literal('area'),
  position: pos,
  width: num(520).optional(),
  height: num(300).optional(),
  data: z.object({
    name: str('Area'),
    terrain: z.enum(TERRAINS).catch('pianura'),
    control: num(100).optional(),
    front: z.boolean().optional().catch(false),
    locked: z.boolean().optional().catch(false),
    color: str('#2e6f95').optional(),
    notes: str().optional(),
  }),
})

const routeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullish(),
  targetHandle: z.string().nullish(),
  data: z.object({
    kind: z.enum(ROUTE_KINDS).catch('strada'),
    name: str().optional(),
    lengthKm: z.number().positive().nullable().optional().catch(null),
    capacity: z.number().positive().nullable().optional().catch(null),
    escort: z.boolean().optional().catch(false),
    notes: str().optional(),
  }),
})

const unitSchema = z.object({
  id: z.string(),
  name: str('Reparto'),
  type: z.enum(UNIT_TYPES).catch('fanteria'),
  men: num(100),
  horses: num(0),
  morale: num(75),
  nodeId: z.string().nullable().catch(null),
  posture: z.enum(['fisso', 'mobile', 'riserva']).catch('fisso'),
  autoRetreat: z.boolean().catch(true),
  notes: str(),
})

const enemySchema = z.object({
  id: z.string(),
  name: str('Schiera nemica'),
  type: z.enum(UNIT_TYPES).catch('fanteria'),
  men: num(1000),
  originAreaId: z.string().nullable().optional().catch(null),
  targetAreaId: z.string().nullable().catch(null),
  behavior: z.enum(['tieni', 'avanza']).catch('tieni'),
  startTurn: num(0),
})

const fileSchema = z.object({
  format: z.string().optional(),
  version: z.number().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()).optional(),
  units: z.array(z.unknown()).optional(),
  enemies: z.array(z.unknown()).optional(),
})

export type ImportResult = { ok: true; state: ProjectState; warnings: string[] } | { ok: false; error: string }

export function importProject(text: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Il file non è un JSON valido.' }
  }
  const file = fileSchema.safeParse(raw)
  if (!file.success) return { ok: false, error: 'Il file non contiene una battaglia Keu (mancano i nodi).' }
  const warnings: string[] = []
  const nodes: MapNode[] = []
  for (const n of file.data.nodes) {
    const b = buildingSchema.safeParse(n)
    if (b.success) {
      const { data, ...rest } = b.data
      const base = buildingData(data.kind)
      nodes.push({
        ...rest,
        data: {
          ...base,
          ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
          stock: { ...base.stock, ...(data.stock ?? {}) },
          production: { ...base.production, ...(data.production ?? {}) },
        },
      } as BuildingNode)
      continue
    }
    const a = areaSchema.safeParse(n)
    if (a.success) {
      const { data, ...rest } = a.data
      const w = rest.width ?? 520
      const h = rest.height ?? 300
      nodes.push({ ...rest, width: w, height: h, style: { width: w, height: h }, data: { ...areaData(0), ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) } } as AreaNode)
      continue
    }
    warnings.push('Un elemento non riconosciuto è stato ignorato.')
  }
  const ids = new Set(nodes.map((n) => n.id))
  for (const n of nodes) if (n.parentId && !ids.has(n.parentId)) delete n.parentId
  const edges: RouteEdge[] = []
  for (const e of file.data.edges ?? []) {
    const r = routeSchema.safeParse(e)
    if (!r.success || !ids.has(r.data.source) || !ids.has(r.data.target)) {
      warnings.push('Un percorso non valido è stato ignorato.')
      continue
    }
    const { data, sourceHandle, targetHandle, ...rest } = r.data
    edges.push({ ...rest, type: 'route', data: { ...routeData(), ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) } } as RouteEdge)
  }
  const units = (file.data.units ?? []).flatMap((u) => {
    const r = unitSchema.safeParse(u)
    if (!r.success) return []
    return [{ ...r.data, nodeId: r.data.nodeId && ids.has(r.data.nodeId) ? r.data.nodeId : null }]
  })
  const enemies = (file.data.enemies ?? []).flatMap((u) => {
    const r = enemySchema.safeParse(u)
    const area = (id: string | null | undefined) => (id && ids.has(id) ? id : null)
    return r.success ? [{ ...r.data, originAreaId: area(r.data.originAreaId), targetAreaId: area(r.data.targetAreaId) }] : []
  })
  const base = createMeta()
  const m = (file.data.meta ?? {}) as Partial<ProjectMeta>
  const meta: ProjectMeta = { ...base, ...m, logistics: { ...base.logistics, ...(m.logistics ?? {}) } }
  return { ok: true, state: { meta, nodes: [...nodes.filter((n) => n.type === 'area'), ...nodes.filter((n) => n.type !== 'area')], edges, units, enemies }, warnings }
}

export function projectToJson(s: ProjectState): string {
  const clean = <T extends { selected?: boolean; measured?: unknown; dragging?: boolean }>(x: T) => {
    const { selected: _s, measured: _m, dragging: _d, ...rest } = x
    return rest
  }
  return JSON.stringify(
    { format: FORMAT, version: FORMAT_VERSION, meta: s.meta, nodes: s.nodes.map(clean), edges: s.edges.map(clean), units: s.units, enemies: s.enemies },
    null,
    2,
  )
}
