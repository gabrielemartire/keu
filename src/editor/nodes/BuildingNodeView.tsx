import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { BUILDING_INFO, RESOURCE_INFO } from '../../model/catalog'
import type { BuildingNode, ResourceId } from '../../model/types'
import { fmt, fmtDays } from '../../engine/rates'
import { useLive } from '../../live/liveStore'
import { BuildingIcon, Icon, ResourceIcon, UnitSymbol } from '../../ui/Icon'

const SIDES = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
]

/** Which three resources matter most for a kind of building. */
function keyResources(kind: BuildingNode['data']['kind'], hasHorses: boolean): ResourceId[] {
  switch (kind) {
    case 'pozzo':
    case 'fiume':
      return ['acqua']
    case 'granaio':
      return ['viveri', 'foraggio']
    case 'deposito':
      return ['frecce', 'armi', 'legname']
    case 'taglialegna':
      return ['legname']
    case 'frecciaio':
      return ['legname', 'frecce']
    case 'fucina':
      return ['legname', 'armi']
    case 'schieramento':
      return ['viveri', 'acqua', 'frecce']
    case 'parcocarri':
      return ['foraggio']
    default:
      return hasHorses ? ['viveri', 'acqua', 'foraggio'] : ['viveri', 'acqua', 'legname']
  }
}

const tone = (fill: number) => (!Number.isFinite(fill) ? 'na' : fill >= 0.75 ? 'ok' : fill >= 0.35 ? 'mid' : fill > 0.05 ? 'low' : 'out')
const moraleTone = (m: number) => (m >= 60 ? 'ok' : m >= 35 ? 'mid' : 'low')

export const BuildingNodeView = memo(function BuildingNodeView({ id, data, selected }: NodeProps<BuildingNode>) {
  const v = useLive((s) => s.view?.buildings[id])
  const severity = useLive((s) => s.checks?.worstByTarget.get(id))
  const critical = useLive((s) => s.showCritical && !!s.checks?.critical.nodes.has(id))
  const ordering = useLive((s) => !!s.ordering)
  const info = BUILDING_INFO[data.kind]
  const hasHorses = !!v?.units.some((u) => u.type === 'cavalleria')
  const res = keyResources(data.kind, hasHorses)
  const cls = [
    'b-node',
    selected && 'selected',
    v?.seized && 'is-seized',
    v?.burned && 'is-burned',
    critical && 'is-critical',
    ordering && 'is-pickable',
  ]
    .filter(Boolean)
    .join(' ')
  const auto = v?.autonomyDays ?? Infinity
  return (
    <div className={cls} style={{ ['--kind' as string]: info.color }}>
      {SIDES.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} className="b-handle" />
      ))}
      <div className="b-icon">
        <BuildingIcon kind={data.kind} size={22} color="#fff" />
      </div>
      <div className="b-text">
        <div className="b-name" title={data.name}>
          {data.name || info.label}
        </div>
        <div className="b-bars">
          {res.map((r) => (
            <span key={r} className={`b-bar t-${tone(v?.fill[r] ?? Infinity)}`} title={`${RESOURCE_INFO[r].label}: ${fmt(v?.stock[r] ?? 0)} ${RESOURCE_INFO[r].unit}`}>
              <ResourceIcon id={r} size={11} />
              <span className="b-bar-track">
                <span className="b-bar-fill" style={{ width: `${Math.min(100, Number.isFinite(v?.fill[r] ?? Infinity) ? (v!.fill[r] * 100) : 100)}%` }} />
              </span>
            </span>
          ))}
          {Number.isFinite(auto) && (
            <span className={`b-auto t-${auto >= 2 ? 'ok' : auto >= 1 ? 'mid' : 'low'}`} title={`Autonomia con le scorte presenti (${v?.short ? RESOURCE_INFO[v.short].label.toLowerCase() : ''})`}>
              {fmtDays(auto)}
            </span>
          )}
        </div>
      </div>
      {v && v.units.length > 0 && (
        <div className="b-units">
          {v.units.slice(0, 4).map((u) => (
            <span key={u.id} className={`b-unit m-${moraleTone(u.morale)}${u.status === 'combatte' ? ' fighting' : ''}`} title={`${u.name} · ${fmt(u.men)} uomini · morale ${fmt(u.morale)}`}>
              <UnitSymbol type={u.type} size={18} />
              {fmt(u.men)}
            </span>
          ))}
          {v.units.length > 4 && <span className="b-unit">+{v.units.length - 4}</span>}
        </div>
      )}
      <div className="b-flags">
        {v?.seized && <span className="b-flag bad">In mano nemica</span>}
        {v?.burned && (
          <span className="b-flag bad">
            <Icon name="fire" size={11} /> Incendiato
          </span>
        )}
        {v?.poisoned && <span className="b-flag bad">Acqua avvelenata</span>}
        {v?.epidemic && <span className="b-flag warn">Epidemia</span>}
        {v?.cutOff && !v.seized && v.units.length > 0 && <span className="b-flag warn">Senza ordini</span>}
      </div>
      {v && v.wounded + v.patients > 0 && (
        <span className={`b-wounded${info.hospital ? ' hospital' : ''}`} title={info.hospital ? `${fmt(v.patients)} ricoverati su ${fmt(data.beds)} letti` : `${fmt(v.wounded)} feriti in attesa di trasporto`}>
          <ResourceIcon id="feriti" size={10} color="#fff" />
          {fmt(info.hospital ? v.patients : v.wounded)}
        </span>
      )}
      {severity && <span className={`b-badge sev-${severity}`} title="Vedi Verifiche" />}
    </div>
  )
})
