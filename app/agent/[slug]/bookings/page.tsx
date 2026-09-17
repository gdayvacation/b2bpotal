import { AgentBookingsPage } from '@/components/agent/agent-pages'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <AgentBookingsPage slug={slug} />
}
