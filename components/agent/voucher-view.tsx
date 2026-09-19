'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, History, MapPin, Pencil, Ship, Users } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { BookingHistoryDialog } from '@/components/booking-history-dialog'
import { ChangeBookingDateDialog } from '@/components/change-booking-date-dialog'
import { EditBookingDialog } from '@/components/edit-booking-dialog'
import { usePortal } from '@/components/portal-provider'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { VoucherShareActions } from '@/components/voucher-share-actions'
import { BRAND_LEGAL } from '@/lib/brand'
import { formatLongDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatPaxBreakdown, isNoTransfer, totalPassengers, type Booking } from '@/lib/types'

export function VoucherView({ booking, slug }: { booking: Booking; slug: string }) {
  const searchParams = useSearchParams()
  const { agents, cancelBooking, bookings, isCancelOpen } = usePortal()
  const shouldPrint = searchParams.get('print') === '1'
  const live = bookings.find((item) => item.code === booking.code) ?? booking
  const total = totalPassengers(live)
  const cancelled = live.status === 'Cancelled'
  const canEdit = !cancelled && isCancelOpen(live.date)
  const [dateOpen, setDateOpen] = useState(false)
  const [rebookOpen, setRebookOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const actor = useMemo(() => {
    const agent = agents.find((item) => item.slug === slug)
    return { role: 'agent' as const, name: agent?.name ?? live.agentName, slug }
  }, [agents, slug, live.agentName])
  const pickupLine = [
    live.pickupHotel,
    live.roomNumber ? `Rm ${live.roomNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  useEffect(() => {
    if (shouldPrint) {
      const timer = window.setTimeout(() => window.print(), 250)
      return () => window.clearTimeout(timer)
    }
  }, [shouldPrint])

  function handleCancel() {
    if (!canEdit) {
      window.alert('Cancel is closed for this travel date.')
      return
    }
    if (
      !window.confirm(
        `Cancel booking ${live.code}? Seats on that departure will become available again.`,
      )
    ) {
      return
    }
    const result = cancelBooking(live.code, { actor })
    if (!result.ok) window.alert(result.error)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/agent/${slug}/bookings`}
          className="text-sm font-medium text-teal-800/65 transition-colors hover:text-teal-950"
        >
          ← My Bookings
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {!cancelled && canEdit ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl px-3.5"
                onClick={() => setEditOpen(true)}
              >
                <Pencil data-icon="inline-start" />
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl px-3.5"
                onClick={() => setDateOpen(true)}
              >
                <CalendarDays data-icon="inline-start" />
                Change date
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-rose-200 px-3.5 text-rose-700 hover:bg-rose-50 hover:text-rose-900"
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </>
          ) : null}
          {cancelled ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl px-3.5"
              onClick={() => setRebookOpen(true)}
            >
              <CalendarDays data-icon="inline-start" />
              Rebook
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl px-3.5"
            onClick={() => setHistoryOpen(true)}
          >
            <History data-icon="inline-start" />
            History
          </Button>
          <VoucherShareActions slug={slug} code={live.code} guestName={live.leadGuest} />
        </div>
      </div>

      {cancelled ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 print:hidden">
          This booking is cancelled. Seats have been released. You can rebook with a new travel date.
        </div>
      ) : null}

      <article
        className={cn(
          'gday-sheet overflow-hidden rounded-[1.4rem] print:border print:border-neutral-300 print:shadow-none',
          cancelled && 'ring-1 ring-rose-200',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-teal-900/8 px-4 py-3.5 sm:px-5">
          <BrandMark variant="company" />
          <StatusBadge status={live.status} />
        </div>

        <div
          className={cn(
            'px-4 py-4 text-white sm:px-5',
            cancelled
              ? 'bg-gradient-to-br from-rose-700 via-rose-600 to-rose-800'
              : 'bg-gradient-to-br from-teal-800 via-teal-700 to-cyan-700',
          )}
        >
          <p className="text-[10px] font-semibold tracking-[0.16em] text-white/50 uppercase">
            Tour voucher
          </p>
          <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1
                className={cn(
                  'font-mono text-2xl font-semibold tracking-tight sm:text-[1.7rem]',
                  cancelled && 'line-through decoration-white/40',
                )}
              >
                {live.code}
              </h1>
              <p className="mt-1 truncate text-sm text-white/70">{live.agentName}</p>
            </div>
            <div className="rounded-lg bg-white/12 px-3 py-2 text-right backdrop-blur-sm">
              <p className="text-[10px] font-medium tracking-wide text-white/55 uppercase">
                Program
              </p>
              <p className="mt-0.5 text-lg font-semibold tracking-tight leading-none">
                {live.program}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/15 pt-3 sm:grid-cols-3">
            <HeroFact
              icon={<CalendarDays className="size-3.5" />}
              label="Tour date"
              value={formatLongDate(live.date)}
            />
            <HeroFact label="Lead guest" value={live.leadGuest} />
            <HeroFact
              label="Passengers"
              value={`${formatPaxBreakdown(live)} · ${total}`}
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>

        <div className="space-y-2.5 px-3.5 py-3.5 sm:px-4">
          <Section title="Guests" icon={<Users className="size-3.5" />}>
            <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg bg-teal-900/8">
              <GuestStat label="Adults" value={live.adults} />
              <GuestStat label="Children" value={live.children} />
              <GuestStat label="Infants" value={live.infants} />
              <GuestStat label="TL" value={live.tourLeaders} />
            </div>
          </Section>

          <Section title="Pickup" icon={<MapPin className="size-3.5" />}>
            {isNoTransfer(live.pickupZone) ? (
              <p className="text-sm font-medium text-teal-950">
                No Transfer — guest arranges own transport
                {live.note ? (
                  <span className="mt-1 block text-teal-900/55 whitespace-pre-wrap break-words">
                    Note: {live.note}
                  </span>
                ) : null}
              </p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                  <DetailCell label="Zone" value={live.pickupZone} />
                  <DetailCell label="Time" value={live.pickupTime || '—'} emphasize />
                  <DetailCell label="Hotel" value={pickupLine || '—'} className="col-span-2" />
                  {live.note ? (
                    <DetailCell
                      label="Note"
                      value={live.note}
                      className="col-span-2 sm:col-span-4"
                      wrap
                    />
                  ) : null}
                </dl>
                {live.transferExtraCharge?.trim() ? (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    <p className="text-[10px] font-semibold tracking-wide text-amber-800/70 uppercase">
                      Extra Charge Transfer
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words font-medium">
                      {live.transferExtraCharge.trim()}
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </Section>

          <Section title="Tour options" icon={<Ship className="size-3.5" />}>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
              <DetailCell label="Park fee" value={live.parkFee} />
              <DetailCell label="Canoe" value={live.canoe ?? '—'} />
              <DetailCell
                label="Agent ref"
                value={live.agentRef || '—'}
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

      <ChangeBookingDateDialog
        booking={live}
        open={dateOpen}
        onOpenChange={setDateOpen}
        actor={actor}
      />

      <ChangeBookingDateDialog
        booking={live}
        open={rebookOpen}
        onOpenChange={setRebookOpen}
        mode="rebook"
        actor={actor}
      />

      <EditBookingDialog
        booking={live}
        open={editOpen}
        onOpenChange={setEditOpen}
        actor={actor}
      />

      <BookingHistoryDialog
        booking={live}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
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
