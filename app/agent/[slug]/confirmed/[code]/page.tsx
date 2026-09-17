import { ConfirmationPage } from '@/components/agent/agent-pages'

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; code: string }>
}) {
  const { slug, code } = await params
  return <ConfirmationPage slug={slug} code={code} />
}
