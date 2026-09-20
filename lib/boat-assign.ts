import type { BoatNumber, Booking, DayBoatPlan, VanSplit } from '@/lib/types'
import { BOAT_NUMBERS, isNoTransfer, totalPassengers } from '@/lib/types'
import { primaryVan } from '@/lib/vehicle-assign'

type AssignableGroup = {
  id: string
  bookings: Booking[]
  pax: number
  /** Van number when grouped by transfer van; null for no-transfer / unassigned. */
  van: number | null
}

/**
 * Assign boats preferring same-van guests on the same boat.
 * Van groups are placed as units (first-fit decreasing). Bookings with no van
 * or No Transfer are assigned individually afterward to any boat with space.
 */
export function autoAssignBoats(
  bookings: Booking[],
  capacities: DayBoatPlan['capacities'],
  vanAssignments: Record<string, VanSplit[]> = {},
): Record<string, BoatNumber> {
  const groups = buildGroups(bookings, vanAssignments)
  // Larger groups first so van cohorts stay together when capacity allows.
  const sorted = groups.slice().sort(
    (a, b) => b.pax - a.pax || (a.van ?? 999) - (b.van ?? 999) || a.id.localeCompare(b.id),
  )

  const load: Record<BoatNumber, number> = { 1: 0, 2: 0, 3: 0 }
  const assignments: Record<string, BoatNumber> = {}

  for (const group of sorted) {
    const boat = pickBoat(group.pax, load, capacities)
    for (const booking of group.bookings) {
      assignments[booking.code] = boat
    }
    load[boat] += group.pax
  }

  return assignments
}

function buildGroups(
  bookings: Booking[],
  vanAssignments: Record<string, VanSplit[]>,
): AssignableGroup[] {
  const byVan = new Map<number, Booking[]>()
  const loose: Booking[] = []

  for (const booking of bookings) {
    if (isNoTransfer(booking.pickupZone)) {
      loose.push(booking)
      continue
    }
    const van = primaryVan(vanAssignments[booking.code])
    if (van === null) {
      loose.push(booking)
      continue
    }
    const list = byVan.get(van) ?? []
    list.push(booking)
    byVan.set(van, list)
  }

  const groups: AssignableGroup[] = []

  for (const van of [...byVan.keys()].sort((a, b) => a - b)) {
    const items = (byVan.get(van) ?? []).slice().sort((a, b) => a.code.localeCompare(b.code))
    groups.push({
      id: `van-${van}`,
      van,
      bookings: items,
      pax: items.reduce((sum, b) => sum + totalPassengers(b), 0),
    })
  }

  for (const booking of loose) {
    groups.push({
      id: `booking-${booking.code}`,
      van: null,
      bookings: [booking],
      pax: totalPassengers(booking),
    })
  }

  return groups
}

function pickBoat(
  pax: number,
  load: Record<BoatNumber, number>,
  capacities: DayBoatPlan['capacities'],
): BoatNumber {
  const fitting = BOAT_NUMBERS.filter((boat) => load[boat] + pax <= capacities[boat - 1]).sort(
    (a, b) => load[a] - load[b] || a - b,
  )
  return (
    fitting[0] ??
    BOAT_NUMBERS.slice().sort((a, b) => load[a] - load[b] || a - b)[0]
  )
}
