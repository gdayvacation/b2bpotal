'use client'

import { useEffect, useRef, useState } from 'react'
import { BrandMark } from '@/components/brand-mark'
import { GUEST_SIGNED_IN_EVENT } from '@/lib/check-in-access'
import { readStaffSession } from '@/lib/staff-auth'
import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'
import { fetchBookingByCode } from '@/lib/supabase/portal-db'

// ---------------------------------------------------------------------------
// Bangkok time helpers — used to enforce tour-date-only QR access.
// QR is valid: today (Asia/Bangkok) === booking_date AND time < 19:00.
// ---------------------------------------------------------------------------
const GUEST_CLOSE_MINUTES = 19 * 60 // 19:00 Bangkok

function bangkokNow(): { dateStr: string; minutes: number } {
  const now = new Date()
  const dateStr = new Intl.DateTimeFormat('sv', { timeZone: 'Asia/Bangkok' }).format(now)
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Bangkok',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return { dateStr, minutes: hour * 60 + minute }
}

type GuestTimeState = 'ok' | 'wrong-day' | 'closed'

function guestTimeState(bookingDate: string): GuestTimeState {
  if (!bookingDate) return 'ok' // no date in JWT → let server decide
  const { dateStr, minutes } = bangkokNow()
  if (dateStr !== bookingDate) return 'wrong-day'
  return minutes >= GUEST_CLOSE_MINUTES ? 'closed' : 'ok'
}

function accessTokenFresh(accessToken: string | undefined) {
  if (!accessToken) return false
  const segment = accessToken.split('.')[1]
  if (!segment) return false
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))
    const exp = Number((JSON.parse(json) as { exp?: unknown }).exp)
    // Refresh ahead of expiry. A dead token still looks logged-in in storage, then the
    // save leaves the phone as a logged-out visitor and the database rejects it.
    return Number.isFinite(exp) && exp * 1000 > Date.now() + 90_000
  } catch {
    return false
  }
}

async function applySession(accessToken?: string, refreshToken?: string) {
  if (!accessToken || !refreshToken || !hasSupabaseConfig()) return
  await getSupabaseBrowserClient().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
}

/** Sign the phone in again from the QR already open on this page, without a new scan. */
export async function reopenGuestCheckInSession(code: string, token: string): Promise<boolean> {
  const bookingCode = code.trim()
  if (!bookingCode || !hasSupabaseConfig()) return false
  try {
    const response = await fetch('/api/check-in/guest/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: bookingCode, token: token.trim() }),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      accessToken?: string
      refreshToken?: string
    }
    if (!response.ok) return false
    await applySession(payload.accessToken, payload.refreshToken)
    return guestOwnsCode(bookingCode)
  } catch {
    return false
  }
}

async function guestOwnsCode(code: string) {
  if (!hasSupabaseConfig()) return false
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  if (!accessTokenFresh(data.session?.access_token)) return false
  const role = String(data.session?.user.app_metadata?.role ?? '')
  const claim = String(data.session?.user.app_metadata?.booking_code ?? '')
  return role === 'guest' && claim === code
}

/** Guest login that can still write. Staff and helper sessions count too. Otherwise sign in from this QR. */
export async function ensureGuestCheckInSession(code: string, token: string): Promise<boolean> {
  if (!hasSupabaseConfig()) return false
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  const session = data.session
  if (session && accessTokenFresh(session.access_token)) {
    const role = String(session.user.app_metadata?.role ?? '')
    const claim = String(session.user.app_metadata?.booking_code ?? '')
    if (role === 'guest' && claim === code.trim()) return true
    if (role === 'admin' || role === 'accounting' || role === 'helper') return true
  }
  return reopenGuestCheckInSession(code, token)
}

async function helperOnDuty() {
  if (!hasSupabaseConfig()) return false
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  return String(data.session?.user.app_metadata?.role ?? '') === 'helper'
}

async function partnerSession() {
  if (!hasSupabaseConfig()) return false
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  return String(data.session?.user.app_metadata?.role ?? '') === 'partner'
}

/**
 * Staff / helper / partner sessions are scoped (a helper only sees their own date, a partner only
 * their agent), so a leftover session on the phone can be unable to read this guest's booking.
 * Only trust such a session when it can actually load the booking; otherwise open the guest QR.
 */
async function canReadBooking(code: string) {
  try {
    return (await fetchBookingByCode(code)) !== null
  } catch {
    return false
  }
}

export function GuestAccessGate({
  bookingCode,
  token = '',
  children,
}: {
  bookingCode: string
  token?: string
  children: React.ReactNode
}) {
  const code = bookingCode.trim()
  const linkToken = token.trim()
  const [state, setState] = useState<'loading' | 'ok' | 'blocked'>(code ? 'loading' : 'blocked')
  const [message, setMessage] = useState(
    'Scan the check-in QR for this booking. The page only opens that one booking.',
  )
  // Keep a ref so the periodic timer can read the latest state without a stale closure.
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  // ── Periodic close-check: detect 19:00 passing for tabs left open ─────────
  useEffect(() => {
    if (state !== 'ok' || !hasSupabaseConfig()) return
    const check = () => {
      if (stateRef.current !== 'ok') return
      getSupabaseBrowserClient()
        .auth.getSession()
        .then(({ data }) => {
          const bd = String(data.session?.user.app_metadata?.booking_date ?? '').slice(0, 10)
          if (!bd) return
          const ts = guestTimeState(bd)
          if (ts === 'closed') {
            setMessage('Check-in for today has closed (19:00). Scan your QR again on your tour date.')
            setState('blocked')
          }
        })
        .catch(() => { /* ignore — next tick will retry */ })
    }
    const id = window.setInterval(check, 60_000) // check once per minute
    return () => window.clearInterval(id)
  }, [state])

  useEffect(() => {
    if (!code) return
    let cancelled = false

    async function unlock() {
      if (await guestOwnsCode(code)) {
        // Enforce the tour-date-only window client-side too (server already enforces on
        // new scans, but this catches tabs restored from a previous day's session).
        const { data: sd } = await getSupabaseBrowserClient().auth.getSession()
        const bd = String(sd.session?.user.app_metadata?.booking_date ?? '').slice(0, 10)
        const ts = guestTimeState(bd)
        if (ts === 'wrong-day') {
          setMessage('This QR is only valid on your tour date. Please scan again on the day of your tour.')
          setState('blocked')
          return
        }
        if (ts === 'closed') {
          setMessage('Check-in for today has closed (19:00). Scan your QR again on your tour date.')
          setState('blocked')
          return
        }
        setState('ok')
        return
      }
      const staff = await readStaffSession()
      if (cancelled) return
      if (staff || (await helperOnDuty()) || (await partnerSession())) {
        const readable = await canReadBooking(code)
        if (cancelled) return
        if (readable) {
          setState('ok')
          return
        }
      }

      const response = await fetch('/api/check-in/guest/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, token: linkToken }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        accessToken?: string
        refreshToken?: string
      }
      if (cancelled) return
      if (!response.ok) {
        setMessage(payload.error || 'This check-in QR is not valid.')
        setState('blocked')
        return
      }
      await applySession(payload.accessToken, payload.refreshToken)
      if (!(await guestOwnsCode(code))) {
        setMessage('This check-in QR is not valid.')
        setState('blocked')
        return
      }
      // Stay on this page. A reload throws away the login if the phone has not saved it yet.
      window.dispatchEvent(new Event(GUEST_SIGNED_IN_EVENT))
      setState('ok')
    }

    void unlock()
    return () => {
      cancelled = true
    }
  }, [code, linkToken])

  if (state === 'ok') return children

  return (
    <div className="gday-app relative flex min-h-dvh flex-col overflow-hidden">
      <div className="gday-grid pointer-events-none absolute inset-0 opacity-45" />
      <header className="relative mx-auto flex h-16 w-full max-w-md items-center px-4 sm:px-6">
        <BrandMark />
      </header>
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        <div className="gday-sheet rounded-[1.6rem] p-6 sm:p-8">
          <p className="gday-soft-label mb-2">Guest check-in</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
            {state === 'loading' ? 'Opening your check-in QR…' : 'Scan your QR'}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-teal-950/55">{message}</p>
        </div>
      </main>
    </div>
  )
}
