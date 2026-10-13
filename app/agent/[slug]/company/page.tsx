import { AgentCompanyPage } from '@/components/agent/agent-company-page'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <AgentCompanyPage slug={slug} />
}
