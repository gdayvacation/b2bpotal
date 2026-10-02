import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { rpcMessage } from '@/lib/rpc-error'
import { canIssuePortalSession, issuePortalSession } from '@/lib/supabase/guest-session-server'

// ---------------------------------------------------------------------------
// Rate limiter — two sliding-window buckets, both in-memory (free, no Redis).
//
// WHY TWO BUCKETS:
//   IP bucket  — guards against any single network (marina Wi-Fi, office)
//                sending unlimited requests. Set high enough that 50 guests
//                scanning at once on one Wi-Fi all succeed.
//   Code bucket — guards against a single QR being hammered repeatedly
//                 (reload loops, scrapers). One booking only needs 1–2
//                 calls per minute in normal use.
//
// VERCEL NOTE: each serverless instance has its own Map; effective limit is
//   RL_IP_MAX × (number of warm instances).  For fleet-wide limiting, swap
//   _rlIp / _rlCode for Upstash Redis / Vercel KV calls later — the logic
//   here is identical, just the store changes.
// ---------------------------------------------------------------------------
const RL_WINDOW_MS = 60_000 // 1-minute sliding window
const RL_IP_MAX   = 80      // 80 req / IP  / min  — fits ~50-guest marina Wi-Fi burst
const RL_CODE_MAX = 80      // 80 req / code / min — same ceiling as IP; each device in a
                             // group booking sends 1 call so 80 covers groups up to 80 devices.
                             // Reload-loop guard is the IP bucket + GoTrue RPC validation,
                             // not this counter alone.

const _rlIp   = new Map<string, { n: number; resetAt: number }>()
const _rlCode = new Map<string, { n: number; resetAt: number }>()

function hit(map: Map<string, { n: number; resetAt: number }>, key: string, max: number): boolean {
  const now = Date.now()
  const cur = map.get(key)
  if (!cur || now > cur.resetAt) {
    map.set(key, { n: 1, resetAt: now + RL_WINDOW_MS })
    return false
  }
  cur.n += 1
  return cur.n > max
}

// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // ── Rate limit: IP ───────────────────────────────────────────────────────
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip')?.trim() ??
    'unknown'
  if (hit(_rlIp, ip, RL_IP_MAX)) {
    return NextResponse.json(
      { error: 'Too many requests from this network. Please try again shortly.' },
      { status: 429 },
    )
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = (await request.json().catch(() => null)) as {
    code?: string
    token?: string
  } | null
  const code  = String(body?.code  ?? '').trim()
  const token = String(body?.token ?? '').trim()

  // ── Rate limit: per booking code ──────────────────────────────────────────
  // Check after parsing so we know the code; skip for empty/invalid codes
  // (those fail the RPC anyway and the IP bucket already counted them).
  if (code && hit(_rlCode, code, RL_CODE_MAX)) {
    return NextResponse.json(
      { error: 'Too many requests for this QR. Please wait a moment.' },
      { status: 429 },
    )
  }

  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })
  }
  if (!code) {
    return NextResponse.json({ error: 'This check-in QR is not valid.' }, { status: 401 })
  }

  // ── Step 1: validate QR code via portal_guest_enter (anon client) ─────────
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc('portal_guest_enter', {
    p_code:  code,
    p_token: token,
  })
  if (error) {
    return NextResponse.json(
      { error: rpcMessage(error, 'This check-in QR is not valid.') },
      { status: 401 },
    )
  }

  const row      = Array.isArray(data) ? data[0] : data
  const authEmail = String(row?.auth_email ?? '')
  // access_key kept for signInWithPassword fallback only — NEVER log it
  const accessKey = String(row?.access_key ?? '')

  if (!authEmail || !accessKey) {
    return NextResponse.json({ error: 'This check-in QR is not valid.' }, { status: 401 })
  }

  // ── Step 2a: Primary — Admin generateLink + verifyOtp ────────────────────
  // Bypasses GoTrue /token rate-limit. Requires SUPABASE_SERVICE_ROLE_KEY.
  if (canIssuePortalSession()) {
    try {
      const session = await issuePortalSession(authEmail)
      // ✅ DO NOT log session.access_token or session.refresh_token
      return NextResponse.json({
        code:         row.booking_code,
        accessToken:  session.access_token,
        refreshToken: session.refresh_token,
      })
    } catch (err: unknown) {
      // Log the error reason (not email/token) to help debug unexpected failures.
      const reason = err instanceof Error ? err.message : String(err)
      console.warn('[guest/enter] primary session path failed, using fallback —', reason)
    }
  }

  // ── Step 2b: Fallback — signInWithPassword (original behaviour) ──────────
  // ✅ DO NOT log authEmail or accessKey
  const { data: sessionData, error: authError } = await supabase.auth.signInWithPassword({
    email:    authEmail,
    password: accessKey,
  })
  if (authError || !sessionData.session) {
    return NextResponse.json({ error: 'This check-in QR is not valid.' }, { status: 401 })
  }

  // ✅ DO NOT log sessionData.session.access_token or .refresh_token
  return NextResponse.json({
    code:         row.booking_code,
    accessToken:  sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
  })
}
