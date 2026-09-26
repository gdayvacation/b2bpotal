'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { nextBookingCode, todayISO, uniqueAgentSlug } from '@/lib/format'
import { autoAssignBoats } from '@/lib/boat-assign'
import {
  CHECK_IN_ATTENDANCE_STORAGE_KEY,
  getCheckInAttendance,
  loadCheckInAttendanceMap,
  saveCheckInAttendanceMap,
  withCheckInAttendance,
} from '@/lib/check-in-attendance'
import {
  CHECK_IN_PAYMENT_STORAGE_KEY,
  getCheckInPayment,
  loadCheckInPaymentMap,
  saveCheckInPaymentMap,
  withCheckInPayment,
  type CheckInPaymentStatus,
  type DayCheckInPaymentMap,
} from '@/lib/check-in-payment'
import {
  CHECK_IN_TICKET_STORAGE_KEY,
  adoptLegacyPaymentsAsTickets,
  getCheckInTicket,
  loadCheckInTicketMap,
  saveCheckInTicketMap,
  withCheckInTicket,
  type CheckInTicketStatus,
  type DayCheckInTicketMap,
} from '@/lib/check-in-ticket'
import {
  CHECK_IN_SERVICE_STORAGE_KEY,
  getCheckInServices,
  loadCheckInServiceMap,
  saveCheckInServiceMap,
  withCheckInServices,
  type CheckInServiceLine,
  type DayCheckInServiceMap,
} from '@/lib/check-in-services'
import {
  CHECK_IN_SEQUENCE_STORAGE_KEY,
  buildGuestSequenceMap,
  getCheckInSequenceStarts,
  loadCheckInSequenceMap,
  saveCheckInSequenceMap,
  withCheckInSequenceBookingStart,
  withCheckInSequenceProgramStart,
  PROGRAM_SEQUENCE_BOOKING_KEY,
  type DayCheckInSequenceMap,
  type GuestSequenceBlock,
} from '@/lib/check-in-sequence'
import {
  CHECK_IN_GUEST_EDIT_STORAGE_KEY,
  getCheckInGuestEditIds,
  isCheckInGuestEditOpen,
  loadCheckInGuestEditMap,
  saveCheckInGuestEditMap,
  withCheckInGuestEdit,
  type DayCheckInGuestEditMap,
} from '@/lib/check-in-guest-edit'
import {
  CHECK_IN_NOTE_STORAGE_KEY,
  getCheckInNote,
  loadCheckInNoteMap,
  saveCheckInNoteMap,
  withCheckInNote,
  type DayCheckInNoteMap,
} from '@/lib/check-in-notes'
import {
  CHECK_IN_ENROLLMENT_STORAGE_KEY,
  enrolledSeatCount,
  getCheckInEnrollments,
  loadCheckInEnrollmentMap,
  newEnrollmentId,
  saveCheckInEnrollmentMap,
  trimCheckInEnrollmentsToSeats,
  withoutCheckInEnrollment,
  withCheckInEnrollment,
  withUpdatedCheckInEnrollment,
  type CheckInEnrollment,
  type CheckInScope,
  type DayCheckInEnrollmentMap,
} from '@/lib/check-in-enrollment'
import {
  CHECK_IN_BOOKED_PAX_STORAGE_KEY,
  hydrateBookedPaxMap,
  loadBookedPaxMap,
} from '@/lib/check-in-booked-pax'
import {
  fetchCheckInBookedPax,
  pushCheckInBookedPax,
} from '@/lib/supabase/booked-pax-db'
import { matchNationality } from '@/lib/nationalities'
import {
  adoptAllVansOntoSharedBoats,
  adoptVanBookingsOntoSharedBoat,
  canFitBookingOnBoat,
} from '@/lib/boat-load'
import { autoAssignVans, bookingPaxOnVan, nextSortOrderForVan, normalizeAssignments, reorderVanAssignments } from '@/lib/vehicle-assign'
import {
  bookingClosedMessage,
  cancelClosedMessage,
  dateChangeFeeAmount,
  DEFAULT_BOOKING_CUTOFFS,
  earliestBookableTravelDate,
  formatThbAmount,
  isBookingOpenForDate,
  isCancelOpenForDate,
  isLateAmendmentForDate,
  isLateFeeTimeForDate,
  normalizeBeforeDays,
  normalizeCutoffTime,
  normalizeDateChangeFee,
  type BookingCutoffSettings,
} from '@/lib/booking-cutoffs'
import {
  deleteAgent,
  deleteBookingClosures,
  deleteCheckInAttendanceRow,
  deleteCheckInEnrollment,
  deleteCheckInNoteRow,
  deleteCheckInPaymentRow,
  deleteCheckInTicketRow,
  deleteHotel,
  deleteZone,
  fetchBookingEvents,
  fetchBookings,
  fetchCheckInMaps,
  fetchDayBoatPlans,
  insertBooking,
  insertBookingEvent,
  loadPortalSnapshot,
  persistQuietly,
  pushCheckInMaps,
  replaceCheckInEnrollmentsForBooking,
  replaceCheckInServicesForBooking,
  saveDayBoatPlan,
  saveDayVehiclePlan,
  subscribeBookings,
  type CheckInMapsSnapshot,
  updateBookingDate,
  updateBookingDetails,
  updateBookingPickup,
  updateBookingRebook,
  updateBookingStatus,
  updateBookingsAgentName,
  upsertAgent,
  upsertAvailability,
  upsertAvailabilityRows,
  upsertBookingClosures,
  upsertBookingCutoffs,
  upsertCheckInAttendanceRow,
  upsertCheckInEnrollments,
  upsertCheckInNoteRow,
  upsertCheckInPaymentRow,
  upsertCheckInSequenceStart,
  upsertCheckInTicketRow,
  upsertCheckInGuestEdit,
  deleteCheckInSequenceStart,
  deleteCheckInGuestEdit,
  upsertDriver as upsertDriverRow,
  upsertHotel,
  upsertZone,
} from '@/lib/supabase/portal-db'
import {
  loadLocalDrivers,
  mergeDriverRoster,
  saveLocalDrivers,
  type DriverRosterEntry,
} from '@/lib/driver-roster'
import type {
  Agent,
  AgentStatus,
  Availability,
  BoatGuide,
  BoatNumber,
  Booking,
  BookingActionOptions,
  BookingActor,
  BookingClosure,
  BookingEvent,
  BookingEventType,
  CheckInAttendance,
  DayBoatPlan,
  DayCheckInAttendanceMap,
  DayVehiclePlan,
  FleetVan,
  Hotel,
  PickupZone,
  PickupZoneName,
  Program,
  VanMeta,
  VanSplit,
} from '@/lib/types'
import { HOTEL_CATALOG } from '@/lib/hotel-catalog'
import {
  DEFAULT_BOAT_CAPACITY,
  replaceLegacyBoatCapacity,
  DEFAULT_JB_CAPACITY,
  DEFAULT_PP_CAPACITY,
  MAX_DAY_BOATS,
  NO_TRANSFER_TIME,
  PRIVATE_TRANSFER_ZONE,
  bookingClosureKey,
  chargeablePax,
  clampVanCapacity,
  dayBoatPlanKey,
  dayVehiclePlanKey,
  defaultBoatCapacities,
  defaultBoatGuides,
  defaultBoatNames,
  emptyBoatGuide,
  emptyDayBoatPlan,
  emptyDayVehiclePlan,
  emptyPrivateTransferFields,
  emptyVanMeta,
  isActiveBooking,
  isCorePickupZone,
  isNoTransfer,
  isPrivateTransfer,
  isPrivateTransferZone,
  isSpecialTransfer,
  isSpecialTransferKind,
  normalizeBoatCapacities,
  normalizeBoatGuides,
  normalizeBoatNames,
  normalizeChargeAmount,
  privateTransferPriceFor,
  totalPassengers,
} from '@/lib/types'

type PortalContextValue = {
  hydrated: boolean
  loadError: string | null
  agents: Agent[]
  bookings: Booking[]
  zones: PickupZone[]
  hotels: Hotel[]
  availability: Availability[]
  dayBoatPlans: Record<string, DayBoatPlan>
  dayVehiclePlans: Record<string, DayVehiclePlan>
  fleetVans: FleetVan[]
  drivers: DriverRosterEntry[]
  upsertDriver: (entry: DriverRosterEntry) => void
  bookingCutoffs: BookingCutoffSettings
  updateBookingCutoffs: (patch: Partial<BookingCutoffSettings>) => void
  bookingClosures: BookingClosure[]
  isProgramClosed: (date: string, program: Program) => boolean
  getBookingClosure: (date: string, program: Program) => BookingClosure | null
  closeBookingForDates: (dates: string[], programs: Program[], reason?: string) => void
  openBookingForDates: (dates: string[], programs: Program[]) => void
  isBookingOpen: (travelDate: string) => boolean
  /** Soonest travel date open for agent booking (Bangkok; usually tomorrow after midnight). */
  earliestBookableDate: () => string
  isCancelOpen: (travelDate: string) => boolean
  /** Extra charges apply after the late-fee time while modify is still open. */
  isLateAmendment: (travelDate: string) => boolean
  isLateFeeTime: (travelDate: string) => boolean
  addBooking: (
    booking: Omit<
      Booking,
      | 'code'
      | 'status'
      | 'pickupTime'
      | 'transferExtraCharge'
      | 'privateTransferVehicle'
      | 'privateTransferPrice'
      | 'privateDriverName'
      | 'privateDriverPhone'
      | 'lateChangeFee'
    > & {
      pickupTime?: string
      transferExtraCharge?: string
    },
    options?: BookingActionOptions,
  ) => { ok: true; booking: Booking } | { ok: false; error: string }
  cancelBooking: (
    code: string,
    options?: BookingActionOptions,
  ) => { ok: true } | { ok: false; error: string }
  changeBookingDate: (
    code: string,
    newDate: string,
    options?: BookingActionOptions,
  ) => { ok: true } | { ok: false; error: string }
  rebookBooking: (
    code: string,
    newDate: string,
    options?: BookingActionOptions,
  ) => { ok: true } | { ok: false; error: string }
  updateBookingDetails: (
    code: string,
    patch: {
      leadGuest?: string
      adults?: number
      children?: number
      infants?: number
      tourLeaders?: number
      pickupZone?: Booking['pickupZone']
      pickupHotel?: string
      roomNumber?: string
      note?: string
      cashOnTour?: string
      agentRef?: string
      parkFee?: Booking['parkFee']
      canoe?: Booking['canoe']
      transferExtraCharge?: string
      pickupTime?: string
      privateTransferVehicle?: Booking['privateTransferVehicle']
      privateTransferPrice?: string
      privateDriverName?: string
      privateDriverPhone?: string
    },
    options?: BookingActionOptions,
  ) => { ok: true; booking: Booking } | { ok: false; error: string }
  setBookingPickupTime: (
    code: string,
    pickupTime: string,
    options?: BookingActionOptions,
  ) => { ok: true } | { ok: false; error: string }
  getBookingHistory: (code: string) => BookingEvent[]
  loadBookingHistory: (code: string) => Promise<BookingEvent[]>
  updateZoneTime: (name: PickupZoneName, time: string) => void
  addZone: (name: string, time: string) => string | null
  removeZone: (name: PickupZoneName) => void
  addHotel: (
    name: string,
    zoneName: PickupZoneName | null,
    extraChargeTransfer?: string,
  ) => string | null
  updateHotel: (
    id: string,
    name: string,
    zoneName: PickupZoneName | null,
    extraChargeTransfer?: string,
  ) => string | null
  removeHotel: (id: string) => void
  /** Upsert canonical partner hotel list (Patong/Kata/Karon / unassigned). */
  importHotelCatalog: () => { added: number; updated: number }
  setAgentStatus: (slug: string, status: AgentStatus) => void
  addAgent: (name: string) => string | null
  updateAgent: (slug: string, name: string) => string | null
  removeAgent: (slug: string) => void
  setCapacity: (date: string, program: 'PP' | 'James Bond', capacity: number) => void
  setCapacityForDates: (
    dates: string[],
    capacities: { ppCapacity?: number; jamesBondCapacity?: number },
  ) => void
  nudgeCapacityForDates: (dates: string[], program: 'PP' | 'James Bond', delta: number) => void
  getZoneTime: (name: PickupZoneName) => string
  getCapacity: (date: string) => { ppCapacity: number; jamesBondCapacity: number }
  bookedPaxFor: (date: string, program: 'PP' | 'James Bond') => number
  getDayBoatPlan: (date: string, program: Program) => DayBoatPlan
  getCheckInAttendance: (
    date: string,
    program: Program,
    bookingCode: string,
  ) => CheckInAttendance | null
  setCheckInAttendance: (
    date: string,
    program: Program,
    bookingCode: string,
    status: CheckInAttendance | null,
  ) => void
  getCheckInPayment: (
    date: string,
    program: Program,
    bookingCode: string,
  ) => CheckInPaymentStatus | null
  setCheckInPayment: (
    date: string,
    program: Program,
    bookingCode: string,
    status: CheckInPaymentStatus | null,
  ) => void
  getCheckInTicket: (
    date: string,
    program: Program,
    bookingCode: string,
  ) => CheckInTicketStatus | null
  setCheckInTicket: (
    date: string,
    program: Program,
    bookingCode: string,
    status: CheckInTicketStatus | null,
  ) => void
  getCheckInServices: (
    date: string,
    program: Program,
    bookingCode: string,
  ) => CheckInServiceLine[]
  setCheckInServices: (
    date: string,
    program: Program,
    bookingCode: string,
    services: CheckInServiceLine[],
  ) => void
  getGuestSequences: (date: string, program: Program) => Record<string, GuestSequenceBlock>
  getGuestSequence: (
    date: string,
    program: Program,
    bookingCode: string,
  ) => GuestSequenceBlock | null
  setCheckInSequenceProgramStart: (date: string, program: Program, start: number | null) => void
  setCheckInSequenceBookingStart: (
    date: string,
    program: Program,
    bookingCode: string,
    start: number | null,
  ) => void
  getCheckInEnrollments: (
    date: string,
    program: Program,
    bookingCode: string,
  ) => CheckInEnrollment[]
  updateCheckInEnrollment: (input: {
    date: string
    program: Program
    bookingCode: string
    enrollment: CheckInEnrollment
  }) => { ok: true } | { ok: false; error: string }
  getCheckInGuestEditIds: (date: string, program: Program, bookingCode: string) => string[]
  isCheckInGuestEditOpen: (
    date: string,
    program: Program,
    bookingCode: string,
    enrollmentId: string,
  ) => boolean
  setCheckInGuestEditOpen: (
    date: string,
    program: Program,
    bookingCode: string,
    enrollmentId: string,
    open: boolean,
  ) => void
  getCheckInNote: (date: string, program: Program, bookingCode: string) => string
  setCheckInNote: (date: string, program: Program, bookingCode: string, note: string) => void
  removeCheckInEnrollment: (
    date: string,
    program: Program,
    bookingCode: string,
    enrollmentId: string,
  ) => void
  /** Drop checked-in seats that no longer fit after pax was reduced. */
  trimCheckInEnrollments: (
    date: string,
    program: Program,
    bookingCode: string,
    maxSeats: number,
  ) => void
  recordGuestCheckIn: (input: {
    date: string
    program: Program
    bookingCode: string
    scope: CheckInScope
    firstName: string
    lastName: string
    nationality: string
    birthday: string
    passportNumber: string
  }) => { ok: true; enrollment: CheckInEnrollment } | { ok: false; error: string }
  recordGuestCheckIns: (input: {
    date: string
    program: Program
    bookingCode: string
    scope: CheckInScope
    guests: Array<{
      firstName: string
      lastName: string
      nationality: string
      birthday: string
      passportNumber: string
    }>
  }) => { ok: true; count: number } | { ok: false; error: string }
  assignBookingToBoat: (
    date: string,
    program: Program,
    bookingCode: string,
    boat: BoatNumber | null,
    options?: { persist?: boolean },
  ) => void
  setBoatCapacity: (
    date: string,
    program: Program,
    boat: BoatNumber,
    capacity: number,
    options?: { persist?: boolean },
  ) => void
  /** Rename a boat for this day (empty resets to "Boat N"). */
  setBoatName: (
    date: string,
    program: Program,
    boat: BoatNumber,
    name: string,
    options?: { persist?: boolean },
  ) => void
  /** Set guide / assistant contacts for a boat on this day. */
  setBoatGuide: (
    date: string,
    program: Program,
    boat: BoatNumber,
    guide: Partial<BoatGuide>,
    options?: { persist?: boolean },
  ) => void
  /** Append a boat for this day (default capacity 50, or a custom rental size). */
  addDayBoat: (
    date: string,
    program: Program,
    capacity?: number,
    options?: { persist?: boolean },
  ) => void
  /** Remove a boat; guests on it become unassigned; higher boat numbers shift down. */
  removeDayBoat: (
    date: string,
    program: Program,
    boat: BoatNumber,
    options?: { persist?: boolean },
  ) => void
  /** Set every boat from today onward to the default capacity (keeps boat count). */
  resetDayBoatCapacities: (
    date: string,
    program: Program,
    options?: { persist?: boolean },
  ) => void
  /** Restore the default fleet: 3 boats × 50 pax (clears assignments beyond boat 3). */
  resetDayBoatFleet: (date: string, program: Program, options?: { persist?: boolean }) => void
  autoAssignDayBoats: (date: string, program: Program, options?: { persist?: boolean }) => void
  clearDayBoatAssignments: (
    date: string,
    program: Program,
    options?: { persist?: boolean },
  ) => void
  /**
   * Persist the current in-memory boat plan (assignments + fleet + guides) for a day.
   * Use after draft edits on the Arrange boats board.
   */
  commitDayBoatPlan: (
    date: string,
    program: Program,
  ) => Promise<{ ok: true; warning?: string } | { ok: false; error: string }>
  /** Assign every booking currently on this van to one boat (whole van group). */
  assignVanToBoat: (
    date: string,
    program: Program,
    van: number,
    boat: BoatNumber | null,
    options?: { persist?: boolean },
  ) => void
  getDayVehiclePlan: (date: string, program: Program) => DayVehiclePlan
  assignBookingToVan: (
    date: string,
    program: Program,
    bookingCode: string,
    van: number | null,
  ) => void
  assignBookingsToVan: (
    date: string,
    program: Program,
    bookingCodes: string[],
    van: number | null,
  ) => void
  setBookingVanSplits: (
    date: string,
    program: Program,
    bookingCode: string,
    legs: VanSplit[],
  ) => void
  reorderVanBookings: (
    date: string,
    program: Program,
    van: number,
    orderedCodes: string[],
  ) => void
  setVanMeta: (
    date: string,
    program: Program,
    van: number,
    meta: Partial<VanMeta> & { capacity?: number | null; specialKind?: VanMeta['specialKind'] | null },
  ) => void
  getFleetVan: (van: number) => FleetVan | null
  resolveVanMeta: (van: number, dayMeta?: VanMeta | null) => VanMeta & { fromFleet: boolean; incomplete: boolean }
  autoAssignDayVans: (date: string, program: Program) => void
  clearDayVanAssignments: (date: string, program: Program) => void
}

const PortalContext = createContext<PortalContextValue | null>(null)

function checkInMapsHaveData(maps: CheckInMapsSnapshot) {
  return (
    Object.keys(maps.enrollments).length > 0 ||
    Object.keys(maps.attendance).length > 0 ||
    Object.keys(maps.payments).length > 0 ||
    Object.keys(maps.tickets).length > 0 ||
    Object.keys(maps.services).length > 0 ||
    Object.keys(maps.sequences).length > 0 ||
    Object.keys(maps.guestEdits).length > 0 ||
    Object.keys(maps.notes).length > 0
  )
}

function applyCheckInMapsToStorage(maps: CheckInMapsSnapshot) {
  saveCheckInEnrollmentMap(maps.enrollments)
  saveCheckInAttendanceMap(maps.attendance)
  saveCheckInPaymentMap(maps.payments)
  saveCheckInTicketMap(maps.tickets)
  saveCheckInServiceMap(maps.services)
  saveCheckInSequenceMap(maps.sequences)
  saveCheckInGuestEditMap(maps.guestEdits)
  saveCheckInNoteMap(maps.notes)
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [zones, setZones] = useState<PickupZone[]>([])
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [availability, setAvailability] = useState<Availability[]>([])
  const [dayBoatPlans, setDayBoatPlans] = useState<Record<string, DayBoatPlan>>({})
  const [dayVehiclePlans, setDayVehiclePlans] = useState<Record<string, DayVehiclePlan>>({})
  const [checkInAttendance, setCheckInAttendanceMap] =
    useState<DayCheckInAttendanceMap>({})
  const [checkInEnrollment, setCheckInEnrollmentMap] =
    useState<DayCheckInEnrollmentMap>({})
  const [checkInPayment, setCheckInPaymentMap] = useState<DayCheckInPaymentMap>({})
  const [checkInTicket, setCheckInTicketMap] = useState<DayCheckInTicketMap>({})
  const [checkInServices, setCheckInServiceMap] = useState<DayCheckInServiceMap>({})
  const [checkInSequence, setCheckInSequenceMap] = useState<DayCheckInSequenceMap>({})
  const [checkInGuestEdit, setCheckInGuestEditMap] = useState<DayCheckInGuestEditMap>({})
  const [checkInNotes, setCheckInNoteMap] = useState<DayCheckInNoteMap>({})
  const [fleetVans, setFleetVans] = useState<FleetVan[]>([])
  const [drivers, setDrivers] = useState<DriverRosterEntry[]>(() => mergeDriverRoster(loadLocalDrivers()))
  const [bookingCutoffs, setBookingCutoffs] = useState<BookingCutoffSettings>(DEFAULT_BOOKING_CUTOFFS)
  const [bookingClosures, setBookingClosures] = useState<BookingClosure[]>([])
  const [bookingEventsByCode, setBookingEventsByCode] = useState<Record<string, BookingEvent[]>>({})
  const checkInCloudEnabledRef = useRef(false)
  const checkInWritePendingRef = useRef(0)
  const bookingWritePendingRef = useRef(0)
  const boatPlanWritePendingRef = useRef(0)
  const boatPlanSaveChainRef = useRef(Promise.resolve())
  /** Keys with unsaved boat-board drafts — refresh must not overwrite these. */
  const boatPlanDirtyKeysRef = useRef(new Set<string>())

  function persistBookingWrite(label: string, task: Promise<unknown>) {
    bookingWritePendingRef.current += 1
    persistQuietly(
      label,
      task.finally(() => {
        bookingWritePendingRef.current = Math.max(0, bookingWritePendingRef.current - 1)
      }),
    )
  }

  function enqueueBoatPlanSave(task: () => Promise<void>): Promise<void> {
    boatPlanWritePendingRef.current += 1
    const run = boatPlanSaveChainRef.current.then(task, task)
    boatPlanSaveChainRef.current = run.then(
      () => undefined,
      () => undefined,
    )
    return run.finally(() => {
      boatPlanWritePendingRef.current = Math.max(0, boatPlanWritePendingRef.current - 1)
    })
  }

  function persistBoatPlanWrite(plan: DayBoatPlan) {
    void enqueueBoatPlanSave(() => saveDayBoatPlan(plan)).catch((error) => {
      console.error('[supabase] saveDayBoatPlan', error)
      const message = error instanceof Error ? error.message : 'Failed to save boat plan'
      if (/boat.?guides|add-boat-guides/i.test(message)) {
        setLoadError(message)
      }
    })
  }

  function applyCheckInMaps(maps: CheckInMapsSnapshot) {
    setCheckInEnrollmentMap(maps.enrollments)
    setCheckInAttendanceMap(maps.attendance)
    setCheckInPaymentMap(maps.payments)
    setCheckInTicketMap(maps.tickets)
    setCheckInServiceMap(maps.services)
    setCheckInSequenceMap(maps.sequences)
    setCheckInGuestEditMap(maps.guestEdits)
    setCheckInNoteMap(
      Object.keys(maps.notes).length > 0 ? maps.notes : loadCheckInNoteMap(),
    )
    applyCheckInMapsToStorage({
      ...maps,
      notes: Object.keys(maps.notes).length > 0 ? maps.notes : loadCheckInNoteMap(),
    })
  }

  function persistCheckInWrite(label: string, task: Promise<unknown>) {
    if (!checkInCloudEnabledRef.current) return
    checkInWritePendingRef.current += 1
    persistQuietly(
      label,
      task.finally(() => {
        checkInWritePendingRef.current = Math.max(0, checkInWritePendingRef.current - 1)
      }),
    )
  }

  useEffect(() => {
    setCheckInAttendanceMap(loadCheckInAttendanceMap())
    setCheckInEnrollmentMap(loadCheckInEnrollmentMap())
    const split = adoptLegacyPaymentsAsTickets(
      loadCheckInPaymentMap(),
      loadCheckInTicketMap(),
    )
    if (split.migrated) {
      saveCheckInPaymentMap(split.payments)
      saveCheckInTicketMap(split.tickets)
    }
    setCheckInPaymentMap(split.payments)
    setCheckInTicketMap(split.tickets)
    setCheckInServiceMap(loadCheckInServiceMap())
    setCheckInSequenceMap(loadCheckInSequenceMap())
    setCheckInGuestEditMap(loadCheckInGuestEditMap())
    setCheckInNoteMap(loadCheckInNoteMap())
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const snapshot = await loadPortalSnapshot()
        if (cancelled) return
        setAgents(snapshot.agents)
        setBookings(snapshot.bookings)
        setZones(snapshot.zones)
        setHotels(snapshot.hotels)
        setAvailability(snapshot.availability)
        const fromDate = todayISO()
        const nextBoatPlans = { ...snapshot.dayBoatPlans }
        const persistTouched: DayBoatPlan[] = []
        const writeBoatPlan = (plan: DayBoatPlan) => {
          nextBoatPlans[dayBoatPlanKey(plan.date, plan.program)] = plan
          const index = persistTouched.findIndex(
            (item) => item.date === plan.date && item.program === plan.program,
          )
          if (index >= 0) persistTouched[index] = plan
          else persistTouched.push(plan)
        }
        for (const plan of Object.values(nextBoatPlans)) {
          if (plan.date < fromDate) continue
          const capacities = replaceLegacyBoatCapacity(plan.capacities)
          const current = normalizeBoatCapacities(plan.capacities)
          if (capacities.some((cap, index) => cap !== current[index])) {
            writeBoatPlan({ ...plan, capacities })
          }
        }
        for (const vehiclePlan of Object.values(snapshot.dayVehiclePlans)) {
          const key = dayBoatPlanKey(vehiclePlan.date, vehiclePlan.program)
          const boatPlan = nextBoatPlans[key] ?? emptyDayBoatPlan(vehiclePlan.date, vehiclePlan.program)
          const dayBookings = snapshot.bookings.filter(
            (booking) =>
              isActiveBooking(booking) &&
              booking.date === vehiclePlan.date &&
              booking.program === vehiclePlan.program,
          )
          const assignments = adoptAllVansOntoSharedBoats(
            dayBookings,
            vehiclePlan.assignments,
            boatPlan.assignments,
          )
          if (assignments) writeBoatPlan({ ...boatPlan, assignments })
        }
        setDayBoatPlans(nextBoatPlans)
        for (const plan of persistTouched) persistBoatPlanWrite(plan)
        setDayVehiclePlans(snapshot.dayVehiclePlans)
        setFleetVans(snapshot.fleetVans)
        setDrivers(mergeDriverRoster([...snapshot.drivers, ...loadLocalDrivers()]))
        setBookingCutoffs(snapshot.bookingCutoffs)
        setBookingClosures(snapshot.bookingClosures)
        setLoadError(null)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Failed to load portal data'
        console.error('[portal] load failed', error)
        setLoadError(message)
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Keep bookings live across devices via Supabase poll + Realtime. */
  useEffect(() => {
    if (!hydrated) return

    let busy = false
    let cancelled = false

    async function refreshBookings() {
      if (cancelled || busy || bookingWritePendingRef.current > 0) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      busy = true
      try {
        const next = await fetchBookings()
        if (cancelled || bookingWritePendingRef.current > 0) return
        setBookings(next)
      } catch (error) {
        console.error('[portal] bookings refresh failed', error)
      } finally {
        busy = false
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') void refreshBookings()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const poll = window.setInterval(() => {
      void refreshBookings()
    }, 4000)

    let unsubscribeRealtime: (() => void) | undefined
    try {
      unsubscribeRealtime = subscribeBookings(() => {
        void refreshBookings()
      })
    } catch (error) {
      console.error('[portal] bookings realtime subscribe failed', error)
    }

    void refreshBookings()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.clearInterval(poll)
      unsubscribeRealtime?.()
    }
  }, [hydrated])

  /** Keep boat guides / assignments live across admins. */
  useEffect(() => {
    if (!hydrated) return

    let busy = false
    let cancelled = false

    async function refreshDayBoatPlans() {
      if (cancelled || busy || boatPlanWritePendingRef.current > 0) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      busy = true
      try {
        const next = await fetchDayBoatPlans()
        if (cancelled || boatPlanWritePendingRef.current > 0) return
        setDayBoatPlans((current) => {
          const fromDate = todayISO()
          const incoming = { ...next }
          for (const [key, plan] of Object.entries(incoming)) {
            if (plan.date < fromDate) continue
            incoming[key] = { ...plan, capacities: replaceLegacyBoatCapacity(plan.capacities) }
          }
          if (boatPlanDirtyKeysRef.current.size === 0) return incoming
          const merged = { ...incoming }
          for (const key of boatPlanDirtyKeysRef.current) {
            if (current[key]) merged[key] = current[key]!
          }
          return merged
        })
      } catch (error) {
        console.error('[portal] day boat plans refresh failed', error)
      } finally {
        busy = false
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') void refreshDayBoatPlans()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const poll = window.setInterval(() => {
      void refreshDayBoatPlans()
    }, 4000)

    void refreshDayBoatPlans()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.clearInterval(poll)
    }
  }, [hydrated])

  /** Keep marina check-in board in sync across devices (Supabase) and same-browser tabs. */
  useEffect(() => {
    if (!hydrated) return

    let cancelled = false
    let migrateAttempted = false

    function reloadCheckInMapsFromStorage() {
      setCheckInAttendanceMap(loadCheckInAttendanceMap())
      setCheckInEnrollmentMap(loadCheckInEnrollmentMap())
      setCheckInPaymentMap(loadCheckInPaymentMap())
      setCheckInTicketMap(loadCheckInTicketMap())
      setCheckInServiceMap(loadCheckInServiceMap())
      setCheckInSequenceMap(loadCheckInSequenceMap())
      setCheckInGuestEditMap(loadCheckInGuestEditMap())
      setCheckInNoteMap(loadCheckInNoteMap())
    }

    async function syncCheckInFromCloud(allowMigrate: boolean) {
      if (cancelled || checkInWritePendingRef.current > 0) return
      try {
        const remote = await fetchCheckInMaps()
        if (cancelled) return
        if (remote === null) {
          checkInCloudEnabledRef.current = false
          return
        }
        checkInCloudEnabledRef.current = true

        let next = remote
        if (allowMigrate && !migrateAttempted) {
          migrateAttempted = true
          const local: CheckInMapsSnapshot = {
            enrollments: loadCheckInEnrollmentMap(),
            attendance: loadCheckInAttendanceMap(),
            payments: loadCheckInPaymentMap(),
            tickets: loadCheckInTicketMap(),
            services: loadCheckInServiceMap(),
            sequences: loadCheckInSequenceMap(),
            guestEdits: loadCheckInGuestEditMap(),
            notes: loadCheckInNoteMap(),
          }
          // First cloud sync: upload this browser's local-only check-ins when remote is empty.
          if (!checkInMapsHaveData(remote) && checkInMapsHaveData(local)) {
            checkInWritePendingRef.current += 1
            try {
              await pushCheckInMaps(local)
              next = local
            } catch (error) {
              console.error('[supabase] migrate check-in maps', error)
              next = local
            } finally {
              checkInWritePendingRef.current = Math.max(0, checkInWritePendingRef.current - 1)
            }
          }
        }

        if (cancelled || checkInWritePendingRef.current > 0) return
        applyCheckInMaps(next)

        const remotePax = await fetchCheckInBookedPax()
        if (cancelled || checkInWritePendingRef.current > 0) return
        if (remotePax) {
          const localPax = loadBookedPaxMap()
          if (allowMigrate && Object.keys(remotePax).length === 0 && Object.keys(localPax).length > 0) {
            checkInWritePendingRef.current += 1
            try {
              await pushCheckInBookedPax(localPax)
            } catch (error) {
              console.error('[supabase] migrate check-in booked pax', error)
            } finally {
              checkInWritePendingRef.current = Math.max(0, checkInWritePendingRef.current - 1)
            }
          } else {
            hydrateBookedPaxMap(remotePax)
          }
        }
      } catch (error) {
        console.error('[portal] check-in sync failed', error)
      }
    }

    function onStorage(event: StorageEvent) {
      if (
        event.key === CHECK_IN_ENROLLMENT_STORAGE_KEY ||
        event.key === CHECK_IN_ATTENDANCE_STORAGE_KEY ||
        event.key === CHECK_IN_PAYMENT_STORAGE_KEY ||
        event.key === CHECK_IN_TICKET_STORAGE_KEY ||
        event.key === CHECK_IN_SERVICE_STORAGE_KEY ||
        event.key === CHECK_IN_SEQUENCE_STORAGE_KEY ||
        event.key === CHECK_IN_GUEST_EDIT_STORAGE_KEY ||
        event.key === CHECK_IN_NOTE_STORAGE_KEY ||
        event.key === CHECK_IN_BOOKED_PAX_STORAGE_KEY
      ) {
        reloadCheckInMapsFromStorage()
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') {
        void syncCheckInFromCloud(false)
      }
    }

    void syncCheckInFromCloud(true)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const poll = window.setInterval(() => {
      void syncCheckInFromCloud(false)
    }, 4000)

    return () => {
      cancelled = true
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.clearInterval(poll)
    }
  }, [hydrated])

  const value = useMemo<PortalContextValue>(() => {
    const getZoneTime = (name: PickupZoneName) =>
      zones.find((zone) => zone.name === name)?.time ?? 'Awaiting pickup time'

    const getCapacity = (date: string) => {
      const row = availability.find((item) => item.date === date)
      return {
        ppCapacity: row?.ppCapacity ?? DEFAULT_PP_CAPACITY,
        jamesBondCapacity: row?.jamesBondCapacity ?? DEFAULT_JB_CAPACITY,
      }
    }

    const bookedPaxFor = (date: string, program: 'PP' | 'James Bond') =>
      bookings
        .filter(
          (booking) =>
            isActiveBooking(booking) && booking.date === date && booking.program === program,
        )
        .reduce((sum, booking) => sum + totalPassengers(booking), 0)

    const resolveActor = (actor?: BookingActor): BookingActor =>
      actor ?? { role: 'admin', name: 'Admin' }

    const logBookingEvent = (
      bookingCode: string,
      type: BookingEventType,
      summary: string,
      actor?: BookingActor,
    ) => {
      const who = resolveActor(actor)
      const event: BookingEvent = {
        id: crypto.randomUUID(),
        bookingCode,
        type,
        summary,
        actorRole: who.role,
        actorName: who.name,
        actorSlug: who.slug ?? '',
        createdAt: new Date().toISOString(),
      }
      setBookingEventsByCode((current) => ({
        ...current,
        [bookingCode]: [event, ...(current[bookingCode] ?? [])],
      }))
      persistQuietly(
        'insertBookingEvent',
        insertBookingEvent(event).then(() => undefined),
      )
    }

    const getBookingClosure = (date: string, program: Program) =>
      bookingClosures.find((item) => item.date === date && item.program === program) ?? null

    const isProgramClosed = (date: string, program: Program) =>
      getBookingClosure(date, program) !== null

    /** Agents may edit/cancel/move only while cancel cutoff is open and admin has not closed the day. */
    const agentModifyBlocked = (
      booking: { date: string; program: Program },
      options?: BookingActionOptions,
    ): string | null => {
      if (options?.bypassCutoff) return null
      if (!isCancelOpenForDate(bookingCutoffs, booking.date)) {
        return cancelClosedMessage(bookingCutoffs, booking.date)
      }
      const closure = getBookingClosure(booking.date, booking.program)
      if (closure) {
        return closure.reason
          ? `Booking closed by admin for ${booking.program} on this date — ${closure.reason}`
          : `Booking closed by admin for ${booking.program} on this date.`
      }
      return null
    }

    const activeDayBookings = (date: string, program: Program) =>
      bookings.filter(
        (booking) =>
          isActiveBooking(booking) && booking.date === date && booking.program === program,
      )

    const getDayBoatPlan = (date: string, program: Program) => {
      const key = dayBoatPlanKey(date, program)
      const stored = dayBoatPlans[key]
      if (!stored) return emptyDayBoatPlan(date, program)
      const capacities =
        date >= todayISO()
          ? replaceLegacyBoatCapacity(stored.capacities)
          : normalizeBoatCapacities(stored.capacities)
      return {
        ...stored,
        capacities,
        names: normalizeBoatNames(stored.names, capacities.length),
        guides: normalizeBoatGuides(stored.guides, capacities.length),
      }
    }

    const upsertPlan = (
      date: string,
      program: Program,
      updater: (plan: DayBoatPlan) => DayBoatPlan,
      options?: { persist?: boolean },
    ) => {
      const persist = options?.persist !== false
      setDayBoatPlans((current) => {
        const key = dayBoatPlanKey(date, program)
        const base = current[key] ?? emptyDayBoatPlan(date, program)
        const next = updater(base)
        if (persist) {
          boatPlanDirtyKeysRef.current.delete(key)
          persistBoatPlanWrite(next)
        } else {
          boatPlanDirtyKeysRef.current.add(key)
        }
        return { ...current, [key]: next }
      })
    }

    const getDayVehiclePlan = (date: string, program: Program) => {
      const key = dayVehiclePlanKey(date, program)
      const stored = dayVehiclePlans[key]
      if (!stored) return emptyDayVehiclePlan(date, program)
      const dayBookings = activeDayBookings(date, program)
      return {
        ...emptyDayVehiclePlan(date, program),
        ...stored,
        vanCapacity: stored.vanCapacity || emptyDayVehiclePlan(date, program).vanCapacity,
        vanMeta: stored.vanMeta ?? {},
        assignments: normalizeAssignments(
          stored.assignments as unknown as Record<string, unknown>,
          dayBookings,
        ),
      }
    }

    const upsertVehiclePlan = (
      date: string,
      program: Program,
      updater: (plan: DayVehiclePlan) => DayVehiclePlan,
    ) => {
      setDayVehiclePlans((current) => {
        const key = dayVehiclePlanKey(date, program)
        const base = getDayVehiclePlan(date, program)
        const fromState = current[key]
        const resolved = fromState
          ? {
              ...emptyDayVehiclePlan(date, program),
              ...fromState,
              vanMeta: fromState.vanMeta ?? {},
              assignments: normalizeAssignments(
                fromState.assignments as unknown as Record<string, unknown>,
                activeDayBookings(date, program),
              ),
            }
          : base
        const next = updater(resolved)
        persistQuietly('saveDayVehiclePlan', saveDayVehiclePlan(next))
        return { ...current, [key]: next }
      })
    }

    const followVanOntoBoat = (
      date: string,
      program: Program,
      van: number,
      vehicleAssignments: DayVehiclePlan['assignments'],
    ) => {
      const countable = activeDayBookings(date, program).filter(
        (booking) =>
          getCheckInAttendance(checkInAttendance, date, program, booking.code) !== 'no-show',
      )
      const nextAssignments = adoptVanBookingsOntoSharedBoat(
        countable,
        vehicleAssignments,
        getDayBoatPlan(date, program).assignments,
        van,
      )
      if (!nextAssignments) return
      upsertPlan(date, program, (plan) => ({ ...plan, assignments: nextAssignments }))
    }

    const getFleetVan = (van: number) =>
      fleetVans.find((item) => item.vanNumber === van) ?? null

    const resolveVanMeta = (_van: number, dayMeta?: VanMeta | null) => {
      const plate = dayMeta?.plate?.trim() || ''
      const driver = dayMeta?.driver?.trim() || ''
      const phone = dayMeta?.phone?.trim() || ''
      const specialKind = isSpecialTransferKind(dayMeta?.specialKind)
        ? dayMeta.specialKind
        : undefined
      return {
        plate,
        driver,
        phone,
        capacity: dayMeta?.capacity,
        outsourced: dayMeta?.outsourced === true,
        outsourceCompany: dayMeta?.outsourceCompany?.trim() || '',
        specialKind,
        transferIn: dayMeta?.transferIn === true,
        transferOut: dayMeta?.transferOut === true,
        chargeAmount: normalizeChargeAmount(dayMeta?.chargeAmount),
        fromFleet: false,
        incomplete: !driver.trim() || !plate.trim(),
      }
    }

    const recordGuestCheckInsInternal = (input: {
      date: string
      program: Program
      bookingCode: string
      scope: CheckInScope
      guests: Array<{
        firstName: string
        lastName: string
        nationality: string
        birthday: string
        passportNumber: string
      }>
    }): { ok: true; count: number } | { ok: false; error: string } => {
      if (!input.guests.length) return { ok: false, error: 'Add at least one guest.' }

      const cleaned: CheckInEnrollment[] = []
      for (let index = 0; index < input.guests.length; index += 1) {
        const guest = input.guests[index]!
        const firstName = guest.firstName.trim()
        const lastName = guest.lastName.trim()
        const nationality = guest.nationality.trim()
        const birthday = guest.birthday.trim()
        const passportNumber = guest.passportNumber.trim()
        const label = input.guests.length > 1 ? `Guest ${index + 1}: ` : ''
        if (!firstName) return { ok: false, error: `${label}Enter first name.` }
        if (!lastName) return { ok: false, error: `${label}Enter last name.` }
        const nationalityMatched = matchNationality(nationality)
        if (!nationalityMatched) {
          return { ok: false, error: `${label}Select a nationality from the list.` }
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
          return { ok: false, error: `${label}Select birthday.` }
        }
        if (!passportNumber) return { ok: false, error: `${label}Enter passport number.` }
        cleaned.push({
          id: newEnrollmentId(),
          firstName,
          lastName,
          nationality: nationalityMatched,
          birthday,
          passportNumber,
          scope: input.scope,
          seats: 1,
          checkedInAt: new Date().toISOString(),
        })
      }

      const booking = bookings.find(
        (item) =>
          item.code === input.bookingCode &&
          isActiveBooking(item) &&
          item.date === input.date &&
          item.program === input.program,
      )
      if (!booking) {
        return { ok: false, error: 'Booking not found for this date and program.' }
      }

      const existing = getCheckInEnrollments(
        checkInEnrollment,
        input.date,
        input.program,
        input.bookingCode,
      )
      const already = enrolledSeatCount(existing)
      const seatsTotal = totalPassengers(booking)
      if (already >= seatsTotal) {
        return { ok: false, error: 'This booking is already fully checked in.' }
      }
      const remaining = Math.max(0, seatsTotal - already)
      if (cleaned.length > remaining) {
        return {
          ok: false,
          error: `Only ${remaining} seat${remaining === 1 ? '' : 's'} left to check in.`,
        }
      }

      setCheckInEnrollmentMap((current) => {
        let next = current
        for (const enrollment of cleaned) {
          next = withCheckInEnrollment(
            next,
            input.date,
            input.program,
            input.bookingCode,
            enrollment,
          )
        }
        saveCheckInEnrollmentMap(next)
        return next
      })
      persistCheckInWrite(
        'upsertCheckInEnrollments',
        upsertCheckInEnrollments(input.date, input.program, input.bookingCode, cleaned),
      )

      if (already + cleaned.length >= seatsTotal) {
        setCheckInAttendanceMap((current) => {
          const next = withCheckInAttendance(
            current,
            input.date,
            input.program,
            input.bookingCode,
            'checked',
          )
          saveCheckInAttendanceMap(next)
          return next
        })
        persistCheckInWrite(
          'upsertCheckInAttendance',
          upsertCheckInAttendanceRow(input.date, input.program, input.bookingCode, 'checked'),
        )
      }

      return { ok: true, count: cleaned.length }
    }

    return {
      hydrated,
      loadError,
      agents,
      bookings,
      zones,
      hotels,
      availability,
      dayBoatPlans,
      dayVehiclePlans,
      fleetVans,
      drivers,
      bookingCutoffs,
      bookingClosures,
      getZoneTime,
      getCapacity,
      bookedPaxFor,
      getDayBoatPlan,
      getCheckInAttendance: (date, program, bookingCode) =>
        getCheckInAttendance(checkInAttendance, date, program, bookingCode),
      setCheckInAttendance: (date, program, bookingCode, status) => {
        setCheckInAttendanceMap((current) => {
          const next = withCheckInAttendance(current, date, program, bookingCode, status)
          saveCheckInAttendanceMap(next)
          return next
        })
        if (status === null) {
          persistCheckInWrite(
            'deleteCheckInAttendance',
            deleteCheckInAttendanceRow(date, program, bookingCode),
          )
        } else {
          persistCheckInWrite(
            'upsertCheckInAttendance',
            upsertCheckInAttendanceRow(date, program, bookingCode, status),
          )
        }
        // No-show frees the boat seat — remove them from the day's boat plan.
        if (status === 'no-show') {
          upsertPlan(date, program, (plan) => {
            if (!plan.assignments[bookingCode]) return plan
            const assignments = { ...plan.assignments }
            delete assignments[bookingCode]
            return { ...plan, assignments }
          })
        }
      },
      getCheckInPayment: (date, program, bookingCode) =>
        getCheckInPayment(checkInPayment, date, program, bookingCode),
      setCheckInPayment: (date, program, bookingCode, status) => {
        setCheckInPaymentMap((current) => {
          const next = withCheckInPayment(current, date, program, bookingCode, status)
          saveCheckInPaymentMap(next)
          return next
        })
        if (status === null) {
          persistCheckInWrite(
            'deleteCheckInPayment',
            deleteCheckInPaymentRow(date, program, bookingCode),
          )
        } else {
          persistCheckInWrite(
            'upsertCheckInPayment',
            upsertCheckInPaymentRow(date, program, bookingCode, status),
          )
        }
      },
      getCheckInTicket: (date, program, bookingCode) =>
        getCheckInTicket(checkInTicket, date, program, bookingCode),
      setCheckInTicket: (date, program, bookingCode, status) => {
        setCheckInTicketMap((current) => {
          const next = withCheckInTicket(current, date, program, bookingCode, status)
          if (typeof window === 'undefined') saveCheckInTicketMap(next)
          else window.setTimeout(() => saveCheckInTicketMap(next), 0)
          return next
        })
        if (status === null) {
          persistCheckInWrite(
            'deleteCheckInTicket',
            deleteCheckInTicketRow(date, program, bookingCode),
          )
        } else {
          persistCheckInWrite(
            'upsertCheckInTicket',
            upsertCheckInTicketRow(date, program, bookingCode, status),
          )
        }
      },
      getCheckInServices: (date, program, bookingCode) =>
        getCheckInServices(checkInServices, date, program, bookingCode),
      setCheckInServices: (date, program, bookingCode, services) => {
        setCheckInServiceMap((current) => {
          const next = withCheckInServices(current, date, program, bookingCode, services)
          saveCheckInServiceMap(next)
          return next
        })
        persistCheckInWrite(
          'replaceCheckInServices',
          replaceCheckInServicesForBooking(date, program, bookingCode, services),
        )
      },
      getGuestSequences: (date, program) =>
        buildGuestSequenceMap({
          bookings: bookings.filter(
            (booking) =>
              isActiveBooking(booking) && booking.date === date && booking.program === program,
          ),
          vehiclePlan: getDayVehiclePlan(date, program),
          boatPlan: getDayBoatPlan(date, program),
          starts: getCheckInSequenceStarts(checkInSequence, date, program),
        }),
      getGuestSequence: (date, program, bookingCode) =>
        buildGuestSequenceMap({
          bookings: bookings.filter(
            (booking) =>
              isActiveBooking(booking) && booking.date === date && booking.program === program,
          ),
          vehiclePlan: getDayVehiclePlan(date, program),
          boatPlan: getDayBoatPlan(date, program),
          starts: getCheckInSequenceStarts(checkInSequence, date, program),
        })[bookingCode] ?? null,
      setCheckInSequenceProgramStart: (date, program, start) => {
        setCheckInSequenceMap((current) => {
          const next = withCheckInSequenceProgramStart(current, date, program, start)
          saveCheckInSequenceMap(next)
          return next
        })
        persistCheckInWrite(
          start == null ? 'deleteCheckInSequenceStart' : 'upsertCheckInSequenceStart',
          start == null
            ? deleteCheckInSequenceStart(date, program, PROGRAM_SEQUENCE_BOOKING_KEY)
            : upsertCheckInSequenceStart(date, program, PROGRAM_SEQUENCE_BOOKING_KEY, start),
        )
      },
      setCheckInSequenceBookingStart: (date, program, bookingCode, start) => {
        setCheckInSequenceMap((current) => {
          const next = withCheckInSequenceBookingStart(
            current,
            date,
            program,
            bookingCode,
            start,
          )
          saveCheckInSequenceMap(next)
          return next
        })
        persistCheckInWrite(
          start == null ? 'deleteCheckInSequenceStart' : 'upsertCheckInSequenceStart',
          start == null
            ? deleteCheckInSequenceStart(date, program, bookingCode)
            : upsertCheckInSequenceStart(date, program, bookingCode, start),
        )
      },
      getCheckInEnrollments: (date, program, bookingCode) =>
        getCheckInEnrollments(checkInEnrollment, date, program, bookingCode),
      updateCheckInEnrollment: (input) => {
        const firstName = input.enrollment.firstName.trim()
        const lastName = input.enrollment.lastName.trim()
        const nationality = matchNationality(input.enrollment.nationality.trim())
        const birthday = input.enrollment.birthday.trim()
        const passportNumber = input.enrollment.passportNumber.trim()
        if (!firstName) return { ok: false, error: 'Enter first name.' }
        if (!lastName) return { ok: false, error: 'Enter last name.' }
        if (!nationality) return { ok: false, error: 'Select a nationality from the list.' }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return { ok: false, error: 'Select birthday.' }
        if (!passportNumber) return { ok: false, error: 'Enter passport number.' }

        const existing = getCheckInEnrollments(
          checkInEnrollment,
          input.date,
          input.program,
          input.bookingCode,
        )
        const current = existing.find((item) => item.id === input.enrollment.id)
        if (!current) return { ok: false, error: 'Guest check-in not found.' }

        const nextEnrollment: CheckInEnrollment = {
          ...current,
          firstName,
          lastName,
          nationality,
          birthday,
          passportNumber,
        }

        setCheckInEnrollmentMap((map) => {
          const next = withUpdatedCheckInEnrollment(
            map,
            input.date,
            input.program,
            input.bookingCode,
            nextEnrollment,
          )
          saveCheckInEnrollmentMap(next)
          return next
        })
        persistCheckInWrite(
          'upsertCheckInEnrollments',
          upsertCheckInEnrollments(input.date, input.program, input.bookingCode, [
            nextEnrollment,
          ]),
        )
        return { ok: true }
      },
      getCheckInGuestEditIds: (date, program, bookingCode) =>
        getCheckInGuestEditIds(checkInGuestEdit, date, program, bookingCode),
      isCheckInGuestEditOpen: (date, program, bookingCode, enrollmentId) =>
        isCheckInGuestEditOpen(checkInGuestEdit, date, program, bookingCode, enrollmentId),
      setCheckInGuestEditOpen: (date, program, bookingCode, enrollmentId, open) => {
        setCheckInGuestEditMap((current) => {
          const next = withCheckInGuestEdit(
            current,
            date,
            program,
            bookingCode,
            enrollmentId,
            open,
          )
          saveCheckInGuestEditMap(next)
          return next
        })
        persistCheckInWrite(
          open ? 'upsertCheckInGuestEdit' : 'deleteCheckInGuestEdit',
          open
            ? upsertCheckInGuestEdit(date, program, bookingCode, enrollmentId)
            : deleteCheckInGuestEdit(date, program, bookingCode, enrollmentId),
        )
      },
      getCheckInNote: (date, program, bookingCode) =>
        getCheckInNote(checkInNotes, date, program, bookingCode),
      setCheckInNote: (date, program, bookingCode, note) => {
        setCheckInNoteMap((current) => {
          const next = withCheckInNote(current, date, program, bookingCode, note)
          saveCheckInNoteMap(next)
          return next
        })
        const text = note.trim()
        persistCheckInWrite(
          text ? 'upsertCheckInNote' : 'deleteCheckInNote',
          text
            ? upsertCheckInNoteRow(date, program, bookingCode, text)
            : deleteCheckInNoteRow(date, program, bookingCode),
        )
      },
      removeCheckInEnrollment: (date, program, bookingCode, enrollmentId) => {
        setCheckInEnrollmentMap((current) => {
          const next = withoutCheckInEnrollment(
            current,
            date,
            program,
            bookingCode,
            enrollmentId,
          )
          saveCheckInEnrollmentMap(next)
          return next
        })
        persistCheckInWrite('deleteCheckInEnrollment', deleteCheckInEnrollment(enrollmentId))
        setCheckInAttendanceMap((current) => {
          if (getCheckInAttendance(current, date, program, bookingCode) !== 'checked') {
            return current
          }
          const booking = bookings.find((item) => item.code === bookingCode)
          const remaining = enrolledSeatCount(
            getCheckInEnrollments(checkInEnrollment, date, program, bookingCode).filter(
              (item) => item.id !== enrollmentId,
            ),
          )
          if (booking && remaining >= totalPassengers(booking)) return current
          const next = withCheckInAttendance(current, date, program, bookingCode, null)
          saveCheckInAttendanceMap(next)
          persistCheckInWrite(
            'deleteCheckInAttendance',
            deleteCheckInAttendanceRow(date, program, bookingCode),
          )
          return next
        })
      },
      trimCheckInEnrollments: (date, program, bookingCode, maxSeats) => {
        const next = trimCheckInEnrollmentsToSeats(
          checkInEnrollment,
          date,
          program,
          bookingCode,
          Math.max(0, maxSeats),
        )
        const trimmed = getCheckInEnrollments(next, date, program, bookingCode)
        setCheckInEnrollmentMap(next)
        saveCheckInEnrollmentMap(next)
        persistCheckInWrite(
          'replaceCheckInEnrollments',
          replaceCheckInEnrollmentsForBooking(date, program, bookingCode, trimmed),
        )
        setCheckInAttendanceMap((current) => {
          if (getCheckInAttendance(current, date, program, bookingCode) !== 'checked') {
            return current
          }
          const booking = bookings.find((item) => item.code === bookingCode)
          if (!booking || Math.max(0, maxSeats) >= totalPassengers(booking)) return current
          const cleared = withCheckInAttendance(current, date, program, bookingCode, null)
          saveCheckInAttendanceMap(cleared)
          persistCheckInWrite(
            'deleteCheckInAttendance',
            deleteCheckInAttendanceRow(date, program, bookingCode),
          )
          return cleared
        })
      },
      recordGuestCheckIn: (input) => {
        const batch = recordGuestCheckInsInternal({
          date: input.date,
          program: input.program,
          bookingCode: input.bookingCode,
          scope: input.scope,
          guests: [
            {
              firstName: input.firstName,
              lastName: input.lastName,
              nationality: input.nationality,
              birthday: input.birthday,
              passportNumber: input.passportNumber,
            },
          ],
        })
        if (!batch.ok) return batch
        return {
          ok: true,
          enrollment: {
            id: newEnrollmentId(),
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            nationality: input.nationality.trim(),
            birthday: input.birthday.trim(),
            passportNumber: input.passportNumber.trim(),
            scope: input.scope,
            seats: 1,
            checkedInAt: new Date().toISOString(),
          },
        }
      },
      recordGuestCheckIns: (input) => recordGuestCheckInsInternal(input),
      getDayVehiclePlan,
      getFleetVan,
      resolveVanMeta,
      upsertDriver: (entry) => {
        const cleaned: DriverRosterEntry = {
          name: entry.name.trim(),
          phone: entry.phone.trim(),
          plate: entry.plate.trim(),
        }
        if (!cleaned.name) return
        setDrivers((current) => {
          const next = mergeDriverRoster([...current, cleaned])
          saveLocalDrivers(next)
          return next
        })
        persistQuietly('upsertDriver', upsertDriverRow(cleaned))
      },
      getBookingClosure,
      isProgramClosed,
      isBookingOpen: (travelDate) => isBookingOpenForDate(bookingCutoffs, travelDate),
      earliestBookableDate: () => earliestBookableTravelDate(bookingCutoffs),
      isCancelOpen: (travelDate) => isCancelOpenForDate(bookingCutoffs, travelDate),
      isLateAmendment: (travelDate) => isLateAmendmentForDate(bookingCutoffs, travelDate),
      isLateFeeTime: (travelDate) => isLateFeeTimeForDate(bookingCutoffs, travelDate),
      updateBookingCutoffs: (patch) => {
        setBookingCutoffs((current) => {
          const next: BookingCutoffSettings = {
            ...current,
            ...patch,
            timezone: DEFAULT_BOOKING_CUTOFFS.timezone,
            bookBeforeDays: normalizeBeforeDays(
              patch.bookBeforeDays ?? current.bookBeforeDays,
            ),
            cancelBeforeDays: normalizeBeforeDays(
              patch.cancelBeforeDays ?? current.cancelBeforeDays,
            ),
            bookUntilTime:
              normalizeCutoffTime(patch.bookUntilTime ?? current.bookUntilTime) ??
              current.bookUntilTime,
            cancelUntilTime:
              normalizeCutoffTime(patch.cancelUntilTime ?? current.cancelUntilTime) ??
              current.cancelUntilTime,
            lateFeeFromTime:
              normalizeCutoffTime(patch.lateFeeFromTime ?? current.lateFeeFromTime) ??
              current.lateFeeFromTime,
            dateChangeFeePerPerson: normalizeDateChangeFee(
              patch.dateChangeFeePerPerson ?? current.dateChangeFeePerPerson,
            ),
          }
          persistQuietly('upsertBookingCutoffs', upsertBookingCutoffs(next))
          return next
        })
      },
      closeBookingForDates: (dates, programs, reason = '') => {
        if (dates.length === 0 || programs.length === 0) return
        const trimmedReason = reason.trim()
        setBookingClosures((current) => {
          const byKey = new Map(
            current.map((item) => [bookingClosureKey(item.date, item.program), item]),
          )
          const touched: BookingClosure[] = []
          for (const date of dates) {
            for (const program of programs) {
              const next: BookingClosure = { date, program, reason: trimmedReason }
              byKey.set(bookingClosureKey(date, program), next)
              touched.push(next)
            }
          }
          persistQuietly('upsertBookingClosures', upsertBookingClosures(touched))
          return Array.from(byKey.values()).sort((a, b) =>
            a.date === b.date
              ? a.program.localeCompare(b.program)
              : a.date.localeCompare(b.date),
          )
        })
      },
      openBookingForDates: (dates, programs) => {
        if (dates.length === 0 || programs.length === 0) return
        const toRemove = dates.flatMap((date) =>
          programs.map((program) => ({ date, program })),
        )
        setBookingClosures((current) => {
          const removeKeys = new Set(
            toRemove.map((item) => bookingClosureKey(item.date, item.program)),
          )
          persistQuietly('deleteBookingClosures', deleteBookingClosures(toRemove))
          return current.filter(
            (item) => !removeKeys.has(bookingClosureKey(item.date, item.program)),
          )
        })
      },
      addBooking: (input, options) => {
        if (!options?.bypassCutoff && !isBookingOpenForDate(bookingCutoffs, input.date)) {
          return { ok: false, error: bookingClosedMessage(bookingCutoffs, input.date) }
        }

        const closure = getBookingClosure(input.date, input.program)
        if (closure && !options?.bypassCutoff) {
          return {
            ok: false,
            error: closure.reason
              ? `Booking closed for ${input.program} on this date — ${closure.reason}`
              : `Booking closed for ${input.program} on this date.`,
          }
        }

        const pax = totalPassengers(input)
        const caps = getCapacity(input.date)
        const capacity = input.program === 'PP' ? caps.ppCapacity : caps.jamesBondCapacity
        const booked = bookedPaxFor(input.date, input.program)
        const seatsLeft = Math.max(0, capacity - booked)
        if (pax > seatsLeft) {
          return {
            ok: false,
            error:
              seatsLeft === 0
                ? `${input.program} is sold out on this date (${capacity} seats).`
                : `Only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left for ${input.program} on this date (capacity ${capacity}).`,
          }
        }

        const code = nextBookingCode(
          input.program,
          input.date,
          bookings.map((booking) => booking.code),
        )
        const noTransfer = isNoTransfer(input.pickupZone)
        const zone = zones.find((item) => item.name === input.pickupZone)
        const pending = !noTransfer && (zone?.pending ?? input.pickupZone === 'Other')
        const pickupTime = noTransfer
          ? NO_TRANSFER_TIME
          : (input.pickupTime ?? (pending ? 'Awaiting pickup time' : getZoneTime(input.pickupZone)))
        const matchedHotel = hotels.find(
          (hotel) =>
            hotel.name.toLowerCase() === (input.pickupHotel ?? '').trim().toLowerCase(),
        )
        const transferExtraCharge =
          input.transferExtraCharge?.trim() || matchedHotel?.extraChargeTransfer?.trim() || ''
        const booking: Booking = {
          ...input,
          agentRef: input.agentRef?.trim() ?? '',
          roomNumber: input.roomNumber?.trim() ?? '',
          note: input.note?.trim() ?? '',
          cashOnTour: input.cashOnTour?.trim() ?? '',
          transferExtraCharge,
          ...emptyPrivateTransferFields(),
          code,
          pickupTime,
          status: pending ? 'Pending Pickup Time' : 'Confirmed',
          lateChangeFee: 0,
        }
        setBookings((current) => [booking, ...current])
        persistBookingWrite(
          'insertBooking',
          insertBooking(booking).catch((error) => {
            setBookings((current) => current.filter((item) => item.code !== code))
            const message =
              error instanceof Error ? error.message : 'Failed to save booking to Supabase'
            setLoadError(`Booking ${code} was not saved: ${message}`)
            throw error
          }),
        )
        logBookingEvent(
          code,
          'created',
          `Created for ${booking.date} · ${booking.program} · ${totalPassengers(booking)} pax`,
          options?.actor ?? {
            role: 'agent',
            name: booking.agentName,
            slug: booking.agentSlug,
          },
        )
        return { ok: true, booking }
      },
      cancelBooking: (code, options) => {
        const existing = bookings.find((booking) => booking.code === code)
        if (!existing || existing.status === 'Cancelled') {
          return { ok: false, error: 'Booking not found or already cancelled.' }
        }
        const blocked = agentModifyBlocked(existing, options)
        if (blocked) return { ok: false, error: blocked }

        const lateCancel =
          options?.lateCancel !== undefined
            ? options.lateCancel
            : !options?.bypassCutoff && isLateAmendmentForDate(bookingCutoffs, existing.date)
        const cancelFee =
          options?.cancelFee !== undefined
            ? Math.max(0, Math.floor(options.cancelFee))
            : existing.cancelFee
        setBookings((current) =>
          current.map((booking) =>
            booking.code === code
              ? { ...booking, status: 'Cancelled', lateCancel, cancelFee }
              : booking,
          ),
        )
        persistBookingWrite(
          'updateBookingStatus',
          updateBookingStatus(code, 'Cancelled', { lateCancel, cancelFee }),
        )
        logBookingEvent(
          code,
          'cancelled',
          lateCancel
            ? cancelFee !== undefined
              ? `Cancelled · charge ${cancelFee.toLocaleString('en-US')} THB · was ${existing.date}`
              : `Cancelled after ${bookingCutoffs.lateFeeFromTime} · full price charged (no refund) · was ${existing.date}`
            : `Cancelled · no cancel charge · was ${existing.date}`,
          options?.actor,
        )

        upsertPlan(existing.date, existing.program, (plan) => {
          if (!(code in plan.assignments)) return plan
          const assignments = { ...plan.assignments }
          delete assignments[code]
          return { ...plan, assignments }
        })

        upsertVehiclePlan(existing.date, existing.program, (plan) => {
          if (!(code in plan.assignments)) return plan
          const assignments = { ...plan.assignments }
          delete assignments[code]
          return { ...plan, assignments }
        })

        return { ok: true }
      },
      changeBookingDate: (code, newDate, options) => {
        const existing = bookings.find((booking) => booking.code === code)
        if (!existing || existing.status === 'Cancelled') {
          return { ok: false, error: 'Booking not found or already cancelled.' }
        }

        const trimmedDate = newDate.trim()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
          return { ok: false, error: 'Choose a valid travel date.' }
        }
        if (trimmedDate === existing.date) {
          return { ok: false, error: 'Pick a different travel date.' }
        }

        // Same window as cancel: agents may only change while cancel is still open and day is not admin-closed.
        const blocked = agentModifyBlocked(existing, options)
        if (blocked) return { ok: false, error: blocked }

        if (!options?.bypassCutoff && !isBookingOpenForDate(bookingCutoffs, trimmedDate)) {
          return { ok: false, error: bookingClosedMessage(bookingCutoffs, trimmedDate) }
        }

        const closure = getBookingClosure(trimmedDate, existing.program)
        if (closure && !options?.bypassCutoff) {
          return {
            ok: false,
            error: closure.reason
              ? `Booking closed for ${existing.program} on the new date — ${closure.reason}`
              : `Booking closed for ${existing.program} on the new date.`,
          }
        }

        const pax = totalPassengers(existing)
        const caps = getCapacity(trimmedDate)
        const capacity =
          existing.program === 'PP' ? caps.ppCapacity : caps.jamesBondCapacity
        const booked = bookedPaxFor(trimmedDate, existing.program)
        const seatsLeft = Math.max(0, capacity - booked)
        if (pax > seatsLeft) {
          return {
            ok: false,
            error:
              seatsLeft === 0
                ? `${existing.program} is sold out on ${trimmedDate} (${capacity} seats).`
                : `Only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left for ${existing.program} on ${trimmedDate}.`,
          }
        }

        const oldDate = existing.date
        const program = existing.program
        const extraFee =
          options?.lateChangeFee !== undefined
            ? Math.max(0, Math.floor(options.lateChangeFee))
            : !options?.bypassCutoff && isLateAmendmentForDate(bookingCutoffs, existing.date)
              ? dateChangeFeeAmount(bookingCutoffs, existing)
              : 0
        const nextLateFee = (existing.lateChangeFee ?? 0) + extraFee

        setBookings((current) =>
          current.map((booking) =>
            booking.code === code
              ? { ...booking, date: trimmedDate, lateChangeFee: nextLateFee }
              : booking,
          ),
        )
        persistBookingWrite(
          'updateBookingDate',
          updateBookingDate(code, trimmedDate, { lateChangeFee: nextLateFee }),
        )
        logBookingEvent(
          code,
          'date_changed',
          extraFee > 0
            ? `Date changed ${oldDate} → ${trimmedDate} · extra charge ${formatThbAmount(extraFee)}`
            : options?.lateChangeFee === 0
              ? `Date changed ${oldDate} → ${trimmedDate} · extra charge waived`
              : `Date changed ${oldDate} → ${trimmedDate}`,
          options?.actor,
        )

        // Free seats on the old date by dropping boat/van assignments for this booking.
        upsertPlan(oldDate, program, (plan) => {
          if (!(code in plan.assignments)) return plan
          const assignments = { ...plan.assignments }
          delete assignments[code]
          return { ...plan, assignments }
        })
        upsertVehiclePlan(oldDate, program, (plan) => {
          if (!(code in plan.assignments)) return plan
          const assignments = { ...plan.assignments }
          delete assignments[code]
          return { ...plan, assignments }
        })

        return { ok: true }
      },
      rebookBooking: (code, newDate, options) => {
        const existing = bookings.find((booking) => booking.code === code)
        if (!existing) {
          return { ok: false, error: 'Booking not found.' }
        }
        if (existing.status !== 'Cancelled') {
          return { ok: false, error: 'Only cancelled bookings can be rebooked.' }
        }

        const trimmedDate = newDate.trim()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
          return { ok: false, error: 'Choose a valid travel date.' }
        }

        if (!options?.bypassCutoff && !isBookingOpenForDate(bookingCutoffs, trimmedDate)) {
          return { ok: false, error: bookingClosedMessage(bookingCutoffs, trimmedDate) }
        }

        const closure = getBookingClosure(trimmedDate, existing.program)
        if (closure && !options?.bypassCutoff) {
          return {
            ok: false,
            error: closure.reason
              ? `Booking closed for ${existing.program} on this date — ${closure.reason}`
              : `Booking closed for ${existing.program} on this date.`,
          }
        }

        const pax = totalPassengers(existing)
        const caps = getCapacity(trimmedDate)
        const capacity =
          existing.program === 'PP' ? caps.ppCapacity : caps.jamesBondCapacity
        const booked = bookedPaxFor(trimmedDate, existing.program)
        const seatsLeft = Math.max(0, capacity - booked)
        if (pax > seatsLeft) {
          return {
            ok: false,
            error:
              seatsLeft === 0
                ? `${existing.program} is sold out on this date (${capacity} seats).`
                : `Only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left for ${existing.program} on this date (capacity ${capacity}).`,
          }
        }

        const noTransfer = isNoTransfer(existing.pickupZone)
        const zone = zones.find((item) => item.name === existing.pickupZone)
        const awaiting =
          !existing.pickupTime ||
          existing.pickupTime.toLowerCase().includes('awaiting')
        const pending =
          !noTransfer &&
          awaiting &&
          (zone?.pending ?? existing.pickupZone === 'Other')
        const nextStatus = pending ? ('Pending Pickup Time' as const) : ('Confirmed' as const)

        setBookings((current) =>
          current.map((booking) =>
            booking.code === code
              ? { ...booking, date: trimmedDate, status: nextStatus }
              : booking,
          ),
        )
        persistBookingWrite(
          'updateBookingRebook',
          updateBookingRebook(code, trimmedDate, nextStatus),
        )
        logBookingEvent(
          code,
          'rebooked',
          `Rebooked to ${trimmedDate} · ${nextStatus}`,
          options?.actor,
        )

        return { ok: true }
      },
      updateBookingDetails: (code, patch, options) => {
        const existing = bookings.find((booking) => booking.code === code)
        if (!existing || existing.status === 'Cancelled') {
          return { ok: false, error: 'Booking not found or already cancelled.' }
        }
        const blocked = agentModifyBlocked(existing, options)
        if (blocked) return { ok: false, error: blocked }

        const nextPickupZone =
          patch.pickupZone !== undefined ? patch.pickupZone.trim() : existing.pickupZone
        if (!nextPickupZone) return { ok: false, error: 'Choose a pickup option.' }

        const next: Booking = {
          ...existing,
          leadGuest: patch.leadGuest !== undefined ? patch.leadGuest.trim() : existing.leadGuest,
          adults: patch.adults ?? existing.adults,
          children: patch.children ?? existing.children,
          infants: patch.infants ?? existing.infants,
          tourLeaders: patch.tourLeaders ?? existing.tourLeaders,
          pickupZone: nextPickupZone,
          pickupHotel:
            patch.pickupHotel !== undefined ? patch.pickupHotel.trim() : existing.pickupHotel,
          roomNumber:
            patch.roomNumber !== undefined ? patch.roomNumber.trim() : existing.roomNumber,
          note: patch.note !== undefined ? patch.note.trim() : existing.note,
          cashOnTour:
            patch.cashOnTour !== undefined ? patch.cashOnTour.trim() : existing.cashOnTour,
          agentRef: patch.agentRef !== undefined ? patch.agentRef.trim() : existing.agentRef,
          parkFee: patch.parkFee ?? existing.parkFee,
          canoe: patch.canoe !== undefined ? patch.canoe : existing.canoe,
          transferExtraCharge:
            patch.transferExtraCharge !== undefined
              ? patch.transferExtraCharge.trim()
              : existing.transferExtraCharge,
          privateTransferVehicle:
            patch.privateTransferVehicle !== undefined
              ? patch.privateTransferVehicle
              : existing.privateTransferVehicle,
          privateTransferPrice:
            patch.privateTransferPrice !== undefined
              ? patch.privateTransferPrice.trim()
              : existing.privateTransferPrice,
          privateDriverName:
            patch.privateDriverName !== undefined
              ? patch.privateDriverName.trim()
              : existing.privateDriverName,
          privateDriverPhone:
            patch.privateDriverPhone !== undefined
              ? patch.privateDriverPhone.trim()
              : existing.privateDriverPhone,
        }

        const noTransfer = isNoTransfer(next.pickupZone)
        const privateTransfer = isPrivateTransfer(next)

        if (noTransfer) {
          next.pickupHotel = ''
          next.roomNumber = ''
          next.pickupTime = NO_TRANSFER_TIME
          next.transferExtraCharge = ''
          Object.assign(next, emptyPrivateTransferFields())
          next.status = 'Confirmed'
        } else if (privateTransfer) {
          next.pickupZone = PRIVATE_TRANSFER_ZONE
          if (!next.pickupHotel) {
            return { ok: false, error: 'Enter the pickup hotel.' }
          }
          const vehicle =
            next.privateTransferVehicle === 'Car' || next.privateTransferVehicle === 'Van'
              ? next.privateTransferVehicle
              : null
          if (!vehicle) {
            return { ok: false, error: 'Choose Car (1,400 THB) or Van (1,600 THB).' }
          }
          next.privateTransferVehicle = vehicle
          next.privateTransferPrice = privateTransferPriceFor(vehicle)
          const pickupOverride =
            patch.pickupTime !== undefined ? patch.pickupTime.trim() : next.pickupTime.trim()
          if (!pickupOverride || pickupOverride.toLowerCase().includes('awaiting')) {
            return { ok: false, error: 'Set the private transfer pickup time.' }
          }
          next.pickupTime = pickupOverride
          next.transferExtraCharge = ''
          next.status = 'Confirmed'
        } else {
          Object.assign(next, emptyPrivateTransferFields())
          if (!zones.some((zone) => zone.name === next.pickupZone)) {
            return { ok: false, error: 'Choose a valid pickup zone.' }
          }
          if (!next.pickupHotel) {
            return { ok: false, error: 'Enter the pickup hotel.' }
          }
          const zone = zones.find((item) => item.name === next.pickupZone)
          const awaiting =
            !next.pickupTime ||
            next.pickupTime.toLowerCase().includes('awaiting') ||
            isNoTransfer(existing.pickupZone) ||
            isPrivateTransfer(existing) ||
            next.pickupZone !== existing.pickupZone
          const pending = zone?.pending ?? next.pickupZone === 'Other'
          if (patch.pickupTime !== undefined && patch.pickupTime.trim()) {
            next.pickupTime = patch.pickupTime.trim()
          } else if (awaiting || next.pickupZone !== existing.pickupZone) {
            next.pickupTime = pending
              ? 'Awaiting pickup time'
              : getZoneTime(next.pickupZone)
          }
          next.status =
            next.pickupTime.toLowerCase().includes('awaiting') || pending
              ? 'Pending Pickup Time'
              : 'Confirmed'
          if (patch.transferExtraCharge === undefined) {
            const matchedHotel = hotels.find(
              (hotel) => hotel.name.toLowerCase() === next.pickupHotel.toLowerCase(),
            )
            next.transferExtraCharge = matchedHotel?.extraChargeTransfer.trim() ?? ''
          }
        }

        if (!next.leadGuest) return { ok: false, error: 'Enter the guest name.' }
        const newPax = totalPassengers(next)
        if (newPax < 1) return { ok: false, error: 'At least 1 passenger is required.' }

        const oldPax = totalPassengers(existing)
        const delta = newPax - oldPax
        if (delta > 0) {
          const caps = getCapacity(existing.date)
          const capacity =
            existing.program === 'PP' ? caps.ppCapacity : caps.jamesBondCapacity
          const booked = bookedPaxFor(existing.date, existing.program)
          const seatsLeft = Math.max(0, capacity - booked)
          if (delta > seatsLeft) {
            return {
              ok: false,
              error:
                seatsLeft === 0
                  ? `No seats left to add guests on this date (capacity ${capacity}).`
                  : `Only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left — cannot add ${delta} more.`,
            }
          }
        }

        const changes: string[] = []
        if (next.leadGuest !== existing.leadGuest) changes.push('guest')
        if (
          next.adults !== existing.adults ||
          next.children !== existing.children ||
          next.infants !== existing.infants ||
          next.tourLeaders !== existing.tourLeaders
        ) {
          changes.push(
            newPax !== oldPax
              ? `pax ${oldPax}→${newPax}`
              : `pax mix ${existing.adults}AD/${existing.children}CH→${next.adults}AD/${next.children}CH`,
          )
        }
        if (next.pickupZone !== existing.pickupZone) {
          changes.push(
            isNoTransfer(next.pickupZone)
              ? 'no transfer'
              : isPrivateTransfer(next)
                ? 'private transfer'
                : isNoTransfer(existing.pickupZone) || isPrivateTransfer(existing)
                  ? 'add transfer'
                  : 'pickup zone',
          )
        }
        if (next.pickupHotel !== existing.pickupHotel) changes.push('hotel')
        if (next.roomNumber !== existing.roomNumber) changes.push('room')
        if (next.pickupTime !== existing.pickupTime) changes.push('pickup time')
        if (next.privateTransferVehicle !== existing.privateTransferVehicle) {
          changes.push('private vehicle')
        }
        if (next.privateDriverName !== existing.privateDriverName) changes.push('private driver')
        if (next.note !== existing.note) changes.push('note')
        if (next.cashOnTour !== existing.cashOnTour) changes.push('cash on tour')
        if (next.agentRef !== existing.agentRef) changes.push('voucher number')
        if (next.parkFee !== existing.parkFee) changes.push('park fee')
        if (next.canoe !== existing.canoe) changes.push('canoe')

        const lateFeeWindow = isLateFeeTimeForDate(bookingCutoffs, existing.date)
        const removedAdults = Math.max(0, existing.adults - next.adults)
        const removedChildren = Math.max(0, existing.children - next.children)
        const removedChargeable = removedAdults + removedChildren
        const extraFee =
          options?.lateChangeFee !== undefined
            ? Math.max(0, Math.floor(options.lateChangeFee))
            : !options?.bypassCutoff && lateFeeWindow && removedChargeable > 0
              ? removedChargeable * bookingCutoffs.dateChangeFeePerPerson
              : 0
        if (extraFee > 0) {
          next.lateChangeFee = (existing.lateChangeFee ?? 0) + extraFee
          changes.push(
            `extra charge ${formatThbAmount(extraFee)} (reduce ${removedAdults} AD + ${removedChildren} CH × ${formatThbAmount(bookingCutoffs.dateChangeFeePerPerson)})`,
          )
        } else if (options?.lateChangeFee === 0 && options.bypassCutoff) {
          changes.push('extra charge waived')
        }

        if (changes.length === 0) return { ok: false, error: 'No changes to save.' }

        setBookings((current) =>
          current.map((booking) => (booking.code === code ? next : booking)),
        )
        persistBookingWrite('updateBookingDetails', updateBookingDetails(next))
        logBookingEvent(
          code,
          'details_edited',
          `Updated ${changes.join(', ')}`,
          options?.actor,
        )
        return { ok: true, booking: next }
      },
      setBookingPickupTime: (code, pickupTime, options) => {
        const existing = bookings.find((booking) => booking.code === code)
        if (!existing || existing.status === 'Cancelled') {
          return { ok: false, error: 'Booking not found or already cancelled.' }
        }
        if (isNoTransfer(existing.pickupZone)) {
          return { ok: false, error: 'No Transfer bookings do not need a pickup time.' }
        }
        if (isPrivateTransferZone(existing.pickupZone) || isPrivateTransfer(existing)) {
          // private pickup time is edited via booking details (with vehicle/driver)
        }
        const trimmed = pickupTime.trim()
        if (!trimmed) return { ok: false, error: 'Enter a pickup time.' }

        setBookings((current) =>
          current.map((booking) =>
            booking.code === code
              ? { ...booking, pickupTime: trimmed, status: 'Confirmed' }
              : booking,
          ),
        )
        persistBookingWrite(
          'updateBookingPickup',
          updateBookingPickup(code, trimmed, 'Confirmed'),
        )
        logBookingEvent(code, 'pickup_set', `Pickup time set to ${trimmed}`, options?.actor)
        return { ok: true }
      },
      getBookingHistory: (code) => bookingEventsByCode[code] ?? [],
      loadBookingHistory: async (code) => {
        try {
          const events = await fetchBookingEvents(code)
          setBookingEventsByCode((current) => ({ ...current, [code]: events }))
          return events
        } catch (error) {
          console.error('[portal] load booking history failed', error)
          return bookingEventsByCode[code] ?? []
        }
      },
      updateZoneTime: (name, time) => {
        setZones((current) => {
          const next = current.map((zone) =>
            zone.name === name && !zone.pending ? { ...zone, time } : zone,
          )
          const updated = next.find((zone) => zone.name === name)
          if (updated) {
            const sortOrder = next.findIndex((zone) => zone.name === name) * 10 + 10
            persistQuietly('upsertZone', upsertZone(updated, sortOrder))
          }
          return next
        })
      },
      addZone: (name, time) => {
        const trimmedName = name.trim().replace(/\s+/g, ' ')
        const trimmedTime = time.trim()
        if (!trimmedName) return 'Enter a zone name.'
        if (!trimmedTime) return 'Enter a pickup time.'
        if (isNoTransfer(trimmedName)) {
          return 'No Transfer is a built-in booking option, not a pickup zone.'
        }
        const exists = zones.some(
          (zone) => zone.name.toLowerCase() === trimmedName.toLowerCase(),
        )
        if (exists) return 'This zone already exists.'
        const nextZone: PickupZone = { name: trimmedName, time: trimmedTime, pending: false }
        setZones((current) => {
          const otherIndex = current.findIndex((zone) => zone.name === 'Other' || zone.pending)
          const next =
            otherIndex === -1
              ? [...current, nextZone]
              : [...current.slice(0, otherIndex), nextZone, ...current.slice(otherIndex)]
          const sortOrder = next.findIndex((zone) => zone.name === trimmedName) * 10 + 10
          persistQuietly('upsertZone', upsertZone(nextZone, sortOrder))
          return next
        })
        return null
      },
      removeZone: (name) => {
        if (isCorePickupZone(name)) return
        setZones((current) => current.filter((zone) => zone.name !== name))
        setHotels((current) =>
          current.map((hotel) =>
            hotel.zoneName === name ? { ...hotel, zoneName: null } : hotel,
          ),
        )
        persistQuietly('deleteZone', deleteZone(name))
      },
      addHotel: (name, zoneName, extraChargeTransfer) => {
        const trimmedName = name.trim().replace(/\s+/g, ' ')
        if (!trimmedName) return 'Enter a hotel name.'
        const duplicate = hotels.some(
          (hotel) => hotel.name.toLowerCase() === trimmedName.toLowerCase(),
        )
        if (duplicate) return 'This hotel already exists.'
        if (zoneName) {
          const zoneExists = zones.some((zone) => zone.name === zoneName)
          if (!zoneExists) return 'Select a valid pickup zone.'
        }
        const note = (extraChargeTransfer ?? '').trim()
        const hotel: Hotel = {
          id: crypto.randomUUID(),
          name: trimmedName,
          zoneName,
          active: true,
          extraChargeTransfer: note,
        }
        setHotels((current) =>
          [...current, hotel].sort((a, b) => a.name.localeCompare(b.name)),
        )
        persistQuietly('upsertHotel', upsertHotel(hotel))
        return null
      },
      updateHotel: (id, name, zoneName, extraChargeTransfer) => {
        const trimmedName = name.trim().replace(/\s+/g, ' ')
        if (!trimmedName) return 'Enter a hotel name.'
        const duplicate = hotels.some(
          (hotel) =>
            hotel.id !== id && hotel.name.toLowerCase() === trimmedName.toLowerCase(),
        )
        if (duplicate) return 'This hotel already exists.'
        if (zoneName) {
          const zoneExists = zones.some((zone) => zone.name === zoneName)
          if (!zoneExists) return 'Select a valid pickup zone.'
        }
        const existing = hotels.find((hotel) => hotel.id === id)
        if (!existing) return 'Hotel not found.'
        const note = (extraChargeTransfer ?? existing.extraChargeTransfer).trim()
        const updated: Hotel = {
          ...existing,
          name: trimmedName,
          zoneName,
          extraChargeTransfer: note,
        }
        setHotels((current) =>
          current
            .map((hotel) => (hotel.id === id ? updated : hotel))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
        persistQuietly('upsertHotel', upsertHotel(updated))
        return null
      },
      removeHotel: (id) => {
        setHotels((current) => current.filter((hotel) => hotel.id !== id))
        persistQuietly('deleteHotel', deleteHotel(id))
      },
      importHotelCatalog: () => {
        let added = 0
        let updated = 0
        const byName = new Map(
          hotels.map((hotel) => [hotel.name.toLowerCase(), hotel] as const),
        )
        const next = [...hotels]
        for (const [index, entry] of HOTEL_CATALOG.entries()) {
          const key = entry.name.toLowerCase()
          const existing = byName.get(key)
          if (existing) {
            if (existing.zoneName !== entry.zoneName) {
              const hotel: Hotel = {
                ...existing,
                zoneName: entry.zoneName,
                active: true,
              }
              const at = next.findIndex((item) => item.id === existing.id)
              if (at >= 0) next[at] = hotel
              byName.set(key, hotel)
              persistQuietly('upsertHotel', upsertHotel(hotel, (index + 1) * 10))
              updated += 1
            }
            continue
          }
          const hotel: Hotel = {
            id: crypto.randomUUID(),
            name: entry.name,
            zoneName: entry.zoneName,
            active: true,
            extraChargeTransfer: '',
          }
          next.push(hotel)
          byName.set(key, hotel)
          persistQuietly('upsertHotel', upsertHotel(hotel, (index + 1) * 10))
          added += 1
        }
        setHotels(next.sort((a, b) => a.name.localeCompare(b.name)))
        return { added, updated }
      },
      setAgentStatus: (slug, status) => {
        setAgents((current) => {
          const next = current.map((agent) => (agent.slug === slug ? { ...agent, status } : agent))
          const updated = next.find((agent) => agent.slug === slug)
          if (updated) persistQuietly('upsertAgent', upsertAgent(updated))
          return next
        })
      },
      addAgent: (name) => {
        const trimmedName = name.trim().replace(/\s+/g, ' ')
        if (!trimmedName) return 'Enter an agent name.'
        const duplicate = agents.some(
          (agent) => agent.name.toLowerCase() === trimmedName.toLowerCase(),
        )
        if (duplicate) return 'An agent with this name already exists.'
        const slug = uniqueAgentSlug(
          trimmedName,
          agents.map((agent) => agent.slug),
        )
        const agent: Agent = {
          slug,
          name: trimmedName,
          country: '',
          status: 'Active',
        }
        setAgents((current) => [...current, agent])
        persistQuietly('upsertAgent', upsertAgent(agent))
        return null
      },
      updateAgent: (slug, name) => {
        const trimmedName = name.trim().replace(/\s+/g, ' ')
        if (!trimmedName) return 'Enter an agent name.'
        const duplicate = agents.some(
          (agent) =>
            agent.slug !== slug && agent.name.toLowerCase() === trimmedName.toLowerCase(),
        )
        if (duplicate) return 'An agent with this name already exists.'
        const existing = agents.find((agent) => agent.slug === slug)
        if (!existing) return 'Agent not found.'
        const updated: Agent = {
          ...existing,
          name: trimmedName,
        }
        setAgents((current) =>
          current.map((agent) => (agent.slug === slug ? updated : agent)),
        )
        persistQuietly('upsertAgent', upsertAgent(updated))
        if (existing.name !== trimmedName) {
          setBookings((current) =>
            current.map((booking) =>
              booking.agentSlug === slug ? { ...booking, agentName: trimmedName } : booking,
            ),
          )
          persistQuietly('updateBookingsAgentName', updateBookingsAgentName(slug, trimmedName))
        }
        return null
      },
      removeAgent: (slug) => {
        setAgents((current) => current.filter((agent) => agent.slug !== slug))
        persistQuietly('deleteAgent', deleteAgent(slug))
      },
      setCapacity: (date, program, capacity) => {
        setAvailability((current) => {
          const existing = current.find((item) => item.date === date)
          const next: Availability = {
            date,
            ppCapacity: existing?.ppCapacity ?? DEFAULT_PP_CAPACITY,
            jamesBondCapacity: existing?.jamesBondCapacity ?? DEFAULT_JB_CAPACITY,
          }
          if (program === 'PP') next.ppCapacity = capacity
          else next.jamesBondCapacity = capacity
          persistQuietly('upsertAvailability', upsertAvailability(next))
          if (existing) {
            return current.map((item) => (item.date === date ? next : item))
          }
          return [...current, next]
        })
      },
      setCapacityForDates: (dates, capacities) => {
        if (dates.length === 0) return
        if (capacities.ppCapacity === undefined && capacities.jamesBondCapacity === undefined) return
        setAvailability((current) => {
          const byDate = new Map(current.map((item) => [item.date, item]))
          const touched: Availability[] = []
          for (const date of dates) {
            const existing = byDate.get(date)
            const next: Availability = {
              date,
              ppCapacity: capacities.ppCapacity ?? existing?.ppCapacity ?? DEFAULT_PP_CAPACITY,
              jamesBondCapacity:
                capacities.jamesBondCapacity ?? existing?.jamesBondCapacity ?? DEFAULT_JB_CAPACITY,
            }
            byDate.set(date, next)
            touched.push(next)
          }
          persistQuietly('upsertAvailabilityRows', upsertAvailabilityRows(touched))
          return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
        })
      },
      nudgeCapacityForDates: (dates, program, delta) => {
        if (dates.length === 0 || delta === 0) return
        setAvailability((current) => {
          const byDate = new Map(current.map((item) => [item.date, item]))
          const touched: Availability[] = []
          for (const date of dates) {
            const existing = byDate.get(date)
            const pp = existing?.ppCapacity ?? DEFAULT_PP_CAPACITY
            const jb = existing?.jamesBondCapacity ?? DEFAULT_JB_CAPACITY
            const next: Availability = {
              date,
              ppCapacity: program === 'PP' ? Math.max(0, pp + delta) : pp,
              jamesBondCapacity: program === 'James Bond' ? Math.max(0, jb + delta) : jb,
            }
            byDate.set(date, next)
            touched.push(next)
          }
          persistQuietly('upsertAvailabilityRows', upsertAvailabilityRows(touched))
          return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
        })
      },
      assignBookingToBoat: (date, program, bookingCode, boat, options) => {
        if (
          boat !== null &&
          getCheckInAttendance(checkInAttendance, date, program, bookingCode) === 'no-show'
        ) {
          return
        }
        if (boat !== null) {
          const booking = bookings.find((item) => item.code === bookingCode)
          if (!booking) return
          const plan = getDayBoatPlan(date, program)
          const countable = activeDayBookings(date, program).filter(
            (item) =>
              getCheckInAttendance(checkInAttendance, date, program, item.code) !== 'no-show',
          )
          if (!canFitBookingOnBoat(plan, countable, boat, booking).ok) return
        }
        upsertPlan(
          date,
          program,
          (plan) => {
            const assignments = { ...plan.assignments }
            if (boat === null) delete assignments[bookingCode]
            else assignments[bookingCode] = boat
            return { ...plan, assignments }
          },
          options,
        )
      },
      setBoatCapacity: (date, program, boat, capacity, options) => {
        upsertPlan(
          date,
          program,
          (plan) => {
            const capacities = normalizeBoatCapacities(plan.capacities)
            const names = normalizeBoatNames(plan.names, capacities.length)
            const guides = normalizeBoatGuides(plan.guides, capacities.length)
            const index = boat - 1
            if (index < 0 || index >= capacities.length) return plan
            capacities[index] = Math.max(1, Math.floor(capacity) || 1)
            return { ...plan, capacities, names, guides }
          },
          options,
        )
      },
      setBoatName: (date, program, boat, name, options) => {
        upsertPlan(
          date,
          program,
          (plan) => {
            const capacities = normalizeBoatCapacities(plan.capacities)
            const names = normalizeBoatNames(plan.names, capacities.length)
            const guides = normalizeBoatGuides(plan.guides, capacities.length)
            const index = boat - 1
            if (index < 0 || index >= names.length) return plan
            names[index] = name.trim().slice(0, 40)
            return { ...plan, capacities, names, guides }
          },
          options,
        )
      },
      setBoatGuide: (date, program, boat, guide, options) => {
        upsertPlan(
          date,
          program,
          (plan) => {
            const capacities = normalizeBoatCapacities(plan.capacities)
            const names = normalizeBoatNames(plan.names, capacities.length)
            const guides = normalizeBoatGuides(plan.guides, capacities.length)
            const index = boat - 1
            if (index < 0 || index >= guides.length) return plan
            const prev = guides[index] ?? emptyBoatGuide()
            guides[index] = {
              guideName:
                guide.guideName !== undefined
                  ? guide.guideName.trim().slice(0, 60)
                  : prev.guideName,
              guidePhone:
                guide.guidePhone !== undefined
                  ? guide.guidePhone.trim().slice(0, 30)
                  : prev.guidePhone,
              assistantName:
                guide.assistantName !== undefined
                  ? guide.assistantName.trim().slice(0, 60)
                  : prev.assistantName,
              assistantPhone:
                guide.assistantPhone !== undefined
                  ? guide.assistantPhone.trim().slice(0, 30)
                  : prev.assistantPhone,
            }
            return { ...plan, capacities, names, guides }
          },
          options,
        )
      },
      addDayBoat: (date, program, capacity, options) => {
        upsertPlan(
          date,
          program,
          (plan) => {
            const capacities = normalizeBoatCapacities(plan.capacities)
            const names = normalizeBoatNames(plan.names, capacities.length)
            const guides = normalizeBoatGuides(plan.guides, capacities.length)
            if (capacities.length >= MAX_DAY_BOATS) return plan
            const nextCap = Math.max(
              1,
              Math.floor(capacity ?? DEFAULT_BOAT_CAPACITY) || DEFAULT_BOAT_CAPACITY,
            )
            return {
              ...plan,
              capacities: [...capacities, nextCap],
              names: [...names, ''],
              guides: [...guides, emptyBoatGuide()],
            }
          },
          options,
        )
      },
      removeDayBoat: (date, program, boat, options) => {
        upsertPlan(
          date,
          program,
          (plan) => {
            const capacities = normalizeBoatCapacities(plan.capacities)
            const names = normalizeBoatNames(plan.names, capacities.length)
            const guides = normalizeBoatGuides(plan.guides, capacities.length)
            if (capacities.length <= 1) return plan
            const index = boat - 1
            if (index < 0 || index >= capacities.length) return plan
            const nextCaps = capacities.filter((_, i) => i !== index)
            const nextNames = names.filter((_, i) => i !== index)
            const nextGuides = guides.filter((_, i) => i !== index)
            const assignments: Record<string, BoatNumber> = {}
            for (const [code, assigned] of Object.entries(plan.assignments)) {
              if (assigned === boat) continue
              if (assigned > boat) assignments[code] = assigned - 1
              else assignments[code] = assigned
            }
            return {
              ...plan,
              capacities: nextCaps,
              names: nextNames,
              guides: nextGuides,
              assignments,
            }
          },
          options,
        )
      },
      resetDayBoatCapacities: (date, program) => {
        const fromDate = todayISO()
        setDayBoatPlans((current) => {
          const dates = new Set<string>()
          for (const plan of Object.values(current)) {
            if (plan.program === program && plan.date >= fromDate) dates.add(plan.date)
          }
          dates.add(fromDate)
          if (date >= fromDate) dates.add(date)

          const next = { ...current }
          for (const planDate of dates) {
            const key = dayBoatPlanKey(planDate, program)
            const existing = next[key] ?? emptyDayBoatPlan(planDate, program)
            const capacities = normalizeBoatCapacities(existing.capacities).map(
              () => DEFAULT_BOAT_CAPACITY,
            )
            const updated: DayBoatPlan = {
              ...existing,
              date: planDate,
              program,
              capacities,
              names: normalizeBoatNames(existing.names, capacities.length),
              guides: normalizeBoatGuides(existing.guides, capacities.length),
            }
            next[key] = updated
            boatPlanDirtyKeysRef.current.delete(key)
            persistBoatPlanWrite(updated)
          }
          return next
        })
      },
      resetDayBoatFleet: (date, program, options) => {
        upsertPlan(
          date,
          program,
          (plan) => {
            const capacities = defaultBoatCapacities()
            const assignments: Record<string, BoatNumber> = {}
            for (const [code, assigned] of Object.entries(plan.assignments)) {
              if (assigned >= 1 && assigned <= capacities.length) {
                assignments[code] = assigned
              }
            }
            return {
              ...plan,
              capacities,
              names: defaultBoatNames(capacities.length),
              guides: defaultBoatGuides(capacities.length),
              assignments,
            }
          },
          options,
        )
      },
      autoAssignDayBoats: (date, program, options) => {
        const dayBookings = activeDayBookings(date, program).filter(
          (booking) =>
            getCheckInAttendance(checkInAttendance, date, program, booking.code) !== 'no-show',
        )
        const vehiclePlan = getDayVehiclePlan(date, program)
        upsertPlan(
          date,
          program,
          (plan) => {
            const nextAssignments = autoAssignBoats(
              dayBookings,
              plan.capacities,
              vehiclePlan.assignments,
            )
            // Keep no-show bookings off boats even if they were previously assigned.
            for (const booking of activeDayBookings(date, program)) {
              if (
                getCheckInAttendance(checkInAttendance, date, program, booking.code) === 'no-show'
              ) {
                delete nextAssignments[booking.code]
              }
            }
            return {
              ...plan,
              capacities: normalizeBoatCapacities(plan.capacities),
              assignments: nextAssignments,
            }
          },
          options,
        )
      },
      clearDayBoatAssignments: (date, program, options) => {
        upsertPlan(date, program, (plan) => ({ ...plan, assignments: {} }), options)
      },
      commitDayBoatPlan: async (date, program) => {
        const key = dayBoatPlanKey(date, program)
        const plan = getDayBoatPlan(date, program)
        try {
          await enqueueBoatPlanSave(() => saveDayBoatPlan(plan))
          boatPlanDirtyKeysRef.current.delete(key)
          return { ok: true as const }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to save boat plan'
          // Arrangement may have saved even when guides need a DB migration.
          if (/arrangement saved.*guides need/i.test(message) || /add-boat-guides/i.test(message)) {
            boatPlanDirtyKeysRef.current.delete(key)
            return { ok: true as const, warning: message }
          }
          return { ok: false as const, error: message }
        }
      },
      assignVanToBoat: (date, program, van, boat, options) => {
        const vehiclePlan = getDayVehiclePlan(date, program)
        const codes = activeDayBookings(date, program)
          .filter((booking) => bookingPaxOnVan(booking, vehiclePlan.assignments[booking.code], van) > 0)
          .filter(
            (booking) =>
              getCheckInAttendance(checkInAttendance, date, program, booking.code) !== 'no-show',
          )
          .map((booking) => booking.code)
        if (codes.length === 0) return
        upsertPlan(
          date,
          program,
          (plan) => {
            const assignments = { ...plan.assignments }
            for (const code of codes) {
              if (boat === null) delete assignments[code]
              else assignments[code] = boat
            }
            return { ...plan, assignments }
          },
          options,
        )
      },
      assignBookingToVan: (date, program, bookingCode, van) => {
        const booking = bookings.find((item) => item.code === bookingCode && isActiveBooking(item))
        const pax = booking ? totalPassengers(booking) : 0
        const current = getDayVehiclePlan(date, program)
        const assignments = { ...current.assignments }
        if (van === null) delete assignments[bookingCode]
        else {
          assignments[bookingCode] = [
            { van, pax, sortOrder: nextSortOrderForVan(assignments, van) },
          ]
        }
        upsertVehiclePlan(date, program, (plan) => ({ ...plan, assignments }))
        if (van !== null) followVanOntoBoat(date, program, van, assignments)
      },
      assignBookingsToVan: (date, program, bookingCodes, van) => {
        if (bookingCodes.length === 0) return
        const paxByCode = new Map<string, number>()
        for (const code of bookingCodes) {
          const item = bookings.find((row) => row.code === code && isActiveBooking(row))
          if (item) paxByCode.set(code, totalPassengers(item))
        }
        const current = getDayVehiclePlan(date, program)
        const assignments = { ...current.assignments }
        for (const code of bookingCodes) {
          if (van === null) {
            delete assignments[code]
            continue
          }
          const pax = paxByCode.get(code)
          if (pax === undefined) continue
          assignments[code] = [{ van, pax, sortOrder: nextSortOrderForVan(assignments, van) }]
        }
        upsertVehiclePlan(date, program, (plan) => ({ ...plan, assignments }))
        if (van !== null) followVanOntoBoat(date, program, van, assignments)
      },
      setBookingVanSplits: (date, program, bookingCode, legs) => {
        const current = getDayVehiclePlan(date, program)
        const cleaned = legs
          .map((leg) => ({
            van: Math.max(1, Math.floor(Number(leg.van) || 0)),
            pax: Math.max(0, Math.floor(Number(leg.pax) || 0)),
            sortOrder:
              typeof leg.sortOrder === 'number' && Number.isFinite(leg.sortOrder)
                ? leg.sortOrder
                : nextSortOrderForVan(
                    current.assignments,
                    Math.max(1, Math.floor(Number(leg.van) || 0)),
                  ),
          }))
          .filter((leg) => leg.van > 0 && leg.pax > 0)
        const assignments = { ...current.assignments }
        if (cleaned.length === 0) delete assignments[bookingCode]
        else assignments[bookingCode] = cleaned
        upsertVehiclePlan(date, program, (plan) => ({ ...plan, assignments }))
        for (const van of [...new Set(cleaned.map((leg) => leg.van))]) {
          followVanOntoBoat(date, program, van, assignments)
        }
      },
      reorderVanBookings: (date, program, van, orderedCodes) => {
        if (orderedCodes.length === 0) return
        upsertVehiclePlan(date, program, (plan) => ({
          ...plan,
          assignments: reorderVanAssignments(plan.assignments, van, orderedCodes),
        }))
      },
      setVanMeta: (date, program, van, meta) => {
        const planKey = dayVehiclePlanKey(date, program)
        const plan = dayVehiclePlans[planKey] ?? emptyDayVehiclePlan(date, program)
        const prev = plan.vanMeta[String(van)] ?? emptyVanMeta()
        const nextCapacity =
          meta.capacity === null
            ? undefined
            : meta.capacity !== undefined
              ? clampVanCapacity(meta.capacity)
              : prev.capacity
        const outsourced =
          meta.outsourced !== undefined ? meta.outsourced : prev.outsourced === true
        const specialKind =
          meta.specialKind !== undefined
            ? isSpecialTransferKind(meta.specialKind)
              ? meta.specialKind
              : undefined
            : isSpecialTransferKind(prev.specialKind)
              ? prev.specialKind
              : undefined
        const next: VanMeta = {
          plate: meta.plate !== undefined ? meta.plate.trim() : prev.plate.trim(),
          driver: meta.driver !== undefined ? meta.driver.trim() : prev.driver.trim(),
          phone: meta.phone !== undefined ? meta.phone.trim() : prev.phone.trim(),
          outsourced,
          outsourceCompany: outsourced
            ? meta.outsourceCompany !== undefined
              ? meta.outsourceCompany.trim()
              : prev.outsourceCompany?.trim() || ''
            : '',
          ...(nextCapacity !== undefined ? { capacity: nextCapacity } : {}),
          ...(specialKind ? { specialKind } : {}),
          transferIn:
            meta.transferIn !== undefined ? meta.transferIn === true : prev.transferIn === true,
          transferOut:
            meta.transferOut !== undefined ? meta.transferOut === true : prev.transferOut === true,
          chargeAmount:
            meta.chargeAmount !== undefined
              ? normalizeChargeAmount(meta.chargeAmount)
              : normalizeChargeAmount(prev.chargeAmount),
        }

        upsertVehiclePlan(date, program, (current) => ({
          ...current,
          vanMeta: {
            ...current.vanMeta,
            [String(van)]: next,
          },
        }))
      },
      autoAssignDayVans: (date, program) => {
        const dayBookings = activeDayBookings(date, program)
        upsertVehiclePlan(date, program, (plan) => ({
          ...plan,
          assignments: autoAssignVans(dayBookings, plan.vanCapacity),
        }))
      },
      clearDayVanAssignments: (date, program) => {
        upsertVehiclePlan(date, program, (plan) => ({
          ...plan,
          assignments: {},
          vanMeta: Object.fromEntries(
            Object.entries(plan.vanMeta ?? {}).filter(([, meta]) => isSpecialTransfer(meta)),
          ),
        }))
      },
    }
  }, [agents, bookings, zones, hotels, availability, dayBoatPlans, dayVehiclePlans, checkInAttendance, checkInEnrollment, checkInPayment, checkInTicket, checkInServices, checkInSequence, checkInGuestEdit, checkInNotes, fleetVans, drivers, bookingCutoffs, bookingClosures, bookingEventsByCode, hydrated, loadError])

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortal() {
  const context = useContext(PortalContext)
  if (!context) {
    throw new Error('usePortal must be used within PortalProvider')
  }
  return context
}
