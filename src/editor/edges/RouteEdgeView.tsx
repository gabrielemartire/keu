import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps } from '@xyflow/react'
import { ROUTE_INFO } from '../../model/catalog'
import type { RouteEdge } from '../../model/types'
import { cartHours } from '../../engine/flow'
import { fmt, fmtHours } from '../../engine/rates'
import { floatingSegment } from '../../lib/geometry'
import { useLive } from '../../live/liveStore'
import { Icon } from '../../ui/Icon'

export const RouteEdgeView = memo(function RouteEdgeView({ id, source, target, data, selected }: EdgeProps<RouteEdge>) {
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  const v = useLive((st) => st.view?.routes[id])
  const running = useLive((st) => !!st.sim)
  const showFlows = useLive((st) => st.showFlows)
  const critical = useLive((st) => st.showCritical && !!st.checks?.critical.routes.has(id))
  const severity = useLive((st) => st.checks?.worstByTarget.get(id))
  const staticCarts = useLive((st) => st.checks?.flow.routeCarts.get(id) ?? 0)
  const km = useLive((st) => st.world?.routeKm.get(id))
  const hours = useLive((st) => {
    const r = st.world?.routeById.get(id)
    return r && st.world ? cartHours(st.world)(r) : undefined
  })
  if (!s || !t || !data) return null
  const rect = (n: typeof s) => ({ x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, width: n.measured.width ?? n.width ?? 0, height: n.measured.height ?? n.height ?? 0 })
  const { from, to } = floatingSegment(rect(s), rect(t))
  const style = ROUTE_INFO[data.kind]
  const path = `M ${from.x},${from.y} L ${to.x},${to.y}`
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2
  const capacity = v?.capacity ?? style.capacity
  const carts = running ? (v?.carts ?? 0) : showFlows ? staticCarts : 0
  const load = carts / capacity
  const closed = v && !v.open
  const color = closed ? '#9aa3ad' : style.color
  return (
    <>
      {critical && <path d={path} stroke="#f28c28" strokeWidth={style.width + 12} strokeOpacity={0.35} fill="none" strokeLinecap="round" />}
      {selected && <path d={path} stroke="#f2b01e" strokeWidth={style.width + 7} strokeOpacity={0.5} fill="none" />}
      {carts > 0.05 && !closed && (
        <path
          d={path}
          className="route-load"
          stroke={load > 1 ? '#c62828' : load > 0.8 ? '#e39b00' : '#2e6f95'}
          strokeWidth={style.width + 3 + Math.min(12, load * 12)}
          strokeOpacity={0.22}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {v?.raided && <path d={path} className="route-raid" strokeWidth={style.width + 6} fill="none" />}
      <BaseEdge id={id} path={path} interactionWidth={16} style={{ stroke: color, strokeWidth: style.width, strokeDasharray: closed ? '3 6' : style.dash?.join(' ') }} />
      <EdgeLabelRenderer>
        {v?.destroyed ? (
          <div className="route-mark bad nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)` }} title="Distrutto: servono i genieri">
            <Icon name="broken" size={13} />
            {v.repair > 0 && <span>{fmt(v.repair * 100)}%</span>}
          </div>
        ) : closed ? (
          <div className="route-mark warn nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)` }} title="Interrotto">
            <Icon name="close" size={12} />
          </div>
        ) : (
          <div
            className={`route-label${selected ? ' selected' : ''}${severity === 'error' ? ' error' : ''}${load > 1 ? ' over' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)` }}
          >
            {km !== undefined && `${fmt(km, 1)} km`}
            {hours !== undefined && <span className="muted"> · {fmtHours(hours)}</span>}
            {carts > 0.05 && (
              <span className="route-carts">
                {' '}
                · {fmt(carts, 1)}/{fmt(capacity)} carri
              </span>
            )}
            {data.escort && <span title="Scortato"> · ⛨</span>}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
})
