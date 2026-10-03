import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'

export type AgentAllotmentDaily = {
  id: string
  day: string
  agentSlug: string
  agentName: string
  totalDeduct: number
  /** Lot this saved day belongs to. Empty until Daily checker saves a new day, or a day is moved. */
  allotmentId: string | null
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
  allotment_id?: string | null
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
    allotmentId: row.allotment_id || null,
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
  /** Used only the first time this day is saved. Later saves keep the lot. Move changes it. */
  allotmentId?: string | null
}): Promise<AgentAllotmentDaily> {
  const supabase = requireSupabase()
  const day = input.day.trim()
  const agentSlug = input.agentSlug.trim()
  const existing = await supabase
    .from('agent_allotment_daily')
    .select('allotment_id')
    .eq('day', day)
    .eq('agent_slug', agentSlug)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  const currentLot = (existing.data as { allotment_id?: string | null } | null)?.allotment_id || null
  const allotmentId = existing.data ? currentLot : input.allotmentId || null
  const { data, error } = await supabase
    .from('agent_allotment_daily')
    .upsert(
      {
        day,
        agent_slug: agentSlug,
        agent_name: input.agentName.trim(),
        total_deduct: Math.max(0, Math.floor(input.totalDeduct)),
        note: input.note?.trim() || '',
        allotment_id: allotmentId,
      },
      { onConflict: 'day,agent_slug' },
    )
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as AgentAllotmentDailyRow)
}

export async function moveAgentAllotmentDaily(input: {
  day: string
  agentSlug: string
  allotmentId: string
}): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase
    .from('agent_allotment_daily')
    .update({ allotment_id: input.allotmentId })
    .eq('day', input.day.trim())
    .eq('agent_slug', input.agentSlug.trim())
  if (error) throw new Error(error.message)
}

export type AgentBookingDayPax = {
  day: string
  adults: number
  children: number
  totalDeduct: number
}

/**
 * Active booking AD+CH heads by tour date for one agent.
 * Paginates past the API 1000-row cap so allotment FIFO can backfill days
 * before Daily checker rows exist.
 */
export async function fetchAgentBookingDayPax(agentSlug: string): Promise<AgentBookingDayPax[]> {
  const supabase = requireSupabase()
  const slug = agentSlug.trim()
  if (!slug) return []

  const pageSize = 1000
  let from = 0
  const byDay = new Map<string, { adults: number; children: number }>()

  while (true) {
    const { data, error } = await supabase
      .from('bookings')
      .select('date,adults,children,status')
      .eq('agent_slug', slug)
      .neq('status', 'Cancelled')
      .order('date', { ascending: true })
      .order('code', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as {
      date: string
      adults: number | string | null
      children: number | string | null
      status: string
    }[]

    for (const row of rows) {
      const day = String(row.date ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
      const adults = Math.max(0, Math.floor(Number(row.adults) || 0))
      const children = Math.max(0, Math.floor(Number(row.children) || 0))
      const current = byDay.get(day) ?? { adults: 0, children: 0 }
      current.adults += adults
      current.children += children
      byDay.set(day, current)
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  return [...byDay.entries()]
    .map(([day, pax]) => ({
      day,
      adults: pax.adults,
      children: pax.children,
      totalDeduct: pax.adults + pax.children,
    }))
    .sort((a, b) => a.day.localeCompare(b.day))
}
