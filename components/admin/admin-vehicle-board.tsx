'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Bus, CalendarIcon, GripVertical, Plus, Search, Sparkles, SplitSquareVertical, Trash2 } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatLongDate, formatShortDate, toISODate } from '@/lib/format'
import { usePortalDefaultDateISO } from '@/lib/use-portal-today'
import {
  DEFAULT_BOAT_CAPACITY,
  DEFAULT_VAN_CAPACITY,
  boatNumbersForPlan,
  emptyVanMeta,
  formatPaxBreakdown,
  isActiveBooking,
  isNoTransfer,
  totalPassengers,
  type BoatNumber,
  type Booking,
  type DayBoatPlan,
  type DayVehiclePlan,
  type Program,
  type VanSplit,
} from '@/lib/types'
import {
  formatVanLegs,
  listVanNumbers,
  paxOnVan,
  primaryVan,
  sortOrderOnVan,
  suggestVanSplit,
} from '@/lib/vehicle-assign'
import { cn } from '@/lib/utils'

export function VehicleDailyBoard({ onBack }: { onBack: () => void }) {
  const {
    bookings,
    getDayVehiclePlan,
    getDayBoatPlan,
    assignBookingToVan,
    assignBookingsToVan,
    assignVanToBoat,
    autoAssignDayBoats,
    clearDayBoatAssignments,
    setBookingVanSplits,
    setVanMeta,
    reorderVanBookings,
    autoAssignDayVans,
    clearDayVanAssignments,
  } = usePortal()

  const [selectedDate, setSelectedDate] = usePortalDefaultDateISO()
  const [program, setProgram] = useState<Program | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const selectedDateObj = new Date(`${selectedDate}T12:00:00`)

  const dayBookings = useMemo(
    () =>
      bookings
        .filter((booking) => booking.date === selectedDate && isActiveBooking(booking))
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code)),
    [bookings, selectedDate],
  )

  const programBookings = useMemo(() => {
    if (!program) return []
    return dayBookings.filter(
      (booking) => booking.program === program && !isNoTransfer(booking.pickupZone),
    )
  }, [dayBookings, program])

  const noTransferBookings = useMemo(() => {
    if (!program) return []
    return dayBookings.filter(
      (booking) => booking.program === program && isNoTransfer(booking.pickupZone),
    )
  }, [dayBookings, program])

  const plan = program ? getDayVehiclePlan(selectedDate, program) : null
  const boatPlan = program ? getDayBoatPlan(selectedDate, program) : null

  const ppDay = dayBookings.filter((b) => b.program === 'PP')
  const jbDay = dayBookings.filter((b) => b.program === 'James Bond')
  const ppPax = ppDay.reduce((sum, b) => sum + totalPassengers(b), 0)
  const jbPax = jbDay.reduce((sum, b) => sum + totalPassengers(b), 0)

  function selectDate(date: Date | undefined) {
    if (!date) return
    setSelectedDate(toISODate(date))
    setProgram(null)
    setCalendarOpen(false)
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="print:hidden">
        <div className="mb-4">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            Daily Board
          </Button>
        </div>
        <PageHeader
          title="Arrange vehicles"
          description="Step 1 — assign vans. Step 2 — put each van on a boat (default 44 pax). Same-van guests stay together."
          actions={
            program ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => clearDayVanAssignments(selectedDate, program)}
                >
                  Clear vans
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => autoAssignDayVans(selectedDate, program)}
                >
                  <Sparkles data-icon="inline-start" />
                  Auto-assign by AI
                </Button>
              </div>
            ) : null
          }
        />
      </div>

      {program ? (
        <div className="mb-4 print:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setProgram(null)}
          >
            <ArrowLeft className="size-3.5" />
            Choose program
          </Button>
        </div>
      ) : null}

      {!program ? (
        <>
          <Surface className="mb-4 p-5 print:hidden">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-teal-700/55 uppercase">
                  Departure date
                </p>
                <p className="mt-1 font-display text-2xl font-semibold text-teal-950">
                  {formatLongDate(selectedDate)}
                </p>
                <p className="mt-1.5 text-base text-teal-900/55">
                  {dayBookings.length} booking{dayBookings.length === 1 ? '' : 's'} ·{' '}
                  {ppPax + jbPax} pax total
                </p>
              </div>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className="h-11 justify-start gap-2 border-teal-700/40 bg-teal-50 text-base font-normal text-teal-950"
                    />
                  }
                >
                  <CalendarIcon className="size-4 text-neutral-400" />
                  <span>{formatShortDate(selectedDate)}</span>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-2">
                  <Calendar
                    mode="single"
                    selected={selectedDateObj}
                    onSelect={selectDate}
                    defaultMonth={selectedDateObj}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </Surface>

          <div className="grid gap-4 sm:grid-cols-2 print:hidden">
            <ProgramPickCard
              title="PP"
              subtitle="Phi Phi Islands"
              bookings={ppDay.length}
              pax={ppPax}
              onClick={() => setProgram('PP')}
            />
            <ProgramPickCard
              title="James Bond"
              subtitle="Phang Nga Bay"
              bookings={jbDay.length}
              pax={jbPax}
              onClick={() => setProgram('James Bond')}
            />
          </div>
        </>
      ) : null}

      {program && plan && boatPlan ? (
        <VehicleBoard
          date={selectedDate}
          program={program}
          bookings={programBookings}
          noTransferBookings={noTransferBookings}
          plan={plan}
          boatPlan={boatPlan}
          onAssign={(code, van) => assignBookingToVan(selectedDate, program, code, van)}
          onAssignMany={(codes, van) =>
            assignBookingsToVan(selectedDate, program, codes, van)
          }
          onAssignVanToBoat={(van, boat) =>
            assignVanToBoat(selectedDate, program, van, boat)
          }
          onAutoAssignBoats={() => autoAssignDayBoats(selectedDate, program)}
          onClearBoats={() => clearDayBoatAssignments(selectedDate, program)}
          onSaveSplits={(code, legs) => setBookingVanSplits(selectedDate, program, code, legs)}
          onVanMeta={(van, meta) => setVanMeta(selectedDate, program, van, meta)}
          onReorderVan={(van, orderedCodes) =>
            reorderVanBookings(selectedDate, program, van, orderedCodes)
          }
          onAutoAssign={() => autoAssignDayVans(selectedDate, program)}
          onClear={() => clearDayVanAssignments(selectedDate, program)}
        />
      ) : null}
    </div>
  )
}

function ProgramPickCard({
  title,
  subtitle,
  bookings,
  pax,
  onClick,
}: {
  title: string
  subtitle: string
  bookings: number
  pax: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-teal-900/8 bg-white/90 p-6 text-left shadow-[0_12px_40px_-28px_rgba(15,118,110,0.35)] transition-colors hover:border-teal-700/30 hover:bg-teal-50/40 sm:p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-3xl font-semibold text-teal-950">{title}</p>
          <p className="mt-1.5 text-base text-teal-900/55">{subtitle}</p>
        </div>
        <Bus className="size-6 text-teal-700/40" />
      </div>
      <div className="mt-7 flex gap-8">
        <div>
          <p className="text-xs font-medium tracking-wide text-teal-700/50 uppercase">
            Bookings
          </p>
          <p className="mt-1 font-display text-3xl font-semibold text-teal-950">{bookings}</p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-teal-700/50 uppercase">Pax</p>
          <p className="mt-1 font-display text-3xl font-semibold text-teal-950">{pax}</p>
        </div>
      </div>
      <p className="mt-5 text-base font-medium text-teal-800">Manage vehicles →</p>
    </button>
  )
}

function VehicleBoard({
  date,
  program,
  bookings,
  noTransferBookings = [],
  plan,
  boatPlan,
  onAssign,
  onAssignMany,
  onAssignVanToBoat,
  onAutoAssignBoats,
  onClearBoats,
  onSaveSplits,
  onVanMeta,
  onReorderVan,
  onAutoAssign,
  onClear,
}: {
  date: string
  program: Program
  bookings: Booking[]
  noTransferBookings?: Booking[]
  plan: DayVehiclePlan
  boatPlan: DayBoatPlan
  onAssign: (code: string, van: number | null) => void
  onAssignMany: (codes: string[], van: number | null) => void
  onAssignVanToBoat: (van: number, boat: BoatNumber | null) => void
  onAutoAssignBoats: () => void
  onClearBoats: () => void
  onSaveSplits: (code: string, legs: VanSplit[]) => void
  onVanMeta: (van: number, meta: { plate?: string; driver?: string; phone?: string }) => void
  onReorderVan: (van: number, orderedCodes: string[]) => void
  onAutoAssign: () => void
  onClear: () => void
}) {
  const { resolveVanMeta } = usePortal()
  const [openVan, setOpenVan] = useState<number | null>(null)
  const [splitCode, setSplitCode] = useState<string | null>(null)
  const [sheetQuery, setSheetQuery] = useState('')
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => new Set())
  const [bulkVan, setBulkVan] = useState('')
  const [dragCode, setDragCode] = useState<string | null>(null)
  const [dragOverCode, setDragOverCode] = useState<string | null>(null)
  const capacity = plan.vanCapacity || DEFAULT_VAN_CAPACITY
  const vanNumbers = listVanNumbers(plan.assignments)
  const maxVan = vanNumbers.length > 0 ? Math.max(...vanNumbers) : 0
  const vanOptions = Array.from({ length: Math.max(maxVan + 1, 1) }, (_, i) => i + 1)

  useEffect(() => {
    setSheetQuery('')
    setSelectedCodes(new Set())
    setBulkVan('')
  }, [date, program])

  const sorted = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const needsA = totalPassengers(a) > capacity && (plan.assignments[a.code]?.length ?? 0) <= 1 ? 0 : 1
      const needsB = totalPassengers(b) > capacity && (plan.assignments[b.code]?.length ?? 0) <= 1 ? 0 : 1
      const vanA = primaryVan(plan.assignments[a.code]) ?? 9999
      const vanB = primaryVan(plan.assignments[b.code]) ?? 9999
      return (
        needsA - needsB ||
        a.pickupZone.localeCompare(b.pickupZone) ||
        a.pickupTime.localeCompare(b.pickupTime) ||
        vanA - vanB ||
        a.pickupHotel.localeCompare(b.pickupHotel) ||
        a.code.localeCompare(b.code)
      )
    })
  }, [bookings, plan.assignments, capacity])

  const sheetRows = useMemo(() => {
    const q = sheetQuery.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((booking) => {
      const haystack = [
        booking.code,
        booking.leadGuest,
        booking.agentName,
        booking.agentRef,
        booking.pickupHotel,
        booking.pickupZone,
        booking.roomNumber,
        booking.note,
        booking.pickupTime,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [sorted, sheetQuery])

  const selectableSheetRows = useMemo(
    () =>
      sheetRows.filter((booking) => {
        const pax = totalPassengers(booking)
        const legs = plan.assignments[booking.code]
        const needsSplit = pax > capacity && (legs?.length ?? 0) <= 1
        return !needsSplit
      }),
    [sheetRows, plan.assignments, capacity],
  )

  const selectedList = useMemo(
    () => [...selectedCodes].filter((code) => selectableSheetRows.some((b) => b.code === code)),
    [selectedCodes, selectableSheetRows],
  )
  const selectedPax = useMemo(() => {
    return selectedList.reduce((sum, code) => {
      const booking = bookings.find((b) => b.code === code)
      return sum + (booking ? totalPassengers(booking) : 0)
    }, 0)
  }, [selectedList, bookings])

  const allVisibleSelected =
    selectableSheetRows.length > 0 &&
    selectableSheetRows.every((booking) => selectedCodes.has(booking.code))

  function toggleCode(code: string) {
    setSelectedCodes((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function toggleSelectAllVisible() {
    setSelectedCodes((current) => {
      if (allVisibleSelected) {
        const next = new Set(current)
        for (const booking of selectableSheetRows) next.delete(booking.code)
        return next
      }
      const next = new Set(current)
      for (const booking of selectableSheetRows) next.add(booking.code)
      return next
    })
  }

  function applyBulkVan(van: number | null) {
    if (selectedList.length === 0) return
    onAssignMany(selectedList, van)
    setSelectedCodes(new Set())
    setBulkVan('')
  }

  const totalPax = bookings.reduce((sum, b) => sum + totalPassengers(b), 0)
  const assignedCount = bookings.filter((b) => (plan.assignments[b.code]?.length ?? 0) > 0).length
  const unassignedPax = bookings
    .filter((b) => !plan.assignments[b.code]?.length)
    .reduce((sum, b) => sum + totalPassengers(b), 0)
  const noTransferPax = noTransferBookings.reduce((sum, b) => sum + totalPassengers(b), 0)

  const needsSeparate = bookings.filter((booking) => {
    const pax = totalPassengers(booking)
    const legs = plan.assignments[booking.code]
    if (pax <= capacity) return false
    // Still needs admin split if unassigned or sitting on one overfull van
    return !legs?.length || legs.length === 1
  })

  const byVan = vanNumbers.map((van) => {
    const items = bookings
      .map((booking) => {
        const onThis = paxOnVan(plan.assignments[booking.code], van)
        if (onThis <= 0) return null
        return { booking, paxOnVan: onThis, legs: plan.assignments[booking.code] }
      })
      .filter((item): item is { booking: Booking; paxOnVan: number; legs: VanSplit[] } => item !== null)
      .sort(
        (a, b) =>
          sortOrderOnVan(a.legs, van) - sortOrderOnVan(b.legs, van) ||
          a.booking.pickupHotel.localeCompare(b.booking.pickupHotel) ||
          a.booking.code.localeCompare(b.booking.code),
      )
    const pax = items.reduce((sum, item) => sum + item.paxOnVan, 0)
    const zone =
      items.length > 0
        ? [...new Set(items.map((item) => item.booking.pickupZone))].join(', ')
        : '—'
    const boatVotes = new Map<BoatNumber, number>()
    for (const item of items) {
      const boat = boatPlan.assignments[item.booking.code]
      if (boat) boatVotes.set(boat, (boatVotes.get(boat) ?? 0) + 1)
    }
    let assignedBoat: BoatNumber | null = null
    if (boatVotes.size === 1) {
      assignedBoat = [...boatVotes.keys()][0]
    } else if (boatVotes.size > 1) {
      assignedBoat = null // mixed
    }
    const boatMixed = boatVotes.size > 1
    return { van, items, pax, zone, over: pax > capacity, assignedBoat, boatMixed }
  })

  const boatNumbers = boatNumbersForPlan(boatPlan)
  const byBoat = boatNumbers.map((boat) => {
    const capacityBoat = boatPlan.capacities[boat - 1] || DEFAULT_BOAT_CAPACITY
    const items = bookings.filter((booking) => boatPlan.assignments[booking.code] === boat)
    const pax = items.reduce((sum, b) => sum + totalPassengers(b), 0)
    return { boat, capacity: capacityBoat, items, pax, over: pax > capacityBoat }
  })
  const boatAssignedCount = bookings.filter((b) => boatPlan.assignments[b.code]).length
  const boatUnassignedPax = bookings
    .filter((b) => !boatPlan.assignments[b.code])
    .reduce((sum, b) => sum + totalPassengers(b), 0)

  const openDetail = openVan !== null ? byVan.find((item) => item.van === openVan) : null
  const openMeta =
    openVan !== null
      ? resolveVanMeta(openVan, plan.vanMeta[String(openVan)])
      : { ...emptyVanMeta(), fromFleet: false, incomplete: true }
  const splitBooking = splitCode
    ? (bookings.find((booking) => booking.code === splitCode) ?? null)
    : null

  return (
    <div>
      <Surface className="mb-5 p-5 print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-teal-700/55 uppercase">
              {formatLongDate(date)}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-teal-950">
              {program === 'PP' ? 'PP · Phi Phi Islands' : 'James Bond · Phang Nga Bay'}
            </h2>
            <p className="mt-1.5 text-base text-teal-900/55">
              {bookings.length} bookings · {totalPax} pax · {assignedCount} assigned · van ≤{' '}
              {capacity}
              {noTransferBookings.length > 0
                ? ` · ${noTransferBookings.length} no transfer (${noTransferPax} pax)`
                : ''}
            </p>
            <p className="mt-1 text-sm text-teal-900/45">
              Assign vans first, then tap a boat on each van card (or Auto-assign boats). Default
              fleet is 3 × {DEFAULT_BOAT_CAPACITY} pax — edit boats on Arrange boats.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:hidden">
            <Button type="button" variant="outline" onClick={onClear}>
              Clear
            </Button>
            <Button type="button" onClick={onAutoAssign}>
              <Sparkles data-icon="inline-start" />
              Auto-assign by AI
            </Button>
          </div>
        </div>
      </Surface>

      {needsSeparate.length > 0 ? (
        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 print:hidden sm:px-5">
          <p className="text-sm font-semibold text-amber-950">
            Needs Separate Van · {needsSeparate.length} booking
            {needsSeparate.length === 1 ? '' : 's'} over {capacity} pax
          </p>
          <p className="mt-1 text-sm text-amber-900/70">
            AI left these unassigned. Open Separate Van and choose how many guests go on each van.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {needsSeparate.map((booking) => (
              <Button
                key={booking.code}
                type="button"
                size="sm"
                className="h-8 bg-amber-800 text-white hover:bg-amber-900"
                onClick={() => setSplitCode(booking.code)}
              >
                <SplitSquareVertical data-icon="inline-start" />
                {booking.leadGuest} · {totalPassengers(booking)} pax
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {bookings.length === 0 ? (
        <Surface className="px-4 py-12 text-center text-base text-neutral-500 print:hidden">
          No bookings for this program on {formatShortDate(date)}.
        </Surface>
      ) : (
        <div className="flex flex-col gap-5 print:hidden">
          {byVan.length > 0 || unassignedPax > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {byVan.map(({ van, pax, zone, items, over, assignedBoat, boatMixed }) => (
                <div
                  key={van}
                  className={cn(
                    'rounded-2xl border bg-white/90 p-4 shadow-[0_12px_40px_-28px_rgba(15,118,110,0.35)]',
                    over ? 'border-amber-500/40' : 'border-teal-900/8',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenVan(van)}
                    className="w-full text-left transition-colors hover:opacity-90"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-teal-950">Van {van}</p>
                      <span
                        className={cn(
                          'rounded-lg px-2 py-0.5 text-xs font-semibold tabular-nums',
                          over ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-800',
                        )}
                      >
                        {pax}/{capacity}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-teal-900/55">{zone}</p>
                    <p className="mt-0.5 text-xs text-teal-900/40">
                      {items.length} booking{items.length === 1 ? '' : 's'} · Details →
                    </p>
                  </button>
                  <div className="mt-3 border-t border-teal-900/8 pt-3">
                    <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-teal-800/55 uppercase">
                      Put on boat
                      {assignedBoat ? ` · Boat ${assignedBoat}` : boatMixed ? ' · mixed' : ''}
                    </p>
                    <div
                      className={cn(
                        'grid gap-1.5',
                        boatNumbers.length <= 3 ? 'grid-cols-3' : 'grid-cols-4',
                      )}
                    >
                      {boatNumbers.map((boat) => (
                        <button
                          key={boat}
                          type="button"
                          onClick={() => onAssignVanToBoat(van, boat)}
                          className={cn(
                            'rounded-lg px-1.5 py-1.5 text-xs font-semibold transition-colors',
                            assignedBoat === boat && !boatMixed
                              ? 'bg-teal-800 text-white'
                              : 'bg-teal-50 text-teal-800 hover:bg-teal-100',
                          )}
                        >
                          {boat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {unassignedPax > 0 ? (
                <Surface className="border-dashed border-amber-300/60 bg-amber-50/40 p-4">
                  <p className="text-sm font-semibold text-teal-950">Unassigned vans</p>
                  <p className="mt-1 text-sm text-teal-900/55">{unassignedPax} pax waiting</p>
                </Surface>
              ) : null}
            </div>
          ) : null}

          {byVan.length > 0 || boatAssignedCount > 0 ? (
            <Surface className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.14em] text-teal-700/55 uppercase">
                    Step 2 · Boats
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-teal-950">
                    Assign vans to boats
                  </h3>
                  <p className="mt-1 text-sm text-teal-900/55">
                    Tap a boat number on each van above, or auto-assign so each van stays together.
                    Default {DEFAULT_BOAT_CAPACITY} pax per boat.
                    {noTransferBookings.length > 0
                      ? ` ${noTransferBookings.length} no-transfer booking${noTransferBookings.length === 1 ? '' : 's'} — use จัดการเรือ to place them freely.`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={onClearBoats}>
                    Clear boats
                  </Button>
                  <Button type="button" size="sm" onClick={onAutoAssignBoats}>
                    <Sparkles data-icon="inline-start" />
                    Auto-assign boats
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {byBoat.map(({ boat, capacity: boatCap, pax, items, over }) => (
                  <div
                    key={boat}
                    className={cn(
                      'rounded-xl border px-3 py-3',
                      over
                        ? 'border-amber-400 bg-amber-50/50'
                        : 'border-teal-900/8 bg-teal-950/[0.02]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-teal-950">Boat {boat}</p>
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums',
                          over ? 'bg-amber-100 text-amber-900' : 'bg-white text-teal-800',
                        )}
                      >
                        {pax}/{boatCap}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-teal-900/50">
                      {items.length} booking{items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                ))}
              </div>
              {boatUnassignedPax > 0 ? (
                <p className="mt-3 text-sm text-amber-900/80">
                  {boatUnassignedPax} pax not on a boat yet — assign remaining vans or use
                  Auto-assign boats.
                </p>
              ) : boatAssignedCount > 0 ? (
                <p className="mt-3 text-sm text-teal-800/70">All transfer bookings are on a boat.</p>
              ) : null}
            </Surface>
          ) : null}

          <Surface className="overflow-hidden">
            <div className="border-b border-teal-900/8 px-4 py-3 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-teal-950">Booking sheet</h3>
                  <p className="mt-0.5 text-sm text-teal-900/55">
                    Select several bookings, then assign them to one van together — or change van
                    one by one.
                  </p>
                </div>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-teal-900/35" />
                  <Input
                    value={sheetQuery}
                    onChange={(event) => setSheetQuery(event.target.value)}
                    placeholder="Search guest, agent, hotel…"
                    className="h-10 pl-9"
                    aria-label="Search bookings for this day"
                  />
                </div>
              </div>
              {sheetQuery.trim() ? (
                <p className="mt-2 text-xs text-teal-900/45">
                  Showing {sheetRows.length} of {sorted.length} on {formatShortDate(date)}
                </p>
              ) : null}
              {selectedList.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2 rounded-xl border border-teal-700/20 bg-teal-50/70 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-teal-950">
                    {selectedList.length} selected · {selectedPax} pax
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-sm text-teal-900/70">
                      <span className="whitespace-nowrap">Assign to van</span>
                      <select
                        value={bulkVan}
                        onChange={(event) => setBulkVan(event.target.value)}
                        className="h-8 w-[4.5rem] rounded-lg border border-teal-900/12 bg-white px-2 text-sm font-medium text-teal-950 outline-none focus:border-teal-700/40"
                        aria-label="Van for selected bookings"
                      >
                        <option value="">—</option>
                        {vanOptions.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8"
                      disabled={!bulkVan}
                      onClick={() => applyBulkVan(Number(bulkVan))}
                    >
                      Assign
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => applyBulkVan(null)}
                    >
                      Unassign
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setSelectedCodes(new Set())
                        setBulkVan('')
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow className="bg-teal-950/[0.03] hover:bg-teal-950/[0.03]">
                  <TableHead className="sticky left-0 z-10 w-10 bg-[#f7faf9] px-2">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-teal-900/25 accent-teal-700"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (!el) return
                        el.indeterminate =
                          selectedList.length > 0 && !allVisibleSelected
                      }}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all visible bookings"
                      disabled={selectableSheetRows.length === 0}
                    />
                  </TableHead>
                  <TableHead className="bg-[#f7faf9] px-2 font-semibold text-teal-900/70">
                    Code
                  </TableHead>
                  <TableHead className="px-2 font-semibold text-teal-900/70">Guest name</TableHead>
                  <TableHead className="px-2 font-semibold text-teal-900/70">Voucher number</TableHead>
                  <TableHead className="w-10 px-1 text-center font-semibold text-teal-900/70">
                    AD
                  </TableHead>
                  <TableHead className="w-10 px-1 text-center font-semibold text-teal-900/70">
                    CH
                  </TableHead>
                  <TableHead className="w-10 px-1 text-center font-semibold text-teal-900/70">
                    IF
                  </TableHead>
                  <TableHead className="w-10 px-1 text-center font-semibold text-teal-900/70">
                    TL
                  </TableHead>
                  <TableHead className="w-12 px-1 text-center font-semibold text-teal-900/70">
                    Tot
                  </TableHead>
                  <TableHead className="px-2 font-semibold text-teal-900/70">Zone</TableHead>
                  <TableHead className="px-2 font-semibold text-teal-900/70">Hotel</TableHead>
                  <TableHead className="px-2 font-semibold text-teal-900/70">Room</TableHead>
                  <TableHead className="px-2 font-semibold text-teal-900/70">Time</TableHead>
                  <TableHead className="px-2 font-semibold text-teal-900/70">Note</TableHead>
                  <TableHead className="sticky right-0 z-10 bg-[#f7faf9] px-2 font-semibold text-teal-900/70">
                    Van
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheetRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={15}
                      className="px-4 py-10 text-center text-sm text-teal-900/45"
                    >
                      No bookings match “{sheetQuery.trim()}” on this day.
                    </TableCell>
                  </TableRow>
                ) : null}
                {sheetRows.map((booking) => {
                  const legs = plan.assignments[booking.code]
                  const primary = primaryVan(legs)
                  const pax = totalPassengers(booking)
                  const oversized = pax > capacity
                  const split = (legs?.length ?? 0) > 1
                  const needsSplit = oversized && !split
                  const checked = selectedCodes.has(booking.code)
                  return (
                    <TableRow
                      key={booking.code}
                      className={cn(
                        'hover:bg-teal-50/40',
                        checked && 'bg-teal-50/80',
                        !legs?.length && !needsSplit && !checked && 'bg-amber-50/30',
                        needsSplit && 'bg-amber-100/80 ring-1 ring-inset ring-amber-300/70',
                      )}
                    >
                      <TableCell className="sticky left-0 z-10 bg-inherit px-2">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-teal-900/25 accent-teal-700"
                          checked={checked}
                          disabled={needsSplit}
                          onChange={() => toggleCode(booking.code)}
                          aria-label={`Select ${booking.leadGuest}`}
                          title={
                            needsSplit
                              ? 'Use Separate Van for oversized bookings'
                              : undefined
                          }
                        />
                      </TableCell>
                      <TableCell className="bg-inherit px-2 font-mono text-xs text-teal-900/70">
                        {booking.code}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 font-medium text-teal-950">
                        {booking.leadGuest}
                      </TableCell>
                      <TableCell className="max-w-[7rem] truncate px-2 font-mono text-xs text-teal-900/70">
                        {booking.agentRef?.trim() || '—'}
                      </TableCell>
                      <TableCell className="px-1 text-center tabular-nums text-teal-950">
                        {booking.adults}
                      </TableCell>
                      <TableCell className="px-1 text-center tabular-nums text-teal-950">
                        {booking.children}
                      </TableCell>
                      <TableCell className="px-1 text-center tabular-nums text-teal-950">
                        {booking.infants}
                      </TableCell>
                      <TableCell className="px-1 text-center tabular-nums text-teal-950">
                        {booking.tourLeaders}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'px-1 text-center font-semibold tabular-nums text-teal-950',
                          needsSplit && 'text-amber-900',
                        )}
                      >
                        {pax}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 text-teal-950">
                        {booking.pickupZone}
                      </TableCell>
                      <TableCell className="max-w-[9rem] truncate px-2 text-teal-900/80">
                        {booking.pickupHotel}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 tabular-nums text-teal-950">
                        {booking.roomNumber || '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 tabular-nums text-teal-950">
                        {booking.pickupTime}
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate px-2 text-teal-900/70">
                        {booking.note || '—'}
                      </TableCell>
                      <TableCell className="sticky right-0 z-10 bg-inherit px-2">
                        <div className="flex flex-col items-start gap-1.5">
                          {needsSplit ? (
                            <span className="rounded-md bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-950 uppercase">
                              Over {capacity} · split needed
                            </span>
                          ) : null}
                          {split ? (
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-semibold tracking-wide text-teal-800/70 uppercase">
                                Split
                              </p>
                              <p className="text-xs font-semibold leading-snug text-teal-800">
                                {formatVanLegs(legs)}
                              </p>
                            </div>
                          ) : !needsSplit ? (
                            <select
                              value={primary ?? ''}
                              onChange={(event) => {
                                const value = event.target.value
                                onAssign(booking.code, value === '' ? null : Number(value))
                              }}
                              className="h-8 w-[4.5rem] rounded-lg border border-teal-900/12 bg-white px-2 text-sm font-medium text-teal-950 outline-none focus:border-teal-700/40"
                              aria-label={`Assign van for ${booking.leadGuest}`}
                            >
                              <option value="">—</option>
                              {vanOptions.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          {oversized ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={cn(
                                'h-7 gap-1 px-2 text-[11px]',
                                needsSplit &&
                                  'border-amber-400 bg-amber-100 text-amber-950 hover:bg-amber-200',
                              )}
                              onClick={() => setSplitCode(booking.code)}
                            >
                              <SplitSquareVertical className="size-3" />
                              {split ? 'Edit split' : 'Separate Van'}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Surface>
        </div>
      )}

      <SeparateVanDialog
        booking={splitBooking}
        capacity={capacity}
        existingLegs={splitBooking ? plan.assignments[splitBooking.code] : undefined}
        nextVanHint={maxVan + 1}
        open={splitCode !== null}
        onOpenChange={(open) => {
          if (!open) setSplitCode(null)
        }}
        onSave={(legs) => {
          if (!splitBooking) return
          onSaveSplits(splitBooking.code, legs)
          setSplitCode(null)
        }}
      />

      <Dialog open={openVan !== null} onOpenChange={(open) => !open && setOpenVan(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" showCloseButton>
          {openDetail && openVan !== null ? (
            <div>
              <DialogHeader>
                <DialogTitle className="pr-8 font-display text-xl font-semibold text-teal-950">
                  Van {openVan} details
                </DialogTitle>
                <DialogDescription className="text-sm text-teal-900/55">
                  {formatLongDate(date)} · {program} · {openDetail.zone} · {openDetail.pax}/
                  {capacity} pax · {openDetail.items.length} booking
                  {openDetail.items.length === 1 ? '' : 's'}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`van-driver-${openVan}`}>Driver name</Label>
                  <Input
                    id={`van-driver-${openVan}`}
                    value={openMeta.driver}
                    onChange={(event) => onVanMeta(openVan, { driver: event.target.value })}
                    placeholder="e.g. Somchai"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`van-phone-${openVan}`}>Telephone</Label>
                  <Input
                    id={`van-phone-${openVan}`}
                    value={openMeta.phone}
                    onChange={(event) => onVanMeta(openVan, { phone: event.target.value })}
                    placeholder="e.g. 081-234-5678"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`van-plate-${openVan}`}>Plate number</Label>
                  <Input
                    id={`van-plate-${openVan}`}
                    value={openMeta.plate}
                    onChange={(event) => onVanMeta(openVan, { plate: event.target.value })}
                    placeholder="e.g. กข 1234"
                    className="h-10"
                  />
                </div>
              </div>
              {openMeta.fromFleet ? (
                <p className="mt-2 text-xs text-teal-800/55">
                  Prefilling from remembered Van {openVan} details. Changes save for this day and for next time.
                </p>
              ) : (
                <p className="mt-2 text-xs text-teal-800/55">
                  Saved for this day and remembered for the same van number next time.
                </p>
              )}

              <div className="mt-4 overflow-hidden rounded-xl border border-teal-900/8">
                <div className="flex items-center justify-between gap-2 border-b border-teal-900/8 bg-teal-950/[0.03] px-3 py-2">
                  <p className="text-xs font-medium text-teal-900/60">
                    Pickup order — drag rows to set hotel stop sequence
                  </p>
                </div>
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-teal-950/[0.02] text-teal-900/60">
                    <tr>
                      <th className="w-16 px-2 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Guest</th>
                      <th className="px-3 py-2 font-medium">VC No.</th>
                      <th className="px-3 py-2 font-medium">Pax</th>
                      <th className="px-3 py-2 font-medium">Hotel / room</th>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openDetail.items.map(({ booking, paxOnVan: legPax, legs }, index) => {
                      const codes = openDetail.items.map((item) => item.booking.code)
                      const isDragging = dragCode === booking.code
                      const isDragOver = dragOverCode === booking.code && dragCode !== booking.code

                      return (
                        <tr
                          key={booking.code}
                          draggable
                          onDragStart={(event) => {
                            setDragCode(booking.code)
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData('text/plain', booking.code)
                          }}
                          onDragOver={(event) => {
                            event.preventDefault()
                            event.dataTransfer.dropEffect = 'move'
                            if (dragOverCode !== booking.code) setDragOverCode(booking.code)
                          }}
                          onDragLeave={() => {
                            if (dragOverCode === booking.code) setDragOverCode(null)
                          }}
                          onDrop={(event) => {
                            event.preventDefault()
                            const fromCode = event.dataTransfer.getData('text/plain') || dragCode
                            setDragCode(null)
                            setDragOverCode(null)
                            if (!fromCode || fromCode === booking.code) return
                            const fromIndex = codes.indexOf(fromCode)
                            if (fromIndex < 0) return
                            const next = [...codes]
                            const [moved] = next.splice(fromIndex, 1)
                            next.splice(index, 0, moved!)
                            onReorderVan(openVan, next)
                          }}
                          onDragEnd={() => {
                            setDragCode(null)
                            setDragOverCode(null)
                          }}
                          className={cn(
                            'border-t border-teal-900/6 transition-colors',
                            isDragging && 'opacity-40',
                            isDragOver && 'bg-teal-50 ring-1 ring-inset ring-teal-600/30',
                          )}
                        >
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="flex size-8 cursor-grab items-center justify-center rounded-lg border border-teal-900/10 bg-white text-teal-800/45 active:cursor-grabbing"
                                title="Drag to reorder"
                                aria-hidden
                              >
                                <GripVertical className="size-4" />
                              </span>
                              <span className="w-5 text-center text-xs font-semibold tabular-nums text-teal-900/50">
                                {index + 1}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-teal-950">{booking.leadGuest}</p>
                            <p className="font-mono text-xs text-teal-900/45">{booking.code}</p>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-teal-900/70">
                            {booking.agentRef?.trim() || '—'}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-teal-950">
                            <span className="font-semibold">{legPax}</span>
                            {(legs?.length ?? 0) > 1 ? (
                              <span className="ml-1 text-xs text-teal-900/45">
                                / {totalPassengers(booking)} split
                              </span>
                            ) : null}
                            <p className="font-mono text-[11px] text-teal-900/40">
                              {formatPaxBreakdown(booking)}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-teal-900/80">
                            {booking.pickupHotel}
                            {booking.roomNumber ? ` · Rm ${booking.roomNumber}` : ''}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-teal-950">
                            {booking.pickupTime}
                          </td>
                          <td className="max-w-[10rem] truncate px-3 py-2 text-teal-900/55">
                            {booking.note || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setOpenVan(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          html, body {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden !important;
          }
          .van-print-sheet,
          .van-print-sheet * {
            visibility: visible !important;
          }
          .van-print-sheet {
            display: block !important;
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            right: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: 0 !important;
            z-index: 99999 !important;
          }
          .van-print-sheet table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }
        }
      `}</style>
    </div>
  )
}

function SeparateVanDialog({
  booking,
  capacity,
  existingLegs,
  nextVanHint,
  open,
  onOpenChange,
  onSave,
}: {
  booking: Booking | null
  capacity: number
  existingLegs?: VanSplit[]
  nextVanHint: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (legs: VanSplit[]) => void
}) {
  const total = booking ? totalPassengers(booking) : 0
  const bookingCode = booking?.code ?? null
  const [legs, setLegs] = useState<VanSplit[]>([])
  const [error, setError] = useState('')

  // Reset draft whenever dialog opens for a booking
  useEffect(() => {
    if (!open || !booking) return
    const start = Math.max(1, nextVanHint)
    const seed =
      existingLegs && existingLegs.length > 1
        ? existingLegs.map((leg) => ({ ...leg }))
        : suggestVanSplit(totalPassengers(booking), capacity, start)
    setLegs(seed)
    setError('')
  }, [open, booking, bookingCode, capacity, existingLegs, nextVanHint])

  const assigned = legs.reduce((sum, leg) => sum + (Number(leg.pax) || 0), 0)
  const remaining = total - assigned

  function updateLeg(index: number, patch: Partial<VanSplit>) {
    setLegs((current) =>
      current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)),
    )
    setError('')
  }

  function handleSave() {
    if (!booking) return
    const cleaned = legs
      .map((leg, index) => ({
        van: Math.max(1, Math.floor(Number(leg.van) || 0)),
        pax: Math.max(0, Math.floor(Number(leg.pax) || 0)),
        sortOrder: typeof leg.sortOrder === 'number' ? leg.sortOrder : index,
      }))
      .filter((leg) => leg.van > 0 && leg.pax > 0)

    const sum = cleaned.reduce((s, leg) => s + leg.pax, 0)
    if (cleaned.length < 2) {
      setError('Add at least two vans to separate this booking.')
      return
    }
    if (sum !== total) {
      setError(`Pax on vans must total ${total} (now ${sum}).`)
      return
    }
    onSave(cleaned)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        {booking ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8 font-display text-lg font-semibold text-teal-950">
                Separate Van
              </DialogTitle>
              <DialogDescription className="text-sm text-teal-900/55">
                {booking.leadGuest} · {booking.code} · {total} pax (over {capacity}). Choose how
                many guests go on each van.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-3">
              {legs.map((leg, index) => (
                <div
                  key={`leg-${index}`}
                  className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
                >
                  <div className="space-y-1">
                    <Label htmlFor={`split-van-${index}`}>Van #</Label>
                    <Input
                      id={`split-van-${index}`}
                      type="number"
                      min={1}
                      value={leg.van}
                      onChange={(event) =>
                        updateLeg(index, { van: Number(event.target.value) || 1 })
                      }
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`split-pax-${index}`}>Pax</Label>
                    <Input
                      id={`split-pax-${index}`}
                      type="number"
                      min={1}
                      value={leg.pax}
                      onChange={(event) =>
                        updateLeg(index, { pax: Number(event.target.value) || 0 })
                      }
                      className="h-10"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    disabled={legs.length <= 2}
                    onClick={() => setLegs((current) => current.filter((_, i) => i !== index))}
                    aria-label="Remove van leg"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  const used = new Set(legs.map((leg) => leg.van))
                  let van = Math.max(1, nextVanHint)
                  while (used.has(van)) van += 1
                  setLegs((current) => [
                    ...current,
                    { van, pax: Math.max(0, remaining) || 1, sortOrder: current.length },
                  ])
                  setError('')
                }}
              >
                <Plus data-icon="inline-start" />
                Add van
              </Button>

              <div
                className={cn(
                  'rounded-xl px-3 py-2 text-sm',
                  remaining === 0
                    ? 'bg-teal-50 text-teal-800'
                    : 'bg-amber-50 text-amber-900',
                )}
              >
                Assigned {assigned} / {total} pax
                {remaining === 0
                  ? ' · ready to save'
                  : remaining > 0
                    ? ` · ${remaining} still to place`
                    : ` · ${Math.abs(remaining)} over`}
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave}>
                Save split
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
