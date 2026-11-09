import { HelperAccessGate } from '@/components/check-in/helper-access-gate'

export default async function HelperCheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; t?: string }>
}) {
  const params = await searchParams
  const date = String(params.d ?? '').trim()
  const token = String(params.t ?? '').trim()
  return <HelperAccessGate date={date} token={token} />
}
