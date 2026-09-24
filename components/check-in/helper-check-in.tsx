'use client'

import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { HelperCheckInBoard } from '@/components/admin/admin-check-in'
import { BrandMark } from '@/components/brand-mark'
import {
  isHelperBoardClosed,
  isHelperBoardNotYetOpen,
  isValidHelperBoardToken,
  normalizeHelperBoardHours,
} from '@/lib/check-in-helper'
import { formatLongDate } from '@/lib/format'

export function HelperCheckIn({
  date,
  token,
  openTime,
  closeTime,
}: {
  date: string
  token: string
  openTime?: string
  closeTime?: string
}) {
  const [origin, setOrigin] = useState('')
  const [now, setNow] = useState(() => new Date())
  const hours = normalizeHelperBoardHours({ open: openTime, close: closeTime })

  useEffect(() => {
    setOrigin(window.location.origin)
    const id = window.setInterval(() => setNow(new Date()), 10_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    const onFocus = () => setNow(new Date())
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const allowed = validDate && isValidHelperBoardToken(date, token, hours)
  const expired = allowed && isHelperBoardClosed(date, now, hours)
  const tooEarly = allowed && isHelperBoardNotYetOpen(date, now, hours)

  return (
    <div className="gday-app min-h-dvh">
      <header className="border-b border-teal-900/8 bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <BrandMark />
          <p className="text-xs font-semibold tracking-wide text-teal-800/70 uppercase">
            Helper check-in
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        {!allowed || expired || tooEarly ? (
          <LockedHelperBoard
            date={allowed ? date : ''}
            openTime={hours.open}
            closeTime={hours.close}
            tooEarly={tooEarly}
            expired={expired}
          />
        ) : (
          <div className="space-y-5">
            <div>
              <p className="gday-soft-label">Marina helper</p>
              <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight text-teal-950">
                Guest check-in
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-teal-950/55">
                Van list for {formatLongDate(date)}. Make a guest QR from each row. This board is
                open from {hours.open} until {hours.close} Thailand time.
              </p>
            </div>
            <HelperCheckInBoard date={date} origin={origin} />
          </div>
        )}
      </main>
    </div>
  )
}

function LockedHelperBoard({
  date,
  openTime,
  closeTime,
  tooEarly,
  expired,
}: {
  date: string
  openTime: string
  closeTime: string
  tooEarly: boolean
  expired: boolean
}) {
  const title = tooEarly ? 'Helper board not open yet' : 'Helper board closed'
  const body = !date
    ? 'This helper link is not valid.'
    : tooEarly
      ? `This helper page for ${formatLongDate(date)} opens at ${openTime} Thailand time.`
      : expired
        ? `This helper page for ${formatLongDate(date)} closed at ${closeTime} and cannot be opened again.`
        : 'This helper link is not valid.'

  return (
    <div className="mx-auto max-w-md">
      <div className="gday-sheet flex flex-col items-center rounded-[1.5rem] px-6 py-10 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-teal-950/[0.05] text-teal-800">
          <Lock className="size-5" />
        </div>
        <h1 className="font-display text-xl font-semibold text-teal-950">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-teal-900/55">{body}</p>
      </div>
    </div>
  )
}
