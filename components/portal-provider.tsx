'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { nextBookingCode, uniqueAgentSlug } from '@/lib/format'
import { autoAssignBoats } from '@/lib/boat-assign'
import { autoAssignVans, nextSortOrderForVan, normalizeAssignments, paxOnVan, reorderVanAssignments } from '@/lib/vehicle-assign'
import {
  bookingClosedMessage,
  cancelClosedMessage,
  DEFAULT_BOOKING_CUTOFFS,
  isBookingOpenForDate,
  isCancelOpenForDate,
  normalizeBeforeDays,
  normalizeCutoffTime,
  type BookingCutoffSettings,
} from '@/lib/booking-cutoffs'
import {
  deleteAgent,
  deleteBookingClosures,
  deleteHotel,
  deleteZone,
  fetchBookingEvents,
  fetchBookings,
  insertBooking,
  insertBookingEvent,
  loadPortalSnapshot,
  persistQuietly,
  saveDayBoatPlan,
  saveDayVehiclePlan,
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
  upsertHotel,
  upsertZone,
  upsertFleetVan,
} from '@/lib/supabase/portal-db'
import type {
  Agent,
  AgentStatus,
  Availability,
  BoatNumber,
  Booking,
  BookingActionOptions,
  BookingActor,
  BookingClosure,
  BookingEvent,
  BookingEventType,
  DayBoatPlan,
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
  DEFAULT_JB_CAPACITY,
  DEFAULT_PP_CAPACITY,
  MAX_DAY_BOATS,
  NO_TRANSFER_TIME,
  bookingClosureKey,
  dayBoatPlanKey,
  dayVehiclePlanKey,
  defaultBoatCapacities,
  emptyDayBoatPlan,
  emptyDayVehiclePlan,
  emptyVanMeta,
  isActiveBooking,
  isCorePickupZone,
  isNoTransfer,
  normalizeBoatCapacities,
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
  bookingCutoffs: BookingCutoffSettings
  updateBookingCutoffs: (patch: Partial<BookingCutoffSettings>) => void
  bookingClosures: BookingClosure[]
  isProgramClosed: (date: string, program: Program) => boolean
  getBookingClosure: (date: string, program: Program) => BookingClosure | null
  closeBookingForDates: (dates: string[], programs: Program[], reason?: string) => void
  openBookingForDates: (dates: string[], programs: Program[]) => void
  isBookingOpen: (travelDate: string) => boolean
  isCancelOpen: (travelDate: string) => boolean
  addBooking: (
    booking: Omit<Booking, 'code' | 'status' | 'pickupTime' | 'transferExtraCharge'> & {
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
  assignBookingToBoat: (
    date: string,
    program: Program,
    bookingCode: string,
    boat: BoatNumber | null,
  ) => void
  setBoatCapacity: (
    date: string,
    program: Program,
    boat: BoatNumber,
    capacity: number,
  ) => void
  /** Append a boat for this day (default capacity 44, or a custom rental size). */
  addDayBoat: (date: string, program: Program, capacity?: number) => void
  /** Remove a boat; guests on it become unassigned; higher boat numbers shift down. */
  removeDayBoat: (date: string, program: Program, boat: BoatNumber) => void
  /** Set every boat on this day back to the default capacity (keeps boat count). */
  resetDayBoatCapacities: (date: string, program: Program) => void
  /** Restore the default fleet: 3 boats × 44 pax (clears assignments beyond boat 3). */
  resetDayBoatFleet: (date: string, program: Program) => void
  autoAssignDayBoats: (date: string, program: Program) => void
  clearDayBoatAssignments: (date: string, program: Program) => void
  /** Assign every booking currently on this van to one boat (whole van group). */
  assignVanToBoat: (
    date: string,
    program: Program,
    van: number,
    boat: BoatNumber | null,
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
  setVanMeta: (date: string, program: Program, van: number, meta: Partial<VanMeta>) => void
  getFleetVan: (van: number) => FleetVan | null
  resolveVanMeta: (van: number, dayMeta?: VanMeta | null) => VanMeta & { fromFleet: boolean; incomplete: boolean }
  autoAssignDayVans: (date: string, program: Program) => void
  clearDayVanAssignments: (date: string, program: Program) => void
}

const PortalContext = createContext<PortalContextValue | null>(null)

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
  const [fleetVans, setFleetVans] = useState<FleetVan[]>([])
  const [bookingCutoffs, setBookingCutoffs] = useState<BookingCutoffSettings>(DEFAULT_BOOKING_CUTOFFS)
  const [bookingClosures, setBookingClosures] = useState<BookingClosure[]>([])
  const [bookingEventsByCode, setBookingEventsByCode] = useState<Record<string, BookingEvent[]>>({})

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
        setDayBoatPlans(snapshot.dayBoatPlans)
        setDayVehiclePlans(snapshot.dayVehiclePlans)
        setFleetVans(snapshot.fleetVans)
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

  /** Pull latest bookings when returning to the tab so agency cancels show as Cancelled. */
  useEffect(() => {
    if (!hydrated) return

    let busy = false
    async function refreshBookings() {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        const next = await fetchBookings()
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
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
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
      return {
        ...stored,
        capacities: normalizeBoatCapacities(stored.capacities),
      }
    }

    const upsertPlan = (
      date: string,
      program: Program,
      updater: (plan: DayBoatPlan) => DayBoatPlan,
    ) => {
      setDayBoatPlans((current) => {
        const key = dayBoatPlanKey(date, program)
        const base = current[key] ?? emptyDayBoatPlan(date, program)
        const next = updater(base)
        persistQuietly('saveDayBoatPlan', saveDayBoatPlan(next))
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

    const getFleetVan = (van: number) =>
      fleetVans.find((item) => item.vanNumber === van) ?? null

    const resolveVanMeta = (van: number, dayMeta?: VanMeta | null) => {
      const fleet = getFleetVan(van)
      const plate = dayMeta?.plate?.trim() || fleet?.plate?.trim() || ''
      const driver = dayMeta?.driver?.trim() || fleet?.driver?.trim() || ''
      const phone = dayMeta?.phone?.trim() || fleet?.phone?.trim() || ''
      return {
        plate,
        driver,
        phone,
        fromFleet: !dayMeta?.driver?.trim() && !dayMeta?.plate?.trim() && Boolean(fleet),
        incomplete: !driver.trim() || !plate.trim(),
      }
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
      bookingCutoffs,
      bookingClosures,
      getZoneTime,
      getCapacity,
      bookedPaxFor,
      getDayBoatPlan,
      getDayVehiclePlan,
      getFleetVan,
      resolveVanMeta,
      getBookingClosure,
      isProgramClosed,
      isBookingOpen: (travelDate) => isBookingOpenForDate(bookingCutoffs, travelDate),
      isCancelOpen: (travelDate) => isCancelOpenForDate(bookingCutoffs, travelDate),
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
          code,
          pickupTime,
          status: pending ? 'Pending Pickup Time' : 'Confirmed',
        }
        setBookings((current) => [booking, ...current])
        persistQuietly('insertBooking', insertBooking(booking))
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

        setBookings((current) =>
          current.map((booking) =>
            booking.code === code ? { ...booking, status: 'Cancelled' } : booking,
          ),
        )
        persistQuietly('updateBookingStatus', updateBookingStatus(code, 'Cancelled'))
        logBookingEvent(code, 'cancelled', `Cancelled · was ${existing.date}`, options?.actor)

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

        setBookings((current) =>
          current.map((booking) =>
            booking.code === code ? { ...booking, date: trimmedDate } : booking,
          ),
        )
        persistQuietly('updateBookingDate', updateBookingDate(code, trimmedDate))
        logBookingEvent(
          code,
          'date_changed',
          `Date changed ${oldDate} → ${trimmedDate}`,
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
        persistQuietly(
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
        }

        const noTransfer = isNoTransfer(next.pickupZone)
        if (noTransfer) {
          next.pickupHotel = ''
          next.roomNumber = ''
          next.pickupTime = NO_TRANSFER_TIME
          next.transferExtraCharge = ''
          next.status = 'Confirmed'
        } else {
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
            next.pickupZone !== existing.pickupZone
          const pending = zone?.pending ?? next.pickupZone === 'Other'
          if (awaiting || next.pickupZone !== existing.pickupZone) {
            next.pickupTime = pending
              ? 'Awaiting pickup time'
              : getZoneTime(next.pickupZone)
          }
          next.status = pending ? 'Pending Pickup Time' : 'Confirmed'
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
        if (newPax !== oldPax) changes.push(`pax ${oldPax}→${newPax}`)
        if (next.pickupZone !== existing.pickupZone) {
          changes.push(
            isNoTransfer(next.pickupZone)
              ? 'no transfer'
              : isNoTransfer(existing.pickupZone)
                ? 'add transfer'
                : 'pickup zone',
          )
        }
        if (next.pickupHotel !== existing.pickupHotel) changes.push('hotel')
        if (next.roomNumber !== existing.roomNumber) changes.push('room')
        if (next.note !== existing.note) changes.push('note')
        if (next.cashOnTour !== existing.cashOnTour) changes.push('cash on tour')
        if (next.agentRef !== existing.agentRef) changes.push('voucher number')
        if (next.parkFee !== existing.parkFee) changes.push('park fee')
        if (next.canoe !== existing.canoe) changes.push('canoe')
        if (changes.length === 0) return { ok: false, error: 'No changes to save.' }

        setBookings((current) =>
          current.map((booking) => (booking.code === code ? next : booking)),
        )
        persistQuietly('updateBookingDetails', updateBookingDetails(next))
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
        const trimmed = pickupTime.trim()
        if (!trimmed) return { ok: false, error: 'Enter a pickup time.' }

        setBookings((current) =>
          current.map((booking) =>
            booking.code === code
              ? { ...booking, pickupTime: trimmed, status: 'Confirmed' }
              : booking,
          ),
        )
        persistQuietly(
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
      assignBookingToBoat: (date, program, bookingCode, boat) => {
        upsertPlan(date, program, (plan) => {
          const assignments = { ...plan.assignments }
          if (boat === null) delete assignments[bookingCode]
          else assignments[bookingCode] = boat
          return { ...plan, assignments }
        })
      },
      setBoatCapacity: (date, program, boat, capacity) => {
        upsertPlan(date, program, (plan) => {
          const capacities = normalizeBoatCapacities(plan.capacities)
          const index = boat - 1
          if (index < 0 || index >= capacities.length) return plan
          capacities[index] = Math.max(1, Math.floor(capacity) || 1)
          return { ...plan, capacities }
        })
      },
      addDayBoat: (date, program, capacity) => {
        upsertPlan(date, program, (plan) => {
          const capacities = normalizeBoatCapacities(plan.capacities)
          if (capacities.length >= MAX_DAY_BOATS) return plan
          const nextCap = Math.max(
            1,
            Math.floor(capacity ?? DEFAULT_BOAT_CAPACITY) || DEFAULT_BOAT_CAPACITY,
          )
          return { ...plan, capacities: [...capacities, nextCap] }
        })
      },
      removeDayBoat: (date, program, boat) => {
        upsertPlan(date, program, (plan) => {
          const capacities = normalizeBoatCapacities(plan.capacities)
          if (capacities.length <= 1) return plan
          const index = boat - 1
          if (index < 0 || index >= capacities.length) return plan
          const nextCaps = capacities.filter((_, i) => i !== index)
          const assignments: Record<string, BoatNumber> = {}
          for (const [code, assigned] of Object.entries(plan.assignments)) {
            if (assigned === boat) continue
            if (assigned > boat) assignments[code] = assigned - 1
            else assignments[code] = assigned
          }
          return { ...plan, capacities: nextCaps, assignments }
        })
      },
      resetDayBoatCapacities: (date, program) => {
        upsertPlan(date, program, (plan) => {
          const capacities = normalizeBoatCapacities(plan.capacities).map(
            () => DEFAULT_BOAT_CAPACITY,
          )
          return { ...plan, capacities }
        })
      },
      resetDayBoatFleet: (date, program) => {
        upsertPlan(date, program, (plan) => {
          const capacities = defaultBoatCapacities()
          const assignments: Record<string, BoatNumber> = {}
          for (const [code, assigned] of Object.entries(plan.assignments)) {
            if (assigned >= 1 && assigned <= capacities.length) {
              assignments[code] = assigned
            }
          }
          return { ...plan, capacities, assignments }
        })
      },
      autoAssignDayBoats: (date, program) => {
        const dayBookings = activeDayBookings(date, program)
        const vehiclePlan = getDayVehiclePlan(date, program)
        upsertPlan(date, program, (plan) => ({
          ...plan,
          capacities: normalizeBoatCapacities(plan.capacities),
          assignments: autoAssignBoats(dayBookings, plan.capacities, vehiclePlan.assignments),
        }))
      },
      clearDayBoatAssignments: (date, program) => {
        upsertPlan(date, program, (plan) => ({ ...plan, assignments: {} }))
      },
      assignVanToBoat: (date, program, van, boat) => {
        const vehiclePlan = getDayVehiclePlan(date, program)
        const codes = activeDayBookings(date, program)
          .filter((booking) => paxOnVan(vehiclePlan.assignments[booking.code], van) > 0)
          .map((booking) => booking.code)
        if (codes.length === 0) return
        upsertPlan(date, program, (plan) => {
          const assignments = { ...plan.assignments }
          for (const code of codes) {
            if (boat === null) delete assignments[code]
            else assignments[code] = boat
          }
          return { ...plan, assignments }
        })
      },
      assignBookingToVan: (date, program, bookingCode, van) => {
        const booking = bookings.find((item) => item.code === bookingCode && isActiveBooking(item))
        const pax = booking ? totalPassengers(booking) : 0
        upsertVehiclePlan(date, program, (plan) => {
          const assignments = { ...plan.assignments }
          if (van === null) delete assignments[bookingCode]
          else {
            assignments[bookingCode] = [
              { van, pax, sortOrder: nextSortOrderForVan(assignments, van) },
            ]
          }
          return { ...plan, assignments }
        })
      },
      assignBookingsToVan: (date, program, bookingCodes, van) => {
        if (bookingCodes.length === 0) return
        const paxByCode = new Map<string, number>()
        for (const code of bookingCodes) {
          const booking = bookings.find((item) => item.code === code && isActiveBooking(item))
          if (booking) paxByCode.set(code, totalPassengers(booking))
        }
        upsertVehiclePlan(date, program, (plan) => {
          const assignments = { ...plan.assignments }
          for (const code of bookingCodes) {
            if (van === null) {
              delete assignments[code]
              continue
            }
            const pax = paxByCode.get(code)
            if (pax === undefined) continue
            assignments[code] = [
              { van, pax, sortOrder: nextSortOrderForVan(assignments, van) },
            ]
          }
          return { ...plan, assignments }
        })
      },
      setBookingVanSplits: (date, program, bookingCode, legs) => {
        upsertVehiclePlan(date, program, (plan) => {
          const cleaned = legs
            .map((leg) => ({
              van: Math.max(1, Math.floor(Number(leg.van) || 0)),
              pax: Math.max(0, Math.floor(Number(leg.pax) || 0)),
              sortOrder:
                typeof leg.sortOrder === 'number' && Number.isFinite(leg.sortOrder)
                  ? leg.sortOrder
                  : nextSortOrderForVan(plan.assignments, Math.max(1, Math.floor(Number(leg.van) || 0))),
            }))
            .filter((leg) => leg.van > 0 && leg.pax > 0)
          const assignments = { ...plan.assignments }
          if (cleaned.length === 0) delete assignments[bookingCode]
          else assignments[bookingCode] = cleaned
          return { ...plan, assignments }
        })
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
        const fleet = fleetVans.find((item) => item.vanNumber === van)
        const next: VanMeta = {
          plate:
            meta.plate !== undefined
              ? meta.plate.trim()
              : prev.plate.trim() || fleet?.plate?.trim() || '',
          driver:
            meta.driver !== undefined
              ? meta.driver.trim()
              : prev.driver.trim() || fleet?.driver?.trim() || '',
          phone:
            meta.phone !== undefined
              ? meta.phone.trim()
              : prev.phone.trim() || fleet?.phone?.trim() || '',
        }

        upsertVehiclePlan(date, program, (current) => ({
          ...current,
          vanMeta: {
            ...current.vanMeta,
            [String(van)]: next,
          },
        }))

        const remembered: FleetVan = {
          vanNumber: van,
          plate: next.plate,
          driver: next.driver,
          phone: next.phone,
        }
        setFleetVans((current) => {
          const without = current.filter((item) => item.vanNumber !== van)
          return [...without, remembered].sort((a, b) => a.vanNumber - b.vanNumber)
        })
        persistQuietly('upsertFleetVan', upsertFleetVan(remembered))
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
          vanMeta: {},
        }))
      },
    }
  }, [agents, bookings, zones, hotels, availability, dayBoatPlans, dayVehiclePlans, fleetVans, bookingCutoffs, bookingClosures, bookingEventsByCode, hydrated, loadError])

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortal() {
  const context = useContext(PortalContext)
  if (!context) {
    throw new Error('usePortal must be used within PortalProvider')
  }
  return context
}
