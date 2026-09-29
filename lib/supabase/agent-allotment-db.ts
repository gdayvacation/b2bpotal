import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'

export type AgentAllotment = {
  id: string
  agentSlug: string
  agentName: string
  seats: number
  adultSeats: number
  childSeats: number
  adultPrice: number
  childPrice: number
  totalAmount: number
  paidDate: string | null
  note: string
  createdAt: string
  updatedAt: string
}

type AgentAllotmentRow = {
  id: string
  agent_slug: string
  agent_name: string
  seats: number | string
  adult_seats?: number | string | null
  child_seats?: number | string | null
  adult_price?: number | string | null
  child_price?: number | string | null
  total_amount: number | string
  paid_date?: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type AgentAllotmentInput = {
  agentSlug: string
  agentName: string
  adultSeats: number
  childSeats: number
  adultPrice: number
  childPrice: number
  paidDate: string
  note?: string
}

function requireSupabase() {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase is not configured.')
  }
  return getSupabaseBrowserClient()
}

function num(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function allotmentTotalAmount(input: {
  adultSeats: number
  childSeats: number
  adultPrice: number
  childPrice: number
}) {
  const adults = Math.max(0, Math.floor(input.adultSeats))
  const children = Math.max(0, Math.floor(input.childSeats))
  const adultPrice = Math.max(0, Number(input.adultPrice) || 0)
  const childPrice = Math.max(0, Number(input.childPrice) || 0)
  return Math.round((adults * adultPrice + children * childPrice) * 100) / 100
}

function mapRow(row: AgentAllotmentRow): AgentAllotment {
  const seats = Math.max(0, Math.floor(num(row.seats)))
  const adultSeatsRaw = row.adult_seats
  const childSeatsRaw = row.child_seats
  const hasSplit =
    adultSeatsRaw !== undefined &&
    adultSeatsRaw !== null &&
    childSeatsRaw !== undefined &&
    childSeatsRaw !== null
  const adultSeats = hasSplit ? Math.max(0, Math.floor(num(adultSeatsRaw))) : seats
  const childSeats = hasSplit ? Math.max(0, Math.floor(num(childSeatsRaw))) : 0
  return {
    id: row.id,
    agentSlug: row.agent_slug,
    agentName: row.agent_name,
    seats: Math.max(seats, adultSeats + childSeats),
    adultSeats,
    childSeats,
    adultPrice: Math.max(0, num(row.adult_price)),
    childPrice: Math.max(0, num(row.child_price)),
    totalAmount: Math.max(0, num(row.total_amount)),
    paidDate: row.paid_date?.slice(0, 10) || null,
    note: row.note?.trim() || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRowPayload(input: AgentAllotmentInput) {
  const adultSeats = Math.max(0, Math.floor(input.adultSeats))
  const childSeats = Math.max(0, Math.floor(input.childSeats))
  const adultPrice = Math.max(0, Number(input.adultPrice) || 0)
  const childPrice = Math.max(0, Number(input.childPrice) || 0)
  return {
    agent_slug: input.agentSlug.trim(),
    agent_name: input.agentName.trim(),
    adult_seats: adultSeats,
    child_seats: childSeats,
    seats: adultSeats + childSeats,
    adult_price: adultPrice,
    child_price: childPrice,
    total_amount: allotmentTotalAmount({ adultSeats, childSeats, adultPrice, childPrice }),
    paid_date: input.paidDate.trim() || null,
    note: input.note?.trim() || '',
  }
}

export async function listAgentAllotments(): Promise<AgentAllotment[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('agent_allotments')
    .select('*')
    .order('paid_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as AgentAllotmentRow[]).map(mapRow)
}

export async function createAgentAllotment(input: AgentAllotmentInput): Promise<AgentAllotment> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('agent_allotments')
    .insert(toRowPayload(input))
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as AgentAllotmentRow)
}

export async function updateAgentAllotment(
  id: string,
  input: AgentAllotmentInput,
): Promise<AgentAllotment> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('agent_allotments')
    .update(toRowPayload(input))
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as AgentAllotmentRow)
}

export async function deleteAgentAllotment(id: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.from('agent_allotments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
