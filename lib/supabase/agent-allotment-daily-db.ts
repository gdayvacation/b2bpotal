import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'
import {
  bookedPaxOf,
  chargedCancelDeductsAllotment,
  countsTowardAllotment,
  isNoTransfer,
  type Booking,
  type Program,
} from '@/lib/types'

export type AgentAllotmentDaily = {
  id: string
  day: string
  agentSlug: string
  agentName: string
  program: Program
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
  program?: string | null
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
    program: row.program === 'James Bond' ? 'James Bond' : 'PP',
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
  program?: Program
  totalDeduct: number
  note?: string
  /** Used only the first time this day is saved. Later saves keep the lot. Move changes it. */
  allotmentId?: string | null
}): Promise<AgentAllotmentDaily> {
  const supabase = requireSupabase()
  const day = input.day.trim()
  const agentSlug = input.agentSlug.trim()
  const program: Program = input.program === 'James Bond' ? 'James Bond' : 'PP'
  const existing = await supabase
    .from('agent_allotment_daily')
    .select('allotment_id')
    .eq('day', day)
    .eq('agent_slug', agentSlug)
    .eq('program', program)
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
        program,
        total_deduct: Math.max(0, Math.floor(input.totalDeduct)),
        note: input.note?.trim() || '',
        allotment_id: allotmentId,
      },
      { onConflict: 'day,agent_slug,program' },
    )
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as AgentAllotmentDailyRow)
}

export async function moveAgentAllotmentDaily(input: {
  day: string
  agentSlug: string
  program?: Program
  allotmentId: string
}): Promise<void> {
  const supabase = requireSupabase()
  const program: Program = input.program === 'James Bond' ? 'James Bond' : 'PP'
  const { error } = await supabase
    .from('agent_allotment_daily')
    .update({ allotment_id: input.allotmentId })
    .eq('day', input.day.trim())
    .eq('agent_slug', input.agentSlug.trim())
    .eq('program', program)
  if (error) throw new Error(error.message)
}

export type AgentBookingLine = {
  code: string
  agentRef: string
  guestName: string
  hotel: string
  adults: number
  children: number
  /** Cancelled with a charge. Still uses prebuy heads. */
  chargedCancel?: boolean
  /** This booking was moved onto this tour date. */
  dateChanged?: boolean
  /** Pickup zone is No Transfer. */
  noTransfer?: boolean
}

export type AgentBookingDayPax = {
  day: string
  adults: number
  children: number
  totalDeduct: number
  bookings: AgentBookingLine[]
}

/**
 * Chargeable AD+CH heads by tour date for one agent.
 * Includes confirmed bookings and cancelled-with-charge bookings.
 * Complimentary cancels stay out. Paginates past the API 1000-row cap.
 */
export async function fetchAgentBookingDayPax(
  agentSlug: string,
  program: Program = 'PP',
): Promise<AgentBookingDayPax[]> {
  const supabase = requireSupabase()
  const slug = agentSlug.trim()
  if (!slug) return []

  const pageSize = 1000
  let from = 0
  const byDay = new Map<string, { adults: number; children: number; bookings: AgentBookingLine[] }>()

  while (true) {
    const { data, error } = await supabase
      .from('bookings')
      .select(
        'code,agent_ref,lead_guest,pickup_hotel,pickup_zone,date,adults,children,status,late_cancel,cancel_fee,original_adults,original_children,late_date_change,no_show_date_move,moved_from_code',
      )
      .eq('agent_slug', slug)
      .eq('program', program)
      .order('date', { ascending: true })
      .order('code', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as {
      code: string | null
      agent_ref: string | null
      lead_guest: string | null
      pickup_hotel: string | null
      pickup_zone: string | null
      date: string
      adults: number | string | null
      children: number | string | null
      status: string
      late_cancel: boolean | null
      cancel_fee: number | string | null
      original_adults: number | string | null
      original_children: number | string | null
      late_date_change: boolean | null
      no_show_date_move: boolean | null
      moved_from_code: string | null
    }[]

    for (const row of rows) {
      const day = String(row.date ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
      const adults = Math.max(0, Math.floor(Number(row.adults) || 0))
      const children = Math.max(0, Math.floor(Number(row.children) || 0))
      const originalAdults =
        row.original_adults == null ? null : Math.max(0, Math.floor(Number(row.original_adults) || 0))
      const originalChildren =
        row.original_children == null
          ? null
          : Math.max(0, Math.floor(Number(row.original_children) || 0))
      const shaped: Pick<
        Booking,
        'status' | 'lateCancel' | 'cancelFee' | 'adults' | 'children' | 'infants' | 'tourLeaders'
      > & { originalPax?: Booking['originalPax'] } = {
        status: row.status === 'Cancelled' ? 'Cancelled' : 'Confirmed',
        lateCancel: row.late_cancel === true,
        cancelFee:
          row.cancel_fee == null ? undefined : Math.max(0, Math.floor(Number(row.cancel_fee) || 0)),
        adults,
        children,
        infants: 0,
        tourLeaders: 0,
        originalPax:
          originalAdults == null && originalChildren == null
            ? null
            : {
                adults: originalAdults ?? adults,
                children: originalChildren ?? children,
                infants: 0,
                tourLeaders: 0,
              },
      }
      if (!countsTowardAllotment(shaped)) continue
      const chargedCancel = chargedCancelDeductsAllotment(shaped)
      const dateChanged =
        row.late_date_change === true ||
        row.no_show_date_move === true ||
        Boolean(String(row.moved_from_code ?? '').trim())
      const pax = chargedCancel ? bookedPaxOf(shaped) : shaped
      const useAdults = Math.max(0, pax.adults)
      const useChildren = Math.max(0, pax.children)
      if (useAdults + useChildren <= 0) continue
      const current = byDay.get(day) ?? { adults: 0, children: 0, bookings: [] }
      current.adults += useAdults
      current.children += useChildren
      const code = String(row.code ?? '').trim()
      if (code) {
        current.bookings.push({
          code,
          agentRef: String(row.agent_ref ?? '').trim(),
          guestName: String(row.lead_guest ?? '').trim(),
          hotel: String(row.pickup_hotel ?? '').trim(),
          adults: useAdults,
          children: useChildren,
          chargedCancel,
          dateChanged,
          noTransfer:
            isNoTransfer(row.pickup_zone) || isNoTransfer(String(row.pickup_hotel ?? '')),
        })
      }
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
      bookings: pax.bookings,
    }))
    .sort((a, b) => a.day.localeCompare(b.day))
}
