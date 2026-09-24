import { dayBoatPlanKey, isNoTransfer, totalPassengers, type Booking, type DayBoatPlan, type DayVehiclePlan, type Program } from '@/lib/types'
import {
  listVanNumbers,
  paxOnVan,
  primaryVan,
  sortOrderOnVan,
} from '@/lib/vehicle-assign'

export const CHECK_IN_SEQUENCE_STORAGE_KEY = 'gday-check-in-sequence'
export const PROGRAM_SEQUENCE_BOOKING_KEY = '*'
export const DEFAULT_SEQUENCE_START = 1
export const SEQUENCE_START_PRESETS = [1, 100] as const

const STORAGE_KEY = CHECK_IN_SEQUENCE_STORAGE_KEY

/** date|program → program start + optional per-booking starts */
export type DayCheckInSequenceMap = Record<string, CheckInSequenceStarts>

export type CheckInSequenceStarts = {
  start: number
  bookings: Record<string, number>
}

export type GuestSequenceBlock = {
  start: number
  end: number
  seats: number
  overridden: boolean
}

function normalizeStart(value: unknown): number | null {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return null
  return Math.min(n, 9999)
}

function emptyStarts(): CheckInSequenceStarts {
  return { start: DEFAULT_SEQUENCE_START, bookings: {} }
}

export function normalizeSequenceStarts(raw: unknown): CheckInSequenceStarts {
  if (!raw || typeof raw !== 'object') return emptyStarts()
  const row = raw as Record<string, unknown>
  const start = normalizeStart(row.start) ?? DEFAULT_SEQUENCE_START
  const bookings: Record<string, number> = {}
  if (row.bookings && typeof row.bookings === 'object') {
    for (const [code, value] of Object.entries(row.bookings as Record<string, unknown>)) {
      const next = normalizeStart(value)
      if (next) bookings[code] = next
    }
  }
  return { start, bookings }
}

export function loadCheckInSequenceMap(): DayCheckInSequenceMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: DayCheckInSequenceMap = {}
    for (const [dayKey, row] of Object.entries(parsed as Record<string, unknown>)) {
      const starts = normalizeSequenceStarts(row)
      if (starts.start !== DEFAULT_SEQUENCE_START || Object.keys(starts.bookings).length > 0) {
        next[dayKey] = starts
      }
    }
    return next
  } catch {
    return {}
  }
}

export function saveCheckInSequenceMap(map: DayCheckInSequenceMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function getCheckInSequenceStarts(
  map: DayCheckInSequenceMap,
  date: string,
  program: Program,
): CheckInSequenceStarts {
  return normalizeSequenceStarts(map[dayBoatPlanKey(date, program)])
}

function compactStarts(starts: CheckInSequenceStarts): CheckInSequenceStarts | null {
  const next = normalizeSequenceStarts(starts)
  if (next.start === DEFAULT_SEQUENCE_START && Object.keys(next.bookings).length === 0) {
    return null
  }
  return next
}

export function withCheckInSequenceProgramStart(
  map: DayCheckInSequenceMap,
  date: string,
  program: Program,
  start: number | null,
): DayCheckInSequenceMap {
  const key = dayBoatPlanKey(date, program)
  const current = getCheckInSequenceStarts(map, date, program)
  const nextStarts = compactStarts({
    ...current,
    start: normalizeStart(start) ?? DEFAULT_SEQUENCE_START,
  })
  const next = { ...map }
  if (!nextStarts) delete next[key]
  else next[key] = nextStarts
  return next
}

export function withCheckInSequenceBookingStart(
  map: DayCheckInSequenceMap,
  date: string,
  program: Program,
  bookingCode: string,
  start: number | null,
): DayCheckInSequenceMap {
  const code = bookingCode.trim()
  if (!code || code === PROGRAM_SEQUENCE_BOOKING_KEY) {
    return withCheckInSequenceProgramStart(map, date, program, start)
  }
  const key = dayBoatPlanKey(date, program)
  const current = getCheckInSequenceStarts(map, date, program)
  const bookings = { ...current.bookings }
  const cleaned = normalizeStart(start)
  if (cleaned) bookings[code] = cleaned
  else delete bookings[code]
  const nextStarts = compactStarts({ start: current.start, bookings })
  const next = { ...map }
  if (!nextStarts) delete next[key]
  else next[key] = nextStarts
  return next
}

export function orderedBookingsForSequence(
  bookings: Booking[],
  vehiclePlan: DayVehiclePlan,
  _boatPlan: DayBoatPlan,
): Booking[] {
  const transfer = bookings.filter((booking) => !isNoTransfer(booking.pickupZone))
  const noTransfer = bookings.filter((booking) => isNoTransfer(booking.pickupZone))
  const vanNums = listVanNumbers(vehiclePlan.assignments)
  const seen = new Set<string>()
  const ordered: Booking[] = []

  function push(booking: Booking) {
    if (seen.has(booking.code)) return
    seen.add(booking.code)
    ordered.push(booking)
  }

  for (const van of vanNums) {
    const vanBookings = transfer
      .filter((booking) => paxOnVan(vehiclePlan.assignments[booking.code], van) > 0)
      .sort(
        (a, b) =>
          sortOrderOnVan(vehiclePlan.assignments[a.code], van) -
            sortOrderOnVan(vehiclePlan.assignments[b.code], van) ||
          a.leadGuest.localeCompare(b.leadGuest) ||
          a.code.localeCompare(b.code),
      )
    for (const booking of vanBookings) push(booking)
  }

  const unassigned = transfer
    .filter((booking) => primaryVan(vehiclePlan.assignments[booking.code]) === null)
    .sort(
      (a, b) => a.leadGuest.localeCompare(b.leadGuest) || a.code.localeCompare(b.code),
    )
  for (const booking of unassigned) push(booking)

  const rest = noTransfer.slice().sort(
    (a, b) => a.leadGuest.localeCompare(b.leadGuest) || a.code.localeCompare(b.code),
  )
  for (const booking of rest) push(booking)

  const leftover = bookings
    .slice()
    .sort((a, b) => a.leadGuest.localeCompare(b.leadGuest) || a.code.localeCompare(b.code))
  for (const booking of leftover) push(booking)

  return ordered
}

export function buildGuestSequenceMap(input: {
  bookings: Booking[]
  vehiclePlan: DayVehiclePlan
  boatPlan: DayBoatPlan
  starts?: CheckInSequenceStarts | null
}): Record<string, GuestSequenceBlock> {
  const starts = normalizeSequenceStarts(input.starts)
  const ordered = orderedBookingsForSequence(input.bookings, input.vehiclePlan, input.boatPlan)
  const result: Record<string, GuestSequenceBlock> = {}
  let cursor = starts.start

  for (const booking of ordered) {
    const seats = Math.max(1, totalPassengers(booking))
    const override = normalizeStart(starts.bookings[booking.code])
    const start = override ?? cursor
    const end = start + seats - 1
    result[booking.code] = {
      start,
      end,
      seats,
      overridden: override != null,
    }
    cursor = Math.max(cursor, end + 1)
  }

  return result
}

export function formatSequenceRange(start: number, end: number) {
  if (!Number.isFinite(start) || start < 1) return ''
  if (!Number.isFinite(end) || end <= start) return String(start)
  return `${start}–${end}`
}

export function sequenceForSeatOffset(block: GuestSequenceBlock, offset: number) {
  const index = Math.max(0, Math.min(block.seats - 1, Math.floor(offset)))
  return block.start + index
}

/** Numbers already handed out for the first `checkedInCount` seats. */
export function sequenceRangeForCheckedIn(
  block: GuestSequenceBlock,
  checkedInCount: number,
) {
  const count = Math.max(0, Math.min(block.seats, Math.floor(checkedInCount)))
  if (count <= 0) return null
  return {
    start: block.start,
    end: block.start + count - 1,
  }
}

/**
 * Board / ticket label.
 * Checked-in seats show immediately (1, or 4–6).
 * The reserved group block (1–22) only replaces that once the whole party is in.
 */
export function sequenceBoardLabel(
  block: GuestSequenceBlock | null | undefined,
  options: {
    checkedInCount: number
    fullyChecked: boolean
    noShow?: boolean
  },
) {
  if (!block || options.noShow) return null
  if (options.fullyChecked) return formatSequenceRange(block.start, block.end)
  const partial = sequenceRangeForCheckedIn(block, options.checkedInCount)
  return partial ? formatSequenceRange(partial.start, partial.end) : null
}

export function sequenceJustCheckedInLabel(
  block: GuestSequenceBlock | null | undefined,
  options: {
    alreadyChecked: number
    justChecked: number
    fullyChecked: boolean
  },
) {
  if (!block) return null
  if (options.fullyChecked && block.seats > 1) {
    return formatSequenceRange(block.start, block.end)
  }
  const just = Math.max(0, Math.floor(options.justChecked))
  if (just <= 0) {
    return sequenceBoardLabel(block, {
      checkedInCount: options.alreadyChecked,
      fullyChecked: options.fullyChecked,
    })
  }
  const from = sequenceForSeatOffset(block, options.alreadyChecked)
  const to = sequenceForSeatOffset(block, options.alreadyChecked + just - 1)
  return formatSequenceRange(from, to)
}
