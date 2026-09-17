'use client'

import Link from 'next/link'
import { Check, Printer, Ticket } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { buttonVariants } from '@/components/ui/button'
import { formatLongDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatPaxBreakdown, totalPassengers } from '@/lib/types'
import type { Booking } from '@/lib/types'

export function ConfirmationView({ booking, slug }: { booking: Booking; slug: string }) {
  const total = totalPassengers(booking)

  return (
    <div className="mx-auto max-w-2xl py-6 text-center">
      <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <Check className="size-7" />
      </div>
      <p className="text-[11px] font-semibold tracking-[0.2em] text-emerald-700 uppercase">
        Booking Confirmed
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{booking.code}</h1>
      <p className="mt-2 text-sm text-neutral-500">
        The booking is now in your partner account. No payment is collected here.
      </p>

      <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-5 flex items-start justify-between gap-3 border-b border-neutral-100 pb-5">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-neutral-400 uppercase">
              Confirmation number
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-tight">{booking.code}</p>
          </div>
          <StatusBadge status={booking.status} />
        </div>
        <dl className="grid gap-5 sm:grid-cols-2">
          <Item label="Tour Program" value={booking.program} />
          <Item label="Tour Date" value={formatLongDate(booking.date)} />
          <Item label="Lead Guest" value={booking.leadGuest} />
          <Item label="Agent Ref / Voucher #" value={booking.agentRef || '—'} />
          <Item label="Total Passengers" value={`${formatPaxBreakdown(booking)} (${total})`} />
          <Item
            label="Pickup"
            value={`${booking.pickupZone}\n${booking.pickupHotel}${booking.roomNumber ? ` · Room ${booking.roomNumber}` : ''}\n${booking.pickupTime}`}
          />
          <Item label="Note" value={booking.note || '—'} />
          <Item label="Agent" value={booking.agentName} />
        </dl>
      </div>

      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          href={`/agent/${slug}/voucher/${booking.code}`}
          className={cn(buttonVariants(), 'h-10 px-4')}
        >
          <Ticket data-icon="inline-start" />
          View Voucher
        </Link>
        <Link
          href={`/agent/${slug}/voucher/${booking.code}?print=1`}
          className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-4')}
        >
          <Printer data-icon="inline-start" />
          Print Voucher
        </Link>
      </div>
    </div>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-neutral-400 uppercase">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-sm font-medium text-neutral-900">{value}</dd>
    </div>
  )
}
