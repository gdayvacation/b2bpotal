import type { Program } from '@/lib/types'
import { dayBoatPlanKey } from '@/lib/types'

export type CheckInScope = 'one' | 'group'

export type CheckInEnrollment = {
  id: string
  firstName: string
  lastName: string
  nationality: string
  /** ISO date YYYY-MM-DD */
  birthday: string
  passportNumber: string
  scope: CheckInScope
  /** How many passenger seats this record covers. */
  seats: number
  checkedInAt: string
}

/** date|program → booking code → enrollments */
export type DayCheckInEnrollmentMap = Record<string, Record<string, CheckInEnrollment[]>>

const STORAGE_KEY = 'gday-check-in-enrollment'

function isScope(value: unknown): value is CheckInScope {
  return value === 'one' || value === 'group'
}

function normalizeEnrollment(raw: unknown): CheckInEnrollment | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = String(row.id ?? '').trim()
  const firstName = String(row.firstName ?? '').trim()
  const lastName = String(row.lastName ?? '').trim()
  const nationality = String(row.nationality ?? '').trim()
  const birthday = String(row.birthday ?? '').trim()
  const passportNumber = String(row.passportNumber ?? '').trim()
  const seats = Math.max(1, Math.floor(Number(row.seats) || 1))
  const checkedInAt = String(row.checkedInAt ?? '').trim()
  if (!id || !firstName || !isScope(row.scope) || !checkedInAt) return null
  return {
    id,
    firstName,
    lastName,
    nationality,
    birthday,
    passportNumber,
    scope: row.scope,
    seats,
    checkedInAt,
  }
}

export function loadCheckInEnrollmentMap(): DayCheckInEnrollmentMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: DayCheckInEnrollmentMap = {}
    for (const [dayKey, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== 'object') continue
      const byCode: Record<string, CheckInEnrollment[]> = {}
      for (const [code, list] of Object.entries(row as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue
        const enrollments = list
          .map(normalizeEnrollment)
          .filter((item): item is CheckInEnrollment => item !== null)
        if (enrollments.length > 0) byCode[code] = enrollments
      }
      if (Object.keys(byCode).length > 0) next[dayKey] = byCode
    }
    return next
  } catch {
    return {}
  }
}

export function saveCheckInEnrollmentMap(map: DayCheckInEnrollmentMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function getCheckInEnrollments(
  map: DayCheckInEnrollmentMap,
  date: string,
  program: Program,
  bookingCode: string,
): CheckInEnrollment[] {
  return map[dayBoatPlanKey(date, program)]?.[bookingCode] ?? []
}

export function enrolledSeatCount(enrollments: CheckInEnrollment[]) {
  return enrollments.reduce((sum, item) => sum + item.seats, 0)
}

export function withCheckInEnrollment(
  map: DayCheckInEnrollmentMap,
  date: string,
  program: Program,
  bookingCode: string,
  enrollment: CheckInEnrollment,
): DayCheckInEnrollmentMap {
  const key = dayBoatPlanKey(date, program)
  const day = { ...(map[key] ?? {}) }
  const existing = day[bookingCode] ?? []
  day[bookingCode] = [...existing, enrollment]
  return { ...map, [key]: day }
}

export function guestDisplayName(enrollment: Pick<CheckInEnrollment, 'firstName' | 'lastName'>) {
  return [enrollment.firstName, enrollment.lastName].filter(Boolean).join(' ').trim()
}

export function newEnrollmentId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `cki-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
