import type { Weather } from '../model/catalog'
import type { EnemyBehavior, ResourceId, UnitType } from '../model/types'

/** Something that changes the situation: from a scenario, or from the user while the simulation runs. */
export type SimEvent =
  | { type: 'incendio'; nodeId: string }
  | { type: 'avvelena'; nodeId: string; turns: number }
  | { type: 'distruggi'; routeId: string }
  | { type: 'ripara'; routeId: string }
  | { type: 'raid'; routeId?: string; areaId?: string; turns: number; strength: number }
  | { type: 'meteo'; weather: Weather; turns: number }
  | { type: 'epidemia'; nodeId: string; turns: number }
  | { type: 'attacco'; areaId: string; men: number; unitType: UnitType; behavior: EnemyBehavior; name: string }
  | { type: 'rinforzi'; nodeId: string; men: number; unitType: UnitType; name: string }
  | { type: 'ordine'; unitId: string; nodeId: string }
  | { type: 'controllo'; areaId: string; control: number }
  | { type: 'rifornisci'; nodeId: string; resource: ResourceId; amount: number }

export interface ScheduledEvent {
  turn: number
  event: SimEvent
}

export const EVENT_LABEL: Record<SimEvent['type'], string> = {
  incendio: 'Incendio',
  avvelena: 'Acqua avvelenata',
  distruggi: 'Percorso distrutto',
  ripara: 'Percorso riparato',
  raid: 'Razzia nemica',
  meteo: 'Meteo',
  epidemia: 'Epidemia',
  attacco: 'Attacco nemico',
  rinforzi: 'Rinforzi',
  ordine: 'Ordine',
  controllo: 'Controllo area',
  rifornisci: 'Rifornimento d’emergenza',
}
