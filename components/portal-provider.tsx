'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { nextBookingCode, uniqueAgentSlug } from '@/lib/format'
import { AGENTS, INITIAL_AVAILABILITY, INITIAL_BOOKINGS, INITIAL_ZONES, mergeBookings } from '@/lib/mock-data'
import { autoAssignBoats } from '@/lib/boat-assign'
import { autoAssignVans, normalizeAssignments } from '@/lib/vehicle-assign'
import type {
  Agent,
  AgentStatus,
  Availability,
  BoatNumber,
  Booking,
  DayBoatPlan,
  DayVehiclePlan,
  PickupZone,
  PickupZoneName,
  Program,
  VanMeta,
  VanSplit,
} from '@/lib/types'
import {
  DEFAULT_JB_CAPACITY,
  DEFAULT_PP_CAPACITY,
  dayBoatPlanKey,
  dayVehiclePlanKey,
  emptyDayBoatPlan,
  emptyDayVehiclePlan,
  emptyVanMeta,
  isCorePickupZone,
  totalPassengers,
} from '@/lib/types'

type PortalContextValue = {
  hydrated: boolean
  agents: Agent[]
  bookings: Booking[]
  zones: PickupZone[]
  availability: Availability[]
  dayBoatPlans: Record<string, DayBoatPlan>
  dayVehiclePlans: Record<string, DayVehiclePlan>
  addBooking: (booking: Omit<Booking, 'code' | 'status' | 'pickupTime'> & { pickupTime?: string }) => Booking
  updateZoneTime: (name: PickupZoneName, time: string) => void
  addZone: (name: string, time: string) => string | null
  removeZone: (name: PickupZoneName) => void
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

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [agents, setAgents] = useState(AGENTS)
  const [bookings, setBookings] = useState(INITIAL_BOOKINGS)
  const [zones, setZones] = useState(INITIAL_ZONES)
  const [availability, setAvailability] = useState(INITIAL_AVAILABILITY)
  const [dayBoatPlans, setDayBoatPlans] = useState<Record<string, DayBoatPlan>>({})
  const [dayVehiclePlans, setDayVehiclePlans] = useState<Record<string, DayVehiclePlan>>({})
  const mutated = useRef(false)

  useEffect(() => {
    if (!mutated.current) {
      setAgents(readStore('gday-agents', AGENTS))
      setBookings(mergeBookings(readStore('gday-bookings-v4', INITIAL_BOOKINGS), INITIAL_BOOKINGS))
      setZones(readStore('gday-zones', INITIAL_ZONES))
      setAvailability(readStore('gday-availability-v2', INITIAL_AVAILABILITY))
      setDayBoatPlans(readStore('gday-day-boat-plans-v2', {}))
      setDayVehiclePlans(readStore('gday-day-vehicle-plans-v3', {}))
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    sessionStorage.setItem('gday-agents', JSON.stringify(agents))
    sessionStorage.setItem('gday-bookings-v4', JSON.stringify(bookings))
    sessionStorage.setItem('gday-zones', JSON.stringify(zones))
    sessionStorage.setItem('gday-availability-v2', JSON.stringify(availability))
    sessionStorage.setItem('gday-day-boat-plans-v2', JSON.stringify(dayBoatPlans))
    sessionStorage.setItem('gday-day-vehicle-plans-v3', JSON.stringify(dayVehiclePlans))
  }, [agents, bookings, zones, availability, dayBoatPlans, dayVehiclePlans, hydrated])

  const value = useMemo<PortalContextValue>(() => {
    const getZoneTime = (name: PickupZoneName) =>
      zones.find((zone) => zone.name === name)?.time ?? 'Pending Confirmation'

    const getCapacity = (date: string) => {
      const row = availability.find((item) => item.date === date)
      return {
        ppCapacity: row?.ppCapacity ?? DEFAULT_PP_CAPACITY,
        jamesBondCapacity: row?.jamesBondCapacity ?? DEFAULT_JB_CAPACITY,
      }
    }

    const bookedPaxFor = (date: string, program: 'PP' | 'James Bond') =>
      bookings
        .filter((booking) => booking.date === date && booking.program === program)
        .reduce((sum, booking) => sum + totalPassengers(booking), 0)

    const getDayBoatPlan = (date: string, program: Program) => {
      const key = dayBoatPlanKey(date, program)
      return dayBoatPlans[key] ?? emptyDayBoatPlan(date, program)
    }

    const upsertPlan = (
      date: string,
      program: Program,
      updater: (plan: DayBoatPlan) => DayBoatPlan,
    ) => {
      mutated.current = true
      setDayBoatPlans((current) => {
        const key = dayBoatPlanKey(date, program)
        const base = current[key] ?? emptyDayBoatPlan(date, program)
        return { ...current, [key]: updater(base) }
      })
    }

    const getDayVehiclePlan = (date: string, program: Program) => {
      const key = dayVehiclePlanKey(date, program)
      const stored = dayVehiclePlans[key]
      if (!stored) return emptyDayVehiclePlan(date, program)
      const dayBookings = bookings.filter((b) => b.date === date && b.program === program)
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
      mutated.current = true
      setDayVehiclePlans((current) => {
        const key = dayVehiclePlanKey(date, program)
        const base = getDayVehiclePlan(date, program)
        // Prefer in-memory current if present so rapid updates don't race on stale closure
        const fromState = current[key]
        const resolved = fromState
          ? {
              ...emptyDayVehiclePlan(date, program),
              ...fromState,
              vanMeta: fromState.vanMeta ?? {},
              assignments: normalizeAssignments(
                fromState.assignments as unknown as Record<string, unknown>,
                bookings.filter((b) => b.date === date && b.program === program),
              ),
            }
          : base
        return { ...current, [key]: updater(resolved) }
      })
    }

    return {
      hydrated,
      agents,
      bookings,
      zones,
      availability,
      dayBoatPlans,
      dayVehiclePlans,
      getZoneTime,
      getCapacity,
      bookedPaxFor,
      getDayBoatPlan,
      getDayVehiclePlan,
      addBooking: (input) => {
        const code = nextBookingCode(
          input.program,
          input.date,
          bookings.map((booking) => booking.code),
        )
        const zone = zones.find((item) => item.name === input.pickupZone)
        const pending = zone?.pending ?? input.pickupZone === 'Other'
        const pickupTime =
          input.pickupTime ?? (pending ? 'Pending Confirmation' : getZoneTime(input.pickupZone))
        const booking: Booking = {
          ...input,
          agentRef: input.agentRef?.trim() ?? '',
          roomNumber: input.roomNumber?.trim() ?? '',
          note: input.note?.trim() ?? '',
          code,
          pickupTime,
          status: pending ? 'Pending Pickup Time' : 'Confirmed',
        }
        mutated.current = true
        setBookings((current) => [booking, ...current])
        return booking
      },
      updateZoneTime: (name, time) => {
        mutated.current = true
        setZones((current) =>
          current.map((zone) =>
            zone.name === name && !zone.pending ? { ...zone, time } : zone,
          ),
        )
      },
      addZone: (name, time) => {
        const trimmedName = name.trim().replace(/\s+/g, ' ')
        const trimmedTime = time.trim()
        if (!trimmedName) return 'Enter a zone name.'
        if (!trimmedTime) return 'Enter a pickup time.'
        const exists = zones.some(
          (zone) => zone.name.toLowerCase() === trimmedName.toLowerCase(),
        )
        if (exists) return 'This zone already exists.'
        mutated.current = true
        setZones((current) => {
          const nextZone: PickupZone = { name: trimmedName, time: trimmedTime, pending: false }
          const otherIndex = current.findIndex((zone) => zone.name === 'Other' || zone.pending)
          if (otherIndex === -1) return [...current, nextZone]
          return [...current.slice(0, otherIndex), nextZone, ...current.slice(otherIndex)]
        })
        return null
      },
      removeZone: (name) => {
        if (isCorePickupZone(name)) return
        mutated.current = true
        setZones((current) => current.filter((zone) => zone.name !== name))
      },
      setAgentStatus: (slug, status) => {
        mutated.current = true
        setAgents((current) =>
          current.map((agent) => (agent.slug === slug ? { ...agent, status } : agent)),
        )
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
        mutated.current = true
        setAgents((current) => [
          ...current,
          { slug, name: trimmedName, country: trimmedCountry, status: 'Active' },
        ])
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
        mutated.current = true
        setAgents((current) =>
          current.map((agent) =>
            agent.slug === slug
              ? { ...agent, name: trimmedName, country: trimmedCountry }
              : agent,
          ),
        )
        if (existing.name !== trimmedName) {
          setBookings((current) =>
            current.map((booking) =>
              booking.agentSlug === slug ? { ...booking, agentName: trimmedName } : booking,
            ),
          )
        }
        return null
      },
      removeAgent: (slug) => {
        mutated.current = true
        setAgents((current) => current.filter((agent) => agent.slug !== slug))
      },
      setCapacity: (date, program, capacity) => {
        mutated.current = true
        setAvailability((current) => {
          const existing = current.find((item) => item.date === date)
          const next: Availability = {
            date,
            ppCapacity: existing?.ppCapacity ?? DEFAULT_PP_CAPACITY,
            jamesBondCapacity: existing?.jamesBondCapacity ?? DEFAULT_JB_CAPACITY,
          }
          if (program === 'PP') next.ppCapacity = capacity
          else next.jamesBondCapacity = capacity
          if (existing) {
            return current.map((item) => (item.date === date ? next : item))
          }
          return [...current, next]
        })
      },
      setCapacityForDates: (dates, capacities) => {
        if (dates.length === 0) return
        if (capacities.ppCapacity === undefined && capacities.jamesBondCapacity === undefined) return
        mutated.current = true
        setAvailability((current) => {
          const byDate = new Map(current.map((item) => [item.date, item]))
          for (const date of dates) {
            const existing = byDate.get(date)
            byDate.set(date, {
              date,
              ppCapacity: capacities.ppCapacity ?? existing?.ppCapacity ?? DEFAULT_PP_CAPACITY,
              jamesBondCapacity:
                capacities.jamesBondCapacity ?? existing?.jamesBondCapacity ?? DEFAULT_JB_CAPACITY,
            })
          }
          return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
        })
      },
      nudgeCapacityForDates: (dates, program, delta) => {
        if (dates.length === 0 || delta === 0) return
        mutated.current = true
        setAvailability((current) => {
          const byDate = new Map(current.map((item) => [item.date, item]))
          for (const date of dates) {
            const existing = byDate.get(date)
            const pp = existing?.ppCapacity ?? DEFAULT_PP_CAPACITY
            const jb = existing?.jamesBondCapacity ?? DEFAULT_JB_CAPACITY
            byDate.set(date, {
              date,
              ppCapacity: program === 'PP' ? Math.max(0, pp + delta) : pp,
              jamesBondCapacity: program === 'James Bond' ? Math.max(0, jb + delta) : jb,
            })
          }
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
        const dayBookings = bookings.filter(
          (booking) => booking.date === date && booking.program === program,
        )
        upsertPlan(date, program, (plan) => ({
          ...plan,
          assignments: autoAssignBoats(dayBookings, plan.capacities),
        }))
      },
      clearDayBoatAssignments: (date, program) => {
        upsertPlan(date, program, (plan) => ({ ...plan, assignments: {} }))
      },
      assignBookingToVan: (date, program, bookingCode, van) => {
        const booking = bookings.find((item) => item.code === bookingCode)
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
        const dayBookings = bookings.filter(
          (booking) => booking.date === date && booking.program === program,
        )
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
  }, [agents, bookings, zones, availability, dayBoatPlans, dayVehiclePlans, hydrated])

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortal() {
  const context = useContext(PortalContext)
  if (!context) {
    throw new Error('usePortal must be used within PortalProvider')
  }
  return context
}
