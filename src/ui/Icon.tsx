import { UNIT_INFO } from '../model/catalog'
import { BUILDING_ICON_PATHS, RESOURCE_ICON_PATHS } from '../model/icons'
import type { BuildingKind, ResourceId, UnitType } from '../model/types'

const UI_ICONS = {
  new: 'M14 3H6v18h12V7z M14 3v4h4 M12 11v6 M9 14h6',
  open: 'M3 7V5h7l2 2h9v12H3z M3 7h18',
  save: 'M5 3h11l3 3v15H5z M8 3v5h8V3 M8 21v-7h8v7',
  undo: 'M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5 M20 9H9a5 5 0 0 0 0 10h3',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6',
  check: 'M4 12l5 5L20 6',
  error: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 7v6 M12 16.5h.01',
  warning: 'M12 3L2 20h20z M12 9v5 M12 17h.01',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 11v6 M12 7.5h.01',
  close: 'M6 6l12 12 M18 6L6 18',
  plus: 'M12 5v14 M5 12h14',
  area: 'M3 5h18v14H3z M3 9h18 M6 7h.01',
  focus: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5 M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z M9 4v14 M15 6v14',
  route: 'M6 19a2 2 0 1 0 0-4a2 2 0 1 0 0 4 M18 9a2 2 0 1 0 0-4a2 2 0 1 0 0 4 M8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h3v16H7z M14 4h3v16h-3z',
  next: 'M6 5l10 7-10 7z M18 5v14',
  restart: 'M4 12a8 8 0 1 0 2.3-5.6 M4 4v4h4',
  target: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M12 1v4 M12 19v4 M1 12h4 M19 12h4',
  flow: 'M3 7h11 M11 4l3 3-3 3 M21 17H10 M13 14l-3 3 3 3',
  fire: 'M12 21c-4 0-7-3-7-7 0-4 4-6 4-11 3 2 5 5 5 8 1-1 2-3 2-4 2 2 3 5 3 7 0 4-3 7-7 7z M12 21c-2 0-3-1.5-3-3.5S12 13 12 13s3 2.5 3 4.5-1 3.5-3 3.5z',
  skull: 'M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14z M9 12h.01 M15 12h.01 M10 20v-2 M14 20v-2',
  drop: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  broken: 'M3 12h6 M15 12h6 M9 8l2 4-2 4 M15 8l-2 4 2 4',
  raid: 'M4 20l7-7 M13 11l7-7 M14 4h6v6 M4 14l6 6 M3 17l4 4',
  rain: 'M7 15a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A4 4 0 1 1 17 15z M8 18l-1 3 M12 18l-1 3 M16 18l-1 3',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  fog: 'M4 9h16 M2 13h20 M5 17h14',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  swords: 'M4 4l10 10 M4 4v4 M4 4h4 M20 4L10 14 M20 4v4 M20 4h-4 M8 16l-4 4 M16 16l4 4 M6 14l4 4 M18 14l-4 4',
  flag: 'M5 21V4 M5 4h11l-2 4 2 4H5',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 7v5l3 2',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  dice: 'M4 4h16v16H4z M8.5 8.5h.01 M15.5 15.5h.01 M12 12h.01 M15.5 8.5h.01 M8.5 15.5h.01',
  chart: 'M4 20V4 M4 20h16 M8 16l4-5 3 3 5-7',
  report: 'M14 3H6v18h12V7z M14 3v4h4 M9 17v-3 M12 17v-6 M15 17v-4',
  compare: 'M8 4v16 M16 4v16 M4 8h8 M12 16h8',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',
  cart: 'M3 8h13v7H3z M16 11h5 M7 19a2 2 0 1 0 0-4a2 2 0 1 0 0 4 M14 19a2 2 0 1 0 0-4a2 2 0 1 0 0 4',
  cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  users: 'M9 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8 M2 21v-1a6 6 0 0 1 12 0v1 M16 3.5a4 4 0 0 1 0 7.5 M22 21v-1a6 6 0 0 0-4-5.6',
  scale: 'M12 3v18 M5 21h14 M5 7h14 M5 7l-3 7a3 3 0 0 0 6 0z M19 7l-3 7a3 3 0 0 0 6 0z',
  log: 'M5 4h14v16H5z M9 8h6 M9 12h6 M9 16h3',
  march: 'M5 12h11 M12 8l4 4-4 4 M19 5v14',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  wrench: 'M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 1-2-2z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
} as const

export type UiIconName = keyof typeof UI_ICONS

export function Icon({ name, size = 16, className }: { name: UiIconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={UI_ICONS[name]} />
    </svg>
  )
}

export function BuildingIcon({ kind, size = 20, color = 'currentColor' }: { kind: BuildingKind; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={BUILDING_ICON_PATHS[kind]} />
    </svg>
  )
}

export function ResourceIcon({ id, size = 14, color = 'currentColor' }: { id: ResourceId | 'feriti' | 'carri'; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={RESOURCE_ICON_PATHS[id]} />
    </svg>
  )
}

/**
 * Unit symbol in the spirit of NATO APP-6: friendly = blue rectangle,
 * hostile = red diamond; the inner mark tells the arm.
 */
export function UnitSymbol({ type, hostile = false, size = 22 }: { type: UnitType; hostile?: boolean; size?: number }) {
  const sym = UNIT_INFO[type].symbol
  const stroke = hostile ? '#b3261e' : '#1f4e79'
  const fill = hostile ? '#fbe3e1' : '#dbe8f5'
  const h = size * 0.7
  const mark = (() => {
    switch (sym) {
      case 'x':
        return <path d="M4 4L20 14 M20 4L4 14" />
      case 'slash':
        return <path d="M4 14L20 4" />
      case 'arrow':
        return <path d="M5 13L18 5 M13 5h5v4" />
      case 'bolt':
        return <path d="M5 13L18 5 M13 5h5v4 M8 7l3 4" />
      case 'bridge':
        return <path d="M5 13V8a7 4 0 0 1 14 0v5" />
      case 'dot':
        return <circle cx="12" cy="9" r="2.5" fill={stroke} stroke="none" />
    }
  })()
  if (hostile) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 1.5L22.5 12 12 22.5 1.5 12z" fill={fill} />
        <g transform="translate(0 3)">{mark}</g>
      </svg>
    )
  }
  return (
    <svg width={size} height={h} viewBox="0 0 24 18" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="1.5" y="1.5" width="21" height="15" fill={fill} />
      {mark}
    </svg>
  )
}
