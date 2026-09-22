import { dayBoatPlanKey, type Program } from '@/lib/types'

export const CHECK_IN_SERVICE_STORAGE_KEY = 'gday-check-in-services'

const STORAGE_KEY = CHECK_IN_SERVICE_STORAGE_KEY

export type CheckInServiceKind = 'share-longtail' | 'private-longtail' | 'scuba'

export type CheckInServiceLine = {
  id: string
  kind: CheckInServiceKind
  people: number
  /** THB per person */
  pricePerPerson: number
  paid: boolean
}

/** date|program → booking code → service lines */
export type DayCheckInServiceMap = Record<string, Record<string, CheckInServiceLine[]>>

export const CHECK_IN_SERVICE_KINDS: CheckInServiceKind[] = [
  'share-longtail',
  'private-longtail',
  'scuba',
]

export function checkInServiceLabel(kind: CheckInServiceKind) {
  if (kind === 'share-longtail') return 'Share Longtail'
  if (kind === 'private-longtail') return 'Private Longtail'
  return 'Scuba'
}

export function isCheckInServiceKind(value: unknown): value is CheckInServiceKind {
  return (
    value === 'share-longtail' || value === 'private-longtail' || value === 'scuba'
  )
}

function normalizeService(raw: unknown): CheckInServiceLine | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = String(row.id ?? '').trim()
  if (!id || !isCheckInServiceKind(row.kind)) return null
  const people = Math.max(1, Math.floor(Number(row.people) || 1))
  const pricePerPerson = Math.max(0, Math.floor(Number(row.pricePerPerson) || 0))
  return {
    id,
    kind: row.kind,
    people,
    pricePerPerson,
    paid: row.paid === true,
  }
}

export function loadCheckInServiceMap(): DayCheckInServiceMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: DayCheckInServiceMap = {}
    for (const [dayKey, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== 'object') continue
      const byCode: Record<string, CheckInServiceLine[]> = {}
      for (const [code, list] of Object.entries(row as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue
        const services = list
          .map(normalizeService)
          .filter((item): item is CheckInServiceLine => item !== null)
        if (services.length > 0) byCode[code] = services
      }
      if (Object.keys(byCode).length > 0) next[dayKey] = byCode
    }
    return next
  } catch {
    return {}
  }
}

export function saveCheckInServiceMap(map: DayCheckInServiceMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function getCheckInServices(
  map: DayCheckInServiceMap,
  date: string,
  program: Program,
  bookingCode: string,
): CheckInServiceLine[] {
  return map[dayBoatPlanKey(date, program)]?.[bookingCode] ?? []
}

export function withCheckInServices(
  map: DayCheckInServiceMap,
  date: string,
  program: Program,
  bookingCode: string,
  services: CheckInServiceLine[],
): DayCheckInServiceMap {
  const key = dayBoatPlanKey(date, program)
  const day = { ...(map[key] ?? {}) }
  if (services.length === 0) delete day[bookingCode]
  else day[bookingCode] = services
  const next = { ...map }
  if (Object.keys(day).length === 0) delete next[key]
  else next[key] = day
  return next
}

export function serviceLineTotal(line: CheckInServiceLine) {
  return line.people * line.pricePerPerson
}

export function newCheckInServiceId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
