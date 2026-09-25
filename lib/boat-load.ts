import {
  DEFAULT_BOAT_CAPACITY,
  totalPassengers,
  type BoatNumber,
  type Booking,
  type DayBoatPlan,
} from '@/lib/types'

/** Live pax already placed on this boat (one booking = one boat). */
export function boatAssignedPax(
  bookings: Booking[],
  assignments: Record<string, BoatNumber>,
  boat: BoatNumber,
  excludeCode?: string,
): number {
  return bookings.reduce((sum, booking) => {
    if (excludeCode && booking.code === excludeCode) return sum
    if (assignments[booking.code] !== boat) return sum
    return sum + totalPassengers(booking)
  }, 0)
}

export function boatRemainingSeats(
  plan: Pick<DayBoatPlan, 'capacities' | 'assignments'>,
  bookings: Booking[],
  boat: BoatNumber,
  excludeCode?: string,
): number {
  const capacity = plan.capacities[boat - 1] ?? DEFAULT_BOAT_CAPACITY
  return capacity - boatAssignedPax(bookings, plan.assignments, boat, excludeCode)
}

export function canFitBookingOnBoat(
  plan: Pick<DayBoatPlan, 'capacities' | 'assignments'>,
  bookings: Booking[],
  boat: BoatNumber,
  booking: Booking,
): { ok: true; remaining: number; need: number } | { ok: false; remaining: number; need: number } {
  const need = totalPassengers(booking)
  const remaining = boatRemainingSeats(plan, bookings, boat, booking.code)
  if (remaining >= need) return { ok: true, remaining, need }
  return { ok: false, remaining, need }
}
