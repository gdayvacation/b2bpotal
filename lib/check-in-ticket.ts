import { dayBoatPlanKey, type Program } from '@/lib/types'
import type { DayCheckInPaymentMap } from '@/lib/check-in-payment'

export const CHECK_IN_TICKET_STORAGE_KEY = 'gday-check-in-ticket'
export const CHECK_IN_TICKET_MIGRATION_KEY = 'gday-check-in-ticket-from-payment-v1'

const STORAGE_KEY = CHECK_IN_TICKET_STORAGE_KEY
const TICKET_SUFFIX = ':ticket'

/** Booking-level boat-ticket handoff on the check-in board. */
export type CheckInTicketStatus = 'issued'

/** date|program → booking code → issued */
export type DayCheckInTicketMap = Record<string, Record<string, CheckInTicketStatus>>

export function checkInTicketSeatKey(bookingCode: string) {
  return `${bookingCode}${TICKET_SUFFIX}`
}

export function isCheckInTicketSeatKey(seatKey: string) {
  return seatKey.endsWith(TICKET_SUFFIX)
}

export function bookingCodeFromTicketSeatKey(seatKey: string) {
  return isCheckInTicketSeatKey(seatKey) ? seatKey.slice(0, -TICKET_SUFFIX.length) : seatKey
}

function mapHasEntries(map: Record<string, Record<string, unknown>>) {
  return Object.values(map).some((row) => Object.keys(row).length > 0)
}

export function loadCheckInTicketMap(): DayCheckInTicketMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: DayCheckInTicketMap = {}
    for (const [dayKey, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== 'object') continue
      const tickets: Record<string, CheckInTicketStatus> = {}
      for (const [code, status] of Object.entries(row as Record<string, unknown>)) {
        if (status === 'issued' || status === 'paid') tickets[code] = 'issued'
      }
      if (Object.keys(tickets).length > 0) next[dayKey] = tickets
    }
    return next
  } catch {
    return {}
  }
}

export function saveCheckInTicketMap(map: DayCheckInTicketMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function getCheckInTicket(
  map: DayCheckInTicketMap,
  date: string,
  program: Program,
  bookingCode: string,
): CheckInTicketStatus | null {
  return map[dayBoatPlanKey(date, program)]?.[bookingCode] ?? null
}

export function withCheckInTicket(
  map: DayCheckInTicketMap,
  date: string,
  program: Program,
  bookingCode: string,
  status: CheckInTicketStatus | null,
): DayCheckInTicketMap {
  const key = dayBoatPlanKey(date, program)
  const day = { ...(map[key] ?? {}) }
  if (status === null) delete day[bookingCode]
  else day[bookingCode] = status
  const next = { ...map }
  if (Object.keys(day).length === 0) delete next[key]
  else next[key] = day
  return next
}

export function hasCheckInTicketMigrationFlag() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(CHECK_IN_TICKET_MIGRATION_KEY) === '1'
}

export function markCheckInTicketMigrationDone() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CHECK_IN_TICKET_MIGRATION_KEY, '1')
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Older check-in ticks lived in the payment map but meant “boat ticket given”.
 * Move them once, so Pay and Ticket can be tracked separately.
 */
export function adoptLegacyPaymentsAsTickets(
  payments: DayCheckInPaymentMap,
  tickets: DayCheckInTicketMap,
): {
  payments: DayCheckInPaymentMap
  tickets: DayCheckInTicketMap
  migrated: boolean
} {
  if (
    hasCheckInTicketMigrationFlag() ||
    mapHasEntries(tickets) ||
    !mapHasEntries(payments)
  ) {
    return { payments, tickets, migrated: false }
  }

  const nextTickets: DayCheckInTicketMap = {}
  for (const [dayKey, row] of Object.entries(payments)) {
    const day: Record<string, CheckInTicketStatus> = {}
    for (const [code, status] of Object.entries(row)) {
      if (status === 'paid') day[bookingCodeFromTicketSeatKey(code)] = 'issued'
    }
    if (Object.keys(day).length > 0) nextTickets[dayKey] = day
  }

  return { payments: {}, tickets: nextTickets, migrated: true }
}
