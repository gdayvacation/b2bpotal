'use client'

import { Suspense } from 'react'
import { notFound, usePathname } from 'next/navigation'
import { AgentAccessGate } from '@/components/agent/agent-access-gate'
import { AgentShell } from '@/components/agent/agent-shell'
import { GuestAccessGate } from '@/components/check-in/guest-access-gate'
import { usePortal } from '@/components/portal-provider'

function UnknownAgent() {
  const { loadError } = usePortal()
  if (loadError) {
    return (
      <p className="mx-auto max-w-md px-4 py-16 text-center text-sm text-teal-900/70">
        Could not open this booking link. {loadError}
      </p>
    )
  }
  notFound()
}

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
  const voucherMatch = pathname.match(/\/voucher\/([^/]+)/)
  const voucherCode = voucherMatch?.[1] ? decodeURIComponent(voucherMatch[1]) : ''

  if (!hydrated) {
    return <div className="min-h-screen bg-[var(--gday-canvas)]" />
  }

  if (voucherCode) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[var(--gday-canvas)]" />}>
        <GuestAccessGate bookingCode={voucherCode}>
          <div className="gday-app relative min-h-screen">
            <main className="relative w-full px-4 py-5 sm:px-6 sm:py-8 lg:px-8 xl:px-10">
              {children}
            </main>
          </div>
        </GuestAccessGate>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--gday-canvas)]" />}>
      <AgentAccessGate slug={slug}>
        {agent ? <AgentShell agent={agent}>{children}</AgentShell> : <UnknownAgent />}
      </AgentAccessGate>
    </Suspense>
  )
}
