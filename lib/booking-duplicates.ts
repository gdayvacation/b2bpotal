import { isActiveBooking, type Booking, type Program } from '@/lib/types'

export function normalizeGuestKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function findDuplicateBookings(
  bookings: Booking[],
  input: {
    leadGuest: string
    date: string
    program: Program
    excludeCode?: string
  },
) {
  const key = normalizeGuestKey(input.leadGuest)
  if (!key || !input.date) return []
  return bookings.filter(
    (booking) =>
      isActiveBooking(booking) &&
      booking.date === input.date &&
      booking.program === input.program &&
      booking.code !== input.excludeCode &&
      normalizeGuestKey(booking.leadGuest) === key,
  )
}

export function duplicateBookingMessage(matches: Booking[]) {
  if (matches.length === 0) return ''
  const codes = matches.map((booking) => booking.code).join(', ')
  return matches.length === 1
    ? `A booking already exists for this guest on this date (${codes}). Save anyway?`
    : `Bookings already exist for this guest on this date (${codes}). Save anyway?`
}
