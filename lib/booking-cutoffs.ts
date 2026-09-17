import { formatLongDate } from '@/lib/format'

export const BOOKING_CUTOFF_TIMEZONE = 'Asia/Bangkok' as const

export type BookingCutoffSettings = {
  timezone: typeof BOOKING_CUTOFF_TIMEZONE
  /** Days before travel date when new bookings close (1 = day before). */
  bookBeforeDays: number
  /** Local time HH:mm on the book-before day. */
  bookUntilTime: string
  /** Days before travel date when agent cancel closes. */
  cancelBeforeDays: number
  /** Local time HH:mm on the cancel-before day. */
  cancelUntilTime: string
}

export const DEFAULT_BOOKING_CUTOFFS: BookingCutoffSettings = {
  timezone: BOOKING_CUTOFF_TIMEZONE,
  bookBeforeDays: 1,
  bookUntilTime: '18:00',
  cancelBeforeDays: 1,
  cancelUntilTime: '16:00',
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

function zonedParts(
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
  return `Cancel closed for this date (closed after ${formatCutoffDeadline(
    travelDate,
    settings.cancelBeforeDays,
    settings.cancelUntilTime,
  )} ${settings.timezone}).`
}

export function summarizeCutoffRule(
  daysBefore: number,
  untilTime: string,
): string {
  if (daysBefore === 0) return `${untilTime} on the travel day`
  if (daysBefore === 1) return `${untilTime} the day before travel`
  return `${untilTime}, ${daysBefore} days before travel`
}
