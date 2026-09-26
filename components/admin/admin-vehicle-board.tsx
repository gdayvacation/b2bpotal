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
import { GuideJobOrderPrint, printGuideJobOrder } from '@/components/admin/guide-job-order-print'
import {
  SpecialTransferDialog,
  specialTransferToMeta,
} from '@/components/admin/special-transfer-dialog'
import { DriverNameField } from '@/components/driver-name-field'
import { OutsourceCompanyField } from '@/components/outsource-company-field'
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
import { boatFleetNumber, boatTheme, boatThemeFor, PARTNER_BOAT_THEME } from '@/lib/boat-theme'
import { usePortalDefaultDateISO } from '@/lib/use-portal-today'
import {
  DEFAULT_BOAT_CAPACITY,
  DEFAULT_VAN_CAPACITY,
  MIN_VAN_CAPACITY,
  MAX_VAN_CAPACITY,
  MAX_DAY_BOATS,
  boatDisplayName,
  boatNumbersForPlan,
  clampVanCapacity,
  bookingTransferKind,
  isPartnerBoat,
  isVirtualVan,
  emptyBoatGuide,
  emptyVanMeta,
  formatPaxBreakdown,
  isActiveBooking,
  isNoTransfer,
  isNoTransferVan,
  isSpecialTransfer,
  NO_TRANSFER_VAN_LABEL,
  NO_TRANSFER_VAN_NUMBER,
  DUMMY_VAN_NUMBER,
  TRANSFER_KIND_LABELS,
  specialTransferDirectionLabel,
  specialTransferKindLabel,
  totalPassengers,
  vanOutsourceLabel,
  vanSeatCapacity,
  vanTransferKind,
  type BookingTransferKind,
  type TransferKind,
  type BoatNumber,
  type Booking,
  type DayBoatPlan,
  type DayVehiclePlan,
  type Program,
  type VanMeta,
  type VanSplit,
} from '@/lib/types'
import {
  allocatePaxBreakdown,
  bookingPaxOnVan,
  currentPaxOnVan,
  listFleetVanNumbers,
  primaryVan,
  sortOrderOnVan,
  suggestVanSplit,
} from '@/lib/vehicle-assign'
import { cn } from '@/lib/utils'

const DRAG_MIME = 'application/x-gday-van-codes'
/** Always show this many van cards ready to receive guests. */
const DEFAULT_DAY_VAN_COUNT = 3

function listedDayVans(plan: DayVehiclePlan | null) {
  if (!plan) return [] as number[]
  const assigned = listFleetVanNumbers(plan.assignments)
  const saved = Object.keys(plan.vanMeta ?? {})
    .map(Number)
    .filter((van) => Number.isFinite(van) && van >= 1 && !isVirtualVan(van))
  return [...new Set([...assigned, ...saved])]
}

function vanBoardLabel(van: number, plan: DayVehiclePlan) {
  if (isNoTransferVan(van)) return NO_TRANSFER_VAN_LABEL
  const meta = plan.vanMeta[String(van)]
  if (meta?.specialKind === 'partner') {
    return meta.outsourceCompany || meta.label || 'Tour partner'
  }
  if (isSpecialTransfer(meta)) {
    return meta?.label || `${specialTransferKindLabel(meta?.specialKind)} ${van}`
  }
  return `Van ${van}`
}

function nextAvailableVan(plan: DayVehiclePlan | null) {
  const listed = listedDayVans(plan)
  const maxVan = listed.length > 0 ? Math.max(...listed) : 0
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

export function VehicleDailyBoard({ onBack }: { onBack?: () => void }) {
  const {
    bookings,
    getDayVehiclePlan,
    getDayBoatPlan,
    assignBookingsToVan,
    assignVanToBoat,
    assignVanToPartnerBoat,
    addPartnerVan,
    autoAssignDayBoats,
    clearDayBoatAssignments,
    setBookingVanSplits,
    setVanMeta,
    reorderVanBookings,
    autoAssignDayVans,
    clearDayVanAssignments,
    removeDayVan,
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
    return dayBookings.filter((booking) => booking.program === program)
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
        backLabel="จัดการรถ / เรือ / ไกด์"
        initialDate={selectedDate}
        initialProgram={program ?? undefined}
        onBack={() => setJobOrderOpen(false)}
      />
    )
  }

  return (
    <div className="w-full">
      <div className="print:hidden">
        {onBack ? (
          <div className="mb-4">
            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
              <ArrowLeft className="size-3.5" />
              Daily Board
            </Button>
          </div>
        ) : null}
        <PageHeader
          title="จัดการรถ / เรือ / ไกด์"
          description="Van, boat, and guide on this page. Driver JO, Guide JO, VAN report, and Pay all read from these assignments."
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
          onAssignMany={(codes, van) =>
            assignBookingsToVan(selectedDate, program, codes, van)
          }
          onAssignVanToBoat={(van, boat) =>
            assignVanToBoat(selectedDate, program, van, boat)
          }
          onAssignVanToPartnerBoat={(van) =>
            assignVanToPartnerBoat(selectedDate, program, van)
          }
          onAddPartnerVan={(company, codes) => addPartnerVan(selectedDate, program, company, codes)}
          onAutoAssignBoats={() => autoAssignDayBoats(selectedDate, program)}
          onClearBoats={() => clearDayBoatAssignments(selectedDate, program)}
          onSaveSplits={(code, legs) => setBookingVanSplits(selectedDate, program, code, legs)}
          onVanMeta={(van, meta) => setVanMeta(selectedDate, program, van, meta)}
          onReorderVan={(van, orderedCodes) =>
            reorderVanBookings(selectedDate, program, van, orderedCodes)
          }
          onAutoAssign={() => autoAssignDayVans(selectedDate, program)}
          onClear={() => clearDayVanAssignments(selectedDate, program)}
          onRemoveVan={(van) => removeDayVan(selectedDate, program, van)}
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

function vanCardTitle(van: number, crew: VanMeta, flags?: { empty?: boolean; noTransfer?: boolean }) {
  if (flags?.empty) return `New van ${van}`
  if (flags?.noTransfer) return NO_TRANSFER_VAN_LABEL
  if (crew.specialKind === 'partner') return crew.outsourceCompany || crew.label || 'Tour partner'
  if (crew.specialKind === 'private' || crew.specialKind === 'outsource') {
    return crew.label || `${specialTransferKindLabel(crew.specialKind)} ${van}`
  }
  const custom = crew.label?.trim() ?? ''
  if (custom && custom !== 'Company van') return custom
  return `Van ${van}`
}

function vanNamePatch(crew: VanMeta, name: string): Partial<VanMeta> {
  const trimmed = name.trim()
  if (crew.specialKind === 'partner') {
    return { outsourceCompany: trimmed, label: trimmed, plate: crew.plate.trim() ? crew.plate : trimmed }
  }
  if (crew.specialKind === 'outsource' || crew.outsourced) {
    return { outsourceCompany: trimmed, label: trimmed, outsourced: true }
  }
  return { label: trimmed }
}

function VanNameField({
  van,
  meta,
  empty,
  noTransfer,
  onChange,
}: {
  van: number
  meta: VanMeta
  empty?: boolean
  noTransfer?: boolean
  onChange: (patch: Partial<VanMeta>) => void
}) {
  const title = vanCardTitle(van, meta, { empty, noTransfer })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const locked = empty || noTransfer

  function commit() {
    const next = draft.trim()
    setEditing(false)
    if (!next || next === title) {
      setDraft(title)
      return
    }
    onChange(vanNamePatch(meta, next))
  }

  if (locked) {
    return <p className="text-sm font-semibold text-teal-950">{title}</p>
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') {
            setDraft(title)
            setEditing(false)
          }
        }}
        className="h-7 max-w-[11rem] px-2 text-sm font-semibold"
      />
    )
  }

  return (
    <button
      type="button"
      title="Click to rename van or company"
      className="flex min-w-0 items-center gap-1 text-left"
      onClick={(event) => {
        event.stopPropagation()
        setDraft(title)
        setEditing(true)
      }}
    >
      <p className="truncate text-sm font-semibold text-teal-950">{title}</p>
      <Pencil className="size-3 shrink-0 text-teal-900/35" />
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
          Van {van} · details
        </p>
        <div className="space-y-1.5">
          <Label htmlFor={`card-name-${van}`}>
            {crew.specialKind === 'partner' || crew.specialKind === 'outsource' || crew.outsourced
              ? 'Company name'
              : 'Van name'}
          </Label>
          <Input
            id={`card-name-${van}`}
            value={
              crew.specialKind === 'partner'
                ? crew.outsourceCompany || crew.label || ''
                : crew.label || ''
            }
            onChange={(event) => onChange(vanNamePatch(crew, event.target.value))}
            placeholder={crew.specialKind === 'partner' ? 'Partner company' : `Van ${van}`}
            className="h-9"
          />
        </div>
        <DriverNameField
          id={`card-driver-${van}`}
          value={crew.driver}
          phone={crew.phone}
          plate={crew.plate}
          onSelect={(entry) =>
            onChange({ driver: entry.name, phone: entry.phone, plate: entry.plate })
          }
          onNameChange={(driver) => onChange({ driver })}
          size="sm"
        />
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
          <OutsourceCompanyField
            id={`card-outsource-${van}`}
            value={crew.outsourceCompany ?? ''}
            onChange={(outsourceCompany) => onChange({ outsourceCompany })}
            size="sm"
          />
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor={`card-charge-${van}`}>
            {crew.outsourced ? 'Company price (invoice check & pay)' : 'Charge amount'}
          </Label>
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
          {crew.outsourced
            ? 'Company and price stay on the VAN report so accounts can check and pay.'
            : 'Saved for this day only. The next day starts blank.'}
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

const TRANSFER_KIND_BADGE: Record<
  BookingTransferKind,
  { label: string; className: string }
> = {
  unassigned: {
    label: 'Waiting',
    className: 'bg-amber-100 text-amber-950',
  },
  company: {
    label: TRANSFER_KIND_LABELS.company,
    className: 'bg-teal-100 text-teal-950',
  },
  outsource: {
    label: TRANSFER_KIND_LABELS.outsource,
    className: 'bg-violet-100 text-violet-950',
  },
  no_transfer: {
    label: TRANSFER_KIND_LABELS.no_transfer,
    className: 'bg-stone-200 text-stone-800',
  },
  private: {
    label: TRANSFER_KIND_LABELS.private,
    className: 'bg-sky-100 text-sky-950',
  },
  partner: {
    label: TRANSFER_KIND_LABELS.partner,
    className: 'bg-neutral-200 text-neutral-800',
  },
}

function TransferKindBadge({ kind }: { kind: BookingTransferKind }) {
  const badge = TRANSFER_KIND_BADGE[kind]
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
        badge.className,
      )}
    >
      {badge.label}
    </span>
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
  onAssignVanToPartnerBoat,
  onAddPartnerVan,
  onAutoAssignBoats,
  onClearBoats,
  onSaveSplits,
  onVanMeta,
  onReorderVan,
  onAutoAssign,
  onClear,
  onRemoveVan,
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
  onAssignVanToPartnerBoat: (van: number) => void
  onAddPartnerVan: (company: string, codes: string[]) => number | null
  onAutoAssignBoats: () => void
  onClearBoats: () => void
  onSaveSplits: (code: string, legs: VanSplit[]) => void
  onVanMeta: (
    van: number,
    meta: Omit<Partial<VanMeta>, 'capacity' | 'specialKind'> & {
      capacity?: number | null
      specialKind?: VanMeta['specialKind'] | null
    },
  ) => void
  onReorderVan: (van: number, orderedCodes: string[]) => void
  onAutoAssign: () => void
  onClear: () => void
  onRemoveVan: (van: number) => void
  onOpenJobOrder: () => void
  specialVan: number | null
  onSpecialVan: (van: number | null) => void
}) {
  const {
    resolveVanMeta,
    addDayBoat,
    removeDayBoat,
    setBoatName,
    setBoatLabel,
    setBoatGuide,
    assignBookingToBoat,
    getCheckInServices,
  } = usePortal()
  const [openVan, setOpenVan] = useState<number | null>(null)
  const [splitCode, setSplitCode] = useState<string | null>(null)
  const [addVanOpen, setAddVanOpen] = useState(false)
  const [privateDraftOpen, setPrivateDraftOpen] = useState(false)
  const [partnerDraftOpen, setPartnerDraftOpen] = useState(false)
  const [privateName, setPrivateName] = useState('')
  const [privateNumber, setPrivateNumber] = useState('')
  const [partnerCompany, setPartnerCompany] = useState('')
  const [rentalCapacity, setRentalCapacity] = useState(60)
  const [showAssistantFor, setShowAssistantFor] = useState<Record<number, boolean>>({})
  const [sheetQuery, setSheetQuery] = useState('')
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => new Set())
  const [dragCodes, setDragCodes] = useState<string[] | null>(null)
  const [kindFilter, setKindFilter] = useState<'all' | 'no_transfer'>('all')
  const [dropTarget, setDropTarget] = useState<
    'pool' | TransferKind | number | `boat-${number}` | null
  >(null)
  const [dragCode, setDragCode] = useState<string | null>(null)
  const [dragOverCode, setDragOverCode] = useState<string | null>(null)

  const capacity = plan.vanCapacity || DEFAULT_VAN_CAPACITY
  const listedVans = listedDayVans(plan)
  const maxVan = listedVans.length > 0 ? Math.max(...listedVans) : 0
  const nextEmptyVan = Math.max(maxVan, DEFAULT_DAY_VAN_COUNT) + 1
  const showNoTransferCard =
    Boolean(plan.vanMeta[String(NO_TRANSFER_VAN_NUMBER)]) ||
    Object.values(plan.assignments).some((legs) =>
      legs.some((leg) => isNoTransferVan(leg.van)),
    )
  const boardVans = Array.from(
    { length: Math.max(DEFAULT_DAY_VAN_COUNT, maxVan) },
    (_, i) => i + 1,
  ).concat(showNoTransferCard ? [NO_TRANSFER_VAN_NUMBER] : [])

  useEffect(() => {
    setSheetQuery('')
    setKindFilter('all')
    setSelectedCodes(new Set())
    setDragCodes(null)
    setDropTarget(null)
  }, [date, program])

  useEffect(() => {
    for (const booking of bookings) {
      const boat = boatPlan.assignments[booking.code]
      if (!boat || !isPartnerBoat(boatPlan, boat)) continue
      if (isNoTransfer(booking.pickupZone)) continue
      if (plan.assignments[booking.code]?.length) continue
      assignBookingToBoat(date, program, booking.code, boat)
    }
  }, [assignBookingToBoat, boatPlan, bookings, date, plan.assignments, program])

  useEffect(() => {
    for (const [key, meta] of Object.entries(plan.vanMeta)) {
      const van = Number(key)
      if (!Number.isFinite(van) || vanTransferKind(van, meta) !== 'partner') continue
      const company = (meta.outsourceCompany || meta.label || '').trim().toLowerCase()
      const partnerBoats = boatNumbersForPlan(boatPlan).filter((boat) =>
        isPartnerBoat(boatPlan, boat),
      )
      const linked =
        partnerBoats.find((boat) => {
          const name = (boatPlan.names[boat - 1] ?? '').trim().toLowerCase()
          const label = (boatPlan.labels[boat - 1] ?? '').trim().toLowerCase()
          return Boolean(company) && (name === company || label === company)
        }) ?? (partnerBoats.length === 1 ? partnerBoats[0] : null)
      const unassigned = bookings.filter(
        (booking) =>
          bookingPaxOnVan(booking, plan.assignments[booking.code], van) > 0 &&
          !boatPlan.assignments[booking.code],
      )
      if (!linked) {
        onAssignVanToPartnerBoat(van)
        continue
      }
      for (const booking of unassigned) {
        assignBookingToBoat(date, program, booking.code, linked)
      }
    }
  }, [
    assignBookingToBoat,
    boatPlan,
    bookings,
    date,
    onAssignVanToPartnerBoat,
    plan.assignments,
    plan.vanMeta,
    program,
  ])

  const listBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const kindA = bookingTransferKind(a, plan, boatPlan)
      const kindB = bookingTransferKind(b, plan, boatPlan)
      const waitingA = kindA === 'unassigned' ? 0 : 1
      const waitingB = kindB === 'unassigned' ? 0 : 1
      const needsA = totalPassengers(a) > capacity ? 0 : 1
      const needsB = totalPassengers(b) > capacity ? 0 : 1
      return (
        waitingA - waitingB ||
        needsA - needsB ||
        a.pickupZone.localeCompare(b.pickupZone) ||
        a.pickupTime.localeCompare(b.pickupTime) ||
        a.pickupHotel.localeCompare(b.pickupHotel) ||
        a.code.localeCompare(b.code)
      )
    })
  }, [bookings, boatPlan, plan, capacity])

  const poolBookings = useMemo(
    () =>
      listBookings.filter(
        (booking) => bookingTransferKind(booking, plan, boatPlan) === 'unassigned',
      ),
    [listBookings, plan, boatPlan],
  )

  const kindCounts = useMemo(() => {
    const counts: Record<BookingTransferKind | 'all', number> = {
      all: 0,
      unassigned: 0,
      company: 0,
      outsource: 0,
      no_transfer: 0,
      private: 0,
      partner: 0,
    }
    for (const booking of listBookings) {
      const kind = bookingTransferKind(booking, plan, boatPlan)
      counts[kind] += 1
      if (kind === 'unassigned') counts.all += 1
    }
    return counts
  }, [listBookings, plan, boatPlan])

  const sheetRows = useMemo(() => {
    let rows = listBookings
    if (kindFilter === 'no_transfer') {
      rows = rows.filter(
        (booking) => bookingTransferKind(booking, plan, boatPlan) === 'no_transfer',
      )
    } else {
      rows = rows.filter(
        (booking) => bookingTransferKind(booking, plan, boatPlan) === 'unassigned',
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
  }, [listBookings, sheetQuery, kindFilter, plan, boatPlan])

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
      if (van === null || isVirtualVan(van)) return true
      const legs = plan.assignments[code]
      const vanCap = vanSeatCapacity(plan, van)
      const needsSplit = totalPassengers(booking) > vanCap && (legs?.length ?? 0) <= 1
      return !needsSplit
    })
    if (unique.length === 0) return
    onAssignMany(unique, van)
    setSelectedCodes(new Set())
  }

  function assignToKind(codes: string[], kind: TransferKind) {
    if (kind === 'no_transfer') {
      assignDropped(codes, NO_TRANSFER_VAN_NUMBER)
      return
    }
    if (kind === 'partner') {
      const partnerVan =
        listFleetVanNumbers(plan.assignments)
          .concat(
            Object.keys(plan.vanMeta ?? {})
              .map(Number)
              .filter((van) => Number.isFinite(van) && van >= 1 && !isVirtualVan(van)),
          )
          .find((van) => vanTransferKind(van, plan.vanMeta[String(van)]) === 'partner') ??
        DUMMY_VAN_NUMBER
      assignDropped(codes, partnerVan)
      return
    }
    const fleet = listFleetVanNumbers(plan.assignments)
    const saved = Object.keys(plan.vanMeta ?? {})
      .map(Number)
      .filter((van) => Number.isFinite(van) && van >= 1 && !isVirtualVan(van))
    const match = [...new Set([...fleet, ...saved])].find(
      (van) => vanTransferKind(van, plan.vanMeta[String(van)]) === kind,
    )
    const target = match ?? nextEmptyVan
    if (kind === 'outsource' && vanTransferKind(target, plan.vanMeta[String(target)]) !== 'outsource') {
      onVanMeta(target, { outsourced: true })
    }
    if (kind === 'private' && vanTransferKind(target, plan.vanMeta[String(target)]) !== 'private') {
      setPrivateDraftOpen(true)
      return
    }
    assignDropped(codes, target)
  }

  function createPrivateVan() {
    const name = privateName.trim()
    const number = privateNumber.trim()
    if (!name && !number) return
    const van = nextEmptyVan
    onVanMeta(van, {
      specialKind: 'private',
      label: name,
      plate: number,
    })
    if (selectedList.length > 0) assignDropped(selectedList, van)
    setPrivateName('')
    setPrivateNumber('')
    setPrivateDraftOpen(false)
  }

  function createPartnerVan() {
    const company = partnerCompany.trim()
    if (!company) return
    onAddPartnerVan(company, selectedList)
    setSelectedCodes(new Set())
    setPartnerCompany('')
    setPartnerDraftOpen(false)
  }

  function assignToPartnerBoat(codes: string[], boat: BoatNumber) {
    const unique = [...new Set(codes)].filter((code) => bookings.some((item) => item.code === code))
    if (unique.length === 0) return
    for (const code of unique) {
      assignBookingToBoat(date, program, code, boat)
    }
    setSelectedCodes(new Set())
    setDragCodes(null)
    setDropTarget(null)
  }

  const totalPax = bookings.reduce((sum, b) => sum + totalPassengers(b), 0)
  const assignedCount = bookings.filter((b) => (plan.assignments[b.code]?.length ?? 0) > 0).length
  const noTransferPax = noTransferBookings.reduce((sum, b) => sum + totalPassengers(b), 0)

  const needsSeparate = bookings.filter((booking) => {
    const kind = bookingTransferKind(booking, plan, boatPlan)
    if (kind === 'no_transfer' || kind === 'partner') return false
    const pax = totalPassengers(booking)
    const legs = plan.assignments[booking.code]
    if (pax <= capacity) return false
    return !legs?.length || legs.length === 1
  })

  const byVan = boardVans.map((van) => {
    const isNoTransferCard = isNoTransferVan(van)
    const items = bookings
      .map((booking) => {
        if (isNoTransferCard) {
          const onThis = bookingPaxOnVan(booking, plan.assignments[booking.code], van)
          const kind = bookingTransferKind(booking, plan, boatPlan)
          if (onThis <= 0 && kind !== 'no_transfer') return null
          return {
            booking,
            paxOnVan: onThis > 0 ? onThis : totalPassengers(booking),
            legs: plan.assignments[booking.code],
          }
        }
        const onThis = bookingPaxOnVan(booking, plan.assignments[booking.code], van)
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
    const seats = isNoTransferCard ? pax || capacity : vanSeatCapacity(plan, van)
    const crew = resolveVanMeta(van, plan.vanMeta[String(van)])
    const zone =
      items.length > 0
        ? [...new Set(items.map((item) => item.booking.pickupZone))].join(', ')
        : isNoTransferCard
          ? 'Guest goes to the pier'
          : 'Drop guests here'
    const boatVotes = new Map<BoatNumber, number>()
    for (const item of items) {
      const boat = boatPlan.assignments[item.booking.code]
      if (boat) boatVotes.set(boat, (boatVotes.get(boat) ?? 0) + 1)
    }
    let assignedBoat: BoatNumber | null = null
    if (boatVotes.size === 1) {
      assignedBoat = [...boatVotes.keys()][0]
    } else if (boatVotes.size === 0 && crew.specialKind === 'partner') {
      const company = (crew.outsourceCompany || crew.label || '').trim().toLowerCase()
      const partnerBoats = boatNumbersForPlan(boatPlan).filter((boat) =>
        isPartnerBoat(boatPlan, boat),
      )
      assignedBoat =
        partnerBoats.find((boat) => {
          const name = (boatPlan.names[boat - 1] ?? '').trim().toLowerCase()
          const label = (boatPlan.labels[boat - 1] ?? '').trim().toLowerCase()
          return Boolean(company) && (name === company || label === company)
        }) ??
        (partnerBoats.length === 1 ? partnerBoats[0] : null)
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
        : isNoTransferCard
          ? 'Drop guests with no hotel pickup'
          : isSpecial
          ? specialTransferDirectionLabel(crew) || specialTransferKindLabel(crew.specialKind)
          : isExtraSlot
            ? 'Drop guests here'
            : `Van ${van} ready`,
      over: isNoTransferCard ? false : pax > seats,
      seats,
      crew,
      assignedBoat,
      boatMixed,
      isSpecial,
      isNoTransferCard,
      isEmptySlot: isExtraSlot && items.length === 0 && !isSpecial,
      isPreparedEmpty: !isNoTransferCard && !isExtraSlot && items.length === 0 && !isSpecial,
    }
  })

  const boatNumbers = boatNumbersForPlan(boatPlan)
  const byBoat = boatNumbers.map((boat) => {
    const capacityBoat = boatPlan.capacities[boat - 1] || DEFAULT_BOAT_CAPACITY
    const items = bookings.filter((booking) => boatPlan.assignments[booking.code] === boat)
    const pax = items.reduce((sum, b) => sum + totalPassengers(b), 0)
    const groupMap = new Map<number | 'loose', { van: number | null; items: Booking[]; pax: number }>()
    for (const booking of items) {
      const van = primaryVan(plan.assignments[booking.code])
      const key = van ?? 'loose'
      const current = groupMap.get(key) ?? { van, items: [], pax: 0 }
      current.items.push(booking)
      current.pax += totalPassengers(booking)
      groupMap.set(key, current)
    }
    const groups = [...groupMap.values()].sort((a, b) => {
      if (a.van === null) return 1
      if (b.van === null) return -1
      if (isNoTransferVan(a.van) !== isNoTransferVan(b.van)) return isNoTransferVan(a.van) ? 1 : -1
      return a.van - b.van
    })
    return { boat, capacity: capacityBoat, items, pax, over: pax > capacityBoat, groups }
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
              {bookings.length} bookings · {totalPax} pax · {assignedCount} assigned · default{' '}
              {capacity} seats / van
              {noTransferBookings.length > 0
                ? ` · ${noTransferBookings.length} booked as no transfer (${noTransferPax} pax)`
                : ''}
            </p>
            <p className="mt-1 text-sm text-teal-900/45">
              Step 1 · set every guest’s van type. Step 2 · arrange boats. Step 3 · assign guides.
            </p>
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
                    <h3 className="text-base font-semibold text-teal-950">All bookings</h3>
                    <p className="mt-0.5 text-xs text-teal-900/55">
                      {kindFilter === 'no_transfer'
                        ? `${sheetRows.length} no transfers`
                        : `${sheetRows.length} waiting — drag onto a van`}
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

                <div
                  className="mt-2.5 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
                  role="tablist"
                  aria-label="Filter by transfer type"
                >
                  {(
                    [
                      ['all', 'All'],
                      ['no_transfer', 'No Transfers'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={kindFilter === key}
                      onClick={() => {
                        setKindFilter(key)
                        setSelectedCodes(new Set())
                      }}
                      className={cn(
                        'shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors',
                        kindFilter === key
                          ? 'bg-teal-800 text-white'
                          : 'bg-teal-950/[0.05] text-teal-900/70 hover:bg-teal-950/[0.09]',
                      )}
                    >
                      {label}
                      <span
                        className={cn(
                          'ml-1 tabular-nums',
                          kindFilter === key ? 'text-white/70' : 'text-teal-900/45',
                        )}
                      >
                        {kindCounts[key]}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="relative mt-2.5">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-teal-900/35" />
                  <Input
                    value={sheetQuery}
                    onChange={(event) => setSheetQuery(event.target.value)}
                    placeholder="Search guest, hotel…"
                    className="h-9 pl-8 text-sm"
                    aria-label="Search bookings"
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
                  'min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 transition-colors',
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
                      : kindFilter === 'no_transfer'
                        ? 'No no-transfer bookings.'
                        : bookings.length === 0
                          ? 'No bookings for this day.'
                          : 'No bookings match this filter.'}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {sheetRows.map((booking) => {
                      const pax = totalPassengers(booking)
                      const needsSplit = pax > capacity
                      const checked = selectedCodes.has(booking.code)
                      const isDragging = dragCodes?.includes(booking.code)
                      const transferKind = bookingTransferKind(booking, plan, boatPlan)

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
                            'rounded-lg border px-2 py-1.5 transition-all select-none',
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
                          <div className="flex items-center gap-1.5">
                            {!needsSplit ? (
                              <input
                                type="checkbox"
                                className="size-3.5 shrink-0 rounded border-teal-900/25 accent-teal-700"
                                checked={checked}
                                onClick={(event) => event.stopPropagation()}
                                onChange={() => toggleCode(booking.code)}
                                aria-label={`Select ${booking.leadGuest}`}
                              />
                            ) : (
                              <span className="size-3.5 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-[13px] leading-tight font-semibold text-teal-950">
                                  {booking.pickupHotel.trim() || booking.leadGuest}
                                  {booking.roomNumber ? (
                                    <span className="font-medium text-teal-900/55">
                                      {' '}
                                      · Rm {booking.roomNumber}
                                    </span>
                                  ) : null}
                                </p>
                                <span
                                  className={cn(
                                    'shrink-0 rounded px-1 py-px text-[10px] font-semibold tabular-nums',
                                    needsSplit
                                      ? 'bg-amber-200/80 text-amber-950'
                                      : 'bg-teal-950/[0.06] text-teal-900',
                                  )}
                                >
                                  {pax}
                                </span>
                              </div>
                              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight text-teal-900/65">
                                <span className="min-w-0 truncate">
                                  {booking.pickupHotel.trim()
                                    ? booking.leadGuest
                                    : formatPaxBreakdown(booking)}
                                  {booking.pickupHotel.trim() ? (
                                    <span className="text-teal-900/40">
                                      {' '}
                                      · {formatPaxBreakdown(booking)}
                                    </span>
                                  ) : null}
                                </span>
                                <TransferKindBadge kind={transferKind} />
                                <span className="shrink-0 tabular-nums text-teal-900/50">
                                  {booking.pickupTime}
                                </span>
                                {booking.note ? (
                                  <span className="min-w-0 truncate text-teal-900/45">
                                    · {booking.note}
                                  </span>
                                ) : null}
                              </div>
                              {needsSplit ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="mt-1.5 h-6 border-amber-400 bg-amber-100 px-2 text-[11px] text-amber-950 hover:bg-amber-200"
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
                              <GripVertical className="size-3.5 shrink-0 text-teal-800/30" />
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Surface>

            {/* Right — van cards */}
            <div className="min-w-0 space-y-3">
              <div className="flex flex-col gap-2 px-0.5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-teal-950">Transfer types</h3>
                  <p className="mt-0.5 text-xs text-teal-900/55">
                    Drop onto a type, or onto a specific van card
                    {dragCodes?.length
                      ? ` · dragging ${dragCodes.length} · ${draggingPax} pax`
                      : ''}
                    {selectedList.length > 0
                      ? ` · tap a type or van to seat ${selectedList.length}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onSpecialVan(nextEmptyVan)}
                  >
                    <Car className="size-3" />
                    Special Transfers
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={onOpenJobOrder}
                  >
                    <Printer className="size-3" />
                    Driver Job Order
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={onClear}
                  >
                    Clear vans
                  </Button>
                  <Button type="button" size="sm" className="h-7 px-2 text-[11px]" onClick={onAutoAssign}>
                    <Sparkles className="size-3" />
                    Auto-assign vans
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {(
                  [
                    {
                      kind: 'company' as const,
                      count: kindCounts.company,
                      hint: 'Our company van',
                    },
                    {
                      kind: 'outsource' as const,
                      count: kindCounts.outsource,
                      hint: 'Hired van company',
                    },
                    {
                      kind: 'no_transfer' as const,
                      count: kindCounts.no_transfer,
                      hint: 'Guest goes to pier',
                    },
                    {
                      kind: 'private' as const,
                      count: kindCounts.private,
                      hint: 'Charge syncs to invoice',
                    },
                    {
                      kind: 'partner' as const,
                      count: kindCounts.partner,
                      hint: 'Partner picks guests up',
                    },
                  ] as const
                ).map(({ kind, count, hint }) => {
                  const isDrop =
                    (dropTarget === kind ||
                      (kind === 'no_transfer' && dropTarget === 'no_transfer') ||
                      (kind === 'partner' && dropTarget === 'partner')) &&
                    !!dragCodes?.length
                  return (
                    <button
                      key={kind}
                      type="button"
                      onDragOver={(event) => {
                        if (!dragCodes?.length) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                        if (dropTarget !== kind) setDropTarget(kind)
                      }}
                      onDragLeave={() => {
                        if (
                          dropTarget === kind ||
                          dropTarget === 'no_transfer' ||
                          dropTarget === 'partner'
                        ) {
                          if (kind === dropTarget) setDropTarget(null)
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        const codes = readDragCodes(event, dragCodes)
                        setDragCodes(null)
                        setDropTarget(null)
                        assignToKind(codes, kind)
                      }}
                      onClick={() => {
                        if (selectedList.length === 0) return
                        assignToKind(selectedList, kind)
                      }}
                      className={cn(
                        'rounded-2xl border px-3 py-3 text-left transition-all',
                        isDrop
                          ? 'border-teal-600/50 bg-teal-50 ring-2 ring-teal-600/20'
                          : kind === 'partner'
                            ? 'border-neutral-200 bg-white'
                            : kind === 'private'
                              ? 'border-sky-200 bg-sky-50/40'
                              : kind === 'outsource'
                                ? 'border-violet-200 bg-violet-50/40'
                                : kind === 'no_transfer'
                                  ? 'border-stone-200 bg-stone-50'
                                  : 'border-teal-900/10 bg-white',
                        selectedList.length > 0 && 'cursor-pointer hover:border-teal-700/35',
                      )}
                    >
                      <TransferKindBadge kind={kind} />
                      <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-teal-950">
                        {count}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-teal-900/50">{hint}</p>
                    </button>
                  )
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 pt-1">
                <h3 className="text-base font-semibold text-teal-950">Step 1 · Van cards</h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setAddVanOpen(true)}
                  >
                    <Plus className="size-3" />
                    Add van
                  </Button>
                </div>
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
                    isNoTransferCard,
                  }) => {
                    const isDrop = dropTarget === van && !!dragCodes?.length
                    const projected = isDrop ? pax + draggingPax : pax
                    const projectedOver = !isNoTransferCard && projected > seats
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
                              : isNoTransferCard
                                ? 'border-stone-300 bg-stone-50/70'
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
                                    : isNoTransferCard
                                      ? 'bg-stone-700 text-white'
                                    : isSpecial
                                      ? 'bg-sky-700 text-white'
                                    : isPreparedEmpty
                                      ? 'bg-teal-800/80 text-white'
                                      : 'bg-teal-800 text-white',
                                )}
                              >
                                {isEmptySlot ? <Plus className="size-4" /> : isNoTransferCard ? 'NT' : van}
                              </span>
                              <div className="min-w-0">
                                <VanNameField
                                  van={van}
                                  meta={crew}
                                  empty={isEmptySlot}
                                  noTransfer={isNoTransferCard}
                                  onChange={(patch) => onVanMeta(van, patch)}
                                />
                                <p className="truncate text-[11px] text-teal-900/50">
                                  {items.length > 0
                                    ? zone
                                    : isNoTransferCard
                                      ? 'Drop guests with no hotel pickup'
                                    : crew.specialKind === 'partner'
                                      ? 'Partner picks guests up'
                                      : isSpecial
                                        ? [crew.plate, specialTransferDirectionLabel(crew)]
                                            .filter(Boolean)
                                            .join(' · ') || 'Private van'
                                        : isEmptySlot
                                          ? 'New van'
                                          : 'Ready'}
                                </p>
                                {isNoTransferCard ? (
                                  <span className="mt-1 inline-flex rounded-md bg-stone-200 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-stone-800 uppercase">
                                    {items.length} · {pax} pax
                                  </span>
                                ) : crew.specialKind === 'partner' ? (
                                  <span className="mt-1 inline-flex rounded-md bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-neutral-800 uppercase">
                                    Tour partner
                                  </span>
                                ) : isSpecial ? (
                                  <span className="mt-1 inline-flex rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sky-900 uppercase">
                                    {crew.label || specialTransferKindLabel(crew.specialKind)}
                                    {crew.plate ? ` · ${crew.plate}` : ''}
                                    {formatThb(crew.chargeAmount ?? 0)
                                      ? ` · ${formatThb(crew.chargeAmount ?? 0)}`
                                      : ''}
                                  </span>
                                ) : crew.outsourced ? (
                                  <span className="mt-1 inline-flex rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-violet-900 uppercase">
                                    {vanOutsourceLabel(crew)}
                                    {formatThb(crew.chargeAmount ?? 0)
                                      ? ` · ${formatThb(crew.chargeAmount ?? 0)}`
                                      : ''}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {isNoTransferCard ? (
                              <span className="shrink-0 rounded-lg bg-stone-200/80 px-2 py-1 text-xs font-semibold tabular-nums text-stone-800">
                                {isDrop ? projected : pax} pax
                              </span>
                            ) : (
                              <VanCapacityButton
                                van={van}
                                pax={isDrop ? projected : pax}
                                seats={seats}
                                defaultSeats={capacity}
                                over={projectedOver}
                                preview={isDrop ? `${pax}→${projected}` : null}
                                onChange={(next) => onVanMeta(van, { capacity: next })}
                              />
                            )}
                          </div>
                          {isNoTransferCard ? null : (
                            <VanCrewDetails
                              van={van}
                              crew={crew}
                              onChange={(patch) => onVanMeta(van, patch)}
                            />
                          )}
                          <div className="mt-2 flex items-center gap-1.5">
                            <div className="flex min-w-0 flex-wrap gap-1.5">
                              {!isNoTransferCard && (isEmptySlot || isPreparedEmpty || isSpecial) ? (
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
                              {!isEmptySlot && !isNoTransferCard ? (
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
                              {!isNoTransferCard && items.some(
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
                            {!isEmptySlot ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="ml-auto h-7 shrink-0 px-2 text-[11px] text-rose-800 hover:bg-rose-50 hover:text-rose-900"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onRemoveVan(van)
                                  if (openVan === van) setOpenVan(null)
                                }}
                              >
                                <Trash2 className="size-3" />
                                Delete
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
                                  : isNoTransferCard
                                    ? 'Empty — drop no-transfer guests'
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
                                        {booking.pickupHotel.trim() || booking.leadGuest}
                                        {booking.roomNumber ? ` · ${booking.roomNumber}` : ''}
                                      </p>
                                      {booking.pickupHotel.trim() ? (
                                        <p className="mt-0.5 truncate text-[11px] text-teal-900/55">
                                          {booking.leadGuest}
                                        </p>
                                      ) : (
                                        <p className="mt-0.5 truncate text-[11px] text-teal-900/55">
                                          {isNoTransfer(booking.pickupZone)
                                            ? 'No transfer'
                                            : booking.pickupZone || booking.pickupTime}
                                        </p>
                                      )}
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

                        <div className="border-t border-teal-900/6 px-2.5 py-2">
                          <div className="flex gap-1.5">
                            {(
                              boatNumbers.filter((boat) => !isPartnerBoat(boatPlan, boat)).length > 0
                                ? boatNumbers.filter((boat) => !isPartnerBoat(boatPlan, boat))
                                : ([1, 2, 3] as BoatNumber[])
                            ).map((boat) => {
                              const theme = boatTheme(boat)
                              const partnerLocked = crew.specialKind === 'partner'
                              const selected = !partnerLocked && assignedBoat === boat
                              const dimOthers = partnerLocked || (assignedBoat !== null && !selected)
                              return (
                                <button
                                  key={boat}
                                  type="button"
                                  disabled={partnerLocked}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    if (partnerLocked) return
                                    onAssignVanToBoat(van, selected ? null : boat)
                                  }}
                                  className={cn(
                                    'min-w-0 flex-1 rounded-md px-1.5 py-1.5 text-xs font-semibold tabular-nums transition-colors',
                                    selected
                                      ? theme.badge
                                      : dimOthers
                                        ? 'cursor-not-allowed border border-stone-200 bg-stone-100 text-stone-400'
                                        : theme.softBadge,
                                  )}
                                  title={
                                    partnerLocked
                                      ? 'Tour partner vans stay on the partner boat'
                                      : `Boat ${theme.fleetNumber} · ${theme.colorName}`
                                  }
                                >
                                  {boatFleetNumber(boat)}
                                </button>
                              )
                            })}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                if (crew.specialKind === 'partner') return
                                if (assignedBoat && isPartnerBoat(boatPlan, assignedBoat)) {
                                  onAssignVanToBoat(van, null)
                                  return
                                }
                                onAssignVanToPartnerBoat(van)
                              }}
                              className={cn(
                                'min-w-0 flex-1 rounded-md px-1.5 py-1.5 text-xs font-semibold transition-colors',
                                crew.specialKind === 'partner' ||
                                (assignedBoat && isPartnerBoat(boatPlan, assignedBoat))
                                  ? PARTNER_BOAT_THEME.badge
                                  : assignedBoat
                                    ? 'border border-stone-200 bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-600'
                                    : PARTNER_BOAT_THEME.softBadge,
                              )}
                              title={
                                crew.specialKind === 'partner'
                                  ? 'Tour partner boat (locked)'
                                  : 'Partner boat'
                              }
                            >
                              P
                            </button>
                          </div>
                          {boatMixed ? (
                            <p className="mt-1 text-[10px] text-amber-800/70">Mixed boats</p>
                          ) : null}
                        </div>
                      </div>
                    )
                  },
                )}
              </div>
            </div>
          </div>

          {bookings.length > 0 ? (
            <Surface className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.14em] text-teal-700/55 uppercase">
                    Step 2 · Boats
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-teal-950">
                    Arrange boats
                  </h3>
                  <p className="mt-1 text-sm text-teal-900/55">
                    Default 3 boats / day. Add a rental boat if you hire one. Partner tour boats
                    come from Tour partner vans. No-transfer and private guests can be placed here
                    too.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
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
                      disabled={boatNumbers.length >= MAX_DAY_BOATS}
                      onClick={() => {
                        const nextBoat = boatNumbers.length + 1
                        addDayBoat(date, program, rentalCapacity)
                        setBoatName(date, program, nextBoat, 'Rental')
                      }}
                    >
                      Add rental boat
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={boatNumbers.length >= MAX_DAY_BOATS}
                    onClick={() => setPartnerDraftOpen(true)}
                  >
                    <Plus data-icon="inline-start" />
                    Partner tour boat
                  </Button>
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
                {byBoat.map(({ boat, capacity: boatCap, pax, items, over, groups }) => {
                  const partner = isPartnerBoat(boatPlan, boat)
                  const theme = boatThemeFor(boatPlan, boat)
                  const boatDrop = dropTarget === `boat-${boat}`
                  return (
                  <div
                    key={boat}
                    className={cn(
                      'rounded-xl border px-3 py-3',
                      partner
                        ? cn(
                            'border-neutral-200 bg-white',
                            boatDrop && 'ring-2 ring-neutral-400/50',
                          )
                        : over
                          ? 'border-amber-400 bg-amber-50/50'
                          : theme.sheet,
                    )}
                    onDragOver={(event) => {
                      if (!dragCodes?.length) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      if (dropTarget !== `boat-${boat}`) setDropTarget(`boat-${boat}`)
                    }}
                    onDragLeave={() => {
                      if (dropTarget === `boat-${boat}`) setDropTarget(null)
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      const codes = readDragCodes(event, dragCodes)
                      assignToPartnerBoat(codes, boat)
                    }}
                    onClick={() => {
                      if (selectedList.length === 0) return
                      assignToPartnerBoat(selectedList, boat)
                    }}
                  >
                    {partner ? (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                            Send to Partner
                          </p>
                          <button
                            type="button"
                            className="text-neutral-400 hover:text-rose-700"
                            title="Remove partner boat"
                            onClick={() => {
                              if (
                                items.length > 0 &&
                                !window.confirm(
                                  'Remove this partner boat? Guests return to the leftover list.',
                                )
                              ) {
                                return
                              }
                              removeDayBoat(date, program, boat)
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
                          <label className="space-y-1">
                            <span className="block text-[10px] font-medium text-neutral-500">
                              Number
                            </span>
                            <Input
                              value={boatPlan.labels[boat - 1] ?? ''}
                              onChange={(event) =>
                                setBoatLabel(date, program, boat, event.target.value)
                              }
                              placeholder="e.g. 12"
                              className="h-8 px-2 text-sm"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="block text-[10px] font-medium text-neutral-500">
                              Boat name
                            </span>
                            <Input
                              value={boatPlan.names[boat - 1] ?? ''}
                              onChange={(event) =>
                                setBoatName(date, program, boat, event.target.value)
                              }
                              placeholder="Other company boat"
                              className="h-8 px-2 text-sm"
                            />
                          </label>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-neutral-500">
                            {items.length} booking{items.length === 1 ? '' : 's'} · {pax} pax
                          </p>
                          {selectedList.length > 0 ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 bg-neutral-800 px-2 text-xs text-white hover:bg-neutral-900"
                              onClick={() => assignToPartnerBoat(selectedList, boat)}
                            >
                              Add selected
                            </Button>
                          ) : null}
                        </div>
                        {groups.length > 0 ? (
                          <ul className="space-y-1.5">
                            {groups.map((group) => (
                              <li
                                key={group.van ?? 'loose'}
                                className="rounded-lg bg-neutral-50 px-2 py-1.5"
                              >
                                <p className="text-[11px] font-semibold text-neutral-800">
                                  {group.van !== null ? vanBoardLabel(group.van, plan) : 'Guests'}
                                  <span className="ml-1 font-medium text-neutral-500">
                                    · {group.pax} pax
                                  </span>
                                </p>
                                <ul className="mt-1 space-y-0.5">
                                  {group.items.map((booking) => (
                                    <li
                                      key={booking.code}
                                      className="flex items-center justify-between gap-2 text-xs text-neutral-800"
                                    >
                                      <span className="min-w-0 truncate">
                                        {booking.pickupHotel || booking.leadGuest} ·{' '}
                                        {totalPassengers(booking)}
                                      </span>
                                      <button
                                        type="button"
                                        className="shrink-0 text-neutral-400 hover:text-rose-700"
                                        title="Return to guest list"
                                        onClick={() =>
                                          assignBookingToBoat(date, program, booking.code, null)
                                        }
                                      >
                                        ×
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="rounded-lg border border-dashed border-neutral-200 px-2 py-2 text-[11px] text-neutral-400">
                            Drop leftover guests here to send them to another company.
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
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
                      {boatPlan.names[boat - 1]?.trim() === 'Rental' ? ' · Rental' : ''}
                    </p>
                    {selectedList.length > 0 ? (
                      <p className="mt-1 text-[11px] font-medium text-teal-800">
                        Tap to seat {selectedList.length} selected
                      </p>
                    ) : null}
                    {groups.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {groups.map((group) => (
                          <li
                            key={group.van ?? 'loose'}
                            className="rounded-lg bg-white/70 px-2 py-1.5"
                          >
                            <p className="text-[11px] font-semibold text-teal-950">
                              {group.van !== null ? vanBoardLabel(group.van, plan) : 'Guests'}
                              <span className="ml-1 font-medium text-teal-900/50">
                                · {group.pax} pax
                              </span>
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {group.items.map((booking) => (
                                <li
                                  key={booking.code}
                                  className="flex items-center justify-between gap-2 text-xs text-teal-950"
                                >
                                  <span className="min-w-0 truncate">
                                    {booking.pickupHotel || booking.leadGuest} ·{' '}
                                    {totalPassengers(booking)}
                                  </span>
                                  <button
                                    type="button"
                                    className="shrink-0 text-teal-800/40 hover:text-rose-700"
                                    title="Remove from boat"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      assignBookingToBoat(date, program, booking.code, null)
                                    }}
                                  >
                                    ×
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 rounded-lg border border-dashed border-teal-900/12 px-2 py-2 text-[11px] text-teal-900/40">
                        Drop guests or vans here — including no transfer.
                      </p>
                    )}
                      </>
                    )}
                  </div>
                  )
                })}
              </div>
              {boatUnassignedPax > 0 ? (
                <p className="mt-3 text-sm text-amber-900/80">
                  {boatUnassignedPax} pax not on a boat yet — drop them onto a boat above, including
                  no-transfer guests.
                </p>
              ) : boatAssignedCount > 0 ? (
                <p className="mt-3 text-sm text-teal-800/70">All bookings on this day are on a boat.</p>
              ) : null}
            </Surface>
          ) : null}

          {bookings.length > 0 ? (
            <Surface className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.14em] text-teal-700/55 uppercase">
                    Step 3 · Guides
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-teal-950">Assign a guide to each boat</h3>
                  <p className="mt-1 text-sm text-teal-900/55">
                    Gday boats only. Tour partner boats bring their own guide. Check-in boat
                    changes and extras print on the Guide JO.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  onClick={() => printGuideJobOrder(date, program)}
                >
                  <Printer className="size-3" />
                  Print Guide JO
                </Button>
              </div>
              <div
                className={cn(
                  'mt-4 grid gap-3',
                  boatNumbers.filter((boat) => !isPartnerBoat(boatPlan, boat)).length <= 2
                    ? 'sm:grid-cols-2'
                    : boatNumbers.filter((boat) => !isPartnerBoat(boatPlan, boat)).length === 3
                      ? 'sm:grid-cols-3'
                      : 'sm:grid-cols-2 xl:grid-cols-4',
                )}
              >
                {boatNumbers
                  .filter((boat) => !isPartnerBoat(boatPlan, boat))
                  .map((boat) => {
                  const guide = boatPlan.guides?.[boat - 1] ?? emptyBoatGuide()
                  const theme = boatThemeFor(boatPlan, boat)
                  const load = byBoat.find((item) => item.boat === boat)
                  const hasAssistant =
                    Boolean(guide.assistantName.trim() || guide.assistantPhone.trim()) ||
                    showAssistantFor[boat] === true
                  const guideAssigned = Boolean(guide.guideName.trim() || guide.guidePhone.trim())
                  const extras = (load?.items ?? []).flatMap((booking) =>
                    getCheckInServices(date, program, booking.code),
                  )
                  return (
                    <div
                      key={`guide-${boat}`}
                      className={cn('rounded-xl border px-3 py-3', theme.sheet)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={cn('truncate text-sm font-semibold', theme.title)}>
                            {boatDisplayName(boatPlan, boat)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-teal-900/50">
                            {load?.pax ?? 0} pax · {load?.items.length ?? 0} bookings
                            {extras.length > 0
                              ? ` · ${extras.length} check-in extra${extras.length === 1 ? '' : 's'}`
                              : ''}
                          </p>
                        </div>
                        {guideAssigned ? (
                          <span className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-900 uppercase">
                            Guide set
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 space-y-2">
                        <label className="block">
                          <span className="text-[11px] font-semibold tracking-wide text-teal-800/55 uppercase">
                            Guide name
                          </span>
                          <Input
                            value={guide.guideName}
                            onChange={(event) =>
                              setBoatGuide(date, program, boat, { guideName: event.target.value })
                            }
                            placeholder="Guide full name"
                            className="mt-1 h-9"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] font-semibold tracking-wide text-teal-800/55 uppercase">
                            Guide phone
                          </span>
                          <Input
                            value={guide.guidePhone}
                            onChange={(event) =>
                              setBoatGuide(date, program, boat, { guidePhone: event.target.value })
                            }
                            placeholder="Phone number"
                            className="mt-1 h-9"
                          />
                        </label>
                        {hasAssistant ? (
                          <>
                            <label className="block">
                              <span className="text-[11px] font-semibold tracking-wide text-teal-800/55 uppercase">
                                Assistant
                              </span>
                              <Input
                                value={guide.assistantName}
                                onChange={(event) =>
                                  setBoatGuide(date, program, boat, {
                                    assistantName: event.target.value,
                                  })
                                }
                                placeholder="Assistant name"
                                className="mt-1 h-9"
                              />
                            </label>
                            <Input
                              value={guide.assistantPhone}
                              onChange={(event) =>
                                setBoatGuide(date, program, boat, {
                                  assistantPhone: event.target.value,
                                })
                              }
                              placeholder="Assistant phone"
                              className="h-9"
                            />
                          </>
                        ) : (
                          <button
                            type="button"
                            className="text-xs font-semibold text-teal-800/70 hover:text-teal-950"
                            onClick={() =>
                              setShowAssistantFor((current) => ({ ...current, [boat]: true }))
                            }
                          >
                            + Add assistant guide
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Surface>
          ) : null}
        </div>
      )}

      <GuideJobOrderPrint
        date={date}
        program={program}
        boatPlan={boatPlan}
        vehiclePlan={plan}
        bookings={bookings}
      />

      <Dialog open={addVanOpen} onOpenChange={setAddVanOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add van</DialogTitle>
            <DialogDescription>
              Choose the van type to add to this day.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {(
              [
                {
                  kind: 'company' as const,
                  hint: 'Our company van',
                  onPick: () => {
                    onVanMeta(nextEmptyVan, { label: 'Company van' })
                    setAddVanOpen(false)
                  },
                },
                {
                  kind: 'outsource' as const,
                  hint: 'Hired van company',
                  onPick: () => {
                    onVanMeta(nextEmptyVan, { outsourced: true })
                    setAddVanOpen(false)
                  },
                },
                {
                  kind: 'private' as const,
                  hint: 'Named van · charge syncs to invoice',
                  onPick: () => {
                    setAddVanOpen(false)
                    setPrivateDraftOpen(true)
                  },
                },
                {
                  kind: 'partner' as const,
                  hint: 'Partner company first, then their boat',
                  onPick: () => {
                    setAddVanOpen(false)
                    setPartnerDraftOpen(true)
                  },
                },
                {
                  kind: 'no_transfer' as const,
                  hint: 'Guest goes to the pier — adds a No Transfers card',
                  onPick: () => {
                    onVanMeta(NO_TRANSFER_VAN_NUMBER, {
                      label: NO_TRANSFER_VAN_LABEL,
                      plate: NO_TRANSFER_VAN_LABEL,
                    })
                    if (selectedList.length > 0) assignToKind(selectedList, 'no_transfer')
                    setAddVanOpen(false)
                  },
                },
              ] as const
            ).map(({ kind, hint, onPick }) => (
              <button
                key={kind}
                type="button"
                onClick={onPick}
                className="rounded-xl border border-teal-900/10 bg-white px-3 py-2.5 text-left transition-colors hover:border-teal-700/30 hover:bg-teal-50/50"
              >
                <TransferKindBadge kind={kind} />
                <p className="mt-1 text-[11px] text-teal-900/50">{hint}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={privateDraftOpen} onOpenChange={setPrivateDraftOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add private van</DialogTitle>
            <DialogDescription>
              Name the van and give it a number, then drop guests onto it. You can assign its boat
              in Step 2.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="private-van-name">Van name</Label>
              <Input
                id="private-van-name"
                value={privateName}
                onChange={(event) => setPrivateName(event.target.value)}
                placeholder="e.g. Private A"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="private-van-number">Van number / plate</Label>
              <Input
                id="private-van-number"
                value={privateNumber}
                onChange={(event) => setPrivateNumber(event.target.value)}
                placeholder="e.g. 31-7558"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPrivateDraftOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={createPrivateVan}
              disabled={!privateName.trim() && !privateNumber.trim()}
            >
              Add private van
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={partnerDraftOpen} onOpenChange={setPartnerDraftOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tour partner company</DialogTitle>
            <DialogDescription>
              Add the partner company first. Their guests go on a Partner tour boat automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="partner-company">Partner company</Label>
            <Input
              id="partner-company"
              value={partnerCompany}
              onChange={(event) => setPartnerCompany(event.target.value)}
              placeholder="e.g. Andaman Tours"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPartnerDraftOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={createPartnerVan} disabled={!partnerCompany.trim()}>
              Add partner + boat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <Label htmlFor={`van-name-${openVan}`}>
                    {openMeta.specialKind === 'partner' || openMeta.specialKind === 'outsource' || openMeta.outsourced
                      ? 'Company name'
                      : 'Van name'}
                  </Label>
                  <Input
                    id={`van-name-${openVan}`}
                    value={
                      openMeta.specialKind === 'partner'
                        ? openMeta.outsourceCompany || openMeta.label
                        : openMeta.label || `Van ${openVan}`
                    }
                    onChange={(event) => onVanMeta(openVan, vanNamePatch(openMeta, event.target.value))}
                    placeholder={openMeta.specialKind === 'partner' ? 'Partner company' : `Van ${openVan}`}
                    className="h-10"
                  />
                </div>
                <DriverNameField
                  id={`van-driver-${openVan}`}
                  value={openMeta.driver}
                  phone={openMeta.phone}
                  plate={openMeta.plate}
                  onSelect={(entry) =>
                    onVanMeta(openVan, {
                      driver: entry.name,
                      phone: entry.phone,
                      plate: entry.plate,
                    })
                  }
                  onNameChange={(driver) => onVanMeta(openVan, { driver })}
                />
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
                  <OutsourceCompanyField
                    id={`van-outsource-${openVan}`}
                    value={openMeta.outsourceCompany ?? ''}
                    onChange={(outsourceCompany) => onVanMeta(openVan, { outsourceCompany })}
                  />
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
                              {formatPaxBreakdown(
                                allocatePaxBreakdown(
                                  {
                                    adults: booking.adults,
                                    children: booking.children,
                                    infants: booking.infants,
                                    tourLeaders: booking.tourLeaders,
                                  },
                                  legs,
                                  openVan,
                                ),
                              )}
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
        ? existingLegs.map((leg) => ({
            ...leg,
            pax: currentPaxOnVan(existingLegs, leg.van, totalPassengers(booking)),
          }))
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
