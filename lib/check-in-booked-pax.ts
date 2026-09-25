import { upsertCheckInBookedPax } from '@/lib/supabase/booked-pax-db'
import { persistQuietly } from '@/lib/supabase/portal-db'
import { dayBoatPlanKey, type Program } from '@/lib/types'

export type BookedPaxSnapshot = {
  adults: number
  children: number
  infants: number
  tourLeaders: number
}

/** date|program|code → original booked pax (captured on first marina open). */
export type BookedPaxMap = Record<string, BookedPaxSnapshot>

export const CHECK_IN_BOOKED_PAX_STORAGE_KEY = 'gday-check-in-booked-pax'

const STORAGE_KEY = CHECK_IN_BOOKED_PAX_STORAGE_KEY

export function bookedPaxKey(date: string, program: Program, bookingCode: string) {
  return `${dayBoatPlanKey(date, program)}|${bookingCode}`
}

function bookingKey(date: string, program: Program, bookingCode: string) {
  return bookedPaxKey(date, program, bookingCode)
}

function loadMap(): BookedPaxMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as BookedPaxMap
  } catch {
    return {}
  }
}

function saveMap(map: BookedPaxMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

export function snapshotPaxTotal(row: BookedPaxSnapshot) {
  return row.adults + row.children + row.infants + row.tourLeaders
}

function persistSnapshot(
  date: string,
  program: Program,
  bookingCode: string,
  snapshot: BookedPaxSnapshot,
) {
  persistQuietly(
    'upsert check-in booked pax',
    upsertCheckInBookedPax(date, program, bookingCode, snapshot),
  )
}

export function loadBookedPaxMap(): BookedPaxMap {
  return loadMap()
}

/** Merge remote snapshots into localStorage. Larger totals win so added guests are kept. */
export function hydrateBookedPaxMap(remote: BookedPaxMap) {
  const next = { ...loadMap() }
  for (const [key, row] of Object.entries(remote)) {
    const existing = next[key]
    if (!existing || snapshotPaxTotal(row) > snapshotPaxTotal(existing)) {
      next[key] = { ...row }
    }
  }
  saveMap(next)
  return next
}

export function getBookedPaxSnapshot(
  date: string,
  program: Program,
  bookingCode: string,
): BookedPaxSnapshot | null {
  return loadMap()[bookingKey(date, program, bookingCode)] ?? null
}

export function hasPartialNoShow(
  original: BookedPaxSnapshot,
  current: BookedPaxSnapshot,
) {
  return (
    original.adults > current.adults ||
    original.children > current.children ||
    original.infants > current.infants ||
    original.tourLeaders > current.tourLeaders
  )
}

export function originalBookedPax(
  date: string,
  program: Program,
  booking: BookedPaxSnapshot & { code: string },
): BookedPaxSnapshot {
  return (
    getBookedPaxSnapshot(date, program, booking.code) ?? {
      adults: booking.adults,
      children: booking.children,
      infants: booking.infants,
      tourLeaders: booking.tourLeaders,
    }
  )
}

/** Treat current pax as the live booking — clears no-show minus display. */
export function replaceBookedPaxSnapshot(
  date: string,
  program: Program,
  bookingCode: string,
  current: BookedPaxSnapshot,
) {
  const map = loadMap()
  const next = { ...current }
  map[bookingKey(date, program, bookingCode)] = next
  saveMap(map)
  persistSnapshot(date, program, bookingCode, next)
  return next
}

/** Capture first-seen booked pax; grow snapshot if agent later adds guests. */
export function getOrCaptureBookedPaxSnapshot(
  date: string,
  program: Program,
  bookingCode: string,
  current: BookedPaxSnapshot,
): BookedPaxSnapshot {
  const key = bookingKey(date, program, bookingCode)
  const map = loadMap()
  const existing = map[key]
  if (!existing) {
    map[key] = { ...current }
    saveMap(map)
    persistSnapshot(date, program, bookingCode, map[key]!)
    return map[key]!
  }
  if (snapshotPaxTotal(current) > snapshotPaxTotal(existing)) {
    map[key] = { ...current }
    saveMap(map)
    persistSnapshot(date, program, bookingCode, map[key]!)
    return map[key]!
  }
  return existing
}

export function formatGuestPaxParts(row: BookedPaxSnapshot) {
  const parts: string[] = []
  if (row.adults > 0) parts.push(`${row.adults}AD`)
  if (row.children > 0) parts.push(`${row.children}CH`)
  if (row.infants > 0) parts.push(`${row.infants}INF`)
  if (row.tourLeaders > 0) parts.push(`${row.tourLeaders}TL`)
  return parts.length > 0 ? parts.join(' + ') : '0'
}
