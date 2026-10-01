import { createClient } from '@supabase/supabase-js'
import type { StaffRole } from '@/lib/staff-auth'

export const STAFF_COOKIE = 'gday-staff'

export const STAFF_ADMIN_EMAIL = 'gday-staff-admin@internal.gday'
export const STAFF_ACCOUNTING_EMAIL = 'gday-staff-accounting@internal.gday'

/** Days without any staff activity before the device is logged out. */
export function staffSessionIdleDays() {
  const n = Math.floor(Number(process.env.STAFF_SESSION_IDLE_DAYS))
  if (Number.isFinite(n) && n >= 1) return Math.min(n, 30)
  return 2
}

/** Cookie lifetime matches idle window so abandoned browsers drop access. */
export function staffCookieMaxAgeSeconds() {
  return staffSessionIdleDays() * 24 * 60 * 60
}

export type StaffSessionParts = {
  role: StaffRole
  id: string
  token: string
}

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

export function staffMaxSessions(role: StaffRole) {
  const raw =
    role === 'admin'
      ? process.env.STAFF_ADMIN_MAX_SESSIONS
      : process.env.STAFF_ACCOUNTING_MAX_SESSIONS
  const n = Math.floor(Number(raw))
  if (Number.isFinite(n) && n >= 1) return Math.min(n, 10)
  // Default: two desks each (marina + office). Override via env.
  return 2
}

export function staffCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: staffCookieMaxAgeSeconds(),
  }
}

/** Cookie value: role.id.token (legacy bare role still parsed as role-only). */
export function encodeStaffCookie(parts: StaffSessionParts) {
  return `${parts.role}.${parts.id}.${parts.token}`
}

export function parseStaffCookie(value: string | undefined | null): StaffSessionParts | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (isStaffRole(raw)) {
    // Legacy cookie before device limits — treat as signed-out so user re-logins once.
    return null
  }
  const [role, id, token] = raw.split('.')
  if (!isStaffRole(role) || !id || !token) return null
  if (!/^[0-9a-f-]{36}$/i.test(id) || token.length < 16) return null
  return { role, id, token }
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

export async function openStaffDeviceSession(
  role: StaffRole,
  accessToken: string,
): Promise<StaffSessionParts | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return null

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const { data, error } = await supabase.rpc('staff_session_open', {
    p_max: staffMaxSessions(role),
    p_idle_days: staffSessionIdleDays(),
  })
  if (error) {
    console.warn('[staff-auth] staff_session_open failed', error.message)
    return null
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    ok?: unknown
    id?: unknown
    token?: unknown
    role?: unknown
  } | null
  if (row?.ok !== true) return null
  const id = String(row.id ?? '')
  const token = String(row.token ?? '')
  const openedRole = String(row.role ?? '')
  if (!id || !token || !isStaffRole(openedRole)) return null
  return { role: openedRole, id, token }
}

export async function validateStaffDeviceSession(parts: StaffSessionParts): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return false
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc('staff_session_validate', {
    p_role: parts.role,
    p_id: parts.id,
    p_token: parts.token,
    p_idle_days: staffSessionIdleDays(),
  })
  if (error) {
    console.warn('[staff-auth] staff_session_validate failed', error.message)
    return false
  }
  return data === true
}

export async function closeStaffDeviceSession(parts: StaffSessionParts | null) {
  if (!parts) return
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await supabase.rpc('staff_session_close', {
    p_id: parts.id,
    p_token: parts.token,
  })
  if (error) {
    console.warn('[staff-auth] staff_session_close failed', error.message)
  }
}
