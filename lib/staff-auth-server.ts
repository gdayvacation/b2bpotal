import { createClient } from '@supabase/supabase-js'
import type { StaffRole } from '@/lib/staff-auth'

export const STAFF_COOKIE = 'gday-staff'
export const STAFF_COOKIE_MAX_AGE = 60 * 60 * 12

export const STAFF_ADMIN_EMAIL = 'gday-staff-admin@internal.gday'
export const STAFF_ACCOUNTING_EMAIL = 'gday-staff-accounting@internal.gday'

export function isStaffRole(value: string | undefined | null): value is StaffRole {
  return value === 'admin' || value === 'accounting'
}

function pinFor(role: StaffRole) {
  const value =
    role === 'admin' ? process.env.STAFF_ADMIN_PIN : process.env.STAFF_ACCOUNTING_PIN
  return value?.trim() || ''
}

export function staffPinConfigured(role: StaffRole) {
  return pinFor(role).length > 0
}

export function verifyStaffPin(role: StaffRole, pin: string) {
  const expected = pinFor(role)
  return expected.length > 0 && pin === expected
}

export function staffCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: STAFF_COOKIE_MAX_AGE,
  }
}

export async function createStaffSupabaseSession(role: StaffRole) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  const password = process.env.STAFF_SUPABASE_PASSWORD?.trim()
  if (!url || !anonKey || !password) return null

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const email = role === 'admin' ? STAFF_ADMIN_EMAIL : STAFF_ACCOUNTING_EMAIL
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    console.warn('[staff-auth] staff supabase sign-in failed', error?.message)
    return null
  }
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  }
}
