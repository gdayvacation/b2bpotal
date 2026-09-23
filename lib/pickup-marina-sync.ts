import { dayBoatPlanKey, type Program } from '@/lib/types'
import {
  formatGuestPaxParts,
  type BookedPaxSnapshot,
} from '@/lib/check-in-booked-pax'

const PICKUP_NS_KEY = 'gday-pickup-no-show'
const OWN_ARRIVAL_KEY = 'gday-own-arrival'

type PaxMap = Record<string, BookedPaxSnapshot>

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

function bookingKey(date: string, program: Program, bookingCode: string) {
  return `${dayBoatPlanKey(date, program)}|${bookingCode}`
}

function loadMap(storageKey: string): PaxMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as PaxMap
  } catch {
    return {}
  }
}

function saveMap(storageKey: string, map: PaxMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(map))
  } catch {
    // ignore
  }
}

function getPax(storageKey: string, date: string, program: Program, bookingCode: string) {
  return loadMap(storageKey)[bookingKey(date, program, bookingCode)] ?? emptyPax()
}

function addStoredPax(
  storageKey: string,
  date: string,
  program: Program,
  bookingCode: string,
  add: BookedPaxSnapshot,
) {
  const map = loadMap(storageKey)
  const key = bookingKey(date, program, bookingCode)
  map[key] = addPax(map[key] ?? emptyPax(), add)
  saveMap(storageKey, map)
  return map[key]!
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
  return addStoredPax(PICKUP_NS_KEY, date, program, bookingCode, ns)
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
  return addStoredPax(OWN_ARRIVAL_KEY, date, program, bookingCode, arrived)
}

export function formatPaxOrDash(row: BookedPaxSnapshot) {
  return paxTotal(row) > 0 ? formatGuestPaxParts(row) : '—'
}
