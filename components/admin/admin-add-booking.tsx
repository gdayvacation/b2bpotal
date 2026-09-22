'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { BookingWizard } from '@/components/agent/booking-wizard'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AdminAddBooking() {
  const router = useRouter()

  return (
    <div>
      <div className="mx-auto mb-4 max-w-3xl">
        <Link
          href="/admin/bookings"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2 gap-1.5 text-teal-900/60')}
        >
          <ArrowLeft className="size-3.5" />
          Back to bookings
        </Link>
      </div>

      <BookingWizard
        selectAgent
        eyebrow="Admin"
        title="Add Booking"
        description="Create a reservation taken offline or by phone. Sold-out dates stay bookable here so ops can confirm boat capacity manually."
        onSuccess={(booking) => {
          router.push(`/admin/bookings?created=${encodeURIComponent(booking.code)}`)
        }}
      />
    </div>
  )
}
