import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'

function rpcMessage(error: { message?: string } | null, fallback: string) {
  const raw = error?.message?.trim()
  if (!raw) return fallback
  return raw.replace(/^ERROR:\s*/i, '').replace(/\s*\(SQLSTATE\s+\w+\)\s*$/i, '')
}

export type AgentAccessKeyRow = {
  slug: string
  accessKey: string
  updatedAt: string | null
}

export async function listAgentAccessKeys(): Promise<AgentAccessKeyRow[]> {
  if (!hasSupabaseConfig()) return []
  const { data, error } = await getSupabaseBrowserClient().rpc('portal_admin_list_agent_keys')
  if (error) throw new Error(rpcMessage(error, 'Could not load agent links.'))
  return ((data ?? []) as { slug: string; access_key: string | null; updated_at: string | null }[]).map(
    (row) => ({
      slug: row.slug,
      accessKey: row.access_key ?? '',
      updatedAt: row.updated_at,
    }),
  )
}

export async function rotateAgentAccessKey(slug: string): Promise<string> {
  const { data, error } = await getSupabaseBrowserClient().rpc('portal_admin_rotate_agent_key', {
    p_slug: slug,
  })
  if (error) throw new Error(rpcMessage(error, 'Could not replace that link.'))
  return String(data ?? '')
}
