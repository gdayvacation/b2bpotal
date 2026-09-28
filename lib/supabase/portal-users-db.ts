import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'
import type { PortalSession, PortalUser, PortalUserStatus } from '@/lib/types'

type PortalUserRow = {
  id: string
  email: string | null
  name: string
  company: string
  user_id: string | null
  agent_slug: string | null
  status: PortalUserStatus
  created_at: string
  updated_at: string
  has_password: boolean
  auth_email?: string | null
}

function rpcMessage(error: { message?: string } | null, fallback: string) {
  const raw = error?.message?.trim()
  if (!raw) return fallback
  return raw.replace(/^ERROR:\s*/i, '').replace(/\s*\(SQLSTATE\s+\w+\)\s*$/i, '')
}

function mapUser(row: PortalUserRow): PortalUser {
  return {
    id: row.id,
    email: row.email?.trim() || null,
    name: row.name,
    company: row.company,
    userId: row.user_id,
    agentSlug: row.agent_slug?.trim() || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasPassword: row.has_password,
  }
}

function requireSupabase() {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase is not configured.')
  }
  return getSupabaseBrowserClient()
}

export async function signUpPortalUser(input: {
  email: string
  name: string
  company: string
}) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('portal_sign_up', {
    p_email: input.email,
    p_name: input.name,
    p_company: input.company,
  })
  if (error) throw new Error(rpcMessage(error, 'Could not sign up with that email.'))
}

export async function signInPortalUser(input: { userId: string; password: string }): Promise<PortalSession> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('portal_sign_in', {
    p_user_id: input.userId,
    p_password: input.password,
  })
  if (error) throw new Error(rpcMessage(error, 'User ID or password is incorrect.'))
  const row = (Array.isArray(data) ? data[0] : data) as PortalUserRow | undefined
  if (!row?.id || !row.user_id) {
    throw new Error('User ID or password is incorrect.')
  }

  const authEmail = row.auth_email?.trim()
  if (authEmail) {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: input.password,
    })
    if (authError) {
      console.warn('[portal-auth] supabase session was not created', authError.message)
    }
  }

  return {
    id: row.id,
    email: row.email?.trim() || null,
    name: row.name ?? '',
    company: row.company ?? '',
    userId: row.user_id,
    agentSlug: row.agent_slug?.trim() || null,
    status: row.status,
  }
}

export async function listPortalUsers(): Promise<PortalUser[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('portal_list_users')
  if (error) throw new Error(rpcMessage(error, 'Could not load users.'))
  return ((data ?? []) as PortalUserRow[]).map(mapUser)
}

export async function createPortalUser(input: {
  email: string
  name: string
  company: string
  userId: string
  password: string
  agentSlug?: string
}) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('portal_admin_create_user', {
    p_email: input.email,
    p_name: input.name,
    p_company: input.company,
    p_user_id: input.userId,
    p_password: input.password,
    p_agent_slug: input.agentSlug ?? '',
  })
  if (error) throw new Error(rpcMessage(error, 'Could not create that user.'))
}

export async function setPortalUserCredentials(input: {
  id: string
  userId: string
  password: string
  agentSlug?: string
}) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('portal_admin_set_credentials', {
    p_id: input.id,
    p_user_id: input.userId,
    p_password: input.password,
    p_agent_slug: input.agentSlug ?? '',
  })
  if (error) throw new Error(rpcMessage(error, 'Could not save User ID and password.'))
}

export async function setPortalUserAgentSlug(id: string, agentSlug: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('portal_admin_set_agent_slug', {
    p_id: id,
    p_agent_slug: agentSlug,
  })
  if (error) throw new Error(rpcMessage(error, 'Could not save that agent.'))
}

export async function setPortalUserStatus(id: string, status: PortalUserStatus) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('portal_admin_set_status', {
    p_id: id,
    p_status: status,
  })
  if (error) throw new Error(rpcMessage(error, 'Could not update that user.'))
}

export async function deletePortalUser(id: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('portal_admin_delete_user', { p_id: id })
  if (error) throw new Error(rpcMessage(error, 'Could not remove that user.'))
}

export async function signOutPortalUser() {
  if (!hasSupabaseConfig()) return
  await getSupabaseBrowserClient().auth.signOut()
}
