import type { Booking, VanSplit } from '@/lib/types'
import { isNoTransfer, totalPassengers } from '@/lib/types'

/**
 * Auto-assign vans by pickup zone. Same zone stays together.
 * Bookings always stay intact — never auto-split.
 * Oversized bookings (pax > capacity) are left unassigned so admin
 * can separate them manually. No Transfer bookings are skipped.
 * Within a van, order is hotel → pickup time → booking code (pickup route).
 */
export function autoAssignVans(
  bookings: Booking[],
  capacity: number,
): Record<string, VanSplit[]> {
  const byZone = new Map<string, Booking[]>()
  for (const booking of bookings) {
    if (isNoTransfer(booking.pickupZone)) continue
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

export function primaryVan(legs: VanSplit[] | undefined): number | null {
  if (!legs || legs.length === 0) return null
  return Math.min(...legs.map((leg) => leg.van))
}

export function paxOnVan(legs: VanSplit[] | undefined, van: number): number {
  if (!legs) return 0
  return legs.filter((leg) => leg.van === van).reduce((sum, leg) => sum + leg.pax, 0)
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

export function formatVanLegs(legs: VanSplit[] | undefined): string {
  if (!legs || legs.length === 0) return '—'
  if (legs.length === 1) return `Van ${legs[0].van}`
  return legs.map((leg) => `Van ${leg.van} · ${leg.pax}pax`).join(' + ')
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
