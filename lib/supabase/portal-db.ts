import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  DEFAULT_BOOKING_CUTOFFS,
  normalizeBeforeDays,
  normalizeCutoffTime,
  type BookingCutoffSettings,
} from '@/lib/booking-cutoffs'
import type {
  Agent,
  AgentStatus,
  Availability,
  BoatNumber,
  Booking,
  DayBoatPlan,
  DayVehiclePlan,
  Hotel,
  PickupZone,
  Program,
  VanMeta,
  VanSplit,
} from '@/lib/types'
import { dayBoatPlanKey, dayVehiclePlanKey, emptyDayBoatPlan, emptyDayVehiclePlan } from '@/lib/types'

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
  transfer_extra_charge?: string | null
  pickup_time: string
  status: Booking['status']
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
}

type BoatAssignmentRow = {
  date: string
  program: Program
  booking_code: string
  boat_number: number
}

type VehiclePlanRow = {
  date: string
  program: Program
  van_capacity: number
}

type VanMetaRow = {
  date: string
  program: Program
  van_number: number
  plate: string
  driver: string
}

type VanAssignmentRow = {
  date: string
  program: Program
  booking_code: string
  van_number: number
  pax: number
}

type BookingCutoffRow = {
  id: string
  timezone: string
  book_before_days: number
  book_until_time: string
  cancel_before_days: number
  cancel_until_time: string
}

export type PortalSnapshot = {
  agents: Agent[]
  zones: PickupZone[]
  hotels: Hotel[]
  bookings: Booking[]
  availability: Availability[]
  dayBoatPlans: Record<string, DayBoatPlan>
  dayVehiclePlans: Record<string, DayVehiclePlan>
  bookingCutoffs: BookingCutoffSettings
}

function asDateString(value: string) {
  return value.slice(0, 10)
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
    transferExtraCharge: row.transfer_extra_charge ?? '',
    pickupTime: row.pickup_time,
    status: row.status,
  }
}

function bookingToRow(booking: Booking): BookingRow {
  return {
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
    transfer_extra_charge: booking.transferExtraCharge ?? '',
    pickup_time: booking.pickupTime,
    status: booking.status,
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
  return {
    timezone: DEFAULT_BOOKING_CUTOFFS.timezone,
    bookBeforeDays: normalizeBeforeDays(row.book_before_days),
    bookUntilTime: bookUntil,
    cancelBeforeDays: normalizeBeforeDays(row.cancel_before_days),
    cancelUntilTime: cancelUntil,
  }
}

function buildBoatPlans(
  plans: BoatPlanRow[],
  assignments: BoatAssignmentRow[],
): Record<string, DayBoatPlan> {
  const next: Record<string, DayBoatPlan> = {}
  for (const plan of plans) {
    const date = asDateString(plan.date)
    const key = dayBoatPlanKey(date, plan.program)
    next[key] = {
      date,
      program: plan.program,
      capacities: [plan.capacity_1, plan.capacity_2, plan.capacity_3],
      assignments: {},
    }
  }
  for (const row of assignments) {
    const date = asDateString(row.date)
    const key = dayBoatPlanKey(date, row.program)
    const plan = next[key] ?? emptyDayBoatPlan(date, row.program)
    plan.assignments[row.booking_code] = row.boat_number as BoatNumber
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
    }
  }
  for (const meta of metas) {
    const date = asDateString(meta.date)
    const key = dayVehiclePlanKey(date, meta.program)
    const plan = next[key] ?? emptyDayVehiclePlan(date, meta.program)
    plan.vanMeta[String(meta.van_number)] = {
      plate: meta.plate ?? '',
      driver: meta.driver ?? '',
    }
    next[key] = plan
  }
  for (const row of assignments) {
    const date = asDateString(row.date)
    const key = dayVehiclePlanKey(date, row.program)
    const plan = next[key] ?? emptyDayVehiclePlan(date, row.program)
    const legs = plan.assignments[row.booking_code] ?? []
    legs.push({ van: row.van_number, pax: row.pax })
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

  const [
    agentsRes,
    zonesRes,
    hotelsRes,
    bookingsRes,
    availabilityRes,
    boatPlansRes,
    boatAssignRes,
    vehiclePlansRes,
    vanMetaRes,
    vanAssignRes,
    cutoffsRes,
  ] = await Promise.all([
    supabase.from('agents').select('*').order('name'),
    supabase.from('pickup_zones').select('*').order('sort_order'),
    supabase.from('hotels').select('*').order('name'),
    supabase.from('bookings').select('*').order('date', { ascending: false }),
    supabase.from('availability').select('*').order('date'),
    supabase.from('day_boat_plans').select('*'),
    supabase.from('boat_assignments').select('*'),
    supabase.from('day_vehicle_plans').select('*'),
    supabase.from('van_meta').select('*'),
    supabase.from('van_assignments').select('*'),
    supabase.from('booking_cutoffs').select('*').eq('id', 'default').maybeSingle(),
  ])

  await assertOk('agents', agentsRes.error, agentsRes.data)
  await assertOk('pickup_zones', zonesRes.error, zonesRes.data)
  await assertOk('bookings', bookingsRes.error, bookingsRes.data)
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

  let bookingCutoffs = { ...DEFAULT_BOOKING_CUTOFFS }
  if (cutoffsRes.error) {
    console.warn(
      '[supabase] booking_cutoffs table unavailable — run supabase/add-booking-cutoffs.sql',
      cutoffsRes.error.message,
    )
  } else {
    bookingCutoffs = mapBookingCutoffs(cutoffsRes.data as BookingCutoffRow | null)
  }

  return {
    agents: (agentsRes.data as AgentRow[]).map(mapAgent),
    zones: (zonesRes.data as ZoneRow[]).map(mapZone),
    hotels,
    bookings: (bookingsRes.data as BookingRow[]).map(mapBooking),
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
    bookingCutoffs,
  }
}

export async function insertBooking(booking: Booking) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('bookings').insert(bookingToRow(booking))
  if (error) throw new Error(`insert booking: ${error.message}`)
}

export async function updateBookingStatus(code: string, status: Booking['status']) {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from('bookings').update({ status }).eq('code', code)
  if (error) throw new Error(`update booking status: ${error.message}`)
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

export async function saveDayBoatPlan(plan: DayBoatPlan) {
  const supabase = getSupabaseBrowserClient()
  const { error: planError } = await supabase.from('day_boat_plans').upsert({
    date: plan.date,
    program: plan.program,
    capacity_1: plan.capacities[0],
    capacity_2: plan.capacities[1],
    capacity_3: plan.capacities[2],
  })
  if (planError) throw new Error(`upsert boat plan: ${planError.message}`)

  const { error: delError } = await supabase
    .from('boat_assignments')
    .delete()
    .eq('date', plan.date)
    .eq('program', plan.program)
  if (delError) throw new Error(`clear boat assignments: ${delError.message}`)

  const rows = Object.entries(plan.assignments).map(([booking_code, boat_number]) => ({
    date: plan.date,
    program: plan.program,
    booking_code,
    boat_number,
  }))
  if (rows.length === 0) return

  const { error: insertError } = await supabase.from('boat_assignments').insert(rows)
  if (insertError) throw new Error(`insert boat assignments: ${insertError.message}`)
}

export async function saveDayVehiclePlan(plan: DayVehiclePlan) {
  const supabase = getSupabaseBrowserClient()
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

  const metaRows = Object.entries(plan.vanMeta ?? {}).map(([van, meta]) => ({
    date: plan.date,
    program: plan.program,
    van_number: Number(van),
    plate: (meta as VanMeta).plate ?? '',
    driver: (meta as VanMeta).driver ?? '',
  }))
  if (metaRows.length > 0) {
    const { error } = await supabase.from('van_meta').insert(metaRows)
    if (error) throw new Error(`insert van meta: ${error.message}`)
  }

  const assignRows: Array<{
    date: string
    program: Program
    booking_code: string
    van_number: number
    pax: number
  }> = []
  for (const [booking_code, legs] of Object.entries(plan.assignments ?? {})) {
    for (const leg of legs as VanSplit[]) {
      assignRows.push({
        date: plan.date,
        program: plan.program,
        booking_code,
        van_number: leg.van,
        pax: leg.pax,
      })
    }
  }
  if (assignRows.length === 0) return

  const { error: insertError } = await supabase.from('van_assignments').insert(assignRows)
  if (insertError) throw new Error(`insert van assignments: ${insertError.message}`)
}

export async function upsertBookingCutoffs(settings: BookingCutoffSettings) {
  const supabase = getSupabaseBrowserClient()
  const bookUntil =
    normalizeCutoffTime(settings.bookUntilTime) ?? DEFAULT_BOOKING_CUTOFFS.bookUntilTime
  const cancelUntil =
    normalizeCutoffTime(settings.cancelUntilTime) ?? DEFAULT_BOOKING_CUTOFFS.cancelUntilTime
  const { error } = await supabase.from('booking_cutoffs').upsert({
    id: 'default',
    timezone: DEFAULT_BOOKING_CUTOFFS.timezone,
    book_before_days: normalizeBeforeDays(settings.bookBeforeDays),
    book_until_time: bookUntil,
    cancel_before_days: normalizeBeforeDays(settings.cancelBeforeDays),
    cancel_until_time: cancelUntil,
  })
  if (error) throw new Error(`upsert booking cutoffs: ${error.message}`)
}

export function persistQuietly(label: string, task: Promise<unknown>) {
  void task.catch((error) => {
    console.error(`[supabase] ${label}`, error)
  })
}
