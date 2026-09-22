'use client'

import { notFound, usePathname } from 'next/navigation'
import { AgentShell } from '@/components/agent/agent-shell'
import { usePortal } from '@/components/portal-provider'

export function AgentLayoutClient({
  slug,
  children,
}: {
  slug: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { agents, hydrated } = usePortal()
  const agent = agents.find((item) => item.slug === slug)
  const voucherPreview = pathname.includes('/voucher/')

  if (!hydrated) {
    return <div className="min-h-screen bg-[var(--gday-canvas)]" />
  }

  if (!agent) notFound()

  if (voucherPreview) {
    return (
      <div className="gday-app relative min-h-screen">
        <main className="relative w-full px-4 py-5 sm:px-6 sm:py-8 lg:px-8 xl:px-10">{children}</main>
      </div>
    )
  }

  return <AgentShell agent={agent}>{children}</AgentShell>
}
