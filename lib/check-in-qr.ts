/** Per-booking marina guest check-in QR helpers. */

export function guestCheckInPath(bookingCode: string) {
  const code = bookingCode.trim()
  if (!code) return '/check-in'
  return `/check-in?b=${encodeURIComponent(code)}`
}

export function guestCheckInUrl(origin: string, bookingCode: string) {
  const base = origin.replace(/\/$/, '')
  return `${base}${guestCheckInPath(bookingCode)}`
}

export function guestCheckInQrImageUrl(checkInUrl: string, size = 512) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=16&data=${encodeURIComponent(checkInUrl)}`
}
