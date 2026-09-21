export type Program = 'PP' | 'James Bond'
export type IncludeOption = 'Included' | 'Not Included'
export type PickupZoneName = string
export type BookingStatus = 'Confirmed' | 'Pending Pickup Time' | 'Cancelled'
export type AgentStatus = 'Active' | 'Inactive'

export type BookingActorRole = 'admin' | 'agent'

export type BookingActor = {
  role: BookingActorRole
  name: string
  slug?: string
}

export type BookingEventType =
  | 'created'
  | 'cancelled'
  | 'date_changed'
  | 'rebooked'
  | 'pickup_set'
  | 'details_edited'

export type BookingEvent = {
  id: string
  bookingCode: string
  type: BookingEventType
  summary: string
  actorRole: BookingActorRole
  actorName: string
  actorSlug: string
  createdAt: string
}

export type BookingActionOptions = {
  bypassCutoff?: boolean
  actor?: BookingActor
}

export const CORE_PICKUP_ZONE_NAMES = ['Patong', 'Kata', 'Karon', 'Other'] as const

/** Special pickup choice — guest does not need hotel transfer. */
export const NO_TRANSFER_ZONE = 'No Transfer' as const
export const NO_TRANSFER_TIME = 'No transfer' as const

export function isCorePickupZone(name: string) {
  return CORE_PICKUP_ZONE_NAMES.some((core) => core.toLowerCase() === name.trim().toLowerCase())
}

export function isNoTransfer(zone: string | null | undefined) {
  return (zone ?? '').trim().toLowerCase() === NO_TRANSFER_ZONE.toLowerCase()
}

export type Agent = {
  slug: string
  name: string
  country: string
  status: AgentStatus
}

export type PickupZone = {
  name: PickupZoneName
  time: string
  pending: boolean
}

/** Catalog hotel for agent typeahead; zone null = admin still needs to assign. */
export type Hotel = {
  id: string
  name: string
  zoneName: PickupZoneName | null
  active: boolean
  /**
   * Ops note for hotels with Extra Charge Transfer — shown on agent vouchers
   * when this hotel is used (optional; leave blank if none).
   */
  extraChargeTransfer: string
}

export type Booking = {
  code: string
  agentSlug: string
  agentName: string
  /** Partner voucher number (optional). */
  agentRef: string
  program: Program
  date: string
  parkFee: IncludeOption
  canoe: IncludeOption | null
  adults: number
  children: number
  infants: number
  tourLeaders: number
  leadGuest: string
  pickupZone: PickupZoneName
  pickupHotel: string
  /** Hotel room number for pickup (optional). */
  roomNumber: string
  /** Free-text note for ops / pickup (optional). */
  note: string
  /** Cash to collect on tour — amount or note (optional). */
  cashOnTour: string
  /**
   * Snapshot of hotel Extra Charge Transfer note at booking time
   * (typically for Other-zone hotels). Shown on voucher.
   */
  transferExtraCharge: string
  pickupTime: string
  status: BookingStatus
}

export type Availability = {
  date: string
  ppCapacity: number
  jamesBondCapacity: number
}

/** Admin closed a travel date for a program (storm, boat out, etc.). */
export type BookingClosure = {
  date: string
  program: Program
  reason: string
}

export function bookingClosureKey(date: string, program: Program) {
  return `${date}|${program}`
}

/** Default daily seats when a date has no override stored. */
export const DEFAULT_PP_CAPACITY = 44
export const DEFAULT_JB_CAPACITY = 40

/** Boat assignment for a single departure day + program. */
export type BoatNumber = number

export type DayBoatPlan = {
  date: string
  program: Program
  /**
   * Seats per boat for this day (length = boat count).
   * Default is 3 × {@link DEFAULT_BOAT_CAPACITY}; admin can add/remove boats
   * and set each boat’s capacity (e.g. a larger rental boat).
   */
  capacities: number[]
  /** booking code → boat number (1-based index into capacities) */
  assignments: Record<string, BoatNumber>
}

export const DEFAULT_BOAT_CAPACITY = 44
export const DEFAULT_BOAT_COUNT = 3
export const MAX_DAY_BOATS = 8

/** @deprecated Prefer {@link boatNumbersForPlan} — kept for call sites that assume the default 3. */
export const BOAT_NUMBERS: BoatNumber[] = [1, 2, 3]

export function dayBoatPlanKey(date: string, program: Program) {
  return `${date}|${program}`
}

export function defaultBoatCapacities(count = DEFAULT_BOAT_COUNT): number[] {
  const n = Math.max(1, Math.min(MAX_DAY_BOATS, Math.floor(count) || DEFAULT_BOAT_COUNT))
  return Array.from({ length: n }, () => DEFAULT_BOAT_CAPACITY)
}

export function normalizeBoatCapacities(capacities: number[] | null | undefined): number[] {
  const cleaned = (capacities ?? [])
    .map((value) => Math.max(1, Math.floor(Number(value) || 0)))
    .filter((value) => Number.isFinite(value) && value >= 1)
  if (cleaned.length === 0) return defaultBoatCapacities()
  return cleaned.slice(0, MAX_DAY_BOATS)
}

export function boatNumbersForPlan(plan: Pick<DayBoatPlan, 'capacities'>): BoatNumber[] {
  const caps = normalizeBoatCapacities(plan.capacities)
  return caps.map((_, index) => index + 1)
}

export function emptyDayBoatPlan(date: string, program: Program): DayBoatPlan {
  return {
    date,
    program,
    capacities: defaultBoatCapacities(),
    assignments: {},
  }
}

/** Van / transfer vehicle assignment for a single departure day + program. */
export const DEFAULT_VAN_CAPACITY = 12

/** One leg of a booking on a van (a booking may split across vans). */
export type VanSplit = {
  van: number
  pax: number
  /** Pickup stop order within this van (0 = first hotel). */
  sortOrder: number
}

export type VanMeta = {
  /** Vehicle plate / fleet number for ops. */
  plate: string
  /** Driver name for ops. */
  driver: string
  /** Driver telephone. */
  phone: string
}

/** Remembered van roster — reused across days when day meta is empty. */
export type FleetVan = {
  vanNumber: number
  plate: string
  driver: string
  phone: string
}

export type DayVehiclePlan = {
  date: string
  program: Program
  /** Seats per van — default 12. */
  vanCapacity: number
  /** booking code → one or more van legs */
  assignments: Record<string, VanSplit[]>
  /** Per-van ops fields keyed by van number string */
  vanMeta: Record<string, VanMeta>
}

export function dayVehiclePlanKey(date: string, program: Program) {
  return `${date}|${program}`
}

export function emptyDayVehiclePlan(date: string, program: Program): DayVehiclePlan {
  return {
    date,
    program,
    vanCapacity: DEFAULT_VAN_CAPACITY,
    assignments: {},
    vanMeta: {},
  }
}

export function emptyVanMeta(): VanMeta {
  return { plate: '', driver: '', phone: '' }
}

export type NewBookingDraft = {
  program: Program | null
  parkFee: IncludeOption
  canoe: IncludeOption
  date: string
  adults: number
  children: number
  infants: number
  tourLeaders: number
  leadGuest: string
  pickupZone: PickupZoneName | null
  pickupHotel: string
  roomNumber: string
  note: string
  cashOnTour: string
}

export function totalPassengers(booking: Pick<Booking, 'adults' | 'children' | 'infants' | 'tourLeaders'>) {
  return booking.adults + booking.children + booking.infants + booking.tourLeaders
}

/** Active bookings occupy seats / boats / vans. Cancelled ones free capacity. */
export function isActiveBooking(booking: Pick<Booking, 'status'>) {
  return booking.status !== 'Cancelled'
}

/** Compact pax readout: adults+children+infants+tourLeadersT → e.g. 3+2+1+1T */
export function formatPaxBreakdown(
  booking: Pick<Booking, 'adults' | 'children' | 'infants' | 'tourLeaders'>,
) {
  return `${booking.adults}+${booking.children}+${booking.infants}+${booking.tourLeaders}T`
}
