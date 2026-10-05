import { todayISO } from '@/lib/format'

/** Guest QR repeat fetch / Realtime cutoff: 12:00 Asia/Bangkok on the tour date. */
const GUEST_QR_FETCH_CUTOFF_HOUR_BKK = 12

/**
 * Whether a guest QR tab may keep polling or Realtime for boat updates.
 * Staff/admin flows do not use this.
 */
export function guestQrRepeatFetchOpen(tourDate: string, now = new Date()): boolean {
  return msUntilGuestQrRepeatFetchCutoff(tourDate, now) > 0
}

/** Milliseconds until noon Bangkok on the tour date; 0 if already past cutoff or invalid. */
export function msUntilGuestQrRepeatFetchCutoff(tourDate: string, now = new Date()): number {
  const day = tourDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 0
  const today = todayISO(now)
  if (day < today) return 0
  const cutoff = Date.parse(
    `${day}T${String(GUEST_QR_FETCH_CUTOFF_HOUR_BKK).padStart(2, '0')}:00:00+07:00`,
  )
  if (!Number.isFinite(cutoff)) return 0
  return Math.max(0, cutoff - now.getTime())
}
