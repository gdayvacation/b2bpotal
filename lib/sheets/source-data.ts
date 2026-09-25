import {
  type BookedPaxMap,
  type BookedPaxSnapshot,
  bookedPaxKey,
} from '@/lib/check-in-booked-pax'
import type { CheckInEnrollment } from '@/lib/check-in-enrollment'
import { isCheckInServiceKind, type CheckInServiceLine } from '@/lib/check-in-services'
import { PORTAL_TIMEZONE } from '@/lib/format'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  defaultBoatLabel,
  type Booking,
  type CheckInAttendance,
  type Program,
} from '@/lib/types'

export type SheetsEnrollmentRow = CheckInEnrollment & {
  date: string
  program: Program
  bookingCode: string
}

export type SheetsServiceRow = CheckInServiceLine & {
  date: string
  program: Program
  bookingCode: string
}

export type SheetsBackupSource = {
  bookings: Booking[]
  enrollments: SheetsEnrollmentRow[]
  attendance: Record<string, CheckInAttendance>
  paidCodes: Set<string>
  services: SheetsServiceRow[]
  bookedPax: BookedPaxMap
  boats: Record<string, string>
  vans: Record<string, string>
  syncedAt: string
}

type BookingRow = {
  code: string
  agent_slug: string
  agent_name: string
  agent_ref: string
  program: Program
  date: string
  park_fee: Booking['parkFee']
  canoe: Booking['canoe']
  adults: number
  children: number
  infants: number
  tour_leaders: number
  lead_guest: string
  pickup_zone: string
  pickup_hotel: string
  room_number: string
  note: string
  cash_on_tour?: string | null
  transfer_extra_charge?: string | null
  private_transfer_vehicle?: string | null
  private_transfer_price?: string | null
  private_driver_name?: string | null
  private_driver_phone?: string | null
  pickup_time: string
  status: Booking['status']
  late_change_fee?: number | null
}

function isProgram(value: unknown): value is Program {
  return value === 'PP' || value === 'James Bond'
}

function asDateString(value: string) {
  return String(value ?? '').slice(0, 10)
}

export function assignmentKey(date: string, program: Program, bookingCode: string) {
  return bookedPaxKey(date, program, bookingCode)
}

async function fetchAllRows<T>(table: string): Promise<T[]> {
  const supabase = getSupabaseBrowserClient()
  const pageSize = 1000
  const all: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }

  return all
}

async function fetchOptionalRows<T>(table: string): Promise<T[] | null> {
  try {
    return await fetchAllRows<T>(table)
  } catch (error) {
    console.warn(`[sheets] ${table} unavailable`, error)
    return null
  }
}

function mapBooking(row: BookingRow): Booking {
  return {
    code: row.code,
    agentSlug: row.agent_slug,
    agentName: row.agent_name,
    agentRef: row.agent_ref ?? '',
    program: row.program,
    date: asDateString(row.date),
    parkFee: row.park_fee,
    canoe: row.canoe,
    adults: row.adults,
    children: row.children,
    infants: row.infants,
    tourLeaders: row.tour_leaders,
    leadGuest: row.lead_guest,
    pickupZone: row.pickup_zone,
    pickupHotel: row.pickup_hotel,
    roomNumber: row.room_number ?? '',
    note: row.note ?? '',
    cashOnTour: row.cash_on_tour ?? '',
    transferExtraCharge: row.transfer_extra_charge ?? '',
    privateTransferVehicle:
      row.private_transfer_vehicle === 'Car' || row.private_transfer_vehicle === 'Van'
        ? row.private_transfer_vehicle
        : '',
    privateTransferPrice: row.private_transfer_price ?? '',
    privateDriverName: row.private_driver_name ?? '',
    privateDriverPhone: row.private_driver_phone ?? '',
    pickupTime: row.pickup_time,
    status: row.status,
    lateChangeFee: Math.max(0, Math.floor(Number(row.late_change_fee) || 0)),
  }
}

function formatThaiStamp(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: PORTAL_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
}

export async function loadSheetsBackupSource(): Promise<SheetsBackupSource> {
  const [
    bookingRows,
    enrollmentRows,
    attendanceRows,
    paymentRows,
    serviceRows,
    bookedPaxRows,
    boatRows,
    vanRows,
  ] = await Promise.all([
    fetchAllRows<BookingRow>('bookings'),
    fetchOptionalRows<Record<string, unknown>>('check_in_enrollments'),
    fetchOptionalRows<Record<string, unknown>>('check_in_attendance'),
    fetchOptionalRows<Record<string, unknown>>('check_in_payments'),
    fetchOptionalRows<Record<string, unknown>>('check_in_services'),
    fetchOptionalRows<Record<string, unknown>>('check_in_booked_pax'),
    fetchOptionalRows<Record<string, unknown>>('boat_assignments'),
    fetchOptionalRows<Record<string, unknown>>('van_assignments'),
  ])

  const bookings = bookingRows.map(mapBooking).sort((a, b) => {
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    return a.code.localeCompare(b.code)
  })

  const enrollments: SheetsEnrollmentRow[] = []
  for (const row of enrollmentRows ?? []) {
    if (!isProgram(row.program)) continue
    const date = asDateString(String(row.date ?? ''))
    const bookingCode = String(row.booking_code ?? '').trim()
    const id = String(row.id ?? '').trim()
    const firstName = String(row.first_name ?? '').trim()
    const checkedInAt = String(row.checked_in_at ?? '').trim()
    const scope = row.scope === 'group' ? 'group' : row.scope === 'one' ? 'one' : null
    if (!date || !bookingCode || !id || !firstName || !scope || !checkedInAt) continue
    enrollments.push({
      id,
      firstName,
      lastName: String(row.last_name ?? '').trim(),
      nationality: String(row.nationality ?? '').trim(),
      birthday: String(row.birthday ?? '').trim(),
      passportNumber: String(row.passport_number ?? '').trim(),
      scope,
      seats: Math.max(1, Math.floor(Number(row.seats) || 1)),
      checkedInAt,
      date,
      program: row.program,
      bookingCode,
    })
  }
  enrollments.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    return a.checkedInAt.localeCompare(b.checkedInAt)
  })

  const attendance: Record<string, CheckInAttendance> = {}
  for (const row of attendanceRows ?? []) {
    if (!isProgram(row.program)) continue
    const status = row.status === 'checked' || row.status === 'no-show' ? row.status : null
    const bookingCode = String(row.booking_code ?? '').trim()
    if (!status || !bookingCode) continue
    attendance[assignmentKey(asDateString(String(row.date ?? '')), row.program, bookingCode)] =
      status
  }

  const paidCodes = new Set<string>()
  for (const row of paymentRows ?? []) {
    if (!isProgram(row.program) || row.status !== 'paid') continue
    const seatKey = String(row.seat_key ?? '').trim()
    if (!seatKey || seatKey.endsWith(':ticket')) continue
    const bookingCode = seatKey.includes(':') ? seatKey.slice(0, seatKey.indexOf(':')) : seatKey
    if (!bookingCode) continue
    paidCodes.add(assignmentKey(asDateString(String(row.date ?? '')), row.program, bookingCode))
  }

  const services: SheetsServiceRow[] = []
  for (const row of serviceRows ?? []) {
    if (!isProgram(row.program) || !isCheckInServiceKind(row.kind)) continue
    const bookingCode = String(row.booking_code ?? '').trim()
    const id = String(row.id ?? '').trim()
    if (!bookingCode || !id) continue
    services.push({
      id,
      kind: row.kind,
      people: Math.max(1, Math.floor(Number(row.people) || 1)),
      pricePerPerson: Math.max(0, Math.floor(Number(row.price_per_person) || 0)),
      paid: row.paid === true,
      date: asDateString(String(row.date ?? '')),
      program: row.program,
      bookingCode,
    })
  }

  const bookedPax: BookedPaxMap = {}
  for (const row of bookedPaxRows ?? []) {
    if (!isProgram(row.program)) continue
    const bookingCode = String(row.booking_code ?? '').trim()
    if (!bookingCode) continue
    bookedPax[assignmentKey(asDateString(String(row.date ?? '')), row.program, bookingCode)] = {
      adults: Math.max(0, Math.floor(Number(row.adults) || 0)),
      children: Math.max(0, Math.floor(Number(row.children) || 0)),
      infants: Math.max(0, Math.floor(Number(row.infants) || 0)),
      tourLeaders: Math.max(0, Math.floor(Number(row.tour_leaders) || 0)),
    } satisfies BookedPaxSnapshot
  }

  const boats: Record<string, string> = {}
  for (const row of boatRows ?? []) {
    if (!isProgram(row.program)) continue
    const bookingCode = String(row.booking_code ?? '').trim()
    const boatNumber = Math.floor(Number(row.boat_number) || 0)
    if (!bookingCode || boatNumber < 1) continue
    boats[assignmentKey(asDateString(String(row.date ?? '')), row.program, bookingCode)] =
      defaultBoatLabel(boatNumber)
  }

  const vanLists: Record<string, number[]> = {}
  for (const row of vanRows ?? []) {
    if (!isProgram(row.program)) continue
    const bookingCode = String(row.booking_code ?? '').trim()
    const vanNumber = Math.floor(Number(row.van_number) || 0)
    if (!bookingCode || vanNumber < 1) continue
    const key = assignmentKey(asDateString(String(row.date ?? '')), row.program, bookingCode)
    const list = vanLists[key] ?? []
    if (!list.includes(vanNumber)) list.push(vanNumber)
    vanLists[key] = list
  }
  const vans: Record<string, string> = {}
  for (const [key, list] of Object.entries(vanLists)) {
    vans[key] = list
      .slice()
      .sort((a, b) => a - b)
      .join(', ')
  }

  return {
    bookings,
    enrollments,
    attendance,
    paidCodes,
    services,
    bookedPax,
    boats,
    vans,
    syncedAt: formatThaiStamp(),
  }
}
