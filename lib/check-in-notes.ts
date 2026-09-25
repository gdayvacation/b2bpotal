import { dayBoatPlanKey, type Program } from '@/lib/types'

export const CHECK_IN_NOTE_STORAGE_KEY = 'gday-check-in-notes'

const STORAGE_KEY = CHECK_IN_NOTE_STORAGE_KEY

/** date|program → booking code → marina note */
export type DayCheckInNoteMap = Record<string, Record<string, string>>

export function loadCheckInNoteMap(): DayCheckInNoteMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: DayCheckInNoteMap = {}
    for (const [dayKey, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== 'object') continue
      const notes: Record<string, string> = {}
      for (const [code, value] of Object.entries(row as Record<string, unknown>)) {
        const text = typeof value === 'string' ? value.trim() : ''
        if (text) notes[code] = text
      }
      if (Object.keys(notes).length > 0) next[dayKey] = notes
    }
    return next
  } catch {
    return {}
  }
}

export function saveCheckInNoteMap(map: DayCheckInNoteMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function getCheckInNote(
  map: DayCheckInNoteMap,
  date: string,
  program: Program,
  bookingCode: string,
): string {
  return map[dayBoatPlanKey(date, program)]?.[bookingCode] ?? ''
}

export function withCheckInNote(
  map: DayCheckInNoteMap,
  date: string,
  program: Program,
  bookingCode: string,
  note: string,
): DayCheckInNoteMap {
  const key = dayBoatPlanKey(date, program)
  const day = { ...(map[key] ?? {}) }
  const text = note.trim()
  if (!text) delete day[bookingCode]
  else day[bookingCode] = text
  const next = { ...map }
  if (Object.keys(day).length === 0) delete next[key]
  else next[key] = day
  return next
}
