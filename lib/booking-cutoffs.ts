import { formatLongDate } from '@/lib/format'
import type { Booking } from '@/lib/types'
import { chargeablePax } from '@/lib/types'

export const BOOKING_CUTOFF_TIMEZONE = 'Asia/Bangkok' as const

export type BookingCutoffSettings = {
  timezone: typeof BOOKING_CUTOFF_TIMEZONE
  /** Days before travel date when new bookings close (1 = day before). */
  bookBeforeDays: number
  /** Local time HH:mm on the book-before day. */
  bookUntilTime: string
  /** Days before travel date when agent modify / cancel closes. */
  cancelBeforeDays: number
  /** Local time HH:mm on the modify-before day. */
  cancelUntilTime: string
  /** Local time HH:mm on the modify-before day when extra charges start. */
  lateFeeFromTime: string
  /** THB per chargeable guest (AD / CH) for a late date change. Infant and TL are free. */
  dateChangeFeePerPerson: number
}

export const DEFAULT_BOOKING_CUTOFFS: BookingCutoffSettings = {
  timezone: BOOKING_CUTOFF_TIMEZONE,
  /** Close new bookings at end of the day before travel (Bangkok). */
  bookBeforeDays: 1,
  bookUntilTime: '23:59',
  cancelBeforeDays: 1,
  cancelUntilTime: '23:59',
  lateFeeFromTime: '20:00',
  dateChangeFeePerPerson: 300,
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function normalizeCutoffTime(value: string): string | null {
  const trimmed = value.trim()
  if (!TIME_RE.test(trimmed)) return null
  return trimmed
}

export function normalizeBeforeDays(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(30, Math.floor(value)))
}

export function normalizeDateChangeFee(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BOOKING_CUTOFFS.dateChangeFeePerPerson
  return Math.max(0, Math.min(20_000, Math.floor(value)))
}

/** Shift an ISO calendar date (YYYY-MM-DD) by whole days. */
export function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const utc = Date.UTC(y!, m! - 1, d! + days)
  const next = new Date(utc)
  const year = next.getUTCFullYear()
  const month = String(next.getUTCMonth() + 1).padStart(2, '0')
  const day = String(next.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function zonedParts(
  now: Date,
  timeZone: string,
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00'

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

function isOpenAt(
  travelDate: string,
  daysBefore: number,
  untilTime: string,
  now: Date,
  timeZone: string,
): boolean {
  const deadlineDate = addCalendarDays(travelDate, -daysBefore)
  const { date: nowDate, time: nowTime } = zonedParts(now, timeZone)
  const nowKey = `${nowDate}T${nowTime}`
  const deadlineKey = `${deadlineDate}T${untilTime}`
  return nowKey <= deadlineKey
}

export function cutoffDeadlineIso(
  travelDate: string,
  daysBefore: number,
): string {
  return addCalendarDays(travelDate, -daysBefore)
}

export function formatCutoffDeadline(
  travelDate: string,
  daysBefore: number,
  untilTime: string,
): string {
  const deadlineDate = cutoffDeadlineIso(travelDate, daysBefore)
  return `${untilTime} on ${formatLongDate(deadlineDate)}`
}

export function isBookingOpenForDate(
  settings: BookingCutoffSettings,
  travelDate: string,
  now: Date = new Date(),
): boolean {
  return isOpenAt(
    travelDate,
    settings.bookBeforeDays,
    settings.bookUntilTime,
    now,
    settings.timezone,
  )
}

/**
 * Soonest travel date open for booking right now (Asia/Bangkok).
 * Example with day-before 23:59 cutoff: on 22 Sep after midnight, 22 Sep is closed
 * and this returns 23 Sep (next-day trip already open until 23:59 on 22 Sep).
 */
export function earliestBookableTravelDate(
  settings: BookingCutoffSettings,
  now: Date = new Date(),
  horizonDays = 60,
): string {
  const today = zonedParts(now, settings.timezone).date
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const candidate = addCalendarDays(today, offset)
    if (isBookingOpenForDate(settings, candidate, now)) return candidate
  }
  return addCalendarDays(today, 1)
}

export function isCancelOpenForDate(
  settings: BookingCutoffSettings,
  travelDate: string,
  now: Date = new Date(),
): boolean {
  return isOpenAt(
    travelDate,
    settings.cancelBeforeDays,
    settings.cancelUntilTime,
    now,
    settings.timezone,
  )
}

/**
 * Extra charges apply once the clock reaches lateFeeFromTime on the modify
 * deadline day, while modify is still open.
 */
export function isLateFeeTimeForDate(
  settings: BookingCutoffSettings,
  travelDate: string,
  now: Date = new Date(),
): boolean {
  const deadlineDate = addCalendarDays(travelDate, -settings.cancelBeforeDays)
  const { date: nowDate, time: nowTime } = zonedParts(now, settings.timezone)
  const nowKey = `${nowDate}T${nowTime}`
  const lateKey = `${deadlineDate}T${settings.lateFeeFromTime}`
  return nowKey >= lateKey
}

export function isLateAmendmentForDate(
  settings: BookingCutoffSettings,
  travelDate: string,
  now: Date = new Date(),
): boolean {
  if (!isCancelOpenForDate(settings, travelDate, now)) return false
  return isLateFeeTimeForDate(settings, travelDate, now)
}

export function dateChangeFeeAmount(
  settings: BookingCutoffSettings,
  booking: Pick<Booking, 'adults' | 'children'>,
): number {
  return chargeablePax(booking) * settings.dateChangeFeePerPerson
}

export function formatThbAmount(amount: number): string {
  return `${amount.toLocaleString('en-US')} THB`
}

export function bookingClosedMessage(
  settings: BookingCutoffSettings,
  travelDate: string,
): string {
  return `Booking closed for this date (closed after ${formatCutoffDeadline(
    travelDate,
    settings.bookBeforeDays,
    settings.bookUntilTime,
  )} ${settings.timezone}).`
}

export function cancelClosedMessage(
  settings: BookingCutoffSettings,
  travelDate: string,
): string {
  return `Changes closed for this date (closed after ${formatCutoffDeadline(
    travelDate,
    settings.cancelBeforeDays,
    settings.cancelUntilTime,
  )} ${settings.timezone}).`
}

export function lateDateChangeNotice(
  settings: BookingCutoffSettings,
  booking: Pick<Booking, 'adults' | 'children'>,
): string {
  const count = chargeablePax(booking)
  const fee = dateChangeFeeAmount(settings, booking)
  return `This change is after ${settings.lateFeeFromTime} Thailand time. Extra charge: ${formatThbAmount(fee)} (${booking.adults} AD + ${booking.children} CH × ${formatThbAmount(settings.dateChangeFeePerPerson)}). Infant and TL are free.`
}

export function lateCancelNotice(settings: BookingCutoffSettings): string {
  return `Cancel the whole booking after ${settings.lateFeeFromTime} Thailand time is charged at full price (no refund).`
}

export function cancelWindowForDate(
  settings: BookingCutoffSettings,
  travelDate: string,
  now: Date = new Date(),
) {
  const freeUntil = formatCutoffDeadline(
    travelDate,
    settings.cancelBeforeDays,
    settings.lateFeeFromTime,
  )
  const closeUntil = formatCutoffDeadline(
    travelDate,
    settings.cancelBeforeDays,
    settings.cancelUntilTime,
  )
  const open = isCancelOpenForDate(settings, travelDate, now)
  const late = isLateAmendmentForDate(settings, travelDate, now)
  return {
    freeUntil,
    closeUntil,
    isOpen: open,
    isFree: open && !late,
    isLateCharge: late,
    isClosed: !open,
  }
}

export function lateReduceNotice(
  settings: BookingCutoffSettings,
  removed: Pick<Booking, 'adults' | 'children'>,
): string {
  const fee = dateChangeFeeAmount(settings, removed)
  return `Reducing guests after ${settings.lateFeeFromTime} Thailand time is a forced extra charge: ${formatThbAmount(fee)} (${removed.adults} AD + ${removed.children} CH × ${formatThbAmount(settings.dateChangeFeePerPerson)}). Infant and TL are free. Adding guests has no extra charge.`
}

export function summarizeCutoffRule(
  daysBefore: number,
  untilTime: string,
): string {
  if (daysBefore === 0) return `${untilTime} on the travel day`
  if (daysBefore === 1) return `${untilTime} the day before travel`
  return `${untilTime}, ${daysBefore} days before travel`
}

export function amendmentPolicyLines(settings: BookingCutoffSettings): string[] {
  return [
    `New bookings for the next day stay open until ${summarizeCutoffRule(settings.bookBeforeDays, settings.bookUntilTime)}. After midnight, that day is closed — book the following day only.`,
    `You can modify, add guests, cancel, or change the date until ${summarizeCutoffRule(settings.cancelBeforeDays, settings.cancelUntilTime)}.`,
    `After ${settings.lateFeeFromTime} Thailand time: reducing AD / CH or changing the date is +${formatThbAmount(settings.dateChangeFeePerPerson)} per AD / CH (infant and TL free). Adding guests has no extra charge. Cancel the whole booking — full price (no refund).`,
  ]
}
