'use client'

import { notFound } from 'next/navigation'
import { AgentShell } from '@/components/agent/agent-shell'
import { usePortal } from '@/components/portal-provider'

export function AgentLayoutClient({
  slug,
  children,
}: {
  slug: string
  children: React.ReactNode
}) {
  const { agents, hydrated } = usePortal()
  const agent = agents.find((item) => item.slug === slug)

  if (!hydrated) {
    return <div className="min-h-screen bg-[var(--gday-canvas)]" />
  }

  if (!agent) notFound()

  return <AgentShell agent={agent}>{children}</AgentShell>
}
