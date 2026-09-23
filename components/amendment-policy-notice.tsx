'use client'

import {
  amendmentPolicyLines,
  formatThbAmount,
  lateAddNotice,
  lateCancelNotice,
  lateDateChangeNotice,
  type BookingCutoffSettings,
} from '@/lib/booking-cutoffs'
import { chargeablePax, type Booking } from '@/lib/types'
import { cn } from '@/lib/utils'

export function AmendmentPolicyNotice({
  settings,
  variant = 'default',
  title = 'Change & cancel policy',
  className,
}: {
  settings: BookingCutoffSettings
  variant?: 'default' | 'compact'
  title?: string
  className?: string
}) {
  const lines = amendmentPolicyLines(settings)
  return (
    <div
      className={cn(
        'rounded-xl border border-amber-200/80 bg-amber-50/90 px-3.5 py-2.5 text-left text-amber-950/85',
        className,
      )}
    >
      <p className="text-[10px] font-semibold tracking-wide text-amber-800/70 uppercase">
        {title} · {settings.timezone}
      </p>
      <ul
        className={cn(
          'mt-1.5 list-disc space-y-1 pl-4',
          variant === 'compact' ? 'text-[11px] leading-relaxed' : 'text-xs leading-relaxed',
        )}
      >
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

export function LateDateChangeNotice({
  settings,
  booking,
  className,
}: {
  settings: BookingCutoffSettings
  booking: Pick<Booking, 'adults' | 'children' | 'tourLeaders'>
  className?: string
}) {
  const count = chargeablePax(booking)
  return (
    <div
      className={cn(
        'rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-950',
        className,
      )}
    >
      <p className="text-[10px] font-semibold tracking-wide text-amber-800/70 uppercase">
        Extra charge applies
      </p>
      <p className="mt-1 text-xs leading-relaxed">
        {lateDateChangeNotice(settings, booking)}
      </p>
      <p className="mt-2 text-sm font-semibold">
        {formatThbAmount(count * settings.dateChangeFeePerPerson)}
      </p>
    </div>
  )
}

export function LateCancelNotice({
  settings,
  className,
}: {
  settings: BookingCutoffSettings
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs leading-relaxed text-rose-900',
        className,
      )}
    >
      {lateCancelNotice(settings)}
    </div>
  )
}

export function LateAddNotice({
  settings,
  className,
}: {
  settings: BookingCutoffSettings
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-950',
        className,
      )}
    >
      {lateAddNotice(settings)}
    </div>
  )
}
