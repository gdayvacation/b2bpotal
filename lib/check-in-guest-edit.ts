import { dayBoatPlanKey, type Program } from '@/lib/types'

export const CHECK_IN_GUEST_EDIT_STORAGE_KEY = 'gday-check-in-guest-edit'

const STORAGE_KEY = CHECK_IN_GUEST_EDIT_STORAGE_KEY

/** date|program → booking code → enrollment ids staff opened for phone edit */
export type DayCheckInGuestEditMap = Record<string, Record<string, string[]>>

export function loadCheckInGuestEditMap(): DayCheckInGuestEditMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: DayCheckInGuestEditMap = {}
    for (const [dayKey, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== 'object') continue
      const byCode: Record<string, string[]> = {}
      for (const [code, list] of Object.entries(row as Record<string, unknown>)) {
        const ids = Array.isArray(list)
          ? list.map((item) => String(item ?? '').trim()).filter(Boolean)
          : []
        if (ids.length > 0) byCode[code] = [...new Set(ids)]
      }
      if (Object.keys(byCode).length > 0) next[dayKey] = byCode
    }
    return next
  } catch {
    return {}
  }
}

export function saveCheckInGuestEditMap(map: DayCheckInGuestEditMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function getCheckInGuestEditIds(
  map: DayCheckInGuestEditMap,
  date: string,
  program: Program,
  bookingCode: string,
): string[] {
  return map[dayBoatPlanKey(date, program)]?.[bookingCode] ?? []
}

export function isCheckInGuestEditOpen(
  map: DayCheckInGuestEditMap,
  date: string,
  program: Program,
  bookingCode: string,
  enrollmentId: string,
) {
  return getCheckInGuestEditIds(map, date, program, bookingCode).includes(enrollmentId)
}

export function withCheckInGuestEdit(
  map: DayCheckInGuestEditMap,
  date: string,
  program: Program,
  bookingCode: string,
  enrollmentId: string,
  open: boolean,
): DayCheckInGuestEditMap {
  const key = dayBoatPlanKey(date, program)
  const day = { ...(map[key] ?? {}) }
  const existing = day[bookingCode] ?? []
  const id = enrollmentId.trim()
  const nextIds = open
    ? [...new Set([...existing, id])].filter(Boolean)
    : existing.filter((item) => item !== id)
  if (nextIds.length === 0) delete day[bookingCode]
  else day[bookingCode] = nextIds
  const next = { ...map }
  if (Object.keys(day).length === 0) delete next[key]
  else next[key] = day
  return next
}
