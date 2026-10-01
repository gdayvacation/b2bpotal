'use client'

import { useEffect, useState } from 'react'
import { BrandMark } from '@/components/brand-mark'
import { readStaffSession } from '@/lib/staff-auth'
import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'

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
      const staff = await readStaffSession()
      if (cancelled) return
      if (staff || (await helperOnDuty()) || (await partnerSession())) {
        setState('ok')
        return
      }
      if (await guestOwnsCode(code)) {
        setState('ok')
        return
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
      if (sessionStorage.getItem(reloadKey) !== '1') {
        sessionStorage.setItem(reloadKey, '1')
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
