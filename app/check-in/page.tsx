import { GuestAccessGate } from '@/components/check-in/guest-access-gate'
import { GuestCheckIn } from '@/components/check-in/guest-check-in'
import { fetchGuestBookingServer } from '@/lib/supabase/server-guest-db'

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string; booking?: string; t?: string }>
}) {
  const params = await searchParams
  const lockedBookingCode = String(params.b ?? params.booking ?? '').trim()
  const token = String(params.t ?? '').trim()

  // Fetch booking server-side so the page can render immediately without
  // waiting for the guest's phone to authenticate. Falls back to null when
  // the code is invalid or the service-role key is not configured — in that
  // case GuestAccessGate falls back to the original client-side auth flow.
  const initialBooking = lockedBookingCode
    ? await fetchGuestBookingServer(lockedBookingCode).catch(() => null)
    : null

  return (
    <GuestAccessGate bookingCode={lockedBookingCode} token={token} initialBooking={initialBooking}>
      <GuestCheckIn
        lockedBookingCode={lockedBookingCode || null}
        linkToken={token}
        initialBooking={initialBooking}
      />
    </GuestAccessGate>
  )
}
