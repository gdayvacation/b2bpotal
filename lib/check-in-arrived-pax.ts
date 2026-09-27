import { deleteCheckInArrivedPax, upsertCheckInArrivedPax } from '@/lib/supabase/arrived-pax-db'
import { persistQuietly } from '@/lib/supabase/portal-db'
import {
  bookedPaxKey,
  type BookedPaxMap,
  type BookedPaxSnapshot,
} from '@/lib/check-in-booked-pax'
import { type Program } from '@/lib/types'

export const CHECK_IN_ARRIVED_PAX_STORAGE_KEY = 'gday-check-in-arrived-pax'

const STORAGE_KEY = CHECK_IN_ARRIVED_PAX_STORAGE_KEY

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

export function loadArrivedPaxMap(): BookedPaxMap {
  return loadMap()
}

export function hydrateArrivedPaxMap(remote: BookedPaxMap) {
  const next = { ...loadMap(), ...remote }
  saveMap(next)
  return next
}

export function getArrivedPaxSnapshot(
  date: string,
  program: Program,
  bookingCode: string,
): BookedPaxSnapshot | null {
  return loadMap()[bookedPaxKey(date, program, bookingCode)] ?? null
}

export function setArrivedPaxSnapshot(
  date: string,
  program: Program,
  bookingCode: string,
  snapshot: BookedPaxSnapshot,
) {
  const map = loadMap()
  const next = { ...snapshot }
  map[bookedPaxKey(date, program, bookingCode)] = next
  saveMap(map)
  persistQuietly(
    'upsert check-in arrived pax',
    upsertCheckInArrivedPax(date, program, bookingCode, next),
  )
  return next
}

export function clearArrivedPaxSnapshot(date: string, program: Program, bookingCode: string) {
  const map = loadMap()
  const key = bookedPaxKey(date, program, bookingCode)
  if (!(key in map)) return
  delete map[key]
  saveMap(map)
  persistQuietly(
    'delete check-in arrived pax',
    deleteCheckInArrivedPax(date, program, bookingCode),
  )
}

export function moveArrivedPaxSnapshot(
  oldDate: string,
  newDate: string,
  program: Program,
  bookingCode: string,
) {
  if (oldDate === newDate) return
  const map = loadMap()
  const fromKey = bookedPaxKey(oldDate, program, bookingCode)
  const toKey = bookedPaxKey(newDate, program, bookingCode)
  const existing = map[fromKey]
  if (!existing) return
  delete map[fromKey]
  map[toKey] = existing
  saveMap(map)
  persistQuietly(
    'move check-in arrived pax',
    (async () => {
      await deleteCheckInArrivedPax(oldDate, program, bookingCode)
      await upsertCheckInArrivedPax(newDate, program, bookingCode, existing)
    })(),
  )
}
