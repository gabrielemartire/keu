import { useStore, projectOf } from './store'
import { importProject, projectToJson } from '../model/schema'

/**
 * Optional browser-local autosave (localStorage). Nothing leaves the device:
 * the app has no server-side storage, the JSON export is the real save file.
 */
const KEY = 'keu:autosave'
const PREF = 'keu:autosave-enabled'

export function isAutosaveEnabled(): boolean {
  try {
    return localStorage.getItem(PREF) !== '0'
  } catch {
    return false
  }
}

export function setAutosaveEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? '1' : '0')
    if (!on) localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
}

export function restoreAutosave(): boolean {
  if (!isAutosaveEnabled()) return false
  try {
    const text = localStorage.getItem(KEY)
    if (!text) return false
    const res = importProject(text)
    if (!res.ok) return false
    useStore.getState().loadProject(res.state)
    return true
  } catch {
    return false
  }
}

export function startAutosave(onSaved?: (at: Date) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return useStore.subscribe((s, prev) => {
    if (s.revision === prev.revision || !isAutosaveEnabled()) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, projectToJson(projectOf(useStore.getState())))
        onSaved?.(new Date())
      } catch {
        /* quota or privacy mode: ignore */
      }
    }, 800)
  })
}
