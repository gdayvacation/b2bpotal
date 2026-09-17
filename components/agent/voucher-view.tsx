'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Printer } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { StatusBadge } from '@/components/status-badge'
import { buttonVariants } from '@/components/ui/button'
import { formatLongDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatPaxBreakdown, totalPassengers, type Booking } from '@/lib/types'

export function VoucherView({ booking, slug }: { booking: Booking; slug: string }) {
  const searchParams = useSearchParams()
  const shouldPrint = searchParams.get('print') === '1'
  const total = totalPassengers(booking)

  useEffect(() => {
    if (shouldPrint) {
      const timer = window.setTimeout(() => window.print(), 250)
      return () => window.clearTimeout(timer)
    }
  }, [shouldPrint])

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between print:hidden">
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
        <div className="flex items-start justify-between border-b border-teal-900/8 px-5 py-5 sm:px-6">
          <BrandMark />
          <StatusBadge status={booking.status} />
        </div>
        <div className="px-5 py-6 sm:px-6">
          <p className="gday-soft-label">Tour voucher</p>
          <h1 className="mt-2 font-mono text-2xl font-semibold tracking-tight text-teal-950">
            {booking.code}
          </h1>
          <p className="mt-1 text-sm text-teal-900/55">{booking.agentName}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Tour Program" value={booking.program} />
            <Field label="Tour Date" value={formatLongDate(booking.date)} />
            <Field label="Lead Guest" value={booking.leadGuest} />
            <Field label="Agent Ref / Voucher #" value={booking.agentRef || '—'} />
            <Field label="Total Passengers" value={`${formatPaxBreakdown(booking)} (${total})`} />
            <Field label="Adults" value={String(booking.adults)} />
            <Field label="Children" value={String(booking.children)} />
            <Field label="Infants" value={String(booking.infants)} />
            <Field label="Tour Leaders" value={String(booking.tourLeaders)} />
            <Field label="Park Fee" value={booking.parkFee} />
            <Field label="Canoe" value={booking.canoe ?? '—'} />
            <Field label="Pickup Zone" value={booking.pickupZone} />
            <Field label="Pickup Hotel" value={booking.pickupHotel} />
            <Field label="Room number" value={booking.roomNumber || '—'} />
            <Field label="Pickup Time" value={booking.pickupTime} />
            <Field label="Note" value={booking.note || '—'} />
          </div>
        </div>
        <div className="border-t border-teal-900/8 bg-teal-950/[0.03] px-5 py-4 text-xs leading-relaxed text-teal-900/55 sm:px-6">
          Present this voucher on the tour date. This is a partner booking confirmation — no price is
          shown.
        </div>
      </article>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="gday-soft-label">{label}</p>
      <p className="mt-1 text-sm font-semibold text-teal-950">{value}</p>
    </div>
  )
}
