import { HelperAccessGate } from '@/components/check-in/helper-access-gate'
import { HelperCheckIn } from '@/components/check-in/helper-check-in'

export default async function HelperCheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; t?: string; o?: string; c?: string }>
}) {
  const params = await searchParams
  const date = String(params.d ?? '').trim()
  const token = String(params.t ?? '').trim()
  const openTime = String(params.o ?? '').trim()
  const closeTime = String(params.c ?? '').trim()
  return (
    <HelperAccessGate date={date} token={token}>
      <HelperCheckIn date={date} openTime={openTime} closeTime={closeTime} />
    </HelperAccessGate>
  )
}
