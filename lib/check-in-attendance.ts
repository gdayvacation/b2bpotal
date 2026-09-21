import type { CheckInAttendance, DayCheckInAttendanceMap, Program } from '@/lib/types'
import { dayBoatPlanKey } from '@/lib/types'

export const CHECK_IN_ATTENDANCE_STORAGE_KEY = 'gday-check-in-attendance'

const STORAGE_KEY = CHECK_IN_ATTENDANCE_STORAGE_KEY

function isAttendance(value: unknown): value is CheckInAttendance {
  return value === 'checked' || value === 'no-show'
}

export function loadCheckInAttendanceMap(): DayCheckInAttendanceMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: DayCheckInAttendanceMap = {}
    for (const [dayKey, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== 'object') continue
      const attendance: Record<string, CheckInAttendance> = {}
      for (const [code, status] of Object.entries(row as Record<string, unknown>)) {
        if (isAttendance(status)) attendance[code] = status
      }
      if (Object.keys(attendance).length > 0) next[dayKey] = attendance
    }
    return next
  } catch {
    return {}
  }
}

export function saveCheckInAttendanceMap(map: DayCheckInAttendanceMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function getCheckInAttendance(
  map: DayCheckInAttendanceMap,
  date: string,
  program: Program,
  bookingCode: string,
): CheckInAttendance | null {
  return map[dayBoatPlanKey(date, program)]?.[bookingCode] ?? null
}

export function withCheckInAttendance(
  map: DayCheckInAttendanceMap,
  date: string,
  program: Program,
  bookingCode: string,
  status: CheckInAttendance | null,
): DayCheckInAttendanceMap {
  const key = dayBoatPlanKey(date, program)
  const day = { ...(map[key] ?? {}) }
  if (status === null) delete day[bookingCode]
  else day[bookingCode] = status
  const next = { ...map }
  if (Object.keys(day).length === 0) delete next[key]
  else next[key] = day
  return next
}
