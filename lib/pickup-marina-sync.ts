import {
  formatGuestPaxParts,
  type BookedPaxMap,
  type BookedPaxSnapshot,
} from '@/lib/check-in-booked-pax'
import {
  deleteOwnArrival,
  deletePickupNoShow,
  upsertOwnArrival,
  upsertPickupNoShow,
} from '@/lib/supabase/day-ops-db'
import { persistQuietly } from '@/lib/supabase/portal-db'
import { dayBoatPlanKey, type Program } from '@/lib/types'

export const PICKUP_NS_STORAGE_KEY = 'gday-pickup-no-show'
export const OWN_ARRIVAL_STORAGE_KEY = 'gday-own-arrival'

const PICKUP_NS_KEY = PICKUP_NS_STORAGE_KEY
const OWN_ARRIVAL_KEY = OWN_ARRIVAL_STORAGE_KEY

export function emptyPax(): BookedPaxSnapshot {
  return { adults: 0, children: 0, infants: 0, tourLeaders: 0 }
}

export function addPax(a: BookedPaxSnapshot, b: BookedPaxSnapshot): BookedPaxSnapshot {
  return {
    adults: a.adults + b.adults,
    children: a.children + b.children,
    infants: a.infants + b.infants,
    tourLeaders: a.tourLeaders + b.tourLeaders,
  }
}

export function paxTotal(row: BookedPaxSnapshot) {
  return row.adults + row.children + row.infants + row.tourLeaders
}

export function clampPax(row: BookedPaxSnapshot, cap: BookedPaxSnapshot): BookedPaxSnapshot {
  return {
    adults: Math.min(Math.max(0, row.adults), Math.max(0, cap.adults)),
    children: Math.min(Math.max(0, row.children), Math.max(0, cap.children)),
    infants: Math.min(Math.max(0, row.infants), Math.max(0, cap.infants)),
    tourLeaders: Math.min(Math.max(0, row.tourLeaders), Math.max(0, cap.tourLeaders)),
  }
}

export function paxEqual(a: BookedPaxSnapshot, b: BookedPaxSnapshot) {
  return (
    a.adults === b.adults &&
    a.children === b.children &&
    a.infants === b.infants &&
    a.tourLeaders === b.tourLeaders
  )
}

export function subtractPax(from: BookedPaxSnapshot, take: BookedPaxSnapshot): BookedPaxSnapshot {
  return {
    adults: Math.max(0, from.adults - take.adults),
    children: Math.max(0, from.children - take.children),
    infants: Math.max(0, from.infants - take.infants),
    tourLeaders: Math.max(0, from.tourLeaders - take.tourLeaders),
  }
}

function setStoredPax(
  storageKey: string,
  kind: 'pickup' | 'arrival',
  date: string,
  program: Program,
  bookingCode: string,
  next: BookedPaxSnapshot,
) {
  const map = loadMap(storageKey)
  const key = bookingPaxKey(date, program, bookingCode)
  if (paxTotal(next) < 1) {
    delete map[key]
    saveMap(storageKey, map)
    persistQuietly(
      kind === 'pickup' ? 'delete pickup no-show' : 'delete own arrival',
      kind === 'pickup'
        ? deletePickupNoShow(date, program, bookingCode)
        : deleteOwnArrival(date, program, bookingCode),
    )
    return emptyPax()
  }
  map[key] = { ...next }
  saveMap(storageKey, map)
  persistPax(kind, date, program, bookingCode, map[key]!)
  return map[key]!
}

export function bookingPaxKey(date: string, program: Program, bookingCode: string) {
  return `${dayBoatPlanKey(date, program)}|${bookingCode}`
}

function loadMap(storageKey: string): BookedPaxMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as BookedPaxMap
  } catch {
    return {}
  }
}

function saveMap(storageKey: string, map: BookedPaxMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(map))
  } catch {
    // ignore
  }
}

function getPax(storageKey: string, date: string, program: Program, bookingCode: string) {
  return loadMap(storageKey)[bookingPaxKey(date, program, bookingCode)] ?? emptyPax()
}

function persistPax(
  kind: 'pickup' | 'arrival',
  date: string,
  program: Program,
  bookingCode: string,
  snapshot: BookedPaxSnapshot,
) {
  persistQuietly(
    kind === 'pickup' ? 'upsert pickup no-show' : 'upsert own arrival',
    kind === 'pickup'
      ? upsertPickupNoShow(date, program, bookingCode, snapshot)
      : upsertOwnArrival(date, program, bookingCode, snapshot),
  )
}

function addStoredPax(
  storageKey: string,
  kind: 'pickup' | 'arrival',
  date: string,
  program: Program,
  bookingCode: string,
  add: BookedPaxSnapshot,
) {
  const map = loadMap(storageKey)
  const key = bookingPaxKey(date, program, bookingCode)
  map[key] = addPax(map[key] ?? emptyPax(), add)
  saveMap(storageKey, map)
  persistPax(kind, date, program, bookingCode, map[key]!)
  return map[key]!
}

export function loadPickupNoShowMap(): BookedPaxMap {
  return loadMap(PICKUP_NS_KEY)
}

export function savePickupNoShowMap(map: BookedPaxMap) {
  saveMap(PICKUP_NS_KEY, map)
}

export function loadOwnArrivalMap(): BookedPaxMap {
  return loadMap(OWN_ARRIVAL_KEY)
}

export function saveOwnArrivalMap(map: BookedPaxMap) {
  saveMap(OWN_ARRIVAL_KEY, map)
}

export function getPaxFromMap(
  map: BookedPaxMap,
  date: string,
  program: Program,
  bookingCode: string,
) {
  return map[bookingPaxKey(date, program, bookingCode)] ?? emptyPax()
}

export function getPickupNoShow(date: string, program: Program, bookingCode: string) {
  return getPax(PICKUP_NS_KEY, date, program, bookingCode)
}

export function recordPickupNoShow(
  date: string,
  program: Program,
  bookingCode: string,
  ns: BookedPaxSnapshot,
) {
  if (paxTotal(ns) < 1) return getPickupNoShow(date, program, bookingCode)
  return addStoredPax(PICKUP_NS_KEY, 'pickup', date, program, bookingCode, ns)
}

export function getOwnArrival(date: string, program: Program, bookingCode: string) {
  return getPax(OWN_ARRIVAL_KEY, date, program, bookingCode)
}

export function recordOwnArrival(
  date: string,
  program: Program,
  bookingCode: string,
  arrived: BookedPaxSnapshot,
) {
  if (paxTotal(arrived) < 1) return getOwnArrival(date, program, bookingCode)
  return addStoredPax(OWN_ARRIVAL_KEY, 'arrival', date, program, bookingCode, arrived)
}

/** Overwrite pickup NS ledger (absolute). Use to repair inflated counters. */
export function replacePickupNoShow(
  date: string,
  program: Program,
  bookingCode: string,
  next: BookedPaxSnapshot,
) {
  return setStoredPax(PICKUP_NS_KEY, 'pickup', date, program, bookingCode, next)
}

/** Overwrite own-arrival ledger (absolute). Use to repair inflated counters. */
export function replaceOwnArrival(
  date: string,
  program: Program,
  bookingCode: string,
  next: BookedPaxSnapshot,
) {
  return setStoredPax(OWN_ARRIVAL_KEY, 'arrival', date, program, bookingCode, next)
}

/**
 * Repair pickup/taxi ledgers that accumulated past the original booking
 * (e.g. repeated Open seats clicks). Authoritative NS = original − current.
 */
export function repairPickupMarinaLedgers(
  date: string,
  program: Program,
  bookingCode: string,
  original: BookedPaxSnapshot,
  current: BookedPaxSnapshot,
) {
  const derivedNs = clampPax(subtractPax(original, current), original)
  const ns = getPickupNoShow(date, program, bookingCode)
  const taxi = getOwnArrival(date, program, bookingCode)
  let nextNs = ns
  let nextTaxi = taxi

  if (paxTotal(ns) > paxTotal(original) || paxTotal(ns) > paxTotal(derivedNs)) {
    nextNs = replacePickupNoShow(date, program, bookingCode, derivedNs)
  } else {
    const clamped = clampPax(ns, original)
    if (
      clamped.adults !== ns.adults ||
      clamped.children !== ns.children ||
      clamped.infants !== ns.infants ||
      clamped.tourLeaders !== ns.tourLeaders
    ) {
      nextNs = replacePickupNoShow(date, program, bookingCode, clamped)
    }
  }

  // Fully restored (or never reduced): clear taxi inflation.
  if (paxTotal(derivedNs) === 0 && paxTotal(taxi) > 0) {
    nextTaxi = replaceOwnArrival(date, program, bookingCode, emptyPax())
  } else {
    const taxiCap = clampPax(taxi, original)
    if (
      taxiCap.adults !== taxi.adults ||
      taxiCap.children !== taxi.children ||
      taxiCap.infants !== taxi.infants ||
      taxiCap.tourLeaders !== taxi.tourLeaders
    ) {
      nextTaxi = replaceOwnArrival(date, program, bookingCode, taxiCap)
    }
  }

  return { ns: nextNs, taxi: nextTaxi, derivedNs }
}

export function movePaxMapEntry(
  storageKey: typeof PICKUP_NS_KEY | typeof OWN_ARRIVAL_KEY,
  oldDate: string,
  newDate: string,
  program: Program,
  bookingCode: string,
) {
  if (oldDate === newDate) return null
  const map = loadMap(storageKey)
  const fromKey = bookingPaxKey(oldDate, program, bookingCode)
  const toKey = bookingPaxKey(newDate, program, bookingCode)
  const existing = map[fromKey]
  if (!existing) return null
  delete map[fromKey]
  map[toKey] = existing
  saveMap(storageKey, map)
  return existing
}

/** Remove the pickup no-show and own-arrival ledgers for one day (used when a booking changes date). */
export function dropPickupMarinaLedgers(date: string, program: Program, bookingCode: string) {
  setStoredPax(PICKUP_NS_KEY, 'pickup', date, program, bookingCode, emptyPax())
  setStoredPax(OWN_ARRIVAL_KEY, 'arrival', date, program, bookingCode, emptyPax())
}

export function movePickupNoShow(oldDate: string, newDate: string, program: Program, bookingCode: string) {
  const moved = movePaxMapEntry(PICKUP_NS_KEY, oldDate, newDate, program, bookingCode)
  if (!moved) return
  persistQuietly(
    'move pickup no-show',
    (async () => {
      await deletePickupNoShow(oldDate, program, bookingCode)
      await upsertPickupNoShow(newDate, program, bookingCode, moved)
    })(),
  )
}

export function moveOwnArrival(oldDate: string, newDate: string, program: Program, bookingCode: string) {
  const moved = movePaxMapEntry(OWN_ARRIVAL_KEY, oldDate, newDate, program, bookingCode)
  if (!moved) return
  persistQuietly(
    'move own arrival',
    (async () => {
      await deleteOwnArrival(oldDate, program, bookingCode)
      await upsertOwnArrival(newDate, program, bookingCode, moved)
    })(),
  )
}

export function formatPaxOrDash(row: BookedPaxSnapshot) {
  return paxTotal(row) > 0 ? formatGuestPaxParts(row) : '—'
}
