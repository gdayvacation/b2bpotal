'use client'

import { useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, MapPin, Printer, Ship, Users } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { StatusBadge } from '@/components/status-badge'
import { buttonVariants } from '@/components/ui/button'
import { BRAND_LEGAL } from '@/lib/brand'
import { formatLongDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatPaxBreakdown, totalPassengers, type Booking } from '@/lib/types'

export function VoucherView({ booking, slug }: { booking: Booking; slug: string }) {
  const searchParams = useSearchParams()
  const shouldPrint = searchParams.get('print') === '1'
  const total = totalPassengers(booking)
  const pickupLine = [
    booking.pickupHotel,
    booking.roomNumber ? `Rm ${booking.roomNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  useEffect(() => {
    if (shouldPrint) {
      const timer = window.setTimeout(() => window.print(), 250)
      return () => window.clearTimeout(timer)
    }
  }, [shouldPrint])

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/agent/${slug}/bookings`}
          className="text-sm font-medium text-teal-800/65 transition-colors hover:text-teal-950"
        >
          ← My Bookings
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className={cn(buttonVariants({ variant: 'outline' }), 'h-10 rounded-xl px-3.5')}
        >
          <Printer data-icon="inline-start" />
          Print Voucher
        </button>
      </div>

      <article className="gday-sheet overflow-hidden rounded-[1.4rem] print:border print:border-neutral-300 print:shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-teal-900/8 px-4 py-3.5 sm:px-5">
          <BrandMark variant="company" />
          <StatusBadge status={booking.status} />
        </div>

        <div className="bg-gradient-to-br from-teal-800 via-teal-700 to-cyan-700 px-4 py-4 text-white sm:px-5">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-white/50 uppercase">
            Tour voucher
          </p>
          <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-mono text-2xl font-semibold tracking-tight sm:text-[1.7rem]">
                {booking.code}
              </h1>
              <p className="mt-1 truncate text-sm text-white/70">{booking.agentName}</p>
            </div>
            <div className="rounded-lg bg-white/12 px-3 py-2 text-right backdrop-blur-sm">
              <p className="text-[10px] font-medium tracking-wide text-white/55 uppercase">
                Program
              </p>
              <p className="mt-0.5 text-lg font-semibold tracking-tight leading-none">
                {booking.program}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/15 pt-3 sm:grid-cols-3">
            <HeroFact
              icon={<CalendarDays className="size-3.5" />}
              label="Tour date"
              value={formatLongDate(booking.date)}
            />
            <HeroFact label="Lead guest" value={booking.leadGuest} />
            <HeroFact
              label="Passengers"
              value={`${formatPaxBreakdown(booking)} · ${total}`}
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>

        <div className="space-y-2.5 px-3.5 py-3.5 sm:px-4">
          <Section title="Guests" icon={<Users className="size-3.5" />}>
            <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg bg-teal-900/8">
              <GuestStat label="Adults" value={booking.adults} />
              <GuestStat label="Children" value={booking.children} />
              <GuestStat label="Infants" value={booking.infants} />
              <GuestStat label="TL" value={booking.tourLeaders} />
            </div>
          </Section>

          <Section title="Pickup" icon={<MapPin className="size-3.5" />}>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
              <DetailCell label="Zone" value={booking.pickupZone} />
              <DetailCell label="Time" value={booking.pickupTime || '—'} emphasize />
              <DetailCell label="Hotel" value={pickupLine || '—'} className="col-span-2" />
              {booking.note ? (
                <DetailCell label="Note" value={booking.note} className="col-span-2 sm:col-span-4" wrap />
              ) : null}
            </dl>
          </Section>

          <Section title="Tour options" icon={<Ship className="size-3.5" />}>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
              <DetailCell label="Park fee" value={booking.parkFee} />
              <DetailCell label="Canoe" value={booking.canoe ?? '—'} />
              <DetailCell
                label="Agent ref"
                value={booking.agentRef || '—'}
                className="col-span-2 sm:col-span-1"
              />
            </dl>
          </Section>
        </div>

        <div className="border-t border-teal-900/8 bg-teal-950/[0.03] px-4 py-3 text-[11px] leading-relaxed text-teal-900/50 sm:px-5">
          Issued by {BRAND_LEGAL}. Present this voucher on the tour date. Partner confirmation — no
          price shown.
        </div>
      </article>
    </div>
  )
}

function HeroFact({
  icon,
  label,
  value,
  className,
}: {
  icon?: ReactNode
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[10px] font-medium tracking-wide text-white/45 uppercase">{label}</p>
      <p className="mt-0.5 flex items-start gap-1.5 text-sm font-semibold leading-snug">
        {icon ? <span className="mt-0.5 shrink-0 text-white/55">{icon}</span> : null}
        <span className="min-w-0 break-words">{value}</span>
      </p>
    </div>
  )
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-teal-900/8 bg-white/60 px-3 py-2.5 sm:px-3.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="flex size-5 items-center justify-center rounded-md bg-teal-900/5 text-teal-800">
          {icon}
        </span>
        <h2 className="text-[11px] font-semibold tracking-wide text-teal-900/55 uppercase">
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

function GuestStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white px-1.5 py-1.5 text-center sm:px-2 sm:py-2">
      <p className="font-display text-base font-semibold tracking-tight text-teal-950 sm:text-lg">
        {value}
      </p>
      <p className="text-[9px] font-medium tracking-wide text-teal-900/45 uppercase sm:text-[10px]">
        {label}
      </p>
    </div>
  )
}

function DetailCell({
  label,
  value,
  emphasize = false,
  className,
  wrap = false,
}: {
  label: string
  value: string
  emphasize?: boolean
  className?: string
  wrap?: boolean
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[10px] font-medium tracking-wide text-teal-900/40 uppercase">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 text-sm text-teal-950',
          emphasize ? 'font-semibold' : 'font-medium',
          wrap ? 'whitespace-pre-wrap break-words' : 'truncate',
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}
