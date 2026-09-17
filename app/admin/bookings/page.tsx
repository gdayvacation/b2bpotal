import { Suspense } from 'react'
import { AdminBookings } from '@/components/admin/admin-bookings'

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-teal-900/50">Loading bookings…</p>}>
      <AdminBookings />
    </Suspense>
  )
}
