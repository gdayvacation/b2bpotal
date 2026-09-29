import { dayBoatPlanKey, type Program } from '@/lib/types'

export const CHECK_IN_GROUP_GUIDE_STORAGE_KEY = 'gday-check-in-group-guides'

const STORAGE_KEY = CHECK_IN_GROUP_GUIDE_STORAGE_KEY

/** date|program → booking code → tour group guide display name (admin-assigned on booking QR).
 * Separate from boat guides on DayBoatPlan — those are marina boat staff. */
export type DayCheckInGroupGuideMap = Record<string, Record<string, string>>

export function loadCheckInGroupGuideMap(): DayCheckInGroupGuideMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: DayCheckInGroupGuideMap = {}
    for (const [dayKey, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== 'object') continue
      const guides: Record<string, string> = {}
      for (const [code, value] of Object.entries(row as Record<string, unknown>)) {
        const text = typeof value === 'string' ? value.trim() : ''
        if (text) guides[code] = text.slice(0, 80)
      }
      if (Object.keys(guides).length > 0) next[dayKey] = guides
    }
    return next
  } catch {
    return {}
  }
}

export function saveCheckInGroupGuideMap(map: DayCheckInGroupGuideMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function getCheckInGroupGuide(
  map: DayCheckInGroupGuideMap,
  date: string,
  program: Program,
  bookingCode: string,
): string {
  return map[dayBoatPlanKey(date, program)]?.[bookingCode] ?? ''
}

export function withCheckInGroupGuide(
  map: DayCheckInGroupGuideMap,
  date: string,
  program: Program,
  bookingCode: string,
  name: string,
): DayCheckInGroupGuideMap {
  const key = dayBoatPlanKey(date, program)
  const day = { ...(map[key] ?? {}) }
  const text = name.trim().slice(0, 80)
  if (!text) delete day[bookingCode]
  else day[bookingCode] = text
  const next = { ...map }
  if (Object.keys(day).length === 0) delete next[key]
  else next[key] = day
  return next
}

/** Split "First Middle Last" into first / last for passport form prefills. */
export function splitGuideDisplayName(fullName: string): {
  firstName: string
  lastName: string
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1]!,
  }
}
