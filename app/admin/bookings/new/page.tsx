import { Suspense } from 'react'
import { AdminAddBooking } from '@/components/admin/admin-add-booking'

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-teal-900/50">Loading…</p>}>
      <AdminAddBooking />
    </Suspense>
  )
}
