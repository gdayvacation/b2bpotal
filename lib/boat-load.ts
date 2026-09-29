import {
  DEFAULT_BOAT_CAPACITY,
  bookingAssignedToBoat,
  bookingPaxOnBoat,
  isDummyVan,
  isPartnerBoat,
  moveBoatPax,
  normalizeBoatAssignment,
  primaryBoatNumber,
  totalPassengers,
  type BoatNumber,
  type BoatSplit,
  type Booking,
  type DayBoatPlan,
  type VanSplit,
} from '@/lib/types'
import { bookingPaxOnVan, listVanNumbers } from '@/lib/vehicle-assign'

/**
 * Pax from a booking that sit on both this van and this boat.
 * Van-split guests on one boat keep their per-van counts; when boat is also
 * split, each van is treated as wholly on one boat (same as assignVanToBoat).
 */
export function bookingPaxOnVanAndBoat(
  booking: Pick<Booking, 'adults' | 'children' | 'infants' | 'tourLeaders'>,
  vanLegs: VanSplit[] | undefined,
  boatAssign: BoatNumber | BoatSplit[] | undefined,
  van: number,
  boat: BoatNumber,
): number {
  const vanPax = bookingPaxOnVan(booking, vanLegs, van)
  const boatPax = bookingPaxOnBoat(booking, boatAssign, boat)
  if (vanPax <= 0 || boatPax <= 0) return 0

  const total = totalPassengers(booking)
  const boatLegs = normalizeBoatAssignment(boatAssign, total)
  const vanNums = [
    ...new Set((vanLegs ?? []).map((leg) => leg.van).filter((n) => n > 0)),
  ]
    .filter((item) => bookingPaxOnVan(booking, vanLegs, item) > 0)
    .sort((a, b) => a - b)

  if (vanNums.length <= 1) return boatPax
  if (boatLegs.length <= 1) return vanPax

  const boatOfVan = mapVanLegsOntoBoatLegs(
    vanNums.map((item) => ({ van: item, pax: bookingPaxOnVan(booking, vanLegs, item) })),
    boatLegs.map((leg) => ({ boat: leg.boat, pax: leg.pax })),
  )
  return boatOfVan.get(van) === boat ? vanPax : 0
}

/** Recover which boat each van-share sits on when both legs are split. */
function mapVanLegsOntoBoatLegs(
  vans: { van: number; pax: number }[],
  boats: { boat: number; pax: number }[],
): Map<number, number> {
  const result = new Map<number, number>()
  const remaining = boats.map((leg) => ({ ...leg }))
  const pending = vans.slice().sort((a, b) => b.pax - a.pax || a.van - b.van)

  for (const item of pending) {
    const exact = remaining.findIndex((leg) => leg.pax === item.pax && leg.pax > 0)
    if (exact < 0) continue
    result.set(item.van, remaining[exact]!.boat)
    remaining[exact]!.pax = 0
  }
  for (const item of pending) {
    if (result.has(item.van)) continue
    const fit = remaining.findIndex((leg) => leg.pax >= item.pax)
    if (fit < 0) continue
    result.set(item.van, remaining[fit]!.boat)
    remaining[fit]!.pax -= item.pax
  }
  return result
}

/** Live pax already placed on this boat (supports split bookings). */
export function boatAssignedPax(
  bookings: Booking[],
  assignments: DayBoatPlan['assignments'],
  boat: BoatNumber,
  excludeCode?: string,
): number {
  return bookings.reduce((sum, booking) => {
    if (excludeCode && booking.code === excludeCode) return sum
    return sum + bookingPaxOnBoat(booking, assignments[booking.code], boat)
  }, 0)
}

export function boatRemainingSeats(
  plan: Pick<DayBoatPlan, 'capacities' | 'assignments' | 'kinds' | 'names'>,
  bookings: Booking[],
  boat: BoatNumber,
  excludeCode?: string,
): number {
  if (isPartnerBoat(plan, boat)) return 999
  const capacity = plan.capacities[boat - 1] ?? DEFAULT_BOAT_CAPACITY
  return capacity - boatAssignedPax(bookings, plan.assignments, boat, excludeCode)
}

export function canFitBookingOnBoat(
  plan: Pick<DayBoatPlan, 'capacities' | 'assignments' | 'kinds' | 'names'>,
  bookings: Booking[],
  boat: BoatNumber,
  booking: Booking,
): { ok: true; remaining: number; need: number } | { ok: false; remaining: number; need: number } {
  const need = totalPassengers(booking)
  const remaining = boatRemainingSeats(plan, bookings, boat, booking.code)
  if (remaining >= need) return { ok: true, remaining, need }
  return { ok: false, remaining, need }
}

/**
 * If a van already sits on one boat, later guests dropped on that van
 * inherit the same boat so they do not disappear from the boat board.
 */
export function adoptVanBookingsOntoSharedBoat(
  bookings: Booking[],
  vehicleAssignments: Record<string, VanSplit[]>,
  boatAssignments: DayBoatPlan['assignments'],
  van: number,
): DayBoatPlan['assignments'] | null {
  const members = bookings.filter(
    (booking) => bookingPaxOnVan(booking, vehicleAssignments[booking.code], van) > 0,
  )
  if (members.length === 0) return null
  const boats = new Set<BoatNumber>()
  for (const booking of members) {
    const boat = primaryBoatNumber(boatAssignments[booking.code])
    if (boat) boats.add(boat)
  }
  if (boats.size !== 1) return null
  const boat = [...boats][0]!
  let changed = false
  const next: DayBoatPlan['assignments'] = { ...boatAssignments }
  for (const booking of members) {
    const vanPax = bookingPaxOnVan(booking, vehicleAssignments[booking.code], van)
    const total = totalPassengers(booking)
    const splitVan = (vehicleAssignments[booking.code]?.length ?? 0) > 1 && vanPax < total
    if (splitVan) {
      const moved = moveBoatPax(next[booking.code], boat, vanPax, total)
      if (moved !== next[booking.code]) {
        if (moved) next[booking.code] = moved
        else delete next[booking.code]
        changed = true
      }
      continue
    }
    if (!bookingAssignedToBoat(next[booking.code], boat) || Array.isArray(next[booking.code])) {
      next[booking.code] = boat
      changed = true
    }
  }
  return changed ? next : null
}

export function adoptAllVansOntoSharedBoats(
  bookings: Booking[],
  vehicleAssignments: Record<string, VanSplit[]>,
  boatAssignments: DayBoatPlan['assignments'],
): DayBoatPlan['assignments'] | null {
  let assignments = boatAssignments
  let changed = false
  for (const van of listVanNumbers(vehicleAssignments).filter((item) => !isDummyVan(item))) {
    const next = adoptVanBookingsOntoSharedBoat(bookings, vehicleAssignments, assignments, van)
    if (!next) continue
    assignments = next
    changed = true
  }
  return changed ? assignments : null
}
