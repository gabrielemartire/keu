import { memo } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { AREA_STATUS_LABEL, TERRAIN_INFO } from '../../model/catalog'
import type { AreaNode } from '../../model/types'
import { fmt } from '../../engine/rates'
import { useLive } from '../../live/liveStore'
import { useStore } from '../../store/store'
import { Icon, UnitSymbol } from '../../ui/Icon'

export const AreaNodeView = memo(function AreaNodeView({ id, data, selected }: NodeProps<AreaNode>) {
  const v = useLive((s) => s.view?.areas[id])
  const severity = useLive((s) => s.checks?.worstByTarget.get(id))
  const beginBatch = useStore((s) => s.beginBatch)
  const control = v?.control ?? data.control
  const status = v?.status ?? 'nostro'
  // Control bar: blue share from the left, red share from the right.
  const ours = (control + 100) / 2
  return (
    <div className={`area-node st-${status}${selected ? ' selected' : ''}${v?.attacked ? ' attacked' : ''}`} style={{ ['--area' as string]: data.color }}>
      <NodeResizer isVisible={!!selected && !data.locked} minWidth={260} minHeight={150} color={data.color} onResizeStart={() => beginBatch()} handleClassName="area-resize-handle" />
      <div className="area-head">
        <span className="area-name">{data.name}</span>
        <span className="tag">{TERRAIN_INFO[data.terrain].label}</span>
        {data.locked && (
          <span className="tag" title="Terreno dell’esercitazione: non si sposta né si modifica">
            <Icon name="lock" size={10} /> fisso
          </span>
        )}
        {data.front && (
          <span className="tag tag-front">
            <Icon name="flag" size={11} /> Fronte
          </span>
        )}
        {severity && <span className={`dot sev-${severity}`} title="Vedi Verifiche" />}
        <span className="grow" />
        {v?.raided && (
          <span className="area-raid" title="Razzie nemiche nell’area">
            <Icon name="raid" size={13} /> razzie
          </span>
        )}
        <span className={`area-status s-${status}`} title={`Controllo ${fmt(control)}`}>
          {AREA_STATUS_LABEL[status]}
        </span>
      </div>
      <div className="area-control" title={`Controllo: ${fmt(control)} (da −100 nemico a +100 nostro)`}>
        <span className="area-control-ours" style={{ width: `${ours}%` }} />
      </div>
      {v && v.enemies.length > 0 && (
        <div className="area-enemies">
          <Icon name="swords" size={14} />
          {v.enemies.map((e) => (
            <span key={e.id} className={`enemy-chip${e.waiting ? ' waiting' : ''}`} title={e.waiting ? `${e.name} · accampata, in attesa` : e.name}>
              <UnitSymbol type={e.type} hostile size={18} />
              {fmt(e.men)}
            </span>
          ))}
          {v.attacked && <span className="area-ratio">rapporto di forze {fmt(v.ratio * 100)}%</span>}
        </div>
      )}
    </div>
  )
})
