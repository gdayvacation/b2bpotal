import {
  type BookedPaxMap,
  type BookedPaxSnapshot,
  bookedPaxKey,
} from '@/lib/check-in-booked-pax'
import type { CheckInEnrollment } from '@/lib/check-in-enrollment'
import { isCheckInServiceKind, type CheckInServiceLine } from '@/lib/check-in-services'
import { PORTAL_TIMEZONE } from '@/lib/format'
import type { InvoiceDocument, InvoiceItem, InvoiceKind, InvoiceLineKind, InvoiceStatus } from '@/lib/invoice'
import { parsePaymentChannel } from '@/lib/invoice'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBackupClient } from '@/lib/supabase/backup-client'
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
  notes: Record<string, string>
  pickupNoShows: BookedPaxMap
  ownArrivals: BookedPaxMap
  jobOrderActions: Record<string, string>
  bookedPax: BookedPaxMap
  boats: Record<string, string>
  vans: Record<string, string>
  invoices: InvoiceDocument[]
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
  late_date_change?: boolean | null
  late_cancel?: boolean | null
  cancel_fee?: number | null
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

async function fetchAllRows<T>(supabase: SupabaseClient, table: string): Promise<T[]> {
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

async function fetchOptionalRows<T>(
  supabase: SupabaseClient,
  table: string,
): Promise<T[] | null> {
  try {
    return await fetchAllRows<T>(supabase, table)
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
    lateDateChange: row.late_date_change === true,
    lateCancel: row.late_cancel === true,
    cancelFee:
      row.cancel_fee == null ? undefined : Math.max(0, Math.floor(Number(row.cancel_fee) || 0)),
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
  const supabase = await getSupabaseBackupClient()
  const [
    bookingRows,
    enrollmentRows,
    attendanceRows,
    paymentRows,
    serviceRows,
    noteRows,
    bookedPaxRows,
    pickupNsRows,
    ownArrivalRows,
    jobOrderRows,
    boatRows,
    vanRows,
    invoiceRows,
    invoiceItemRows,
  ] = await Promise.all([
    fetchAllRows<BookingRow>(supabase, 'bookings'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'check_in_enrollments'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'check_in_attendance'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'check_in_payments'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'check_in_services'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'check_in_notes'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'check_in_booked_pax'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'pickup_no_shows'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'own_arrivals'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'job_order_actions'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'boat_assignments'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'van_assignments'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'invoices'),
    fetchOptionalRows<Record<string, unknown>>(supabase, 'invoice_items'),
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

  const notes: Record<string, string> = {}
  for (const row of noteRows ?? []) {
    if (!isProgram(row.program)) continue
    const bookingCode = String(row.booking_code ?? '').trim()
    const note = String(row.note ?? '').trim()
    if (!bookingCode || !note) continue
    notes[assignmentKey(asDateString(String(row.date ?? '')), row.program, bookingCode)] = note
  }

  function paxMapFromRows(rows: Record<string, unknown>[] | null): BookedPaxMap {
    const next: BookedPaxMap = {}
    for (const row of rows ?? []) {
      if (!isProgram(row.program)) continue
      const bookingCode = String(row.booking_code ?? '').trim()
      if (!bookingCode) continue
      next[assignmentKey(asDateString(String(row.date ?? '')), row.program, bookingCode)] = {
        adults: Math.max(0, Math.floor(Number(row.adults) || 0)),
        children: Math.max(0, Math.floor(Number(row.children) || 0)),
        infants: Math.max(0, Math.floor(Number(row.infants) || 0)),
        tourLeaders: Math.max(0, Math.floor(Number(row.tour_leaders) || 0)),
      }
    }
    return next
  }

  const jobOrderActions: Record<string, string> = {}
  for (const row of jobOrderRows ?? []) {
    if (!isProgram(row.program)) continue
    const bookingCode = String(row.booking_code ?? '').trim()
    const action = String(row.action ?? '').trim()
    if (!bookingCode || !action) continue
    jobOrderActions[assignmentKey(asDateString(String(row.date ?? '')), row.program, bookingCode)] =
      action
  }

  const itemsByInvoice = new Map<string, InvoiceItem[]>()
  for (const row of invoiceItemRows ?? []) {
    const invoiceId = String(row.invoice_id ?? '').trim()
    const id = String(row.id ?? '').trim()
    if (!invoiceId || !id) continue
    const lineKind = String(row.line_kind ?? '')
    const item: InvoiceItem = {
      id,
      invoiceId,
      bookingCode: String(row.booking_code ?? '').trim(),
      travelDate: String(row.travel_date ?? '').slice(0, 10),
      voucherNo: String(row.voucher_no ?? '').trim(),
      description: String(row.description ?? '').trim(),
      adults: Math.max(0, Math.floor(Number(row.adults) || 0)),
      children: Math.max(0, Math.floor(Number(row.children) || 0)),
      infants: Math.max(0, Math.floor(Number(row.infants) || 0)),
      tourLeaders: Math.max(0, Math.floor(Number(row.tour_leaders) || 0)),
      adultPrice: Number(row.adult_price) || 0,
      childPrice: Number(row.child_price) || 0,
      infantPrice: Number(row.infant_price) || 0,
      tourLeaderPrice: Number(row.tour_leader_price) || 0,
      cot: Number(row.cot) || 0,
      amount: Number(row.amount) || 0,
      lineKind: (lineKind as InvoiceLineKind) || 'tour',
      sortOrder: Math.floor(Number(row.sort_order) || 0),
      unit: String(row.unit ?? '').trim(),
    }
    const list = itemsByInvoice.get(invoiceId) ?? []
    list.push(item)
    itemsByInvoice.set(invoiceId, list)
  }

  const invoices: InvoiceDocument[] = []
  for (const row of invoiceRows ?? []) {
    const id = String(row.id ?? '').trim()
    const number = String(row.invoice_no ?? '').trim()
    const kind = row.kind === 'billing_note' ? 'billing_note' : 'invoice'
    const status =
      row.status === 'paid' ? 'paid' : row.status === 'partial' ? 'partial' : 'unpaid'
    if (!id || !number) continue
    invoices.push({
      id,
      number,
      kind: kind as InvoiceKind,
      agentSlug: String(row.agent_slug ?? '').trim(),
      agentName: String(row.agent_name ?? '').trim(),
      issueDate: asDateString(String(row.issue_date ?? '')),
      status: status as InvoiceStatus,
      notes: String(row.notes ?? '').trim(),
      grandTotal: Number(row.grand_total) || 0,
      paidAt: row.paid_at ? String(row.paid_at) : null,
      paymentChannel: parsePaymentChannel(row.payment_channel),
      receiptNo: row.receipt_no ? String(row.receipt_no) : null,
      linkedInvoiceIds: [],
      items: (itemsByInvoice.get(id) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
      createdAt: String(row.created_at ?? ''),
      sendToAgent: row.send_to_agent === true,
    })
  }
  invoices.sort((a, b) => b.issueDate.localeCompare(a.issueDate) || a.number.localeCompare(b.number))

  return {
    bookings,
    enrollments,
    attendance,
    paidCodes,
    services,
    notes,
    pickupNoShows: paxMapFromRows(pickupNsRows),
    ownArrivals: paxMapFromRows(ownArrivalRows),
    jobOrderActions,
    bookedPax,
    boats,
    vans,
    invoices,
    syncedAt: formatThaiStamp(),
  }
}
