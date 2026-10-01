import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'

export type StaffRole = 'admin' | 'accounting'

export const ADMIN_AUTH_VALUE = 'admin'
export const ACCOUNTING_AUTH_VALUE = 'account'

type StaffSessionResponse = {
  role: StaffRole | null
}

type StaffLoginResponse = {
  role?: StaffRole
  accessToken?: string
  refreshToken?: string
  error?: string
}

async function applySupabaseSession(accessToken?: string, refreshToken?: string) {
  if (!accessToken || !refreshToken || !hasSupabaseConfig()) return
  const { error } = await getSupabaseBrowserClient().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (error) {
    console.warn('[staff-auth] could not store staff session', error.message)
  }
}

export async function loginStaff(role: StaffRole, pin: string) {
  const response = await fetch('/api/staff/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, pin }),
  })
  const payload = (await response.json().catch(() => ({}))) as StaffLoginResponse
  if (!response.ok) {
    throw new Error(payload.error || 'PIN is incorrect.')
  }
  await applySupabaseSession(payload.accessToken, payload.refreshToken)
}

export async function logoutStaff() {
  try {
    if (hasSupabaseConfig()) {
      await getSupabaseBrowserClient().auth.signOut()
    }
  } catch {
    // Keep cookie logout even if Supabase sign-out fails.
  }
  await fetch('/api/staff/logout', { method: 'POST' })
}

export async function readStaffSession(): Promise<StaffRole | null> {
  const response = await fetch('/api/staff/session', { cache: 'no-store' })
  if (!response.ok) return null
  const payload = (await response.json().catch(() => ({}))) as StaffSessionResponse
  const role = payload.role === 'admin' || payload.role === 'accounting' ? payload.role : null
  if (role) await ensureStaffDatabaseSession(role)
  return role
}

/**
 * Data access is enforced by RLS on the staff JWT. If this browser lost it (storage cleared,
 * refresh token expired) while the device cookie is still valid, mint a new one and reload once.
 */
async function ensureStaffDatabaseSession(role: StaffRole) {
  if (!hasSupabaseConfig()) return
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession()
    if (String(data.session?.user.app_metadata?.role ?? '') === role) return
    const response = await fetch('/api/staff/session', { method: 'POST', cache: 'no-store' })
    if (!response.ok) return
    const payload = (await response.json().catch(() => ({}))) as StaffLoginResponse
    await applySupabaseSession(payload.accessToken, payload.refreshToken)
    const reloadKey = `gday-staff-session-restored:${role}`
    if (sessionStorage.getItem(reloadKey) !== '1') {
      sessionStorage.setItem(reloadKey, '1')
      window.location.reload()
    }
  } catch (error) {
    console.warn('[staff-auth] could not restore staff session', error)
  }
}
