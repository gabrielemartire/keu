import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Background, BackgroundVariant, ConnectionLineType, ConnectionMode, Controls, MiniMap, ReactFlow, useReactFlow, type Node, type OnBeforeDelete } from '@xyflow/react'
import { BUILDING_INFO, PHASES, ROUTE_INFO, WEATHER_INFO } from '../model/catalog'
import type { AreaNode, BuildingKind, BuildingNode, MapNode, RouteEdge } from '../model/types'
import { turnLabel } from '../engine/sim'
import { live, SPEEDS, useLive } from '../live/liveStore'
import { Overlay } from '../live/Overlay'
import { useStore } from '../store/store'
import { Icon, type UiIconName } from '../ui/Icon'
import { BuildingNodeView } from './nodes/BuildingNodeView'
import { AreaNodeView } from './nodes/AreaNodeView'
import { RouteEdgeView } from './edges/RouteEdgeView'
import { fmt } from '../engine/rates'

const nodeTypes = { building: BuildingNodeView, area: AreaNodeView }
const edgeTypes = { route: RouteEdgeView }
export const DND_MIME = 'application/x-keu-item'

type Menu = { x: number; y: number; id: string; kind: 'building' | 'area' | 'route' }

export function Canvas() {
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const onNodesChange = useStore((s) => s.onNodesChange)
  const onEdgesChange = useStore((s) => s.onEdgesChange)
  const onConnect = useStore((s) => s.onConnect)
  const focusRequest = useStore((s) => s.focusRequest)
  const ordering = useLive((s) => s.ordering)
  const { screenToFlowPosition, fitView } = useReactFlow<MapNode, RouteEdge>()
  const wrapper = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const shown = useMemo(() => nodes.map((n) => (n.type === 'area' && n.data.locked ? { ...n, draggable: false, deletable: false } : n)), [nodes])

  useEffect(() => {
    if (!ordering) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useLive.setState({ ordering: null })
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ordering])

  useEffect(() => {
    if (focusRequest === 0) return
    // Wait a moment: right after a project loads the nodes are not measured yet and fitView would miss them.
    const id = setTimeout(() => {
      const selected = useStore.getState().nodes.filter((n) => n.selected).map((n) => ({ id: n.id }))
      fitView({ nodes: selected.length ? selected : undefined, padding: selected.length ? 0.8 : 0.12, duration: 350, maxZoom: 1.3 })
    }, 80)
    return () => clearTimeout(id)
  }, [focusRequest, fitView])

  const onNodeClick = useCallback((_: ReactMouseEvent, node: MapNode) => {
    const unitId = useLive.getState().ordering
    if (unitId && node.type === 'building') {
      live.act({ type: 'ordine', unitId, nodeId: node.id })
      useLive.setState({ ordering: null })
    }
  }, [])

  const openMenu = (e: ReactMouseEvent, id: string, kind: Menu['kind']) => {
    e.preventDefault()
    const box = wrapper.current!.getBoundingClientRect()
    setMenu({ x: e.clientX - box.left, y: e.clientY - box.top, id, kind })
  }

  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(DND_MIME)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      const item = e.dataTransfer.getData(DND_MIME)
      if (!item) return
      e.preventDefault()
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      if (item === 'area') useStore.getState().addArea(pos)
      else if (item === 'nemico') useStore.getState().dropEnemy(pos)
      else if (item in BUILDING_INFO) useStore.getState().addBuilding(item as BuildingKind, pos)
    },
    [screenToFlowPosition],
  )

  /** Deleting an area must not delete the buildings inside it. */
  const onBeforeDelete: OnBeforeDelete<MapNode, RouteEdge> = useCallback(async ({ nodes: del, edges: delEdges }) => {
    const explicit = new Set(useStore.getState().nodes.filter((n) => n.selected).map((n) => n.id))
    const keptNodes = del.filter((n) => explicit.has(n.id) || n.type === 'area')
    const keptIds = new Set(keptNodes.map((n) => n.id))
    const keptEdges = delEdges.filter((e) => e.selected || keptIds.has(e.source) || keptIds.has(e.target))
    if (keptNodes.length || keptEdges.length) useStore.getState().beginBatch()
    return { nodes: keptNodes, edges: keptEdges }
  }, [])

  return (
    <div className={`canvas${ordering ? ' picking' : ''}`} ref={wrapper} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow<MapNode, RouteEdge>
        nodes={shown}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeContextMenu={(e, n) => openMenu(e, n.id, n.type === 'area' ? 'area' : 'building')}
        onEdgeContextMenu={(e, ed) => openMenu(e, ed.id, 'route')}
        onPaneClick={() => setMenu(null)}
        onMoveStart={() => setMenu(null)}
        onBeforeDelete={onBeforeDelete}
        onNodeDragStart={() => useStore.getState().beginBatch()}
        onNodeDragStop={(_, _n, dragged) => useStore.getState().reparent(dragged.filter((n) => n.type === 'building').map((n) => n.id))}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.Straight}
        connectionLineStyle={{ stroke: '#1f4e79', strokeWidth: 2, strokeDasharray: '4 3' }}
        snapToGrid
        snapGrid={[8, 8]}
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode={['Meta', 'Shift']}
        minZoom={0.08}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        proOptions={{ hideAttribution: true }}
        elevateNodesOnSelect={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#c9ced6" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap<MapNode>
          pannable
          zoomable
          position="bottom-right"
          nodeStrokeWidth={2}
          nodeColor={(n: Node) => (n.type === 'area' ? `${(n as AreaNode).data.color}22` : BUILDING_INFO[(n as BuildingNode).data.kind].color)}
          nodeStrokeColor={(n: Node) => (n.type === 'area' ? (n as AreaNode).data.color : 'transparent')}
          maskColor="rgba(240,242,245,0.7)"
        />
        <Overlay />
      </ReactFlow>
      <ClockBar />
      {ordering && <OrderBanner unitId={ordering} />}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {nodes.length === 0 && (
        <div className="canvas-empty">
          <h2>Campo vuoto</h2>
          <p>
            Trascina un’<strong>area geografica</strong>, poi gli <strong>edifici</strong> dalla palette a sinistra.
          </p>
          <p>Collega gli edifici trascinando da un bordo all’altro: nasce una strada. Oppure apri l’esempio da <em>Nuovo</em>.</p>
        </div>
      )}
    </div>
  )
}

function OrderBanner({ unitId }: { unitId: string }) {
  const name = useLive((s) => s.current?.units[unitId]?.name ?? 'Reparto')
  return (
    <div className="pick-banner">
      <Icon name="march" size={14} /> Clicca l’edificio dove mandare <strong>{name}</strong> · <kbd>Esc</kbd> annulla
    </div>
  )
}

/** Simulation clock: play / pause / step / speed, day and phase, weather. */
function ClockBar() {
  const sim = useLive((s) => s.sim)
  const running = useLive((s) => s.running)
  const speed = useLive((s) => s.speed)
  const showFlows = useLive((s) => s.showFlows)
  const showCritical = useLive((s) => s.showCritical)
  const turn = sim?.turn ?? 0
  const { day, phase } = turnLabel(turn)
  const weather = sim?.weather ?? 'sereno'
  const wIcon: UiIconName = weather === 'pioggia' ? 'rain' : weather === 'nebbia' ? 'fog' : 'sun'
  const last = sim?.series[sim.series.length - 1]
  return (
    <div className="clockbar">
      <button className={`btn btn-sm ${running ? '' : 'btn-primary'}`} onClick={live.toggle} title={running ? 'Pausa (spazio)' : 'Avvia: il flusso si muove da solo (spazio)'}>
        <Icon name={running ? 'pause' : 'play'} size={14} /> {running ? 'Pausa' : sim ? 'Riprendi' : 'Avvia'}
      </button>
      <button className="btn btn-sm btn-icon" onClick={live.stepOnce} title="Avanza di un turno (6 ore)">
        <Icon name="next" size={14} />
      </button>
      <div className="segmented segmented-sm" title="Velocità">
        {SPEEDS.map((s, i) => (
          <button key={s.label} className={speed === i ? 'on' : ''} onClick={() => live.setSpeed(i)}>
            {s.label}
          </button>
        ))}
      </div>
      <span className="clock">
        <Icon name="clock" size={14} />
        {sim ? (
          <>
            <strong>Giorno {day}</strong> · {PHASES[phase]}
          </>
        ) : (
          <span className="muted">Pianificazione</span>
        )}
      </span>
      <span className="clock-weather" title={WEATHER_INFO[weather].label}>
        <Icon name={wIcon} size={15} />
      </span>
      {last && sim && (
        <span className="clock-stats" title="Carri liberi / totali · convogli in viaggio">
          <Icon name="cart" size={14} /> {fmt(last.cartsFree)}/{fmt(last.cartsTotal)} · {fmt(last.convoys)} convogli
        </span>
      )}
      {sim && (
        <button className="btn btn-sm" onClick={live.reset} title="Torna alla pianificazione (turno 0)">
          <Icon name="restart" size={14} /> Azzera
        </button>
      )}
      <span className="clock-sep" />
      {!sim && (
        <label className="clock-toggle" title="Mostra i flussi teorici di rifornimento sui percorsi">
          <input type="checkbox" checked={showFlows} onChange={(e) => useLive.setState({ showFlows: e.target.checked })} /> Flussi
        </label>
      )}
      <label className="clock-toggle" title="Evidenzia i punti critici: percorsi ed edifici la cui perdita spezza la rete">
        <input type="checkbox" checked={showCritical} onChange={(e) => useLive.setState({ showCritical: e.target.checked })} /> Punti critici
      </label>
    </div>
  )
}

function ContextMenu({ menu, onClose }: { menu: Menu; onClose: () => void }) {
  const project = useStore()
  const view = useLive((s) => s.view)
  const current = useLive((s) => s.current)
  const setSidePanel = useStore((s) => s.setSidePanel)
  useEffect(() => {
    const close = (e: Event) => {
      if (!(e.target as HTMLElement).closest?.('.ctx-menu')) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const act = (fn: () => void) => () => {
    fn()
    onClose()
  }
  const items: { icon: UiIconName; label: string; run: () => void; danger?: boolean }[] = []
  if (menu.kind === 'building') {
    const b = project.nodes.find((n) => n.id === menu.id) as BuildingNode | undefined
    if (!b) return null
    const v = view?.buildings[menu.id]
    items.push({ icon: 'fire', label: 'Incendia il magazzino', run: () => live.act({ type: 'incendio', nodeId: menu.id }), danger: true })
    if (b.data.production.acqua > 0 || b.data.stock.acqua > 0) items.push({ icon: 'drop', label: 'Avvelena l’acqua (2 giorni)', run: () => live.act({ type: 'avvelena', nodeId: menu.id, turns: 8 }), danger: true })
    if (v?.units.length) items.push({ icon: 'skull', label: 'Scoppia un’epidemia (3 giorni)', run: () => live.act({ type: 'epidemia', nodeId: menu.id, turns: 12 }), danger: true })
    items.push({ icon: 'users', label: 'Arrivano rinforzi qui (300 fanti)', run: () => live.act({ type: 'rinforzi', nodeId: menu.id, men: 300, unitType: 'fanteria', name: 'Rinforzi' }) })
    items.push({ icon: 'box', label: 'Rifornimento d’emergenza (5 t viveri)', run: () => live.act({ type: 'rifornisci', nodeId: menu.id, resource: 'viveri', amount: 5000 }) })
    const units = Object.values(current?.units ?? {}).filter((u) => u.status !== 'distrutto' && u.nodeId !== menu.id)
    if (units.length) items.push({ icon: 'march', label: 'Manda qui un reparto…', run: () => setSidePanel('situazione') })
  } else if (menu.kind === 'route') {
    const r = project.edges.find((e) => e.id === menu.id)
    if (!r) return null
    const v = view?.routes[menu.id]
    const destroyable = ROUTE_INFO[r.data!.kind].destroyable
    if (v && !v.open) items.push({ icon: 'wrench', label: 'Ripara subito', run: () => live.act({ type: 'ripara', routeId: menu.id }) })
    else items.push({ icon: 'broken', label: destroyable ? 'Distruggi (ponte / chiatte)' : 'Interrompi (frana, alberi abbattuti)', run: () => live.act({ type: 'distruggi', routeId: menu.id }), danger: true })
    items.push({ icon: 'raid', label: 'Razzia nemica sul percorso (1 giorno)', run: () => live.act({ type: 'raid', routeId: menu.id, turns: 4, strength: 0.6 }), danger: true })
    items.push({ icon: 'shield', label: r.data!.escort ? 'Togli la scorta' : 'Assegna una scorta', run: () => useStore.getState().updateRoute(menu.id, { escort: !r.data!.escort }) })
  } else {
    const v = view?.areas[menu.id]
    items.push({ icon: 'swords', label: 'Attacco nemico qui (1.500 fanti)', run: () => live.act({ type: 'attacco', areaId: menu.id, men: 1500, unitType: 'fanteria', behavior: 'tieni', name: 'Assalto nemico' }), danger: true })
    items.push({ icon: 'swords', label: 'Carica di cavalleria (400)', run: () => live.act({ type: 'attacco', areaId: menu.id, men: 400, unitType: 'cavalleria', behavior: 'avanza', name: 'Cavalleria nemica' }), danger: true })
    items.push({ icon: 'raid', label: 'Razzie nell’area (2 giorni)', run: () => live.act({ type: 'raid', areaId: menu.id, turns: 8, strength: 0.5 }), danger: true })
    if (v?.status === 'nemico') items.push({ icon: 'flag', label: 'Riconquista l’area', run: () => live.act({ type: 'controllo', areaId: menu.id, control: 60 }) })
    else items.push({ icon: 'flag', label: 'L’area cade in mano nemica', run: () => live.act({ type: 'controllo', areaId: menu.id, control: -100 }), danger: true })
  }
  const weather = current?.weather ?? 'sereno'
  items.push({ icon: weather === 'pioggia' ? 'sun' : 'rain', label: weather === 'pioggia' ? 'Torna il sereno' : 'Inizia a piovere (2 giorni)', run: () => live.act({ type: 'meteo', weather: weather === 'pioggia' ? 'sereno' : 'pioggia', turns: 8 }) })
  return (
    <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} role="menu">
      <div className="ctx-title">Cambia la situazione</div>
      {items.map((it) => (
        <button key={it.label} className={it.danger ? 'danger' : ''} onClick={act(it.run)}>
          <Icon name={it.icon} size={14} /> {it.label}
        </button>
      ))}
    </div>
  )
}
