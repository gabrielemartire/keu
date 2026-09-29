import { useEffect, useState } from 'react'
import { ViewportPortal } from '@xyflow/react'
import { RESOURCE_INFO } from '../model/catalog'
import { RESOURCES } from '../model/types'
import { fmt } from '../engine/rates'
import type { Leg } from '../engine/sim'
import type { World } from '../engine/world'
import { SPEEDS, useLive } from './liveStore'
import { ResourceIcon, UnitSymbol } from '../ui/Icon'

function along(w: World, leg: Leg, idx: number, km: number) {
  let d = km
  for (let i = 0; i < idx && i < leg.edges.length; i++) d += w.routeKm.get(leg.edges[i]) ?? 0
  return d
}

function pointAt(w: World, leg: Leg, dist: number) {
  let left = dist
  for (let i = 0; i < leg.edges.length; i++) {
    const len = w.routeKm.get(leg.edges[i]) ?? 1
    const a = w.center.get(leg.nodes[i])
    const b = w.center.get(leg.nodes[i + 1])
    if (!a || !b) return null
    if (left <= len || i === leg.edges.length - 1) {
      const k = Math.max(0, Math.min(1, left / len))
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    }
    left -= len
  }
  return w.center.get(leg.nodes[0]) ?? null
}

/** Frame clock while the simulation runs: 0 → 1 across the current turn. */
function useTurnProgress() {
  const running = useLive((s) => s.running)
  const turnAt = useLive((s) => s.turnAt)
  const speed = useLive((s) => s.speed)
  const [f, setF] = useState(1)
  useEffect(() => {
    if (!running) {
      setF(1)
      return
    }
    let raf = 0
    const tick = () => {
      // Linear across the whole turn: a convoy keeps a steady pace from one turn to the next.
      setF(Math.min(1, (performance.now() - turnAt) / SPEEDS[speed].ms))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, turnAt, speed])
  return f
}

function convoyLook(w: World, cargo: Partial<Record<(typeof RESOURCES)[number], number>>, wounded: number, to: string) {
  const main = RESOURCES.reduce<{ r: (typeof RESOURCES)[number] | null; kg: number }>((best, r) => {
    const kg = (cargo[r] ?? 0) * RESOURCE_INFO[r].kg
    return kg > best.kg ? { r, kg } : best
  }, { r: null, kg: 0 })
  const color = wounded ? '#c0392b' : main.r ? RESOURCE_INFO[main.r].color : '#5b6b7f'
  const title = wounded
    ? `${fmt(wounded)} feriti → ${w.name(to)}`
    : `${RESOURCES.filter((r) => (cargo[r] ?? 0) > 0).map((r) => `${RESOURCE_INFO[r].label} ${fmt(cargo[r]!)} ${RESOURCE_INFO[r].unit}`).join(', ')} → ${w.name(to)}`
  return { color, title, icon: wounded ? ('feriti' as const) : main.r ?? ('carri' as const) }
}

export function Overlay() {
  const sim = useLive((s) => s.sim)
  const w = useLive((s) => s.world)
  const f = useTurnProgress()
  if (!sim || !w) return null
  const pos = (leg: Leg, prev: { idx: number; km: number } | null, k = f) => {
    const d1 = along(w, leg, leg.idx, leg.km)
    const d0 = prev ? along(w, leg, prev.idx, prev.km) : d1
    return pointAt(w, leg, d0 + (d1 - d0) * k)
  }
  return (
    <ViewportPortal>
      {sim.convoys.map((c) => {
        const p = pos(c.leg, c.prev)
        if (!p) return null
        const look = convoyLook(w, c.cargo, c.wounded.reduce((x, g) => x + g.count, 0), c.to)
        // Just dispatched: loading at the depot, it leaves at the next turn.
        const loading = c.departed === sim.turn
        return (
          <div key={c.id} className="convoy" style={{ transform: `translate(${p.x}px, ${p.y}px)`, opacity: loading ? 0.25 + 0.6 * f : 1, ['--c' as string]: look.color }} title={`${fmt(c.carts)} carri · ${look.title}`}>
            <ResourceIcon id={look.icon} size={10} color="#fff" />
            {c.carts > 1 && <span>{c.carts}</span>}
          </div>
        )
      })}
      {sim.arrived.map((a) => {
        const end = { ...a.leg, idx: a.leg.edges.length, km: 0 }
        // Reaches the end of the trip, then fades into the building.
        const p = pos(end, a.prev, Math.min(1, f / 0.8))
        if (!p) return null
        const fade = f < 0.8 ? 1 : Math.max(0, (1 - f) / 0.2)
        if (a.kind === 'unit')
          return (
            <div key={`a${a.id}`} className="marching" style={{ transform: `translate(${p.x}px, ${p.y}px)`, opacity: fade }}>
              <UnitSymbol type={a.type!} size={20} />
              <span>{fmt(a.men!)}</span>
            </div>
          )
        const look = convoyLook(w, a.cargo ?? {}, a.wounded ?? 0, a.leg.nodes[a.leg.nodes.length - 1])
        return (
          <div key={`a${a.id}`} className="convoy" style={{ transform: `translate(${p.x}px, ${p.y}px)`, opacity: fade, ['--c' as string]: look.color }}>
            <ResourceIcon id={look.icon} size={10} color="#fff" />
            {(a.carts ?? 0) > 1 && <span>{a.carts}</span>}
          </div>
        )
      })}
      {Object.values(sim.enemies).map((e) => {
        const m = e.march
        if (!m || e.routed) return null
        const a = w.areaCenter.get(m.from)
        const b = w.areaCenter.get(m.to)
        if (!a || !b) return null
        const k = (m.prev + (m.done - m.prev) * f) / m.km
        const x = a.x + (b.x - a.x) * k
        const y = a.y + (b.y - a.y) * k
        return (
          <div key={e.id} className="marching hostile" style={{ transform: `translate(${x}px, ${y}px)`, opacity: m.arrived && f > 0.8 ? (1 - f) / 0.2 : 1 }} title={`${e.name} marcia verso ${w.name(m.to)}`}>
            <UnitSymbol type={e.type} hostile size={20} />
            <span>{fmt(e.men)}</span>
          </div>
        )
      })}
      {Object.values(sim.units).map((u) => {
        if (!u.leg || u.status === 'distrutto') return null
        const p = pos(u.leg, u.prev)
        if (!p) return null
        return (
          <div key={u.id} className={`marching${u.retreating ? ' retreat' : ''}`} style={{ transform: `translate(${p.x}px, ${p.y}px)` }} title={`${u.name} in marcia verso ${u.dest ? w.name(u.dest) : '?'}`}>
            <UnitSymbol type={u.type} size={20} />
            <span>{fmt(u.men)}</span>
          </div>
        )
      })}
    </ViewportPortal>
  )
}
