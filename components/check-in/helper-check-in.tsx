'use client'

import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { HelperCheckInBoard } from '@/components/admin/admin-check-in'
import { BrandMark } from '@/components/brand-mark'
import { formatLongDate, formatShortDate } from '@/lib/format'
import { publicOrigin } from '@/lib/public-origin'

export function HelperCheckIn({ date }: { date: string }) {
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(publicOrigin())
  }, [])

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

      <main className="mx-auto max-w-6xl px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-7">
        <div className="space-y-3 sm:space-y-5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="gday-soft-label hidden sm:block">Marina helper</p>
              <h1 className="font-display text-xl font-semibold tracking-tight text-teal-950 sm:mt-1 sm:text-2xl">
                Guest check-in
              </h1>
              <p className="mt-1 hidden max-w-2xl text-sm leading-relaxed text-teal-950/55 sm:block">
                Van list for {formatLongDate(date)}. Make a guest QR from each row. This board stays
                open. After midnight it moves to the next day.
              </p>
              <p className="mt-0.5 text-[13px] text-teal-900/50 sm:hidden">Open all day</p>
            </div>
            <p className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[13px] font-semibold text-teal-950 ring-1 ring-teal-900/10 sm:hidden">
              {formatShortDate(date)}
            </p>
          </div>
          <HelperCheckInBoard date={date} origin={origin} />
        </div>
      </main>
    </div>
  )
}

export function LockedHelperBoard({
  date,
  tooEarly,
  expired,
}: {
  date: string
  tooEarly: boolean
  expired: boolean
}) {
  const title = tooEarly ? 'Helper board not open yet' : expired ? 'Helper board closed' : 'Helper link'
  const body = !date
    ? 'This helper link is not valid.'
    : tooEarly
      ? `This helper page for ${formatLongDate(date)} is not open yet.`
      : expired
        ? `This helper page for ${formatLongDate(date)} has ended. Scan the current helper QR.`
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
