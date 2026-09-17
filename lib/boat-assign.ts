import type { BoatNumber, Booking, DayBoatPlan } from '@/lib/types'
import { BOAT_NUMBERS, totalPassengers } from '@/lib/types'

/**
 * First-fit decreasing: keep booking groups intact, fill boats without
 * exceeding capacity when possible, then balance overflow onto the least-full boat.
 */
export function autoAssignBoats(
  bookings: Booking[],
  capacities: DayBoatPlan['capacities'],
): Record<string, BoatNumber> {
  const sorted = [...bookings].sort(
    (a, b) => totalPassengers(b) - totalPassengers(a) || a.code.localeCompare(b.code),
  )
  const load: Record<BoatNumber, number> = { 1: 0, 2: 0, 3: 0 }
  const assignments: Record<string, BoatNumber> = {}

  for (const booking of sorted) {
    const pax = totalPassengers(booking)
    const fitting = BOAT_NUMBERS.filter((boat) => load[boat] + pax <= capacities[boat - 1]).sort(
      (a, b) => load[a] - load[b] || a - b,
    )
    const boat =
      fitting[0] ??
      BOAT_NUMBERS.slice().sort((a, b) => load[a] - load[b] || a - b)[0]
    assignments[booking.code] = boat
    load[boat] += pax
  }

  return assignments
}
