'use client'

import { useEffect, useState } from 'react'
import { BrandMark } from '@/components/brand-mark'
import { readStaffSession } from '@/lib/staff-auth'
import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'
import { fetchBookingByCode } from '@/lib/supabase/portal-db'

async function applySession(accessToken?: string, refreshToken?: string) {
  if (!accessToken || !refreshToken || !hasSupabaseConfig()) return
  await getSupabaseBrowserClient().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
}

async function guestOwnsCode(code: string) {
  if (!hasSupabaseConfig()) return false
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  const role = String(data.session?.user.app_metadata?.role ?? '')
  const claim = String(data.session?.user.app_metadata?.booking_code ?? '')
  return role === 'guest' && claim === code
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

  useEffect(() => {
    if (!code) return
    let cancelled = false

    async function unlock() {
      if (await guestOwnsCode(code)) {
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
      const reloadKey = `gday-guest-reloaded:${code}`
      // The portal loaded its data before this guest session existed, so reload once to pick it
      // up. Time-boxed (not once-per-tab) so a restored/old tab can recover later, while a
      // session that fails to persist cannot cause a reload loop.
      const lastReload = Number(sessionStorage.getItem(reloadKey) ?? 0)
      if (!Number.isFinite(lastReload) || Date.now() - lastReload > 60_000) {
        sessionStorage.setItem(reloadKey, String(Date.now()))
        window.location.reload()
        return
      }
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
