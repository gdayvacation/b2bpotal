import { Suspense } from 'react'
import { VoucherPage } from '@/components/agent/agent-pages'

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; code: string }>
}) {
  const { slug, code } = await params
  return (
    <Suspense fallback={<div className="text-sm text-neutral-500">Loading voucher…</div>}>
      <VoucherPage slug={slug} code={code} />
    </Suspense>
  )
}
