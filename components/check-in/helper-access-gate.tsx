'use client'

import { useEffect, useState } from 'react'
import { BrandMark } from '@/components/brand-mark'
import { LockedHelperBoard } from '@/components/check-in/helper-check-in'
import { readStaffSession } from '@/lib/staff-auth'
import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'
import type { HelperBoardState } from '@/lib/check-in-access'

async function applySession(accessToken?: string, refreshToken?: string) {
  if (!accessToken || !refreshToken || !hasSupabaseConfig()) return
  await getSupabaseBrowserClient().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
}

async function helperOwnsDate(date: string) {
  if (!hasSupabaseConfig()) return false
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  const role = String(data.session?.user.app_metadata?.role ?? '')
  const claim = String(data.session?.user.app_metadata?.helper_date ?? '')
  return role === 'helper' && claim === date
}

export function HelperAccessGate({
  date,
  token,
  children,
}: {
  date: string
  token: string
  children: React.ReactNode
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'locked'>('loading')
  const [boardState, setBoardState] = useState<HelperBoardState>('invalid')
  const [openTime, setOpenTime] = useState('00:00')
  const [closeTime, setCloseTime] = useState('11:00')
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)

  useEffect(() => {
    let cancelled = false

    async function unlock() {
      if (!validDate) {
        setBoardState('invalid')
        setState('locked')
        return
      }
      const staff = await readStaffSession()
      if (cancelled) return
      if (staff === 'admin') {
        setState('ok')
        return
      }
      if (await helperOwnsDate(date)) {
        setState('ok')
        return
      }

      const response = await fetch('/api/check-in/helper/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, key: token || undefined }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        boardState?: HelperBoardState
        openTime?: string
        closeTime?: string
        accessToken?: string
        refreshToken?: string
      }
      if (cancelled) return
      const nextState = payload.boardState ?? (response.ok ? 'ok' : 'invalid')
      if (payload.openTime) setOpenTime(payload.openTime)
      if (payload.closeTime) setCloseTime(payload.closeTime)
      if (nextState === 'too_early' || nextState === 'closed' || nextState === 'invalid') {
        setBoardState(nextState)
        setState('locked')
        return
      }
      if (!response.ok) {
        setBoardState('invalid')
        setState('locked')
        return
      }
      await applySession(payload.accessToken, payload.refreshToken)
      if (!(await helperOwnsDate(date))) {
        setBoardState('invalid')
        setState('locked')
        return
      }
      const reloadKey = `gday-helper-reloaded:${date}`
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
  }, [date, token, validDate])

  if (state === 'ok') return children

  if (state === 'locked') {
    return (
      <div className="gday-app min-h-dvh">
        <header className="border-b border-teal-900/8 bg-white/85 px-3 py-2 backdrop-blur-md sm:px-6 sm:py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <BrandMark />
            <p className="text-[10px] font-semibold tracking-wide text-teal-800/70 uppercase sm:text-xs">
              Helper check-in
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-3 py-3 sm:px-6 sm:py-7">
          <LockedHelperBoard
            date={boardState === 'invalid' ? '' : date}
            openTime={openTime}
            closeTime={closeTime}
            tooEarly={boardState === 'too_early'}
            expired={boardState === 'closed'}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="gday-app relative flex min-h-dvh flex-col overflow-hidden">
      <div className="gday-grid pointer-events-none absolute inset-0 opacity-45" />
      <header className="relative mx-auto flex h-16 w-full max-w-md items-center px-4 sm:px-6">
        <BrandMark />
      </header>
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        <div className="gday-sheet rounded-[1.6rem] p-6 sm:p-8">
          <p className="gday-soft-label mb-2">Helper check-in</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
            Opening helper QR…
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-teal-950/55">Please wait a moment.</p>
        </div>
      </main>
    </div>
  )
}
