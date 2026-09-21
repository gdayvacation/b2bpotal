import { dayBoatPlanKey, type Program } from '@/lib/types'

export const CHECK_IN_PAYMENT_STORAGE_KEY = 'gday-check-in-payment'

const STORAGE_KEY = CHECK_IN_PAYMENT_STORAGE_KEY

/** Booking-level marina payment collection for check-in board. */
export type CheckInPaymentStatus = 'paid'

/** date|program → booking code → paid */
export type DayCheckInPaymentMap = Record<string, Record<string, CheckInPaymentStatus>>

export function loadCheckInPaymentMap(): DayCheckInPaymentMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: DayCheckInPaymentMap = {}
    for (const [dayKey, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== 'object') continue
      const payments: Record<string, CheckInPaymentStatus> = {}
      for (const [code, status] of Object.entries(row as Record<string, unknown>)) {
        if (status === 'paid') payments[code] = 'paid'
      }
      if (Object.keys(payments).length > 0) next[dayKey] = payments
    }
    return next
  } catch {
    return {}
  }
}

export function saveCheckInPaymentMap(map: DayCheckInPaymentMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function getCheckInPayment(
  map: DayCheckInPaymentMap,
  date: string,
  program: Program,
  bookingCode: string,
): CheckInPaymentStatus | null {
  return map[dayBoatPlanKey(date, program)]?.[bookingCode] ?? null
}

/** Per-seat action tick key on the live check-in board. */
export function checkInPaymentSeatKey(bookingCode: string, slot: number) {
  return `${bookingCode}:${slot}`
}

export function withCheckInPayment(
  map: DayCheckInPaymentMap,
  date: string,
  program: Program,
  bookingCode: string,
  status: CheckInPaymentStatus | null,
): DayCheckInPaymentMap {
  const key = dayBoatPlanKey(date, program)
  const day = { ...(map[key] ?? {}) }
  if (status === null) delete day[bookingCode]
  else day[bookingCode] = status
  const next = { ...map }
  if (Object.keys(day).length === 0) delete next[key]
  else next[key] = day
  return next
}
