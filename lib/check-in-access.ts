export const HELPER_DATE_COOKIE = 'gday-helper-date'
export const HELPER_KEY_COOKIE = 'gday-helper-key'
export const HELPER_COOKIE_MAX_AGE = 60 * 60 * 16

export type HelperBoardState = 'ok' | 'too_early' | 'closed' | 'invalid'

export function helperCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: HELPER_COOKIE_MAX_AGE,
  }
}
