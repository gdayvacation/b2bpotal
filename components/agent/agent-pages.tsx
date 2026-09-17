'use client'

import { ConfirmationView } from '@/components/agent/confirmation-view'
import { VoucherView } from '@/components/agent/voucher-view'
import { BookingsTable } from '@/components/agent/bookings-table'
import { BookingCalendar } from '@/components/agent/booking-calendar'
import { usePortal } from '@/components/portal-provider'

export function AgentBookingsPage({ slug }: { slug: string }) {
  const { bookings } = usePortal()
  return (
    <BookingsTable
      slug={slug}
      bookings={bookings.filter((booking) => booking.agentSlug === slug)}
    />
  )
}

export function AgentCalendarPage() {
  const { bookings } = usePortal()
  return <BookingCalendar bookings={bookings} />
}

export function ConfirmationPage({ slug, code }: { slug: string; code: string }) {
  const { bookings, hydrated } = usePortal()
  const booking = bookings.find((item) => item.code === code && item.agentSlug === slug)
  if (booking) return <ConfirmationView booking={booking} slug={slug} />
  if (!hydrated) return <p className="text-sm text-neutral-500">Loading confirmation…</p>
  return <MissingBooking slug={slug} />
}

export function VoucherPage({ slug, code }: { slug: string; code: string }) {
  const { bookings, hydrated } = usePortal()
  const booking = bookings.find((item) => item.code === code && item.agentSlug === slug)
  if (booking) return <VoucherView booking={booking} slug={slug} />
  if (!hydrated) return <p className="text-sm text-neutral-500">Loading voucher…</p>
  return <MissingBooking slug={slug} />
}

function MissingBooking({ slug }: { slug: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">Booking not found</h1>
      <p className="mt-2 text-sm text-neutral-500">
        This confirmation is no longer in the prototype session.
      </p>
      <a href={`/agent/${slug}/bookings`} className="mt-4 inline-block text-sm font-medium underline">
        Back to My Bookings
      </a>
    </div>
  )
}
