import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'

export type AgentAllotmentDaily = {
  id: string
  day: string
  agentSlug: string
  agentName: string
  totalDeduct: number
  note: string
  createdAt: string
  updatedAt: string
}

type AgentAllotmentDailyRow = {
  id: string
  day: string
  agent_slug: string
  agent_name: string
  total_deduct: number | string
  note: string | null
  created_at: string
  updated_at: string
}

function requireSupabase() {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase is not configured.')
  }
  return getSupabaseBrowserClient()
}

function mapRow(row: AgentAllotmentDailyRow): AgentAllotmentDaily {
  return {
    id: row.id,
    day: row.day.slice(0, 10),
    agentSlug: row.agent_slug,
    agentName: row.agent_name,
    totalDeduct: Math.max(0, Math.floor(Number(row.total_deduct) || 0)),
    note: row.note?.trim() || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listAgentAllotmentDaily(day?: string): Promise<AgentAllotmentDaily[]> {
  const supabase = requireSupabase()
  let query = supabase
    .from('agent_allotment_daily')
    .select('*')
    .order('day', { ascending: false })
    .order('agent_name', { ascending: true })
  if (day) query = query.eq('day', day)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as AgentAllotmentDailyRow[]).map(mapRow)
}

export async function listAgentAllotmentDailyByAgent(
  agentSlug: string,
): Promise<AgentAllotmentDaily[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('agent_allotment_daily')
    .select('*')
    .eq('agent_slug', agentSlug)
    .order('day', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as AgentAllotmentDailyRow[]).map(mapRow)
}

export async function upsertAgentAllotmentDaily(input: {
  day: string
  agentSlug: string
  agentName: string
  totalDeduct: number
  note?: string
}): Promise<AgentAllotmentDaily> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('agent_allotment_daily')
    .upsert(
      {
        day: input.day.trim(),
        agent_slug: input.agentSlug.trim(),
        agent_name: input.agentName.trim(),
        total_deduct: Math.max(0, Math.floor(input.totalDeduct)),
        note: input.note?.trim() || '',
      },
      { onConflict: 'day,agent_slug' },
    )
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as AgentAllotmentDailyRow)
}
