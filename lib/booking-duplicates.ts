import { isActiveBooking, type Booking, type Program } from '@/lib/types'

export type ImportDuplicate = {
  kind: 'system' | 'file'
  /** Existing booking IDs when this row is already in the system. */
  codes: string[]
}

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

function tripBucket(date: string, program: string, guest: string, hotel: string) {
  return `${date}\u0001${program}\u0001${guest}\u0001${hotel}`
}

/**
 * Rows that repeat a booking already stored, or an earlier row in the same file.
 * Match is the travel date plus guest, hotel, and agent. New rows still receive the next ID.
 */
export function classifyImportDuplicates(
  rows: {
    id: string
    draft: {
      date: string
      program: Program | null
      leadGuest: string
      pickupHotel: string
      agentName: string
    }
  }[],
  bookings: Booking[],
  resolveAgentSlug: (agentName: string) => string,
): Record<string, ImportDuplicate> {
  const buckets = new Map<string, Booking[]>()
  for (const booking of bookings) {
    if (!isActiveBooking(booking) || !booking.date) continue
    const key = tripBucket(
      booking.date,
      booking.program,
      normalizeGuestKey(booking.leadGuest),
      normalizeGuestKey(booking.pickupHotel),
    )
    const list = buckets.get(key)
    if (list) list.push(booking)
    else buckets.set(key, [booking])
  }

  const result: Record<string, ImportDuplicate> = {}
  const seenInFile = new Set<string>()

  for (const row of rows) {
    const draft = row.draft
    const guest = normalizeGuestKey(draft.leadGuest)
    const date = draft.date.trim()
    const program = draft.program
    if (!guest || !date || !program) continue
    const hotel = normalizeGuestKey(draft.pickupHotel)
    const agentName = normalizeGuestKey(draft.agentName)
    const agentSlug = resolveAgentSlug(draft.agentName).trim().toLowerCase()
    if (!agentName && !agentSlug) continue

    const sameAgent = (booking: Booking) => {
      if (agentSlug && booking.agentSlug.trim().toLowerCase() === agentSlug) return true
      return Boolean(agentName) && normalizeGuestKey(booking.agentName) === agentName
    }
    const existing = (buckets.get(tripBucket(date, program, guest, hotel)) ?? []).filter(sameAgent)
    const fileKey = `${date}\u0001${program}\u0001${guest}\u0001${hotel}\u0001${agentSlug || agentName}`
    if (existing.length > 0) {
      result[row.id] = { kind: 'system', codes: existing.map((booking) => booking.code) }
    } else if (seenInFile.has(fileKey)) {
      result[row.id] = { kind: 'file', codes: [] }
    }
    seenInFile.add(fileKey)
  }

  return result
}

export function duplicateBookingMessage(matches: Booking[]) {
  if (matches.length === 0) return ''
  const codes = matches.map((booking) => booking.code).join(', ')
  return matches.length === 1
    ? `A booking already exists for this guest on this date (${codes}). Save anyway?`
    : `Bookings already exist for this guest on this date (${codes}). Save anyway?`
}
