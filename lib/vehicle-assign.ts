import type { Booking, VanSplit } from '@/lib/types'
import { isDummyVan, isNoTransfer, isPrivateTransfer, totalPassengers } from '@/lib/types'

/**
 * Auto-assign vans by pickup zone. Same zone stays together.
 * Bookings always stay intact — never auto-split.
 * Oversized bookings (pax > capacity) are left unassigned so admin
 * can separate them manually. No Transfer and Private Transfer are skipped
 * (private has its own driver).
 * Within a van, order is hotel → pickup time → booking code (pickup route).
 */
export function autoAssignVans(
  bookings: Booking[],
  capacity: number,
): Record<string, VanSplit[]> {
  const byZone = new Map<string, Booking[]>()
  for (const booking of bookings) {
    if (isNoTransfer(booking.pickupZone) || isPrivateTransfer(booking)) continue
    const zone = booking.pickupZone || 'Other'
    const list = byZone.get(zone) ?? []
    list.push(booking)
    byZone.set(zone, list)
  }

  const zones = [...byZone.keys()].sort((a, b) => {
    const timeA = byZone.get(a)?.[0]?.pickupTime ?? ''
    const timeB = byZone.get(b)?.[0]?.pickupTime ?? ''
    const pendingA = timeA.toLowerCase().includes('pending')
    const pendingB = timeB.toLowerCase().includes('pending')
    if (pendingA !== pendingB) return pendingA ? 1 : -1
    return timeA.localeCompare(timeB) || a.localeCompare(b)
  })

  const assignments: Record<string, VanSplit[]> = {}
  let nextVan = 1

  for (const zone of zones) {
    const zoneBookings = (byZone.get(zone) ?? []).slice().sort(
      (a, b) =>
        a.pickupHotel.localeCompare(b.pickupHotel) ||
        a.pickupTime.localeCompare(b.pickupTime) ||
        a.code.localeCompare(b.code),
    )

    let van = nextVan
    let load = 0
    let orderInVan = 0
    let vanStarted = false

    for (const booking of zoneBookings) {
      const pax = totalPassengers(booking)

      // Admin must split these manually — do not auto-assign.
      if (pax > capacity) continue

      if (vanStarted && load + pax > capacity) {
        nextVan += 1
        van = nextVan
        load = 0
        orderInVan = 0
      }
      if (!vanStarted) vanStarted = true

      assignments[booking.code] = [{ van, pax, sortOrder: orderInVan }]
      orderInVan += 1
      load += pax
    }

    if (vanStarted) nextVan += 1
  }

  return assignments
}

export function listVanNumbers(assignments: Record<string, VanSplit[]>): number[] {
  const nums = new Set<number>()
  for (const legs of Object.values(assignments)) {
    for (const leg of legs) {
      if (Number.isFinite(leg.van) && leg.van > 0) nums.add(leg.van)
    }
  }
  return [...nums].sort((a, b) => a - b)
}

export function listFleetVanNumbers(assignments: Record<string, VanSplit[]>): number[] {
  return listVanNumbers(assignments).filter((van) => !isDummyVan(van))
}

export function primaryVan(legs: VanSplit[] | undefined): number | null {
  if (!legs || legs.length === 0) return null
  return Math.min(...legs.map((leg) => leg.van))
}

export function paxOnVan(legs: VanSplit[] | undefined, van: number): number {
  if (!legs) return 0
  return legs.filter((leg) => leg.van === van).reduce((sum, leg) => sum + leg.pax, 0)
}

/**
 * Seats on this van from the live booking size, not a stale stored split.
 * Single-van bookings always use current pax. Splits keep managed leg sizes
 * and the last van absorbs guests added or removed later.
 */
export function currentPaxOnVan(
  legs: VanSplit[] | undefined,
  van: number,
  currentPax: number,
): number {
  const live = Math.max(0, Math.floor(currentPax))
  if (!legs?.length || live <= 0) return 0
  const vanNums = [...new Set(legs.map((leg) => leg.van).filter((n) => n > 0))].sort(
    (a, b) => a - b,
  )
  if (!vanNums.includes(van)) return 0
  if (vanNums.length === 1) return live

  let remaining = live
  let result = 0
  for (let i = 0; i < vanNums.length; i += 1) {
    const currentVan = vanNums[i]
    const stored = paxOnVan(legs, currentVan)
    const take = i === vanNums.length - 1 ? remaining : Math.min(remaining, Math.max(0, stored))
    if (currentVan === van) result = take
    remaining -= take
  }
  return result
}

export function bookingPaxOnVan(
  booking: Pick<Booking, 'adults' | 'children' | 'infants' | 'tourLeaders'>,
  legs: VanSplit[] | undefined,
  van: number,
): number {
  return currentPaxOnVan(legs, van, totalPassengers(booking))
}

export type PaxBreakdown = {
  adults: number
  children: number
  infants: number
  tourLeaders: number
}

export function paxBreakdownTotal(pax: PaxBreakdown) {
  return pax.adults + pax.children + pax.infants + pax.tourLeaders
}

function takePaxTypes(from: PaxBreakdown, n: number): PaxBreakdown {
  let left = Math.max(0, Math.floor(n))
  const adults = Math.min(from.adults, left)
  left -= adults
  const children = Math.min(from.children, left)
  left -= children
  const infants = Math.min(from.infants, left)
  left -= infants
  const tourLeaders = Math.min(from.tourLeaders, left)
  return { adults, children, infants, tourLeaders }
}

function subtractPax(from: PaxBreakdown, take: PaxBreakdown): PaxBreakdown {
  return {
    adults: from.adults - take.adults,
    children: from.children - take.children,
    infants: from.infants - take.infants,
    tourLeaders: from.tourLeaders - take.tourLeaders,
  }
}

/**
 * Split AD / CHD / INF / TL across van legs so each van’s types sum to that
 * leg’s pax, and every van together still matches the booking.
 */
export function allocatePaxBreakdown(
  breakdown: PaxBreakdown,
  legs: VanSplit[] | undefined,
  van: number | null,
): PaxBreakdown {
  const empty = { adults: 0, children: 0, infants: 0, tourLeaders: 0 }
  if (van === null || !legs || legs.length === 0) return { ...breakdown }
  const vanNums = [...new Set(legs.map((leg) => leg.van).filter((n) => n > 0))].sort(
    (a, b) => a - b,
  )
  if (!vanNums.includes(van)) return empty
  if (vanNums.length === 1) return { ...breakdown }

  let remaining: PaxBreakdown = { ...breakdown }
  const byVan = new Map<number, PaxBreakdown>()
  for (let i = 0; i < vanNums.length; i += 1) {
    const currentVan = vanNums[i]
    const isLast = i === vanNums.length - 1
    const slice = isLast
      ? remaining
      : takePaxTypes(remaining, currentPaxOnVan(legs, currentVan, paxBreakdownTotal(breakdown)))
    byVan.set(currentVan, slice)
    remaining = subtractPax(remaining, slice)
  }
  return byVan.get(van) ?? empty
}

export function sortOrderOnVan(legs: VanSplit[] | undefined, van: number): number {
  const leg = legs?.find((item) => item.van === van)
  return leg?.sortOrder ?? Number.MAX_SAFE_INTEGER
}

export function nextSortOrderForVan(
  assignments: Record<string, VanSplit[]>,
  van: number,
): number {
  let max = -1
  for (const legs of Object.values(assignments)) {
    for (const leg of legs) {
      if (leg.van === van) max = Math.max(max, leg.sortOrder ?? 0)
    }
  }
  return max + 1
}

/** Rewrite pickup stop order for bookings on one van. */
export function reorderVanAssignments(
  assignments: Record<string, VanSplit[]>,
  van: number,
  orderedCodes: string[],
): Record<string, VanSplit[]> {
  const next: Record<string, VanSplit[]> = { ...assignments }
  orderedCodes.forEach((code, index) => {
    const legs = next[code]
    if (!legs) return
    next[code] = legs.map((leg) =>
      leg.van === van ? { ...leg, sortOrder: index } : leg,
    )
  })
  return next
}

export function formatVanLegs(legs: VanSplit[] | undefined, currentPax?: number): string {
  if (!legs || legs.length === 0) return '—'
  if (legs.length === 1) return `Van ${legs[0].van}`
  const seen = new Set<number>()
  return legs
    .filter((leg) => {
      if (seen.has(leg.van)) return false
      seen.add(leg.van)
      return true
    })
    .map((leg) => {
      const n =
        currentPax === undefined
          ? paxOnVan(legs, leg.van)
          : currentPaxOnVan(legs, leg.van, currentPax)
      return `Van ${leg.van} · ${n}pax`
    })
    .join(' + ')
}

/** Suggest a starting split for the admin dialog (editable). */
export function suggestVanSplit(
  pax: number,
  capacity: number,
  startVan: number,
): VanSplit[] {
  if (pax <= 0) return []
  if (pax <= capacity) return [{ van: Math.max(1, startVan), pax, sortOrder: 0 }]
  const first = Math.min(capacity, pax)
  return [
    { van: Math.max(1, startVan), pax: first, sortOrder: 0 },
    { van: Math.max(1, startVan) + 1, pax: pax - first, sortOrder: 0 },
  ]
}

/** Migrate legacy number assignments and ensure array shape. */
export function normalizeAssignments(
  raw: Record<string, unknown> | undefined,
  bookings: Booking[] = [],
): Record<string, VanSplit[]> {
  if (!raw) return {}
  const paxByCode = new Map(bookings.map((b) => [b.code, totalPassengers(b)]))
  const next: Record<string, VanSplit[]> = {}
  const vanOrderCounters = new Map<number, number>()

  for (const [code, value] of Object.entries(raw)) {
    if (typeof value === 'number' && value > 0) {
      const sortOrder = vanOrderCounters.get(value) ?? 0
      vanOrderCounters.set(value, sortOrder + 1)
      next[code] = [{ van: value, pax: paxByCode.get(code) ?? 0, sortOrder }]
      continue
    }
    if (Array.isArray(value)) {
      const legs = value
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const van = Number((item as VanSplit).van)
          const pax = Number((item as VanSplit).pax)
          const rawOrder = Number((item as VanSplit).sortOrder)
          if (!Number.isFinite(van) || van < 1) return null
          const sortOrder = Number.isFinite(rawOrder) ? rawOrder : vanOrderCounters.get(van) ?? 0
          vanOrderCounters.set(van, Math.max(vanOrderCounters.get(van) ?? 0, sortOrder + 1))
          return {
            van,
            pax: Number.isFinite(pax) && pax > 0 ? pax : paxByCode.get(code) ?? 0,
            sortOrder,
          }
        })
        .filter((leg): leg is VanSplit => leg !== null)
      if (legs.length > 0) next[code] = legs
    }
  }

  return next
}
