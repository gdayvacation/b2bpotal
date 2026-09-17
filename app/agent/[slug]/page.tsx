import { AgentBookingPage } from '@/components/agent/agent-booking-page'

export default async function NewBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <AgentBookingPage slug={slug} />
}
