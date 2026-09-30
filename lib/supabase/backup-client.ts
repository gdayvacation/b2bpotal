import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { STAFF_ADMIN_EMAIL } from '@/lib/staff-auth-server'

/**
 * Server-only Supabase client for nightly / admin Google Sheets backup.
 * Prefer SUPABASE_SERVICE_ROLE_KEY (never NEXT_PUBLIC_). Falls back to a
 * short-lived staff admin JWT so RLS staff policies still apply.
 */
export async function getSupabaseBackupClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL for sheets backup')
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (serviceKey) {
    return createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  const password = process.env.STAFF_SUPABASE_PASSWORD?.trim()
  if (!anonKey || !password) {
    throw new Error(
      'Sheets backup needs SUPABASE_SERVICE_ROLE_KEY (preferred) or STAFF_SUPABASE_PASSWORD + anon key',
    )
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await authClient.auth.signInWithPassword({
    email: STAFF_ADMIN_EMAIL,
    password,
  })
  if (error || !data.session?.access_token) {
    throw new Error(
      `Sheets backup staff sign-in failed: ${error?.message ?? 'no session'}`,
    )
  }

  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function missingBackupSupabaseEnv() {
  const missing: string[] = []
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL')
  }
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  const hasStaffFallback =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) &&
    Boolean(process.env.STAFF_SUPABASE_PASSWORD?.trim())
  if (!hasServiceRole && !hasStaffFallback) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY (or STAFF_SUPABASE_PASSWORD)')
  }
  return missing
}
