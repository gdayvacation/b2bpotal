import { AgentLayoutClient } from '@/components/agent/agent-layout-client'

export default async function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <AgentLayoutClient slug={slug}>{children}</AgentLayoutClient>
}
