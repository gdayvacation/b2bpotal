'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bus,
  CalendarIcon,
  Car,
  GripVertical,
  Pencil,
  Plus,
  Printer,
  Search,
  Sparkles,
  SplitSquareVertical,
  Trash2,
  Users,
} from 'lucide-react'
import { AdminDailyJobOrder } from '@/components/admin/admin-daily-job-order'
import {
  SpecialTransferDialog,
  specialTransferToMeta,
} from '@/components/admin/special-transfer-dialog'
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
import { formatLongDate, formatShortDate, formatThb, toISODate } from '@/lib/format'
import { boatTheme } from '@/lib/boat-theme'
import { usePortalDefaultDateISO } from '@/lib/use-portal-today'
import {
  DEFAULT_BOAT_CAPACITY,
  DEFAULT_VAN_CAPACITY,
  MIN_VAN_CAPACITY,
  MAX_VAN_CAPACITY,
  boatDisplayName,
  boatNumbersForPlan,
  clampVanCapacity,
  emptyVanMeta,
  formatPaxBreakdown,
  isActiveBooking,
  isNoTransfer,
  isSpecialTransfer,
  specialTransferDirectionLabel,
  specialTransferKindLabel,
  totalPassengers,
  vanHasSavedMeta,
  vanOutsourceLabel,
  vanSeatCapacity,
  type BoatNumber,
  type Booking,
  type DayBoatPlan,
  type DayVehiclePlan,
  type Program,
  type VanMeta,
  type VanSplit,
} from '@/lib/types'
import {
  listVanNumbers,
  paxOnVan,
  sortOrderOnVan,
  suggestVanSplit,
} from '@/lib/vehicle-assign'
import { cn } from '@/lib/utils'

const DRAG_MIME = 'application/x-gday-van-codes'
/** Always show this many van cards ready to receive guests. */
const DEFAULT_DAY_VAN_COUNT = 4

function nextAvailableVan(plan: DayVehiclePlan | null) {
  if (!plan) return DEFAULT_DAY_VAN_COUNT + 1
  const assigned = listVanNumbers(plan.assignments)
  const saved = Object.entries(plan.vanMeta ?? {})
    .filter(([, meta]) => vanHasSavedMeta(meta))
    .map(([key]) => Number(key))
    .filter((van) => Number.isFinite(van) && van >= 1)
  const maxVan =
    assigned.length > 0 || saved.length > 0 ? Math.max(0, ...assigned, ...saved) : 0
  return Math.max(maxVan, DEFAULT_DAY_VAN_COUNT) + 1
}

function readDragCodes(event: React.DragEvent, fallback: string[] | null): string[] {
  const raw =
    event.dataTransfer.getData(DRAG_MIME) ||
    event.dataTransfer.getData('text/plain') ||
    ''
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed
      }
    } catch {
      if (raw.trim()) return [raw.trim()]
    }
  }
  return fallback ?? []
}

export function VehicleDailyBoard({ onBack }: { onBack: () => void }) {
  const {
    bookings,
    getDayVehiclePlan,
    getDayBoatPlan,
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
  const [jobOrderOpen, setJobOrderOpen] = useState(false)
  const [specialVan, setSpecialVan] = useState<number | null>(null)

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
    setSpecialVan(null)
    setCalendarOpen(false)
  }

  if (jobOrderOpen) {
    return (
      <AdminDailyJobOrder
        audience="ops"
        backLabel="Arrange vehicles"
        initialDate={selectedDate}
        initialProgram={program ?? undefined}
        onBack={() => setJobOrderOpen(false)}
      />
    )
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
          title="Arrange vehicles"
          description="Drag guests into vans. Same-van groups stay together on boats (default 44 pax)."
          actions={
            program ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSpecialVan(nextAvailableVan(plan))}
                >
                  <Car data-icon="inline-start" />
                  Special Transfers
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setJobOrderOpen(true)}
                >
                  <Printer data-icon="inline-start" />
                  Driver Job Order
                </Button>
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

          <div className="mt-4 print:hidden">
            <DriverJobOrderLaunchCard onClick={() => setJobOrderOpen(true)} />
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
          onOpenJobOrder={() => setJobOrderOpen(true)}
          specialVan={specialVan}
          onSpecialVan={setSpecialVan}
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

function DriverJobOrderLaunchCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-[1.45rem] border border-amber-900/10 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/35 p-6 text-left transition-all duration-200 hover:border-amber-600/30 hover:shadow-lg hover:shadow-amber-900/8 active:scale-[0.985] sm:p-7"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/12 via-transparent to-transparent opacity-80"
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-700 text-white shadow-md shadow-amber-700/25 transition-transform duration-200 group-hover:scale-105">
            <Bus className="size-7" strokeWidth={1.75} />
          </div>
          <p className="rounded-lg bg-amber-950/6 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
            For drivers
          </p>
        </div>
        <p className="font-display mt-6 text-2xl font-semibold tracking-tight text-amber-950 sm:text-[1.7rem]">
          Driver Job Order
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-amber-950/55">
          Day sheet grouped by van with driver and plate — from Arrange vehicles.
        </p>
        <p className="mt-6 text-sm font-semibold tracking-wide text-amber-800 transition-transform duration-200 group-hover:translate-x-0.5">
          Continue →
        </p>
      </div>
    </button>
  )
}

function VanCrewDetails({
  van,
  crew,
  onChange,
}: {
  van: number
  crew: VanMeta & { fromFleet?: boolean }
  onChange: (patch: Partial<VanMeta>) => void
}) {
  const driver = crew.driver.trim()
  const plate = crew.plate.trim()
  const phone = crew.phone.trim()
  const contact = [plate || null, phone || null].filter(Boolean).join(' · ')

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="mt-2 flex w-full items-start justify-between gap-2 rounded-lg px-0.5 py-0.5 text-left hover:bg-teal-50/80"
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <div className="min-w-0">
          <p
            className={cn(
              'truncate text-[12px] font-semibold leading-tight',
              driver ? 'text-teal-950' : 'text-amber-800/80',
            )}
          >
            {driver || 'Assign driver'}
          </p>
          <p className="mt-0.5 truncate text-[11px] leading-tight text-teal-900/55">
            {contact || 'Plate · Tel'}
          </p>
          {isSpecialTransfer(crew) ? (
            <p className="mt-1 truncate text-[10px] font-semibold tracking-wide text-sky-800 uppercase">
              {specialTransferKindLabel(crew.specialKind)}
              {specialTransferDirectionLabel(crew)
                ? ` · ${specialTransferDirectionLabel(crew)}`
                : ''}
              {formatThb(crew.chargeAmount ?? 0) ? ` · ${formatThb(crew.chargeAmount ?? 0)}` : ''}
            </p>
          ) : crew.outsourced ? (
            <p className="mt-1 truncate text-[10px] font-semibold tracking-wide text-violet-800 uppercase">
              {vanOutsourceLabel(crew)}
              {formatThb(crew.chargeAmount ?? 0) ? ` · ${formatThb(crew.chargeAmount ?? 0)}` : ''}
            </p>
          ) : formatThb(crew.chargeAmount ?? 0) ? (
            <p className="mt-1 truncate text-[10px] font-semibold tracking-wide text-teal-800 uppercase">
              {formatThb(crew.chargeAmount ?? 0)}
            </p>
          ) : null}
        </div>
        <Pencil className="mt-0.5 size-3 shrink-0 text-teal-800/35" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 space-y-3 p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-semibold tracking-wide text-teal-700/60 uppercase">
          Van {van} · driver
        </p>
        <div className="space-y-1.5">
          <Label htmlFor={`card-driver-${van}`}>Driver name</Label>
          <Input
            id={`card-driver-${van}`}
            value={crew.driver}
            onChange={(event) => onChange({ driver: event.target.value })}
            placeholder="e.g. พี่แขก"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`card-phone-${van}`}>Telephone</Label>
          <Input
            id={`card-phone-${van}`}
            value={crew.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
            placeholder="e.g. 098-903-8477"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`card-plate-${van}`}>Plate number</Label>
          <Input
            id={`card-plate-${van}`}
            value={crew.plate}
            onChange={(event) => onChange({ plate: event.target.value })}
            placeholder="e.g. 31-7558"
            className="h-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-teal-950">
          <input
            type="checkbox"
            className="size-3.5 rounded border-teal-900/25 text-violet-700"
            checked={crew.outsourced === true}
            onChange={(event) =>
              onChange({
                outsourced: event.target.checked,
                outsourceCompany: event.target.checked ? crew.outsourceCompany : '',
              })
            }
          />
          Outsource van company
        </label>
        {crew.outsourced ? (
          <div className="space-y-1.5">
            <Label htmlFor={`card-outsource-${van}`}>Company name</Label>
            <Input
              id={`card-outsource-${van}`}
              value={crew.outsourceCompany ?? ''}
              onChange={(event) => onChange({ outsourceCompany: event.target.value })}
              placeholder="e.g. Phuket Transfer Co"
              className="h-9"
            />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor={`card-charge-${van}`}>Charge amount</Label>
          <div className="relative">
            <Input
              id={`card-charge-${van}`}
              type="number"
              min={0}
              step={100}
              value={crew.chargeAmount && crew.chargeAmount > 0 ? String(crew.chargeAmount) : ''}
              onChange={(event) =>
                onChange({ chargeAmount: event.target.value === '' ? 0 : Number(event.target.value) })
              }
              placeholder="e.g. 2500"
              className="h-9 pr-12"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-semibold text-teal-800/55">
              THB
            </span>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-teal-800/55">
          Saved for this day only. The next day starts blank.
        </p>
      </PopoverContent>
    </Popover>
  )
}

function VanCapacityButton({
  van,
  pax,
  seats,
  defaultSeats,
  over,
  preview,
  onChange,
}: {
  van: number
  pax: number
  seats: number
  defaultSeats: number
  over: boolean
  preview: string | null
  onChange: (next: number | null) => void
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              'rounded-lg px-2 py-1 text-xs font-semibold tabular-nums',
              over ? 'bg-amber-50 text-amber-900' : 'bg-teal-50 text-teal-800',
            )}
            onClick={(event) => event.stopPropagation()}
            title="Change seats for this van today"
          />
        }
      >
        {preview ? `${preview}/${seats}` : `${pax}/${seats}`}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 space-y-3 p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-semibold tracking-wide text-teal-700/60 uppercase">
          Van {van} · seats today
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="size-8 p-0"
            disabled={seats <= MIN_VAN_CAPACITY}
            onClick={() => onChange(seats - 1)}
          >
            −
          </Button>
          <Input
            type="number"
            min={MIN_VAN_CAPACITY}
            max={MAX_VAN_CAPACITY}
            value={seats}
            onChange={(event) => onChange(clampVanCapacity(Number(event.target.value)))}
            className="h-8 text-center tabular-nums"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="size-8 p-0"
            disabled={seats >= MAX_VAN_CAPACITY}
            onClick={() => onChange(seats + 1)}
          >
            +
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full text-xs"
          disabled={seats === defaultSeats}
          onClick={() => onChange(null)}
        >
          Reset to {defaultSeats}
        </Button>
        <p className="text-[11px] leading-relaxed text-teal-800/55">
          Only for this day. Other vans keep their own seat count.
        </p>
      </PopoverContent>
    </Popover>
  )
}

function VehicleBoard({
  date,
  program,
  bookings,
  noTransferBookings = [],
  plan,
  boatPlan,
  onAssignMany,
  onAssignVanToBoat,
  onAutoAssignBoats,
  onClearBoats,
  onSaveSplits,
  onVanMeta,
  onReorderVan,
  onAutoAssign,
  onClear,
  onOpenJobOrder,
  specialVan,
  onSpecialVan,
}: {
  date: string
  program: Program
  bookings: Booking[]
  noTransferBookings?: Booking[]
  plan: DayVehiclePlan
  boatPlan: DayBoatPlan
  onAssignMany: (codes: string[], van: number | null) => void
  onAssignVanToBoat: (van: number, boat: BoatNumber | null) => void
  onAutoAssignBoats: () => void
  onClearBoats: () => void
  onSaveSplits: (code: string, legs: VanSplit[]) => void
  onVanMeta: (
    van: number,
    meta: Partial<VanMeta> & { capacity?: number | null; specialKind?: VanMeta['specialKind'] | null },
  ) => void
  onReorderVan: (van: number, orderedCodes: string[]) => void
  onAutoAssign: () => void
  onClear: () => void
  onOpenJobOrder: () => void
  specialVan: number | null
  onSpecialVan: (van: number | null) => void
}) {
  const { resolveVanMeta } = usePortal()
  const [openVan, setOpenVan] = useState<number | null>(null)
  const [splitCode, setSplitCode] = useState<string | null>(null)
  const [sheetQuery, setSheetQuery] = useState('')
  const [activeZone, setActiveZone] = useState<string | null>(null)
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => new Set())
  const [dragCodes, setDragCodes] = useState<string[] | null>(null)
  const [dropTarget, setDropTarget] = useState<'pool' | number | null>(null)
  const [dragCode, setDragCode] = useState<string | null>(null)
  const [dragOverCode, setDragOverCode] = useState<string | null>(null)

  const capacity = plan.vanCapacity || DEFAULT_VAN_CAPACITY
  const vanNumbers = listVanNumbers(plan.assignments)
  const savedMetaVans = Object.entries(plan.vanMeta ?? {})
    .filter(([, meta]) => vanHasSavedMeta(meta))
    .map(([key]) => Number(key))
    .filter((van) => Number.isFinite(van) && van >= 1)
  const maxVan =
    vanNumbers.length > 0 || savedMetaVans.length > 0
      ? Math.max(0, ...vanNumbers, ...savedMetaVans)
      : 0
  const nextEmptyVan = Math.max(maxVan, DEFAULT_DAY_VAN_COUNT) + 1
  const boardVans = Array.from(
    { length: Math.max(DEFAULT_DAY_VAN_COUNT, maxVan) },
    (_, i) => i + 1,
  ).concat(nextEmptyVan)

  useEffect(() => {
    setSheetQuery('')
    setActiveZone(null)
    setSelectedCodes(new Set())
    setDragCodes(null)
    setDropTarget(null)
  }, [date, program])

  const poolBookings = useMemo(() => {
    return [...bookings]
      .filter((booking) => {
        const legs = plan.assignments[booking.code]
        return !legs?.length
      })
      .sort((a, b) => {
        const needsA = totalPassengers(a) > capacity ? 0 : 1
        const needsB = totalPassengers(b) > capacity ? 0 : 1
        return (
          needsA - needsB ||
          a.pickupZone.localeCompare(b.pickupZone) ||
          a.pickupTime.localeCompare(b.pickupTime) ||
          a.pickupHotel.localeCompare(b.pickupHotel) ||
          a.code.localeCompare(b.code)
        )
      })
  }, [bookings, plan.assignments, capacity])

  const zoneBar = useMemo(() => {
    const map = new Map<string, { count: number; pax: number }>()
    for (const booking of poolBookings) {
      const zone = booking.pickupZone?.trim() || 'Other'
      const current = map.get(zone) ?? { count: 0, pax: 0 }
      current.count += 1
      current.pax += totalPassengers(booking)
      map.set(zone, current)
    }
    return [...map.entries()]
      .map(([zone, stats]) => ({ zone, ...stats }))
      .sort((a, b) => a.zone.localeCompare(b.zone))
  }, [poolBookings])

  useEffect(() => {
    if (activeZone && !zoneBar.some((item) => item.zone === activeZone)) {
      setActiveZone(null)
    }
  }, [activeZone, zoneBar])

  const sheetRows = useMemo(() => {
    let rows = poolBookings
    if (activeZone) {
      rows = rows.filter(
        (booking) => (booking.pickupZone?.trim() || 'Other') === activeZone,
      )
    }
    const q = sheetQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((booking) => {
      const haystack = [
        booking.leadGuest,
        booking.agentName,
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
  }, [poolBookings, sheetQuery, activeZone])

  const selectableSheetRows = useMemo(
    () => sheetRows.filter((booking) => totalPassengers(booking) <= capacity),
    [sheetRows, capacity],
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

  const zoneGroups = useMemo(() => {
    const map = new Map<string, Booking[]>()
    for (const booking of sheetRows) {
      const zone = booking.pickupZone?.trim() || 'Other'
      const list = map.get(zone) ?? []
      list.push(booking)
      map.set(zone, list)
    }
    return [...map.entries()]
      .map(([zone, items]) => {
        const selectable = items.filter((b) => totalPassengers(b) <= capacity)
        const pax = items.reduce((sum, b) => sum + totalPassengers(b), 0)
        const selectedInZone = selectable.filter((b) => selectedCodes.has(b.code)).length
        const allSelected =
          selectable.length > 0 && selectable.every((b) => selectedCodes.has(b.code))
        return {
          zone,
          items,
          selectable,
          pax,
          selectedInZone,
          allSelected,
          someSelected: selectedInZone > 0 && !allSelected,
        }
      })
      .sort((a, b) => a.zone.localeCompare(b.zone))
  }, [sheetRows, capacity, selectedCodes])

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

  function toggleSelectZone(codes: string[], allSelected: boolean) {
    setSelectedCodes((current) => {
      const next = new Set(current)
      if (allSelected) {
        for (const code of codes) next.delete(code)
      } else {
        for (const code of codes) next.add(code)
      }
      return next
    })
  }

  function codesForDrag(code: string): string[] {
    if (selectedCodes.has(code) && selectedList.length > 0) return selectedList
    return [code]
  }

  function beginDrag(event: React.DragEvent, codes: string[]) {
    const payload = JSON.stringify(codes)
    event.dataTransfer.setData(DRAG_MIME, payload)
    event.dataTransfer.setData('text/plain', payload)
    event.dataTransfer.effectAllowed = 'move'
    setDragCodes(codes)
  }

  function assignDropped(codes: string[], van: number | null) {
    const unique = [...new Set(codes)].filter((code) => {
      const booking = bookings.find((b) => b.code === code)
      if (!booking) return false
      if (van === null) return true
      const legs = plan.assignments[code]
      const vanCap = vanSeatCapacity(plan, van)
      const needsSplit = totalPassengers(booking) > vanCap && (legs?.length ?? 0) <= 1
      return !needsSplit
    })
    if (unique.length === 0) return
    onAssignMany(unique, van)
    setSelectedCodes(new Set())
  }

  const totalPax = bookings.reduce((sum, b) => sum + totalPassengers(b), 0)
  const assignedCount = bookings.filter((b) => (plan.assignments[b.code]?.length ?? 0) > 0).length
  const unassignedPax = poolBookings.reduce((sum, b) => sum + totalPassengers(b), 0)
  const noTransferPax = noTransferBookings.reduce((sum, b) => sum + totalPassengers(b), 0)

  const needsSeparate = bookings.filter((booking) => {
    const pax = totalPassengers(booking)
    const legs = plan.assignments[booking.code]
    if (pax <= capacity) return false
    return !legs?.length || legs.length === 1
  })

  const byVan = boardVans.map((van) => {
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
    const seats = vanSeatCapacity(plan, van)
    const crew = resolveVanMeta(van, plan.vanMeta[String(van)])
    const zone =
      items.length > 0
        ? [...new Set(items.map((item) => item.booking.pickupZone))].join(', ')
        : 'Drop guests here'
    const boatVotes = new Map<BoatNumber, number>()
    for (const item of items) {
      const boat = boatPlan.assignments[item.booking.code]
      if (boat) boatVotes.set(boat, (boatVotes.get(boat) ?? 0) + 1)
    }
    let assignedBoat: BoatNumber | null = null
    if (boatVotes.size === 1) {
      assignedBoat = [...boatVotes.keys()][0]
    }
    const boatMixed = boatVotes.size > 1
    const isExtraSlot = van === nextEmptyVan
    const isSpecial = isSpecialTransfer(crew)
    return {
      van,
      items,
      pax,
      zone: items.length > 0
        ? zone
        : isSpecial
          ? specialTransferDirectionLabel(crew) || specialTransferKindLabel(crew.specialKind)
          : isExtraSlot
            ? 'Drop guests here'
            : `Van ${van} ready`,
      over: pax > seats,
      seats,
      crew,
      assignedBoat,
      boatMixed,
      isSpecial,
      isEmptySlot: isExtraSlot && items.length === 0 && !isSpecial,
      isPreparedEmpty: !isExtraSlot && items.length === 0 && !isSpecial,
    }
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

  const draggingPax = (dragCodes ?? []).reduce((sum, code) => {
    const booking = bookings.find((b) => b.code === code)
    return sum + (booking ? totalPassengers(booking) : 0)
  }, 0)

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
              {bookings.length} bookings · {totalPax} pax · {assignedCount} on vans · default{' '}
              {capacity} seats / van
              {noTransferBookings.length > 0
                ? ` · ${noTransferBookings.length} no transfer (${noTransferPax} pax)`
                : ''}
            </p>
            <p className="mt-1 text-sm text-teal-900/45">
              Select guests on the left, drag into a van card — or tap a van while guests are
              selected.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onSpecialVan(nextEmptyVan)}>
              <Car data-icon="inline-start" />
              Special Transfers
            </Button>
            <div className="flex flex-wrap gap-2 sm:hidden">
              <Button type="button" variant="outline" onClick={onOpenJobOrder}>
                <Printer data-icon="inline-start" />
                Driver Job Order
              </Button>
              <Button type="button" variant="outline" onClick={onClear}>
                Clear
              </Button>
              <Button type="button" onClick={onAutoAssign}>
                <Sparkles data-icon="inline-start" />
                Auto-assign by AI
              </Button>
            </div>
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
            Open Separate Van and choose how many guests go on each van before dragging.
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
          <div className="grid gap-4 xl:grid-cols-[minmax(280px,22rem)_minmax(0,1fr)]">
            {/* Left — guest pool */}
            <Surface className="flex max-h-[min(78vh,52rem)] flex-col overflow-hidden">
              <div className="border-b border-teal-900/8 px-4 py-3 sm:px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-teal-950">Guest list</h3>
                    <p className="mt-0.5 text-xs text-teal-900/55">
                      {activeZone ? activeZone : 'All zones'} · {sheetRows.length} showing ·{' '}
                      {poolBookings.length} waiting
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-teal-900/60">
                    <input
                      type="checkbox"
                      className="size-3.5 rounded border-teal-900/25 accent-teal-700"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (!el) return
                        el.indeterminate = selectedList.length > 0 && !allVisibleSelected
                      }}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all visible guests"
                      disabled={selectableSheetRows.length === 0}
                    />
                    All
                  </label>
                </div>

                {zoneBar.length > 0 ? (
                  <div
                    className="mt-2.5 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
                    role="tablist"
                    aria-label="Filter by pickup zone"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeZone === null}
                      onClick={() => setActiveZone(null)}
                      className={cn(
                        'shrink-0 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-semibold transition-colors',
                        activeZone === null
                          ? 'bg-teal-800 text-white'
                          : 'bg-teal-950/[0.05] text-teal-900/70 hover:bg-teal-950/[0.09]',
                      )}
                    >
                      All
                      <span
                        className={cn(
                          'ml-1.5 tabular-nums',
                          activeZone === null ? 'text-white/70' : 'text-teal-900/45',
                        )}
                      >
                        {unassignedPax}
                      </span>
                    </button>
                    {zoneBar.map(({ zone, count, pax }) => (
                      <button
                        key={zone}
                        type="button"
                        role="tab"
                        aria-selected={activeZone === zone}
                        onClick={() => {
                          setActiveZone(zone)
                          setSelectedCodes(new Set())
                        }}
                        className={cn(
                          'shrink-0 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                          activeZone === zone
                            ? 'bg-teal-800 text-white'
                            : 'bg-teal-950/[0.05] text-teal-900/80 hover:bg-teal-950/[0.09]',
                        )}
                      >
                        <span className="block text-[11px] font-semibold tracking-wide uppercase">
                          {zone}
                        </span>
                        <span
                          className={cn(
                            'mt-0.5 block text-[10px] tabular-nums',
                            activeZone === zone ? 'text-white/70' : 'text-teal-900/45',
                          )}
                        >
                          {count} · {pax} pax
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="relative mt-2.5">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-teal-900/35" />
                  <Input
                    value={sheetQuery}
                    onChange={(event) => setSheetQuery(event.target.value)}
                    placeholder="Search guest, hotel…"
                    className="h-9 pl-8 text-sm"
                    aria-label="Search unassigned guests"
                  />
                </div>
                {selectedList.length > 0 ? (
                  <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-teal-700/20 bg-teal-50/80 px-2.5 py-2">
                    <p className="text-xs font-medium text-teal-950">
                      {selectedList.length} selected · {selectedPax} pax
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedCodes(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                ) : null}
              </div>

              <div
                className={cn(
                  'min-h-0 flex-1 space-y-2 overflow-y-auto p-3 transition-colors',
                  dropTarget === 'pool' && dragCodes
                    ? 'bg-amber-50/50 ring-2 ring-inset ring-amber-400/40'
                    : '',
                )}
                onDragOver={(event) => {
                  if (!dragCodes?.length) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  if (dropTarget !== 'pool') setDropTarget('pool')
                }}
                onDragLeave={() => {
                  if (dropTarget === 'pool') setDropTarget(null)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const codes = readDragCodes(event, dragCodes)
                  setDragCodes(null)
                  setDropTarget(null)
                  assignDropped(codes, null)
                }}
              >
                {sheetRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-teal-900/12 px-3 py-10 text-center text-sm text-teal-900/45">
                    {sheetQuery.trim()
                      ? `No guests match “${sheetQuery.trim()}”.`
                      : unassignedPax === 0
                        ? 'All guests are on vans. Drag anyone back here to unassign.'
                        : 'No unassigned guests.'}
                  </div>
                ) : (
                  zoneGroups.map(
                    ({
                      zone,
                      items,
                      selectable,
                      pax: zonePax,
                      allSelected,
                      someSelected,
                    }) => (
                      <div key={zone} className="space-y-1.5">
                        <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 rounded-lg bg-[#f7faf9]/95 px-2 py-1.5 backdrop-blur-sm">
                          <label className="flex min-w-0 cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              className="size-3.5 shrink-0 rounded border-teal-900/25 accent-teal-700"
                              checked={allSelected}
                              ref={(el) => {
                                if (!el) return
                                el.indeterminate = someSelected
                              }}
                              disabled={selectable.length === 0}
                              onChange={() =>
                                toggleSelectZone(
                                  selectable.map((b) => b.code),
                                  allSelected,
                                )
                              }
                              aria-label={`Select all in ${zone}`}
                            />
                            <span className="truncate text-xs font-semibold tracking-wide text-teal-900 uppercase">
                              {zone}
                            </span>
                          </label>
                          <span className="shrink-0 text-[11px] tabular-nums text-teal-900/50">
                            {items.length} · {zonePax} pax
                          </span>
                        </div>

                        {items.map((booking) => {
                          const pax = totalPassengers(booking)
                          const needsSplit = pax > capacity
                          const checked = selectedCodes.has(booking.code)
                          const isDragging = dragCodes?.includes(booking.code)

                          return (
                            <div
                              key={booking.code}
                              draggable={!needsSplit}
                              onDragStart={(event) => {
                                if (needsSplit) {
                                  event.preventDefault()
                                  return
                                }
                                beginDrag(event, codesForDrag(booking.code))
                              }}
                              onDragEnd={() => {
                                setDragCodes(null)
                                setDropTarget(null)
                              }}
                              onClick={() => {
                                if (!needsSplit) toggleCode(booking.code)
                              }}
                              className={cn(
                                'rounded-xl border px-3 py-2.5 transition-all select-none',
                                needsSplit
                                  ? 'cursor-default border-amber-300 bg-amber-50'
                                  : 'cursor-grab border-teal-900/8 bg-white active:cursor-grabbing',
                                checked &&
                                  !needsSplit &&
                                  'border-teal-600/40 bg-teal-50 shadow-sm',
                                isDragging && 'opacity-40',
                                !needsSplit &&
                                  !checked &&
                                  'hover:border-teal-700/25 hover:bg-teal-50/40',
                              )}
                            >
                              <div className="flex items-start gap-2">
                                {!needsSplit ? (
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 size-3.5 shrink-0 rounded border-teal-900/25 accent-teal-700"
                                    checked={checked}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={() => toggleCode(booking.code)}
                                    aria-label={`Select ${booking.leadGuest}`}
                                  />
                                ) : (
                                  <span className="mt-0.5 size-3.5 shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="truncate text-sm font-semibold text-teal-950">
                                      {booking.pickupHotel || '—'}
                                      {booking.roomNumber ? (
                                        <span className="font-medium text-teal-900/55">
                                          {' '}
                                          · Rm {booking.roomNumber}
                                        </span>
                                      ) : null}
                                    </p>
                                    <span
                                      className={cn(
                                        'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                                        needsSplit
                                          ? 'bg-amber-200/80 text-amber-950'
                                          : 'bg-teal-950/[0.06] text-teal-900',
                                      )}
                                    >
                                      {pax}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 truncate text-xs text-teal-900/70">
                                    {booking.leadGuest}
                                    <span className="text-teal-900/45">
                                      {' '}
                                      · {formatPaxBreakdown(booking)}
                                    </span>
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-teal-900/50">
                                    <span className="tabular-nums">{booking.pickupTime}</span>
                                    {booking.note ? (
                                      <span className="truncate">· {booking.note}</span>
                                    ) : null}
                                  </div>
                                  {needsSplit ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="mt-2 h-7 border-amber-400 bg-amber-100 px-2 text-[11px] text-amber-950 hover:bg-amber-200"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        setSplitCode(booking.code)
                                      }}
                                    >
                                      <SplitSquareVertical className="size-3" />
                                      Separate Van
                                    </Button>
                                  ) : null}
                                </div>
                                {!needsSplit ? (
                                  <GripVertical className="mt-0.5 size-4 shrink-0 text-teal-800/30" />
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ),
                  )
                )}
              </div>
            </Surface>

            {/* Right — van cards */}
            <div className="min-w-0 space-y-3">
              <div className="flex items-end justify-between gap-3 px-0.5">
                <div>
                  <h3 className="text-base font-semibold text-teal-950">Vans</h3>
                  <p className="mt-0.5 text-xs text-teal-900/55">
                    {DEFAULT_DAY_VAN_COUNT} vans ready · drop guests onto a card
                    {dragCodes?.length
                      ? ` · dragging ${dragCodes.length} · ${draggingPax} pax`
                      : ''}
                  </p>
                </div>
                {selectedList.length > 0 ? (
                  <p className="text-xs font-medium text-teal-800">
                    Tap a van to seat {selectedList.length} guest
                    {selectedList.length === 1 ? '' : 's'}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {byVan.map(
                  ({
                    van,
                    pax,
                    zone,
                    items,
                    over,
                    seats,
                    crew,
                    assignedBoat,
                    boatMixed,
                    isEmptySlot,
                    isPreparedEmpty,
                    isSpecial,
                  }) => {
                    const isDrop = dropTarget === van && !!dragCodes?.length
                    const projected = isDrop ? pax + draggingPax : pax
                    const projectedOver = projected > seats
                    const isVacant = items.length === 0

                    return (
                      <div
                        key={van}
                        onDragOver={(event) => {
                          if (!dragCodes?.length) return
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                          if (dropTarget !== van) setDropTarget(van)
                        }}
                        onDragLeave={() => {
                          if (dropTarget === van) setDropTarget(null)
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          const codes = readDragCodes(event, dragCodes)
                          setDragCodes(null)
                          setDropTarget(null)
                          assignDropped(codes, van)
                        }}
                        className={cn(
                          'flex min-h-[14rem] flex-col rounded-2xl border bg-white/95 shadow-[0_12px_40px_-28px_rgba(15,118,110,0.35)] transition-all',
                          over || projectedOver
                            ? 'border-amber-500/45'
                            : isDrop
                              ? 'border-teal-600/50 ring-2 ring-teal-600/25'
                              : isSpecial
                                ? 'border-sky-600/25'
                                : isEmptySlot
                                ? 'border-dashed border-teal-900/18'
                                : isPreparedEmpty
                                  ? 'border-dashed border-teal-900/14'
                                  : 'border-teal-900/8',
                          selectedList.length > 0 && 'cursor-pointer',
                          selectedList.length > 0 &&
                            isVacant &&
                            'hover:border-teal-700/35 hover:bg-teal-50/30',
                        )}
                        onClick={() => {
                          if (selectedList.length === 0) return
                          assignDropped(selectedList, van)
                        }}
                      >
                        <div className="border-b border-teal-900/6 px-3.5 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                              <span
                                className={cn(
                                  'flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
                                  isEmptySlot
                                    ? 'bg-teal-950/[0.04] text-teal-800/50'
                                    : isSpecial
                                      ? 'bg-sky-700 text-white'
                                    : isPreparedEmpty
                                      ? 'bg-teal-800/80 text-white'
                                      : 'bg-teal-800 text-white',
                                )}
                              >
                                {isEmptySlot ? <Plus className="size-4" /> : van}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-teal-950">
                                  {isEmptySlot
                                    ? `New van ${van}`
                                    : isSpecial
                                      ? `${specialTransferKindLabel(crew.specialKind)} ${van}`
                                      : `Van ${van}`}
                                </p>
                                <p className="truncate text-[11px] text-teal-900/50">
                                  {items.length > 0
                                    ? zone
                                    : isSpecial
                                      ? specialTransferDirectionLabel(crew) || 'Special transfer'
                                      : isEmptySlot
                                        ? 'New van'
                                        : 'Ready'}
                                </p>
                                {isSpecial ? (
                                  <span className="mt-1 inline-flex rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sky-900 uppercase">
                                    {specialTransferKindLabel(crew.specialKind)}
                                    {formatThb(crew.chargeAmount ?? 0)
                                      ? ` · ${formatThb(crew.chargeAmount ?? 0)}`
                                      : ''}
                                  </span>
                                ) : crew.outsourced ? (
                                  <span className="mt-1 inline-flex rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-violet-900 uppercase">
                                    {vanOutsourceLabel(crew)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <VanCapacityButton
                              van={van}
                              pax={isDrop ? projected : pax}
                              seats={seats}
                              defaultSeats={capacity}
                              over={projectedOver}
                              preview={isDrop ? `${pax}→${projected}` : null}
                              onChange={(next) => onVanMeta(van, { capacity: next })}
                            />
                          </div>
                          <VanCrewDetails
                            van={van}
                            crew={crew}
                            onChange={(patch) => onVanMeta(van, patch)}
                          />
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {isEmptySlot || isPreparedEmpty || isSpecial ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onSpecialVan(van)
                                }}
                              >
                                {isSpecial ? 'Special' : 'Special transfer'}
                              </Button>
                            ) : null}
                            {!isEmptySlot ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setOpenVan(van)
                                }}
                              >
                                Details
                              </Button>
                            ) : null}
                              {items.some(
                                (item) => totalPassengers(item.booking) > seats,
                              ) ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    const oversized = items.find(
                                      (item) => totalPassengers(item.booking) > seats,
                                    )
                                    if (oversized) setSplitCode(oversized.booking.code)
                                  }}
                                >
                                  <SplitSquareVertical className="size-3" />
                                  Split
                                </Button>
                              ) : null}
                          </div>
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2.5">
                          {items.length === 0 ? (
                            <div
                              className={cn(
                                'flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-3 py-6 text-center',
                                isDrop
                                  ? 'border-teal-600/40 bg-teal-50/60 text-teal-800'
                                  : 'border-teal-900/10 text-teal-900/40',
                              )}
                            >
                              <Users className="mb-2 size-5 opacity-50" />
                              <p className="text-xs font-medium">
                                {isDrop
                                  ? 'Drop to seat here'
                                  : isSpecial
                                    ? 'Special transfer — drop guests if needed'
                                    : 'Empty — drop guests'}
                              </p>
                            </div>
                          ) : (
                            items.map(({ booking, paxOnVan: legPax, legs }) => {
                              const split = (legs?.length ?? 0) > 1
                              const isDragging = dragCodes?.includes(booking.code)
                              return (
                                <div
                                  key={`${van}-${booking.code}`}
                                  draggable
                                  onDragStart={(event) => {
                                    event.stopPropagation()
                                    beginDrag(event, [booking.code])
                                  }}
                                  onDragEnd={() => {
                                    setDragCodes(null)
                                    setDropTarget(null)
                                  }}
                                  onClick={(event) => event.stopPropagation()}
                                  className={cn(
                                    'cursor-grab rounded-lg border border-teal-900/8 bg-teal-950/[0.02] px-2.5 py-2 active:cursor-grabbing',
                                    isDragging && 'opacity-40',
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-teal-950">
                                        {booking.pickupHotel || '—'}
                                        {booking.roomNumber ? ` · ${booking.roomNumber}` : ''}
                                      </p>
                                      <p className="mt-0.5 truncate text-[11px] text-teal-900/55">
                                        {booking.leadGuest}
                                      </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <p className="text-xs font-semibold tabular-nums text-teal-900">
                                        {legPax}
                                        {split ? (
                                          <span className="ml-1 font-normal text-teal-900/45">
                                            split
                                          </span>
                                        ) : null}
                                      </p>
                                      <p className="text-[10px] tabular-nums text-teal-900/45">
                                        {booking.pickupTime}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>

                        {!isEmptySlot && items.length > 0 ? (
                          <div
                            className="border-t border-teal-900/6 px-3 py-2.5"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-teal-800/55 uppercase">
                              Boat
                              {assignedBoat
                                ? ` · ${assignedBoat}`
                                : boatMixed
                                  ? ' · mixed'
                                  : ''}
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
                        ) : null}
                      </div>
                    )
                  },
                )}
              </div>
            </div>
          </div>

          {byVan.some((v) => v.items.length > 0) || boatAssignedCount > 0 ? (
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
                    Tap a boat number on each van card, or auto-assign so each van stays together.
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
                {byBoat.map(({ boat, capacity: boatCap, pax, items, over }) => {
                  const theme = boatTheme(boat)
                  return (
                  <div
                    key={boat}
                    className={cn(
                      'rounded-xl border px-3 py-3',
                      over ? 'border-amber-400 bg-amber-50/50' : theme.sheet,
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <span className={cn('mt-1 size-2.5 shrink-0 rounded-full', theme.swatch)} />
                        <div className="min-w-0">
                          <p className={cn('truncate text-sm font-semibold leading-tight', theme.title)}>
                            {boatDisplayName(boatPlan, boat)}
                          </p>
                          <span
                            className={cn(
                              'mt-0.5 inline-flex rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                              theme.softBadge,
                            )}
                          >
                            {theme.colorName}
                          </span>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums',
                          over ? 'bg-amber-100 text-amber-900' : 'bg-white/80 text-teal-800',
                        )}
                      >
                        {pax}/{boatCap}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-teal-900/50">
                      {items.length} booking{items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  )
                })}
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
        </div>
      )}

      <div className="mt-5 print:hidden">
        <DriverJobOrderLaunchCard onClick={onOpenJobOrder} />
      </div>

      <SpecialTransferDialog
        open={specialVan !== null}
        van={specialVan}
        initial={specialVan !== null ? resolveVanMeta(specialVan, plan.vanMeta[String(specialVan)]) : null}
        onOpenChange={(open) => {
          if (!open) onSpecialVan(null)
        }}
        onSave={(draft) => {
          if (specialVan === null) return
          onVanMeta(specialVan, specialTransferToMeta(draft))
        }}
        onRemove={
          specialVan !== null && isSpecialTransfer(plan.vanMeta[String(specialVan)])
            ? () => {
                onVanMeta(specialVan, {
                  specialKind: null,
                  transferIn: false,
                  transferOut: false,
                  chargeAmount: 0,
                })
              }
            : undefined
        }
      />

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
                  {openDetail.seats} pax · {openDetail.items.length} booking
                  {openDetail.items.length === 1 ? '' : 's'}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                <div className="space-y-1.5">
                  <Label htmlFor={`van-seats-${openVan}`}>Seats today</Label>
                  <Input
                    id={`van-seats-${openVan}`}
                    type="number"
                    min={MIN_VAN_CAPACITY}
                    max={MAX_VAN_CAPACITY}
                    value={openDetail.seats}
                    onChange={(event) =>
                      onVanMeta(openVan, { capacity: clampVanCapacity(Number(event.target.value)) })
                    }
                    className="h-10"
                  />
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm font-medium text-teal-950">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-teal-900/25 text-violet-700"
                    checked={openMeta.outsourced === true}
                    onChange={(event) =>
                      onVanMeta(openVan, {
                        outsourced: event.target.checked,
                        outsourceCompany: event.target.checked ? openMeta.outsourceCompany : '',
                      })
                    }
                  />
                  Outsource van company
                </label>
                {openMeta.outsourced ? (
                  <div className="space-y-1.5">
                    <Label htmlFor={`van-outsource-${openVan}`}>Company name</Label>
                    <Input
                      id={`van-outsource-${openVan}`}
                      value={openMeta.outsourceCompany ?? ''}
                      onChange={(event) =>
                        onVanMeta(openVan, { outsourceCompany: event.target.value })
                      }
                      placeholder="e.g. Phuket Transfer Co"
                      className="h-10"
                    />
                  </div>
                ) : null}
              </div>
              {isSpecialTransfer(openMeta) ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2.5">
                  <p className="text-sm text-sky-950">
                    <span className="font-semibold">
                      {specialTransferKindLabel(openMeta.specialKind)}
                    </span>
                    {specialTransferDirectionLabel(openMeta)
                      ? ` · ${specialTransferDirectionLabel(openMeta)}`
                      : ''}
                    {formatThb(openMeta.chargeAmount ?? 0)
                      ? ` · ${formatThb(openMeta.chargeAmount ?? 0)}`
                      : ''}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      onSpecialVan(openVan)
                    }}
                  >
                    Edit special
                  </Button>
                </div>
              ) : (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onSpecialVan(openVan)}
                  >
                    <Car data-icon="inline-start" />
                    Mark as special transfer
                  </Button>
                </div>
              )}
              <p className="mt-2 text-xs text-teal-800/55">
                Driver, plate, and phone apply to this day only. The next day starts blank. Seat
                count is also only for this day.
              </p>

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
                {booking.leadGuest} · {total} pax (over {capacity}). Choose how many guests go on
                each van.
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
                  remaining === 0 ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-900',
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
