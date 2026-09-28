import type { PortalSession } from '@/lib/types'

export const PORTAL_SESSION_KEY = 'gday-portal-user'

export function readPortalSession(): PortalSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PORTAL_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PortalSession
    if (!parsed?.id || !parsed.userId) return null
    return parsed
  } catch {
    return null
  }
}

export function writePortalSession(session: PortalSession) {
  sessionStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(session))
}

export function clearPortalSession() {
  sessionStorage.removeItem(PORTAL_SESSION_KEY)
}
