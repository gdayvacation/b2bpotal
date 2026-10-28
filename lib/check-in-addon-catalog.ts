import type { CheckInServiceKind } from '@/lib/check-in-services'

/** Fixed marina prices. The database function uses the same numbers. */
export const SCUBA_PRICE_PER_PERSON = 2000
export const SHARED_LONGTAIL_ADULT_PRICE = 500
export const SHARED_LONGTAIL_CHILD_PRICE = 300
/** Adult rate. Kept so older labels still compile. */
export const SHARED_LONGTAIL_PRICE_PER_PERSON = SHARED_LONGTAIL_ADULT_PRICE
export const SHARED_LONGTAIL_BOAT_CAP = 10
export const PRIVATE_LONGTAIL_MAX_PAX = 10
export const SCUBA_MAX_PEOPLE = 40

export const PRIVATE_LONGTAIL_TIERS = [
  { min: 1, max: 4, price: 2500 },
  { min: 5, max: 7, price: 3000 },
  { min: 8, max: 10, price: 4000 },
] as const

export function addonPeopleCap(kind: CheckInServiceKind, bookingPax: number) {
  const pax = Math.max(1, Math.floor(bookingPax) || 1)
  if (kind === 'share-longtail') return Math.min(SHARED_LONGTAIL_BOAT_CAP, pax)
  // A private boat can be filled with guests from other bookings.
  if (kind === 'private-longtail') return PRIVATE_LONGTAIL_MAX_PAX
  return Math.min(SCUBA_MAX_PEOPLE, pax)
}

export function isSharedChildPrice(pricePerPerson: number) {
  return pricePerPerson === SHARED_LONGTAIL_CHILD_PRICE
}

export function sharedLongtailQtyLabel(people: number, pricePerPerson: number) {
  const count = Math.max(1, Math.floor(people) || 1)
  const child = isSharedChildPrice(pricePerPerson)
  if (count === 1) return child ? '1 child' : '1 adult'
  return `${count} ${child ? 'children' : 'adults'}`
}

export function sharePartyCopyKey(people: number, pricePerPerson: number) {
  const child = isSharedChildPrice(pricePerPerson)
  if (Math.max(1, Math.floor(people) || 1) === 1) {
    return child ? ('addonOneChild' as const) : ('addonOneAdult' as const)
  }
  return child ? ('addonChildCount' as const) : ('addonAdultCount' as const)
}

/** Lowest party size that produces this stored boat price. */
export function privatePartyFromBoatPrice(price: number) {
  const tier = [...PRIVATE_LONGTAIL_TIERS].reverse().find((row) => price >= row.price)
  return tier?.min ?? 1
}

export function privateLongtailBoatPrice(pax: number) {
  const count = Math.max(1, Math.min(PRIVATE_LONGTAIL_MAX_PAX, Math.floor(pax) || 1))
  const tier = PRIVATE_LONGTAIL_TIERS.find((row) => count >= row.min && count <= row.max)
  return tier?.price ?? PRIVATE_LONGTAIL_TIERS[0].price
}

/**
 * Quote a guest add-on. Private boats are stored as 1 boat at the tier price.
 * `party` is the number of people the guest picked.
 */
export function quoteGuestAddon(kind: CheckInServiceKind, people: number, bookingPax: number) {
  const cap = addonPeopleCap(kind, bookingPax)
  const party = Math.max(1, Math.floor(people) || 1)
  if (party > cap) return null
  if (kind === 'private-longtail') {
    const price = privateLongtailBoatPrice(party)
    return { kind, people: 1, pricePerPerson: price, total: price, party }
  }
  const pricePerPerson =
    kind === 'scuba' ? SCUBA_PRICE_PER_PERSON : SHARED_LONGTAIL_ADULT_PRICE
  return {
    kind,
    people: party,
    pricePerPerson,
    total: party * pricePerPerson,
    party,
  }
}
