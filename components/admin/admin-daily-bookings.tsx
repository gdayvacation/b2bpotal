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
import { formatLongDate, formatShortDate, todayISO, toISODate } from '@/lib/format'
import {
  BOAT_NUMBERS,
  DEFAULT_BOAT_CAPACITY,
  isActiveBooking,
  totalPassengers,
  type BoatNumber,
  type Booking,
  type Program,
} from '@/lib/types'
import { cn } from '@/lib/utils'

type BoardMode = 'vehicles' | 'boats'

export function AdminDailyBookings() {
  const [boardMode, setBoardMode] = useState<BoardMode | null>(null)

  if (!boardMode) {
    return (
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Daily Board"
          description="Pick what to organize first. Vehicle transfers and boat assignments are separate workflows."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <ModeCard
            title="จัดการรถ"
            subtitle="Group pickups by location proximity for transfer vans and cars."
            meta="By zone & hotel"
            icon={<Bus className="size-7" />}
            onClick={() => setBoardMode('vehicles')}
          />
          <ModeCard
            title="จัดการเรือ"
            subtitle="Assign bookings to boats by program. Typical capacity is about 30–40 pax per boat."
            meta="By program & capacity"
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
    assignBookingToBoat,
    setBoatCapacity,
    autoAssignDayBoats,
    clearDayBoatAssignments,
  } = usePortal()

  const [selectedDate, setSelectedDate] = useState(() => todayISO())
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
    <div className="mx-auto max-w-7xl">
      <div className="print:hidden">
        <div className="mb-4">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            Daily Board
          </Button>
        </div>
        <PageHeader
          title="Arrange boats"
          description="Day board for many small bookings (often 1–2 pax). Pick a date, choose PP or James Bond, assign to boats (~30–40 pax each)."
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
                  Auto-assign
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

      {program && plan ? (
        <BoatBoard
          date={selectedDate}
          program={program}
          bookings={programBookings}
          plan={plan}
          onAssign={(code, boat) => assignBookingToBoat(selectedDate, program, code, boat)}
          onCapacity={(boat, capacity) => setBoatCapacity(selectedDate, program, boat, capacity)}
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
  onAssign,
  onCapacity,
  onAutoAssign,
  onClear,
  onPrint,
}: {
  date: string
  program: Program
  bookings: Booking[]
  plan: ReturnType<ReturnType<typeof usePortal>['getDayBoatPlan']>
  onAssign: (code: string, boat: BoatNumber | null) => void
  onCapacity: (boat: BoatNumber, capacity: number) => void
  onAutoAssign: () => void
  onClear: () => void
  onPrint: () => void
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const unassigned = bookings.filter((booking) => !plan.assignments[booking.code])
  const byBoat = BOAT_NUMBERS.map((boat) => ({
    boat,
    capacity: plan.capacities[boat - 1],
    items: bookings.filter((booking) => plan.assignments[booking.code] === boat),
  }))

  const totalPax = bookings.reduce((sum, b) => sum + totalPassengers(b), 0)
  const unassignedPax = unassigned.reduce((sum, b) => sum + totalPassengers(b), 0)
  const selected = selectedCode
    ? (bookings.find((booking) => booking.code === selectedCode) ?? null)
    : null
  const selectedBoat = selected ? (plan.assignments[selected.code] ?? null) : null

  return (
    <div>
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-semibold">
          Daily Board · {program} · {formatLongDate(date)}
        </h1>
        <p className="text-sm text-neutral-600">
          {bookings.length} bookings · {totalPax} pax
        </p>
      </div>

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
              {bookings.length} bookings · {totalPax} pax · boat capacity ~{DEFAULT_BOAT_CAPACITY}
            </p>
            <p className="mt-1 text-sm text-teal-900/45">
              Click a booking to move it between boats.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:hidden">
            <Button type="button" variant="outline" onClick={onPrint}>
              <Printer data-icon="inline-start" />
              Print
            </Button>
            <Button type="button" variant="outline" onClick={onClear}>
              Clear
            </Button>
            <Button type="button" onClick={onAutoAssign}>
              <Sparkles data-icon="inline-start" />
              Auto-assign
            </Button>
          </div>
        </div>
      </Surface>

      {bookings.length === 0 ? (
        <Surface className="px-4 py-12 text-center text-base text-neutral-500">
          No bookings for this program on {formatShortDate(date)}.
        </Surface>
      ) : (
        <div className="flex flex-col gap-5">
          <Surface className="overflow-hidden print:hidden">
            <div className="flex items-center justify-between gap-3 border-b border-teal-900/8 px-4 py-3.5 sm:px-5">
              <div>
                <h3 className="text-lg font-semibold text-teal-950">Unassigned</h3>
                <p className="mt-0.5 text-sm text-teal-900/55">
                  {unassigned.length} booking{unassigned.length === 1 ? '' : 's'} · {unassignedPax}{' '}
                  pax waiting
                </p>
              </div>
            </div>
            {unassigned.length === 0 ? (
              <div className="px-5 py-8 text-center text-base text-teal-900/45">
                All bookings are assigned.
              </div>
            ) : (
              <ul className="max-h-72 divide-y divide-teal-900/6 overflow-y-auto">
                {unassigned.map((booking) => (
                  <BookingRow
                    key={booking.code}
                    booking={booking}
                    boat={null}
                    onOpen={() => setSelectedCode(booking.code)}
                  />
                ))}
              </ul>
            )}
          </Surface>

          <div className="grid gap-4 lg:grid-cols-3">
            {byBoat.map(({ boat, capacity, items }) => {
              const pax = items.reduce((sum, b) => sum + totalPassengers(b), 0)
              const over = pax > capacity
              return (
                <Surface
                  key={boat}
                  className={cn(
                    'flex min-h-0 flex-col overflow-hidden',
                    over && 'border-amber-500/40',
                  )}
                >
                  <div className="shrink-0 border-b border-teal-900/8 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold text-teal-950">Boat {boat}</h3>
                      <span
                        className={cn(
                          'rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums',
                          over
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-teal-50 text-teal-800',
                        )}
                      >
                        {pax}/{capacity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-teal-900/50">
                      {items.length} booking{items.length === 1 ? '' : 's'}
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
                    <p className="mt-1 hidden text-sm text-neutral-500 print:block">
                      Capacity {capacity}
                    </p>
                  </div>
                  {items.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-teal-900/40">Empty</div>
                  ) : (
                    <ul className="max-h-[min(36rem,62vh)] divide-y divide-teal-900/6 overflow-y-auto">
                      {items.map((booking) => (
                        <BookingRow
                          key={booking.code}
                          booking={booking}
                          boat={boat}
                          onOpen={() => setSelectedCode(booking.code)}
                        />
                      ))}
                    </ul>
                  )}
                </Surface>
              )
            })}
          </div>
        </div>
      )}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCode(null)
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-lg font-semibold text-teal-950">
                  {selected.leadGuest}
                </DialogTitle>
                <DialogDescription className="text-sm text-teal-900/55">
                  Move this booking to another boat, or leave it unassigned.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <DetailRow label="Booking" value={selected.code} mono />
                <DetailRow label="Agent" value={selected.agentName} />
                <DetailRow
                  label="Agent ref"
                  value={selected.agentRef?.trim() ? selected.agentRef : '—'}
                />
                <DetailRow
                  label="Passengers"
                  value={`${totalPassengers(selected)} pax (A${selected.adults} C${selected.children} I${selected.infants}${selected.tourLeaders ? ` TL${selected.tourLeaders}` : ''})`}
                />
                <DetailRow
                  label="Pickup"
                  value={`${selected.pickupZone} · ${selected.pickupTime}`}
                />
                <DetailRow label="Hotel" value={selected.pickupHotel} />
                <DetailRow
                  label="Room"
                  value={selected.roomNumber?.trim() ? selected.roomNumber : '—'}
                />
                <DetailRow
                  label="Note"
                  value={selected.note?.trim() ? selected.note : '—'}
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-teal-900/50">Status</span>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-teal-900/50">Current boat</span>
                  <span className="font-medium text-teal-950">
                    {selectedBoat ? `Boat ${selectedBoat}` : 'Unassigned'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-teal-950">Assign to</p>
                <div className="grid grid-cols-3 gap-2">
                  {BOAT_NUMBERS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        onAssign(selected.code, n)
                        setSelectedCode(null)
                      }}
                      className={cn(
                        'rounded-xl px-3 py-3 text-sm font-semibold transition-colors',
                        selectedBoat === n
                          ? 'bg-teal-800 text-white shadow-sm'
                          : 'bg-teal-50 text-teal-800 hover:bg-teal-100',
                      )}
                    >
                      Boat {n}
                    </button>
                  ))}
                </div>
              </div>

              <DialogFooter className="sm:justify-between">
                {selectedBoat !== null ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onAssign(selected.code, null)
                      setSelectedCode(null)
                    }}
                  >
                    Unassign
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="button" variant="ghost" onClick={() => setSelectedCode(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="mt-6 hidden print:block">
        {BOAT_NUMBERS.map((boat) => {
          const items = bookings.filter((b) => plan.assignments[b.code] === boat)
          const pax = items.reduce((sum, b) => sum + totalPassengers(b), 0)
          return (
            <div key={boat} className="mb-6 break-inside-avoid">
              <h2 className="mb-2 text-base font-semibold">
                Boat {boat} — {items.length} bookings · {pax} pax / {plan.capacities[boat - 1]}{' '}
                capacity
              </h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-300 text-left">
                    <th className="py-1 pr-2">Code</th>
                    <th className="py-1 pr-2">Lead guest</th>
                    <th className="py-1 pr-2">Agent</th>
                    <th className="py-1 pr-2">Pax</th>
                    <th className="py-1 pr-2">Pickup</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((booking) => (
                    <tr key={booking.code} className="border-b border-neutral-200">
                      <td className="py-1.5 pr-2 font-mono text-xs">{booking.code}</td>
                      <td className="py-1.5 pr-2">{booking.leadGuest}</td>
                      <td className="py-1.5 pr-2">{booking.agentName}</td>
                      <td className="py-1.5 pr-2">{totalPassengers(booking)}</td>
                      <td className="py-1.5 pr-2">
                        {booking.pickupZone} · {booking.pickupTime}
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-2 text-neutral-500">
                        No bookings
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )
        })}
        {unassigned.length > 0 ? (
          <div className="break-inside-avoid">
            <h2 className="mb-2 text-base font-semibold">Unassigned ({unassigned.length})</h2>
            <ul className="text-sm">
              {unassigned.map((booking) => (
                <li key={booking.code}>
                  {booking.code} — {booking.leadGuest} ({totalPassengers(booking)} pax)
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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

function BookingRow({
  booking,
  boat,
  onOpen,
}: {
  booking: Booking
  boat: BoatNumber | null
  onOpen: () => void
}) {
  const pax = totalPassengers(booking)
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full px-4 py-3.5 text-left transition-colors hover:bg-teal-50/60 sm:px-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold text-teal-950">{booking.leadGuest}</p>
          <span className="rounded-md bg-teal-800 px-2 py-0.5 text-sm font-semibold tabular-nums text-white">
            {pax} pax
          </span>
          {boat !== null ? (
            <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
              Boat {boat}
            </span>
          ) : null}
          {booking.status === 'Pending Pickup Time' ? (
            <StatusBadge status={booking.status} />
          ) : null}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-teal-900/60">
          <span className="font-medium text-teal-900/80">{booking.agentName}</span>
          <span className="mx-1.5 text-teal-900/25">·</span>
          <span className="font-mono text-[13px] text-teal-900/70">{booking.code}</span>
        </p>
        <p className="mt-0.5 text-sm text-teal-900/50">
          {booking.pickupZone}
          {booking.roomNumber ? ` · Rm ${booking.roomNumber}` : ''} · {booking.pickupTime}
        </p>
        {booking.note ? (
          <p className="mt-0.5 truncate text-sm text-teal-900/40">{booking.note}</p>
        ) : null}
      </button>
    </li>
  )
}