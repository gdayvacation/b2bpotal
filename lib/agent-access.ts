export const AGENT_KEY_QUERY = 'k'
export const AGENT_SLUG_COOKIE = 'gday-agent-slug'
export const AGENT_KEY_COOKIE = 'gday-agent-key'
export const AGENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export function agentBookingPath(slug: string, key?: string | null) {
  const base = `/agent/${slug}`
  if (!key) return base
  return `${base}?${AGENT_KEY_QUERY}=${encodeURIComponent(key)}`
}

export function agentBookingUrl(origin: string, slug: string, key: string) {
  return `${origin}${agentBookingPath(slug, key)}`
}

export function agentCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: AGENT_COOKIE_MAX_AGE,
  }
}
