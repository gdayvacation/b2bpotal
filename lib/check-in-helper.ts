import { PORTAL_TIMEZONE, addDaysISO, todayISO } from '@/lib/format'
import { guestCheckInQrImageUrl } from '@/lib/check-in-qr'

const HELPER_BOARD_SALT = 'gday-helper-board-v1'

/** Helper board closes at 11:00 Asia/Bangkok on the travel date. */
export const HELPER_BOARD_CLOSE_HOUR = 11

export function helperBoardToken(date: string) {
  const input = `${HELPER_BOARD_SALT}|${date}|helper`
  let a = 2166136261
  let b = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i)
    a ^= code
    a = Math.imul(a, 16777619)
    b = Math.imul(b ^ code, 0x01000193)
  }
  return `${(a >>> 0).toString(36).padStart(7, '0')}${(b >>> 0).toString(36).padStart(7, '0')}`
}

export function isValidHelperBoardToken(date: string, token: string) {
  return Boolean(date) && token.trim() === helperBoardToken(date)
}

export function helperBoardPath(date: string) {
  const token = helperBoardToken(date)
  return `/check-in/helper?d=${encodeURIComponent(date)}&t=${encodeURIComponent(token)}`
}

export function helperBoardUrl(origin: string, date: string) {
  return `${origin.replace(/\/$/, '')}${helperBoardPath(date)}`
}

export function helperBoardQrImageUrl(origin: string, date: string, size = 512) {
  return guestCheckInQrImageUrl(helperBoardUrl(origin, date), size)
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
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  }
}

export function isHelperBoardClosed(date: string, now: Date = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true
  const clock = bangkokClock(now)
  if (clock.date > date) return true
  if (clock.date < date) return false
  return clock.hour >= HELPER_BOARD_CLOSE_HOUR
}

/** After 11:00 today, admin issues tomorrow’s helper QR. */
export function helperBoardIssueDate(now: Date = new Date()) {
  const today = todayISO(now)
  return isHelperBoardClosed(today, now) ? addDaysISO(today, 1) : today
}
