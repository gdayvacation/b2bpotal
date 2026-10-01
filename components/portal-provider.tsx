'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { formatThb, nextBookingCode, todayISO, uniqueAgentSlug } from '@/lib/format'
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
  CHECK_IN_GROUP_GUIDE_STORAGE_KEY,
  getCheckInGroupGuide,
  loadCheckInGroupGuideMap,
  parseGroupGuideNames,
  saveCheckInGroupGuideMap,
  withCheckInGroupGuide,
  type DayCheckInGroupGuideMap,
} from '@/lib/check-in-group-guide'
import {
  CHECK_IN_ENROLLMENT_STORAGE_KEY,
  enrolledSeatCount,
  getCheckInEnrollments,
  guideEnrollmentCount,
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
  dropBookedPaxSnapshot,
  moveBookedPaxSnapshot,
  originalBookedPax,
  type BookedPaxMap,
  type BookedPaxSnapshot,
} from '@/lib/check-in-booked-pax'
import {
  CHECK_IN_ARRIVED_PAX_STORAGE_KEY,
  hydrateArrivedPaxMap,
  loadArrivedPaxMap,
  moveArrivedPaxSnapshot,
} from '@/lib/check-in-arrived-pax'
import {
  fetchCheckInArrivedPax,
  pushCheckInArrivedPax,
} from '@/lib/supabase/arrived-pax-db'
import { moveDayBookingEntry } from '@/lib/day-booking-map'
import {
  JOB_ORDER_ACTION_STORAGE_KEY,
  getJobOrderAction,
  loadJobOrderActionMap,
  moveJobOrderAction,
  persistJobOrderAction,
  saveJobOrderActionMap,
  withJobOrderAction,
  type DayJobOrderActionMap,
  type JobOrderAction,
} from '@/lib/job-order-action'
import {
  OWN_ARRIVAL_STORAGE_KEY,
  PICKUP_NS_STORAGE_KEY,
  clampPax,
  dropPickupMarinaLedgers,
  getPaxFromMap,
  subtractPax,
  loadOwnArrivalMap,
  loadPickupNoShowMap,
  moveOwnArrival,
  movePickupNoShow,
  paxEqual,
  paxTotal,
  recordOwnArrival as recordOwnArrivalLocal,
  recordPickupNoShow as recordPickupNoShowLocal,
  replaceOwnArrival as replaceOwnArrivalLocal,
  replacePickupNoShow as replacePickupNoShowLocal,
  repairPickupMarinaLedgers as repairPickupMarinaLedgersLocal,
  saveOwnArrivalMap,
  savePickupNoShowMap,
} from '@/lib/pickup-marina-sync'
import {
  fetchCheckInBookedPax,
  pushCheckInBookedPax,
} from '@/lib/supabase/booked-pax-db'
import {
  dayOpsMapsHaveData,
  fetchDayOpsMaps,
  pushDayOpsMaps,
} from '@/lib/supabase/day-ops-db'
import { matchNationality } from '@/lib/nationalities'
import {
  adoptAllVansOntoSharedBoats,
  adoptVanBookingsOntoSharedBoat,
  canFitBookingOnBoat,
} from '@/lib/boat-load'
import { autoAssignVans, bookingPaxOnVan, listFleetVanNumbers, nextSortOrderForVan, normalizeAssignments, reorderVanAssignments } from '@/lib/vehicle-assign'
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
  deleteCheckInGroupGuideRow,
  deleteCheckInNoteRow,
  deleteCheckInPaymentRow,
  deleteCheckInTicketRow,
  deleteHotel,
  deleteZone,
  fetchBookingEvents,
  fetchBookingByCode,
  fetchBookings,
  fetchBookingsInDateRange,
  fetchCheckInMaps,
  fetchAvailabilitySettings,
  fetchDayBoatPlans,
  fetchDayVehiclePlans,
  operationalBookingsFromDate,
  insertBooking,
  moveCheckInBookingDate,
  insertBookingEvent,
  loadPortalSnapshot,
  persistQuietly,
  pushCheckInMaps,
  recordCheckInEnrollmentsAtomic,
  replaceCheckInEnrollmentsForBooking,
  replaceCheckInServicesForBooking,
  saveDayBoatPlan,
  saveDayVehiclePlan,
  subscribeBookings,
  subscribeCheckInChanges,
  subscribeDayPlanChanges,
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
  upsertCheckInGroupGuideRow,
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
import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'
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
import { packOwnBoatLabel } from '@/lib/boat-theme'
import {
  DEFAULT_BOAT_CAPACITY,
  DEFAULT_BOAT_LABEL_START,
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
  defaultBoatKinds,
  defaultBoatLabels,
  emptyDayBoatPlan,
  emptyDayVehiclePlan,
  hydrateDayBoatPlan,
  emptyPrivateTransferFields,
  emptyVanMeta,
  hiddenVanMeta,
  dummyVanMeta,
  DUMMY_VAN_LABEL,
  DUMMY_VAN_NUMBER,
  NO_TRANSFER_VAN_NUMBER,
  NO_TRANSFER_VAN_LABEL,
  bookingOnPartnerBoat,
  bookingPaxOnBoat,
  bookingTransferKind,
  canonicalVanOutsourceCompany,
  compactBoatAssignment,
  rescaleBoatAssignmentToPax,
  rescaleVanAssignmentToPax,
  isDummyVan,
  isNoTransferVan,
  isVirtualVan,
  moveBoatPax,
  noTransferVanMeta,
  normalizeBoatAssignment,
  primaryBoatNumber,
  vanTransferKind,
  isActiveBooking,
  isCorePickupZone,
  isNoTransfer,
  isPrivateTransfer,
  isPrivateTransferZone,
  isPartnerBoat,
  isSpecialTransfer,
  isSpecialTransferKind,
  packVanPlate,
  unpackVanPlate,
  boatNumbersForPlan,
  normalizeBoatCapacities,
  PARTNER_BOAT_CAPACITY,
  normalizeChargeAmount,
  privateTransferPriceFor,
  totalPassengers,
} from '@/lib/types'

function mergeBookingsByCode(base: Booking[], incoming: Booking[]): Booking[] {
  const map = new Map<string, Booking>()
  for (const booking of base) map.set(booking.code, booking)
  for (const booking of incoming) map.set(booking.code, booking)
  return [...map.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.code.localeCompare(b.code),
  )
}

function bookingRangeCovered(
  loaded: { from: string; to: string }[],
  from: string,
  to: string,
) {
  return loaded.some((range) => range.from <= from && range.to >= to)
}

type PortalContextValue = {
  hydrated: boolean
  loadError: string | null
  agents: Agent[]
  bookings: Booking[]
  /**
   * Lazily load bookings for a date range outside the default 30-day ops window.
   * Safe to call repeatedly — skips ranges already loaded.
   */
  ensureBookingsForRange: (fromDate: string, toDate?: string) => Promise<void>
  /**
   * Load a single booking by code (any date) and merge it into `bookings`.
   * Guest QR pages use this so they never depend on the bulk snapshot timing.
   */
  ensureBookingByCode: (code: string) => Promise<Booking | null>
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
  getCheckInGroupGuide: (date: string, program: Program, bookingCode: string) => string
  setCheckInGroupGuide: (
    date: string,
    program: Program,
    bookingCode: string,
    guideName: string,
  ) => void
  getPickupNoShow: (date: string, program: Program, bookingCode: string) => BookedPaxSnapshot
  recordPickupNoShow: (
    date: string,
    program: Program,
    bookingCode: string,
    ns: BookedPaxSnapshot,
  ) => BookedPaxSnapshot
  replacePickupNoShow: (
    date: string,
    program: Program,
    bookingCode: string,
    ns: BookedPaxSnapshot,
  ) => BookedPaxSnapshot
  getOwnArrival: (date: string, program: Program, bookingCode: string) => BookedPaxSnapshot
  recordOwnArrival: (
    date: string,
    program: Program,
    bookingCode: string,
    arrived: BookedPaxSnapshot,
  ) => BookedPaxSnapshot
  replaceOwnArrival: (
    date: string,
    program: Program,
    bookingCode: string,
    arrived: BookedPaxSnapshot,
  ) => BookedPaxSnapshot
  repairPickupMarinaLedgers: (
    date: string,
    program: Program,
    bookingCode: string,
    original: BookedPaxSnapshot,
    current: BookedPaxSnapshot,
  ) => { ns: BookedPaxSnapshot; taxi: BookedPaxSnapshot; derivedNs: BookedPaxSnapshot }
  getJobOrderAction: (
    date: string,
    program: Program,
    bookingCode: string,
  ) => JobOrderAction | null
  setJobOrderAction: (
    date: string,
    program: Program,
    bookingCode: string,
    status: JobOrderAction | null,
  ) => void
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
  }) => Promise<{ ok: true; enrollment: CheckInEnrollment } | { ok: false; error: string }>
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
  }) => Promise<{ ok: true; count: number } | { ok: false; error: string }>
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
  /** Free number text for a partner / dummy boat. */
  setBoatLabel: (
    date: string,
    program: Program,
    boat: BoatNumber,
    label: string,
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
  /** Append a boat for this day (default capacity 50, or a custom rental size/no/name/color). */
  addDayBoat: (
    date: string,
    program: Program,
    capacity?: number,
    options?: {
      persist?: boolean
      name?: string
      /** Required own-boat number shown on van assign chips. */
      boatNo?: string
      /** Own-boat color key packed with boatNo in labels (orange, green, …). */
      color?: string
    },
  ) => void
  /** Open an uncolored dummy boat for overflow sent to another company. */
  addPartnerBoat: (date: string, program: Program, options?: { persist?: boolean }) => void
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
  assignVanToPartnerBoat: (date: string, program: Program, van: number) => void
  addPartnerVan: (date: string, program: Program, company: string, bookingCodes?: string[]) => number | null
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
  setBookingBoatSplits: (
    date: string,
    program: Program,
    bookingCode: string,
    legs: Array<{ boat: BoatNumber; pax: number }>,
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
    meta: Omit<Partial<VanMeta>, 'capacity' | 'specialKind'> & {
      capacity?: number | null
      specialKind?: VanMeta['specialKind'] | null
    },
  ) => void
  getFleetVan: (van: number) => FleetVan | null
  resolveVanMeta: (van: number, dayMeta?: VanMeta | null) => VanMeta & { fromFleet: boolean; incomplete: boolean }
  autoAssignDayVans: (date: string, program: Program) => void
  clearDayVanAssignments: (date: string, program: Program) => void
  removeDayVan: (date: string, program: Program, van: number) => void
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
    Object.keys(maps.notes).length > 0 ||
    Object.keys(maps.groupGuides).length > 0
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
  saveCheckInGroupGuideMap(maps.groupGuides)
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
  const [checkInGroupGuides, setCheckInGroupGuideMap] = useState<DayCheckInGroupGuideMap>({})
  const [pickupNoShowMap, setPickupNoShowMap] = useState<BookedPaxMap>({})
  const [ownArrivalMap, setOwnArrivalMap] = useState<BookedPaxMap>({})
  const [jobOrderActionMap, setJobOrderActionMap] = useState<DayJobOrderActionMap>({})
  const [fleetVans, setFleetVans] = useState<FleetVan[]>([])
  const [drivers, setDrivers] = useState<DriverRosterEntry[]>(() => mergeDriverRoster(loadLocalDrivers()))
  const [bookingCutoffs, setBookingCutoffs] = useState<BookingCutoffSettings>(DEFAULT_BOOKING_CUTOFFS)
  const [bookingClosures, setBookingClosures] = useState<BookingClosure[]>([])
  const [bookingEventsByCode, setBookingEventsByCode] = useState<Record<string, BookingEvent[]>>({})
  const checkInCloudEnabledRef = useRef(false)
  const checkInWritePendingRef = useRef(0)
  /** Bumped on every local check-in write so in-flight polls cannot overwrite fresher state. */
  const checkInSyncEpochRef = useRef(0)
  const checkInSyncInFlightRef = useRef(false)
  const bookingWritePendingRef = useRef(0)
  /** Date ranges already loaded into `bookings` (ops window + lazy fetches). */
  const bookingsLoadedRangesRef = useRef<{ from: string; to: string }[]>([])
  const bookingsEnsureInflightRef = useRef(new Map<string, Promise<void>>())
  const boatPlanWritePendingRef = useRef(0)
  const boatPlanSaveChainRef = useRef(Promise.resolve())
  const vehiclePlanWritePendingRef = useRef(0)
  const vehiclePlanSaveChainRef = useRef(Promise.resolve())
  const vehiclePlanLatestRef = useRef<Record<string, DayVehiclePlan>>({})
  const vehiclePlanSaveGenerationRef = useRef(0)
  /** Newest revision this device saved per board key — queued saves must not resend a stale one. */
  const boatPlanRevisionRef = useRef<Record<string, number>>({})
  const boatPlanSaveGenerationRef = useRef(0)
  /** Boat assignments queued this tick, before React commits them. */
  const boatAssignmentsPendingRef = useRef<Record<string, DayBoatPlan['assignments']>>({})
  useEffect(() => {
    boatAssignmentsPendingRef.current = {}
  }, [dayBoatPlans])
  const vehiclePlanRevisionRef = useRef<Record<string, number>>({})
  const settingsWritePendingRef = useRef(0)
  const dayOpsCloudEnabledRef = useRef(false)
  const dayOpsWritePendingRef = useRef(0)
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

  function enqueueBoatPlanSave<T>(task: () => Promise<T>): Promise<T> {
    boatPlanSaveGenerationRef.current += 1
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
    const key = dayBoatPlanKey(plan.date, plan.program)
    void enqueueBoatPlanSave(async () => {
      const revision = Math.max(plan.revision ?? 0, boatPlanRevisionRef.current[key] ?? 0)
      const saved = await saveDayBoatPlan({ ...plan, revision })
      boatPlanRevisionRef.current[key] = saved.revision
      setDayBoatPlans((current) => {
        const existing = current[key]
        if (!existing) return current
        if ((existing.revision ?? 0) === saved.revision) return current
        return { ...current, [key]: { ...existing, revision: saved.revision } }
      })
    }).catch(async (error) => {
      console.error('[supabase] saveDayBoatPlan', error)
      const message = error instanceof Error ? error.message : 'Failed to save boat plan'
      const conflict = /another device|conflict/i.test(message)
      if (conflict) {
        delete boatPlanRevisionRef.current[key]
        try {
          const next = await fetchDayBoatPlans()
          setDayBoatPlans(next)
        } catch (refreshError) {
          console.error('[portal] boat plan conflict refresh failed', refreshError)
        }
        if (typeof window !== 'undefined') {
          window.alert(message)
        }
        return
      }
      if (/boat.?guides|add-boat-guides/i.test(message)) {
        setLoadError(message)
      }
    })
  }

  function persistVehiclePlanWrite(plan: DayVehiclePlan) {
    const key = dayVehiclePlanKey(plan.date, plan.program)
    vehiclePlanLatestRef.current[key] = plan
    vehiclePlanSaveGenerationRef.current += 1
    vehiclePlanWritePendingRef.current += 1
    const saveLatest = async () => {
      const latest = vehiclePlanLatestRef.current[key] ?? plan
      const revision = Math.max(latest.revision ?? 0, vehiclePlanRevisionRef.current[key] ?? 0)
      const saved = await saveDayVehiclePlan({ ...latest, revision })
      vehiclePlanRevisionRef.current[key] = saved.revision
      return saved
    }
    const run = vehiclePlanSaveChainRef.current.then(saveLatest, saveLatest)
    vehiclePlanSaveChainRef.current = run.then(
      (saved) => {
        setDayVehiclePlans((current) => {
          const existing = current[key]
          if (!existing) return current
          if ((existing.revision ?? 0) === saved.revision) return current
          return { ...current, [key]: { ...existing, revision: saved.revision } }
        })
      },
      async (error) => {
        console.error('[supabase] saveDayVehiclePlan', error)
        const message = error instanceof Error ? error.message : 'Failed to save van plan'
        if (/another device|conflict/i.test(message)) {
          delete vehiclePlanRevisionRef.current[key]
          try {
            const next = await fetchDayVehiclePlans()
            setDayVehiclePlans(next)
          } catch (refreshError) {
            console.error('[portal] van plan conflict refresh failed', refreshError)
          }
          if (typeof window !== 'undefined') window.alert(message)
        }
      },
    )
    void run.finally(() => {
      vehiclePlanWritePendingRef.current = Math.max(0, vehiclePlanWritePendingRef.current - 1)
    })
  }

  function persistSettingsWrite(label: string, task: Promise<unknown>) {
    settingsWritePendingRef.current += 1
    persistQuietly(
      label,
      task.finally(() => {
        settingsWritePendingRef.current = Math.max(0, settingsWritePendingRef.current - 1)
      }),
    )
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
    setCheckInGroupGuideMap(
      Object.keys(maps.groupGuides).length > 0
        ? maps.groupGuides
        : loadCheckInGroupGuideMap(),
    )
    applyCheckInMapsToStorage({
      ...maps,
      notes: Object.keys(maps.notes).length > 0 ? maps.notes : loadCheckInNoteMap(),
      groupGuides:
        Object.keys(maps.groupGuides).length > 0
          ? maps.groupGuides
          : loadCheckInGroupGuideMap(),
    })
  }

  /** Keep older history; replace day-keys on/after sinceDate from the cloud patch. */
  function mergeRecentDayMaps<T>(
    base: Record<string, T>,
    patch: Record<string, T>,
    sinceDate: string,
  ): Record<string, T> {
    const next: Record<string, T> = {}
    for (const [key, value] of Object.entries(base)) {
      const day = key.slice(0, 10)
      if (day < sinceDate) next[key] = value
    }
    for (const [key, value] of Object.entries(patch)) {
      next[key] = value
    }
    return next
  }

  function applyCheckInMapsPartial(patch: CheckInMapsSnapshot, sinceDate: string) {
    const next: CheckInMapsSnapshot = {
      enrollments: mergeRecentDayMaps(loadCheckInEnrollmentMap(), patch.enrollments, sinceDate),
      attendance: mergeRecentDayMaps(loadCheckInAttendanceMap(), patch.attendance, sinceDate),
      payments: mergeRecentDayMaps(loadCheckInPaymentMap(), patch.payments, sinceDate),
      tickets: mergeRecentDayMaps(loadCheckInTicketMap(), patch.tickets, sinceDate),
      services: mergeRecentDayMaps(loadCheckInServiceMap(), patch.services, sinceDate),
      sequences: mergeRecentDayMaps(loadCheckInSequenceMap(), patch.sequences, sinceDate),
      guestEdits: mergeRecentDayMaps(loadCheckInGuestEditMap(), patch.guestEdits, sinceDate),
      notes: mergeRecentDayMaps(loadCheckInNoteMap(), patch.notes, sinceDate),
      groupGuides: mergeRecentDayMaps(loadCheckInGroupGuideMap(), patch.groupGuides, sinceDate),
    }
    applyCheckInMaps(next)
  }

  /** Replace only one calendar day from cloud; keep every other day untouched. */
  function applyCheckInMapsForDay(patch: CheckInMapsSnapshot, onDate: string) {
    const day = onDate.slice(0, 10)
    function mergeDay<T>(base: Record<string, T>, part: Record<string, T>): Record<string, T> {
      const next: Record<string, T> = {}
      for (const [key, value] of Object.entries(base)) {
        if (key.slice(0, 10) !== day) next[key] = value
      }
      for (const [key, value] of Object.entries(part)) {
        if (key.slice(0, 10) === day) next[key] = value
      }
      return next
    }
    applyCheckInMaps({
      enrollments: mergeDay(loadCheckInEnrollmentMap(), patch.enrollments),
      attendance: mergeDay(loadCheckInAttendanceMap(), patch.attendance),
      payments: mergeDay(loadCheckInPaymentMap(), patch.payments),
      tickets: mergeDay(loadCheckInTicketMap(), patch.tickets),
      services: mergeDay(loadCheckInServiceMap(), patch.services),
      sequences: mergeDay(loadCheckInSequenceMap(), patch.sequences),
      guestEdits: mergeDay(loadCheckInGuestEditMap(), patch.guestEdits),
      notes: mergeDay(loadCheckInNoteMap(), patch.notes),
      groupGuides: mergeDay(loadCheckInGroupGuideMap(), patch.groupGuides),
    })
  }

  /**
   * Guest-safe merge: overlay only booking keys returned by RLS.
   * Never wipe other bookings / days (same browser may also be used by staff).
   */
  function applyCheckInMapsOverlay(patch: CheckInMapsSnapshot) {
    function overlayDayBookings<T>(
      base: Record<string, Record<string, T>>,
      part: Record<string, Record<string, T>>,
    ): Record<string, Record<string, T>> {
      const next: Record<string, Record<string, T>> = { ...base }
      for (const [dayKey, byCode] of Object.entries(part)) {
        next[dayKey] = { ...(next[dayKey] ?? {}), ...byCode }
      }
      return next
    }
    const next: CheckInMapsSnapshot = {
      enrollments: overlayDayBookings(loadCheckInEnrollmentMap(), patch.enrollments),
      attendance: overlayDayBookings(loadCheckInAttendanceMap(), patch.attendance),
      payments: overlayDayBookings(loadCheckInPaymentMap(), patch.payments),
      tickets: overlayDayBookings(loadCheckInTicketMap(), patch.tickets),
      services: overlayDayBookings(loadCheckInServiceMap(), patch.services),
      sequences: { ...loadCheckInSequenceMap(), ...patch.sequences },
      guestEdits: overlayDayBookings(loadCheckInGuestEditMap(), patch.guestEdits),
      notes: overlayDayBookings(loadCheckInNoteMap(), patch.notes),
      groupGuides: overlayDayBookings(loadCheckInGroupGuideMap(), patch.groupGuides),
    }
    applyCheckInMaps(next)
  }

  function persistCheckInWrite(label: string, task: Promise<unknown>) {
    if (!checkInCloudEnabledRef.current) return
    checkInSyncEpochRef.current += 1
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
    setCheckInGroupGuideMap(loadCheckInGroupGuideMap())
    setPickupNoShowMap(loadPickupNoShowMap())
    setOwnArrivalMap(loadOwnArrivalMap())
    setJobOrderActionMap(loadJobOrderActionMap())
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const snapshot = await loadPortalSnapshot()
        if (cancelled) return
        setAgents(snapshot.agents)
        bookingsLoadedRangesRef.current = [
          { from: operationalBookingsFromDate(), to: '9999-12-31' },
        ]
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
    let poll: number | undefined
    let unsubscribeRealtime: (() => void) | undefined

    async function refreshBookings() {
      if (cancelled || busy || bookingWritePendingRef.current > 0) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      busy = true
      try {
        const next = await fetchBookings()
        if (cancelled || bookingWritePendingRef.current > 0) return
        const opsFrom = operationalBookingsFromDate()
        // Keep lazily loaded history; only refresh the ops window.
        setBookings((current) => {
          const older = current.filter((booking) => booking.date < opsFrom)
          return mergeBookingsByCode(older, next)
        })
        if (!bookingRangeCovered(bookingsLoadedRangesRef.current, opsFrom, '9999-12-31')) {
          bookingsLoadedRangesRef.current.push({ from: opsFrom, to: '9999-12-31' })
        }
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

    void (async () => {
      let role = ''
      if (hasSupabaseConfig()) {
        try {
          const { data } = await getSupabaseBrowserClient().auth.getSession()
          role = String(data.session?.user.app_metadata?.role ?? '')
        } catch {
          role = ''
        }
      }
      if (cancelled) return

      // Guests only see one booking via RLS — no need for aggressive live polling.
      if (role === 'guest') {
        void refreshBookings()
        return
      }

      poll = window.setInterval(() => {
        void refreshBookings()
      }, 4000)

      try {
        unsubscribeRealtime = subscribeBookings(() => {
          void refreshBookings()
        })
      } catch (error) {
        console.error('[portal] bookings realtime subscribe failed', error)
      }

      void refreshBookings()
    })()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (poll != null) window.clearInterval(poll)
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
      const generation = boatPlanSaveGenerationRef.current
      try {
        const next = await fetchDayBoatPlans()
        if (cancelled || boatPlanWritePendingRef.current > 0) return
        if (boatPlanSaveGenerationRef.current !== generation) return
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

    let boatPoll: number | undefined
    let unsubscribeRealtime: (() => void) | undefined
    void (async () => {
      let role = ''
      if (hasSupabaseConfig()) {
        try {
          const { data } = await getSupabaseBrowserClient().auth.getSession()
          role = String(data.session?.user.app_metadata?.role ?? '')
        } catch {
          role = ''
        }
      }
      if (cancelled) return
      void refreshDayBoatPlans()
      if (role === 'guest') return
      try {
        unsubscribeRealtime = subscribeDayPlanChanges(() => {
          void refreshDayBoatPlans()
        })
      } catch (error) {
        console.error('[portal] day boat plans realtime subscribe failed', error)
      }
      boatPoll = window.setInterval(() => {
        void refreshDayBoatPlans()
      }, 4000)
    })()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (boatPoll != null) window.clearInterval(boatPoll)
      unsubscribeRealtime?.()
    }
  }, [hydrated])

  /** Keep van assignments live across admins / marina tablets. */
  useEffect(() => {
    if (!hydrated) return

    let busy = false
    let cancelled = false

    async function refreshDayVehiclePlans() {
      if (cancelled || busy || vehiclePlanWritePendingRef.current > 0) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      busy = true
      const generation = vehiclePlanSaveGenerationRef.current
      try {
        const next = await fetchDayVehiclePlans()
        if (cancelled || vehiclePlanWritePendingRef.current > 0) return
        if (vehiclePlanSaveGenerationRef.current !== generation) return
        setDayVehiclePlans(next)
      } catch (error) {
        console.error('[portal] day vehicle plans refresh failed', error)
      } finally {
        busy = false
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') void refreshDayVehiclePlans()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    let vehiclePoll: number | undefined
    let unsubscribeRealtime: (() => void) | undefined
    void (async () => {
      let role = ''
      if (hasSupabaseConfig()) {
        try {
          const { data } = await getSupabaseBrowserClient().auth.getSession()
          role = String(data.session?.user.app_metadata?.role ?? '')
        } catch {
          role = ''
        }
      }
      if (cancelled) return
      void refreshDayVehiclePlans()
      if (role === 'guest') return
      try {
        unsubscribeRealtime = subscribeDayPlanChanges(() => {
          void refreshDayVehiclePlans()
        })
      } catch (error) {
        console.error('[portal] day vehicle plans realtime subscribe failed', error)
      }
      vehiclePoll = window.setInterval(() => {
        void refreshDayVehiclePlans()
      }, 4000)
    })()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (vehiclePoll != null) window.clearInterval(vehiclePoll)
      unsubscribeRealtime?.()
    }
  }, [hydrated])

  /** Keep seats, close dates, and cutoffs live across agent / admin tabs. */
  useEffect(() => {
    if (!hydrated) return

    let busy = false
    let cancelled = false

    async function refreshAvailabilitySettings() {
      if (cancelled || busy || settingsWritePendingRef.current > 0) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      busy = true
      try {
        const next = await fetchAvailabilitySettings()
        if (cancelled || settingsWritePendingRef.current > 0) return
        setAvailability(next.availability)
        setBookingCutoffs(next.bookingCutoffs)
        setBookingClosures(next.bookingClosures)
      } catch (error) {
        console.error('[portal] availability settings refresh failed', error)
      } finally {
        busy = false
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') void refreshAvailabilitySettings()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    let settingsPoll: number | undefined
    void (async () => {
      let role = ''
      if (hasSupabaseConfig()) {
        try {
          const { data } = await getSupabaseBrowserClient().auth.getSession()
          role = String(data.session?.user.app_metadata?.role ?? '')
        } catch {
          role = ''
        }
      }
      if (cancelled) return
      void refreshAvailabilitySettings()
      if (role === 'guest') return
      settingsPoll = window.setInterval(() => {
        void refreshAvailabilitySettings()
      }, 4000)
    })()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (settingsPoll != null) window.clearInterval(settingsPoll)
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
      setCheckInGroupGuideMap(loadCheckInGroupGuideMap())
      setPickupNoShowMap(loadPickupNoShowMap())
      setOwnArrivalMap(loadOwnArrivalMap())
      setJobOrderActionMap(loadJobOrderActionMap())
    }

    type SyncProfile = {
      role: string
      helperDate: string | null
    }

    async function readSyncProfile(): Promise<SyncProfile> {
      if (!hasSupabaseConfig()) return { role: '', helperDate: null }
      try {
        const { data } = await getSupabaseBrowserClient().auth.getSession()
        const meta = data.session?.user.app_metadata ?? {}
        return {
          role: String(meta.role ?? ''),
          helperDate: String(meta.helper_date ?? '').trim().slice(0, 10) || null,
        }
      } catch {
        return { role: '', helperDate: null }
      }
    }

    async function syncCheckInFromCloud(
      allowMigrate: boolean,
      options?: { partial?: boolean; profile?: SyncProfile },
    ) {
      if (cancelled || checkInWritePendingRef.current > 0 || checkInSyncInFlightRef.current) return
      checkInSyncInFlightRef.current = true
      const syncEpoch = checkInSyncEpochRef.current
      const partial = options?.partial === true
      const profile = options?.profile ?? (await readSyncProfile())
      const isGuest = profile.role === 'guest'
      const isHelper = profile.role === 'helper'
      // Guests must never migrate localStorage → cloud (RLS makes remote look empty).
      const canMigrate = allowMigrate && !isGuest
      try {
        const boardDate =
          isHelper && profile.helperDate
            ? profile.helperDate
            : partial
              ? todayISO()
              : undefined
        const remote = await fetchCheckInMaps(
          boardDate
            ? { onDate: boardDate }
            : partial
              ? { sinceDate: todayISO() }
              : undefined,
        )
        if (cancelled) return
        if (remote === null) {
          checkInCloudEnabledRef.current = false
          return
        }
        checkInCloudEnabledRef.current = true

        let next = remote
        if (canMigrate && !migrateAttempted) {
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
            groupGuides: loadCheckInGroupGuideMap(),
          }
          // First cloud sync: upload this browser's local-only check-ins when remote is empty.
          if (!checkInMapsHaveData(remote) && checkInMapsHaveData(local)) {
            checkInSyncEpochRef.current += 1
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

        if (
          cancelled ||
          checkInWritePendingRef.current > 0 ||
          syncEpoch !== checkInSyncEpochRef.current
        ) {
          return
        }
        if (isGuest) applyCheckInMapsOverlay(next)
        else if (boardDate) applyCheckInMapsForDay(next, boardDate)
        else if (partial) applyCheckInMapsPartial(next, todayISO())
        else applyCheckInMaps(next)

        // Guests only need enrollment/attendance for their booking — skip heavy side maps.
        if (isGuest) return

        const remotePax = await fetchCheckInBookedPax()
        if (
          cancelled ||
          checkInWritePendingRef.current > 0 ||
          syncEpoch !== checkInSyncEpochRef.current
        ) {
          return
        }
        if (remotePax) {
          const localPax = loadBookedPaxMap()
          if (canMigrate && Object.keys(remotePax).length === 0 && Object.keys(localPax).length > 0) {
            checkInSyncEpochRef.current += 1
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

        const remoteArrived = await fetchCheckInArrivedPax()
        if (
          cancelled ||
          checkInWritePendingRef.current > 0 ||
          syncEpoch !== checkInSyncEpochRef.current
        ) {
          return
        }
        if (remoteArrived) {
          const localArrived = loadArrivedPaxMap()
          if (
            canMigrate &&
            Object.keys(remoteArrived).length === 0 &&
            Object.keys(localArrived).length > 0
          ) {
            checkInSyncEpochRef.current += 1
            checkInWritePendingRef.current += 1
            try {
              await pushCheckInArrivedPax(localArrived)
            } catch (error) {
              console.error('[supabase] migrate check-in arrived pax', error)
            } finally {
              checkInWritePendingRef.current = Math.max(0, checkInWritePendingRef.current - 1)
            }
          } else {
            hydrateArrivedPaxMap(remoteArrived)
          }
        }

        if (cancelled || dayOpsWritePendingRef.current > 0) return
        const remoteOps = await fetchDayOpsMaps()
        if (cancelled || dayOpsWritePendingRef.current > 0) return
        if (remoteOps === null) {
          dayOpsCloudEnabledRef.current = false
        } else {
          dayOpsCloudEnabledRef.current = true
          const localOps = {
            pickupNoShows: loadPickupNoShowMap(),
            ownArrivals: loadOwnArrivalMap(),
            jobOrderActions: loadJobOrderActionMap(),
          }
          if (canMigrate && !dayOpsMapsHaveData(remoteOps) && dayOpsMapsHaveData(localOps)) {
            dayOpsWritePendingRef.current += 1
            try {
              await pushDayOpsMaps(localOps)
            } catch (error) {
              console.error('[supabase] migrate day ops maps', error)
            } finally {
              dayOpsWritePendingRef.current = Math.max(0, dayOpsWritePendingRef.current - 1)
            }
            setPickupNoShowMap(localOps.pickupNoShows)
            setOwnArrivalMap(localOps.ownArrivals)
            setJobOrderActionMap(localOps.jobOrderActions)
          } else {
            savePickupNoShowMap(remoteOps.pickupNoShows)
            saveOwnArrivalMap(remoteOps.ownArrivals)
            saveJobOrderActionMap(remoteOps.jobOrderActions)
            setPickupNoShowMap(remoteOps.pickupNoShows)
            setOwnArrivalMap(remoteOps.ownArrivals)
            setJobOrderActionMap(remoteOps.jobOrderActions)
          }
        }
      } catch (error) {
        console.error('[portal] check-in sync failed', error)
      } finally {
        checkInSyncInFlightRef.current = false
        // A write or realtime event landed while this sync was in flight — refresh again.
        if (!cancelled && syncEpoch !== checkInSyncEpochRef.current) {
          void syncCheckInFromCloud(false, { partial: true, profile })
        }
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
        event.key === CHECK_IN_GROUP_GUIDE_STORAGE_KEY ||
        event.key === CHECK_IN_BOOKED_PAX_STORAGE_KEY ||
        event.key === CHECK_IN_ARRIVED_PAX_STORAGE_KEY ||
        event.key === PICKUP_NS_STORAGE_KEY ||
        event.key === OWN_ARRIVAL_STORAGE_KEY ||
        event.key === JOB_ORDER_ACTION_STORAGE_KEY
      ) {
        reloadCheckInMapsFromStorage()
      }
    }

    let debounceTimer: number | null = null
    let cachedProfile: SyncProfile | null = null

    function schedulePartialSync() {
      if (debounceTimer != null) window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null
        void syncCheckInFromCloud(false, {
          partial: true,
          profile: cachedProfile ?? undefined,
        })
      }, 1000)
    }

    function onVisible() {
      if (document.visibilityState === 'visible') {
        schedulePartialSync()
      }
    }

    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    let unsubCheckIn: (() => void) | undefined
    let poll: number | undefined

    void (async () => {
      const profile = await readSyncProfile()
      if (cancelled) return
      cachedProfile = profile
      const isGuest = profile.role === 'guest'

      // Guest: one load + refresh when tab focuses. No poll / realtime storm under 100–200 phones.
      if (isGuest) {
        void syncCheckInFromCloud(false, { profile })
        return
      }

      void syncCheckInFromCloud(true, { profile })
      try {
        unsubCheckIn = subscribeCheckInChanges(() => {
          checkInSyncEpochRef.current += 1
          schedulePartialSync()
        })
      } catch (error) {
        console.error('[portal] check-in realtime subscribe failed', error)
      }
      // Staff/helper: day-scoped poll as fallback; realtime (debounced) covers the rush.
      poll = window.setInterval(() => {
        schedulePartialSync()
      }, 15_000)
    })()

    return () => {
      cancelled = true
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (debounceTimer != null) window.clearTimeout(debounceTimer)
      if (poll != null) window.clearInterval(poll)
      unsubCheckIn?.()
    }
  }, [hydrated])

  const ensureBookingsForRange = useCallback(async (fromDate: string, toDate?: string) => {
    const from = fromDate.slice(0, 10)
    const to = (toDate ?? fromDate).slice(0, 10)
    if (!from || !to || from > to) return
    if (bookingRangeCovered(bookingsLoadedRangesRef.current, from, to)) return

    const key = `${from}:${to}`
    const inflight = bookingsEnsureInflightRef.current.get(key)
    if (inflight) {
      await inflight
      return
    }

    const task = (async () => {
      try {
        const rows = await fetchBookingsInDateRange(from, to)
        setBookings((current) => mergeBookingsByCode(current, rows))
        bookingsLoadedRangesRef.current.push({ from, to })
      } catch (error) {
        console.error('[portal] ensureBookingsForRange failed', error)
      } finally {
        bookingsEnsureInflightRef.current.delete(key)
      }
    })()
    bookingsEnsureInflightRef.current.set(key, task)
    await task
  }, [])

  const ensureBookingByCode = useCallback(async (code: string) => {
    const booking = await fetchBookingByCode(code)
    if (booking) setBookings((current) => mergeBookingsByCode(current, [booking]))
    return booking
  }, [])

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
      return hydrateDayBoatPlan({
        ...stored,
        capacities,
      })
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
        if (next === base) return current
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
        if (next === resolved) return current
        persistVehiclePlanWrite(next)
        return { ...current, [key]: next }
      })
    }

    const relocateBookingDayData = (
      oldDate: string,
      newDate: string,
      program: Program,
      bookingCode: string,
    ) => {
      if (oldDate === newDate) return

      // A no-show belongs to the day it was marked. Moving the booking to another date gives it a
      // clean slate there: no no-show attendance, pickup NS ledger, own-arrival ledger or NS action.
      const wasNoShow =
        getCheckInAttendance(checkInAttendance, oldDate, program, bookingCode) === 'no-show'
      const hadNoShow =
        wasNoShow ||
        paxTotal(getPaxFromMap(pickupNoShowMap, oldDate, program, bookingCode)) > 0 ||
        getJobOrderAction(jobOrderActionMap, oldDate, program, bookingCode) === 'no-show'

      setCheckInEnrollmentMap((current) => {
        const next = moveDayBookingEntry(current, oldDate, newDate, program, bookingCode)
        saveCheckInEnrollmentMap(next)
        return next
      })
      setCheckInAttendanceMap((current) => {
        const base =
          getCheckInAttendance(current, oldDate, program, bookingCode) === 'no-show'
            ? withCheckInAttendance(current, oldDate, program, bookingCode, null)
            : current
        const next = moveDayBookingEntry(base, oldDate, newDate, program, bookingCode)
        saveCheckInAttendanceMap(next)
        return next
      })
      setCheckInPaymentMap((current) => {
        const next = moveDayBookingEntry(current, oldDate, newDate, program, bookingCode)
        saveCheckInPaymentMap(next)
        return next
      })
      setCheckInTicketMap((current) => {
        const next = moveDayBookingEntry(current, oldDate, newDate, program, bookingCode)
        saveCheckInTicketMap(next)
        return next
      })
      setCheckInServiceMap((current) => {
        const next = moveDayBookingEntry(current, oldDate, newDate, program, bookingCode)
        saveCheckInServiceMap(next)
        return next
      })
      setCheckInGuestEditMap((current) => {
        const next = moveDayBookingEntry(current, oldDate, newDate, program, bookingCode)
        saveCheckInGuestEditMap(next)
        return next
      })
      setCheckInNoteMap((current) => {
        const next = moveDayBookingEntry(current, oldDate, newDate, program, bookingCode)
        saveCheckInNoteMap(next)
        return next
      })
      setCheckInGroupGuideMap((current) => {
        const next = moveDayBookingEntry(current, oldDate, newDate, program, bookingCode)
        saveCheckInGroupGuideMap(next)
        return next
      })
      setCheckInSequenceMap((current) => {
        const start = getCheckInSequenceStarts(current, oldDate, program).bookings[bookingCode]
        if (!start) return current
        const next = withCheckInSequenceBookingStart(
          withCheckInSequenceBookingStart(current, oldDate, program, bookingCode, null),
          newDate,
          program,
          bookingCode,
          start,
        )
        saveCheckInSequenceMap(next)
        return next
      })
      persistCheckInWrite(
        'moveCheckInBookingDate',
        (async () => {
          // Delete the no-show row first so the date move cannot carry it to the new day.
          if (wasNoShow) await deleteCheckInAttendanceRow(oldDate, program, bookingCode)
          await moveCheckInBookingDate(oldDate, newDate, program, bookingCode)
        })(),
      )
      moveArrivedPaxSnapshot(oldDate, newDate, program, bookingCode)
      if (hadNoShow) {
        dropBookedPaxSnapshot(oldDate, program, bookingCode)
        dropPickupMarinaLedgers(oldDate, program, bookingCode)
      } else {
        moveBookedPaxSnapshot(oldDate, newDate, program, bookingCode)
        movePickupNoShow(oldDate, newDate, program, bookingCode)
        moveOwnArrival(oldDate, newDate, program, bookingCode)
      }
      setPickupNoShowMap(loadPickupNoShowMap())
      setOwnArrivalMap(loadOwnArrivalMap())
      setJobOrderActionMap((current) => {
        if (getJobOrderAction(current, oldDate, program, bookingCode) === 'no-show') {
          const next = withJobOrderAction(current, oldDate, program, bookingCode, null)
          saveJobOrderActionMap(next)
          persistJobOrderAction(oldDate, program, bookingCode, null)
          return next
        }
        return moveJobOrderAction(current, oldDate, newDate, program, bookingCode)
      })
    }

    const trimEnrollmentsNow = (
      date: string,
      program: Program,
      bookingCode: string,
      maxSeats: number,
    ) => {
      const next = trimCheckInEnrollmentsToSeats(
        checkInEnrollment,
        date,
        program,
        bookingCode,
        Math.max(0, maxSeats),
      )
      const trimmed = getCheckInEnrollments(next, date, program, bookingCode)
      if (trimmed.length === getCheckInEnrollments(checkInEnrollment, date, program, bookingCode).length) {
        const sameSeats =
          enrolledSeatCount(trimmed) ===
          enrolledSeatCount(getCheckInEnrollments(checkInEnrollment, date, program, bookingCode))
        if (sameSeats) return
      }
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
        if (enrolledSeatCount(trimmed) >= Math.max(0, maxSeats) && maxSeats > 0) return current
        const cleared = withCheckInAttendance(current, date, program, bookingCode, null)
        saveCheckInAttendanceMap(cleared)
        persistCheckInWrite(
          'deleteCheckInAttendance',
          deleteCheckInAttendanceRow(date, program, bookingCode),
        )
        return cleared
      })
    }

    const findPartnerBoatByCompany = (plan: DayBoatPlan, company: string) => {
      const target = company.trim().toLowerCase()
      if (!target) return null
      for (const boat of boatNumbersForPlan(plan)) {
        if (!isPartnerBoat(plan, boat)) continue
        const name = (plan.names[boat - 1] ?? '').trim().toLowerCase()
        const label = (plan.labels[boat - 1] ?? '').trim().toLowerCase()
        if (name === target || label === target) return boat
      }
      return null
    }

    const findPartnerBoatHoldingCodes = (plan: DayBoatPlan, codes: string[]) => {
      if (codes.length === 0) return null
      const wanted = new Set(codes)
      for (const boat of boatNumbersForPlan(plan)) {
        if (!isPartnerBoat(plan, boat)) continue
        const hasGuest = Object.entries(plan.assignments).some(
          ([code, assigned]) => assigned === boat && wanted.has(code),
        )
        if (hasGuest) return boat
      }
      return null
    }

    const findSolePartnerBoat = (plan: DayBoatPlan) => {
      const boats = boatNumbersForPlan(plan).filter((boat) => isPartnerBoat(plan, boat))
      return boats.length === 1 ? boats[0] : null
    }

    const findLinkedPartnerBoat = (
      plan: DayBoatPlan,
      company: string,
      previousCompany: string,
      codes: string[],
    ) =>
      findPartnerBoatByCompany(plan, company) ||
      (previousCompany && previousCompany.toLowerCase() !== company.toLowerCase()
        ? findPartnerBoatByCompany(plan, previousCompany)
        : null) ||
      findPartnerBoatHoldingCodes(plan, codes) ||
      findSolePartnerBoat(plan)

    const syncPartnerVanToBoat = (
      date: string,
      program: Program,
      van: number,
      vehicleAssignments: DayVehiclePlan['assignments'],
      previousCompany = '',
      metaOverride?: VanMeta,
    ) => {
      const vehicle = getDayVehiclePlan(date, program)
      const meta = metaOverride ?? vehicle.vanMeta[String(van)]
      if (vanTransferKind(van, meta) !== 'partner') return
      const company = (
        meta?.outsourceCompany?.trim() ||
        meta?.label?.trim() ||
        meta?.plate?.trim() ||
        'Partner'
      ).slice(0, 40)
      const codes = activeDayBookings(date, program)
        .filter((booking) => bookingPaxOnVan(booking, vehicleAssignments[booking.code], van) > 0)
        .map((booking) => booking.code)
      upsertPlan(date, program, (plan) => {
        let next = hydrateDayBoatPlan(plan)
        let boat = findLinkedPartnerBoat(next, company, previousCompany, codes)
        if (!boat) {
          if (next.capacities.length >= MAX_DAY_BOATS) return plan
          next = {
            ...next,
            capacities: [...next.capacities, PARTNER_BOAT_CAPACITY],
            names: [...next.names, company],
            labels: [...next.labels, ''],
            kinds: [...next.kinds, 'partner'],
            guides: [...next.guides, emptyBoatGuide()],
          }
          boat = next.capacities.length
        }
        if ((next.names[boat - 1] ?? '').trim() !== company) {
          const names = [...next.names]
          names[boat - 1] = company
          next = { ...next, names }
        }
        if (codes.length === 0) return next
        const assignments = { ...next.assignments }
        for (const code of codes) assignments[code] = boat
        return { ...next, assignments }
      })
    }

    const followVanOntoBoat = (
      date: string,
      program: Program,
      van: number,
      vehicleAssignments: DayVehiclePlan['assignments'],
    ) => {
      const meta = getDayVehiclePlan(date, program).vanMeta[String(van)]
      if (isDummyVan(van) || vanTransferKind(van, meta) === 'partner') {
        syncPartnerVanToBoat(date, program, van, vehicleAssignments)
        return
      }
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

    const syncDummyVans = (
      date: string,
      program: Program,
      boatAssignments: DayBoatPlan['assignments'],
    ) => {
      const boatPlan = { ...getDayBoatPlan(date, program), assignments: boatAssignments }
      const dayBookings = activeDayBookings(date, program)

      upsertVehiclePlan(date, program, (plan) => {
        const assignments = { ...plan.assignments }
        let changed = false

        for (const booking of dayBookings) {
          const onPartner = bookingOnPartnerBoat(boatPlan, booking.code)
          const needVan = !isNoTransfer(booking.pickupZone)
          const legs = assignments[booking.code]
          const onDummy = Boolean(legs?.some((leg) => isDummyVan(leg.van)))
          const hasRealVan = Boolean(legs?.some((leg) => !isVirtualVan(leg.van)))

          if (onPartner && needVan) {
            if (!hasRealVan && !onDummy) {
              assignments[booking.code] = [
                {
                  van: DUMMY_VAN_NUMBER,
                  pax: totalPassengers(booking),
                  sortOrder: nextSortOrderForVan(assignments, DUMMY_VAN_NUMBER),
                },
              ]
              changed = true
            }
          } else if (onDummy && !onPartner) {
            delete assignments[booking.code]
            changed = true
          }
        }

        const needDummy = Object.values(assignments).some((legs) =>
          legs.some((leg) => isDummyVan(leg.van)),
        )
        const dummyKey = String(DUMMY_VAN_NUMBER)
        const metaMissing = needDummy && plan.vanMeta[dummyKey]?.plate !== DUMMY_VAN_LABEL
        if (!changed && !metaMissing) return plan

        return {
          ...plan,
          assignments,
          vanMeta: needDummy
            ? {
                ...plan.vanMeta,
                [dummyKey]: {
                  ...dummyVanMeta(),
                  ...plan.vanMeta[dummyKey],
                  plate: DUMMY_VAN_LABEL,
                },
              }
            : plan.vanMeta,
        }
      })
    }

    const withVirtualVanMeta = (
      vanMeta: DayVehiclePlan['vanMeta'],
      van: number | null,
    ): DayVehiclePlan['vanMeta'] => {
      if (van === null) return vanMeta
      if (isDummyVan(van)) {
        return {
          ...vanMeta,
          [String(DUMMY_VAN_NUMBER)]: {
            ...dummyVanMeta(),
            ...vanMeta[String(DUMMY_VAN_NUMBER)],
            plate: DUMMY_VAN_LABEL,
          },
        }
      }
      if (isNoTransferVan(van)) {
        return {
          ...vanMeta,
          [String(NO_TRANSFER_VAN_NUMBER)]: {
            ...noTransferVanMeta(),
            ...vanMeta[String(NO_TRANSFER_VAN_NUMBER)],
            plate: NO_TRANSFER_VAN_LABEL,
          },
        }
      }
      return vanMeta
    }

    const persistPrivateTransferInvoice = (
      codes: string[],
      chargeAmount: number,
      mode: 'apply' | 'clear-ops',
    ) => {
      if (codes.length === 0) return
      const amount = normalizeChargeAmount(chargeAmount)
      setBookings((current) => {
        let changed = false
        const next = current.map((booking) => {
          if (!codes.includes(booking.code) || !isActiveBooking(booking)) return booking
          if (isPrivateTransferZone(booking.pickupZone) || isNoTransfer(booking.pickupZone)) {
            return booking
          }
          if (mode === 'clear-ops' || amount <= 0) {
            if (!booking.privateTransferVehicle && !booking.privateTransferPrice) return booking
            changed = true
            return { ...booking, ...emptyPrivateTransferFields() }
          }
          const vehicle =
            booking.privateTransferVehicle === 'Car' || booking.privateTransferVehicle === 'Van'
              ? booking.privateTransferVehicle
              : 'Van'
          const price = formatThb(amount)
          if (
            booking.privateTransferVehicle === vehicle &&
            booking.privateTransferPrice === price
          ) {
            return booking
          }
          changed = true
          return { ...booking, privateTransferVehicle: vehicle, privateTransferPrice: price }
        })
        if (changed) {
          for (const booking of next) {
            if (!codes.includes(booking.code)) continue
            persistBookingWrite('updateBookingDetails', updateBookingDetails(booking))
          }
        }
        return changed ? next : current
      })
    }

    const getFleetVan = (van: number) =>
      fleetVans.find((item) => item.vanNumber === van) ?? null

    const resolveVanMeta = (_van: number, dayMeta?: VanMeta | null) => {
      const identity = unpackVanPlate(dayMeta?.plate ?? '')
      const plate = identity.plate || dayMeta?.plate?.trim() || ''
      const label = dayMeta?.label?.trim() || identity.label
      const driver = dayMeta?.driver?.trim() || ''
      const phone = dayMeta?.phone?.trim() || ''
      const specialKind = isSpecialTransferKind(dayMeta?.specialKind)
        ? dayMeta.specialKind
        : undefined
      return {
        plate,
        label,
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

    const recordGuestCheckInsInternal = async (input: {
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
    }): Promise<{ ok: true; count: number } | { ok: false; error: string }> => {
      if (!input.guests.length) return { ok: false, error: 'Add at least one guest.' }
      const isGuide = input.scope === 'guide'
      if (isGuide && input.guests.length !== 1) {
        return { ok: false, error: 'Tour group guide check-in is for one person only.' }
      }

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

      if (
        getCheckInAttendance(checkInAttendance, input.date, input.program, input.bookingCode) ===
        'no-show'
      ) {
        return {
          ok: false,
          error:
            'Marked no-show at pickup. Ask admin to allow late check-in if guests arrived.',
        }
      }

      const existing = getCheckInEnrollments(
        checkInEnrollment,
        input.date,
        input.program,
        input.bookingCode,
      )
      if (isGuide) {
        const guideSlots = parseGroupGuideNames(
          getCheckInGroupGuide(checkInGroupGuides, input.date, input.program, input.bookingCode),
        ).length
        if (guideSlots === 0) {
          return { ok: false, error: 'No tour group guide was added for this booking.' }
        }
        if (guideEnrollmentCount(existing) >= guideSlots) {
          return {
            ok: false,
            error:
              guideSlots === 1
                ? 'Tour group guide is already checked in.'
                : 'All tour group guides are already checked in.',
          }
        }
      } else {
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
      }

      let markChecked = false
      if (checkInCloudEnabledRef.current) {
        checkInSyncEpochRef.current += 1
        checkInWritePendingRef.current += 1
        try {
          const remote = await recordCheckInEnrollmentsAtomic(
            input.date,
            input.program,
            input.bookingCode,
            cleaned,
          )
          if (!remote.ok) return remote
          markChecked = remote.fullyChecked
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const rpcMissing =
            /portal_record_check_in_enrollments/i.test(message) ||
            /Could not find the function/i.test(message) ||
            /schema cache/i.test(message)
          if (!rpcMissing) {
            return {
              ok: false,
              error: 'Check-in failed because the marina is busy. Please try again.',
            }
          }
          try {
            await upsertCheckInEnrollments(
              input.date,
              input.program,
              input.bookingCode,
              cleaned,
            )
            if (!isGuide) {
              const already = enrolledSeatCount(existing)
              const seatsTotal = totalPassengers(booking)
              markChecked = already + cleaned.length >= seatsTotal
              if (markChecked) {
                await upsertCheckInAttendanceRow(
                  input.date,
                  input.program,
                  input.bookingCode,
                  'checked',
                )
              }
            }
          } catch {
            return {
              ok: false,
              error: 'Check-in failed because the marina is busy. Please try again.',
            }
          }
        } finally {
          checkInWritePendingRef.current = Math.max(0, checkInWritePendingRef.current - 1)
        }
      } else if (!isGuide) {
        const already = enrolledSeatCount(existing)
        const seatsTotal = totalPassengers(booking)
        markChecked = already + cleaned.length >= seatsTotal
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

      if (markChecked) {
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
      }

      return { ok: true, count: cleaned.length }
    }

    return {
      hydrated,
      loadError,
      agents,
      bookings,
      ensureBookingsForRange,
      ensureBookingByCode,
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
        // Undoing a whole no-show (guests came to the marina): the pickup NS ledger still holds
        // the whole booking, which kept a stale red "-N" on the van board. Re-derive it from
        // booked snapshot − live booking so only genuinely missing guests stay counted.
        if (
          status !== 'no-show' &&
          getCheckInAttendance(checkInAttendance, date, program, bookingCode) === 'no-show'
        ) {
          const booking = bookings.find((item) => item.code === bookingCode)
          const ledger = getPaxFromMap(pickupNoShowMap, date, program, bookingCode)
          if (booking && paxTotal(ledger) > 0) {
            const live = {
              adults: booking.adults,
              children: booking.children,
              infants: booking.infants,
              tourLeaders: booking.tourLeaders,
            }
            const snapshot = originalBookedPax(date, program, booking)
            const original = {
              adults: Math.max(snapshot.adults, live.adults),
              children: Math.max(snapshot.children, live.children),
              infants: Math.max(snapshot.infants, live.infants),
              tourLeaders: Math.max(snapshot.tourLeaders, live.tourLeaders),
            }
            const derived = clampPax(subtractPax(original, live), original)
            if (!paxEqual(ledger, derived)) {
              replacePickupNoShowLocal(date, program, bookingCode, derived)
              setPickupNoShowMap(loadPickupNoShowMap())
            }
          }
        }
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
        // Keep boat assignment on no-show so load counts stay complete.
        // Admin moves guests between boats/vans manually; board shows red NS.
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
      getCheckInGroupGuide: (date, program, bookingCode) =>
        getCheckInGroupGuide(checkInGroupGuides, date, program, bookingCode),
      setCheckInGroupGuide: (date, program, bookingCode, guideName) => {
        setCheckInGroupGuideMap((current) => {
          const next = withCheckInGroupGuide(current, date, program, bookingCode, guideName)
          saveCheckInGroupGuideMap(next)
          return next
        })
        const text = guideName.trim()
        persistCheckInWrite(
          text ? 'upsertCheckInGroupGuide' : 'deleteCheckInGroupGuide',
          text
            ? upsertCheckInGroupGuideRow(date, program, bookingCode, text)
            : deleteCheckInGroupGuideRow(date, program, bookingCode),
        )
      },
      getPickupNoShow: (date, program, bookingCode) =>
        getPaxFromMap(pickupNoShowMap, date, program, bookingCode),
      recordPickupNoShow: (date, program, bookingCode, ns) => {
        if (paxTotal(ns) < 1) return getPaxFromMap(pickupNoShowMap, date, program, bookingCode)
        const snapshot = recordPickupNoShowLocal(date, program, bookingCode, ns)
        setPickupNoShowMap(loadPickupNoShowMap())
        return snapshot
      },
      replacePickupNoShow: (date, program, bookingCode, ns) => {
        const snapshot = replacePickupNoShowLocal(date, program, bookingCode, ns)
        setPickupNoShowMap(loadPickupNoShowMap())
        return snapshot
      },
      getOwnArrival: (date, program, bookingCode) =>
        getPaxFromMap(ownArrivalMap, date, program, bookingCode),
      recordOwnArrival: (date, program, bookingCode, arrived) => {
        if (paxTotal(arrived) < 1) return getPaxFromMap(ownArrivalMap, date, program, bookingCode)
        const snapshot = recordOwnArrivalLocal(date, program, bookingCode, arrived)
        setOwnArrivalMap(loadOwnArrivalMap())
        return snapshot
      },
      replaceOwnArrival: (date, program, bookingCode, arrived) => {
        const snapshot = replaceOwnArrivalLocal(date, program, bookingCode, arrived)
        setOwnArrivalMap(loadOwnArrivalMap())
        return snapshot
      },
      repairPickupMarinaLedgers: (date, program, bookingCode, original, current) => {
        const beforeNs = getPaxFromMap(pickupNoShowMap, date, program, bookingCode)
        const beforeTaxi = getPaxFromMap(ownArrivalMap, date, program, bookingCode)
        const repaired = repairPickupMarinaLedgersLocal(
          date,
          program,
          bookingCode,
          original,
          current,
        )
        if (paxTotal(repaired.ns) !== paxTotal(beforeNs) || !paxEqual(repaired.ns, beforeNs)) {
          setPickupNoShowMap(loadPickupNoShowMap())
        }
        if (
          paxTotal(repaired.taxi) !== paxTotal(beforeTaxi) ||
          !paxEqual(repaired.taxi, beforeTaxi)
        ) {
          setOwnArrivalMap(loadOwnArrivalMap())
        }
        return repaired
      },
      getJobOrderAction: (date, program, bookingCode) =>
        getJobOrderAction(jobOrderActionMap, date, program, bookingCode),
      setJobOrderAction: (date, program, bookingCode, status) => {
        setJobOrderActionMap((current) => {
          const next = withJobOrderAction(current, date, program, bookingCode, status)
          saveJobOrderActionMap(next)
          return next
        })
        persistJobOrderAction(date, program, bookingCode, status)
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
        trimEnrollmentsNow(date, program, bookingCode, maxSeats)
      },
      recordGuestCheckIn: async (input) => {
        const batch = await recordGuestCheckInsInternal({
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
        const enrollment = getCheckInEnrollments(
          // Read from storage — map state may not have flushed yet in this tick.
          loadCheckInEnrollmentMap(),
          input.date,
          input.program,
          input.bookingCode,
        ).at(-1)
        if (!enrollment) {
          return { ok: false, error: 'Check-in saved but could not reload guest details.' }
        }
        return { ok: true, enrollment }
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
          persistSettingsWrite('upsertBookingCutoffs', upsertBookingCutoffs(next))
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
          persistSettingsWrite('upsertBookingClosures', upsertBookingClosures(touched))
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
          persistSettingsWrite('deleteBookingClosures', deleteBookingClosures(toRemove))
          return current.filter(
            (item) => !removeKeys.has(bookingClosureKey(item.date, item.program)),
          )
        })
      },
      addBooking: (input, options) => {
        const agent = agents.find((item) => item.slug === input.agentSlug)
        if (agent?.status === 'Inactive' && !options?.bypassCutoff) {
          return { ok: false, error: 'This agent is inactive and cannot create bookings.' }
        }

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
          lateDateChange: false,
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
        const autoLateDateChange =
          !options?.bypassCutoff && isLateAmendmentForDate(bookingCutoffs, existing.date)
        const chargeLateDateChange =
          options?.lateDateChange !== undefined
            ? options.lateDateChange
            : options?.lateChangeFee !== undefined
              ? options.lateChangeFee > 0
              : autoLateDateChange
        const nextLateDateChange = existing.lateDateChange === true || chargeLateDateChange

        setBookings((current) =>
          current.map((booking) =>
            booking.code === code
              ? {
                  ...booking,
                  date: trimmedDate,
                  lateDateChange: nextLateDateChange,
                }
              : booking,
          ),
        )
        persistBookingWrite(
          'updateBookingDate',
          updateBookingDate(code, trimmedDate, {
            lateDateChange: nextLateDateChange,
          }),
        )
        logBookingEvent(
          code,
          'date_changed',
          chargeLateDateChange
            ? `Date changed ${oldDate} → ${trimmedDate} · late change · full charge (Invoice) / head deduct (Prebuy)`
            : options?.lateDateChange === false || options?.lateChangeFee === 0
              ? `Date changed ${oldDate} → ${trimmedDate} · late change waived`
              : `Date changed ${oldDate} → ${trimmedDate}`,
          options?.actor,
        )

        const boatAssignment = getDayBoatPlan(oldDate, program).assignments[code]
        const vanAssignment = getDayVehiclePlan(oldDate, program).assignments[code]
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
        if (boatAssignment !== undefined) {
          upsertPlan(trimmedDate, program, (plan) => ({
            ...plan,
            assignments: { ...plan.assignments, [code]: boatAssignment },
          }))
        }
        if (vanAssignment !== undefined) {
          upsertVehiclePlan(trimmedDate, program, (plan) => ({
            ...plan,
            assignments: { ...plan.assignments, [code]: vanAssignment },
          }))
        }

        relocateBookingDayData(oldDate, trimmedDate, program, code)

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
        const agent = agents.find((item) => item.slug === existing.agentSlug)
        if (agent?.status === 'Inactive' && !options?.bypassCutoff) {
          return { ok: false, error: 'This agent is inactive and cannot create bookings.' }
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
        relocateBookingDayData(existing.date, trimmedDate, existing.program, code)

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
          // Keep hotel/room when set — van board shows hotel name on No Transfer cards.
          next.pickupTime = NO_TRANSFER_TIME
          next.transferExtraCharge = ''
          Object.assign(next, emptyPrivateTransferFields())
          next.status = 'Confirmed'
        } else if (privateTransfer) {
          next.pickupZone = PRIVATE_TRANSFER_ZONE
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
            const matchedHotel = next.pickupHotel
              ? hotels.find(
                  (hotel) => hotel.name.toLowerCase() === next.pickupHotel.toLowerCase(),
                )
              : undefined
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
          // Keep reduce-fee distinct from Change date (sticky flag stays as-is, never undefined).
          next.lateDateChange = existing.lateDateChange === true
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
        if (next.pickupZone !== existing.pickupZone || next.pickupHotel !== existing.pickupHotel) {
          upsertVehiclePlan(existing.date, existing.program, (plan) => {
            if (!(code in plan.assignments)) return plan
            const assignments = { ...plan.assignments }
            delete assignments[code]
            return { ...plan, assignments }
          })
        }
        if (newPax < oldPax) {
          trimEnrollmentsNow(existing.date, existing.program, code, newPax)
          upsertVehiclePlan(existing.date, existing.program, (plan) => {
            const legs = plan.assignments[code]
            if (!legs) return plan
            const nextLegs = rescaleVanAssignmentToPax(legs, newPax)
            const assignments = { ...plan.assignments }
            if (!nextLegs) delete assignments[code]
            else assignments[code] = nextLegs
            return { ...plan, assignments }
          })
          upsertPlan(existing.date, existing.program, (plan) => {
            const current = plan.assignments[code]
            if (current == null) return plan
            const nextAssign = rescaleBoatAssignmentToPax(current, newPax)
            const assignments = { ...plan.assignments }
            if (nextAssign == null) delete assignments[code]
            else assignments[code] = nextAssign
            return { ...plan, assignments }
          })
        }
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
        const existingZone = zones.find((zone) => zone.name === name)
        const oldTime = existingZone?.time?.trim() ?? ''
        const nextTime = time.trim()
        setZones((current) => {
          const next = current.map((zone) =>
            zone.name === name && !zone.pending ? { ...zone, time: nextTime } : zone,
          )
          const updated = next.find((zone) => zone.name === name)
          if (updated) {
            const sortOrder = next.findIndex((zone) => zone.name === name) * 10 + 10
            persistQuietly('upsertZone', upsertZone(updated, sortOrder))
          }
          return next
        })
        if (!existingZone || existingZone.pending || !oldTime || oldTime === nextTime) return
        setBookings((current) =>
          current.map((booking) => {
            if (!isActiveBooking(booking) || booking.pickupZone !== name) return booking
            if (isNoTransfer(booking.pickupZone) || isPrivateTransfer(booking)) return booking
            if (booking.pickupTime.toLowerCase().includes('awaiting')) return booking
            if (booking.pickupTime.trim() !== oldTime) return booking
            persistBookingWrite(
              'updateBookingPickup',
              updateBookingPickup(booking.code, nextTime, booking.status),
            )
            return { ...booking, pickupTime: nextTime }
          }),
        )
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
        const nameChanged = existing.name !== trimmedName
        const extraChanged = existing.extraChargeTransfer.trim() !== note
        if (nameChanged || extraChanged) {
          setBookings((current) =>
            current.map((booking) => {
              if (!isActiveBooking(booking)) return booking
              const matches =
                booking.pickupHotel.toLowerCase() === existing.name.toLowerCase() ||
                booking.pickupHotel.toLowerCase() === trimmedName.toLowerCase()
              if (!matches) return booking
              const nextBooking: Booking = {
                ...booking,
                pickupHotel: nameChanged ? trimmedName : booking.pickupHotel,
                transferExtraCharge: extraChanged ? note : booking.transferExtraCharge,
              }
              persistBookingWrite('updateBookingDetails', updateBookingDetails(nextBooking))
              return nextBooking
            }),
          )
        }
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
          persistSettingsWrite('upsertAvailability', upsertAvailability(next))
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
          persistSettingsWrite('upsertAvailabilityRows', upsertAvailabilityRows(touched))
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
          persistSettingsWrite('upsertAvailabilityRows', upsertAvailabilityRows(touched))
          return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
        })
      },
      assignBookingToBoat: (date, program, bookingCode, boat, options) => {
        const key = dayBoatPlanKey(date, program)
        const rendered = getDayBoatPlan(date, program)
        // Several moves in one tick must build on each other, not on the rendered plan.
        const currentBoat = {
          ...rendered,
          assignments: boatAssignmentsPendingRef.current[key] ?? rendered.assignments,
        }
        // No-show bookings stay assignable — admin moves them between boats.
        if (boat !== null) {
          const booking = bookings.find((item) => item.code === bookingCode)
          if (!booking) return
          const countable = activeDayBookings(date, program)
          if (!canFitBookingOnBoat(currentBoat, countable, boat, booking).ok) return
        }
        const nextBoatAssignments = { ...currentBoat.assignments }
        if (boat === null) delete nextBoatAssignments[bookingCode]
        else nextBoatAssignments[bookingCode] = boat
        boatAssignmentsPendingRef.current[key] = nextBoatAssignments
        upsertPlan(
          date,
          program,
          (plan) => ({ ...plan, assignments: nextBoatAssignments }),
          options,
        )
        syncDummyVans(date, program, nextBoatAssignments)
      },
      setBoatCapacity: (date, program, boat, capacity, options) => {
        upsertPlan(
          date,
          program,
          (plan) => {
            const next = hydrateDayBoatPlan(plan)
            const index = boat - 1
            if (index < 0 || index >= next.capacities.length) return plan
            if (next.kinds[index] === 'partner') return plan
            next.capacities[index] = Math.max(1, Math.floor(capacity) || 1)
            return next
          },
          options,
        )
      },
      setBoatName: (date, program, boat, name, options) => {
        upsertPlan(
          date,
          program,
          (plan) => {
            const next = hydrateDayBoatPlan(plan)
            const index = boat - 1
            if (index < 0 || index >= next.names.length) return plan
            next.names[index] = name.trim().slice(0, 40)
            return next
          },
          options,
        )
      },
      setBoatLabel: (date, program, boat, label, options) => {
        upsertPlan(
          date,
          program,
          (plan) => {
            const next = hydrateDayBoatPlan(plan)
            const index = boat - 1
            if (index < 0 || index >= next.labels.length) return plan
            next.labels[index] = label.trim().slice(0, 28)
            return next
          },
          options,
        )
      },
      setBoatGuide: (date, program, boat, guide, options) => {
        upsertPlan(
          date,
          program,
          (plan) => {
            const next = hydrateDayBoatPlan(plan)
            const index = boat - 1
            if (index < 0 || index >= next.guides.length) return plan
            const prev = next.guides[index] ?? emptyBoatGuide()
            next.guides[index] = {
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
            return next
          },
          options,
        )
      },
      addDayBoat: (date, program, capacity, options) => {
        upsertPlan(
          date,
          program,
          (plan) => {
            const next = hydrateDayBoatPlan(plan)
            if (next.capacities.length >= MAX_DAY_BOATS) return plan
            const nextCap = Math.max(
              1,
              Math.floor(capacity ?? DEFAULT_BOAT_CAPACITY) || DEFAULT_BOAT_CAPACITY,
            )
            const nextIndex = next.capacities.length
            const color = String(options?.color ?? '')
              .trim()
              .toLowerCase()
            const boatNo =
              String(options?.boatNo ?? '').trim() ||
              String(DEFAULT_BOAT_LABEL_START + nextIndex)
            return {
              ...next,
              capacities: [...next.capacities, nextCap],
              names: [...next.names, String(options?.name ?? '').trim().slice(0, 40)],
              labels: [...next.labels, packOwnBoatLabel(boatNo, color).slice(0, 28)],
              kinds: [...next.kinds, 'own'],
              guides: [...next.guides, emptyBoatGuide()],
            }
          },
          options,
        )
      },
      addPartnerBoat: (date, program, options) => {
        upsertPlan(
          date,
          program,
          (plan) => {
            const next = hydrateDayBoatPlan(plan)
            if (next.capacities.length >= MAX_DAY_BOATS) return plan
            return {
              ...next,
              capacities: [...next.capacities, PARTNER_BOAT_CAPACITY],
              names: [...next.names, ''],
              labels: [...next.labels, ''],
              kinds: [...next.kinds, 'partner'],
              guides: [...next.guides, emptyBoatGuide()],
            }
          },
          options,
        )
      },
      removeDayBoat: (date, program, boat, options) => {
        const current = hydrateDayBoatPlan(getDayBoatPlan(date, program))
        if (current.capacities.length <= 1) return
        const index = boat - 1
        if (index < 0 || index >= current.capacities.length) return
        const assignments: DayBoatPlan['assignments'] = {}
        for (const [code, assigned] of Object.entries(current.assignments)) {
          const nextLegs = normalizeBoatAssignment(assigned)
            .filter((leg) => leg.boat !== boat)
            .map((leg) => ({
              boat: leg.boat > boat ? leg.boat - 1 : leg.boat,
              pax: leg.pax,
            }))
          const compact = compactBoatAssignment(nextLegs)
          if (compact) assignments[code] = compact
        }
        upsertPlan(
          date,
          program,
          (plan) => {
            const next = hydrateDayBoatPlan(plan)
            if (next.capacities.length <= 1) return plan
            return {
              ...next,
              capacities: next.capacities.filter((_, i) => i !== index),
              names: next.names.filter((_, i) => i !== index),
              labels: next.labels.filter((_, i) => i !== index),
              kinds: next.kinds.filter((_, i) => i !== index),
              guides: next.guides.filter((_, i) => i !== index),
              assignments,
            }
          },
          options,
        )
        syncDummyVans(date, program, assignments)
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
            const aligned = hydrateDayBoatPlan({
              ...existing,
              date: planDate,
              program,
              capacities,
            })
            const updated: DayBoatPlan = {
              ...aligned,
              capacities: aligned.capacities.map((cap, index) =>
                aligned.kinds[index] === 'partner' ? PARTNER_BOAT_CAPACITY : DEFAULT_BOAT_CAPACITY,
              ),
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
            const assignments: DayBoatPlan['assignments'] = {}
            for (const [code, assigned] of Object.entries(plan.assignments)) {
              const legs = normalizeBoatAssignment(assigned).filter(
                (leg) => leg.boat >= 1 && leg.boat <= capacities.length,
              )
              const compact = compactBoatAssignment(legs)
              if (compact) assignments[code] = compact
            }
            return {
              ...plan,
              capacities,
              names: defaultBoatNames(capacities.length),
              labels: defaultBoatLabels(capacities.length),
              kinds: defaultBoatKinds(capacities.length),
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
        const currentPlan = getDayBoatPlan(date, program)
        const nextAssignments = autoAssignBoats(
          dayBookings,
          currentPlan.capacities,
          vehiclePlan.assignments,
          currentPlan,
        )
        for (const booking of activeDayBookings(date, program)) {
          if (getCheckInAttendance(checkInAttendance, date, program, booking.code) === 'no-show') {
            delete nextAssignments[booking.code]
          }
        }
        upsertPlan(
          date,
          program,
          (plan) => ({
            ...plan,
            capacities: normalizeBoatCapacities(plan.capacities),
            assignments: nextAssignments,
          }),
          options,
        )
        syncDummyVans(date, program, nextAssignments)
      },
      clearDayBoatAssignments: (date, program, options) => {
        upsertPlan(date, program, (plan) => ({ ...plan, assignments: {} }), options)
        syncDummyVans(date, program, {})
      },
      commitDayBoatPlan: async (date, program) => {
        const key = dayBoatPlanKey(date, program)
        const plan = getDayBoatPlan(date, program)
        try {
          const result = await enqueueBoatPlanSave(async () => {
            const saved = await saveDayBoatPlan(plan)
            setDayBoatPlans((current) => {
              const existing = current[key] ?? plan
              return { ...current, [key]: { ...existing, revision: saved.revision } }
            })
            return saved
          })
          boatPlanDirtyKeysRef.current.delete(key)
          void result
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
        const boatPlan = getDayBoatPlan(date, program)
        const dayBookings = activeDayBookings(date, program).filter(
          (booking) =>
            getCheckInAttendance(checkInAttendance, date, program, booking.code) !== 'no-show',
        )
        const codes = dayBookings
          .filter((booking) => {
            if (bookingPaxOnVan(booking, vehiclePlan.assignments[booking.code], van) > 0) return true
            return (
              isNoTransferVan(van) && bookingTransferKind(booking, vehiclePlan, boatPlan) === 'no_transfer'
            )
          })
          .map((booking) => booking.code)
        if (codes.length === 0) return
        if (isNoTransferVan(van)) {
          const assignments = { ...vehiclePlan.assignments }
          let vehicleChanged = false
          for (const code of codes) {
            const item = dayBookings.find((row) => row.code === code)
            if (!item) continue
            if (bookingPaxOnVan(item, assignments[code], van) > 0) continue
            assignments[code] = [
              { van, pax: totalPassengers(item), sortOrder: nextSortOrderForVan(assignments, van) },
            ]
            vehicleChanged = true
          }
          if (vehicleChanged) {
            upsertVehiclePlan(date, program, (plan) => ({
              ...plan,
              assignments,
              vanMeta: withVirtualVanMeta(plan.vanMeta, van),
            }))
          }
        }
        upsertPlan(
          date,
          program,
          (plan) => {
            const assignments = { ...plan.assignments }
            for (const code of codes) {
              const booking = dayBookings.find((row) => row.code === code)
              const vanPax = booking
                ? bookingPaxOnVan(booking, vehiclePlan.assignments[code], van)
                : 0
              const total = booking ? totalPassengers(booking) : 0
              const splitVan =
                Boolean(booking) &&
                (vehiclePlan.assignments[code]?.length ?? 0) > 1 &&
                vanPax > 0 &&
                vanPax < total
              if (boat === null) {
                if (splitVan) {
                  const next = moveBoatPax(assignments[code], null, vanPax, total)
                  if (next) assignments[code] = next
                  else delete assignments[code]
                } else {
                  delete assignments[code]
                }
                continue
              }
              if (splitVan) {
                const next = moveBoatPax(assignments[code], boat, vanPax, total)
                if (next) assignments[code] = next
                else assignments[code] = boat
              } else {
                assignments[code] = boat
              }
            }
            return { ...plan, assignments }
          },
          options,
        )
        syncDummyVans(date, program, getDayBoatPlan(date, program).assignments)
      },
      assignVanToPartnerBoat: (date, program, van) => {
        const vehiclePlan = getDayVehiclePlan(date, program)
        const meta = vehiclePlan.vanMeta[String(van)]
        if (vanTransferKind(van, meta) === 'partner' || isDummyVan(van)) {
          syncPartnerVanToBoat(date, program, van, vehiclePlan.assignments, '', meta)
          return
        }
        const codes = activeDayBookings(date, program)
          .filter((booking) => bookingPaxOnVan(booking, vehiclePlan.assignments[booking.code], van) > 0)
          .filter(
            (booking) =>
              getCheckInAttendance(checkInAttendance, date, program, booking.code) !== 'no-show',
          )
          .map((booking) => booking.code)
        let assignedBoat: BoatNumber | null = null
        upsertPlan(date, program, (plan) => {
          let next = hydrateDayBoatPlan(plan)
          let boat = boatNumbersForPlan(next).find((item) => isPartnerBoat(next, item))
          if (!boat) {
            if (next.capacities.length >= MAX_DAY_BOATS) return plan
            next = {
              ...next,
              capacities: [...next.capacities, PARTNER_BOAT_CAPACITY],
              names: [...next.names, ''],
              labels: [...next.labels, ''],
              kinds: [...next.kinds, 'partner'],
              guides: [...next.guides, emptyBoatGuide()],
            }
            boat = next.capacities.length
          }
          assignedBoat = boat
          if (codes.length === 0) return next
          const assignments = { ...next.assignments }
          for (const code of codes) assignments[code] = boat
          return { ...next, assignments }
        })
        if (assignedBoat && codes.length > 0) {
          const nextAssignments = { ...getDayBoatPlan(date, program).assignments }
          for (const code of codes) nextAssignments[code] = assignedBoat
          syncDummyVans(date, program, nextAssignments)
        }
      },
      addPartnerVan: (date, program, company, bookingCodes = []) => {
        const name = company.trim().slice(0, 40)
        if (!name) return null
        const current = getDayVehiclePlan(date, program)
        const assigned = listFleetVanNumbers(current.assignments)
        const saved = Object.keys(current.vanMeta ?? {})
          .map(Number)
          .filter((van) => Number.isFinite(van) && van >= 1 && !isVirtualVan(van))
        const listed = [...new Set([...assigned, ...saved])]
        const maxVan = listed.length > 0 ? Math.max(...listed) : 0
        const van = Math.max(maxVan, 3) + 1
        const nextMeta: VanMeta = {
          ...emptyVanMeta(),
          specialKind: 'partner',
          outsourceCompany: name,
          label: name,
          plate: packVanPlate(name, name),
        }
        const assignments = { ...current.assignments }
        for (const code of bookingCodes) {
          const booking = bookings.find((item) => item.code === code && isActiveBooking(item))
          if (!booking || booking.date !== date || booking.program !== program) continue
          assignments[code] = [
            {
              van,
              pax: totalPassengers(booking),
              sortOrder: nextSortOrderForVan(assignments, van),
            },
          ]
        }
        upsertVehiclePlan(date, program, (plan) => ({
          ...plan,
          assignments,
          vanMeta: {
            ...plan.vanMeta,
            [String(van)]: nextMeta,
          },
        }))
        syncPartnerVanToBoat(date, program, van, assignments, '', nextMeta)
        return van
      },
      assignBookingToVan: (date, program, bookingCode, van) => {
        const booking = bookings.find((item) => item.code === bookingCode && isActiveBooking(item))
        const pax = booking ? totalPassengers(booking) : 0
        const current = getDayVehiclePlan(date, program)
        const prevKind = booking
          ? bookingTransferKind(booking, current, getDayBoatPlan(date, program))
          : 'unassigned'
        const assignments = { ...current.assignments }
        if (van === null) delete assignments[bookingCode]
        else {
          assignments[bookingCode] = [
            { van, pax, sortOrder: nextSortOrderForVan(assignments, van) },
          ]
        }
        upsertVehiclePlan(date, program, (plan) => ({
          ...plan,
          assignments,
          vanMeta: withVirtualVanMeta(plan.vanMeta, van),
        }))
        if (van !== null) followVanOntoBoat(date, program, van, assignments)
        const nextKind =
          van === null
            ? 'unassigned'
            : vanTransferKind(van, withVirtualVanMeta(current.vanMeta, van)[String(van)])
        if (nextKind === 'private') {
          persistPrivateTransferInvoice(
            [bookingCode],
            normalizeChargeAmount(current.vanMeta[String(van)]?.chargeAmount),
            'apply',
          )
        } else if (prevKind === 'private') {
          persistPrivateTransferInvoice([bookingCode], 0, 'clear-ops')
        }
      },
      assignBookingsToVan: (date, program, bookingCodes, van) => {
        if (bookingCodes.length === 0) return
        const current = getDayVehiclePlan(date, program)
        const boatPlan = getDayBoatPlan(date, program)
        const paxByCode = new Map<string, number>()
        const leavingPrivate: string[] = []
        for (const code of bookingCodes) {
          const item = bookings.find((row) => row.code === code && isActiveBooking(row))
          if (item) paxByCode.set(code, totalPassengers(item))
          if (item && bookingTransferKind(item, current, boatPlan) === 'private') {
            leavingPrivate.push(code)
          }
        }
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
        upsertVehiclePlan(date, program, (plan) => ({
          ...plan,
          assignments,
          vanMeta: withVirtualVanMeta(plan.vanMeta, van),
        }))
        if (van !== null) followVanOntoBoat(date, program, van, assignments)
        const nextKind =
          van === null
            ? 'unassigned'
            : vanTransferKind(van, withVirtualVanMeta(current.vanMeta, van)[String(van)])
        if (nextKind === 'private') {
          persistPrivateTransferInvoice(
            bookingCodes,
            normalizeChargeAmount(current.vanMeta[String(van)]?.chargeAmount),
            'apply',
          )
        } else if (leavingPrivate.length > 0) {
          persistPrivateTransferInvoice(leavingPrivate, 0, 'clear-ops')
        }
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
        const booking = bookings.find((item) => item.code === bookingCode)
        if (booking && cleaned.length > 0) {
          const boatPlan = getDayBoatPlan(date, program)
          const byBoat = new Map<number, number>()
          for (const leg of cleaned) {
            const vanBoat = primaryBoatNumber(
              boatPlan.assignments[
                activeDayBookings(date, program).find(
                  (item) =>
                    item.code !== bookingCode &&
                    bookingPaxOnVan(item, assignments[item.code], leg.van) > 0,
                )?.code ?? ''
              ],
            )
            const own = primaryBoatNumber(boatPlan.assignments[bookingCode])
            const boat = vanBoat ?? own
            if (!boat) continue
            byBoat.set(boat, (byBoat.get(boat) ?? 0) + leg.pax)
          }
          if (byBoat.size > 0) {
            const boatLegs = [...byBoat.entries()].map(([boat, pax]) => ({ boat, pax }))
            upsertPlan(date, program, (plan) => {
              const next = { ...plan.assignments }
              const compact = compactBoatAssignment(boatLegs)
              if (compact) next[bookingCode] = compact
              else delete next[bookingCode]
              return { ...plan, assignments: next }
            })
          }
        }
      },
      setBookingBoatSplits: (date, program, bookingCode, legs) => {
        const booking = bookings.find((item) => item.code === bookingCode)
        const total = booking ? totalPassengers(booking) : 0
        const cleaned = normalizeBoatAssignment(legs, total)
        const sum = cleaned.reduce((s, leg) => s + leg.pax, 0)
        if (booking && sum > total) return
        upsertPlan(date, program, (plan) => {
          const assignments = { ...plan.assignments }
          const compact = compactBoatAssignment(cleaned)
          if (!compact) delete assignments[bookingCode]
          else assignments[bookingCode] = compact
          return { ...plan, assignments }
        })
        const nextBoat = { ...getDayBoatPlan(date, program).assignments }
        const compact = compactBoatAssignment(cleaned)
        if (!compact) delete nextBoat[bookingCode]
        else nextBoat[bookingCode] = compact
        syncDummyVans(date, program, nextBoat)
      },
      reorderVanBookings: (date, program, van, orderedCodes) => {
        if (orderedCodes.length === 0) return
        upsertVehiclePlan(date, program, (plan) => ({
          ...plan,
          assignments: reorderVanAssignments(plan.assignments, van, orderedCodes),
        }))
      },
      setVanMeta: (date, program, van, meta) => {
        let prevMeta = emptyVanMeta()
        let nextMeta = emptyVanMeta()
        let assignedCodes: string[] = []
        let assignments: DayVehiclePlan['assignments'] = {}
        upsertVehiclePlan(date, program, (current) => {
          const prev = current.vanMeta[String(van)] ?? emptyVanMeta()
          prevMeta = prev
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
          const company = canonicalVanOutsourceCompany(
            outsourced || specialKind === 'partner'
              ? meta.outsourceCompany !== undefined
                ? meta.outsourceCompany
                : prev.outsourceCompany ?? ''
              : '',
          )
          const label =
            meta.label !== undefined
              ? meta.label.trim()
              : prev.label?.trim() ||
                (outsourced || specialKind === 'partner' ? company : '')
          const plateRaw = meta.plate !== undefined ? meta.plate.trim() : unpackVanPlate(prev.plate).plate
          const next: VanMeta = {
            plate: packVanPlate(label, plateRaw),
            label,
            driver: meta.driver !== undefined ? meta.driver.trim() : prev.driver.trim(),
            phone: meta.phone !== undefined ? meta.phone.trim() : prev.phone.trim(),
            outsourced,
            outsourceCompany: company,
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
          nextMeta = next
          assignments = current.assignments
          assignedCodes = Object.entries(current.assignments)
            .filter(([, legs]) => legs.some((leg) => leg.van === van))
            .map(([code]) => code)
          return {
            ...current,
            vanMeta: {
              ...current.vanMeta,
              [String(van)]: next,
            },
          }
        })
        if (vanTransferKind(van, nextMeta) === 'private') {
          persistPrivateTransferInvoice(assignedCodes, nextMeta.chargeAmount ?? 0, 'apply')
        }
        if (vanTransferKind(van, nextMeta) === 'partner') {
          const prevCompany =
            prevMeta.outsourceCompany?.trim() ||
            prevMeta.label?.trim() ||
            unpackVanPlate(prevMeta.plate).plate ||
            ''
          syncPartnerVanToBoat(date, program, van, assignments, prevCompany, nextMeta)
        }
      },
      autoAssignDayVans: (date, program) => {
        const boatPlan = getDayBoatPlan(date, program)
        const current = getDayVehiclePlan(date, program)
        const dayBookings = activeDayBookings(date, program).filter((booking) => {
          if (bookingOnPartnerBoat(boatPlan, booking.code)) return false
          const kind = bookingTransferKind(booking, current, boatPlan)
          return kind === 'unassigned' || kind === 'company'
        })
        const kept: Record<string, VanSplit[]> = {}
        for (const [code, legs] of Object.entries(current.assignments)) {
          if (
            legs.some((leg) => isVirtualVan(leg.van)) ||
            bookingOnPartnerBoat(boatPlan, code) ||
            vanTransferKind(legs[0]?.van ?? 0, current.vanMeta[String(legs[0]?.van)]) !== 'company'
          ) {
            kept[code] = legs
          }
        }
        upsertVehiclePlan(date, program, (plan) => ({
          ...plan,
          assignments: { ...autoAssignVans(dayBookings, plan.vanCapacity), ...kept },
        }))
      },
      clearDayVanAssignments: (date, program) => {
        const current = getDayVehiclePlan(date, program)
        const boatPlan = getDayBoatPlan(date, program)
        const returning = Object.keys(current.assignments)
        const leavingPrivate = returning.filter((code) => {
          const booking = bookings.find((row) => row.code === code && isActiveBooking(row))
          return Boolean(booking && bookingTransferKind(booking, current, boatPlan) === 'private')
        })
        upsertVehiclePlan(date, program, (plan) => ({
          ...plan,
          assignments: {},
          vanMeta: {},
        }))
        upsertPlan(date, program, (plan) => {
          const next = hydrateDayBoatPlan(plan)
          const keepIdx = next.capacities
            .map((_, index) => index)
            .filter((index) => next.kinds[index] !== 'partner')
          const assignments: DayBoatPlan['assignments'] = {}
          if (keepIdx.length === 0 || keepIdx.length === next.capacities.length) {
            for (const [code, assigned] of Object.entries(next.assignments)) {
              if (returning.includes(code)) continue
              assignments[code] = assigned
            }
            return { ...next, assignments }
          }
          const oldToNew = new Map<number, number>()
          keepIdx.forEach((oldIndex, newIndex) => oldToNew.set(oldIndex + 1, newIndex + 1))
          for (const [code, assigned] of Object.entries(next.assignments)) {
            if (returning.includes(code)) continue
            const mapped = compactBoatAssignment(
              normalizeBoatAssignment(assigned)
                .map((leg) => {
                  const boat = oldToNew.get(leg.boat)
                  return boat ? { boat, pax: leg.pax } : null
                })
                .filter((leg): leg is { boat: number; pax: number } => leg !== null),
            )
            if (mapped) assignments[code] = mapped
          }
          return {
            ...next,
            capacities: keepIdx.map((index) => next.capacities[index]),
            names: keepIdx.map((index) => next.names[index]),
            labels: keepIdx.map((index) => next.labels[index]),
            kinds: keepIdx.map((index) => next.kinds[index]),
            guides: keepIdx.map((index) => next.guides[index]),
            assignments,
          }
        })
        if (leavingPrivate.length > 0) {
          persistPrivateTransferInvoice(leavingPrivate, 0, 'clear-ops')
        }
      },
      removeDayVan: (date, program, van) => {
        if (!Number.isFinite(van) || van < 1 || isDummyVan(van)) return
        const current = getDayVehiclePlan(date, program)
        const boatPlan = getDayBoatPlan(date, program)
        const meta = current.vanMeta[String(van)]
        const partnerCompany =
          meta?.outsourceCompany?.trim() || meta?.label?.trim() || unpackVanPlate(meta?.plate).plate || ''
        const dropPartnerBoat = vanTransferKind(van, meta) === 'partner'
        const returning: string[] = []
        const leavingPrivate: string[] = []
        const assignments: Record<string, VanSplit[]> = {}
        for (const [code, legs] of Object.entries(current.assignments)) {
          if (legs.some((leg) => leg.van === van)) {
            returning.push(code)
            const booking = bookings.find((row) => row.code === code && isActiveBooking(row))
            if (booking && bookingTransferKind(booking, current, boatPlan) === 'private') {
              leavingPrivate.push(code)
            }
            continue
          }
          assignments[code] = legs
        }
        const vanMeta = { ...current.vanMeta }
        delete vanMeta[String(van)]
        if (!isVirtualVan(van) && van >= 1 && van <= 3) {
          vanMeta[String(van)] = hiddenVanMeta()
        }
        const linkedBoat = dropPartnerBoat
          ? findLinkedPartnerBoat(boatPlan, partnerCompany, partnerCompany, returning)
          : null
        const otherPartnerStillUsesBoat = Boolean(
          linkedBoat &&
            Object.entries(vanMeta).some(([key, other]) => {
              if (vanTransferKind(Number(key), other) !== 'partner') return false
              const name = (
                other.outsourceCompany?.trim() ||
                other.label?.trim() ||
                unpackVanPlate(other.plate).plate ||
                ''
              ).toLowerCase()
              const boatName = (boatPlan.names[linkedBoat - 1] ?? '').trim().toLowerCase()
              const boatLabel = (boatPlan.labels[linkedBoat - 1] ?? '').trim().toLowerCase()
              return Boolean(name) && (name === boatName || name === boatLabel)
            }),
        )
        upsertVehiclePlan(date, program, (plan) => ({
          ...plan,
          assignments,
          vanMeta,
        }))
        if (returning.length > 0 || (linkedBoat && !otherPartnerStillUsesBoat)) {
          upsertPlan(date, program, (plan) => {
            let next = hydrateDayBoatPlan(plan)
            if (returning.length > 0) {
              const nextAssignments = { ...next.assignments }
              for (const code of returning) delete nextAssignments[code]
              next = { ...next, assignments: nextAssignments }
            }
            if (!linkedBoat || otherPartnerStillUsesBoat) return next
            const index = linkedBoat - 1
            if (index < 0 || index >= next.capacities.length || next.capacities.length <= 1) {
              return next
            }
            const kept: DayBoatPlan['assignments'] = {}
            for (const [code, assigned] of Object.entries(next.assignments)) {
              const mapped = compactBoatAssignment(
                normalizeBoatAssignment(assigned)
                  .filter((leg) => leg.boat !== linkedBoat)
                  .map((leg) => ({
                    boat: leg.boat > linkedBoat ? leg.boat - 1 : leg.boat,
                    pax: leg.pax,
                  })),
              )
              if (mapped) kept[code] = mapped
            }
            return {
              ...next,
              capacities: next.capacities.filter((_, i) => i !== index),
              names: next.names.filter((_, i) => i !== index),
              labels: next.labels.filter((_, i) => i !== index),
              kinds: next.kinds.filter((_, i) => i !== index),
              guides: next.guides.filter((_, i) => i !== index),
              assignments: kept,
            }
          })
        }
        if (leavingPrivate.length > 0) {
          persistPrivateTransferInvoice(leavingPrivate, 0, 'clear-ops')
        }
      },
    }
  }, [agents, bookings, ensureBookingsForRange, ensureBookingByCode, zones, hotels, availability, dayBoatPlans, dayVehiclePlans, checkInAttendance, checkInEnrollment, checkInPayment, checkInTicket, checkInServices, checkInSequence, checkInGuestEdit, checkInNotes, checkInGroupGuides, pickupNoShowMap, ownArrivalMap, jobOrderActionMap, fleetVans, drivers, bookingCutoffs, bookingClosures, bookingEventsByCode, hydrated, loadError])

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortal() {
  const context = useContext(PortalContext)
  if (!context) {
    throw new Error('usePortal must be used within PortalProvider')
  }
  return context
}
