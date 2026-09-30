import { create } from 'zustand'
import { applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from '@xyflow/react'
import { BUILDING_INFO } from '../model/catalog'
import { createAreaNode, createBuildingNode, createEnemy, createMeta, createRouteEdge, createUnit, uid } from '../model/factory'
import type { ProjectState } from '../model/schema'
import {
  BUILDING_SIZE,
  type AreaData,
  type AreaNode,
  type BuildingData,
  type BuildingKind,
  type BuildingNode,
  type EnemyForce,
  type MapNode,
  type ProjectMeta,
  type RouteData,
  type RouteEdge,
  type UnitDef,
  type UnitType,
} from '../model/types'
import { absolutePosition } from '../engine/world'

export type View = 'mappa' | 'inventario' | 'reparti' | 'nemici' | 'percorsi' | 'bilancio' | 'registro' | 'rapporto'
export type SidePanel = 'proprieta' | 'verifiche' | 'situazione' | 'test'

type Snapshot = ProjectState

interface StoreState extends ProjectState {
  past: Snapshot[]
  future: Snapshot[]
  view: View
  sidePanel: SidePanel
  focusRequest: number
  /** Bumped on every structural change (autosave, checks). */
  revision: number

  onNodesChange: (changes: NodeChange<MapNode>[]) => void
  onEdgesChange: (changes: EdgeChange<RouteEdge>[]) => void
  onConnect: (c: Connection) => void

  pushHistory: (coalesceKey?: string) => void
  beginBatch: () => void
  addBuilding: (kind: BuildingKind, absolute: { x: number; y: number }) => string
  addArea: (absolute: { x: number; y: number }) => string
  updateBuilding: (id: string, patch: Partial<BuildingData>) => void
  updateArea: (id: string, patch: Partial<AreaData>) => void
  updateRoute: (id: string, patch: Partial<RouteData>) => void
  updateMeta: (patch: Partial<ProjectMeta>) => void
  addUnit: (type: UnitType, nodeId: string | null) => string
  updateUnit: (id: string, patch: Partial<UnitDef>) => void
  removeUnit: (id: string) => void
  addEnemy: (patch: Partial<EnemyForce>) => string
  /** Enemy force dropped on the map: camped in the area under the pointer. */
  dropEnemy: (absolute: { x: number; y: number }) => string | null
  updateEnemy: (id: string, patch: Partial<EnemyForce>) => void
  removeEnemy: (id: string) => void
  reparent: (ids: string[]) => void
  deleteSelection: () => void
  deleteElement: (id: string) => void

  select: (ids: string[], focus?: boolean) => void
  clearSelection: () => void

  loadProject: (state: ProjectState) => void
  undo: () => void
  redo: () => void
  setView: (v: View) => void
  setSidePanel: (p: SidePanel) => void
}

const HISTORY_LIMIT = 100
let lastCoalesce: { key: string; at: number } | null = null
let batchUntil = 0

const strip = (s: Snapshot): Snapshot => ({
  ...s,
  nodes: s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
  edges: s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
})

/** Areas are parents and must precede buildings (React Flow ordering rule). */
const ordered = (nodes: MapNode[]) => [...nodes.filter((n) => n.type === 'area'), ...nodes.filter((n) => n.type !== 'area')]

function areaAt(nodes: MapNode[], p: { x: number; y: number }): AreaNode | undefined {
  const areas = nodes.filter((n): n is AreaNode => n.type === 'area')
  for (let i = areas.length - 1; i >= 0; i--) {
    const a = areas[i]
    const w = a.width ?? a.measured?.width ?? 0
    const h = a.height ?? a.measured?.height ?? 0
    if (p.x >= a.position.x && p.x <= a.position.x + w && p.y >= a.position.y && p.y <= a.position.y + h) return a
  }
  return undefined
}

function nextName(nodes: MapNode[], base: string) {
  const names = new Set(nodes.filter((n) => n.type === 'building').map((n) => (n as BuildingNode).data.name))
  if (!names.has(base)) return base
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`
}

/** A sensible route kind from the two ends. */
function inferRoute(a: BuildingNode, b: BuildingNode, nodes: MapNode[]): Partial<RouteData> {
  const kinds = [a.data.kind, b.data.kind]
  if (kinds.includes('fiume')) return { kind: 'sterrato' }
  if (kinds.includes('schieramento') || kinds.includes('torre')) return { kind: 'sterrato' }
  const sameArea = a.parentId && a.parentId === b.parentId
  const area = sameArea ? (nodes.find((n) => n.id === a.parentId) as AreaNode | undefined) : undefined
  if (area?.data.terrain === 'bosco' || area?.data.terrain === 'palude') return { kind: 'sentiero' }
  return { kind: 'strada' }
}

export const useStore = create<StoreState>()((set, get) => {
  const snapshot = (): Snapshot => {
    const { meta, nodes, edges, units, enemies } = get()
    return { meta, nodes, edges, units, enemies }
  }
  const commit = (partial: Partial<StoreState>) =>
    set((s) => ({ ...partial, revision: s.revision + 1, meta: partial.meta ?? { ...s.meta, updatedAt: new Date().toISOString() } }))
  const deselect = () => ({
    nodes: get().nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
    edges: get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
  })

  return {
    meta: createMeta(),
    nodes: [],
    edges: [],
    units: [],
    enemies: [],
    past: [],
    future: [],
    view: 'mappa',
    sidePanel: 'proprieta',
    focusRequest: 0,
    revision: 0,

    pushHistory: (key) => {
      const now = Date.now()
      if (now < batchUntil) return
      if (key && lastCoalesce && lastCoalesce.key === key && now - lastCoalesce.at < 1500) {
        lastCoalesce.at = now
        return
      }
      lastCoalesce = key ? { key, at: now } : null
      set((s) => ({ past: [...s.past.slice(-HISTORY_LIMIT + 1), strip(snapshot())], future: [] }))
    },

    beginBatch: () => {
      get().pushHistory()
      batchUntil = Date.now() + 120
    },

    onNodesChange: (input) => {
      // Areas of an exercise are the fixed ground: they cannot be removed, moved or resized.
      const fixed = new Set(get().nodes.filter((n) => n.type === 'area' && n.data.locked).map((n) => n.id))
      const changes = input.filter((c) => !(fixed.has((c as { id?: string }).id ?? '') && (c.type === 'remove' || c.type === 'position' || (c.type === 'dimensions' && c.resizing !== undefined))))
      const structural = changes.some((c) => c.type === 'remove' || c.type === 'add')
      const moved = changes.some((c) => (c.type === 'position' && !c.dragging) || (c.type === 'dimensions' && c.setAttributes))
      if (structural) get().pushHistory()
      let nodes = get().nodes
      const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id))
      let { units, enemies } = get()
      if (removed.size) {
        // Deleting an area keeps its buildings: detach them to absolute coordinates.
        nodes = nodes.map((n) => {
          if (n.parentId && removed.has(n.parentId) && !removed.has(n.id)) {
            const { parentId: _p, ...rest } = n
            return { ...rest, position: absolutePosition(n, nodes) } as MapNode
          }
          return n
        })
        units = units.map((u) => (u.nodeId && removed.has(u.nodeId) ? { ...u, nodeId: null } : u))
        enemies = enemies.map((e) => ({
          ...e,
          originAreaId: e.originAreaId && removed.has(e.originAreaId) ? null : e.originAreaId,
          targetAreaId: e.targetAreaId && removed.has(e.targetAreaId) ? null : e.targetAreaId,
        }))
      }
      nodes = applyNodeChanges(changes, nodes)
      if (structural || moved) commit({ nodes, units, enemies })
      else set({ nodes })
    },

    onEdgesChange: (changes) => {
      const structural = changes.some((c) => c.type === 'remove' || c.type === 'add')
      if (structural) get().pushHistory()
      const edges = applyEdgeChanges(changes, get().edges)
      if (structural) commit({ edges })
      else set({ edges })
    },

    onConnect: (c) => {
      if (!c.source || !c.target || c.source === c.target) return
      const { nodes, edges } = get()
      const a = nodes.find((n) => n.id === c.source)
      const b = nodes.find((n) => n.id === c.target)
      if (a?.type !== 'building' || b?.type !== 'building') return
      get().pushHistory()
      const edge = createRouteEdge(a.id, b.id, inferRoute(a, b, nodes))
      commit({ edges: [...edges.map((e) => (e.selected ? { ...e, selected: false } : e)), edge] })
    },

    addBuilding: (kind, absolute) => {
      get().pushHistory()
      const { nodes } = get()
      const pos = { x: absolute.x - BUILDING_SIZE.width / 2, y: absolute.y - BUILDING_SIZE.height / 2 }
      const parent = areaAt(nodes, absolute)
      const node = createBuildingNode(kind, parent ? { x: pos.x - parent.position.x, y: pos.y - parent.position.y } : pos, { name: nextName(nodes, BUILDING_INFO[kind].label) }, parent?.id)
      node.selected = true
      commit({ ...deselect(), nodes: [...deselect().nodes, node], sidePanel: 'proprieta' })
      return node.id
    },

    addArea: (absolute) => {
      get().pushHistory()
      const { nodes } = get()
      const index = nodes.filter((n) => n.type === 'area').length
      const node = createAreaNode(index, { x: absolute.x - 260, y: absolute.y - 40 })
      node.selected = true
      commit({ ...deselect(), nodes: ordered([node, ...deselect().nodes]), sidePanel: 'proprieta' })
      return node.id
    },

    updateBuilding: (id, patch) => {
      get().pushHistory(`b:${id}:${Object.keys(patch).join(',')}`)
      commit({ nodes: get().nodes.map((n) => (n.id === id && n.type === 'building' ? { ...n, data: { ...n.data, ...patch } } : n)) })
    },

    updateArea: (id, patch) => {
      get().pushHistory(`a:${id}:${Object.keys(patch).join(',')}`)
      commit({ nodes: get().nodes.map((n) => (n.id === id && n.type === 'area' ? { ...n, data: { ...n.data, ...patch } } : n)) })
    },

    updateRoute: (id, patch) => {
      get().pushHistory(`r:${id}:${Object.keys(patch).join(',')}`)
      commit({ edges: get().edges.map((e) => (e.id === id ? { ...e, data: { ...e.data!, ...patch } } : e)) })
    },

    updateMeta: (patch) => {
      get().pushHistory(`meta:${Object.keys(patch).join(',')}`)
      commit({ meta: { ...get().meta, ...patch, updatedAt: new Date().toISOString() } })
    },

    addUnit: (type, nodeId) => {
      get().pushHistory()
      const u = createUnit(type, nodeId)
      commit({ units: [...get().units, u] })
      return u.id
    },

    updateUnit: (id, patch) => {
      get().pushHistory(`u:${id}:${Object.keys(patch).join(',')}`)
      commit({ units: get().units.map((u) => (u.id === id ? { ...u, ...patch } : u)) })
    },

    removeUnit: (id) => {
      get().pushHistory()
      commit({ units: get().units.filter((u) => u.id !== id) })
    },

    addEnemy: (patch) => {
      get().pushHistory()
      const e = createEnemy(patch)
      commit({ enemies: [...get().enemies, e] })
      return e.id
    },

    dropEnemy: (absolute) => {
      const area = areaAt(get().nodes, absolute)
      if (!area) return null
      const n = get().enemies.length + 1
      const id = get().addEnemy({ originAreaId: area.id, name: `Schiera nemica ${n}`, startTurn: 4 })
      set({ ...deselect(), nodes: get().nodes.map((x) => ({ ...x, selected: x.id === area.id })), sidePanel: 'proprieta' })
      return id
    },

    updateEnemy: (id, patch) => {
      get().pushHistory(`e:${id}:${Object.keys(patch).join(',')}`)
      commit({ enemies: get().enemies.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
    },

    removeEnemy: (id) => {
      get().pushHistory()
      commit({ enemies: get().enemies.filter((e) => e.id !== id) })
    },

    reparent: (ids) => {
      const { nodes } = get()
      let changed = false
      const next = nodes.map((n) => {
        if (n.type !== 'building' || !ids.includes(n.id)) return n
        const abs = absolutePosition(n, nodes)
        const target = areaAt(nodes, { x: abs.x + BUILDING_SIZE.width / 2, y: abs.y + BUILDING_SIZE.height / 2 })
        if ((target?.id ?? undefined) === n.parentId) return n
        changed = true
        const { parentId: _p, ...rest } = n
        return target ? ({ ...rest, parentId: target.id, position: { x: abs.x - target.position.x, y: abs.y - target.position.y } } as MapNode) : ({ ...rest, position: abs } as MapNode)
      })
      if (changed) commit({ nodes: ordered(next) })
    },

    deleteElement: (id) => {
      const { nodes, edges } = get()
      if (nodes.some((n) => n.id === id)) {
        get().onNodesChange([{ type: 'remove', id }])
        set({ edges: get().edges.filter((x) => x.source !== id && x.target !== id) })
      } else if (edges.some((e) => e.id === id)) get().onEdgesChange([{ type: 'remove', id }])
    },

    deleteSelection: () => {
      const ids = get().nodes.filter((n) => n.selected).map((n) => n.id)
      const edgeIds = get().edges.filter((e) => e.selected).map((e) => e.id)
      if (!ids.length && !edgeIds.length) return
      get().beginBatch()
      if (ids.length) get().onNodesChange(ids.map((id) => ({ type: 'remove' as const, id })))
      const gone = new Set(ids)
      set({ edges: get().edges.filter((e) => !gone.has(e.source) && !gone.has(e.target) && !edgeIds.includes(e.id)) })
      commit({})
    },

    select: (ids, focus = false) => {
      const want = new Set(ids)
      set((s) => ({
        nodes: s.nodes.map((n) => (!!n.selected !== want.has(n.id) ? { ...n, selected: want.has(n.id) } : n)),
        edges: s.edges.map((e) => (!!e.selected !== want.has(e.id) ? { ...e, selected: want.has(e.id) } : e)),
        focusRequest: focus ? s.focusRequest + 1 : s.focusRequest,
      }))
    },

    clearSelection: () => get().select([]),

    loadProject: (state) => {
      lastCoalesce = null
      set((s) => ({
        meta: state.meta,
        nodes: ordered(state.nodes),
        edges: state.edges,
        units: state.units,
        enemies: state.enemies,
        past: [],
        future: [],
        revision: s.revision + 1,
        focusRequest: s.focusRequest + 1,
      }))
    },

    undo: () => {
      const { past, future } = get()
      const prev = past[past.length - 1]
      if (!prev) return
      lastCoalesce = null
      set((s) => ({ ...prev, past: past.slice(0, -1), future: [strip(snapshot()), ...future], revision: s.revision + 1 }))
    },

    redo: () => {
      const { past, future } = get()
      const next = future[0]
      if (!next) return
      lastCoalesce = null
      set((s) => ({ ...next, past: [...past, strip(snapshot())], future: future.slice(1), revision: s.revision + 1 }))
    },

    setView: (view) => set({ view }),
    setSidePanel: (sidePanel) => set({ sidePanel }),
  }
})

export const projectOf = (s: ProjectState): ProjectState => ({ meta: s.meta, nodes: s.nodes, edges: s.edges, units: s.units, enemies: s.enemies })

export { uid }
