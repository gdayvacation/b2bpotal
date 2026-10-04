import { addDaysISO, todayISO } from '@/lib/format'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { selectAllPaged } from '@/lib/supabase/paged'
import {
  DEFAULT_BOOKING_CUTOFFS,
  normalizeBeforeDays,
  normalizeCutoffTime,
  normalizeDateChangeFee,
  type BookingCutoffSettings,
} from '@/lib/booking-cutoffs'
import type {
  CheckInEnrollment,
  DayCheckInEnrollmentMap,
} from '@/lib/check-in-enrollment'
import type { DayCheckInPaymentMap } from '@/lib/check-in-payment'
import {
  adoptLegacyPaymentsAsTickets,
  bookingCodeFromTicketSeatKey,
  checkInTicketSeatKey,
  isCheckInTicketSeatKey,
  markCheckInTicketMigrationDone,
  type DayCheckInTicketMap,
} from '@/lib/check-in-ticket'
import {
  isCheckInServiceKind,
  type CheckInServiceLine,
  type DayCheckInServiceMap,
} from '@/lib/check-in-services'
import {
  DEFAULT_SEQUENCE_START,
  PROGRAM_SEQUENCE_BOOKING_KEY,
  type DayCheckInSequenceMap,
} from '@/lib/check-in-sequence'
import type { DayCheckInGuestEditMap } from '@/lib/check-in-guest-edit'
import type { DayCheckInNoteMap } from '@/lib/check-in-notes'
import { formatGroupGuideNames, type DayCheckInGroupGuideMap } from '@/lib/check-in-group-guide'
import {
  DEFAULT_DRIVERS,
  mergeDriverRoster,
  type DriverRosterEntry,
} from '@/lib/driver-roster'
import type {
  Agent,
  AgentStatus,
  Availability,
  Booking,
  BookingClosure,
  BookingEvent,
  BookingEventType,
  BookingActorRole,
  CheckInAttendance,
  DayBoatPlan,
  DayCheckInAttendanceMap,
  DayVehiclePlan,
  FleetVan,
  Hotel,
  PickupZone,
  Program,
  VanMeta,
  VanSplit,
} from '@/lib/types'
import {
  DEFAULT_BOAT_CAPACITY,
  dayBoatPlanKey,
  dayVehiclePlanKey,
  emptyDayBoatPlan,
  emptyDayVehiclePlan,
  hydrateDayBoatPlan,
  isSpecialTransferKind,
  packVanPlate,
  unpackVanPlate,
  normalizeBoatCapacities,
  normalizeBoatGuides,
  normalizeBoatKinds,
  normalizeBoatLabels,
  canonicalVanOutsourceCompany,
  normalizeChargeAmount,
  compactBoatAssignment,
  normalizeBoatAssignment,
  persistBoatNames,
} from '@/lib/types'

type AgentRow = {
  slug: string
  name: string
  country: string
  status: AgentStatus
}

type ZoneRow = {
  name: string
  time: string
  pending: boolean
  sort_order: number
}

type HotelRow = {
  id: string
  name: string
  zone_name: string | null
  active: boolean
  extra_charge_transfer?: string | null
  sort_order: number
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
  original_adults?: number | null
  original_children?: number | null
  original_infants?: number | null
  original_tour_leaders?: number | null
  moved_out_adults?: number | null
  moved_out_children?: number | null
  moved_out_infants?: number | null
  moved_out_tour_leaders?: number | null
  moved_from_code?: string | null
  moved_from_date?: string | null
  no_show_date_move?: boolean | null
  updated_at?: string | null
}

type AvailabilityRow = {
  date: string
  pp_capacity: number
  james_bond_capacity: number
}

type BoatPlanRow = {
  date: string
  program: Program
  capacity_1: number
  capacity_2: number
  capacity_3: number
  capacities?: number[] | string | null
  boat_names?: string[] | string | null
  boat_kinds?: Array<string> | string | null
  boat_labels?: string[] | string | null
  boat_guides?: unknown
  revision?: number | null
}

type BoatAssignmentRow = {
  date: string
  program: Program
  booking_code: string
  boat_number: number
  pax?: number | null
}

type VehiclePlanRow = {
  date: string
  program: Program
  van_capacity: number
  revision?: number | null
}

type VanMetaRow = {
  date: string
  program: Program
  van_number: number
  plate: string
  driver: string
  phone?: string | null
  capacity?: number | null
  outsourced?: boolean | null
  outsource_company?: string | null
  special_kind?: string | null
  transfer_in?: boolean | null
  transfer_out?: boolean | null
  charge_amount?: number | null
}

type FleetVanRow = {
  van_number: number
  plate: string
  driver: string
  phone: string
}

type DriverRow = {
  name: string
  phone: string
  plate: string
}

type VanAssignmentRow = {
  date: string
  program: Program
  booking_code: string
  van_number: number
  pax: number
  sort_order?: number | null
}

type BookingCutoffRow = {
  id: string
  timezone: string
  book_before_days: number
  book_until_time: string
  cancel_before_days: number
  cancel_until_time: string
  late_fee_from_time?: string | null
  date_change_fee_thb?: number | null
}

type BookingClosureRow = {
  date: string
  program: Program
  reason: string | null
}

export type PortalSnapshot = {
  agents: Agent[]
  zones: PickupZone[]
  hotels: Hotel[]
  bookings: Booking[]
  availability: Availability[]
  dayBoatPlans: Record<string, DayBoatPlan>
  dayVehiclePlans: Record<string, DayVehiclePlan>
  fleetVans: FleetVan[]
  drivers: DriverRosterEntry[]
  bookingCutoffs: BookingCutoffSettings
  bookingClosures: BookingClosure[]
}

function asDateString(value: string) {
  return value.slice(0, 10)
}

/** How far back ops pages load on open (pickup / vans / boats / check-in). */
export const OPS_BOOKING_LOOKBACK_DAYS = 30

/** Boat, van, check-in, and seat rows kept live for marina / admin tablets. */
export const OPS_BOARD_LOOKBACK_DAYS = 3
export const OPS_BOARD_FORWARD_DAYS = 7
/** Accounting tablets keep a longer lookback so recent bills still have plans and check-in. */
export const ACCOUNTING_BOARD_LOOKBACK_DAYS = 14

export type BoardDateWindow = { from: string; to: string }

/** Live cache window. Accounting looks back 14 days; other staff look back 3. Both go 7 days ahead. */
export function boardPlanWindow(role: string, now: Date = new Date()): BoardDateWindow {
  const lookback = role === 'accounting' ? ACCOUNTING_BOARD_LOOKBACK_DAYS : OPS_BOARD_LOOKBACK_DAYS
  const today = todayISO(now)
  return {
    from: addDaysISO(today, -lookback),
    to: addDaysISO(today, OPS_BOARD_FORWARD_DAYS),
  }
}

/** Agent booking links only keep a short history. Future trips are still included. */
export const PARTNER_BOOKING_LOOKBACK_DAYS = 7

/** Inclusive start date for the default operational booking window. */
export function operationalBookingsFromDate() {
  return addDaysISO(todayISO(), -OPS_BOOKING_LOOKBACK_DAYS)
}

/** Inclusive start date for an agent tab: 7 days back, plus every future trip. */
export function partnerBookingsFromDate() {
  return addDaysISO(todayISO(), -PARTNER_BOOKING_LOOKBACK_DAYS)
}

/** PostgREST defaults to max 1000 rows — page until exhausted. */
async function fetchAllPaged<T>(label: string, query: (from: number, to: number) => PromiseLike<{
  data: T[] | null
  error: { message: string } | null
}>): Promise<T[]> {
  const pageSize = 1000
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1)
    await assertOk(label, error, data)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return all
}

/** Date-bounded booking fetch (paged). Omit `toDate` for open-ended future. */
export async function fetchBookingsInDateRange(
  fromDate: string,
  toDate?: string,
): Promise<Booking[]> {
  const supabase = getSupabaseBrowserClient()
  const from = asDateString(fromDate)
  const to = toDate ? asDateString(toDate) : undefined
  const data = await fetchAllPaged<BookingRow>('bookings', (start, end) => {
    let query = supabase.from('bookings').select('*').gte('date', from)
    if (to) query = query.lte('date', to)
    return query
      .order('date', { ascending: false })
      .order('code', { ascending: true })
      .range(start, end)
  })
  return data.map(mapBooking)
}

/**
 * Cheap poll: only bookings changed since `sinceIso` (uses bookings.updated_at, maintained by a
 * DB trigger). Bookings are never hard-deleted by the app, so no full table is needed per poll.
 * Returns the newest updated_at seen so the caller can advance its cursor.
 */
export async function fetchBookingsChangedSince(
  fromDate: string,
  sinceIso: string,
): Promise<{ bookings: Booking[]; latestUpdatedAt: string | null }> {
  const supabase = getSupabaseBrowserClient()
  const from = asDateString(fromDate)
  const data = await fetchAllPaged<BookingRow>('bookings', (start, end) =>
    supabase
      .from('bookings')
      .select('*')
      .gte('date', from)
      .gt('updated_at', sinceIso)
      .order('updated_at', { ascending: true })
      .order('code', { ascending: true })
      .range(start, end),
  )
  let latest: string | null = null
  for (const row of data) {
    if (row.updated_at && (!latest || row.updated_at > latest)) latest = row.updated_at
  }
  return { bookings: data.map(mapBooking), latestUpdatedAt: latest }
}

/** Full ops-window fetch that also returns the updated_at cursor for incremental polls. */
export async function fetchBookingsWithCursor(
  fromDate: string,
): Promise<{ bookings: Booking[]; latestUpdatedAt: string | null }> {
  const supabase = getSupabaseBrowserClient()
  const from = asDateString(fromDate)
  const data = await fetchAllPaged<BookingRow>('bookings', (start, end) =>
    supabase
      .from('bookings')
      .select('*')
      .gte('date', from)
      .order('date', { ascending: false })
      .order('code', { ascending: true })
      .range(start, end),
  )
  let latest: string | null = null
  for (const row of data) {
    if (row.updated_at && (!latest || row.updated_at > latest)) latest = row.updated_at
  }
  return { bookings: data.map(mapBooking), latestUpdatedAt: latest }
}

/**
 * Load one booking by code (any date). Used by the guest QR page so it never depends on
 * the bulk ops snapshot (30-day window / session timing) to find its own booking.
 */
export async function fetchBookingByCode(code: string): Promise<Booking | null> {
  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('code', code.trim())
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapBooking(data as BookingRow) : null
}

/**
 * Minimal portal snapshot for a guest QR scan.
 *
 * Loads only the guest's single booking and the boat/vehicle plans for that
 * booking's tour date (from DB — reflects any admin date-move).  Agents, zones,
 * hotels, availability, fleet-vans, drivers, cutoffs and closures are empty/
 * default because the guest check-in UI does not use them.
 *
 * Compared with loadPortalSnapshot() this reduces per-guest requests from
 * ~15 paged queries across 30 days to ~6 single-day queries, so 200 concurrent
 * guests generate a fraction of the DB and Egress load.
 */
export async function loadGuestPortalSnapshot(
  bookingCode: string,
  bookingDate: string,
): Promise<PortalSnapshot> {
  const empty: PortalSnapshot = {
    agents: [],
    zones: [],
    hotels: [],
    bookings: [],
    availability: [],
    dayBoatPlans: {},
    dayVehiclePlans: {},
    fleetVans: [],
    drivers: [],
    bookingCutoffs: { ...DEFAULT_BOOKING_CUTOFFS },
    bookingClosures: [],
  }

  const booking = await fetchBookingByCode(bookingCode)
  if (!booking) return empty

  // Use date from DB (reflects any admin date-move, not stale JWT claim).
  const dateStr = booking.date

  const supabase = getSupabaseBrowserClient()
  const [boatPlansRes, boatAssignRes, vehiclePlansRes, vanMetaRes, vanAssignRes] =
    await Promise.all([
      supabase.from('day_boat_plans').select('*').eq('date', dateStr).order('program'),
      supabase.from('boat_assignments').select('*').eq('date', dateStr).order('booking_code'),
      supabase.from('day_vehicle_plans').select('*').eq('date', dateStr).order('program'),
      supabase.from('van_meta').select('*').eq('date', dateStr),
      supabase.from('van_assignments').select('*').eq('date', dateStr).order('id'),
    ])

  return {
    ...empty,
    bookings: [booking],
    dayBoatPlans: buildBoatPlans(
      (boatPlansRes.data ?? []) as BoatPlanRow[],
      (boatAssignRes.data ?? []) as BoatAssignmentRow[],
    ),
    dayVehiclePlans: buildVehiclePlans(
      (vehiclePlansRes.data ?? []) as VehiclePlanRow[],
      (vanMetaRes.data ?? []) as VanMetaRow[],
      (vanAssignRes.data ?? []) as VanAssignmentRow[],
    ),
  }
}

/**
 * Portal snapshot for an agent booking link.
 *
 * Agents need their own bookings (RLS already scopes rows to their agency),
 * from 7 days ago through every future trip, plus seat capacity and the
 * pickup catalogs. They do not render boat plans, van plans, fleet, or drivers.
 */
export async function loadPartnerPortalSnapshot(): Promise<PortalSnapshot> {
  const supabase = getSupabaseBrowserClient()
  const fromDate = partnerBookingsFromDate()
  const { data: sessionData } = await supabase.auth.getSession()
  const agentSlug = String(sessionData.session?.user.app_metadata?.agent_slug ?? '').trim()
  const agentsRequest = agentSlug
    ? supabase.from('agents').select('*').eq('slug', agentSlug)
    : supabase.from('agents').select('*').order('name')
  const [agentsRes, zonesRes, hotelsRes, bookings, settings] = await Promise.all([
    agentsRequest,
    supabase.from('pickup_zones').select('*').order('sort_order'),
    supabase.from('hotels').select('*').order('name'),
    fetchBookingsInDateRange(fromDate),
    fetchAvailabilitySettings(fromDate),
  ])

  await assertOk('agents', agentsRes.error, agentsRes.data)
  await assertOk('pickup_zones', zonesRes.error, zonesRes.data)

  let hotels: Hotel[] = []
  if (hotelsRes.error) {
    console.warn(
      '[supabase] hotels table unavailable — run supabase/add-hotels.sql',
      hotelsRes.error.message,
    )
  } else {
    hotels = (hotelsRes.data as HotelRow[]).map(mapHotel)
  }

  return {
    agents: (agentsRes.data as AgentRow[]).map(mapAgent),
    zones: (zonesRes.data as ZoneRow[]).map(mapZone),
    hotels,
    bookings,
    availability: settings.availability,
    dayBoatPlans: {},
    dayVehiclePlans: {},
    fleetVans: [],
    drivers: [],
    bookingCutoffs: settings.bookingCutoffs,
    bookingClosures: settings.bookingClosures,
  }
}

function mapAgent(row: AgentRow): Agent {
  return {
    slug: row.slug,
    name: row.name,
    country: row.country,
    status: row.status,
  }
}

function mapZone(row: ZoneRow): PickupZone {
  return {
    name: row.name,
    time: row.time,
    pending: row.pending,
  }
}

function mapHotel(row: HotelRow): Hotel {
  return {
    id: row.id,
    name: row.name,
    zoneName: row.zone_name,
    active: row.active,
    extraChargeTransfer: row.extra_charge_transfer ?? '',
  }
}

function mapBooking(row: BookingRow): Booking {
  const agentSlug = row.agent_slug ?? ''
  return {
    code: row.code ?? '',
    agentSlug,
    agentName: row.agent_name ?? agentSlug,
    agentRef: row.agent_ref ?? '',
    program: row.program,
    date: asDateString(row.date),
    parkFee: row.park_fee,
    canoe: row.canoe,
    adults: Number(row.adults) || 0,
    children: Number(row.children) || 0,
    infants: Number(row.infants) || 0,
    tourLeaders: Number(row.tour_leaders) || 0,
    leadGuest: row.lead_guest ?? '',
    pickupZone: row.pickup_zone,
    pickupHotel: row.pickup_hotel ?? '',
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
    pickupTime: row.pickup_time ?? '',
    status: row.status,
    lateChangeFee: Math.max(0, Math.floor(Number(row.late_change_fee) || 0)),
    lateDateChange: row.late_date_change === true,
    noShowDateMove: row.no_show_date_move === true,
    lateCancel: row.late_cancel === true,
    cancelFee:
      row.cancel_fee == null ? undefined : Math.max(0, Math.floor(Number(row.cancel_fee) || 0)),
    originalPax: mapOriginalPax(row),
    movedOutPax: mapMovedOutPax(row),
    movedFrom: row.moved_from_code
      ? { code: row.moved_from_code, date: asDateString(row.moved_from_date ?? '') }
      : null,
  }
}

function mapMovedOutPax(row: BookingRow): Booking['movedOutPax'] {
  const count = (value: number | null | undefined) =>
    Math.max(0, Math.floor(Number(value) || 0))
  const pax = {
    adults: count(row.moved_out_adults),
    children: count(row.moved_out_children),
    infants: count(row.moved_out_infants),
    tourLeaders: count(row.moved_out_tour_leaders),
  }
  return pax.adults + pax.children + pax.infants + pax.tourLeaders > 0 ? pax : null
}

/** Date-move columns for inserts. Empty when nothing moved (keeps old DBs working). */
function dateMoveColumns(booking: Booking) {
  const out = booking.movedOutPax
  return {
    ...(out
      ? {
          moved_out_adults: out.adults,
          moved_out_children: out.children,
          moved_out_infants: out.infants,
          moved_out_tour_leaders: out.tourLeaders,
        }
      : {}),
    ...(booking.movedFrom
      ? { moved_from_code: booking.movedFrom.code, moved_from_date: booking.movedFrom.date }
      : {}),
  }
}

function mapOriginalPax(row: BookingRow): Booking['originalPax'] {
  if (
    row.original_adults == null &&
    row.original_children == null &&
    row.original_infants == null &&
    row.original_tour_leaders == null
  ) {
    return null
  }
  const count = (value: number | null | undefined) =>
    Math.max(0, Math.floor(Number(value) || 0))
  return {
    adults: count(row.original_adults),
    children: count(row.original_children),
    infants: count(row.original_infants),
    tourLeaders: count(row.original_tour_leaders),
  }
}

/** Original-pax columns for writes. Empty when the booking was never reduced (keeps old DBs working). */
function originalPaxColumns(booking: Booking) {
  const pax = booking.originalPax
  if (!pax) return {}
  return {
    original_adults: pax.adults,
    original_children: pax.children,
    original_infants: pax.infants,
    original_tour_leaders: pax.tourLeaders,
  }
}

function bookingToRow(booking: Booking): BookingRow {
  return {
    ...originalPaxColumns(booking),
    ...dateMoveColumns(booking),
    code: booking.code,
    agent_slug: booking.agentSlug,
    agent_name: booking.agentName,
    agent_ref: booking.agentRef ?? '',
    program: booking.program,
    date: booking.date,
    park_fee: booking.parkFee,
    canoe: booking.canoe,
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    tour_leaders: booking.tourLeaders,
    lead_guest: booking.leadGuest,
    pickup_zone: booking.pickupZone,
    pickup_hotel: booking.pickupHotel,
    room_number: booking.roomNumber ?? '',
    note: booking.note ?? '',
    cash_on_tour: booking.cashOnTour ?? '',
    transfer_extra_charge: booking.transferExtraCharge ?? '',
    private_transfer_vehicle: booking.privateTransferVehicle ?? '',
    private_transfer_price: booking.privateTransferPrice ?? '',
    private_driver_name: booking.privateDriverName ?? '',
    private_driver_phone: booking.privateDriverPhone ?? '',
    pickup_time: booking.pickupTime,
    status: booking.status,
    late_change_fee: Math.max(0, Math.floor(Number(booking.lateChangeFee) || 0)),
    late_date_change: booking.lateDateChange === true,
    no_show_date_move: booking.noShowDateMove === true,
    late_cancel: booking.lateCancel === true,
    cancel_fee: booking.cancelFee == null ? null : Math.max(0, Math.floor(booking.cancelFee)),
  }
}

function mapAvailability(row: AvailabilityRow): Availability {
  return {
    date: asDateString(row.date),
    ppCapacity: row.pp_capacity,
    jamesBondCapacity: row.james_bond_capacity,
  }
}

function mapBookingCutoffs(row: BookingCutoffRow | null | undefined): BookingCutoffSettings {
  if (!row) return { ...DEFAULT_BOOKING_CUTOFFS }
  const bookUntil = normalizeCutoffTime(row.book_until_time) ?? DEFAULT_BOOKING_CUTOFFS.bookUntilTime
  const cancelUntil =
    normalizeCutoffTime(row.cancel_until_time) ?? DEFAULT_BOOKING_CUTOFFS.cancelUntilTime
  const lateFeeFrom =
    normalizeCutoffTime(row.late_fee_from_time ?? '') ?? DEFAULT_BOOKING_CUTOFFS.lateFeeFromTime
  const dateChangeFee = Number.isFinite(Number(row.date_change_fee_thb))
    ? Math.max(0, Math.min(20_000, Math.floor(Number(row.date_change_fee_thb))))
    : DEFAULT_BOOKING_CUTOFFS.dateChangeFeePerPerson
  return {
    timezone: DEFAULT_BOOKING_CUTOFFS.timezone,
    bookBeforeDays: normalizeBeforeDays(row.book_before_days),
    bookUntilTime: bookUntil,
    cancelBeforeDays: normalizeBeforeDays(row.cancel_before_days),
    cancelUntilTime: cancelUntil,
    lateFeeFromTime: lateFeeFrom,
    dateChangeFeePerPerson: dateChangeFee,
  }
}

function mapBookingClosure(row: BookingClosureRow): BookingClosure {
  return {
    date: asDateString(row.date),
    program: row.program,
    reason: (row.reason ?? '').trim(),
  }
}

function parseBoatCapacities(plan: BoatPlanRow): number[] {
  const raw = plan.capacities
  let fromJson: number[] | null = null
  if (Array.isArray(raw)) {
    fromJson = raw.map((value) => Number(value))
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) fromJson = parsed.map((value) => Number(value))
    } catch {
      fromJson = null
    }
  }
  if (fromJson && fromJson.length > 0) return normalizeBoatCapacities(fromJson)
  return normalizeBoatCapacities([plan.capacity_1, plan.capacity_2, plan.capacity_3])
}

function parseBoatNames(plan: BoatPlanRow, boatCount: number): string[] {
  const raw = plan.boat_names
  let fromJson: string[] | null = null
  if (Array.isArray(raw)) {
    fromJson = raw.map((value) => String(value ?? ''))
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) fromJson = parsed.map((value) => String(value ?? ''))
    } catch {
      fromJson = null
    }
  }
  const count = Math.max(1, boatCount)
  const source = fromJson ?? []
  return Array.from({ length: count }, (_, index) => String(source[index] ?? ''))
}

function parseJsonStringArray(raw: string[] | string | null | undefined): string[] | null {
  if (Array.isArray(raw)) return raw.map((value) => String(value ?? ''))
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) return parsed.map((value) => String(value ?? ''))
    } catch {
      return null
    }
  }
  return null
}

function parseBoatGuides(plan: BoatPlanRow, boatCount: number) {
  const raw = plan.boat_guides
  let fromJson: unknown[] | null = null
  if (Array.isArray(raw)) {
    fromJson = raw
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) fromJson = parsed
    } catch {
      fromJson = null
    }
  }
  const mapped = (fromJson ?? []).map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return { guideName: '', guidePhone: '', assistantName: '', assistantPhone: '' }
    }
    const row = entry as Record<string, unknown>
    return {
      guideName: String(row.guideName ?? row.guide_name ?? ''),
      guidePhone: String(row.guidePhone ?? row.guide_phone ?? ''),
      assistantName: String(row.assistantName ?? row.assistant_name ?? ''),
      assistantPhone: String(row.assistantPhone ?? row.assistant_phone ?? ''),
    }
  })
  return normalizeBoatGuides(mapped, boatCount)
}

function buildBoatPlans(
  plans: BoatPlanRow[],
  assignments: BoatAssignmentRow[],
): Record<string, DayBoatPlan> {
  const next: Record<string, DayBoatPlan> = {}
  for (const plan of plans) {
    const date = asDateString(plan.date)
    const key = dayBoatPlanKey(date, plan.program)
    const capacities = parseBoatCapacities(plan)
    const revision = Math.max(0, Math.floor(Number(plan.revision) || 0))
    next[key] = hydrateDayBoatPlan({
      date,
      program: plan.program,
      capacities,
      names: parseBoatNames(plan, capacities.length),
      labels: normalizeBoatLabels(parseJsonStringArray(plan.boat_labels), capacities.length),
      kinds: normalizeBoatKinds(parseJsonStringArray(plan.boat_kinds), capacities.length),
      guides: parseBoatGuides(plan, capacities.length),
      assignments: {},
      revision,
    })
  }
  for (const row of assignments) {
    const date = asDateString(row.date)
    const key = dayBoatPlanKey(date, row.program)
    const plan = next[key] ?? emptyDayBoatPlan(date, row.program)
    const boat = Math.max(1, Math.floor(Number(row.boat_number) || 0))
    if (boat < 1) {
      next[key] = plan
      continue
    }
    const pax = Number(row.pax)
    const amount = Number.isFinite(pax) && pax > 0 ? Math.floor(pax) : 0
    const prev = plan.assignments[row.booking_code]
    if (prev == null) {
      plan.assignments[row.booking_code] = amount > 0 ? [{ boat, pax: amount }] : boat
    } else {
      const legs = normalizeBoatAssignment(prev)
      const found = legs.find((leg) => leg.boat === boat)
      if (found) found.pax = Math.max(found.pax, amount)
      else legs.push({ boat, pax: amount })
      const withPax = legs.filter((leg) => leg.pax > 0)
      plan.assignments[row.booking_code] =
        withPax.length > 0 ? (compactBoatAssignment(withPax) ?? boat) : compactBoatAssignment(legs) ?? boat
    }
    next[key] = plan
  }
  return next
}

function buildVehiclePlans(
  plans: VehiclePlanRow[],
  metas: VanMetaRow[],
  assignments: VanAssignmentRow[],
): Record<string, DayVehiclePlan> {
  const next: Record<string, DayVehiclePlan> = {}
  for (const plan of plans) {
    const date = asDateString(plan.date)
    const key = dayVehiclePlanKey(date, plan.program)
    next[key] = {
      date,
      program: plan.program,
      vanCapacity: plan.van_capacity,
      assignments: {},
      vanMeta: {},
      revision: Math.max(0, Math.floor(Number(plan.revision) || 0)),
    }
  }
  for (const meta of metas) {
    const date = asDateString(meta.date)
    const key = dayVehiclePlanKey(date, meta.program)
    const plan = next[key] ?? emptyDayVehiclePlan(date, meta.program)
    const capacity = Number(meta.capacity)
    const charge = Number(meta.charge_amount)
    const identity = unpackVanPlate(meta.plate ?? '')
    plan.vanMeta[String(meta.van_number)] = {
      plate: identity.plate,
      ...(identity.label ? { label: identity.label } : {}),
      driver: meta.driver ?? '',
      phone: meta.phone ?? '',
      ...(Number.isFinite(capacity) && capacity >= 1 ? { capacity: Math.floor(capacity) } : {}),
      ...(meta.outsourced === true || String(meta.outsource_company ?? '').trim()
        ? {
            outsourced: true,
            outsourceCompany: canonicalVanOutsourceCompany(String(meta.outsource_company ?? '')),
          }
        : {}),
      ...(isSpecialTransferKind(meta.special_kind) ? { specialKind: meta.special_kind } : {}),
      ...(meta.transfer_in === true ? { transferIn: true } : {}),
      ...(meta.transfer_out === true ? { transferOut: true } : {}),
      ...(Number.isFinite(charge) && charge > 0 ? { chargeAmount: Math.round(charge) } : {}),
    }
    next[key] = plan
  }
  for (const row of assignments) {
    const date = asDateString(row.date)
    const key = dayVehiclePlanKey(date, row.program)
    const plan = next[key] ?? emptyDayVehiclePlan(date, row.program)
    const legs = plan.assignments[row.booking_code] ?? []
    const vanLegCount = Object.values(plan.assignments)
      .flat()
      .filter((leg) => leg.van === row.van_number).length
    legs.push({
      van: row.van_number,
      pax: row.pax,
      sortOrder:
        typeof row.sort_order === 'number' && Number.isFinite(row.sort_order)
          ? row.sort_order
          : vanLegCount,
    })
    plan.assignments[row.booking_code] = legs
    next[key] = plan
  }
  return next
}

async function assertOk<T>(label: string, error: { message: string } | null, data: T): Promise<T> {
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

export async function loadPortalSnapshot(): Promise<PortalSnapshot> {
  const supabase = getSupabaseBrowserClient()

  // Guest QR phones never show agents / pickup zones / hotels, so skip those three queries.
  // (With 100–200 guests scanning at once this saves hundreds of requests and the biggest payload.)
  let guestLite = false
  let role = ''
  try {
    const { data } = await supabase.auth.getSession()
    role = String(data.session?.user.app_metadata?.role ?? '')
    guestLite = role === 'guest'
  } catch {
    guestLite = false
  }
  const boardWindow = boardPlanWindow(role)
  const emptyRows = () =>
    Promise.resolve({ data: [] as unknown[], error: null as { message: string } | null })

  const [
    agentsRes,
    zonesRes,
    hotelsRes,
    bookingRows,
    availabilityRes,
    boatPlansRes,
    boatAssignRes,
    vehiclePlansRes,
    vanMetaRes,
    vanAssignRes,
    fleetVansRes,
    driversRes,
    cutoffsRes,
    closuresRes,
  ] = await Promise.all([
    guestLite ? emptyRows() : supabase.from('agents').select('*').order('name'),
    guestLite ? emptyRows() : supabase.from('pickup_zones').select('*').order('sort_order'),
    guestLite ? emptyRows() : supabase.from('hotels').select('*').order('name'),
    fetchBookingsInDateRange(operationalBookingsFromDate()),
    selectPagedDateWindow<AvailabilityRow>('availability', ['date'], boardWindow),
    selectPagedDateWindow<BoatPlanRow>('day_boat_plans', ['date', 'program'], boardWindow),
    selectPagedDateWindow<BoatAssignmentRow>(
      'boat_assignments',
      ['date', 'program', 'booking_code', 'boat_number'],
      boardWindow,
    ),
    selectPagedDateWindow<VehiclePlanRow>('day_vehicle_plans', ['date', 'program'], boardWindow),
    selectPagedDateWindow<VanMetaRow>('van_meta', ['date', 'program', 'van_number'], boardWindow),
    selectPagedDateWindow<VanAssignmentRow>('van_assignments', ['date', 'id'], boardWindow),
    supabase.from('fleet_vans').select('*').order('van_number'),
    supabase.from('drivers').select('*').order('name'),
    supabase.from('booking_cutoffs').select('*').eq('id', 'default').maybeSingle(),
    supabase
      .from('booking_closures')
      .select('*')
      .gte('date', boardWindow.from)
      .lte('date', boardWindow.to)
      .order('date'),
  ])

  await assertOk('agents', agentsRes.error, agentsRes.data)
  await assertOk('pickup_zones', zonesRes.error, zonesRes.data)
  await assertOk('availability', availabilityRes.error, availabilityRes.data)
  await assertOk('day_boat_plans', boatPlansRes.error, boatPlansRes.data)
  await assertOk('boat_assignments', boatAssignRes.error, boatAssignRes.data)
  await assertOk('day_vehicle_plans', vehiclePlansRes.error, vehiclePlansRes.data)
  await assertOk('van_meta', vanMetaRes.error, vanMetaRes.data)
  await assertOk('van_assignments', vanAssignRes.error, vanAssignRes.data)

  let hotels: Hotel[] = []
  if (hotelsRes.error) {
    console.warn(
      '[supabase] hotels table unavailable — run supabase/add-hotels.sql',
      hotelsRes.error.message,
    )
  } else {
    hotels = (hotelsRes.data as HotelRow[]).map(mapHotel)
  }

  let fleetVans: FleetVan[] = []
  if (fleetVansRes.error) {
    console.warn(
      '[supabase] fleet_vans table unavailable — run supabase/add-fleet-vans.sql',
      fleetVansRes.error.message,
    )
  } else {
    fleetVans = (fleetVansRes.data as FleetVanRow[]).map((row) => ({
      vanNumber: row.van_number,
      plate: row.plate ?? '',
      driver: row.driver ?? '',
      phone: row.phone ?? '',
    }))
  }

  let drivers: DriverRosterEntry[] = []
  if (driversRes.error) {
    console.warn(
      '[supabase] drivers table unavailable — run supabase/add-drivers.sql',
      driversRes.error.message,
    )
  } else {
    drivers = (driversRes.data as DriverRow[]).map((row) => ({
      name: row.name ?? '',
      phone: row.phone ?? '',
      plate: row.plate ?? '',
    }))
    if (drivers.length === 0) {
      persistQuietly(
        'seedDrivers',
        Promise.resolve(
          supabase.from('drivers').upsert(
            DEFAULT_DRIVERS.map((driver) => ({
              name: driver.name,
              phone: driver.phone,
              plate: driver.plate,
            })),
          ),
        ),
      )
    }
  }

  let bookingCutoffs = { ...DEFAULT_BOOKING_CUTOFFS }
  if (cutoffsRes.error) {
    console.warn(
      '[supabase] booking_cutoffs table unavailable — run supabase/add-booking-cutoffs.sql',
      cutoffsRes.error.message,
    )
  } else {
    bookingCutoffs = mapBookingCutoffs(cutoffsRes.data as BookingCutoffRow | null)
  }

  let bookingClosures: BookingClosure[] = []
  if (closuresRes.error) {
    console.warn(
      '[supabase] booking_closures table unavailable — run supabase/add-booking-closures.sql',
      closuresRes.error.message,
    )
  } else {
    bookingClosures = (closuresRes.data as BookingClosureRow[]).map(mapBookingClosure)
  }

  return {
    agents: (agentsRes.data as AgentRow[]).map(mapAgent),
    zones: (zonesRes.data as ZoneRow[]).map(mapZone),
    hotels,
    bookings: bookingRows,
    availability: (availabilityRes.data as AvailabilityRow[]).map(mapAvailability),
    dayBoatPlans: buildBoatPlans(
      boatPlansRes.data as BoatPlanRow[],
      boatAssignRes.data as BoatAssignmentRow[],
    ),
    dayVehiclePlans: buildVehiclePlans(
      vehiclePlansRes.data as VehiclePlanRow[],
      vanMetaRes.data as VanMetaRow[],
      vanAssignRes.data as VanAssignmentRow[],
    ),
    fleetVans,
    drivers: mergeDriverRoster(drivers),
    bookingCutoffs,
    bookingClosures,
  }
}

export async function insertBooking(booking: Booking) {
  const supabase = getSupabaseBrowserClient()
  const row = bookingToRow(booking)
  const { error } = await supabase.from('bookings').insert(row)
  if (!error) return
  const { no_show_date_move: _noShowDateMove, ...withoutMoveFlag } = row
  const retryMove = await supabase.from('bookings').insert(withoutMoveFlag)
  if (!retryMove.error) return
  const { late_cancel: _lateCancel, cancel_fee: _cancelFee, ...withoutCancel } = withoutMoveFlag
  const { error: withoutCancelError } = await supabase.from('bookings').insert(withoutCancel)
  if (!withoutCancelError) return
  const {
    late_change_fee: _lateChangeFee,
    late_date_change: _lateDateChange,
    ...withoutFee
  } = withoutCancel
  const { error: fallbackError } = await supabase.from('bookings').insert(withoutFee)
  if (fallbackError) throw new Error(`insert booking: ${fallbackError.message}`)
}

export async function updateBookingStatus(
  code: string,
  status: Booking['status'],
  extra?: { lateCancel?: boolean; cancelFee?: number },
) {
  const supabase = getSupabaseBrowserClient()
  const patch: Record<string, unknown> = { status }
  if (extra?.lateCancel !== undefined) patch.late_cancel = extra.lateCancel
  if (extra?.cancelFee !== undefined) patch.cancel_fee = Math.max(0, Math.floor(extra.cancelFee))
  const { error } = await supabase.from('bookings').update(patch).eq('code', code)
  if (!error) return
  const { error: fallbackError } = await supabase.from('bookings').update({ status }).eq('code', code)
  if (!fallbackError) return
  throw new Error(`update booking status: ${fallbackError.message}`)
}

export async function updateBookingPickup(
  code: string,
  pickupTime: string,
  status: Booking['status'],
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from('bookings')
    .update({ pickup_time: pickupTime, status })
    .eq('code', code)
  if (error) throw new Error(`update booking pickup: ${error.message}`)
}

export async function updateBookingDate(
  code: string,
  date: string,
  extra?: {
    lateChangeFee?: number
    lateDateChange?: boolean
    movedFrom?: { code: string; date: string }
    noShowDateMove?: boolean
  },
) {
  const supabase = getSupabaseBrowserClient()
  const patch: Record<string, unknown> = { date }
  if (extra?.lateChangeFee !== undefined) {
    patch.late_change_fee = Math.max(0, Math.floor(extra.lateChangeFee))
  }
  if (extra?.lateDateChange !== undefined) {
    patch.late_date_change = extra.lateDateChange === true
  }
  if (extra?.movedFrom) {
    patch.moved_from_code = extra.movedFrom.code
    patch.moved_from_date = extra.movedFrom.date
  }
  if (extra?.noShowDateMove !== undefined) {
    patch.no_show_date_move = extra.noShowDateMove === true
  }
  const { error } = await supabase.from('bookings').update(patch).eq('code', code)
  if (!error) return
  if (extra?.noShowDateMove !== undefined) {
    const { no_show_date_move: _noShowDateMove, ...withoutFlag } = patch
    const retry = await supabase.from('bookings').update(withoutFlag).eq('code', code)
    if (!retry.error) return
  }
  if (
    extra?.lateChangeFee !== undefined ||
    extra?.lateDateChange !== undefined ||
    extra?.movedFrom
  ) {
    const { error: fallbackError } = await supabase
      .from('bookings')
      .update({ date })
      .eq('code', code)
    if (!fallbackError) return
    throw new Error(`update booking date: ${fallbackError.message}`)
  }
  throw new Error(`update booking date: ${error.message}`)
}

export async function updateBookingRebook(
  code: string,
  date: string,
  status: Booking['status'],
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('bookings').update({ date, status }).eq('code', code)
  if (error) throw new Error(`rebook booking: ${error.message}`)
}

export async function updateBookingDetails(
  booking: Booking,
  options?: { writeOriginalPax?: boolean; writeMovedOut?: boolean },
) {
  const supabase = getSupabaseBrowserClient()
  const row = bookingToRow(booking)
  const movedOut: {
    moved_out_adults?: number | null
    moved_out_children?: number | null
    moved_out_infants?: number | null
    moved_out_tour_leaders?: number | null
  } = options?.writeMovedOut
    ? {
        moved_out_adults: booking.movedOutPax?.adults ?? null,
        moved_out_children: booking.movedOutPax?.children ?? null,
        moved_out_infants: booking.movedOutPax?.infants ?? null,
        moved_out_tour_leaders: booking.movedOutPax?.tourLeaders ?? null,
      }
    : {}
  // Only touch the original-pax columns when guest counts changed in this save, so a stale
  // browser can never wipe the stored original with its own (older) copy.
  const originalPax: {
    original_adults?: number | null
    original_children?: number | null
    original_infants?: number | null
    original_tour_leaders?: number | null
  } = options?.writeOriginalPax
    ? {
        original_adults: booking.originalPax?.adults ?? null,
        original_children: booking.originalPax?.children ?? null,
        original_infants: booking.originalPax?.infants ?? null,
        original_tour_leaders: booking.originalPax?.tourLeaders ?? null,
      }
    : {}
  const payload = {
    ...originalPax,
    ...movedOut,
    agent_ref: row.agent_ref,
    park_fee: row.park_fee,
    canoe: row.canoe,
    adults: row.adults,
    children: row.children,
    infants: row.infants,
    tour_leaders: row.tour_leaders,
    lead_guest: row.lead_guest,
    pickup_zone: row.pickup_zone,
    pickup_hotel: row.pickup_hotel,
    room_number: row.room_number,
    note: row.note,
    cash_on_tour: row.cash_on_tour,
    transfer_extra_charge: row.transfer_extra_charge,
    private_transfer_vehicle: row.private_transfer_vehicle,
    private_transfer_price: row.private_transfer_price,
    private_driver_name: row.private_driver_name,
    private_driver_phone: row.private_driver_phone,
    pickup_time: row.pickup_time,
    status: row.status,
    late_change_fee: row.late_change_fee,
  }
  const { error } = await supabase.from('bookings').update(payload).eq('code', booking.code)
  if (!error) return
  const {
    original_adults: _originalAdults,
    original_children: _originalChildren,
    original_infants: _originalInfants,
    original_tour_leaders: _originalTourLeaders,
    moved_out_adults: _movedOutAdults,
    moved_out_children: _movedOutChildren,
    moved_out_infants: _movedOutInfants,
    moved_out_tour_leaders: _movedOutTourLeaders,
    late_change_fee: _lateChangeFee,
    private_transfer_vehicle: _vehicle,
    private_transfer_price: _price,
    private_driver_name: _driver,
    private_driver_phone: _phone,
    ...withoutPrivate
  } = payload
  const { error: fallbackError } = await supabase
    .from('bookings')
    .update(withoutPrivate)
    .eq('code', booking.code)
  if (fallbackError) throw new Error(`update booking details: ${fallbackError.message}`)
}

type BookingEventRow = {
  id: string
  booking_code: string
  event_type: BookingEventType
  summary: string
  actor_role: BookingActorRole
  actor_name: string
  actor_slug: string
  created_at: string
}

function mapBookingEvent(row: BookingEventRow): BookingEvent {
  return {
    id: row.id,
    bookingCode: row.booking_code,
    type: row.event_type,
    summary: row.summary ?? '',
    actorRole: row.actor_role,
    actorName: row.actor_name ?? '',
    actorSlug: row.actor_slug ?? '',
    createdAt: row.created_at,
  }
}

export async function insertBookingEvent(
  event: Omit<BookingEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
) {
  const supabase = getSupabaseBrowserClient()
  const id = event.id ?? crypto.randomUUID()
  const createdAt = event.createdAt ?? new Date().toISOString()
  const row = {
    id,
    booking_code: event.bookingCode,
    event_type: event.type,
    summary: event.summary,
    actor_role: event.actorRole,
    actor_name: event.actorName,
    actor_slug: event.actorSlug,
    created_at: createdAt,
  }

  // Retry on FK violation (23503): mobile-network clock skew or Supabase
  // round-trip ordering can make the event INSERT reach the server a fraction
  // of a second before the parent booking row commits. Three attempts with
  // back-off covers the race window.
  const FK_VIOLATION = '23503'
  const BACKOFF_MS = [600, 1500, 3000]
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt - 1]))
    }
    const { error } = await supabase.from('booking_events').insert(row)
    if (!error) return { id, createdAt }
    lastError = new Error(`insert booking event: ${error.message}`)
    // Only retry on FK violation; any other error fails immediately.
    if (!error.code || error.code !== FK_VIOLATION) break
  }
  throw lastError ?? new Error('insert booking event: unknown error')
}

export async function fetchBookingEvents(bookingCode: string): Promise<BookingEvent[]> {
  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('booking_events')
    .select('*')
    .eq('booking_code', bookingCode)
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('[supabase] booking_events unavailable — run supabase/add-booking-events.sql', error.message)
    return []
  }
  return (data as BookingEventRow[]).map(mapBookingEvent)
}

/** Operational bookings only (~last 30 days + future). Not full history. */
export async function fetchBookings(): Promise<Booking[]> {
  return fetchBookingsInDateRange(operationalBookingsFromDate())
}

/** Page `table` rows whose `date` falls inside `window`. Omit `window` to read the whole table. */
async function selectPagedDateWindow<T>(
  table: string,
  orderBy: string[],
  window?: BoardDateWindow,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  if (!window) return selectAllPaged<T>(table, orderBy)
  const supabase = getSupabaseBrowserClient()
  const pageSize = 1000
  const all: T[] = []
  const fromDate = window.from.slice(0, 10)
  const toDate = window.to.slice(0, 10)
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select('*').gte('date', fromDate).lte('date', toDate)
    for (const column of orderBy) query = query.order(column, { ascending: true })
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return { data: all, error: null }
}

/** Reload seats, close dates, and cutoff times across devices. */
export async function fetchAvailabilitySettings(fromDate?: string, toDate?: string): Promise<{
  availability: Availability[]
  bookingCutoffs: BookingCutoffSettings
  bookingClosures: BookingClosure[]
}> {
  const supabase = getSupabaseBrowserClient()
  const from = fromDate ? asDateString(fromDate) : ''
  const to = toDate ? asDateString(toDate) : ''
  const [availabilityRes, cutoffsRes, closuresRes] = await Promise.all([
    from || to
      ? fetchAllPaged<AvailabilityRow>('availability', (start, end) => {
          let query = supabase.from('availability').select('*')
          if (from) query = query.gte('date', from)
          if (to) query = query.lte('date', to)
          return query.order('date').range(start, end)
        }).then((data) => ({ data, error: null as { message: string } | null }))
      : selectAllPaged<AvailabilityRow>('availability', ['date']),
    supabase.from('booking_cutoffs').select('*').eq('id', 'default').maybeSingle(),
    from || to
      ? (() => {
          let query = supabase.from('booking_closures').select('*')
          if (from) query = query.gte('date', from)
          if (to) query = query.lte('date', to)
          return query.order('date')
        })()
      : supabase.from('booking_closures').select('*').order('date'),
  ])
  await assertOk('availability', availabilityRes.error, availabilityRes.data)

  let bookingCutoffs = { ...DEFAULT_BOOKING_CUTOFFS }
  if (cutoffsRes.error) {
    console.warn(
      '[supabase] booking_cutoffs table unavailable — run supabase/add-booking-cutoffs.sql',
      cutoffsRes.error.message,
    )
  } else {
    bookingCutoffs = mapBookingCutoffs(cutoffsRes.data as BookingCutoffRow | null)
  }

  let bookingClosures: BookingClosure[] = []
  if (closuresRes.error) {
    console.warn(
      '[supabase] booking_closures table unavailable — run supabase/add-booking-closures.sql',
      closuresRes.error.message,
    )
  } else {
    bookingClosures = (closuresRes.data as BookingClosureRow[]).map(mapBookingClosure)
  }

  return {
    availability: (availabilityRes.data as AvailabilityRow[]).map(mapAvailability),
    bookingCutoffs,
    bookingClosures,
  }
}

/** Reload van assignments and meta across admins / marina tablets. */
export async function fetchDayVehiclePlans(
  window?: BoardDateWindow,
): Promise<Record<string, DayVehiclePlan>> {
  const [vehiclePlansRes, vanMetaRes, vanAssignRes] = await Promise.all([
    selectPagedDateWindow<VehiclePlanRow>('day_vehicle_plans', ['date', 'program'], window),
    selectPagedDateWindow<VanMetaRow>('van_meta', ['date', 'program', 'van_number'], window),
    selectPagedDateWindow<VanAssignmentRow>('van_assignments', ['date', 'id'], window),
  ])
  await assertOk('day_vehicle_plans', vehiclePlansRes.error, vehiclePlansRes.data)
  await assertOk('van_meta', vanMetaRes.error, vanMetaRes.data)
  await assertOk('van_assignments', vanAssignRes.error, vanAssignRes.data)
  return buildVehiclePlans(
    vehiclePlansRes.data as VehiclePlanRow[],
    vanMetaRes.data as VanMetaRow[],
    vanAssignRes.data as VanAssignmentRow[],
  )
}

/** Reload boat capacities, names, guides, and assignments (for live multi-admin sync). */
export async function fetchDayBoatPlans(window?: BoardDateWindow): Promise<Record<string, DayBoatPlan>> {
  const [boatPlansRes, boatAssignRes] = await Promise.all([
    selectPagedDateWindow<BoatPlanRow>('day_boat_plans', ['date', 'program'], window),
    selectPagedDateWindow<BoatAssignmentRow>(
      'boat_assignments',
      ['date', 'program', 'booking_code', 'boat_number'],
      window,
    ),
  ])
  await assertOk('day_boat_plans', boatPlansRes.error, boatPlansRes.data)
  await assertOk('boat_assignments', boatAssignRes.error, boatAssignRes.data)
  return buildBoatPlans(
    boatPlansRes.data as BoatPlanRow[],
    boatAssignRes.data as BoatAssignmentRow[],
  )
}

/** Live updates when bookings change in Supabase (requires Realtime on `bookings`). */
export function subscribeBookings(onChange: () => void) {
  const supabase = getSupabaseBrowserClient()
  const channel = supabase
    .channel(`portal-bookings-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bookings' },
      () => {
        onChange()
      },
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

/** Live marina check-in updates (requires Realtime on enrollments + attendance). */
export function subscribeCheckInChanges(onChange: () => void) {
  const supabase = getSupabaseBrowserClient()
  const channel = supabase
    .channel(`portal-check-in-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'check_in_enrollments' },
      () => {
        onChange()
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'check_in_attendance' },
      () => {
        onChange()
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'check_in_booked_pax' },
      () => {
        onChange()
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pickup_no_shows' },
      () => {
        onChange()
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'check_in_arrived_pax' },
      () => {
        onChange()
      },
    )
  // Tables below need supabase/add-realtime-more-tables.sql; without it they just never fire
  // and the slow fallback poll still covers them.
  for (const table of [
    'check_in_payments',
    'check_in_services',
    'check_in_sequences',
    'check_in_guest_edits',
    'check_in_notes',
    'check_in_group_guides',
    'own_arrivals',
    'job_order_actions',
  ]) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      onChange()
    })
  }
  channel.subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

/** Live seats / cutoffs / close-dates updates (requires add-realtime-more-tables.sql). */
export function subscribeSettingsChanges(onChange: () => void) {
  const supabase = getSupabaseBrowserClient()
  const channel = supabase.channel(
    `portal-settings-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  )
  for (const table of ['availability', 'booking_cutoffs', 'booking_closures']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      onChange()
    })
  }
  channel.subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

const BOAT_PLAN_REALTIME_TABLES = ['day_boat_plans', 'boat_assignments'] as const
const VEHICLE_PLAN_REALTIME_TABLES = ['day_vehicle_plans', 'van_assignments', 'van_meta'] as const

/** Live van/boat board updates. Pass `boat` or `vehicle` so one board does not refetch the other. */
export function subscribeDayPlanChanges(
  onChange: () => void,
  scope: 'boat' | 'vehicle' | 'all' = 'all',
) {
  const supabase = getSupabaseBrowserClient()
  const tables =
    scope === 'boat'
      ? BOAT_PLAN_REALTIME_TABLES
      : scope === 'vehicle'
        ? VEHICLE_PLAN_REALTIME_TABLES
        : [...BOAT_PLAN_REALTIME_TABLES, ...VEHICLE_PLAN_REALTIME_TABLES]
  // Unique name — same-ms remounts reuse a subscribed channel and reject extra .on().
  const channel = supabase.channel(
    `portal-day-plans-${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  )
  for (const table of tables) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      onChange()
    })
  }
  channel.subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

export async function upsertAgent(agent: Agent) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('agents').upsert({
    slug: agent.slug,
    name: agent.name,
    country: agent.country,
    status: agent.status,
  })
  if (error) throw new Error(`upsert agent: ${error.message}`)
}

export async function deleteAgent(slug: string) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('agents').delete().eq('slug', slug)
  if (error) throw new Error(`delete agent: ${error.message}`)
}

export async function updateBookingsAgentName(slug: string, name: string) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('bookings').update({ agent_name: name }).eq('agent_slug', slug)
  if (error) throw new Error(`update booking agent name: ${error.message}`)
}

export async function upsertZone(zone: PickupZone, sortOrder = 100) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('pickup_zones').upsert({
    name: zone.name,
    time: zone.time,
    pending: zone.pending,
    sort_order: sortOrder,
  })
  if (error) throw new Error(`upsert zone: ${error.message}`)
}

export async function deleteZone(name: string) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('pickup_zones').delete().eq('name', name)
  if (error) throw new Error(`delete zone: ${error.message}`)
}

export async function upsertHotel(hotel: Hotel, sortOrder = 100) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('hotels').upsert({
    id: hotel.id,
    name: hotel.name,
    zone_name: hotel.zoneName,
    active: hotel.active,
    extra_charge_transfer: hotel.extraChargeTransfer ?? '',
    sort_order: sortOrder,
  })
  if (error) throw new Error(`upsert hotel: ${error.message}`)
}

export async function deleteHotel(id: string) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('hotels').delete().eq('id', id)
  if (error) throw new Error(`delete hotel: ${error.message}`)
}

export async function upsertAvailability(row: Availability) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('availability').upsert({
    date: row.date,
    pp_capacity: row.ppCapacity,
    james_bond_capacity: row.jamesBondCapacity,
  })
  if (error) throw new Error(`upsert availability: ${error.message}`)
}

export async function upsertAvailabilityRows(rows: Availability[]) {
  if (rows.length === 0) return
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('availability').upsert(
    rows.map((row) => ({
      date: row.date,
      pp_capacity: row.ppCapacity,
      james_bond_capacity: row.jamesBondCapacity,
    })),
  )
  if (error) throw new Error(`upsert availability rows: ${error.message}`)
}

export type SaveDayBoatPlanResult = {
  revision: number
}

export async function saveDayBoatPlan(plan: DayBoatPlan): Promise<SaveDayBoatPlanResult> {
  const supabase = getSupabaseBrowserClient()
  const hydrated = hydrateDayBoatPlan(plan)
  const capacities = hydrated.capacities
  const boat_names = persistBoatNames(hydrated)
  const boat_guides = normalizeBoatGuides(hydrated.guides, capacities.length)
  const boat_kinds = hydrated.kinds
  const boat_labels = hydrated.labels
  const maxBoat = capacities.length
  const assignmentRows: Array<{
    booking_code: string
    boat_number: number
    pax?: number
  }> = []
  for (const [booking_code, assignment] of Object.entries(plan.assignments ?? {})) {
    const legs = normalizeBoatAssignment(assignment)
    if (legs.length === 0) {
      const boat = Math.max(1, Math.floor(Number(assignment) || 0))
      if (boat >= 1 && boat <= maxBoat) {
        assignmentRows.push({ booking_code, boat_number: boat })
      }
      continue
    }
    for (const leg of legs) {
      if (leg.boat < 1 || leg.boat > maxBoat) continue
      assignmentRows.push({
        booking_code,
        boat_number: leg.boat,
        ...(leg.pax > 0 ? { pax: leg.pax } : {}),
      })
    }
  }

  const expectedRevision = Math.max(0, Math.floor(Number(plan.revision) || 0))
  const { data: rpcData, error: rpcError } = await supabase.rpc('portal_save_day_boat_plan', {
    p_date: plan.date,
    p_program: plan.program,
    p_expected_revision: expectedRevision,
    p_capacities: capacities,
    p_boat_names: boat_names,
    p_boat_guides: boat_guides,
    p_boat_kinds: boat_kinds,
    p_boat_labels: boat_labels,
    p_assignments: assignmentRows,
  })

  if (!rpcError) {
    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
      ok?: unknown
      error?: unknown
      conflict?: unknown
      revision?: unknown
    } | null
    if (row?.ok === true) {
      return { revision: Math.max(1, Math.floor(Number(row.revision) || expectedRevision + 1)) }
    }
    const message = String(row?.error || 'Failed to save boat plan')
    throw new Error(message)
  }

  // Fallback for older DBs without the revision RPC — still prefer locked-ish upsert path.
  if (!/portal_save_day_boat_plan|Could not find the function|schema cache/i.test(rpcError.message)) {
    throw new Error(`save boat plan: ${rpcError.message}`)
  }

  const legacyCaps = {
    date: plan.date,
    program: plan.program,
    capacity_1: capacities[0] ?? DEFAULT_BOAT_CAPACITY,
    capacity_2: capacities[1] ?? capacities[0] ?? DEFAULT_BOAT_CAPACITY,
    capacity_3: capacities[2] ?? capacities[0] ?? DEFAULT_BOAT_CAPACITY,
  }

  const warnings: string[] = []
  let planError: { message: string } | null = null

  const withKinds = {
    ...legacyCaps,
    capacities,
    boat_names,
    boat_guides,
    boat_kinds,
    boat_labels,
    revision: Math.max(1, expectedRevision + 1),
  }
  const fullRow = { ...legacyCaps, capacities, boat_names, boat_guides }
  const withoutGuides = { ...legacyCaps, capacities, boat_names }
  const withoutNames = { ...legacyCaps, capacities }
  const attempts = [withKinds, fullRow, withoutGuides, withoutNames, legacyCaps] as const

  for (let index = 0; index < attempts.length; index += 1) {
    const { error } = await supabase.from('day_boat_plans').upsert(attempts[index]!)
    if (!error) {
      planError = null
      break
    }
    planError = error
    const schemaGap =
      /Could not find the .* column|schema cache|column .* does not exist/i.test(error.message)
    if (!schemaGap || index === attempts.length - 1) break

    const sqlFile = /boat_kinds|boat_labels/i.test(error.message)
      ? 'supabase/add-partner-boats.sql'
      : /boat_guides/i.test(error.message)
      ? 'supabase/add-boat-guides.sql'
      : /boat_names/i.test(error.message)
        ? 'supabase/add-boat-names.sql'
        : /capacities/i.test(error.message)
          ? 'supabase/add-flexible-day-boats.sql'
          : null
    console.error(
      `[supabase] day_boat_plans schema behind${sqlFile ? ` — run ${sqlFile}` : ''}`,
      error.message,
    )
    if (sqlFile) {
      warnings.push(`Run ${sqlFile} in Supabase.`)
    }
  }

  if (planError) throw new Error(`upsert boat plan: ${planError.message}`)

  const { error: delError } = await supabase
    .from('boat_assignments')
    .delete()
    .eq('date', plan.date)
    .eq('program', plan.program)
  if (delError) throw new Error(`clear boat assignments: ${delError.message}`)

  const rows = assignmentRows.map((row) => ({
    date: plan.date,
    program: plan.program,
    booking_code: row.booking_code,
    boat_number: row.boat_number,
    ...(row.pax && row.pax > 0 ? { pax: row.pax } : {}),
  }))
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('boat_assignments').insert(rows)
    if (insertError) {
      const withoutPax = rows.map(({ pax: _pax, ...row }) => row)
      const unique = new Map<string, (typeof withoutPax)[number]>()
      for (const row of withoutPax) {
        unique.set(`${row.booking_code}`, row)
      }
      const { error: retryError } = await supabase
        .from('boat_assignments')
        .insert([...unique.values()])
      if (retryError) throw new Error(`insert boat assignments: ${retryError.message}`)
      console.error(
        '[supabase] boat assignment splits need a DB update — run supabase/add-boat-assignment-splits.sql Then save again.',
        insertError.message,
      )
      warnings.push('Run supabase/add-boat-assignment-splits.sql in Supabase.')
    }
  }

  if (warnings.length > 0) {
    throw new Error(
      `Boat arrangement saved, but some fields need a DB update — ${warnings.join(' ')} Then save again.`,
    )
  }
  return { revision: Math.max(1, expectedRevision + 1) }
}

function vanMetaColumnsFromError(message: string) {
  const msg = message.toLowerCase()
  const columns: Array<keyof VanMetaRow> = []
  if (msg.includes('special_kind')) columns.push('special_kind')
  if (msg.includes('transfer_in')) columns.push('transfer_in')
  if (msg.includes('transfer_out')) columns.push('transfer_out')
  if (msg.includes('charge_amount')) columns.push('charge_amount')
  if (msg.includes('outsourced')) columns.push('outsourced')
  if (msg.includes('outsource_company')) columns.push('outsource_company')
  if (/\bcapacity\b/.test(msg)) columns.push('capacity')
  return columns
}

function omitVanMetaColumns(rows: VanMetaRow[], columns: Array<keyof VanMetaRow>) {
  if (columns.length === 0) return rows
  return rows.map((row) => {
    const next = { ...row }
    for (const column of columns) delete next[column]
    return next
  })
}

async function insertVanMetaRows(rows: VanMetaRow[]) {
  const supabase = getSupabaseBrowserClient()
  let current = rows
  let { error } = await supabase.from('van_meta').insert(current)
  if (!error) return

  const attempts: Array<Array<keyof VanMetaRow>> = [
    vanMetaColumnsFromError(error.message),
    ['special_kind', 'transfer_in', 'transfer_out'],
    ['capacity'],
  ]
  const seen = new Set<string>()
  for (const columns of attempts) {
    const key = columns.join(',')
    if (columns.length === 0 || seen.has(key)) continue
    seen.add(key)
    current = omitVanMetaColumns(current, columns)
    const retry = await supabase.from('van_meta').insert(current)
    if (!retry.error) return
    error = retry.error
  }
  throw new Error(`insert van meta: ${error.message}`)
}

export type SaveDayVehiclePlanResult = {
  revision: number
}

export async function saveDayVehiclePlan(plan: DayVehiclePlan): Promise<SaveDayVehiclePlanResult> {
  const supabase = getSupabaseBrowserClient()
  const expectedRevision = Math.max(0, Math.floor(Number(plan.revision) || 0))

  const metaPayload = Object.entries(plan.vanMeta ?? {}).map(([van, meta]) => {
    const typed = meta as VanMeta
    const capacity = Number(typed.capacity)
    return {
      van_number: Number(van),
      plate: packVanPlate(typed.label ?? '', typed.plate ?? ''),
      driver: typed.driver ?? '',
      phone: typed.phone ?? '',
      outsourced: typed.outsourced === true,
      outsource_company:
        typed.outsourced === true ? canonicalVanOutsourceCompany(typed.outsourceCompany ?? '') : '',
      special_kind: isSpecialTransferKind(typed.specialKind) ? typed.specialKind : '',
      transfer_in: typed.transferIn === true,
      transfer_out: typed.transferOut === true,
      charge_amount: normalizeChargeAmount(typed.chargeAmount),
      ...(Number.isFinite(capacity) && capacity >= 1 ? { capacity: Math.floor(capacity) } : {}),
    }
  })

  const assignPayload: Array<{
    booking_code: string
    van_number: number
    pax: number
    sort_order: number
  }> = []
  for (const [booking_code, legs] of Object.entries(plan.assignments ?? {})) {
    for (const leg of legs as VanSplit[]) {
      assignPayload.push({
        booking_code,
        van_number: leg.van,
        pax: leg.pax,
        sort_order: leg.sortOrder ?? 0,
      })
    }
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('portal_save_day_vehicle_plan', {
    p_date: plan.date,
    p_program: plan.program,
    p_expected_revision: expectedRevision,
    p_van_capacity: plan.vanCapacity,
    p_van_meta: metaPayload,
    p_assignments: assignPayload,
  })

  if (!rpcError) {
    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
      ok?: unknown
      error?: unknown
      conflict?: unknown
      revision?: unknown
    } | null
    if (row?.ok === true) {
      return { revision: Math.max(1, Math.floor(Number(row.revision) || expectedRevision + 1)) }
    }
    throw new Error(String(row?.error || 'Failed to save van plan'))
  }

  if (!/portal_save_day_vehicle_plan|Could not find the function|schema cache/i.test(rpcError.message)) {
    throw new Error(`save vehicle plan: ${rpcError.message}`)
  }

  // Legacy fallback without revision RPC.
  const { error: planError } = await supabase.from('day_vehicle_plans').upsert({
    date: plan.date,
    program: plan.program,
    van_capacity: plan.vanCapacity,
  })
  if (planError) throw new Error(`upsert vehicle plan: ${planError.message}`)

  const { error: delAssignError } = await supabase
    .from('van_assignments')
    .delete()
    .eq('date', plan.date)
    .eq('program', plan.program)
  if (delAssignError) throw new Error(`clear van assignments: ${delAssignError.message}`)

  const { error: delMetaError } = await supabase
    .from('van_meta')
    .delete()
    .eq('date', plan.date)
    .eq('program', plan.program)
  if (delMetaError) throw new Error(`clear van meta: ${delMetaError.message}`)

  const metaRows = Object.entries(plan.vanMeta ?? {}).map(([van, meta]) => {
    const typed = meta as VanMeta
    const row: VanMetaRow = {
      date: plan.date,
      program: plan.program,
      van_number: Number(van),
      plate: packVanPlate(typed.label ?? '', typed.plate ?? ''),
      driver: typed.driver ?? '',
      phone: typed.phone ?? '',
      outsourced: typed.outsourced === true,
      outsource_company:
        typed.outsourced === true ? canonicalVanOutsourceCompany(typed.outsourceCompany ?? '') : '',
      special_kind: isSpecialTransferKind(typed.specialKind) ? typed.specialKind : '',
      transfer_in: typed.transferIn === true,
      transfer_out: typed.transferOut === true,
      charge_amount: normalizeChargeAmount(typed.chargeAmount),
    }
    const capacity = Number(typed.capacity)
    if (Number.isFinite(capacity) && capacity >= 1) row.capacity = Math.floor(capacity)
    return row
  })
  if (metaRows.length > 0) {
    await insertVanMetaRows(metaRows)
  }

  const assignRows = assignPayload.map((row) => ({
    date: plan.date,
    program: plan.program,
    ...row,
  }))
  if (assignRows.length > 0) {
    const { error: insertError } = await supabase.from('van_assignments').insert(assignRows)
    if (insertError) throw new Error(`insert van assignments: ${insertError.message}`)
  }
  return { revision: Math.max(1, expectedRevision + 1) }
}

export async function upsertBookingCutoffs(settings: BookingCutoffSettings) {
  const supabase = getSupabaseBrowserClient()
  const bookUntil =
    normalizeCutoffTime(settings.bookUntilTime) ?? DEFAULT_BOOKING_CUTOFFS.bookUntilTime
  const cancelUntil =
    normalizeCutoffTime(settings.cancelUntilTime) ?? DEFAULT_BOOKING_CUTOFFS.cancelUntilTime
  const lateFeeFrom =
    normalizeCutoffTime(settings.lateFeeFromTime) ?? DEFAULT_BOOKING_CUTOFFS.lateFeeFromTime
  const dateChangeFee = normalizeDateChangeFee(settings.dateChangeFeePerPerson)
  const base = {
    id: 'default',
    timezone: DEFAULT_BOOKING_CUTOFFS.timezone,
    book_before_days: normalizeBeforeDays(settings.bookBeforeDays),
    book_until_time: bookUntil,
    cancel_before_days: normalizeBeforeDays(settings.cancelBeforeDays),
    cancel_until_time: cancelUntil,
  }
  const { error } = await supabase.from('booking_cutoffs').upsert({
    ...base,
    late_fee_from_time: lateFeeFrom,
    date_change_fee_thb: dateChangeFee,
  })
  if (!error) return
  const { error: fallbackError } = await supabase.from('booking_cutoffs').upsert(base)
  if (fallbackError) throw new Error(`upsert booking cutoffs: ${fallbackError.message}`)
}

export async function upsertBookingClosures(rows: BookingClosure[]) {
  if (rows.length === 0) return
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('booking_closures').upsert(
    rows.map((row) => ({
      date: row.date,
      program: row.program,
      reason: row.reason.trim(),
    })),
  )
  if (error) throw new Error(`upsert booking closures: ${error.message}`)
}

export async function deleteBookingClosures(rows: Array<{ date: string; program: Program }>) {
  if (rows.length === 0) return
  const supabase = getSupabaseBrowserClient()
  for (const row of rows) {
    const { error } = await supabase
      .from('booking_closures')
      .delete()
      .eq('date', row.date)
      .eq('program', row.program)
    if (error) throw new Error(`delete booking closure: ${error.message}`)
  }
}

export async function upsertFleetVan(van: FleetVan) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('fleet_vans').upsert({
    van_number: van.vanNumber,
    plate: van.plate.trim(),
    driver: van.driver.trim(),
    phone: van.phone.trim(),
  })
  if (error) throw new Error(`upsert fleet van: ${error.message}`)
}

export async function upsertDriver(driver: DriverRosterEntry) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('drivers').upsert({
    name: driver.name.trim(),
    phone: driver.phone.trim(),
    plate: driver.plate.trim(),
  })
  if (error) throw new Error(`upsert driver: ${error.message}`)
}

type CheckInEnrollmentRow = {
  id: string
  date: string
  program: Program
  booking_code: string
  first_name: string
  last_name: string
  nationality: string
  birthday: string
  passport_number: string
  scope: CheckInEnrollment['scope']
  seats: number
  checked_in_at: string
}

type CheckInAttendanceRow = {
  date: string
  program: Program
  booking_code: string
  status: CheckInAttendance
}

type CheckInPaymentRow = {
  date: string
  program: Program
  seat_key: string
  status: 'paid'
}

export type CheckInMapsSnapshot = {
  enrollments: DayCheckInEnrollmentMap
  attendance: DayCheckInAttendanceMap
  payments: DayCheckInPaymentMap
  tickets: DayCheckInTicketMap
  services: DayCheckInServiceMap
  sequences: DayCheckInSequenceMap
  guestEdits: DayCheckInGuestEditMap
  notes: DayCheckInNoteMap
  groupGuides: DayCheckInGroupGuideMap
}

function isProgram(value: unknown): value is Program {
  return value === 'PP' || value === 'James Bond'
}

function mapEnrollmentRow(row: CheckInEnrollmentRow): CheckInEnrollment | null {
  const id = String(row.id ?? '').trim()
  const firstName = String(row.first_name ?? '').trim()
  const scope = row.scope === 'group' ? 'group' : row.scope === 'guide' ? 'guide' : row.scope === 'one' ? 'one' : null
  const checkedInAt = String(row.checked_in_at ?? '').trim()
  if (!id || !firstName || !scope || !checkedInAt) return null
  return {
    id,
    firstName,
    lastName: String(row.last_name ?? '').trim(),
    nationality: String(row.nationality ?? '').trim(),
    birthday: String(row.birthday ?? '').trim(),
    passportNumber: String(row.passport_number ?? '').trim(),
    scope,
    seats: Math.max(1, Math.floor(Number(row.seats) || 1)),
    checkedInAt,
  }
}

function enrollmentToRow(
  date: string,
  program: Program,
  bookingCode: string,
  enrollment: CheckInEnrollment,
): CheckInEnrollmentRow {
  return {
    id: enrollment.id,
    date,
    program,
    booking_code: bookingCode,
    first_name: enrollment.firstName,
    last_name: enrollment.lastName,
    nationality: enrollment.nationality,
    birthday: enrollment.birthday,
    passport_number: enrollment.passportNumber,
    scope: enrollment.scope,
    seats: enrollment.seats,
    checked_in_at: enrollment.checkedInAt,
  }
}

function buildCheckInEnrollmentMap(rows: CheckInEnrollmentRow[]): DayCheckInEnrollmentMap {
  const next: DayCheckInEnrollmentMap = {}
  for (const row of rows) {
    if (!isProgram(row.program)) continue
    const enrollment = mapEnrollmentRow(row)
    if (!enrollment) continue
    const key = dayBoatPlanKey(asDateString(row.date), row.program)
    const day = next[key] ?? {}
    const list = day[row.booking_code] ?? []
    list.push(enrollment)
    day[row.booking_code] = list
    next[key] = day
  }
  return next
}

function buildCheckInAttendanceMap(rows: CheckInAttendanceRow[]): DayCheckInAttendanceMap {
  const next: DayCheckInAttendanceMap = {}
  for (const row of rows) {
    if (!isProgram(row.program)) continue
    if (row.status !== 'checked' && row.status !== 'no-show') continue
    const key = dayBoatPlanKey(asDateString(row.date), row.program)
    const day = next[key] ?? {}
    day[row.booking_code] = row.status
    next[key] = day
  }
  return next
}

function buildCheckInPaymentMap(rows: CheckInPaymentRow[]): DayCheckInPaymentMap {
  const next: DayCheckInPaymentMap = {}
  for (const row of rows) {
    if (!isProgram(row.program)) continue
    if (row.status !== 'paid') continue
    if (isCheckInTicketSeatKey(row.seat_key)) continue
    const key = dayBoatPlanKey(asDateString(row.date), row.program)
    const day = next[key] ?? {}
    day[row.seat_key] = 'paid'
    next[key] = day
  }
  return next
}

function buildCheckInTicketMap(rows: CheckInPaymentRow[]): DayCheckInTicketMap {
  const next: DayCheckInTicketMap = {}
  for (const row of rows) {
    if (!isProgram(row.program)) continue
    if (row.status !== 'paid' || !isCheckInTicketSeatKey(row.seat_key)) continue
    const key = dayBoatPlanKey(asDateString(row.date), row.program)
    const day = next[key] ?? {}
    day[bookingCodeFromTicketSeatKey(row.seat_key)] = 'issued'
    next[key] = day
  }
  return next
}

function flattenCheckInEnrollmentMap(map: DayCheckInEnrollmentMap): CheckInEnrollmentRow[] {
  const rows: CheckInEnrollmentRow[] = []
  for (const [dayKey, byCode] of Object.entries(map)) {
    const sep = dayKey.indexOf('|')
    if (sep <= 0) continue
    const date = dayKey.slice(0, sep)
    const program = dayKey.slice(sep + 1)
    if (!isProgram(program)) continue
    for (const [bookingCode, list] of Object.entries(byCode)) {
      for (const enrollment of list) {
        rows.push(enrollmentToRow(date, program, bookingCode, enrollment))
      }
    }
  }
  return rows
}

function flattenCheckInAttendanceMap(map: DayCheckInAttendanceMap): CheckInAttendanceRow[] {
  const rows: CheckInAttendanceRow[] = []
  for (const [dayKey, byCode] of Object.entries(map)) {
    const sep = dayKey.indexOf('|')
    if (sep <= 0) continue
    const date = dayKey.slice(0, sep)
    const program = dayKey.slice(sep + 1)
    if (!isProgram(program)) continue
    for (const [bookingCode, status] of Object.entries(byCode)) {
      if (status !== 'checked' && status !== 'no-show') continue
      rows.push({ date, program, booking_code: bookingCode, status })
    }
  }
  return rows
}

function flattenCheckInPaymentMap(map: DayCheckInPaymentMap): CheckInPaymentRow[] {
  const rows: CheckInPaymentRow[] = []
  for (const [dayKey, byKey] of Object.entries(map)) {
    const sep = dayKey.indexOf('|')
    if (sep <= 0) continue
    const date = dayKey.slice(0, sep)
    const program = dayKey.slice(sep + 1)
    if (!isProgram(program)) continue
    for (const [seatKey, status] of Object.entries(byKey)) {
      if (status !== 'paid' || isCheckInTicketSeatKey(seatKey)) continue
      rows.push({ date, program, seat_key: seatKey, status: 'paid' })
    }
  }
  return rows
}

function flattenCheckInTicketMap(map: DayCheckInTicketMap): CheckInPaymentRow[] {
  const rows: CheckInPaymentRow[] = []
  for (const [dayKey, byCode] of Object.entries(map)) {
    const sep = dayKey.indexOf('|')
    if (sep <= 0) continue
    const date = dayKey.slice(0, sep)
    const program = dayKey.slice(sep + 1)
    if (!isProgram(program)) continue
    for (const [bookingCode, status] of Object.entries(byCode)) {
      if (status !== 'issued') continue
      rows.push({
        date,
        program,
        seat_key: checkInTicketSeatKey(bookingCode),
        status: 'paid',
      })
    }
  }
  return rows
}

type CheckInServiceRow = {
  id: string
  date: string
  program: Program
  booking_code: string
  kind: string
  people: number
  price_per_person: number
  paid: boolean
}

function mapServiceRow(row: CheckInServiceRow): CheckInServiceLine | null {
  const id = String(row.id ?? '').trim()
  if (!id || !isCheckInServiceKind(row.kind)) return null
  return {
    id,
    kind: row.kind,
    people: Math.max(1, Math.floor(Number(row.people) || 1)),
    pricePerPerson: Math.max(0, Math.floor(Number(row.price_per_person) || 0)),
    paid: row.paid === true,
  }
}

function serviceToRow(
  date: string,
  program: Program,
  bookingCode: string,
  service: CheckInServiceLine,
): CheckInServiceRow {
  return {
    id: service.id,
    date,
    program,
    booking_code: bookingCode,
    kind: service.kind,
    people: service.people,
    price_per_person: service.pricePerPerson,
    paid: service.paid,
  }
}

function buildCheckInServiceMap(rows: CheckInServiceRow[]): DayCheckInServiceMap {
  const next: DayCheckInServiceMap = {}
  for (const row of rows) {
    if (!isProgram(row.program)) continue
    const service = mapServiceRow(row)
    if (!service) continue
    const key = dayBoatPlanKey(asDateString(row.date), row.program)
    const day = next[key] ?? {}
    const list = day[row.booking_code] ?? []
    list.push(service)
    day[row.booking_code] = list
    next[key] = day
  }
  return next
}

type CheckInSequenceRow = {
  date: string
  program: Program
  booking_code: string
  start_number: number
}

function buildCheckInSequenceMap(rows: CheckInSequenceRow[]): DayCheckInSequenceMap {
  const next: DayCheckInSequenceMap = {}
  for (const row of rows) {
    if (!isProgram(row.program)) continue
    const start = Math.floor(Number(row.start_number))
    if (!Number.isFinite(start) || start < 1) continue
    const key = dayBoatPlanKey(asDateString(row.date), row.program)
    const day = next[key] ?? { start: DEFAULT_SEQUENCE_START, bookings: {} }
    const code = String(row.booking_code ?? '').trim()
    if (!code || code === PROGRAM_SEQUENCE_BOOKING_KEY) {
      day.start = Math.min(start, 9999)
    } else {
      day.bookings = { ...day.bookings, [code]: Math.min(start, 9999) }
    }
    next[key] = day
  }
  return next
}

type CheckInGuestEditRow = {
  date: string
  program: Program
  booking_code: string
  enrollment_id: string
}

function buildCheckInGuestEditMap(rows: CheckInGuestEditRow[]): DayCheckInGuestEditMap {
  const next: DayCheckInGuestEditMap = {}
  for (const row of rows) {
    if (!isProgram(row.program)) continue
    const enrollmentId = String(row.enrollment_id ?? '').trim()
    const bookingCode = String(row.booking_code ?? '').trim()
    if (!enrollmentId || !bookingCode) continue
    const key = dayBoatPlanKey(asDateString(row.date), row.program)
    const day = next[key] ?? {}
    const list = day[bookingCode] ?? []
    if (!list.includes(enrollmentId)) list.push(enrollmentId)
    day[bookingCode] = list
    next[key] = day
  }
  return next
}

type CheckInNoteRow = {
  date: string
  program: Program
  booking_code: string
  note: string
}

type CheckInGroupGuideRow = {
  date: string
  program: Program
  booking_code: string
  guide_name: string
}

function buildCheckInNoteMap(rows: CheckInNoteRow[]): DayCheckInNoteMap {
  const next: DayCheckInNoteMap = {}
  for (const row of rows) {
    if (!isProgram(row.program)) continue
    const bookingCode = String(row.booking_code ?? '').trim()
    const note = String(row.note ?? '').trim()
    if (!bookingCode || !note) continue
    const key = dayBoatPlanKey(asDateString(row.date), row.program)
    const day = next[key] ?? {}
    day[bookingCode] = note
    next[key] = day
  }
  return next
}

function flattenCheckInNoteMap(map: DayCheckInNoteMap): CheckInNoteRow[] {
  const rows: CheckInNoteRow[] = []
  for (const [dayKey, byCode] of Object.entries(map)) {
    const sep = dayKey.indexOf('|')
    if (sep <= 0) continue
    const date = dayKey.slice(0, sep)
    const program = dayKey.slice(sep + 1)
    if (!isProgram(program)) continue
    for (const [bookingCode, note] of Object.entries(byCode)) {
      const text = note.trim()
      if (!text) continue
      rows.push({
        date,
        program,
        booking_code: bookingCode,
        note: text,
      })
    }
  }
  return rows
}

function buildCheckInGroupGuideMap(rows: CheckInGroupGuideRow[]): DayCheckInGroupGuideMap {
  const next: DayCheckInGroupGuideMap = {}
  for (const row of rows) {
    if (!isProgram(row.program)) continue
    const bookingCode = String(row.booking_code ?? '').trim()
    const guideName = formatGroupGuideNames([String(row.guide_name ?? '')])
    if (!bookingCode || !guideName) continue
    const key = dayBoatPlanKey(asDateString(row.date), row.program)
    const day = next[key] ?? {}
    day[bookingCode] = guideName
    next[key] = day
  }
  return next
}

function flattenCheckInGroupGuideMap(map: DayCheckInGroupGuideMap): CheckInGroupGuideRow[] {
  const rows: CheckInGroupGuideRow[] = []
  for (const [dayKey, byCode] of Object.entries(map)) {
    const sep = dayKey.indexOf('|')
    if (sep <= 0) continue
    const date = dayKey.slice(0, sep)
    const program = dayKey.slice(sep + 1)
    if (!isProgram(program)) continue
    for (const [bookingCode, guideName] of Object.entries(byCode)) {
      const text = guideName.trim()
      if (!text) continue
      rows.push({
        date,
        program,
        booking_code: bookingCode,
        guide_name: text.slice(0, 80),
      })
    }
  }
  return rows
}

function flattenCheckInGuestEditMap(map: DayCheckInGuestEditMap): CheckInGuestEditRow[] {
  const rows: CheckInGuestEditRow[] = []
  for (const [dayKey, byCode] of Object.entries(map)) {
    const sep = dayKey.indexOf('|')
    if (sep <= 0) continue
    const date = dayKey.slice(0, sep)
    const program = dayKey.slice(sep + 1)
    if (!isProgram(program)) continue
    for (const [bookingCode, ids] of Object.entries(byCode)) {
      for (const enrollmentId of ids) {
        if (!enrollmentId.trim()) continue
        rows.push({
          date,
          program,
          booking_code: bookingCode,
          enrollment_id: enrollmentId,
        })
      }
    }
  }
  return rows
}

function flattenCheckInSequenceMap(map: DayCheckInSequenceMap): CheckInSequenceRow[] {
  const rows: CheckInSequenceRow[] = []
  for (const [dayKey, starts] of Object.entries(map)) {
    const sep = dayKey.indexOf('|')
    if (sep <= 0) continue
    const date = dayKey.slice(0, sep)
    const program = dayKey.slice(sep + 1)
    if (!isProgram(program)) continue
    if (starts.start !== DEFAULT_SEQUENCE_START) {
      rows.push({
        date,
        program,
        booking_code: PROGRAM_SEQUENCE_BOOKING_KEY,
        start_number: starts.start,
      })
    }
    for (const [bookingCode, start] of Object.entries(starts.bookings)) {
      if (!bookingCode.trim()) continue
      rows.push({
        date,
        program,
        booking_code: bookingCode,
        start_number: start,
      })
    }
  }
  return rows
}

function flattenCheckInServiceMap(map: DayCheckInServiceMap): CheckInServiceRow[] {
  const rows: CheckInServiceRow[] = []
  for (const [dayKey, byCode] of Object.entries(map)) {
    const sep = dayKey.indexOf('|')
    if (sep <= 0) continue
    const date = dayKey.slice(0, sep)
    const program = dayKey.slice(sep + 1)
    if (!isProgram(program)) continue
    for (const [bookingCode, list] of Object.entries(byCode)) {
      for (const service of list) {
        rows.push(serviceToRow(date, program, bookingCode, service))
      }
    }
  }
  return rows
}

type FetchCheckInMapsOptions = {
  /** When set, only rows on/after this YYYY-MM-DD are fetched (for lighter polls). */
  sinceDate?: string
  /** When set, only rows on/before this YYYY-MM-DD are fetched. */
  untilDate?: string
  /** When set, only this exact YYYY-MM-DD (helper / live board day). */
  onDate?: string
}

async function fetchAllCheckInRows<T>(
  table: string,
  options?: { sinceDate?: string; untilDate?: string; onDate?: string },
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const supabase = getSupabaseBrowserClient()
  const pageSize = 1000
  const rows: T[] = []
  let from = 0
  const onDate = options?.onDate?.slice(0, 10) || undefined
  const sinceDate = options?.sinceDate?.slice(0, 10) || undefined
  const untilDate = options?.untilDate?.slice(0, 10) || undefined

  while (true) {
    let query = supabase.from(table).select('*').range(from, from + pageSize - 1)
    if (onDate) query = query.eq('date', onDate)
    else {
      if (sinceDate) query = query.gte('date', sinceDate)
      if (untilDate) query = query.lte('date', untilDate)
    }
    const { data, error } = await query
    if (error) return { data: null, error }
    const chunk = (data ?? []) as T[]
    rows.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return { data: rows, error: null }
}

/** Returns null when core check-in tables are missing (migration not run yet). */
export async function fetchCheckInMaps(
  options?: FetchCheckInMapsOptions,
): Promise<CheckInMapsSnapshot | null> {
  const sinceDate = options?.sinceDate?.slice(0, 10) || undefined
  const untilDate = options?.untilDate?.slice(0, 10) || undefined
  const onDate = options?.onDate?.slice(0, 10) || undefined
  const range = onDate
    ? { onDate }
    : sinceDate || untilDate
      ? { sinceDate, untilDate }
      : undefined
  const [
    enrollmentsRes,
    attendanceRes,
    paymentsRes,
    servicesRes,
    sequencesRes,
    guestEditsRes,
    notesRes,
    groupGuidesRes,
  ] = await Promise.all([
    fetchAllCheckInRows<CheckInEnrollmentRow>('check_in_enrollments', range),
    fetchAllCheckInRows<CheckInAttendanceRow>('check_in_attendance', range),
    fetchAllCheckInRows<CheckInPaymentRow>('check_in_payments', range),
    fetchAllCheckInRows<CheckInServiceRow>('check_in_services', range),
    fetchAllCheckInRows<CheckInSequenceRow>('check_in_sequences', range),
    fetchAllCheckInRows<CheckInGuestEditRow>('check_in_guest_edits', range),
    fetchAllCheckInRows<CheckInNoteRow>('check_in_notes', range),
    fetchAllCheckInRows<CheckInGroupGuideRow>('check_in_group_guides', range),
  ])

  if (enrollmentsRes.error || attendanceRes.error || paymentsRes.error) {
    const message =
      enrollmentsRes.error?.message ||
      attendanceRes.error?.message ||
      paymentsRes.error?.message ||
      'unknown'
    console.warn(
      '[supabase] check-in tables unavailable — run supabase/add-check-in.sql',
      message,
    )
    return null
  }

  let services: DayCheckInServiceMap = {}
  if (servicesRes.error) {
    console.warn(
      '[supabase] check_in_services unavailable — run supabase/add-check-in-services.sql',
      servicesRes.error.message,
    )
  } else {
    services = buildCheckInServiceMap((servicesRes.data ?? []) as CheckInServiceRow[])
  }

  let sequences: DayCheckInSequenceMap = {}
  if (sequencesRes.error) {
    console.warn(
      '[supabase] check_in_sequences unavailable — run supabase/add-check-in-sequences.sql',
      sequencesRes.error.message,
    )
  } else {
    sequences = buildCheckInSequenceMap((sequencesRes.data ?? []) as CheckInSequenceRow[])
  }

  let guestEdits: DayCheckInGuestEditMap = {}
  if (guestEditsRes.error) {
    console.warn(
      '[supabase] check_in_guest_edits unavailable — run supabase/add-check-in-guest-edit.sql',
      guestEditsRes.error.message,
    )
  } else {
    guestEdits = buildCheckInGuestEditMap((guestEditsRes.data ?? []) as CheckInGuestEditRow[])
  }

  let notes: DayCheckInNoteMap = {}
  if (notesRes.error) {
    console.warn(
      '[supabase] check_in_notes unavailable — run supabase/add-check-in-notes.sql',
      notesRes.error.message,
    )
  } else {
    notes = buildCheckInNoteMap((notesRes.data ?? []) as CheckInNoteRow[])
  }

  let groupGuides: DayCheckInGroupGuideMap = {}
  if (groupGuidesRes.error) {
    console.warn(
      '[supabase] check_in_group_guides unavailable — run supabase/add-check-in-group-guides.sql',
      groupGuidesRes.error.message,
    )
  } else {
    groupGuides = buildCheckInGroupGuideMap((groupGuidesRes.data ?? []) as CheckInGroupGuideRow[])
  }

  const paymentRows = (paymentsRes.data ?? []) as CheckInPaymentRow[]
  const split = adoptLegacyPaymentsAsTickets(
    buildCheckInPaymentMap(paymentRows),
    buildCheckInTicketMap(paymentRows),
  )

  const snapshot: CheckInMapsSnapshot = {
    enrollments: buildCheckInEnrollmentMap((enrollmentsRes.data ?? []) as CheckInEnrollmentRow[]),
    attendance: buildCheckInAttendanceMap((attendanceRes.data ?? []) as CheckInAttendanceRow[]),
    payments: split.payments,
    tickets: split.tickets,
    services,
    sequences,
    guestEdits,
    notes,
    groupGuides,
  }

  if (split.migrated) {
    try {
      await rewriteLegacyPaymentTicksAsTickets(snapshot)
      markCheckInTicketMigrationDone()
    } catch (error) {
      console.warn('[supabase] could not rewrite legacy ticket ticks', error)
    }
  }

  return snapshot
}

export type RecordCheckInEnrollmentsResult =
  | { ok: true; count: number; fullyChecked: boolean }
  | { ok: false; error: string }

/** Atomic seat-checked insert via RPC (preferred under concurrent morning check-in). */
export async function recordCheckInEnrollmentsAtomic(
  date: string,
  program: Program,
  bookingCode: string,
  enrollments: CheckInEnrollment[],
): Promise<RecordCheckInEnrollmentsResult> {
  if (enrollments.length === 0) return { ok: false, error: 'Add at least one guest.' }
  const supabase = getSupabaseBrowserClient()
  const payload = enrollments.map((item) => ({
    id: item.id,
    first_name: item.firstName,
    last_name: item.lastName,
    nationality: item.nationality,
    birthday: item.birthday,
    passport_number: item.passportNumber,
    scope: item.scope,
    seats: item.seats,
    checked_in_at: item.checkedInAt,
  }))
  const { data, error } = await supabase.rpc('portal_record_check_in_enrollments', {
    p_date: date,
    p_program: program,
    p_booking_code: bookingCode,
    p_enrollments: payload,
  })
  if (error) {
    // Older projects without the RPC — caller may fall back to direct upsert.
    throw new Error(`record check-in enrollments: ${error.message}`)
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok?: unknown; count?: unknown; fully_checked?: unknown; error?: unknown }
    | null
  if (!row || typeof row !== 'object') {
    return { ok: false, error: 'Check-in failed. Please try again.' }
  }
  if (row.ok === true) {
    return {
      ok: true,
      count: Math.max(0, Math.floor(Number(row.count) || enrollments.length)),
      fullyChecked: row.fully_checked === true,
    }
  }
  return {
    ok: false,
    error: String(row.error ?? 'Check-in failed. Please try again.'),
  }
}

export async function upsertCheckInEnrollments(
  date: string,
  program: Program,
  bookingCode: string,
  enrollments: CheckInEnrollment[],
) {
  if (enrollments.length === 0) return
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from('check_in_enrollments')
    .upsert(enrollments.map((item) => enrollmentToRow(date, program, bookingCode, item)))
  if (error) throw new Error(`upsert check-in enrollments: ${error.message}`)
}

export async function deleteCheckInEnrollment(enrollmentId: string) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('check_in_enrollments').delete().eq('id', enrollmentId)
  if (error) throw new Error(`delete check-in enrollment: ${error.message}`)
}

export async function replaceCheckInEnrollmentsForBooking(
  date: string,
  program: Program,
  bookingCode: string,
  enrollments: CheckInEnrollment[],
) {
  const supabase = getSupabaseBrowserClient()
  const { error: deleteError } = await supabase
    .from('check_in_enrollments')
    .delete()
    .eq('date', date)
    .eq('program', program)
    .eq('booking_code', bookingCode)
  if (deleteError) throw new Error(`replace check-in enrollments: ${deleteError.message}`)
  if (enrollments.length === 0) return
  const { error } = await supabase
    .from('check_in_enrollments')
    .insert(enrollments.map((item) => enrollmentToRow(date, program, bookingCode, item)))
  if (error) throw new Error(`replace check-in enrollments insert: ${error.message}`)
}

export async function upsertCheckInAttendanceRow(
  date: string,
  program: Program,
  bookingCode: string,
  status: CheckInAttendance,
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('check_in_attendance').upsert({
    date,
    program,
    booking_code: bookingCode,
    status,
  })
  if (error) throw new Error(`upsert check-in attendance: ${error.message}`)
}

export async function deleteCheckInAttendanceRow(
  date: string,
  program: Program,
  bookingCode: string,
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from('check_in_attendance')
    .delete()
    .eq('date', date)
    .eq('program', program)
    .eq('booking_code', bookingCode)
  if (error) throw new Error(`delete check-in attendance: ${error.message}`)
}

export async function upsertCheckInPaymentRow(
  date: string,
  program: Program,
  seatKey: string,
  status: 'paid',
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('check_in_payments').upsert({
    date,
    program,
    seat_key: seatKey,
    status,
  })
  if (error) throw new Error(`upsert check-in payment: ${error.message}`)
}

export async function deleteCheckInPaymentRow(date: string, program: Program, seatKey: string) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from('check_in_payments')
    .delete()
    .eq('date', date)
    .eq('program', program)
    .eq('seat_key', seatKey)
  if (error) throw new Error(`delete check-in payment: ${error.message}`)
}

export async function upsertCheckInTicketRow(
  date: string,
  program: Program,
  bookingCode: string,
  status: 'issued',
) {
  if (status !== 'issued') return
  await upsertCheckInPaymentRow(date, program, checkInTicketSeatKey(bookingCode), 'paid')
}

export async function deleteCheckInTicketRow(date: string, program: Program, bookingCode: string) {
  await deleteCheckInPaymentRow(date, program, checkInTicketSeatKey(bookingCode))
}

export async function rewriteLegacyPaymentTicksAsTickets(snapshot: CheckInMapsSnapshot) {
  const supabase = getSupabaseBrowserClient()
  const ticketRows = flattenCheckInTicketMap(snapshot.tickets)
  if (ticketRows.length > 0) {
    const { error } = await supabase.from('check_in_payments').upsert(ticketRows)
    if (error) throw new Error(`rewrite check-in tickets: ${error.message}`)
  }
  for (const [dayKey, row] of Object.entries(snapshot.tickets)) {
    const sep = dayKey.indexOf('|')
    if (sep <= 0) continue
    const date = dayKey.slice(0, sep)
    const program = dayKey.slice(sep + 1)
    if (!isProgram(program)) continue
    for (const bookingCode of Object.keys(row)) {
      const { error } = await supabase
        .from('check_in_payments')
        .delete()
        .eq('date', date)
        .eq('program', program)
        .eq('seat_key', bookingCode)
      if (error) throw new Error(`clear legacy check-in payment tick: ${error.message}`)
    }
  }
}

export async function upsertCheckInSequenceStart(
  date: string,
  program: Program,
  bookingCode: string,
  start: number,
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('check_in_sequences').upsert({
    date,
    program,
    booking_code: bookingCode.trim() || PROGRAM_SEQUENCE_BOOKING_KEY,
    start_number: start,
  })
  if (error) throw new Error(`upsert check-in sequence: ${error.message}`)
}

export async function upsertCheckInGuestEdit(
  date: string,
  program: Program,
  bookingCode: string,
  enrollmentId: string,
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('check_in_guest_edits').upsert({
    date,
    program,
    booking_code: bookingCode,
    enrollment_id: enrollmentId,
  })
  if (error) throw new Error(`upsert check-in guest edit: ${error.message}`)
}

export async function deleteCheckInGuestEdit(
  date: string,
  program: Program,
  bookingCode: string,
  enrollmentId: string,
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from('check_in_guest_edits')
    .delete()
    .eq('date', date)
    .eq('program', program)
    .eq('booking_code', bookingCode)
    .eq('enrollment_id', enrollmentId)
  if (error) throw new Error(`delete check-in guest edit: ${error.message}`)
}

export async function deleteCheckInSequenceStart(
  date: string,
  program: Program,
  bookingCode: string,
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from('check_in_sequences')
    .delete()
    .eq('date', date)
    .eq('program', program)
    .eq('booking_code', bookingCode.trim() || PROGRAM_SEQUENCE_BOOKING_KEY)
  if (error) throw new Error(`delete check-in sequence: ${error.message}`)
}

export async function replaceCheckInServicesForBooking(
  date: string,
  program: Program,
  bookingCode: string,
  services: CheckInServiceLine[],
) {
  const supabase = getSupabaseBrowserClient()
  const { error: deleteError } = await supabase
    .from('check_in_services')
    .delete()
    .eq('date', date)
    .eq('program', program)
    .eq('booking_code', bookingCode)
  if (deleteError) throw new Error(`replace check-in services: ${deleteError.message}`)
  if (services.length === 0) return
  const { error } = await supabase
    .from('check_in_services')
    .insert(services.map((item) => serviceToRow(date, program, bookingCode, item)))
  if (error) throw new Error(`replace check-in services insert: ${error.message}`)
}

/** One-shot upload used when migrating browser-local check-in data into Supabase. */
export async function pushCheckInMaps(snapshot: CheckInMapsSnapshot) {
  const supabase = getSupabaseBrowserClient()
  const enrollmentRows = flattenCheckInEnrollmentMap(snapshot.enrollments)
  const attendanceRows = flattenCheckInAttendanceMap(snapshot.attendance)
  const paymentRows = flattenCheckInPaymentMap(snapshot.payments)
  const ticketRows = flattenCheckInTicketMap(snapshot.tickets)
  const serviceRows = flattenCheckInServiceMap(snapshot.services)
  const sequenceRows = flattenCheckInSequenceMap(snapshot.sequences)
  const guestEditRows = flattenCheckInGuestEditMap(snapshot.guestEdits)
  const noteRows = flattenCheckInNoteMap(snapshot.notes)
  const groupGuideRows = flattenCheckInGroupGuideMap(snapshot.groupGuides)

  if (enrollmentRows.length > 0) {
    const { error } = await supabase.from('check_in_enrollments').upsert(enrollmentRows)
    if (error) throw new Error(`push check-in enrollments: ${error.message}`)
  }
  if (attendanceRows.length > 0) {
    const { error } = await supabase.from('check_in_attendance').upsert(attendanceRows)
    if (error) throw new Error(`push check-in attendance: ${error.message}`)
  }
  if (paymentRows.length > 0) {
    const { error } = await supabase.from('check_in_payments').upsert(paymentRows)
    if (error) throw new Error(`push check-in payments: ${error.message}`)
  }
  if (ticketRows.length > 0) {
    const { error } = await supabase.from('check_in_payments').upsert(ticketRows)
    if (error) throw new Error(`push check-in tickets: ${error.message}`)
  }
  if (serviceRows.length > 0) {
    const { error } = await supabase.from('check_in_services').upsert(serviceRows)
    if (error) throw new Error(`push check-in services: ${error.message}`)
  }
  if (sequenceRows.length > 0) {
    const { error } = await supabase.from('check_in_sequences').upsert(sequenceRows)
    if (error) throw new Error(`push check-in sequences: ${error.message}`)
  }
  if (guestEditRows.length > 0) {
    const { error } = await supabase.from('check_in_guest_edits').upsert(guestEditRows)
    if (error) throw new Error(`push check-in guest edits: ${error.message}`)
  }
  if (noteRows.length > 0) {
    const { error } = await supabase.from('check_in_notes').upsert(noteRows)
    if (error) throw new Error(`push check-in notes: ${error.message}`)
  }
  if (groupGuideRows.length > 0) {
    const { error } = await supabase.from('check_in_group_guides').upsert(groupGuideRows)
    if (error) throw new Error(`push check-in group guides: ${error.message}`)
  }
}

export async function upsertCheckInNoteRow(
  date: string,
  program: Program,
  bookingCode: string,
  note: string,
) {
  const text = note.trim()
  if (!text) {
    await deleteCheckInNoteRow(date, program, bookingCode)
    return
  }
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('check_in_notes').upsert({
    date,
    program,
    booking_code: bookingCode,
    note: text,
  })
  if (error) throw new Error(`upsert check-in note: ${error.message}`)
}

export async function deleteCheckInNoteRow(
  date: string,
  program: Program,
  bookingCode: string,
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from('check_in_notes')
    .delete()
    .eq('date', date)
    .eq('program', program)
    .eq('booking_code', bookingCode)
  if (error) throw new Error(`delete check-in note: ${error.message}`)
}

export async function upsertCheckInGroupGuideRow(
  date: string,
  program: Program,
  bookingCode: string,
  guideName: string,
) {
  const text = guideName.trim().slice(0, 80)
  if (!text) {
    await deleteCheckInGroupGuideRow(date, program, bookingCode)
    return
  }
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('check_in_group_guides').upsert({
    date,
    program,
    booking_code: bookingCode,
    guide_name: text,
  })
  if (error) throw new Error(`upsert check-in group guide: ${error.message}`)
}

export async function deleteCheckInGroupGuideRow(
  date: string,
  program: Program,
  bookingCode: string,
) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from('check_in_group_guides')
    .delete()
    .eq('date', date)
    .eq('program', program)
    .eq('booking_code', bookingCode)
  if (error) throw new Error(`delete check-in group guide: ${error.message}`)
}

async function moveTableDate(
  table: string,
  oldDate: string,
  newDate: string,
  program: Program,
  extra: Record<string, string>,
) {
  const supabase = getSupabaseBrowserClient()
  let dest = supabase.from(table).delete().eq('date', newDate).eq('program', program)
  let source = supabase.from(table).update({ date: newDate }).eq('date', oldDate).eq('program', program)
  for (const [column, value] of Object.entries(extra)) {
    dest = dest.eq(column, value)
    source = source.eq(column, value)
  }
  const destError = (await dest).error
  if (destError) throw new Error(`clear ${table} dest date: ${destError.message}`)
  const { error } = await source
  if (error) throw new Error(`move ${table} date: ${error.message}`)
}

/** Move every check-in row for a booking onto a new travel date. */
export async function moveCheckInBookingDate(
  oldDate: string,
  newDate: string,
  program: Program,
  bookingCode: string,
) {
  if (oldDate === newDate) return
  await moveTableDate('check_in_enrollments', oldDate, newDate, program, {
    booking_code: bookingCode,
  })
  await moveTableDate('check_in_attendance', oldDate, newDate, program, {
    booking_code: bookingCode,
  })
  await moveTableDate('check_in_services', oldDate, newDate, program, {
    booking_code: bookingCode,
  })
  await moveTableDate('check_in_notes', oldDate, newDate, program, {
    booking_code: bookingCode,
  })
  await moveTableDate('check_in_group_guides', oldDate, newDate, program, {
    booking_code: bookingCode,
  })
  await moveTableDate('check_in_guest_edits', oldDate, newDate, program, {
    booking_code: bookingCode,
  })
  await moveTableDate('check_in_sequences', oldDate, newDate, program, {
    booking_code: bookingCode,
  })
  await moveTableDate('check_in_payments', oldDate, newDate, program, {
    seat_key: bookingCode,
  })
  await moveTableDate('check_in_payments', oldDate, newDate, program, {
    seat_key: checkInTicketSeatKey(bookingCode),
  })
}

export function persistQuietly(label: string, task: Promise<unknown>) {
  void task.catch((error) => {
    console.error(`[supabase] ${label}`, error)
  })
}
