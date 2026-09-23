'use client'

import {
  amendmentPolicyLines,
  dateChangeFeeAmount,
  formatThbAmount,
  lateCancelNotice,
  lateDateChangeNotice,
  lateReduceNotice,
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
  booking: Pick<Booking, 'adults' | 'children'>
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

export function AdminExtraChargeField({
  suggested,
  value,
  onChange,
  alreadyCharged = 0,
  adults = 0,
  childrenCount = 0,
  perPerson,
  className,
}: {
  suggested: number
  value: string
  onChange: (value: string) => void
  alreadyCharged?: number
  adults?: number
  childrenCount?: number
  perPerson?: number
  className?: string
}) {
  const parsed = Math.max(0, Math.floor(Number(value.replace(/,/g, '')) || 0))
  const rate = perPerson ?? 300
  const chargeable = adults + childrenCount
  return (
    <div
      className={cn(
        'w-full rounded-xl border border-amber-200 bg-amber-50/90 px-3.5 py-3 text-left',
        className,
      )}
    >
      <p className="text-[10px] font-semibold tracking-wide text-amber-800/70 uppercase">
        Extra charge (admin)
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-950/80">
        +{formatThbAmount(rate)} per AD / CH. Infant and TL are free and not counted.
        {chargeable > 0 ? (
          <>
            {' '}
            This change: {adults} AD + {childrenCount} CH × {rate.toLocaleString('en-US')} ={' '}
            <span className="font-semibold">{formatThbAmount(suggested)}</span>.
          </>
        ) : null}{' '}
        Set 0 if complimentary, or type another total.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange('0')}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-semibold',
            parsed === 0
              ? 'bg-teal-800 text-white'
              : 'bg-white/80 text-teal-900/70 ring-1 ring-teal-900/10',
          )}
        >
          Free
        </button>
        <button
          type="button"
          onClick={() => onChange(String(suggested))}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-semibold',
            parsed === suggested && suggested > 0
              ? 'bg-teal-800 text-white'
              : 'bg-white/80 text-teal-900/70 ring-1 ring-teal-900/10',
          )}
        >
          Suggested {suggested.toLocaleString('en-US')}
        </button>
      </div>
      <label className="mt-2.5 block">
        <span className="text-[11px] font-medium text-amber-950/70">Amount (THB)</span>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-sm text-teal-950 outline-none focus:border-teal-700"
        />
      </label>
      <p className="mt-1.5 text-xs font-semibold text-teal-950">
        This change: {formatThbAmount(parsed)}
        {alreadyCharged > 0
          ? ` · already on booking ${formatThbAmount(alreadyCharged)}`
          : ''}
      </p>
    </div>
  )
}

export function LateReduceNotice({
  settings,
  removedAdults = 0,
  removedChildren = 0,
  className,
}: {
  settings: BookingCutoffSettings
  removedAdults?: number
  removedChildren?: number
  className?: string
}) {
  const removed = { adults: removedAdults, children: removedChildren }
  const fee = dateChangeFeeAmount(settings, removed)
  return (
    <div
      className={cn(
        'w-full rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-left text-amber-950',
        className,
      )}
    >
      <p className="text-[10px] font-semibold tracking-wide text-amber-800/70 uppercase">
        Extra charge (required)
      </p>
      <p className="mt-1 text-xs leading-relaxed">{lateReduceNotice(settings, removed)}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-teal-950">
        Total {formatThbAmount(fee)}
      </p>
      <p className="mt-0.5 text-[11px] text-amber-900/65">
        This amount is fixed for agents and cannot be edited.
      </p>
    </div>
  )
}
