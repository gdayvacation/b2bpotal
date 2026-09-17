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
        <Link href={`/agent/${slug}/bookings`} className="text-sm text-neutral-500 hover:text-neutral-900">
          ← My Bookings
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className={cn(buttonVariants({ variant: 'outline' }), 'h-9 px-3')}
        >
          <Printer data-icon="inline-start" />
          Print Voucher
        </button>
      </div>

      <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] print:border-neutral-300 print:shadow-none">
        <div className="flex items-start justify-between border-b border-neutral-100 px-6 py-5">
          <BrandMark />
          <StatusBadge status={booking.status} />
        </div>
        <div className="px-6 py-6">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-neutral-400 uppercase">
            Tour Voucher
          </p>
          <h1 className="mt-2 font-mono text-2xl font-semibold tracking-tight">{booking.code}</h1>
          <p className="mt-1 text-sm text-neutral-500">{booking.agentName}</p>

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
        <div className="border-t border-neutral-100 bg-neutral-50 px-6 py-4 text-xs text-neutral-500">
          Present this voucher on the tour date. This is a partner booking confirmation — no price is shown.
        </div>
      </article>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-100 px-4 py-3">
      <div className="text-[11px] font-medium tracking-wide text-neutral-400 uppercase">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}
