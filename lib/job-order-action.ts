import { dayBoatPlanKey, type CheckInAttendance, type Program } from '@/lib/types'

export const JOB_ORDER_ACTION_STORAGE_KEY = 'gday-job-order-action'

export type JobOrderAction = 'stand-by' | 'picked-up' | 'no-show'
export type DayJobOrderActionMap = Record<string, Record<string, JobOrderAction>>

function isJobOrderAction(value: unknown): value is JobOrderAction {
  return value === 'stand-by' || value === 'picked-up' || value === 'no-show'
}

/** Older storage used marina attendance values (`checked` / `no-show`). */
function normalizeAction(value: unknown): JobOrderAction | null {
  if (isJobOrderAction(value)) return value
  if (value === 'checked') return 'picked-up'
  return null
}

export function loadJobOrderActionMap(): DayJobOrderActionMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(JOB_ORDER_ACTION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: DayJobOrderActionMap = {}
    for (const [dayKey, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== 'object') continue
      const marks: Record<string, JobOrderAction> = {}
      for (const [code, status] of Object.entries(row as Record<string, unknown>)) {
        const action = normalizeAction(status)
        if (action) marks[code] = action
      }
      if (Object.keys(marks).length > 0) next[dayKey] = marks
    }
    return next
  } catch {
    return {}
  }
}

export function saveJobOrderActionMap(map: DayJobOrderActionMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(JOB_ORDER_ACTION_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function getJobOrderAction(
  map: DayJobOrderActionMap,
  date: string,
  program: Program,
  bookingCode: string,
): JobOrderAction | null {
  return map[dayBoatPlanKey(date, program)]?.[bookingCode] ?? null
}

export function withJobOrderAction(
  map: DayJobOrderActionMap,
  date: string,
  program: Program,
  bookingCode: string,
  status: JobOrderAction | null,
): DayJobOrderActionMap {
  const key = dayBoatPlanKey(date, program)
  const day = { ...(map[key] ?? {}) }
  if (status === null) delete day[bookingCode]
  else day[bookingCode] = status
  const next = { ...map }
  if (Object.keys(day).length === 0) delete next[key]
  else next[key] = day
  return next
}

/** No-show lives on marina attendance so Guest Pick up and Check-in stay in sync. */
export function resolvePickupAction(
  local: JobOrderAction | null,
  attendance: CheckInAttendance | null,
): JobOrderAction | null {
  if (attendance === 'no-show') return 'no-show'
  if (local === 'no-show') return null
  return local
}

export function takeLocalPickupNoShows(map: DayJobOrderActionMap): {
  next: DayJobOrderActionMap
  noShows: { date: string; program: Program; bookingCode: string }[]
} {
  const noShows: { date: string; program: Program; bookingCode: string }[] = []
  let next = map
  for (const [dayKey, row] of Object.entries(map)) {
    const sep = dayKey.indexOf('|')
    if (sep < 0) continue
    const date = dayKey.slice(0, sep)
    const program = dayKey.slice(sep + 1)
    if (program !== 'PP' && program !== 'James Bond') continue
    for (const [bookingCode, status] of Object.entries(row)) {
      if (status !== 'no-show') continue
      noShows.push({ date, program, bookingCode })
      next = withJobOrderAction(next, date, program, bookingCode, null)
    }
  }
  return { next, noShows }
}
