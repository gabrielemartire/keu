import type { DragEvent } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BUILDING_GROUPS, BUILDING_INFO, ROUTE_INFO } from '../model/catalog'
import { BUILDING_KINDS, ROUTE_KINDS, type BuildingKind } from '../model/types'
import { DND_MIME } from '../editor/Canvas'
import { useStore } from '../store/store'
import { BuildingIcon, Icon, UnitSymbol } from './Icon'
import { AreaTip, BuildingTip, EnemyTip, RouteTip } from './InfoTip'

function startDrag(e: DragEvent, item: string) {
  e.dataTransfer.setData(DND_MIME, item)
  e.dataTransfer.effectAllowed = 'copy'
}

export function Palette() {
  const { screenToFlowPosition } = useReactFlow()
  const centre = () => {
    const el = document.querySelector('.canvas')?.getBoundingClientRect()
    return screenToFlowPosition({ x: (el?.left ?? 0) + (el?.width ?? 800) / 2, y: (el?.top ?? 0) + (el?.height ?? 600) / 2 })
  }
  const add = (k: BuildingKind) => useStore.getState().addBuilding(k, centre())
  return (
    <aside className="palette">
      <div className="palette-group">
        <h4>Territorio</h4>
        <button className="palette-item" draggable onDragStart={(e) => startDrag(e, 'area')} onClick={() => useStore.getState().addArea(centre())} title="Trascina sul foglio o fai clic">
          <span className="palette-icon area">
            <Icon name="area" size={18} />
          </span>
          Area geografica
          <AreaTip />
        </button>
      </div>
      <div className="palette-group">
        <h4>Nemico</h4>
        <button className="palette-item" draggable onDragStart={(e) => startDrag(e, 'nemico')} title="Trascina dentro un’area">
          <span className="palette-icon enemy">
            <UnitSymbol type="fanteria" hostile size={18} />
          </span>
          Schiera nemica
          <EnemyTip />
        </button>
      </div>
      {BUILDING_GROUPS.map((g) => (
        <div className="palette-group" key={g}>
          <h4>{g}</h4>
          {BUILDING_KINDS.filter((k) => BUILDING_INFO[k].group === g).map((k) => (
            <button key={k} className="palette-item" draggable onDragStart={(e) => startDrag(e, k)} onClick={() => add(k)} title="Trascina dentro un’area o fai clic">
              <span className="palette-icon" style={{ background: BUILDING_INFO[k].color }}>
                <BuildingIcon kind={k} size={16} color="#fff" />
              </span>
              {BUILDING_INFO[k].label}
              <BuildingTip kind={k} />
            </button>
          ))}
        </div>
      ))}
      <div className="palette-group route-legend">
        <h4>Percorsi</h4>
        {ROUTE_KINDS.map((t) => (
          <div key={t} className="legend-row">
            <svg width="34" height="10">
              <line x1="2" y1="5" x2="32" y2="5" stroke={ROUTE_INFO[t].color} strokeWidth={ROUTE_INFO[t].width} strokeDasharray={ROUTE_INFO[t].dash?.join(' ')} />
            </svg>
            {ROUTE_INFO[t].label}
            <RouteTip kind={t} />
          </div>
        ))}
        <p className="palette-hint">Trascina da un bordo di un edificio all’altro per creare un percorso.</p>
      </div>
    </aside>
  )
}
