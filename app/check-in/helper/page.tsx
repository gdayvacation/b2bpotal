import { HelperCheckIn } from '@/components/check-in/helper-check-in'

export default async function HelperCheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; t?: string }>
}) {
  const params = await searchParams
  return (
    <HelperCheckIn
      date={String(params.d ?? '').trim()}
      token={String(params.t ?? '').trim()}
    />
  )
}
