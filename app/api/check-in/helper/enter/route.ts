import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'
import {
  HELPER_DATE_COOKIE,
  HELPER_KEY_COOKIE,
  helperCookieOptions,
} from '@/lib/check-in-access'
import { rpcMessage } from '@/lib/rpc-error'
import { canIssuePortalSession, issuePortalSession } from '@/lib/supabase/guest-session-server'

// ---------------------------------------------------------------------------
// Rate limiter — per IP, in-memory sliding window.
// Helpers are typically 1–5 people per day; a modest limit stops runaway
// retries without ever blocking legitimate helper scans.
// ---------------------------------------------------------------------------
const RL_WINDOW_MS = 60_000
const RL_IP_MAX    = 20     // 20 req / IP / min — well above any helper need

const _rlIp = new Map<string, { n: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const cur = _rlIp.get(ip)
  if (!cur || now > cur.resetAt) {
    _rlIp.set(ip, { n: 1, resetAt: now + RL_WINDOW_MS })
    return false
  }
  cur.n += 1
  return cur.n > RL_IP_MAX
}

// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // ── Rate limit ────────────────────────────────────────────────────────────
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip')?.trim() ??
    'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.', boardState: 'invalid' },
      { status: 429 },
    )
  }

  // ── Parse body + cookie fallback ─────────────────────────────────────────
  const body = (await request.json().catch(() => null)) as
    | { date?: string; key?: string }
    | null
  const tourDate  = String(body?.date ?? '').trim()
  const jar       = await cookies()
  const key       = String(body?.key ?? jar.get(HELPER_KEY_COOKIE)?.value ?? '').trim()
  const cookieDate = String(jar.get(HELPER_DATE_COOKIE)?.value ?? '').trim()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(tourDate)
    ? tourDate
    : /^\d{4}-\d{2}-\d{2}$/.test(cookieDate)
      ? cookieDate
      : ''

  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })
  }
  if (!date || !key) {
    return NextResponse.json(
      { error: 'This helper QR is not valid.', boardState: 'invalid' },
      { status: 401 },
    )
  }

  // ── Step 1: validate via portal_helper_enter (anon client — unchanged) ────
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc('portal_helper_enter', {
    p_date: date,
    p_key:  key,
  })
  if (error) {
    return NextResponse.json(
      { error: rpcMessage(error, 'This helper QR is not valid.'), boardState: 'invalid' },
      { status: 401 },
    )
  }

  const row        = Array.isArray(data) ? data[0] : data
  const boardState = String(row?.board_state ?? 'invalid')
  const openTime   = String(row?.open_time   ?? '')
  const closeTime  = String(row?.close_time  ?? '')
  const authEmail  = String(row?.auth_email  ?? '')

  // Board time-window checks — return early without issuing a session
  if (boardState !== 'ok') {
    return NextResponse.json(
      {
        error:
          boardState === 'too_early'
            ? 'Helper board is not open yet.'
            : boardState === 'closed'
              ? 'Helper board is closed.'
              : 'This helper QR is not valid.',
        boardState,
        date,
        openTime,
        closeTime,
      },
      { status: 403 },
    )
  }
  if (!authEmail) {
    return NextResponse.json(
      { error: 'This helper QR is not valid.', boardState: 'invalid' },
      { status: 401 },
    )
  }

  // ── Step 2a: Primary — Admin generateLink + verifyOtp ────────────────────
  // Same mechanism as guest/enter: bypasses GoTrue /token rate-limit.
  // key is kept below for the signInWithPassword fallback only — NEVER log it.
  if (canIssuePortalSession()) {
    try {
      const session = await issuePortalSession(authEmail)
      // ✅ DO NOT log session.access_token or session.refresh_token
      const cookie   = helperCookieOptions()
      const response = NextResponse.json({
        date,
        openTime,
        closeTime,
        boardState: 'ok',
        accessToken:  session.access_token,
        refreshToken: session.refresh_token,
      })
      response.cookies.set(HELPER_DATE_COOKIE, date, cookie)
      response.cookies.set(HELPER_KEY_COOKIE,  key,  cookie)
      return response
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err)
      console.warn('[helper/enter] primary session path failed, using fallback —', reason)
    }
  }

  // ── Step 2b: Fallback — signInWithPassword (original behaviour) ──────────
  // ✅ DO NOT log authEmail or key
  const { data: sessionData, error: authError } = await supabase.auth.signInWithPassword({
    email:    authEmail,
    password: key,
  })
  if (authError || !sessionData.session) {
    return NextResponse.json(
      { error: 'This helper QR is not valid.', boardState: 'invalid' },
      { status: 401 },
    )
  }

  // ✅ DO NOT log sessionData.session.access_token or .refresh_token
  const cookie   = helperCookieOptions()
  const response = NextResponse.json({
    date,
    openTime,
    closeTime,
    boardState: 'ok',
    accessToken:  sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
  })
  response.cookies.set(HELPER_DATE_COOKIE, date, cookie)
  response.cookies.set(HELPER_KEY_COOKIE,  key,  cookie)
  return response
}
