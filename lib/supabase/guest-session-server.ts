/**
 * Server-only: issue a Supabase portal session via Admin generateLink + verifyOtp
 * instead of signInWithPassword, avoiding the GoTrue /token burst-rate-limit
 * that fires when 30+ devices scan concurrently from the same Vercel egress IP.
 *
 * Used by:
 *   - app/api/check-in/guest/enter/route.ts   (guest QR scan)
 *   - app/api/check-in/helper/enter/route.ts  (helper QR scan)
 *
 * How it works:
 *   1. Admin API  POST /auth/v1/admin/generate_link  (service-role, not IP-rate-limited)
 *      → returns a one-time hashed_token consumed here — never sent to client
 *   2. Anon client POST /auth/v1/verify  (?token_hash=…&type=magiclink)
 *      → GoTrue returns real access_token + refresh_token
 *      → /verify is still IP-rate-limited, but at a higher ceiling than /token
 *        (load tests: ~42 vs ~30 pass per minute from the same Vercel egress IP)
 *      → the refresh_token is stored in GoTrue; client can call refreshSession() normally
 *
 * The returned tokens are identical in shape to signInWithPassword — callers return them
 * as { accessToken, refreshToken } so GuestAccessGate / HelperAccessGate setSession()
 * paths are unchanged.
 *
 * SECURITY:
 *   - SUPABASE_SERVICE_ROLE_KEY must NOT have NEXT_PUBLIC_ prefix — server only.
 *   - The hashed_token is consumed server-side; only access_token + refresh_token
 *     leave this function.
 *   - Do NOT log the return value of this function.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function getConfig() {
  return {
    url:        process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()      ?? '',
    anonKey:    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()     ?? '',
  }
}

// Module-level singletons — safe because both clients carry no per-request
// state (persistSession: false, autoRefreshToken: false).  Reusing them
// avoids allocating a new HTTP agent + auth internals on every QR scan.
let _adminClient: SupabaseClient | null = null
let _anonClient:  SupabaseClient | null = null

function adminClient(): SupabaseClient {
  const { url, serviceKey } = getConfig()
  if (!_adminClient) {
    _adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _adminClient
}

function anonClient(): SupabaseClient {
  const { url, anonKey } = getConfig()
  if (!_anonClient) {
    _anonClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _anonClient
}

export async function issuePortalSession(authEmail: string): Promise<{
  access_token: string
  refresh_token: string
}> {
  const { url, anonKey, serviceKey } = getConfig()
  if (!url || !anonKey) throw new Error('issuePortalSession: missing Supabase URL / anon key')
  if (!serviceKey)      throw new Error('issuePortalSession: SUPABASE_SERVICE_ROLE_KEY not set')

  // ── Step 1: Admin API → one-time magic-link token ─────────────────────────
  const { data: linkData, error: linkError } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email: authEmail,
  })
  if (linkError) throw linkError
  const hashedToken = linkData?.properties?.hashed_token
  if (!hashedToken) throw new Error('issuePortalSession: generateLink returned no hashed_token')

  // ── Step 2: Exchange token → real GoTrue session ──────────────────────────
  const { data: sessionData, error: verifyError } = await anonClient().auth.verifyOtp({
    token_hash: hashedToken,
    type: 'magiclink',
  })
  if (verifyError) throw verifyError
  const session = sessionData?.session
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error('issuePortalSession: verifyOtp returned no session')
  }

  return {
    access_token:  session.access_token,
    refresh_token: session.refresh_token,
  }
}

/** Returns true when all env vars needed for the primary (non-password) path exist. */
export function canIssuePortalSession(): boolean {
  const { url, anonKey, serviceKey } = getConfig()
  return Boolean(url && anonKey && serviceKey)
}
