import type { BookingImageDraft } from '@/lib/booking-from-image'
import type { Agent, Hotel } from '@/lib/types'
import { NO_TRANSFER_ZONE } from '@/lib/types'

export function matchAgentFromSeed(agents: Agent[], agentName: string) {
  const needle = agentName.trim().toLowerCase()
  if (!needle) return null
  const active = agents.filter((item) => item.status === 'Active')
  const exact = active.find((item) => item.name.toLowerCase() === needle)
  if (exact) return exact
  const partial = active.find(
    (item) => item.name.toLowerCase().includes(needle) || needle.includes(item.name.toLowerCase()),
  )
  return partial ?? null
}

export function matchZoneFromSeed(zones: { name: string }[], zoneName: string) {
  const needle = zoneName.trim().toLowerCase()
  if (!needle) return null
  if (needle === 'no transfer' || needle === 'no-transfer' || needle === 'self') {
    return NO_TRANSFER_ZONE
  }
  const exact = zones.find((zone) => zone.name.toLowerCase() === needle)
  if (exact) return exact.name
  const partial = zones.find(
    (zone) => zone.name.toLowerCase().includes(needle) || needle.includes(zone.name.toLowerCase()),
  )
  return partial?.name ?? null
}

export function resolvePickupZoneForDraft(
  draft: BookingImageDraft,
  zones: { name: string }[],
  hotels: Hotel[],
): string | null {
  const fromZone = draft.pickupZone ? matchZoneFromSeed(zones, draft.pickupZone) : null
  if (fromZone) return fromZone
  const hotel = hotels.find(
    (item) => item.name.toLowerCase() === draft.pickupHotel.trim().toLowerCase(),
  )
  if (hotel?.zoneName) return hotel.zoneName
  if (draft.pickupHotel.trim() && /no\s*tran/i.test(draft.pickupHotel)) {
    return NO_TRANSFER_ZONE
  }
  return null
}

export function draftReadyForImport(draft: BookingImageDraft) {
  return Boolean(
    draft.program &&
      draft.date &&
      draft.leadGuest.trim() &&
      draft.adults + draft.children + draft.infants + draft.tourLeaders > 0,
  )
}
