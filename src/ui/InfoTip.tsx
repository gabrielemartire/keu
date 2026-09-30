import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BUILDING_INFO, CART_KMH, PRIORITY_LABEL, RECIPES, RESOURCE_INFO, ROUTE_INFO, TERRAIN_INFO, UNIT_INFO } from '../model/catalog'
import { RESOURCES, TERRAINS, UNIT_TYPES, type BuildingKind, type RouteKind, type Stock } from '../model/types'
import { fmt } from '../engine/rates'

/**
 * Small “i” next to a palette entry: on hover (or focus) it opens a card beside
 * the palette with what the element does and its default numbers.
 */
export function InfoTip({ title, children }: { title: string; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)

  const show = () => {
    const r = anchor.current!.getBoundingClientRect()
    const side = anchor.current!.closest('.palette')?.getBoundingClientRect().right ?? r.right
    setAt({ x: side + 8, y: r.top - 10 })
  }
  // Keep the card inside the window once its height is known.
  useLayoutEffect(() => {
    if (!at || !card.current) return
    const h = card.current.offsetHeight
    const y = Math.max(8, Math.min(at.y, window.innerHeight - h - 8))
    if (y !== at.y) setAt({ ...at, y })
  }, [at])

  return (
    <>
      <span
        ref={anchor}
        className="info-tip"
        role="button"
        tabIndex={0}
        aria-label={`Informazioni: ${title}`}
        onMouseEnter={show}
        onMouseLeave={() => setAt(null)}
        onFocus={show}
        onBlur={() => setAt(null)}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          if (at) setAt(null)
          else show()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        draggable={false}
      >
        i
      </span>
      {at &&
        createPortal(
          <div ref={card} className="info-card" style={{ left: at.x, top: at.y }} role="tooltip">
            <h4>{title}</h4>
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}

function Stats({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="info-stats">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const stockText = (s: Partial<Stock>) =>
  RESOURCES.filter((r) => (s[r] ?? 0) > 0)
    .map((r) => `${RESOURCE_INFO[r].label.toLowerCase()} ${fmt(s[r]!)} ${RESOURCE_INFO[r].unit}`)
    .join(', ')

export function BuildingTip({ kind }: { kind: BuildingKind }) {
  const info = BUILDING_INFO[kind]
  const d = info.defaults
  const recipe = RECIPES[kind]
  const roles = [
    info.command && 'dà gli ordini: i reparti che non raggiunge perdono morale',
    info.relay && 'i messaggi sui percorsi collegati viaggiano quasi istantanei',
    info.rest && 'i reparti riforniti qui recuperano il morale',
    info.hospital && 'i feriti curati in tempo tornano al reparto',
  ].filter(Boolean)
  const rows: [string, ReactNode][] = [
    ['Presidio', d.garrison ? `${fmt(d.garrison)} uomini` : '—'],
    ['Magazzino', `${fmt(d.capacityT)} t`],
    ['Fortificazione', `${d.fortification}/3`],
    ['Priorità', PRIORITY_LABEL[d.priority]],
  ]
  if (d.carts) rows.push(['Carri', fmt(d.carts)])
  if (d.beds) rows.push(['Letti', fmt(d.beds)])
  if (stockText(d.stock)) rows.push(['Scorte iniziali', stockText(d.stock)])
  if (stockText(d.production)) rows.push(['Produce a turno', stockText(d.production)])
  if (recipe) rows.push(['Lavora a turno', `${stockText(recipe.in)} → ${stockText(recipe.out)}`])
  return (
    <InfoTip title={info.label}>
      <p>{info.description}</p>
      {roles.length > 0 && <p className="info-roles">In più: {roles.join('; ')}.</p>}
      <Stats rows={rows} />
      <p className="info-foot">Valori di partenza: li cambi per ogni edificio nelle Proprietà.</p>
    </InfoTip>
  )
}

export function RouteTip({ kind }: { kind: RouteKind }) {
  const r = ROUTE_INFO[kind]
  return (
    <InfoTip title={r.label}>
      <p>Collega due edifici. I carri la percorrono alla velocità e con la capacità qui sotto; i reparti in marcia la usano anche loro.</p>
      <Stats
        rows={[
          ['Velocità carro', `${fmt(CART_KMH * r.speed, 1)} km/h`],
          ['Capacità', `${fmt(r.capacity)} carri a turno`],
          ['Con la pioggia', `velocità ×${fmt(r.rain, 2)}`],
          ['Rischio imboscate', `${fmt(r.exposure * 100)}%`],
          ['Distruggibile', r.destroyable ? 'sì (i genieri la ricostruiscono)' : 'no'],
        ]}
      />
    </InfoTip>
  )
}

export function AreaTip() {
  return (
    <InfoTip title="Area geografica">
      <p>Un pezzo di territorio: contiene gli edifici e ha un controllo da +100 (nostro) a −100 (nemico). Contesa: produzione dimezzata e convogli a rischio. Perduta: edifici e scorte catturati, percorsi chiusi.</p>
      <p>Il terreno cambia la battaglia:</p>
      <table className="info-table">
        <thead>
          <tr>
            <th>Terreno</th>
            <th>Difesa</th>
            <th>Cavalleria</th>
          </tr>
        </thead>
        <tbody>
          {TERRAINS.map((t) => (
            <tr key={t}>
              <td>{TERRAIN_INFO[t].label}</td>
              <td>×{fmt(TERRAIN_INFO[t].defense, 2)}</td>
              <td>×{fmt(TERRAIN_INFO[t].cavalry, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </InfoTip>
  )
}

export function EnemyTip() {
  return (
    <InfoTip title="Schiera nemica">
      <p>Trascinala dentro un’area: si accampa lì. Poi scegli quale area attacca e da che turno (nelle Proprietà dell’area o nella scheda Nemici). Al turno di partenza marcia in linea retta, arriva e combatte ogni turno. Si ritira quando perde il 45% degli uomini.</p>
      <table className="info-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Forza per uomo</th>
            <th>Marcia</th>
          </tr>
        </thead>
        <tbody>
          {UNIT_TYPES.map((t) => (
            <tr key={t}>
              <td>{UNIT_INFO[t].label}</td>
              <td>×{fmt(UNIT_INFO[t].power, 1)}</td>
              <td>{fmt(UNIT_INFO[t].marchKmh, 1)} km/h</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="info-foot">Il nemico combatte all’85% del valore dei nostri stessi uomini. Arcieri e balestrieri senza frecce valgono circa un terzo.</p>
    </InfoTip>
  )
}
