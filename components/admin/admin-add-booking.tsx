'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { BookingFromChatDialog } from '@/components/admin/booking-from-chat-dialog'
import { BookingWizard } from '@/components/agent/booking-wizard'
import { buttonVariants } from '@/components/ui/button'
import {
  clearBookingImageDraft,
  loadBookingImageDraft,
  type BookingImageDraft,
} from '@/lib/booking-from-image'
import { cn } from '@/lib/utils'

export function AdminAddBooking() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [seed, setSeed] = useState<BookingImageDraft | null>(null)
  const [seedReady, setSeedReady] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    const fromChat = searchParams.get('seed') === 'chat'
    if (fromChat) {
      const draft = loadBookingImageDraft()
      setSeed(draft)
      clearBookingImageDraft()
      // Drop the query so refresh does not re-apply a cleared draft.
      router.replace('/admin/bookings/new', { scroll: false })
    }
    setSeedReady(true)
  }, [searchParams, router])

  return (
    <div>
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <Link
          href="/admin/bookings"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2 gap-1.5 text-teal-900/60')}
        >
          <ArrowLeft className="size-3.5" />
          Back to bookings
        </Link>
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
        >
          <Sparkles className="size-3.5" />
          From chat photo
        </button>
      </div>

      {seedReady ? (
        <BookingWizard
          key={seed ? `seed-${seed.leadGuest}-${seed.date}-${seed.program}` : 'manual'}
          selectAgent
          eyebrow="Admin"
          title="Add Booking"
          description="Create a reservation taken offline or by phone. Admin can book any date — including same-day travel and closed days — but not over the boat seat limit."
          seed={seed}
          onSuccess={(booking) => {
            router.push(`/admin/bookings?created=${encodeURIComponent(booking.code)}`)
          }}
        />
      ) : null}

      <BookingFromChatDialog open={chatOpen} onOpenChange={setChatOpen} />
    </div>
  )
}
