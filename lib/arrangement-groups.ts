import { persistQuietly } from '@/lib/supabase/portal-db'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { dayBoatPlanKey, type Program } from '@/lib/types'

export const ARRANGEMENT_GROUP_STORAGE_KEY = 'gday-arrangement-groups'

export type ArrangementGroupKind = 'private' | 'partner'

export type DayArrangementGroupMap = Record<string, Record<string, ArrangementGroupKind>>

export type ArrangementGroupChange = {
  date: string
  program: Program
  bookingCode: string
  group: ArrangementGroupKind | null
}

export type ArrangementGroupRow = {
  date: string
  program: string
  booking_code: string
  group_kind: string
}

export function isArrangementGroupKind(value: unknown): value is ArrangementGroupKind {
  return value === 'private' || value === 'partner'
}

function asDateString(value: string) {
  return String(value ?? '').slice(0, 10)
}

export function buildArrangementGroupMap(rows: ArrangementGroupRow[]): DayArrangementGroupMap {
  const next: DayArrangementGroupMap = {}
  for (const row of rows) {
    if (row.program !== 'PP' && row.program !== 'James Bond') continue
    if (!isArrangementGroupKind(row.group_kind)) continue
    const code = String(row.booking_code ?? '').trim()
    if (!code) continue
    const key = dayBoatPlanKey(asDateString(row.date), row.program)
    next[key] = { ...(next[key] ?? {}), [code]: row.group_kind }
  }
  return next
}

export function loadArrangementGroupMap(): DayArrangementGroupMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(ARRANGEMENT_GROUP_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: DayArrangementGroupMap = {}
    for (const [dayKey, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== 'object') continue
      const marks: Record<string, ArrangementGroupKind> = {}
      for (const [code, kind] of Object.entries(row as Record<string, unknown>)) {
        if (isArrangementGroupKind(kind)) marks[code] = kind
      }
      if (Object.keys(marks).length > 0) next[dayKey] = marks
    }
    return next
  } catch {
    return {}
  }
}

export function saveArrangementGroupMap(map: DayArrangementGroupMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ARRANGEMENT_GROUP_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

export function getArrangementGroup(
  map: DayArrangementGroupMap,
  date: string,
  program: Program,
  bookingCode: string,
): ArrangementGroupKind | null {
  return map[dayBoatPlanKey(date, program)]?.[bookingCode] ?? null
}

export function withArrangementGroup(
  map: DayArrangementGroupMap,
  date: string,
  program: Program,
  bookingCode: string,
  group: ArrangementGroupKind | null,
): DayArrangementGroupMap {
  const key = dayBoatPlanKey(date, program)
  const day = { ...(map[key] ?? {}) }
  if (group === null) delete day[bookingCode]
  else day[bookingCode] = group
  const next = { ...map }
  if (Object.keys(day).length === 0) delete next[key]
  else next[key] = day
  return next
}

export function mergeArrangementGroups(
  current: DayArrangementGroupMap,
  incoming: DayArrangementGroupMap,
  from: string,
  to: string,
): DayArrangementGroupMap {
  const next: DayArrangementGroupMap = {}
  for (const [key, value] of Object.entries(current)) {
    const day = key.slice(0, 10)
    if (day < from || day > to) next[key] = value
  }
  for (const [key, value] of Object.entries(incoming)) next[key] = value
  return next
}

let arrangementTableMissing = false

export async function fetchArrangementGroupMap(range?: {
  from?: string
  to?: string
}): Promise<DayArrangementGroupMap | null> {
  if (arrangementTableMissing) return null
  const supabase = getSupabaseBrowserClient()
  const pageSize = 1000
  const all: ArrangementGroupRow[] = []
  let from = 0
  const fromDate = range?.from?.slice(0, 10) || ''
  const toDate = range?.to?.slice(0, 10) || ''
  while (true) {
    let query = supabase.from('booking_arrangement_groups').select('*')
    if (fromDate) query = query.gte('date', fromDate)
    if (toDate) query = query.lte('date', toDate)
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) {
      if (/booking_arrangement_groups|schema cache|does not exist|Could not find/i.test(error.message)) {
        arrangementTableMissing = true
        console.warn(
          '[supabase] booking_arrangement_groups unavailable — run supabase/add-booking-arrangement-groups.sql',
          error.message,
        )
        return null
      }
      console.warn('[supabase] arrangement groups', error.message)
      return null
    }
    const rows = (data ?? []) as ArrangementGroupRow[]
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return buildArrangementGroupMap(all)
}

export async function writeArrangementGroupChanges(changes: ArrangementGroupChange[]) {
  if (changes.length === 0) return
  const supabase = getSupabaseBrowserClient()
  const upserts = changes.filter((change) => change.group)
  const deletes = changes.filter((change) => !change.group)
  if (upserts.length > 0) {
    const { error } = await supabase.from('booking_arrangement_groups').upsert(
      upserts.map((change) => ({
        date: change.date,
        program: change.program,
        booking_code: change.bookingCode,
        group_kind: change.group,
      })),
    )
    if (error) throw new Error(`upsert arrangement groups: ${error.message}`)
  }
  for (const change of deletes) {
    const { error } = await supabase
      .from('booking_arrangement_groups')
      .delete()
      .eq('date', change.date)
      .eq('program', change.program)
      .eq('booking_code', change.bookingCode)
    if (error) throw new Error(`delete arrangement group: ${error.message}`)
  }
}

export function persistArrangementGroupChanges(changes: ArrangementGroupChange[]) {
  if (changes.length === 0) return
  persistQuietly('save arrangement groups', writeArrangementGroupChanges(changes))
}

export function moveArrangementGroup(
  map: DayArrangementGroupMap,
  oldDate: string,
  newDate: string,
  program: Program,
  bookingCode: string,
) {
  if (oldDate === newDate) return map
  const group = getArrangementGroup(map, oldDate, program, bookingCode)
  if (!group) return map
  const next = withArrangementGroup(
    withArrangementGroup(map, oldDate, program, bookingCode, null),
    newDate,
    program,
    bookingCode,
    group,
  )
  saveArrangementGroupMap(next)
  persistArrangementGroupChanges([
    { date: oldDate, program, bookingCode, group: null },
    { date: newDate, program, bookingCode, group },
  ])
  return next
}
