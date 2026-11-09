import { todayISO } from '@/lib/format'

/**
 * Date shown on a helper link.
 * Before the issued day, keep that next-day booking.
 * Once the issued day arrives, follow Bangkok today so midnight rolls the board forward.
 */
export function helperBoardViewDate(linkDate: string, now: Date = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(linkDate)) return ''
  const today = todayISO(now)
  return today < linkDate ? linkDate : today
}

export function helperBoardPath(date: string, token?: string) {
  const accessKey = token?.trim() ?? ''
  if (!accessKey || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const params = new URLSearchParams({
    d: date,
    t: accessKey,
  })
  return `/check-in/helper?${params.toString()}`
}

export function helperBoardUrl(origin: string, date: string, token?: string) {
  const path = helperBoardPath(date, token)
  if (!path) return ''
  return `${origin.replace(/\/$/, '')}${path}`
}
