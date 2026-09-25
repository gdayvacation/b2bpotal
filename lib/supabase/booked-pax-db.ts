import type { BookedPaxMap, BookedPaxSnapshot } from '@/lib/check-in-booked-pax'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { dayBoatPlanKey, type Program } from '@/lib/types'

function bookedPaxRowKey(date: string, program: Program, bookingCode: string) {
  return `${dayBoatPlanKey(date, program)}|${bookingCode}`
}

type BookedPaxRow = {
  date: string
  program: string
  booking_code: string
  adults: number
  children: number
  infants: number
  tour_leaders: number
}

function isProgram(value: unknown): value is Program {
  return value === 'PP' || value === 'James Bond'
}

function asDateString(value: string) {
  return value.slice(0, 10)
}

export async function fetchCheckInBookedPax(): Promise<BookedPaxMap | null> {
  const supabase = getSupabaseBrowserClient()
  const pageSize = 1000
  const next: BookedPaxMap = {}
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('check_in_booked_pax')
      .select('*')
      .range(from, from + pageSize - 1)

    if (error) {
      console.warn(
        '[supabase] check_in_booked_pax unavailable — run supabase/add-check-in-booked-pax.sql',
        error.message,
      )
      return null
    }

    const rows = (data ?? []) as BookedPaxRow[]
    for (const row of rows) {
      if (!isProgram(row.program)) continue
      const code = String(row.booking_code ?? '').trim()
      if (!code) continue
      next[bookedPaxRowKey(asDateString(row.date), row.program, code)] = {
        adults: Math.max(0, Math.floor(Number(row.adults) || 0)),
        children: Math.max(0, Math.floor(Number(row.children) || 0)),
        infants: Math.max(0, Math.floor(Number(row.infants) || 0)),
        tourLeaders: Math.max(0, Math.floor(Number(row.tour_leaders) || 0)),
      }
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  return next
}

export async function upsertCheckInBookedPax(
  date: string,
  program: Program,
  bookingCode: string,
  snapshot: BookedPaxSnapshot,
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('check_in_booked_pax').upsert({
    date,
    program,
    booking_code: bookingCode,
    adults: snapshot.adults,
    children: snapshot.children,
    infants: snapshot.infants,
    tour_leaders: snapshot.tourLeaders,
  })
  if (error) {
    throw new Error(`upsert check-in booked pax: ${error.message}`)
  }
}

export async function pushCheckInBookedPax(map: BookedPaxMap) {
  const rows: BookedPaxRow[] = []
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
  if (rows.length === 0) return

  const supabase = getSupabaseBrowserClient()
  const chunkSize = 500
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const { error } = await supabase.from('check_in_booked_pax').upsert(chunk)
    if (error) throw new Error(`push check-in booked pax: ${error.message}`)
  }
}
