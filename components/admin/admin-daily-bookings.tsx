'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Bus,
  CalendarIcon,
  Minus,
  Plus,
  Printer,
  Ship,
  Sparkles,
} from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { VehicleDailyBoard } from '@/components/admin/admin-vehicle-board'
import { StatusBadge } from '@/components/status-badge'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatLongDate, formatShortDate, toISODate } from '@/lib/format'
import { usePortalDefaultDateISO } from '@/lib/use-portal-today'
import {
  DEFAULT_BOAT_CAPACITY,
  MAX_DAY_BOATS,
  boatDisplayName,
  boatNumbersForPlan,
  isActiveBooking,
  isNoTransfer,
  totalPassengers,
  type BoatNumber,
  type Booking,
  type Program,
  type VanSplit,
} from '@/lib/types'
import { listVanNumbers, paxOnVan, primaryVan, sortOrderOnVan } from '@/lib/vehicle-assign'
import { cn } from '@/lib/utils'

type BoardMode = 'vehicles' | 'boats'

export function AdminDailyBookings() {
  const [boardMode, setBoardMode] = useState<BoardMode | null>(null)

  if (!boardMode) {
    return (
      <div className="w-full">
        <PageHeader
          title="Daily Board"
          description="Arrange vans first, then put each van’s guests onto the same boat. No-transfer bookings can go to any boat."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <ModeCard
            title="จัดการรถ"
            subtitle="Step 1 — assign transfer vans by zone and hotel. Finish vans before boats so boat auto-assign can keep van groups together."
            meta="By zone & hotel · first"
            icon={<Bus className="size-7" />}
            onClick={() => setBoardMode('vehicles')}
          />
          <ModeCard
            title="จัดการเรือ"
            subtitle="Step 2 — put each van on a boat so the group stays together. Place No Transfer guests on any boat."
            meta="By program · after vans"
            icon={<Ship className="size-7" />}
            onClick={() => setBoardMode('boats')}
          />
        </div>
      </div>
    )
  }

  if (boardMode === 'vehicles') {
    return <VehicleDailyBoard onBack={() => setBoardMode(null)} />
  }

  return <BoatDailyBoard onBack={() => setBoardMode(null)} />
}

function ModeCard({
  title,
  subtitle,
  meta,
  icon,
  onClick,
}: {
  title: string
  subtitle: string
  meta: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="gday-sheet rounded-[1.4rem] p-6 text-left transition-all hover:border-teal-700/25 hover:bg-white active:scale-[0.99] sm:p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-700 text-white shadow-sm shadow-teal-700/20">
          {icon}
        </div>
        <p className="rounded-lg bg-teal-950/[0.05] px-2.5 py-1 text-[11px] font-semibold text-teal-800/70">
          {meta}
        </p>
      </div>
      <p className="font-display mt-6 text-2xl font-semibold tracking-tight text-teal-950 sm:text-3xl">
        {title}
      </p>
      <p className="mt-2 text-base leading-relaxed text-teal-900/55">{subtitle}</p>
      <p className="mt-6 text-base font-semibold text-teal-800">Continue →</p>
    </button>
  )
}

function BoatDailyBoard({ onBack }: { onBack: () => void }) {
  const {
    bookings,
    getDayBoatPlan,
    getDayVehiclePlan,
    assignBookingToBoat,
    assignVanToBoat,
    setBoatCapacity,
    addDayBoat,
    removeDayBoat,
    resetDayBoatCapacities,
    resetDayBoatFleet,
    autoAssignDayBoats,
    clearDayBoatAssignments,
    resolveVanMeta,
    getCheckInAttendance,
    setBoatName,
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
    return dayBookings.filter((booking) => booking.program === program)
  }, [dayBookings, program])

  const plan = program ? getDayBoatPlan(selectedDate, program) : null
  const vehiclePlan = program ? getDayVehiclePlan(selectedDate, program) : null

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

  function handlePrint() {
    window.print()
  }

  return (
    <div className="w-full">
      <div className="print:hidden">
        <div className="mb-4">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            Daily Board
          </Button>
        </div>
        <PageHeader
          title="Arrange boats"
          description="Vans first, then boats — put each van on a boat so the whole group stays together. Place No Transfer guests on any boat."
          actions={
            program ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
                  <Printer data-icon="inline-start" />
                  Print
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => clearDayBoatAssignments(selectedDate, program)}
                >
                  Clear boats
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => autoAssignDayBoats(selectedDate, program)}
                >
                  <Sparkles data-icon="inline-start" />
                  Auto-assign by van
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
            <ProgramCard
              title="PP"
              subtitle="Phi Phi Islands"
              bookings={ppDay.length}
              pax={ppPax}
              onClick={() => setProgram('PP')}
            />
            <ProgramCard
              title="James Bond"
              subtitle="Phang Nga Bay"
              bookings={jbDay.length}
              pax={jbPax}
              onClick={() => setProgram('James Bond')}
            />
          </div>
        </>
      ) : null}

      {program && plan && vehiclePlan ? (
        <BoatBoard
          date={selectedDate}
          program={program}
          bookings={programBookings}
          plan={plan}
          vanAssignments={vehiclePlan.assignments}
          vanMeta={vehiclePlan.vanMeta}
          resolveVanMeta={resolveVanMeta}
          isNoShow={(code) => getCheckInAttendance(selectedDate, program, code) === 'no-show'}
          onAssignBooking={(code, boat) => assignBookingToBoat(selectedDate, program, code, boat)}
          onAssignVan={(van, boat) => assignVanToBoat(selectedDate, program, van, boat)}
          onCapacity={(boat, capacity) => setBoatCapacity(selectedDate, program, boat, capacity)}
          onRename={(boat, name) => setBoatName(selectedDate, program, boat, name)}
          onAddBoat={(capacity) => addDayBoat(selectedDate, program, capacity)}
          onRemoveBoat={(boat) => removeDayBoat(selectedDate, program, boat)}
          onResetCapacities={() => resetDayBoatCapacities(selectedDate, program)}
          onResetFleet={() => resetDayBoatFleet(selectedDate, program)}
          onAutoAssign={() => autoAssignDayBoats(selectedDate, program)}
          onClear={() => clearDayBoatAssignments(selectedDate, program)}
          onPrint={handlePrint}
        />
      ) : null}
    </div>
  )
}

function ProgramCard({
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
        <Ship className="size-6 text-teal-700/40" />
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
      <p className="mt-5 text-base font-medium text-teal-800">Manage boats →</p>
    </button>
  )
}

function BoatBoard({
  date,
  program,
  bookings,
  plan,
  vanAssignments,
  vanMeta,
  resolveVanMeta,
  isNoShow,
  onAssignBooking,
  onAssignVan,
  onCapacity,
  onRename,
  onAddBoat,
  onRemoveBoat,
  onResetCapacities,
  onResetFleet,
  onAutoAssign,
  onClear,
  onPrint,
}: {
  date: string
  program: Program
  bookings: Booking[]
  plan: ReturnType<ReturnType<typeof usePortal>['getDayBoatPlan']>
  vanAssignments: Record<string, VanSplit[]>
  vanMeta: Record<string, { plate: string; driver: string; phone: string }>
  resolveVanMeta: ReturnType<typeof usePortal>['resolveVanMeta']
  isNoShow: (bookingCode: string) => boolean
  onAssignBooking: (code: string, boat: BoatNumber | null) => void
  onAssignVan: (van: number, boat: BoatNumber | null) => void
  onCapacity: (boat: BoatNumber, capacity: number) => void
  onRename: (boat: BoatNumber, name: string) => void
  onAddBoat: (capacity?: number) => void
  onRemoveBoat: (boat: BoatNumber) => void
  onResetCapacities: () => void
  onResetFleet: () => void
  onAutoAssign: () => void
  onClear: () => void
  onPrint: () => void
}) {
  const [rentalCapacity, setRentalCapacity] = useState(60)
  const [selectedGuest, setSelectedGuest] = useState<Booking | null>(null)
  const [dragVan, setDragVan] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<'pool' | BoatNumber | null>(null)

  function clearDrag() {
    setDragVan(null)
    setDropTarget(null)
  }

  function handleVanDrop(target: 'pool' | BoatNumber) {
    if (dragVan === null) return
    onAssignVan(dragVan, target === 'pool' ? null : target)
    clearDrag()
  }

  const boatNumbers = boatNumbersForPlan(plan)
  const noShowBookings = bookings.filter((booking) => isNoShow(booking.code))
  const activeBookings = bookings.filter((booking) => !isNoShow(booking.code))
  const transferBookings = activeBookings.filter((b) => !isNoTransfer(b.pickupZone))
  const noTransferBookings = activeBookings.filter((b) => isNoTransfer(b.pickupZone))
  const noVanBookings = transferBookings.filter((b) => primaryVan(vanAssignments[b.code]) === null)

  const vanGroups = useMemo(() => {
    const vans = listVanNumbers(vanAssignments)
    return vans
      .map((van) => {
        const items = transferBookings
          .filter((booking) => paxOnVan(vanAssignments[booking.code], van) > 0)
          .sort(
            (a, b) =>
              sortOrderOnVan(vanAssignments[a.code], van) -
                sortOrderOnVan(vanAssignments[b.code], van) ||
              a.pickupTime.localeCompare(b.pickupTime) ||
              a.code.localeCompare(b.code),
          )
        const pax = items.reduce((sum, booking) => sum + totalPassengers(booking), 0)
        const zone =
          [...new Set(items.map((booking) => booking.pickupZone).filter(Boolean))].join(' · ') ||
          '—'
        const boatVotes = new Map<BoatNumber, number>()
        for (const booking of items) {
          const boat = plan.assignments[booking.code]
          if (boat) boatVotes.set(boat, (boatVotes.get(boat) ?? 0) + 1)
        }
        let assignedBoat: BoatNumber | null = null
        let boatMixed = false
        if (boatVotes.size === 1) assignedBoat = [...boatVotes.keys()][0]
        else if (boatVotes.size > 1) boatMixed = true
        const meta = resolveVanMeta(van, vanMeta[String(van)])
        return { van, items, pax, zone, assignedBoat, boatMixed, meta }
      })
      .filter((group) => group.items.length > 0)
      .sort((a, b) => a.van - b.van)
  }, [transferBookings, vanAssignments, plan.assignments, vanMeta, resolveVanMeta])

  const unassignedVans = vanGroups.filter((group) => group.assignedBoat === null && !group.boatMixed)
  const mixedVans = vanGroups.filter((group) => group.boatMixed)
  const assignedVansByBoat = (boat: BoatNumber) =>
    vanGroups.filter((group) => group.assignedBoat === boat)

  const noTransferUnassigned = noTransferBookings.filter((b) => !plan.assignments[b.code])
  const noTransferOnBoat = (boat: BoatNumber) =>
    noTransferBookings.filter((b) => plan.assignments[b.code] === boat)

  const totalPax = activeBookings.reduce((sum, b) => sum + totalPassengers(b), 0)
  const noShowPax = noShowBookings.reduce((sum, b) => sum + totalPassengers(b), 0)
  const totalSeats = plan.capacities.reduce((sum, cap) => sum + cap, 0)
  const canAddBoat = boatNumbers.length < MAX_DAY_BOATS
  const canRemoveBoat = boatNumbers.length > 1

  function boatLoad(boat: BoatNumber) {
    return activeBookings
      .filter((booking) => plan.assignments[booking.code] === boat)
      .reduce((sum, booking) => sum + totalPassengers(booking), 0)
  }

  return (
    <div>
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-semibold">
          Daily Board · Boats · {program} · {formatLongDate(date)}
        </h1>
        <p className="text-sm text-neutral-600">
          {bookings.length} bookings · {totalPax} pax · {boatNumbers.length} boats
        </p>
      </div>

      <Surface className="mb-5 p-5 print:hidden">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-teal-700/55 uppercase">
                {formatLongDate(date)}
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold text-teal-950">
                {program === 'PP' ? 'PP · Phi Phi Islands' : 'James Bond · Phang Nga Bay'}
              </h2>
              <p className="mt-1.5 text-base text-teal-900/55">
                {vanGroups.length} van{vanGroups.length === 1 ? '' : 's'} ·{' '}
                {noTransferBookings.length} no transfer · {totalPax} pax · {boatNumbers.length}{' '}
                boat{boatNumbers.length === 1 ? '' : 's'} ({totalSeats} seats)
                {noShowBookings.length > 0
                  ? ` · ${noShowBookings.length} no-show (${noShowPax} pax)`
                  : ''}
              </p>
              <p className="mt-1 text-sm text-teal-900/45">
                Pick a van and put it on a boat — everyone on that van stays together. Then place No
                Transfer guests on any boat.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="sm:hidden" onClick={onPrint}>
                <Printer data-icon="inline-start" />
                Print
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onClear}>
                Clear boats
              </Button>
              <Button type="button" size="sm" onClick={onAutoAssign}>
                <Sparkles data-icon="inline-start" />
                Auto-assign by van
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-teal-900/10 bg-teal-950/[0.03] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-teal-950">Day boat fleet</p>
                <p className="mt-0.5 text-xs text-teal-900/50">
                  Default 3 × {DEFAULT_BOAT_CAPACITY}. Add a rental boat with larger capacity when
                  needed.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canAddBoat}
                  onClick={() => onAddBoat(DEFAULT_BOAT_CAPACITY)}
                >
                  <Plus data-icon="inline-start" />
                  Add boat
                </Button>
                <div className="flex items-center gap-1.5 rounded-xl border border-teal-900/12 bg-white px-2 py-1">
                  <input
                    type="number"
                    min={1}
                    value={rentalCapacity}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      if (Number.isFinite(next)) setRentalCapacity(Math.max(1, next))
                    }}
                    className="h-7 w-14 border-0 bg-transparent text-center text-sm font-medium text-teal-950 outline-none"
                    aria-label="Rental boat capacity"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7"
                    disabled={!canAddBoat}
                    onClick={() => onAddBoat(rentalCapacity)}
                  >
                    Add rental
                  </Button>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={onResetCapacities}>
                  Reset capacities
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onResetFleet}>
                  Reset to 3 × {DEFAULT_BOAT_CAPACITY}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Surface>

      {bookings.length === 0 ? (
        <Surface className="px-4 py-12 text-center text-base text-neutral-500">
          No bookings for this program on {formatShortDate(date)}.
        </Surface>
      ) : (
        <div className="flex flex-col gap-5">
          {noShowBookings.length > 0 ? (
            <div className="rounded-2xl border border-orange-400/70 bg-orange-50 px-4 py-3 print:hidden sm:px-5">
              <p className="text-sm font-semibold text-orange-950">
                No show · {noShowBookings.length} guest
                {noShowBookings.length === 1 ? '' : 's'} ({noShowPax} pax) removed from boats
              </p>
              <p className="mt-1 text-sm text-orange-900/70">
                Marked on check-in — seats are free again. Do not put these guests back on a boat
                unless attendance is cleared.
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {noShowBookings.map((booking) => {
                  const van = primaryVan(vanAssignments[booking.code])
                  return (
                    <li
                      key={booking.code}
                      className="rounded-xl border border-orange-200/80 bg-white/80 px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-orange-950">{booking.leadGuest}</p>
                      <p className="mt-0.5 text-xs text-orange-900/60">
                        {booking.code} · {totalPassengers(booking)} pax
                        {van ? ` · Van ${van}` : isNoTransfer(booking.pickupZone) ? ' · No transfer' : ''}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {noVanBookings.length > 0 ? (
            <div className="rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 print:hidden sm:px-5">
              <p className="text-sm font-semibold text-amber-950">
                {noVanBookings.length} booking{noVanBookings.length === 1 ? '' : 's'} still need a
                van
              </p>
              <p className="mt-1 text-sm text-amber-900/70">
                Finish van arrange first, or place these guests on a boat one by one below.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {noVanBookings.map((booking) => (
                  <GuestBoatChip
                    key={booking.code}
                    booking={booking}
                    boatNumbers={boatNumbers}
                    assignedBoat={plan.assignments[booking.code] ?? null}
                    labelForBoat={(boat) => boatDisplayName(plan, boat)}
                    onAssign={(boat) => onAssignBooking(booking.code, boat)}
                    onOpen={() => setSelectedGuest(booking)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,22rem)_1fr]">
            <div className="flex flex-col gap-4 print:hidden">
              <Surface
                className={cn(
                  'overflow-hidden transition-colors',
                  dropTarget === 'pool' && dragVan !== null && 'ring-2 ring-teal-600/40',
                )}
                onDragOver={(event) => {
                  if (dragVan === null) return
                  event.preventDefault()
                  setDropTarget('pool')
                }}
                onDragLeave={() => {
                  if (dropTarget === 'pool') setDropTarget(null)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  handleVanDrop('pool')
                }}
              >
                <div className="border-b border-teal-900/8 px-4 py-3.5 sm:px-5">
                  <div className="flex items-center gap-2">
                    <Bus className="size-4 text-teal-700/50" />
                    <h3 className="text-base font-semibold text-teal-950">Unassigned vans</h3>
                  </div>
                  <p className="mt-0.5 text-sm text-teal-900/50">
                    {unassignedVans.length} van{unassignedVans.length === 1 ? '' : 's'} waiting · tap
                    a boat, or drag vans between boats
                  </p>
                </div>
                {unassignedVans.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-teal-900/45">
                    {vanGroups.length === 0
                      ? 'No vans assigned yet — arrange vans first.'
                      : 'All vans are on a boat.'}
                  </div>
                ) : (
                  <ul className="divide-y divide-teal-900/6">
                    {unassignedVans.map((group) => (
                      <li
                        key={group.van}
                        draggable
                        onDragStart={() => setDragVan(group.van)}
                        onDragEnd={clearDrag}
                        className={cn(
                          'cursor-grab px-4 py-4 active:cursor-grabbing sm:px-5',
                          dragVan === group.van && 'opacity-60',
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-base font-semibold text-teal-950">Van {group.van}</p>
                            <p className="mt-0.5 text-sm text-teal-900/55">
                              {group.zone} · {group.items.length} guest
                              {group.items.length === 1 ? '' : 's'} · {group.pax} pax
                            </p>
                            {group.meta.driver.trim() ? (
                              <p className="mt-0.5 text-xs text-teal-900/45">
                                {group.meta.driver}
                                {group.meta.plate.trim() ? ` · ${group.meta.plate}` : ''}
                              </p>
                            ) : null}
                          </div>
                          <span className="rounded-lg bg-teal-50 px-2.5 py-1 text-sm font-semibold tabular-nums text-teal-800">
                            {group.pax} pax
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {group.items.map((booking) => (
                            <li
                              key={booking.code}
                              className="truncate text-sm text-teal-900/70"
                              title={booking.leadGuest}
                            >
                              {booking.leadGuest}{' '}
                              <span className="tabular-nums text-teal-900/40">
                                · {totalPassengers(booking)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div
                          className={cn(
                            'mt-3 grid gap-1.5',
                            boatNumbers.length <= 3 ? 'grid-cols-3' : 'grid-cols-4',
                          )}
                        >
                          {boatNumbers.map((boat) => (
                            <button
                              key={boat}
                              type="button"
                              onClick={() => onAssignVan(group.van, boat)}
                              className="rounded-xl bg-teal-800 px-2 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-900"
                            >
                              {boatDisplayName(plan, boat)}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Surface>

              {mixedVans.length > 0 ? (
                <Surface className="overflow-hidden border-amber-300/50">
                  <div className="border-b border-amber-200/80 bg-amber-50/60 px-4 py-3 sm:px-5">
                    <h3 className="text-sm font-semibold text-amber-950">Mixed boat vans</h3>
                    <p className="mt-0.5 text-xs text-amber-900/65">
                      Guests on these vans are split across boats — reassign the whole van.
                    </p>
                  </div>
                  <ul className="divide-y divide-amber-100">
                    {mixedVans.map((group) => (
                      <li key={group.van} className="px-4 py-3 sm:px-5">
                        <p className="text-sm font-semibold text-teal-950">
                          Van {group.van} · {group.pax} pax
                        </p>
                        <div
                          className={cn(
                            'mt-2 grid gap-1.5',
                            boatNumbers.length <= 3 ? 'grid-cols-3' : 'grid-cols-4',
                          )}
                        >
                          {boatNumbers.map((boat) => (
                            <button
                              key={boat}
                              type="button"
                              onClick={() => onAssignVan(group.van, boat)}
                              className="rounded-lg bg-amber-800 px-2 py-1.5 text-xs font-semibold text-white hover:bg-amber-900"
                            >
                              {boatDisplayName(plan, boat)}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Surface>
              ) : null}

              <Surface className="overflow-hidden">
                <div className="border-b border-teal-900/8 px-4 py-3.5 sm:px-5">
                  <h3 className="text-base font-semibold text-teal-950">No transfer</h3>
                  <p className="mt-0.5 text-sm text-teal-900/50">
                    {noTransferUnassigned.length} waiting · place on any boat
                  </p>
                </div>
                {noTransferBookings.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-teal-900/45">
                    No No Transfer guests today.
                  </div>
                ) : noTransferUnassigned.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-teal-900/45">
                    All No Transfer guests are on a boat.
                  </div>
                ) : (
                  <ul className="divide-y divide-teal-900/6">
                    {noTransferUnassigned.map((booking) => (
                      <li key={booking.code} className="px-4 py-3.5 sm:px-5">
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedGuest(booking)}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-teal-950">{booking.leadGuest}</p>
                            <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                              No transfer
                            </span>
                            <span className="rounded-md bg-teal-800 px-2 py-0.5 text-xs font-semibold text-white">
                              {totalPassengers(booking)} pax
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-sm text-teal-900/50">
                            {booking.pickupHotel || '—'}
                          </p>
                        </button>
                        <div
                          className={cn(
                            'mt-2.5 grid gap-1.5',
                            boatNumbers.length <= 3 ? 'grid-cols-3' : 'grid-cols-4',
                          )}
                        >
                          {boatNumbers.map((boat) => (
                            <button
                              key={boat}
                              type="button"
                              onClick={() => onAssignBooking(booking.code, boat)}
                              className="rounded-xl bg-sky-700 px-2 py-2 text-xs font-semibold text-white hover:bg-sky-800"
                            >
                              {boatDisplayName(plan, boat)}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Surface>
            </div>

            <div
              className={cn(
                'grid gap-4',
                boatNumbers.length <= 2
                  ? 'lg:grid-cols-2'
                  : boatNumbers.length === 3
                    ? 'lg:grid-cols-3'
                    : 'lg:grid-cols-2 xl:grid-cols-4',
              )}
            >
              {boatNumbers.map((boat) => {
                const capacity = plan.capacities[boat - 1] ?? DEFAULT_BOAT_CAPACITY
                const loadPax = boatLoad(boat)
                const over = loadPax > capacity
                const vansHere = assignedVansByBoat(boat)
                const freeGuests = noTransferOnBoat(boat)
                const bookingCount =
                  vansHere.reduce((sum, group) => sum + group.items.length, 0) + freeGuests.length
                return (
                  <Surface
                    key={boat}
                    className={cn(
                      'flex min-h-0 flex-col overflow-hidden transition-colors',
                      over && 'border-amber-500/40',
                      dropTarget === boat && dragVan !== null && 'ring-2 ring-teal-600/50',
                    )}
                    onDragOver={(event) => {
                      if (dragVan === null) return
                      event.preventDefault()
                      setDropTarget(boat)
                    }}
                    onDragLeave={() => {
                      if (dropTarget === boat) setDropTarget(null)
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      handleVanDrop(boat)
                    }}
                  >
                    <div className="shrink-0 border-b border-teal-900/8 px-4 py-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <input
                            type="text"
                            value={plan.names?.[boat - 1] ?? ''}
                            placeholder={`Boat ${boat}`}
                            maxLength={40}
                            onChange={(event) => onRename(boat, event.target.value)}
                            className="h-8 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-1 text-lg font-semibold text-teal-950 outline-none placeholder:text-teal-950 focus:border-teal-900/15 focus:bg-white print:border-0"
                            aria-label={`Boat ${boat} name`}
                          />
                          <p className="px-1 text-[10px] font-medium tracking-wide text-teal-800/45 uppercase">
                            #{boat} · edit name
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={cn(
                              'rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums',
                              over ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-800',
                            )}
                          >
                            {loadPax}/{capacity}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-teal-800/60 hover:text-red-700 print:hidden"
                            disabled={!canRemoveBoat}
                            onClick={() => {
                              if (
                                bookingCount > 0 &&
                                !window.confirm(
                                  `Remove ${boatDisplayName(plan, boat)}? Assigned guests will become unassigned.`,
                                )
                              ) {
                                return
                              }
                              onRemoveBoat(boat)
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-teal-900/50">
                        {vansHere.length} van{vansHere.length === 1 ? '' : 's'}
                        {freeGuests.length > 0
                          ? ` · ${freeGuests.length} no transfer`
                          : ''}
                      </p>
                      <div className="mt-3 flex items-center gap-1.5 print:hidden">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8"
                          onClick={() => onCapacity(boat, capacity - 1)}
                          aria-label={`Decrease Boat ${boat} capacity`}
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        <input
                          type="number"
                          min={1}
                          value={capacity}
                          onChange={(event) => {
                            const next = Number(event.target.value)
                            if (Number.isFinite(next)) onCapacity(boat, next)
                          }}
                          className="h-8 w-14 rounded-lg border border-teal-900/12 bg-white px-2 text-center text-sm font-medium text-teal-950 outline-none focus:border-teal-700/40"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8"
                          onClick={() => onCapacity(boat, capacity + 1)}
                          aria-label={`Increase Boat ${boat} capacity`}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                        <span className="ml-1 text-sm text-teal-800/50">capacity</span>
                      </div>
                    </div>

                    {vansHere.length === 0 && freeGuests.length === 0 ? (
                      <div className="px-4 py-10 text-center text-sm text-teal-900/40">Empty</div>
                    ) : (
                      <div className="max-h-[min(40rem,70vh)] space-y-3 overflow-y-auto p-3">
                        {vansHere.map((group) => (
                          <div
                            key={group.van}
                            draggable
                            onDragStart={() => setDragVan(group.van)}
                            onDragEnd={clearDrag}
                            className={cn(
                              'cursor-grab rounded-xl border border-teal-900/10 bg-teal-50/40 p-3 active:cursor-grabbing',
                              dragVan === group.van && 'opacity-60',
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-teal-950">
                                  Van {group.van}
                                </p>
                                <p className="text-xs text-teal-900/50">
                                  {group.zone} · {group.pax} pax · drag to move
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs print:hidden"
                                onClick={() => onAssignVan(group.van, null)}
                              >
                                Unassign
                              </Button>
                            </div>
                            <ul className="mt-2 space-y-0.5">
                              {group.items.map((booking) => (
                                <li key={booking.code} className="text-sm text-teal-900/75">
                                  {booking.leadGuest}{' '}
                                  <span className="tabular-nums text-teal-900/40">
                                    · {totalPassengers(booking)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}

                        {freeGuests.length > 0 ? (
                          <div className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-3">
                            <p className="text-xs font-semibold tracking-wide text-sky-900/70 uppercase">
                              No transfer
                            </p>
                            <ul className="mt-2 space-y-2">
                              {freeGuests.map((booking) => (
                                <li
                                  key={booking.code}
                                  className="flex items-start justify-between gap-2"
                                >
                                  <button
                                    type="button"
                                    className="min-w-0 text-left"
                                    onClick={() => setSelectedGuest(booking)}
                                  >
                                    <p className="truncate text-sm font-medium text-teal-950">
                                      {booking.leadGuest}
                                    </p>
                                    <p className="text-xs text-teal-900/45">
                                      {totalPassengers(booking)} pax
                                    </p>
                                  </button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 shrink-0 px-2 text-xs print:hidden"
                                    onClick={() => onAssignBooking(booking.code, null)}
                                  >
                                    Unassign
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </Surface>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={selectedGuest !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedGuest(null)
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          {selectedGuest ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-lg font-semibold text-teal-950">
                  {selectedGuest.leadGuest}
                </DialogTitle>
                <DialogDescription className="text-sm text-teal-900/55">
                  Place this guest on a boat, or leave unassigned.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <DetailRow label="Booking" value={selectedGuest.code} mono />
                <DetailRow label="Agent" value={selectedGuest.agentName} />
                <DetailRow
                  label="Passengers"
                  value={`${totalPassengers(selectedGuest)} pax`}
                />
                <DetailRow
                  label="Pickup"
                  value={`${selectedGuest.pickupZone} · ${selectedGuest.pickupTime}`}
                />
                <DetailRow label="Hotel" value={selectedGuest.pickupHotel || '—'} />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-teal-900/50">Status</span>
                  <StatusBadge status={selectedGuest.status} />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-teal-950">Assign to</p>
                <div
                  className={cn(
                    'grid gap-2',
                    boatNumbers.length <= 3 ? 'grid-cols-3' : 'grid-cols-4',
                  )}
                >
                  {boatNumbers.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        onAssignBooking(selectedGuest.code, n)
                        setSelectedGuest(null)
                      }}
                      className={cn(
                        'rounded-xl px-3 py-3 text-sm font-semibold transition-colors',
                        plan.assignments[selectedGuest.code] === n
                          ? 'bg-teal-800 text-white shadow-sm'
                          : 'bg-teal-50 text-teal-800 hover:bg-teal-100',
                      )}
                    >
                      {boatDisplayName(plan, n)}
                    </button>
                  ))}
                </div>
              </div>
              <DialogFooter className="sm:justify-between">
                {plan.assignments[selectedGuest.code] ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onAssignBooking(selectedGuest.code, null)
                      setSelectedGuest(null)
                    }}
                  >
                    Unassign
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="button" variant="ghost" onClick={() => setSelectedGuest(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="mt-6 hidden print:block">
        {boatNumbers.map((boat) => {
          const vansHere = assignedVansByBoat(boat)
          const freeGuests = noTransferOnBoat(boat)
          const pax = boatLoad(boat)
          return (
            <div key={boat} className="mb-6 break-inside-avoid">
              <h2 className="mb-2 text-base font-semibold">
                {boatDisplayName(plan, boat)} — {pax} pax /{' '}
                {plan.capacities[boat - 1] ?? DEFAULT_BOAT_CAPACITY} capacity
              </h2>
              {vansHere.map((group) => (
                <div key={group.van} className="mb-3">
                  <p className="text-sm font-semibold">
                    Van {group.van} · {group.zone} · {group.pax} pax
                  </p>
                  <ul className="text-sm">
                    {group.items.map((booking) => (
                      <li key={booking.code}>
                        {booking.code} — {booking.leadGuest} ({totalPassengers(booking)} pax)
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {freeGuests.length > 0 ? (
                <div className="mb-3">
                  <p className="text-sm font-semibold">No transfer</p>
                  <ul className="text-sm">
                    {freeGuests.map((booking) => (
                      <li key={booking.code}>
                        {booking.code} — {booking.leadGuest} ({totalPassengers(booking)} pax)
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {vansHere.length === 0 && freeGuests.length === 0 ? (
                <p className="text-sm text-neutral-500">Empty</p>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GuestBoatChip({
  booking,
  boatNumbers,
  assignedBoat,
  labelForBoat,
  onAssign,
  onOpen,
}: {
  booking: Booking
  boatNumbers: BoatNumber[]
  assignedBoat: BoatNumber | null
  labelForBoat: (boat: BoatNumber) => string
  onAssign: (boat: BoatNumber) => void
  onOpen: () => void
}) {
  return (
    <div className="rounded-xl border border-amber-200/80 bg-white px-3 py-2">
      <button type="button" onClick={onOpen} className="text-left">
        <p className="text-sm font-semibold text-teal-950">{booking.leadGuest}</p>
        <p className="text-xs text-teal-900/50">{totalPassengers(booking)} pax</p>
      </button>
      <div className="mt-2 flex flex-wrap gap-1">
        {boatNumbers.map((boat) => (
          <button
            key={boat}
            type="button"
            onClick={() => onAssign(boat)}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] font-semibold',
              assignedBoat === boat
                ? 'bg-teal-800 text-white'
                : 'bg-amber-100 text-amber-950 hover:bg-amber-200',
            )}
          >
            {labelForBoat(boat)}
          </button>
        ))}
      </div>
    </div>
  )
}


function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-teal-900/50">{label}</span>
      <span
        className={cn(
          'text-right font-medium text-teal-950',
          mono && 'font-mono text-[13px]',
        )}
      >
        {value}
      </span>
    </div>
  )
}

