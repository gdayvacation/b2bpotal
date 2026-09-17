'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { nextBookingCode, uniqueAgentSlug } from '@/lib/format'
import { autoAssignBoats } from '@/lib/boat-assign'
import { autoAssignVans, normalizeAssignments } from '@/lib/vehicle-assign'
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
  deleteHotel,
  deleteZone,
  insertBooking,
  loadPortalSnapshot,
  persistQuietly,
  saveDayBoatPlan,
  saveDayVehiclePlan,
  updateBookingStatus,
  updateBookingsAgentName,
  upsertAgent,
  upsertAvailability,
  upsertAvailabilityRows,
  upsertBookingCutoffs,
  upsertHotel,
  upsertZone,
} from '@/lib/supabase/portal-db'
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
  PickupZoneName,
  Program,
  VanMeta,
  VanSplit,
} from '@/lib/types'
import { HOTEL_CATALOG } from '@/lib/hotel-catalog'
import {
  DEFAULT_JB_CAPACITY,
  DEFAULT_PP_CAPACITY,
  NO_TRANSFER_TIME,
  dayBoatPlanKey,
  dayVehiclePlanKey,
  emptyDayBoatPlan,
  emptyDayVehiclePlan,
  emptyVanMeta,
  isActiveBooking,
  isCorePickupZone,
  isNoTransfer,
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
  bookingCutoffs: BookingCutoffSettings
  updateBookingCutoffs: (patch: Partial<BookingCutoffSettings>) => void
  isBookingOpen: (travelDate: string) => boolean
  isCancelOpen: (travelDate: string) => boolean
  addBooking: (
    booking: Omit<Booking, 'code' | 'status' | 'pickupTime' | 'transferExtraCharge'> & {
      pickupTime?: string
      transferExtraCharge?: string
    },
    options?: { bypassCutoff?: boolean },
  ) => { ok: true; booking: Booking } | { ok: false; error: string }
  cancelBooking: (
    code: string,
    options?: { bypassCutoff?: boolean },
  ) => { ok: true } | { ok: false; error: string }
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
  addAgent: (name: string, country: string) => string | null
  updateAgent: (slug: string, name: string, country: string) => string | null
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
  autoAssignDayBoats: (date: string, program: Program) => void
  clearDayBoatAssignments: (date: string, program: Program) => void
  getDayVehiclePlan: (date: string, program: Program) => DayVehiclePlan
  assignBookingToVan: (
    date: string,
    program: Program,
    bookingCode: string,
    van: number | null,
  ) => void
  setBookingVanSplits: (
    date: string,
    program: Program,
    bookingCode: string,
    legs: VanSplit[],
  ) => void
  setVanMeta: (date: string, program: Program, van: number, meta: Partial<VanMeta>) => void
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
  const [bookingCutoffs, setBookingCutoffs] = useState<BookingCutoffSettings>(DEFAULT_BOOKING_CUTOFFS)

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
        setBookingCutoffs(snapshot.bookingCutoffs)
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

    const activeDayBookings = (date: string, program: Program) =>
      bookings.filter(
        (booking) =>
          isActiveBooking(booking) && booking.date === date && booking.program === program,
      )

    const getDayBoatPlan = (date: string, program: Program) => {
      const key = dayBoatPlanKey(date, program)
      return dayBoatPlans[key] ?? emptyDayBoatPlan(date, program)
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
      bookingCutoffs,
      getZoneTime,
      getCapacity,
      bookedPaxFor,
      getDayBoatPlan,
      getDayVehiclePlan,
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
      addBooking: (input, options) => {
        if (!options?.bypassCutoff && !isBookingOpenForDate(bookingCutoffs, input.date)) {
          return { ok: false, error: bookingClosedMessage(bookingCutoffs, input.date) }
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
          transferExtraCharge,
          code,
          pickupTime,
          status: pending ? 'Pending Pickup Time' : 'Confirmed',
        }
        setBookings((current) => [booking, ...current])
        persistQuietly('insertBooking', insertBooking(booking))
        return { ok: true, booking }
      },
      cancelBooking: (code, options) => {
        const existing = bookings.find((booking) => booking.code === code)
        if (!existing || existing.status === 'Cancelled') {
          return { ok: false, error: 'Booking not found or already cancelled.' }
        }
        if (!options?.bypassCutoff && !isCancelOpenForDate(bookingCutoffs, existing.date)) {
          return { ok: false, error: cancelClosedMessage(bookingCutoffs, existing.date) }
        }

        setBookings((current) =>
          current.map((booking) =>
            booking.code === code ? { ...booking, status: 'Cancelled' } : booking,
          ),
        )
        persistQuietly('updateBookingStatus', updateBookingStatus(code, 'Cancelled'))

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
      addAgent: (name, country) => {
        const trimmedName = name.trim().replace(/\s+/g, ' ')
        const trimmedCountry = country.trim().replace(/\s+/g, ' ')
        if (!trimmedName) return 'Enter an agent name.'
        if (!trimmedCountry) return 'Enter a country.'
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
          country: trimmedCountry,
          status: 'Active',
        }
        setAgents((current) => [...current, agent])
        persistQuietly('upsertAgent', upsertAgent(agent))
        return null
      },
      updateAgent: (slug, name, country) => {
        const trimmedName = name.trim().replace(/\s+/g, ' ')
        const trimmedCountry = country.trim().replace(/\s+/g, ' ')
        if (!trimmedName) return 'Enter an agent name.'
        if (!trimmedCountry) return 'Enter a country.'
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
          country: trimmedCountry,
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
          const capacities = [...plan.capacities] as DayBoatPlan['capacities']
          capacities[boat - 1] = Math.max(1, capacity)
          return { ...plan, capacities }
        })
      },
      autoAssignDayBoats: (date, program) => {
        const dayBookings = activeDayBookings(date, program)
        upsertPlan(date, program, (plan) => ({
          ...plan,
          assignments: autoAssignBoats(dayBookings, plan.capacities),
        }))
      },
      clearDayBoatAssignments: (date, program) => {
        upsertPlan(date, program, (plan) => ({ ...plan, assignments: {} }))
      },
      assignBookingToVan: (date, program, bookingCode, van) => {
        const booking = bookings.find((item) => item.code === bookingCode && isActiveBooking(item))
        const pax = booking ? totalPassengers(booking) : 0
        upsertVehiclePlan(date, program, (plan) => {
          const assignments = { ...plan.assignments }
          if (van === null) delete assignments[bookingCode]
          else assignments[bookingCode] = [{ van, pax }]
          return { ...plan, assignments }
        })
      },
      setBookingVanSplits: (date, program, bookingCode, legs) => {
        const cleaned = legs
          .map((leg) => ({
            van: Math.max(1, Math.floor(Number(leg.van) || 0)),
            pax: Math.max(0, Math.floor(Number(leg.pax) || 0)),
          }))
          .filter((leg) => leg.van > 0 && leg.pax > 0)
        upsertVehiclePlan(date, program, (plan) => {
          const assignments = { ...plan.assignments }
          if (cleaned.length === 0) delete assignments[bookingCode]
          else assignments[bookingCode] = cleaned
          return { ...plan, assignments }
        })
      },
      setVanMeta: (date, program, van, meta) => {
        upsertVehiclePlan(date, program, (plan) => {
          const key = String(van)
          const prev = plan.vanMeta[key] ?? emptyVanMeta()
          return {
            ...plan,
            vanMeta: {
              ...plan.vanMeta,
              [key]: { ...prev, ...meta },
            },
          }
        })
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
  }, [agents, bookings, zones, hotels, availability, dayBoatPlans, dayVehiclePlans, bookingCutoffs, hydrated, loadError])

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortal() {
  const context = useContext(PortalContext)
  if (!context) {
    throw new Error('usePortal must be used within PortalProvider')
  }
  return context
}
