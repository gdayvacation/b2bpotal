/** Per-booking marina guest check-in QR helpers. */

export function guestCheckInPath(bookingCode: string, token = '') {
  const code = bookingCode.trim()
  if (!code) return '/check-in'
  const params = new URLSearchParams({ b: code })
  const t = token.trim()
  if (t) params.set('t', t)
  return `/check-in?${params.toString()}`
}

export function guestCheckInUrl(origin: string, bookingCode: string, token = '') {
  const base = origin.replace(/\/$/, '')
  return `${base}${guestCheckInPath(bookingCode, token)}`
}
