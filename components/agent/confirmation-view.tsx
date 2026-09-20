'use client'

import Link from 'next/link'
import { Check, Ticket } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { buttonVariants } from '@/components/ui/button'
import { VoucherShareActions } from '@/components/voucher-share-actions'
import { formatLongDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatPaxBreakdown, isNoTransfer, totalPassengers } from '@/lib/types'
import type { Booking } from '@/lib/types'

export function ConfirmationView({ booking, slug }: { booking: Booking; slug: string }) {
  const total = totalPassengers(booking)

  return (
    <div className="gday-fade-up mx-auto max-w-2xl py-4 text-center sm:py-8">
      <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-8 ring-emerald-50/60">
        <Check className="size-7" strokeWidth={2.5} />
      </div>
      <p className="gday-soft-label text-emerald-700/80">Booking confirmed</p>
      <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-teal-950 sm:text-4xl">
        {booking.code}
      </h1>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-teal-950/55">
        The booking is now in your partner account. No payment is collected here.
      </p>

      <div className="gday-sheet mt-8 rounded-[1.4rem] p-5 text-left sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3 border-b border-teal-900/8 pb-5">
          <div>
            <p className="gday-soft-label">Confirmation number</p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-tight text-teal-950">
              {booking.code}
            </p>
          </div>
          <StatusBadge status={booking.status} />
        </div>
        <dl className="grid gap-5 sm:grid-cols-2">
          <Item label="Tour Program" value={booking.program} />
          <Item label="Tour Date" value={formatLongDate(booking.date)} />
          <Item label="Guest Name" value={booking.leadGuest} />
          <Item label="Voucher Number" value={booking.agentRef || '—'} />
          <Item label="Total Passengers" value={`${formatPaxBreakdown(booking)} (${total})`} />
          <Item
            label="Pickup"
            value={
              isNoTransfer(booking.pickupZone)
                ? 'No Transfer — guest arranges own transport'
                : `${booking.pickupZone}\n${booking.pickupHotel}${booking.roomNumber ? ` · Room ${booking.roomNumber}` : ''}\n${booking.pickupTime}`
            }
          />
          {booking.transferExtraCharge?.trim() ? (
            <Item label="Extra Charge Transfer" value={booking.transferExtraCharge.trim()} />
          ) : null}
          <Item label="Cash on tour" value={booking.cashOnTour || '—'} />
          <Item label="Note" value={booking.note || '—'} />
          <Item label="Agent" value={booking.agentName} />
        </dl>
      </div>

      <div className="mt-6 flex flex-col items-center justify-center gap-3">
        <Link
          href={`/agent/${slug}/voucher/${booking.code}`}
          className={cn(buttonVariants({ size: 'lg' }), 'h-12 rounded-xl px-5')}
        >
          <Ticket data-icon="inline-start" />
          View Voucher
        </Link>
        <VoucherShareActions
          slug={slug}
          code={booking.code}
          guestName={booking.leadGuest}
          className="justify-center"
        />
      </div>
    </div>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="gday-soft-label">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-[15px] font-semibold text-teal-950">{value}</dd>
    </div>
  )
}
