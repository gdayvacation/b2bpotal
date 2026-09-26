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
  /** Admin back-office override: skip agent cutoffs and program closures. Boat capacity still applies. */
  bypassCutoff?: boolean
  actor?: BookingActor
  /**
   * Extra late-change fee (THB) to add on this action.
   * Admin can set 0 (complimentary) or any amount; agents ignore this and use the rule.
   */
  lateChangeFee?: number
  /** Admin cancel: override late-cancel rule. */
  lateCancel?: boolean
  /** Admin cancel: exact THB to bill (0 = no charge). */
  cancelFee?: number
}

export const CORE_PICKUP_ZONE_NAMES = ['Patong', 'Kata', 'Karon', 'Other'] as const

/** Special pickup choice — guest does not need hotel transfer. */
export const NO_TRANSFER_ZONE = 'No Transfer' as const
export const NO_TRANSFER_TIME = 'No transfer' as const

/** Dedicated private car/van — billed to agent in back office only. */
export const PRIVATE_TRANSFER_ZONE = 'Private' as const

export type PrivateTransferVehicle = 'Car' | 'Van'

export const PRIVATE_TRANSFER_OPTIONS: ReadonlyArray<{
  vehicle: PrivateTransferVehicle
  priceThb: number
  label: string
}> = [
  { vehicle: 'Car', priceThb: 1400, label: 'Car · 1,400 THB' },
  { vehicle: 'Van', priceThb: 1600, label: 'Van · 1,600 THB' },
]

export function formatPrivateTransferPrice(priceThb: number) {
  return `${priceThb.toLocaleString('en-US')} THB`
}

export function privateTransferPriceFor(vehicle: PrivateTransferVehicle) {
  const option = PRIVATE_TRANSFER_OPTIONS.find((item) => item.vehicle === vehicle)
  return option ? formatPrivateTransferPrice(option.priceThb) : ''
}

export function isCorePickupZone(name: string) {
  return CORE_PICKUP_ZONE_NAMES.some((core) => core.toLowerCase() === name.trim().toLowerCase())
}

export function isNoTransfer(zone: string | null | undefined) {
  return (zone ?? '').trim().toLowerCase() === NO_TRANSFER_ZONE.toLowerCase()
}

export function isPrivateTransferZone(zone: string | null | undefined) {
  return (zone ?? '').trim().toLowerCase() === PRIVATE_TRANSFER_ZONE.toLowerCase()
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
  /**
   * Private transfer vehicle (Car/Van). Empty when not a private transfer.
   * Price + driver are back-office / agent billing only — not shown on vouchers.
   */
  privateTransferVehicle: '' | PrivateTransferVehicle
  privateTransferPrice: string
  privateDriverName: string
  privateDriverPhone: string
  pickupTime: string
  status: BookingStatus
  /**
   * Accumulated late date-change fee billed to the agency (THB).
   * +300 per AD / CH after the late-fee time; infant and tour leader are free.
   */
  lateChangeFee?: number
  /** Agent cancelled after the late-fee time — invoice at full tour price. */
  lateCancel?: boolean
  /** Admin-set cancel charge (THB). 0 = complimentary. Unset = follow lateCancel rule. */
  cancelFee?: number
}

export function isPrivateTransfer(
  booking: Pick<Booking, 'pickupZone' | 'privateTransferVehicle'> | null | undefined,
) {
  if (!booking) return false
  return (
    Boolean(booking.privateTransferVehicle?.trim()) || isPrivateTransferZone(booking.pickupZone)
  )
}

/** Shared join transfer (fleet vans) — not No Transfer and not Private. */
export function isJoinTransfer(
  booking: Pick<Booking, 'pickupZone' | 'privateTransferVehicle'> | null | undefined,
) {
  if (!booking) return false
  return !isNoTransfer(booking.pickupZone) && !isPrivateTransfer(booking)
}

export function emptyPrivateTransferFields(): Pick<
  Booking,
  'privateTransferVehicle' | 'privateTransferPrice' | 'privateDriverName' | 'privateDriverPhone'
> {
  return {
    privateTransferVehicle: '',
    privateTransferPrice: '',
    privateDriverName: '',
    privateDriverPhone: '',
  }
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
export type BoatKind = 'own' | 'partner'

export type DayBoatPlan = {
  date: string
  program: Program
  /**
   * Seats per boat for this day (length = boat count).
   * Default is 3 × {@link DEFAULT_BOAT_CAPACITY}; admin can add/remove boats
   * and set each boat’s capacity (e.g. a larger rental boat).
   */
  capacities: number[]
  /** Optional display names parallel to capacities (empty → "Boat N"). */
  names: string[]
  /** Free fleet number text for partner boats (own boats ignore this). */
  labels: string[]
  /** Own fleet vs overflow sent to another company. */
  kinds: BoatKind[]
  /** Guide + assistant contact per boat (parallel to capacities). */
  guides: BoatGuide[]
  /** booking code → boat number (1-based index into capacities) */
  assignments: Record<string, BoatNumber>
}

/** Guide job-order contacts for one boat on a day. */
export type BoatGuide = {
  guideName: string
  guidePhone: string
  assistantName: string
  assistantPhone: string
}

export const DEFAULT_BOAT_CAPACITY = 50
/** Previous default still stored on older day boat plans. */
export const LEGACY_BOAT_CAPACITY = 44
export const DEFAULT_BOAT_COUNT = 3
export const MAX_DAY_BOATS = 12
/** Overflow boat sent to another company — no seat cap of our own. */
export const PARTNER_BOAT_CAPACITY = 200
/** Display labels start at Boat 7 (fleet slot 1 → "Boat 7", 2 → "Boat 8", …). */
export const DEFAULT_BOAT_LABEL_START = 7
const PARTNER_NAME_MARK = '\u2060P|'

/** @deprecated Prefer {@link boatNumbersForPlan} — kept for call sites that assume the default 3. */
export const BOAT_NUMBERS: BoatNumber[] = [1, 2, 3]

export function defaultBoatLabel(boat: BoatNumber): string {
  return `Boat ${DEFAULT_BOAT_LABEL_START + boat - 1}`
}

export function dayBoatPlanKey(date: string, program: Program) {
  return `${date}|${program}`
}

export function defaultBoatCapacities(count = DEFAULT_BOAT_COUNT): number[] {
  const n = Math.max(1, Math.min(MAX_DAY_BOATS, Math.floor(count) || DEFAULT_BOAT_COUNT))
  return Array.from({ length: n }, () => DEFAULT_BOAT_CAPACITY)
}

export function defaultBoatNames(count = DEFAULT_BOAT_COUNT): string[] {
  const n = Math.max(1, Math.min(MAX_DAY_BOATS, Math.floor(count) || DEFAULT_BOAT_COUNT))
  return Array.from({ length: n }, () => '')
}

export function defaultBoatLabels(count = DEFAULT_BOAT_COUNT): string[] {
  const n = Math.max(1, Math.min(MAX_DAY_BOATS, Math.floor(count) || DEFAULT_BOAT_COUNT))
  return Array.from({ length: n }, () => '')
}

export function defaultBoatKinds(count = DEFAULT_BOAT_COUNT): BoatKind[] {
  const n = Math.max(1, Math.min(MAX_DAY_BOATS, Math.floor(count) || DEFAULT_BOAT_COUNT))
  return Array.from({ length: n }, () => 'own')
}

export function packBoatName(kind: BoatKind, label: string, name: string): string {
  if (kind !== 'partner') return name.trim().slice(0, 40)
  return `${PARTNER_NAME_MARK}${label.trim().slice(0, 20)}|${name.trim().slice(0, 40)}`
}

export function unpackBoatName(raw: string): { kind: BoatKind; label: string; name: string } {
  const text = String(raw ?? '')
  if (!text.startsWith(PARTNER_NAME_MARK)) {
    return { kind: 'own', label: '', name: text.trim() }
  }
  const rest = text.slice(PARTNER_NAME_MARK.length)
  const pipe = rest.indexOf('|')
  if (pipe < 0) return { kind: 'partner', label: rest.trim(), name: '' }
  return {
    kind: 'partner',
    label: rest.slice(0, pipe).trim(),
    name: rest.slice(pipe + 1).trim(),
  }
}

export function emptyBoatGuide(): BoatGuide {
  return { guideName: '', guidePhone: '', assistantName: '', assistantPhone: '' }
}

export function defaultBoatGuides(count = DEFAULT_BOAT_COUNT): BoatGuide[] {
  const n = Math.max(1, Math.min(MAX_DAY_BOATS, Math.floor(count) || DEFAULT_BOAT_COUNT))
  return Array.from({ length: n }, () => emptyBoatGuide())
}

export function normalizeBoatGuides(
  guides: BoatGuide[] | null | undefined,
  boatCount: number,
): BoatGuide[] {
  const count = Math.max(1, Math.min(MAX_DAY_BOATS, boatCount || DEFAULT_BOAT_COUNT))
  const source = Array.isArray(guides) ? guides : []
  return Array.from({ length: count }, (_, index) => {
    const raw = source[index]
    if (!raw || typeof raw !== 'object') return emptyBoatGuide()
    return {
      guideName: String(raw.guideName ?? '').trim().slice(0, 60),
      guidePhone: String(raw.guidePhone ?? '').trim().slice(0, 30),
      assistantName: String(raw.assistantName ?? '').trim().slice(0, 60),
      assistantPhone: String(raw.assistantPhone ?? '').trim().slice(0, 30),
    }
  })
}

export function normalizeBoatCapacities(capacities: number[] | null | undefined): number[] {
  const cleaned = (capacities ?? [])
    .map((value) => Math.max(1, Math.floor(Number(value) || 0)))
    .filter((value) => Number.isFinite(value) && value >= 1)
  if (cleaned.length === 0) return defaultBoatCapacities()
  return cleaned.slice(0, MAX_DAY_BOATS)
}

/** Lift leftover 44-pax defaults to the current 50-pax default. */
export function replaceLegacyBoatCapacity(capacities: number[] | null | undefined): number[] {
  return normalizeBoatCapacities(capacities).map((cap) =>
    cap === LEGACY_BOAT_CAPACITY ? DEFAULT_BOAT_CAPACITY : cap,
  )
}

export function normalizeBoatNames(
  names: string[] | null | undefined,
  boatCount: number,
): string[] {
  const count = Math.max(1, Math.min(MAX_DAY_BOATS, boatCount || DEFAULT_BOAT_COUNT))
  const source = Array.isArray(names) ? names : []
  return Array.from({ length: count }, (_, index) =>
    unpackBoatName(String(source[index] ?? '')).name.slice(0, 40),
  )
}

export function normalizeBoatLabels(
  labels: string[] | null | undefined,
  boatCount: number,
): string[] {
  const count = Math.max(1, Math.min(MAX_DAY_BOATS, boatCount || DEFAULT_BOAT_COUNT))
  const source = Array.isArray(labels) ? labels : []
  return Array.from({ length: count }, (_, index) =>
    String(source[index] ?? '')
      .trim()
      .slice(0, 20),
  )
}

export function normalizeBoatKinds(
  kinds: Array<BoatKind | string> | null | undefined,
  boatCount: number,
): BoatKind[] {
  const count = Math.max(1, Math.min(MAX_DAY_BOATS, boatCount || DEFAULT_BOAT_COUNT))
  const source = Array.isArray(kinds) ? kinds : []
  return Array.from({ length: count }, (_, index) =>
    source[index] === 'partner' ? 'partner' : 'own',
  )
}

export function hydrateDayBoatPlan<T extends DayBoatPlan>(plan: T): T {
  const capacities = normalizeBoatCapacities(plan.capacities)
  const count = capacities.length
  const kinds = normalizeBoatKinds(plan.kinds, count)
  const labels = normalizeBoatLabels(plan.labels, count)
  const names = normalizeBoatNames(plan.names, count)
  const sourceNames = Array.isArray(plan.names) ? plan.names : []
  for (let index = 0; index < count; index += 1) {
    const packed = unpackBoatName(String(sourceNames[index] ?? ''))
    if (packed.kind === 'partner') {
      kinds[index] = 'partner'
      if (packed.label) labels[index] = packed.label.slice(0, 20)
      names[index] = packed.name.slice(0, 40)
    }
    if (kinds[index] === 'partner' && capacities[index] === DEFAULT_BOAT_CAPACITY) {
      capacities[index] = PARTNER_BOAT_CAPACITY
    }
  }
  return {
    ...plan,
    capacities,
    names,
    labels,
    kinds,
    guides: normalizeBoatGuides(plan.guides, count),
  }
}

export function isPartnerBoat(
  plan: Pick<DayBoatPlan, 'capacities' | 'kinds' | 'names'>,
  boat: BoatNumber,
): boolean {
  const caps = normalizeBoatCapacities(plan.capacities)
  if (normalizeBoatKinds(plan.kinds, caps.length)[boat - 1] === 'partner') return true
  const raw = Array.isArray(plan.names) ? String(plan.names[boat - 1] ?? '') : ''
  return unpackBoatName(raw).kind === 'partner'
}

export function persistBoatNames(plan: Pick<DayBoatPlan, 'capacities' | 'names' | 'labels' | 'kinds'>): string[] {
  const hydrated = hydrateDayBoatPlan({
    date: '',
    program: 'PP',
    capacities: plan.capacities,
    names: plan.names ?? [],
    labels: plan.labels ?? [],
    kinds: plan.kinds ?? [],
    guides: [],
    assignments: {},
  })
  return hydrated.kinds.map((kind, index) =>
    packBoatName(kind, hydrated.labels[index] ?? '', hydrated.names[index] ?? ''),
  )
}

export function boatNumbersForPlan(plan: Pick<DayBoatPlan, 'capacities'>): BoatNumber[] {
  const caps = normalizeBoatCapacities(plan.capacities)
  return caps.map((_, index) => index + 1)
}

export function boatDisplayName(
  plan: Pick<DayBoatPlan, 'names' | 'capacities' | 'kinds' | 'labels'>,
  boat: BoatNumber,
): string {
  const hydrated = hydrateDayBoatPlan({
    date: '',
    program: 'PP',
    capacities: plan.capacities,
    names: plan.names ?? [],
    labels: plan.labels ?? [],
    kinds: plan.kinds ?? [],
    guides: [],
    assignments: {},
  })
  if (hydrated.kinds[boat - 1] === 'partner') {
    const label = hydrated.labels[boat - 1]?.trim()
    const name = hydrated.names[boat - 1]?.trim()
    if (label && name) return `${label} · ${name}`
    if (name) return name
    if (label) return `Boat ${label}`
    return 'Send to Partner'
  }
  const custom = hydrated.names[boat - 1]?.trim()
  return custom || defaultBoatLabel(boat)
}

export function emptyDayBoatPlan(date: string, program: Program): DayBoatPlan {
  const capacities = defaultBoatCapacities()
  return {
    date,
    program,
    capacities,
    names: defaultBoatNames(capacities.length),
    labels: defaultBoatLabels(capacities.length),
    kinds: defaultBoatKinds(capacities.length),
    guides: defaultBoatGuides(capacities.length),
    assignments: {},
  }
}

/** Marina check-in attendance for a booking on a departure day. */
export type CheckInAttendance = 'checked' | 'no-show'

/** date|program → booking code → attendance */
export type DayCheckInAttendanceMap = Record<string, Record<string, CheckInAttendance>>

/** Van / transfer vehicle assignment for a single departure day + program. */
export const DEFAULT_VAN_CAPACITY = 12

/** One leg of a booking on a van (a booking may split across vans). */
export type VanSplit = {
  van: number
  pax: number
  /** Pickup stop order within this van (0 = first hotel). */
  sortOrder: number
}

export type SpecialTransferKind = 'private' | 'other' | 'partner'

export type VanMeta = {
  /** Vehicle plate / fleet number for ops. */
  plate: string
  /** Display name for private / partner vans. */
  label?: string
  /** Driver name for ops. */
  driver: string
  /** Driver telephone. */
  phone: string
  /** Seats for this van on this day. Omit to use the day default. */
  capacity?: number
  /** Hired from an outside van company for this day. */
  outsourced?: boolean
  /** Outside company name when outsourced or tour partner. */
  outsourceCompany?: string
  /** Extra van: Private Van, Other Service, or Tour Partner. */
  specialKind?: SpecialTransferKind
  transferIn?: boolean
  transferOut?: boolean
  /** Charge in THB for outsource / private — used to check and pay. */
  chargeAmount?: number
}

const VAN_LABEL_MARK = '\u2060|'

export function packVanPlate(label: string, plate: string) {
  const name = label.trim()
  const number = plate.trim()
  if (!name) return number
  return `${name}${VAN_LABEL_MARK}${number}`
}

export function unpackVanPlate(raw: string | null | undefined): { label: string; plate: string } {
  const text = String(raw ?? '')
  const index = text.indexOf(VAN_LABEL_MARK)
  if (index < 0) return { label: '', plate: text.trim() }
  return {
    label: text.slice(0, index).trim(),
    plate: text.slice(index + VAN_LABEL_MARK.length).trim(),
  }
}

export function isSpecialTransferKind(value: unknown): value is SpecialTransferKind {
  return value === 'private' || value === 'other' || value === 'partner'
}

export function isSpecialTransfer(meta?: Pick<VanMeta, 'specialKind'> | null) {
  return meta?.specialKind === 'private' || meta?.specialKind === 'other'
}

export function specialTransferKindLabel(kind?: SpecialTransferKind | null) {
  if (kind === 'private') return 'Private Van'
  if (kind === 'other') return 'Other Service'
  if (kind === 'partner') return 'Tour Partner Van'
  return ''
}

export function specialTransferDirectionLabel(
  meta?: Pick<VanMeta, 'transferIn' | 'transferOut'> | null,
) {
  if (!meta) return ''
  const parts: string[] = []
  if (meta.transferIn) parts.push('Transfer In')
  if (meta.transferOut) parts.push('Transfer Out')
  return parts.join(' · ')
}

export function normalizeChargeAmount(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount)
}

export function vanHasSavedMeta(meta?: VanMeta | null) {
  if (!meta) return false
  return (
    Boolean(meta.driver?.trim()) ||
    Boolean(meta.plate?.trim()) ||
    Boolean(meta.phone?.trim()) ||
    meta.outsourced === true ||
    isSpecialTransfer(meta) ||
    meta.specialKind === 'partner' ||
    Boolean(meta.label?.trim()) ||
    normalizeChargeAmount(meta.chargeAmount) > 0
  )
}

export const VAN_OUTSOURCE_COMPANIES = ['Somjit', '888', 'Ao', 'Cash'] as const
export type VanOutsourceCompany = (typeof VAN_OUTSOURCE_COMPANIES)[number]

export function isVanOutsourceCompany(value: string): value is VanOutsourceCompany {
  return (VAN_OUTSOURCE_COMPANIES as readonly string[]).includes(value)
}

export function vanOutsourceLabel(meta: Pick<VanMeta, 'outsourced' | 'outsourceCompany'>) {
  if (!meta.outsourced) return ''
  const company = meta.outsourceCompany?.trim()
  return company ? `Outsource · ${company}` : 'Outsource'
}

export const MIN_VAN_CAPACITY = 1
export const MAX_VAN_CAPACITY = 40

/** Ops bucket — guest is not picked up by any van. */
export const NO_TRANSFER_VAN_NUMBER = 97
export const NO_TRANSFER_VAN_LABEL = 'No Transfers'

/** Overflow sent to another company — not a real fleet van. */
export const DUMMY_VAN_NUMBER = 99
export const DUMMY_VAN_LABEL = 'Send to Partner'

export const TRANSFER_KINDS = [
  'company',
  'outsource',
  'no_transfer',
  'private',
  'partner',
] as const
export type TransferKind = (typeof TRANSFER_KINDS)[number]
export type BookingTransferKind = TransferKind | 'unassigned'

export const TRANSFER_KIND_LABELS: Record<TransferKind, string> = {
  company: 'Company van',
  outsource: 'Outsource van',
  no_transfer: 'No transfers',
  private: 'Private transfers',
  partner: 'Tour partner van',
}

export function isDummyVan(van: number | null | undefined) {
  return van === DUMMY_VAN_NUMBER
}

export function isNoTransferVan(van: number | null | undefined) {
  return van === NO_TRANSFER_VAN_NUMBER
}

/** Partner / no-transfer buckets — not a real fleet van. */
export function isVirtualVan(van: number | null | undefined) {
  return isDummyVan(van) || isNoTransferVan(van)
}

export function dummyVanMeta(): VanMeta {
  return { plate: DUMMY_VAN_LABEL, driver: '', phone: '' }
}

export function noTransferVanMeta(): VanMeta {
  return { plate: NO_TRANSFER_VAN_LABEL, driver: '', phone: '' }
}

export function vanTransferKind(
  van: number,
  meta?: Pick<VanMeta, 'outsourced' | 'specialKind'> | null,
): TransferKind {
  if (isDummyVan(van)) return 'partner'
  if (isNoTransferVan(van)) return 'no_transfer'
  if (meta?.specialKind === 'partner') return 'partner'
  if (meta?.specialKind === 'private') return 'private'
  if (meta?.outsourced === true) return 'outsource'
  return 'company'
}

export function bookingTransferKind(
  booking: Pick<Booking, 'code' | 'pickupZone' | 'privateTransferVehicle'>,
  plan: Pick<DayVehiclePlan, 'assignments' | 'vanMeta'>,
  boatPlan?: Pick<DayBoatPlan, 'capacities' | 'kinds' | 'names' | 'assignments'> | null,
): BookingTransferKind {
  const legs = plan.assignments[booking.code] ?? []
  const vans = [...new Set(legs.map((leg) => leg.van).filter((van) => van > 0))]
  if (vans.some((van) => isDummyVan(van))) return 'partner'
  if (vans.some((van) => isNoTransferVan(van))) return 'no_transfer'
  const kinds = vans.map((van) => vanTransferKind(van, plan.vanMeta[String(van)]))
  if (kinds.includes('private')) return 'private'
  if (kinds.includes('outsource')) return 'outsource'
  if (kinds.includes('company')) return 'company'
  if (isNoTransfer(booking.pickupZone)) return 'no_transfer'
  if (isPrivateTransfer(booking)) return 'private'
  if (boatPlan && bookingOnPartnerBoat(boatPlan, booking.code)) return 'partner'
  return 'unassigned'
}

export function bookingOnPartnerBoat(
  plan: Pick<DayBoatPlan, 'capacities' | 'kinds' | 'names' | 'assignments'>,
  bookingCode: string,
) {
  const boat = plan.assignments[bookingCode]
  return Boolean(boat && isPartnerBoat(plan, boat))
}

export function clampVanCapacity(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_VAN_CAPACITY
  return Math.min(MAX_VAN_CAPACITY, Math.max(MIN_VAN_CAPACITY, Math.floor(value)))
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

/** Per-van seats for a day — custom if set, otherwise the day default. */
export function vanSeatCapacity(
  plan: Pick<DayVehiclePlan, 'vanCapacity' | 'vanMeta'>,
  van: number,
) {
  if (isVirtualVan(van)) return PARTNER_BOAT_CAPACITY
  const custom = plan.vanMeta[String(van)]?.capacity
  if (typeof custom === 'number' && Number.isFinite(custom) && custom >= MIN_VAN_CAPACITY) {
    return clampVanCapacity(custom)
  }
  return plan.vanCapacity || DEFAULT_VAN_CAPACITY
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

/** AD + CH only — infants and tour leaders are free for late date-change fees. */
export function chargeablePax(booking: Pick<Booking, 'adults' | 'children'>) {
  return Math.max(0, booking.adults + booking.children)
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
