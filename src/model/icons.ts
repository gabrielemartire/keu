import type { BuildingKind, ResourceId } from './types'

/** 24×24 stroke pictograms: plain signage, readable at 16 px. */
export const BUILDING_ICON_PATHS: Record<BuildingKind, string> = {
  castello: 'M3 21V8h3v3h3V8h2v3h2V8h2v3h3V8h3v13z M10 21v-4a2 2 0 0 1 4 0v4',
  comando: 'M3 20L12 8l9 12z M12 8V2l5 2-5 2 M10 20l2-4 2 4',
  torre: 'M8 21l1-11h6l1 11z M7 10h10V6H7z M12 6V3 M4 3l2.5 1.5 M20 3l-2.5 1.5',
  schieramento: 'M4 20V9l2-3 2 3v11 M10 20V9l2-3 2 3v11 M16 20V9l2-3 2 3v11 M2 15h20',
  accampamento: 'M2 20l6-11 6 11z M8 20v-4 M13 13l4-6 5 13h-7',
  ospedale: 'M4 4h16v16H4z M12 8v8 M8 12h8',
  granaio: 'M3 21V10l9-6 9 6v11z M8 21v-6h8v6 M8 15l8 6 M16 15l-8 6',
  deposito: 'M3 12h8v9H3z M13 12h8v9h-8z M8 3h8v9H8z M7 12v3 M17 12v3 M12 3v3',
  parcocarri: 'M3 8h13v7H3z M16 11h5 M7 19a2 2 0 1 0 0-4a2 2 0 1 0 0 4 M14 19a2 2 0 1 0 0-4a2 2 0 1 0 0 4',
  villaggio: 'M3 20v-7l4-4 4 4v7z M13 20v-9l4-4 4 4v9z M6 20v-3h2v3 M16 20v-3h2v3',
  pozzo: 'M4 7l8-4 8 4 M12 3v8 M6 7v4 M18 7v4 M5 11h14 M6 11v9h12v-9 M9 15h6',
  fiume: 'M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0 M2 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0 M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
  taglialegna: 'M4 21l9-9 M11 10l2-6 5 1 1 5-6 2z M3 16h5 M14 21h7',
  frecciaio: 'M4 20L19 5 M13 5h6v6 M5 14v5h5 M3 17h3 M7 22v-3',
  fucina: 'M3 11h13c0 3-2 4-4 4v3h3v2H6v-2h3v-3c-3 0-6-2-6-4z M16 11h5 M15 3l4 4 M13 5l4-4',
}

export const RESOURCE_ICON_PATHS: Record<ResourceId | 'feriti' | 'carri', string> = {
  viveri: 'M4 13a8 5 0 0 1 16 0v5H4z M8 10l1 3 M12 9v4 M16 10l-1 3',
  acqua: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  foraggio: 'M12 21V10 M12 13L7 4 M12 13l5-9 M12 13L9.5 3 M12 13l2.5-10 M8 17h8',
  frecce: 'M4 20L20 4 M15 4h5v5 M4 20l1-4 M4 20l4-1 M7 17l-3-1 M7 17l1 3',
  armi: 'M20 4L9 15 M20 4v4 M20 4h-4 M6 12l6 6 M4 20l3-3',
  legname: 'M4 7h13a2.5 2.5 0 0 1 0 5H4a2.5 2.5 0 0 1 0-5z M7 14h13a2.5 2.5 0 0 1 0 5H7a2.5 2.5 0 0 1 0-5z',
  feriti: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  carri: 'M3 8h13v7H3z M16 11h5 M7 19a2 2 0 1 0 0-4a2 2 0 1 0 0 4 M14 19a2 2 0 1 0 0-4a2 2 0 1 0 0 4',
}
