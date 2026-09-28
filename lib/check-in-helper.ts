import { PORTAL_TIMEZONE, addDaysISO, todayISO } from '@/lib/format'
import { guestCheckInQrImageUrl } from '@/lib/check-in-qr'

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export const HELPER_BOARD_HOURS_STORAGE_KEY = 'gday-helper-board-hours'

/** @deprecated Use DEFAULT_HELPER_BOARD_HOURS.close */
export const HELPER_BOARD_CLOSE_HOUR = 11

export type HelperBoardHours = {
  open: string
  close: string
}

export const DEFAULT_HELPER_BOARD_HOURS: HelperBoardHours = {
  open: '00:00',
  close: '11:00',
}

export function normalizeHelperBoardTime(value: string): string | null {
  const trimmed = value.trim()
  if (!TIME_RE.test(trimmed)) return null
  return trimmed
}

export function normalizeHelperBoardHours(
  value?: Partial<HelperBoardHours> | null,
): HelperBoardHours {
  return {
    open: normalizeHelperBoardTime(value?.open ?? '') ?? DEFAULT_HELPER_BOARD_HOURS.open,
    close: normalizeHelperBoardTime(value?.close ?? '') ?? DEFAULT_HELPER_BOARD_HOURS.close,
  }
}

export function helperBoardHoursValid(hours: HelperBoardHours) {
  return timeToMinutes(hours.close) > timeToMinutes(hours.open)
}

export function formatHelperBoardTime(value: string) {
  return normalizeHelperBoardTime(value) ?? value
}

export function loadHelperBoardHours(): HelperBoardHours {
  if (typeof window === 'undefined') return DEFAULT_HELPER_BOARD_HOURS
  try {
    const raw = window.localStorage.getItem(HELPER_BOARD_HOURS_STORAGE_KEY)
    if (!raw) return DEFAULT_HELPER_BOARD_HOURS
    return normalizeHelperBoardHours(JSON.parse(raw) as Partial<HelperBoardHours>)
  } catch {
    return DEFAULT_HELPER_BOARD_HOURS
  }
}

export function saveHelperBoardHours(hours: Partial<HelperBoardHours>) {
  const next = normalizeHelperBoardHours({ ...loadHelperBoardHours(), ...hours })
  if (typeof window === 'undefined') return next
  try {
    window.localStorage.setItem(HELPER_BOARD_HOURS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore quota / private mode
  }
  return next
}

export function helperBoardPath(
  date: string,
  hours?: Partial<HelperBoardHours>,
  token?: string,
) {
  const normalized = normalizeHelperBoardHours(hours)
  const accessKey = token?.trim() ?? ''
  if (!accessKey) return ''
  const params = new URLSearchParams({
    d: date,
    t: accessKey,
    o: normalized.open,
    c: normalized.close,
  })
  return `/check-in/helper?${params.toString()}`
}

export function helperBoardUrl(
  origin: string,
  date: string,
  hours?: Partial<HelperBoardHours>,
  token?: string,
) {
  const path = helperBoardPath(date, hours, token)
  if (!path) return ''
  return `${origin.replace(/\/$/, '')}${path}`
}

export function helperBoardQrImageUrl(
  origin: string,
  date: string,
  size = 512,
  hours?: Partial<HelperBoardHours>,
  token?: string,
) {
  const url = helperBoardUrl(origin, date, hours, token)
  if (!url) return ''
  return guestCheckInQrImageUrl(url, size)
}

function bangkokClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PORTAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const hour = Number(value('hour'))
  const minute = Number(value('minute'))
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    hour,
    minute,
    minutes: hour * 60 + minute,
  }
}

function timeToMinutes(value: string) {
  const normalized = normalizeHelperBoardTime(value)
  if (!normalized) return 0
  const [hour, minute] = normalized.split(':').map(Number)
  return (hour ?? 0) * 60 + (minute ?? 0)
}

export function isHelperBoardClosed(
  date: string,
  now: Date = new Date(),
  hours?: Partial<HelperBoardHours>,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true
  const clock = bangkokClock(now)
  if (clock.date > date) return true
  if (clock.date < date) return false
  return clock.minutes >= timeToMinutes(normalizeHelperBoardHours(hours).close)
}

export function isHelperBoardNotYetOpen(
  date: string,
  now: Date = new Date(),
  hours?: Partial<HelperBoardHours>,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true
  const clock = bangkokClock(now)
  if (clock.date > date) return false
  if (clock.date < date) return true
  return clock.minutes < timeToMinutes(normalizeHelperBoardHours(hours).open)
}

export function isHelperBoardOpen(
  date: string,
  now: Date = new Date(),
  hours?: Partial<HelperBoardHours>,
) {
  return !isHelperBoardNotYetOpen(date, now, hours) && !isHelperBoardClosed(date, now, hours)
}

/** After today’s close time, admin issues tomorrow’s helper QR. */
export function helperBoardIssueDate(now: Date = new Date(), hours?: Partial<HelperBoardHours>) {
  const today = todayISO(now)
  return isHelperBoardClosed(today, now, hours) ? addDaysISO(today, 1) : today
}
