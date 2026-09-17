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

  return <BookingWizard agent={agent} />
}
