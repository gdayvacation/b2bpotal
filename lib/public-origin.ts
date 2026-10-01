/**
 * Origin for links shared with guests, helpers and agents (QR codes, copy links).
 * Vercel deployment / preview URLs require a Vercel login, so shared links must
 * always point at the public production domain.
 */
const PRODUCTION_ORIGIN = 'https://gdayb2b.vercel.app'

function isLocalHost(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local') ||
    /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(hostname)
  )
}

export function publicOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')
  if (configured) return configured
  if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) {
    return window.location.origin
  }
  return PRODUCTION_ORIGIN
}
