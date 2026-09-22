import { GuestCheckIn } from '@/components/check-in/guest-check-in'

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string; booking?: string }>
}) {
  const params = await searchParams
  const lockedBookingCode = String(params.b ?? params.booking ?? '').trim()
  return <GuestCheckIn lockedBookingCode={lockedBookingCode || null} />
}
