import type { BookedPaxMap, BookedPaxSnapshot } from '@/lib/check-in-booked-pax'
import type { DayJobOrderActionMap, JobOrderAction } from '@/lib/job-order-action'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { dayBoatPlanKey, type Program } from '@/lib/types'

function isJobOrderAction(value: unknown): value is JobOrderAction {
  return value === 'stand-by' || value === 'picked-up' || value === 'no-show'
}

type PaxRow = {
  date: string
  program: string
  booking_code: string
  adults: number
  children: number
  infants: number
  tour_leaders: number
}

type JobOrderRow = {
  date: string
  program: string
  booking_code: string
  action: string
}

export type DayOpsSnapshot = {
  pickupNoShows: BookedPaxMap
  ownArrivals: BookedPaxMap
  jobOrderActions: DayJobOrderActionMap
}

function isProgram(value: unknown): value is Program {
  return value === 'PP' || value === 'James Bond'
}

function asDateString(value: string) {
  return String(value ?? '').slice(0, 10)
}

function paxKey(date: string, program: Program, bookingCode: string) {
  return `${dayBoatPlanKey(date, program)}|${bookingCode}`
}

function snapshotFromRow(row: PaxRow): BookedPaxSnapshot {
  return {
    adults: Math.max(0, Math.floor(Number(row.adults) || 0)),
    children: Math.max(0, Math.floor(Number(row.children) || 0)),
    infants: Math.max(0, Math.floor(Number(row.infants) || 0)),
    tourLeaders: Math.max(0, Math.floor(Number(row.tour_leaders) || 0)),
  }
}

function buildPaxMap(rows: PaxRow[]): BookedPaxMap {
  const next: BookedPaxMap = {}
  for (const row of rows) {
    if (!isProgram(row.program)) continue
    const code = String(row.booking_code ?? '').trim()
    if (!code) continue
    next[paxKey(asDateString(row.date), row.program, code)] = snapshotFromRow(row)
  }
  return next
}

function flattenPaxMap(map: BookedPaxMap): PaxRow[] {
  const rows: PaxRow[] = []
  for (const [key, snapshot] of Object.entries(map)) {
    const parts = key.split('|')
    if (parts.length < 3) continue
    const date = parts[0]
    const program = parts[1]
    const bookingCode = parts.slice(2).join('|')
    if (!date || !isProgram(program) || !bookingCode) continue
    rows.push({
      date,
      program,
      booking_code: bookingCode,
      adults: snapshot.adults,
      children: snapshot.children,
      infants: snapshot.infants,
      tour_leaders: snapshot.tourLeaders,
    })
  }
  return rows
}

function buildJobOrderMap(rows: JobOrderRow[]): DayJobOrderActionMap {
  const next: DayJobOrderActionMap = {}
  for (const row of rows) {
    if (!isProgram(row.program) || !isJobOrderAction(row.action)) continue
    const code = String(row.booking_code ?? '').trim()
    if (!code) continue
    const key = dayBoatPlanKey(asDateString(row.date), row.program)
    next[key] = { ...(next[key] ?? {}), [code]: row.action }
  }
  return next
}

function flattenJobOrderMap(map: DayJobOrderActionMap): JobOrderRow[] {
  const rows: JobOrderRow[] = []
  for (const [dayKey, byCode] of Object.entries(map)) {
    const sep = dayKey.indexOf('|')
    if (sep <= 0) continue
    const date = dayKey.slice(0, sep)
    const program = dayKey.slice(sep + 1)
    if (!isProgram(program)) continue
    for (const [bookingCode, action] of Object.entries(byCode)) {
      if (!bookingCode || !isJobOrderAction(action)) continue
      rows.push({ date, program, booking_code: bookingCode, action })
    }
  }
  return rows
}

const missingDayOpsTables = new Set<string>()

async function fetchOptionalTable<T>(
  table: string,
  range?: { from?: string; to?: string },
): Promise<T[] | null> {
  if (missingDayOpsTables.has(table)) return null
  const supabase = getSupabaseBrowserClient()
  const pageSize = 1000
  const all: T[] = []
  let from = 0
  const fromDate = range?.from?.slice(0, 10) || ''
  const toDate = range?.to?.slice(0, 10) || ''
  while (true) {
    let query = supabase.from(table).select('*')
    if (fromDate) query = query.gte('date', fromDate)
    if (toDate) query = query.lte('date', toDate)
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) {
      missingDayOpsTables.add(table)
      console.warn(`[supabase] ${table} unavailable — run supabase/add-day-ops-sync.sql`, error.message)
      return null
    }
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function fetchDayOpsMaps(range?: {
  from?: string
  to?: string
}): Promise<DayOpsSnapshot | null> {
  const [pickupRows, arrivalRows, actionRows] = await Promise.all([
    fetchOptionalTable<PaxRow>('pickup_no_shows', range),
    fetchOptionalTable<PaxRow>('own_arrivals', range),
    fetchOptionalTable<JobOrderRow>('job_order_actions', range),
  ])
  if (pickupRows === null && arrivalRows === null && actionRows === null) return null
  return {
    pickupNoShows: buildPaxMap(pickupRows ?? []),
    ownArrivals: buildPaxMap(arrivalRows ?? []),
    jobOrderActions: buildJobOrderMap(actionRows ?? []),
  }
}

function paxRow(date: string, program: Program, bookingCode: string, snapshot: BookedPaxSnapshot): PaxRow {
  return {
    date,
    program,
    booking_code: bookingCode,
    adults: snapshot.adults,
    children: snapshot.children,
    infants: snapshot.infants,
    tour_leaders: snapshot.tourLeaders,
  }
}

export async function upsertPickupNoShow(
  date: string,
  program: Program,
  bookingCode: string,
  snapshot: BookedPaxSnapshot,
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('pickup_no_shows').upsert(paxRow(date, program, bookingCode, snapshot))
  if (error) throw new Error(`upsert pickup no-show: ${error.message}`)
}

export async function deletePickupNoShow(date: string, program: Program, bookingCode: string) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from('pickup_no_shows')
    .delete()
    .eq('date', date)
    .eq('program', program)
    .eq('booking_code', bookingCode)
  if (error) throw new Error(`delete pickup no-show: ${error.message}`)
}

export async function upsertOwnArrival(
  date: string,
  program: Program,
  bookingCode: string,
  snapshot: BookedPaxSnapshot,
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('own_arrivals').upsert(paxRow(date, program, bookingCode, snapshot))
  if (error) throw new Error(`upsert own arrival: ${error.message}`)
}

export async function deleteOwnArrival(date: string, program: Program, bookingCode: string) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from('own_arrivals')
    .delete()
    .eq('date', date)
    .eq('program', program)
    .eq('booking_code', bookingCode)
  if (error) throw new Error(`delete own arrival: ${error.message}`)
}

export async function upsertJobOrderActionRow(
  date: string,
  program: Program,
  bookingCode: string,
  action: JobOrderAction,
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('job_order_actions').upsert({
    date,
    program,
    booking_code: bookingCode,
    action,
  })
  if (error) throw new Error(`upsert job-order action: ${error.message}`)
}

export async function deleteJobOrderActionRow(date: string, program: Program, bookingCode: string) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from('job_order_actions')
    .delete()
    .eq('date', date)
    .eq('program', program)
    .eq('booking_code', bookingCode)
  if (error) throw new Error(`delete job-order action: ${error.message}`)
}

async function upsertChunks(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return
  const supabase = getSupabaseBrowserClient()
  const chunkSize = 500
  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await supabase.from(table).upsert(rows.slice(index, index + chunkSize))
    if (error) throw new Error(`push ${table}: ${error.message}`)
  }
}

export async function pushDayOpsMaps(snapshot: DayOpsSnapshot) {
  await upsertChunks('pickup_no_shows', flattenPaxMap(snapshot.pickupNoShows))
  await upsertChunks('own_arrivals', flattenPaxMap(snapshot.ownArrivals))
  await upsertChunks('job_order_actions', flattenJobOrderMap(snapshot.jobOrderActions))
}

export function dayOpsMapsHaveData(snapshot: DayOpsSnapshot) {
  return (
    Object.keys(snapshot.pickupNoShows).length > 0 ||
    Object.keys(snapshot.ownArrivals).length > 0 ||
    Object.keys(snapshot.jobOrderActions).length > 0
  )
}

export async function moveDayOpsBookingDate(
  oldDate: string,
  newDate: string,
  program: Program,
  bookingCode: string,
) {
  if (oldDate === newDate) return
  const supabase = getSupabaseBrowserClient()
  for (const table of ['pickup_no_shows', 'own_arrivals', 'job_order_actions'] as const) {
    await supabase.from(table).delete().eq('date', newDate).eq('program', program).eq('booking_code', bookingCode)
    const { error } = await supabase
      .from(table)
      .update({ date: newDate })
      .eq('date', oldDate)
      .eq('program', program)
      .eq('booking_code', bookingCode)
    if (error) throw new Error(`move ${table} date: ${error.message}`)
  }
}
