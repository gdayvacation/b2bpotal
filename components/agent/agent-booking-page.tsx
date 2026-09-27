'use client'

import { notFound } from 'next/navigation'
import { BookingWizard } from '@/components/agent/booking-wizard'
import { usePortal } from '@/components/portal-provider'

export function AgentBookingPage({ slug }: { slug: string }) {
  const { agents, hydrated } = usePortal()
  const agent = agents.find((item) => item.slug === slug)

  if (!hydrated) {
    return <p className="text-sm text-teal-900/50">Loading…</p>
  }

  if (!agent) notFound()

  if (agent.status === 'Inactive') {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-teal-900/8 bg-white px-5 py-8 text-center">
        <p className="text-xs font-semibold tracking-[0.14em] text-teal-700/55 uppercase">
          Agent inactive
        </p>
        <p className="mt-2 font-display text-2xl font-semibold text-teal-950">
          Booking is closed
        </p>
        <p className="mt-2 text-sm leading-relaxed text-teal-900/60">
          {agent.name} is inactive and cannot create new bookings. Existing reservations stay
          visible on Bookings and Calendar.
        </p>
      </div>
    )
  }

  return <BookingWizard agent={agent} />
}
