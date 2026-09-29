'use client'

import { useEffect, useMemo, useRef, useState, type HTMLAttributes } from 'react'
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
  Ship,
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
import { boatFleetNumber, boatThemeFor, boatColorOptions, boatAssignChipLabel, packOwnBoatLabel, unpackOwnBoatLabel, PARTNER_BOAT_THEME, type BoatColorKey } from '@/lib/boat-theme'
import { usePortalDefaultDateISO } from '@/lib/use-portal-today'
import {
  DEFAULT_BOAT_CAPACITY,
  DEFAULT_VAN_CAPACITY,
  MIN_VAN_CAPACITY,
  MAX_VAN_CAPACITY,
  MAX_DAY_BOATS,
  DEFAULT_BOAT_LABEL_START,
  boatDisplayName,
  boatNumbersForPlan,
  canonicalVanOutsourceCompany,
  clampVanCapacity,
    bookingAssignedToBoat,
    bookingPaxOnBoat,
    bookingTransferKind,
    isPartnerBoat,
  isVirtualVan,
  emptyBoatGuide,
  emptyVanMeta,
  formatPaxBreakdown,
  isActiveBooking,
  isNoTransfer,
  isNoTransferVan,
  isHiddenVan,
  isSpecialTransfer,
  NO_TRANSFER_VAN_LABEL,
  NO_TRANSFER_VAN_NUMBER,
  DUMMY_VAN_NUMBER,
  TRANSFER_KIND_LABELS,
  normalizeChargeAmount,
    normalizeBoatAssignment,
    primaryBoatNumber,
    specialTransferDirectionLabel,
  specialTransferKindLabel,
  totalPassengers,
  vanOutsourceLabel,
  vanSeatCapacity,
  vanTransferKind,
  type BookingTransferKind,
  type TransferKind,
  type BoatNumber,
  type BoatSplit,
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
import { bookingPaxOnVanAndBoat } from '@/lib/boat-load'
import { cn } from '@/lib/utils'

const DRAG_MIME = 'application/x-gday-van-codes'
/** Always show this many van cards ready to receive guests. */
const DEFAULT_DAY_VAN_COUNT = 3
const SEAT_PRESETS = [12, 20, 24, 30, 40] as const

function formatVanPaxMix(pax: { adults: number; children: number; infants: number; tourLeaders: number }) {
  return `${pax.adults}A ${pax.children}C ${pax.infants}I ${pax.tourLeaders}T`
}

function insertCodeInList(codes: string[], fromIndex: number, insertAt: number) {
  if (fromIndex < 0 || fromIndex >= codes.length) return null
  const next = [...codes]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return null
  let at = Math.max(0, Math.min(next.length, insertAt))
  if (fromIndex < insertAt) at = Math.max(0, at - 1)
  next.splice(at, 0, moved)
  if (next.every((code, index) => code === codes[index])) return null
  return next
}

function confirmRemoveBoat({
  boatPlan,
  boat,
  bookingCount,
  pax,
  totalBoats,
}: {
  boatPlan: DayBoatPlan
  boat: BoatNumber
  bookingCount: number
  pax: number
  totalBoats: number
}) {
  if (totalBoats <= 1) {
    window.alert('Keep at least one boat for the day.')
    return false
  }
  const name = boatDisplayName(boatPlan, boat)
  if (bookingCount <= 0) {
    return window.confirm(`Remove ${name}?`)
  }
  return window.confirm(
    [
      `Remove ${name}?`,
      '',
      `${bookingCount} booking${bookingCount === 1 ? '' : 's'} · ${pax} guest${pax === 1 ? '' : 's'} are still on this boat.`,
      'They will be unassigned and must be placed on another boat.',
      '',
      'Continue and unassign these guests?',
    ].join('\n'),
  )
}

function LongPressCard({
  onLongPress,
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { onLongPress: () => void }) {
  const timerRef = useRef<number | null>(null)
  const armedRef = useRef(false)
  const ignoreClickRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })
  const [holding, setHolding] = useState(false)

  function clearTimer() {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }

  function disarm() {
    clearTimer()
    armedRef.current = false
    setHolding(false)
  }

  return (
    <div
      {...rest}
      title={
        rest.title
          ? `${rest.title} · Long-press to separate van or boat`
          : 'Long-press to separate van or boat'
      }
      className={cn(className, holding && 'ring-2 ring-teal-600/40')}
      onPointerDown={(event) => {
        rest.onPointerDown?.(event)
        if (event.button !== 0) return
        disarm()
        ignoreClickRef.current = false
        startRef.current = { x: event.clientX, y: event.clientY }
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          armedRef.current = true
          setHolding(true)
        }, 480)
      }}
      onPointerMove={(event) => {
        rest.onPointerMove?.(event)
        if (!timerRef.current && !armedRef.current) return
        const dx = event.clientX - startRef.current.x
        const dy = event.clientY - startRef.current.y
        if (dx * dx + dy * dy > 64) disarm()
      }}
      onPointerUp={(event) => {
        const open = armedRef.current
        rest.onPointerUp?.(event)
        disarm()
        if (!open) return
        ignoreClickRef.current = true
        event.preventDefault()
        event.stopPropagation()
        onLongPress()
      }}
      onPointerCancel={(event) => {
        rest.onPointerCancel?.(event)
        disarm()
      }}
      onClick={(event) => {
        if (ignoreClickRef.current) {
          event.preventDefault()
          event.stopPropagation()
          ignoreClickRef.current = false
          return
        }
        rest.onClick?.(event)
      }}
    >
      {children}
    </div>
  )
}

function bookingWaitingForVan(
  booking: Pick<Booking, 'code' | 'pickupZone' | 'privateTransferVehicle'>,
  plan: Pick<DayVehiclePlan, 'assignments' | 'vanMeta'>,
  boatPlan: Pick<DayBoatPlan, 'capacities' | 'kinds' | 'names' | 'assignments'>,
) {
  const kind = bookingTransferKind(booking, plan, boatPlan)
  if (kind === 'no_transfer') return false
  if ((plan.assignments[booking.code]?.length ?? 0) > 0) return false
  if (boatPlan.assignments[booking.code]) return false
  return true
}

function bookingNeedsPlacement(
  booking: Booking,
  plan: DayVehiclePlan,
  boatPlan: DayBoatPlan,
  dayCapacity: number,
) {
  const kind = bookingTransferKind(booking, plan, boatPlan)
  if (kind === 'no_transfer' || kind === 'partner') return false
  const pax = totalPassengers(booking)
  if (pax <= dayCapacity) return false
  const legs = plan.assignments[booking.code]
  if (!legs?.length) return true
  if (legs.length > 1) return false
  return vanSeatCapacity(plan, legs[0].van) < pax
}

function listedDayVans(plan: DayVehiclePlan | null) {
  if (!plan) return [] as number[]
  const assigned = listFleetVanNumbers(plan.assignments)
  const saved = Object.keys(plan.vanMeta ?? {})
    .map(Number)
    .filter(
      (van) =>
        Number.isFinite(van) &&
        van >= 1 &&
        !isVirtualVan(van) &&
        !isHiddenVan(plan.vanMeta[String(van)]),
    )
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

function partnerBoatLinkedToVan(plan: DayVehiclePlan, boatPlan: DayBoatPlan, boat: number) {
  if (!isPartnerBoat(boatPlan, boat)) return true
  const name = (boatPlan.names[boat - 1] ?? '').trim().toLowerCase()
  const label = (boatPlan.labels[boat - 1] ?? '').trim().toLowerCase()
  if (!name && !label) return false
  return Object.entries(plan.vanMeta ?? {}).some(([key, meta]) => {
    const van = Number(key)
    if (!Number.isFinite(van) || isVirtualVan(van)) return false
    if (vanTransferKind(van, meta) !== 'partner') return false
    const company = (meta.outsourceCompany || meta.label || '').trim().toLowerCase()
    return Boolean(company) && (company === name || company === label)
  })
}

function nextAvailableVan(plan: DayVehiclePlan | null) {
  const used = new Set(listedDayVans(plan))
  for (let van = 1; van < DEFAULT_DAY_VAN_COUNT + 40; van += 1) {
    if (isVirtualVan(van)) continue
    if (!used.has(van)) return van
  }
  return Math.max(0, ...used) + 1
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
    setBookingBoatSplits,
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
          onSaveBoatSplits={(code, legs) =>
            setBookingBoatSplits(selectedDate, program, code, legs)
          }
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

function ChargeAmountField({
  id,
  value,
  onCommit,
  size = 'sm',
}: {
  id: string
  value: number
  onCommit: (amount: number) => void
  size?: 'sm' | 'default'
}) {
  const focusedRef = useRef(false)
  const [draft, setDraft] = useState(value > 0 ? String(value) : '')

  useEffect(() => {
    if (focusedRef.current) return
    setDraft(value > 0 ? String(value) : '')
  }, [value])

  function commit() {
    focusedRef.current = false
    const parsed = draft.trim() === '' ? 0 : Number(draft)
    const amount = Number.isFinite(parsed) ? Math.round(parsed) : 0
    setDraft(amount > 0 ? String(amount) : '')
    if (normalizeChargeAmount(amount) === normalizeChargeAmount(value)) return
    onCommit(amount)
  }

  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        min={0}
        step={100}
        value={draft}
        onFocus={() => {
          focusedRef.current = true
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur()
        }}
        placeholder="e.g. 2500"
        className={`${size === 'sm' ? 'h-9' : 'h-10'} pr-12`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-semibold text-teal-800/55">
        THB
      </span>
    </div>
  )
}

function vanDisplayName(crew: VanMeta) {
  if (crew.specialKind === 'partner') {
    return (crew.outsourceCompany || crew.label || '').trim()
  }
  const custom = crew.label?.trim() ?? ''
  if (custom && custom !== 'Company van') return custom
  return ''
}

function vanCardTitle(van: number, crew: VanMeta, flags?: { empty?: boolean; noTransfer?: boolean }) {
  if (flags?.noTransfer) return NO_TRANSFER_VAN_LABEL
  const named = vanDisplayName(crew)
  if (named) return named
  if (flags?.empty) return `New van ${van}`
  if (crew.specialKind === 'private') {
    return `${specialTransferKindLabel(crew.specialKind)} ${van}`
  }
  if (crew.specialKind === 'partner') return 'Tour partner'
  return `Van ${van}`
}

function vanNamePatch(crew: VanMeta, name: string): Partial<VanMeta> {
  const trimmed = canonicalVanOutsourceCompany(name)
  if (crew.specialKind === 'partner') {
    return { outsourceCompany: trimmed, label: trimmed, plate: crew.plate.trim() ? crew.plate : trimmed }
  }
  if (crew.outsourced) {
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
  const locked = noTransfer

  function startEditing() {
    setDraft(vanDisplayName(meta))
    setEditing(true)
  }

  function commit() {
    const next = draft.trim()
    setEditing(false)
    if (!next) {
      setDraft(title)
      return
    }
    if (next === title || next === vanDisplayName(meta)) {
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
        placeholder={`Van ${van}`}
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
        startEditing()
      }}
    >
      <p className="truncate text-[13px] font-semibold text-teal-950">{title}</p>
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
            className="mt-1 flex w-full items-start justify-between gap-2 rounded-lg px-0.5 py-0.5 text-left hover:bg-teal-50/80"
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
            {crew.specialKind === 'partner' || crew.outsourced
              ? 'Company name'
              : 'Van name'}
          </Label>
          <Input
            id={`card-name-${van}`}
            value={
              crew.specialKind === 'partner' || crew.outsourced
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
          <ChargeAmountField
            id={`card-charge-${van}`}
            value={crew.chargeAmount ?? 0}
            onCommit={(chargeAmount) => onChange({ chargeAmount })}
          />
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
              'rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
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
        <div className="flex flex-wrap gap-1">
          {SEAT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={cn(
                'rounded-md px-1.5 py-1 text-[10px] font-semibold',
                seats === preset
                  ? 'bg-teal-800 text-white'
                  : 'bg-teal-950/[0.05] text-teal-900 hover:bg-teal-100',
              )}
              onClick={() => onChange(preset)}
            >
              {preset <= DEFAULT_VAN_CAPACITY ? `Van ${preset}` : `Bus ${preset}`}
            </button>
          ))}
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
          Raise seats if this card is a bus. Only for this day.
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
  onSaveBoatSplits,
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
  onSaveBoatSplits: (code: string, legs: Array<{ boat: BoatNumber; pax: number }>) => void
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
    setBoatCapacity,
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
  const [rentalOpen, setRentalOpen] = useState(false)
  const [rentalCapacity, setRentalCapacity] = useState(60)
  const [rentalBoatNo, setRentalBoatNo] = useState('')
  const [rentalName, setRentalName] = useState('')
  const [rentalColor, setRentalColor] = useState<BoatColorKey>('amber')
  const [showAssistantFor, setShowAssistantFor] = useState<Record<number, boolean>>({})
  const [sheetQuery, setSheetQuery] = useState('')
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => new Set())
  const [dragCodes, setDragCodes] = useState<string[] | null>(null)
  const [kindFilter, setKindFilter] = useState<'all' | TransferKind>('all')
  const [dropTarget, setDropTarget] = useState<
    'pool' | TransferKind | number | `boat-${number}` | null
  >(null)
  const [dragCode, setDragCode] = useState<string | null>(null)
  const [dragOverCode, setDragOverCode] = useState<string | null>(null)
  const [dragOverBefore, setDragOverBefore] = useState(true)

  const capacity = plan.vanCapacity || DEFAULT_VAN_CAPACITY
  const listedVans = listedDayVans(plan)
  const nextEmptyVan = nextAvailableVan(plan)
  const hiddenDefaults = new Set(
    Object.entries(plan.vanMeta ?? {})
      .filter(([, meta]) => isHiddenVan(meta))
      .map(([key]) => Number(key))
      .filter((van) => Number.isFinite(van) && van >= 1 && van <= DEFAULT_DAY_VAN_COUNT),
  )
  const showNoTransferCard =
    Boolean(plan.vanMeta[String(NO_TRANSFER_VAN_NUMBER)]) &&
    !isHiddenVan(plan.vanMeta[String(NO_TRANSFER_VAN_NUMBER)]) ||
    Object.values(plan.assignments).some((legs) =>
      legs.some((leg) => isNoTransferVan(leg.van)),
    )
  const defaultVans = Array.from({ length: DEFAULT_DAY_VAN_COUNT }, (_, i) => i + 1).filter(
    (van) => !hiddenDefaults.has(van),
  )
  const extraVans = listedVans.filter((van) => van > DEFAULT_DAY_VAN_COUNT)
  const boardVans = [...new Set([...defaultVans, ...extraVans])].sort((a, b) => a - b).concat(
    showNoTransferCard ? [NO_TRANSFER_VAN_NUMBER] : [],
  )

  useEffect(() => {
    setSheetQuery('')
    setKindFilter('all')
    setSelectedCodes(new Set())
    setDragCodes(null)
    setDropTarget(null)
  }, [date, program])

  useEffect(() => {
    for (const booking of bookings) {
      const boat = primaryBoatNumber(boatPlan.assignments[booking.code])
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
      const waiting = bookingWaitingForVan(booking, plan, boatPlan)
      if (waiting) counts.all += 1
      if (kind === 'unassigned') {
        if (waiting) counts[kind] += 1
      } else {
        counts[kind] += 1
      }
    }
    return counts
  }, [listBookings, plan, boatPlan])

  const kindGuestNames = useMemo(() => {
    const names: Record<TransferKind, string[]> = {
      company: [],
      outsource: [],
      no_transfer: [],
      private: [],
      partner: [],
    }
    for (const booking of listBookings) {
      const kind = bookingTransferKind(booking, plan, boatPlan)
      if (kind === 'unassigned') continue
      names[kind].push(booking.leadGuest.trim() || booking.pickupHotel.trim() || booking.code)
    }
    return names
  }, [listBookings, plan, boatPlan])

  const sheetRows = useMemo(() => {
    let rows = listBookings.filter((booking) => {
      const kind = bookingTransferKind(booking, plan, boatPlan)
      // No-transfer guests are never "waiting" for a van — still list them when filtered.
      if (kindFilter === 'no_transfer') return kind === 'no_transfer'
      if (!bookingWaitingForVan(booking, plan, boatPlan)) return false
      if (kindFilter === 'all') return true
      return kind === kindFilter
    })
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

  const selectableSheetRows = sheetRows

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
    const unique = [...new Set(codes)].filter((code) => bookings.some((b) => b.code === code))
    if (unique.length === 0) return
    onAssignMany(unique, van)
    setSelectedCodes(new Set())
    setKindFilter('all')
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

  const needsSeparate = bookings.filter((booking) =>
    bookingNeedsPlacement(booking, plan, boatPlan, capacity),
  )

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
      for (const leg of normalizeBoatAssignment(boatPlan.assignments[item.booking.code])) {
        boatVotes.set(leg.boat, (boatVotes.get(leg.boat) ?? 0) + 1)
      }
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
    const items = bookings.filter((booking) =>
      bookingAssignedToBoat(boatPlan.assignments[booking.code], boat),
    )
    const pax = items.reduce(
      (sum, booking) => sum + bookingPaxOnBoat(booking, boatPlan.assignments[booking.code], boat),
      0,
    )
    const groupMap = new Map<number | 'loose', { van: number | null; items: Booking[]; pax: number }>()
    for (const booking of items) {
      const legs = plan.assignments[booking.code]
      const vansOnBoat = [
        ...new Set((legs ?? []).map((leg) => leg.van).filter((n) => n > 0)),
      ]
        .filter(
          (van) =>
            bookingPaxOnVanAndBoat(booking, legs, boatPlan.assignments[booking.code], van, boat) > 0,
        )
        .sort((a, b) => a - b)

      if (vansOnBoat.length === 0) {
        const current = groupMap.get('loose') ?? { van: null, items: [], pax: 0 }
        current.items.push(booking)
        current.pax += bookingPaxOnBoat(booking, boatPlan.assignments[booking.code], boat)
        groupMap.set('loose', current)
        continue
      }

      for (const van of vansOnBoat) {
        const onVanBoat = bookingPaxOnVanAndBoat(
          booking,
          legs,
          boatPlan.assignments[booking.code],
          van,
          boat,
        )
        const current = groupMap.get(van) ?? { van, items: [], pax: 0 }
        current.items.push(booking)
        current.pax += onVanBoat
        groupMap.set(van, current)
      }
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
  const boatUnassignedPax = bookings.reduce((sum, booking) => {
    const total = totalPassengers(booking)
    const assigned = boatPlan.assignments[booking.code]
    if (assigned == null) return sum + total
    if (typeof assigned === 'number') return sum
    const placed = normalizeBoatAssignment(assigned).reduce((acc, leg) => acc + leg.pax, 0)
    return sum + Math.max(0, total - placed)
  }, 0)

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
              Step 1 · set every guest’s van type. Long-press a hotel card to separate vans or boats.
              Step 2 · arrange boats. Step 3 · assign boat guides.
            </p>
          </div>
        </div>
      </Surface>

      {needsSeparate.length > 0 ? (
        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 print:hidden sm:px-5">
          <p className="text-sm font-semibold text-amber-950">
            Large group · {needsSeparate.length} booking
            {needsSeparate.length === 1 ? '' : 's'} over {capacity} pax
          </p>
          <p className="mt-1 text-sm text-amber-900/70">
            Long-press the hotel card, or tap below. Keep everyone on one van or bus, or split van
            numbers and boat numbers.
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
          <div className="space-y-3">
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
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Clear all vans? Guests go back to the waiting list, including partner, private, and outsource vans.',
                      )
                    ) {
                      return
                    }
                    onClear()
                  }}
                >
                  Clear vans
                </Button>
                <Button type="button" size="sm" className="h-7 px-2 text-[11px]" onClick={onAutoAssign}>
                  <Sparkles className="size-3" />
                  Auto-assign vans
                </Button>
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
                const names = kindGuestNames[kind]
                const namePreview =
                  names.length === 0
                    ? ''
                    : names.length <= 2
                      ? names.join(', ')
                      : `${names.slice(0, 2).join(', ')} +${names.length - 2}`
                const filtered = kindFilter === kind
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
                      if (selectedList.length > 0) {
                        assignToKind(selectedList, kind)
                        return
                      }
                      const hasHere =
                        kind === 'no_transfer'
                          ? listBookings.some(
                              (booking) =>
                                bookingTransferKind(booking, plan, boatPlan) === 'no_transfer',
                            )
                          : listBookings.some(
                              (booking) =>
                                bookingWaitingForVan(booking, plan, boatPlan) &&
                                bookingTransferKind(booking, plan, boatPlan) === kind,
                            )
                      if (!hasHere) {
                        setKindFilter('all')
                        return
                      }
                      setKindFilter((current) => (current === kind ? 'all' : kind))
                      setSelectedCodes(new Set())
                    }}
                    className={cn(
                      'rounded-2xl border px-3 py-3 text-left transition-all',
                      isDrop
                        ? 'border-teal-600/50 bg-teal-50 ring-2 ring-teal-600/20'
                        : filtered
                          ? 'ring-2 ring-teal-700/25'
                          : kind === 'partner'
                          ? 'border-neutral-200 bg-white'
                          : kind === 'private'
                            ? 'border-sky-200 bg-sky-50/40'
                            : kind === 'outsource'
                              ? 'border-violet-200 bg-violet-50/40'
                              : kind === 'no_transfer'
                                ? 'border-stone-200 bg-stone-50'
                                : 'border-teal-900/10 bg-white',
                      selectedList.length > 0 && 'hover:border-teal-700/35',
                      'cursor-pointer',
                    )}
                  >
                    <TransferKindBadge kind={kind} />
                    <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-teal-950">
                      {count}
                    </p>
                    {namePreview ? (
                      <p className="mt-0.5 truncate text-[11px] font-medium text-teal-900/70" title={names.join(', ')}>
                        {namePreview}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[11px] leading-snug text-teal-900/50">{hint}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(32rem,1.4fr)_minmax(20rem,1fr)]">
            {/* Left — guest pool */}
            <Surface className="flex max-h-[min(78vh,52rem)] flex-col overflow-hidden">
              <div className="border-b border-teal-900/8 px-3 py-2.5 sm:px-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-teal-950">Waiting</h3>
                    <p className="mt-0.5 text-xs text-teal-900/55">
                      {kindFilter === 'all'
                        ? `${sheetRows.length} not on a van yet`
                        : kindFilter === 'no_transfer'
                          ? `${sheetRows.length} no transfer guest${sheetRows.length === 1 ? '' : 's'}`
                          : `${sheetRows.length} ${TRANSFER_KIND_LABELS[kindFilter].toLowerCase()} waiting`}
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

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div
                    className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-0.5"
                    role="tablist"
                    aria-label="Filter by transfer type"
                  >
                  {(
                    [
                      ['all', 'All'],
                      ['private', 'Private'],
                      ['partner', 'Partner'],
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

                  <div className="relative min-w-[12rem] flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-teal-900/35" />
                    <Input
                      value={sheetQuery}
                      onChange={(event) => setSheetQuery(event.target.value)}
                      placeholder="Search guest, hotel…"
                      className="h-8 pl-8 text-sm"
                      aria-label="Search bookings"
                    />
                  </div>
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
                      : kindFilter === 'private'
                          ? 'No waiting private transfers. If the count is still 1, look for a sky-bordered private van card.'
                          : kindFilter === 'partner'
                            ? 'No waiting tour-partner bookings.'
                          : kindFilter === 'no_transfer'
                            ? 'No no-transfer guests for this day.'
                        : kindFilter !== 'all'
                          ? 'No guests of this type are waiting — they are already on a van.'
                        : bookings.length === 0
                          ? 'No bookings for this day.'
                          : 'Everyone is on a van. Waiting is empty.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {sheetRows.map((booking) => {
                      const pax = totalPassengers(booking)
                      const largeGroup = pax > capacity
                      const checked = selectedCodes.has(booking.code)
                      const isDragging = dragCodes?.includes(booking.code)
                      const transferKind = bookingTransferKind(booking, plan, boatPlan)

                      return (
                        <LongPressCard
                          key={booking.code}
                          draggable
                          onLongPress={() => setSplitCode(booking.code)}
                          onDragStart={(event) => {
                            beginDrag(event, codesForDrag(booking.code))
                          }}
                          onDragEnd={() => {
                            setDragCodes(null)
                            setDropTarget(null)
                          }}
                          onClick={() => {
                            toggleCode(booking.code)
                          }}
                          className={cn(
                            'cursor-grab rounded-lg border px-2 py-1.5 transition-all select-none active:cursor-grabbing',
                            largeGroup
                              ? 'border-amber-300 bg-amber-50'
                              : 'border-teal-900/8 bg-white',
                            checked && 'border-teal-600/40 bg-teal-50 shadow-sm',
                            isDragging && 'opacity-40',
                            !checked &&
                              (largeGroup
                                ? 'hover:border-amber-400 hover:bg-amber-50/80'
                                : 'hover:border-teal-700/25 hover:bg-teal-50/40'),
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              className="size-3.5 shrink-0 rounded border-teal-900/25 accent-teal-700"
                              checked={checked}
                              onClick={(event) => event.stopPropagation()}
                              onChange={() => toggleCode(booking.code)}
                              aria-label={`Select ${booking.leadGuest}`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-snug font-semibold text-teal-950">
                                {booking.pickupHotel.trim() || 'Hotel TBA'}
                                {booking.roomNumber ? (
                                  <span className="font-medium text-teal-900/50">
                                    {' '}
                                    · Rm {booking.roomNumber}
                                  </span>
                                ) : null}
                              </p>
                              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-snug">
                                <span className="shrink-0 tabular-nums text-teal-900/55">
                                  {booking.pickupTime}
                                </span>
                                <span
                                  className={cn(
                                    'tabular-nums font-medium',
                                    largeGroup ? 'text-amber-950' : 'text-teal-900',
                                  )}
                                >
                                  {formatVanPaxMix(booking)}
                                </span>
                                <TransferKindBadge kind={transferKind} />
                                {booking.note ? (
                                  <span className="min-w-0 text-teal-900/45">· {booking.note}</span>
                                ) : null}
                              </div>
                              {largeGroup ? (
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
                                  Same or split
                                </Button>
                              ) : null}
                            </div>
                            <GripVertical className="size-3.5 shrink-0 text-teal-800/30" />
                          </div>
                        </LongPressCard>
                      )
                    })}
                  </div>
                )}
              </div>
            </Surface>

            {/* Right — van cards */}
            <div className="min-w-0">
              <div className="grid gap-2 sm:grid-cols-2">
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
                    const cardKind = vanTransferKind(van, crew)
                    const kindMatch = kindFilter !== 'all' && cardKind === kindFilter

                    return (
                      <div
                        key={van}
                        onDragOver={(event) => {
                          if (!dragCodes?.length) return
                          const alreadyHere = dragCodes.every((code) =>
                            items.some((item) => item.booking.code === code),
                          )
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                          if (alreadyHere) return
                          if (dropTarget !== van) setDropTarget(van)
                        }}
                        onDragLeave={() => {
                          if (dropTarget === van) setDropTarget(null)
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          const codes = readDragCodes(event, dragCodes)
                          const alreadyHere = codes.every((code) =>
                            items.some((item) => item.booking.code === code),
                          )
                          setDragCodes(null)
                          setDropTarget(null)
                          setDragOverCode(null)
                          if (alreadyHere) return
                          assignDropped(codes, van)
                        }}
                        className={cn(
                          'flex min-h-[11rem] flex-col rounded-xl border bg-white/95 shadow-[0_12px_40px_-28px_rgba(15,118,110,0.35)] transition-all',
                          over || projectedOver
                            ? 'border-amber-500/45'
                            : isDrop
                              ? 'border-teal-600/50 ring-2 ring-teal-600/25'
                              : kindMatch
                                ? 'ring-2 ring-sky-500/30'
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
                        <div className="border-b border-teal-900/6 px-2.5 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-1.5">
                              <span
                                className={cn(
                                  'flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
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
                                {isEmptySlot ? <Plus className="size-3.5" /> : isNoTransferCard ? 'NT' : van}
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
                                  <span className="mt-0.5 inline-flex rounded-md bg-stone-200 px-1.5 py-px text-[10px] font-semibold tracking-wide text-stone-800 uppercase">
                                    {items.length} · {pax} pax
                                  </span>
                                ) : crew.specialKind === 'partner' ? (
                                  <span className="mt-0.5 inline-flex rounded-md bg-neutral-200 px-1.5 py-px text-[10px] font-semibold tracking-wide text-neutral-800 uppercase">
                                    Tour partner
                                  </span>
                                ) : isSpecial ? (
                                  <span className="mt-0.5 inline-flex rounded-md bg-sky-100 px-1.5 py-px text-[10px] font-semibold tracking-wide text-sky-900 uppercase">
                                    {crew.label || specialTransferKindLabel(crew.specialKind)}
                                    {crew.plate ? ` · ${crew.plate}` : ''}
                                    {formatThb(crew.chargeAmount ?? 0)
                                      ? ` · ${formatThb(crew.chargeAmount ?? 0)}`
                                      : ''}
                                  </span>
                                ) : crew.outsourced ? (
                                  <span className="mt-0.5 inline-flex rounded-md bg-violet-100 px-1.5 py-px text-[10px] font-semibold tracking-wide text-violet-900 uppercase">
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
                          <div className="mt-1.5 flex items-center gap-1">
                            <div className="flex min-w-0 flex-wrap gap-1">
                              {!isNoTransferCard && (isEmptySlot || isPreparedEmpty || isSpecial) ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-1.5 text-[10px]"
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
                                  className="h-6 px-1.5 text-[10px]"
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
                                  className="h-6 px-1.5 text-[10px]"
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="ml-auto h-6 shrink-0 px-1.5 text-[10px] text-rose-800 hover:bg-rose-50 hover:text-rose-900"
                              onClick={(event) => {
                                event.stopPropagation()
                                onRemoveVan(van)
                                if (openVan === van) setOpenVan(null)
                              }}
                            >
                              <Trash2 className="size-3" />
                              Delete
                            </Button>
                          </div>
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
                          {items.length === 0 ? (
                            <div
                              className={cn(
                                'flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed px-2 py-4 text-center',
                                isDrop
                                  ? 'border-teal-600/40 bg-teal-50/60 text-teal-800'
                                  : 'border-teal-900/10 text-teal-900/40',
                              )}
                            >
                              <Users className="mb-1 size-4 opacity-50" />
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
                            items.map(({ booking, paxOnVan: legPax, legs }, index) => {
                              const split = (legs?.length ?? 0) > 1
                              const boatSplit =
                                normalizeBoatAssignment(boatPlan.assignments[booking.code]).length > 1
                              const isDragging = dragCodes?.includes(booking.code)
                              const hotel = booking.pickupHotel.trim()
                              const mix = allocatePaxBreakdown(booking, legs, van)
                              const vanCodes = items.map((item) => item.booking.code)
                              const draggingOnThisVan =
                                !!dragCodes?.length &&
                                dragCodes.every((code) => vanCodes.includes(code))
                              const isReorderOver =
                                draggingOnThisVan &&
                                dragOverCode === booking.code &&
                                !dragCodes.includes(booking.code)
                              return (
                                <LongPressCard
                                  key={`${van}-${booking.code}`}
                                  draggable
                                  title="Drag to change pickup order"
                                  onLongPress={() => setSplitCode(booking.code)}
                                  onDragStart={(event) => {
                                    event.stopPropagation()
                                    beginDrag(event, [booking.code])
                                  }}
                                  onDragOver={(event) => {
                                    if (!draggingOnThisVan) return
                                    event.preventDefault()
                                    event.stopPropagation()
                                    event.dataTransfer.dropEffect = 'move'
                                    const rect = event.currentTarget.getBoundingClientRect()
                                    const before = event.clientY < rect.top + rect.height / 2
                                    if (dragOverCode !== booking.code) setDragOverCode(booking.code)
                                    setDragOverBefore(before)
                                  }}
                                  onDragLeave={() => {
                                    if (dragOverCode === booking.code) setDragOverCode(null)
                                  }}
                                  onDrop={(event) => {
                                    if (!draggingOnThisVan) return
                                    event.preventDefault()
                                    event.stopPropagation()
                                    const fromCode = dragCodes?.[0]
                                    const before = dragOverBefore
                                    setDragCodes(null)
                                    setDropTarget(null)
                                    setDragOverCode(null)
                                    if (!fromCode || fromCode === booking.code) return
                                    const fromIndex = vanCodes.indexOf(fromCode)
                                    const insertAt = index + (before ? 0 : 1)
                                    const next = insertCodeInList(vanCodes, fromIndex, insertAt)
                                    if (next) onReorderVan(van, next)
                                  }}
                                  onDragEnd={() => {
                                    setDragCodes(null)
                                    setDropTarget(null)
                                    setDragOverCode(null)
                                  }}
                                  onClick={(event) => event.stopPropagation()}
                                  className={cn(
                                    'relative cursor-grab rounded-md border border-teal-900/8 bg-teal-950/[0.02] px-2 py-1.5 active:cursor-grabbing',
                                    isDragging && 'opacity-40',
                                    isReorderOver && 'border-teal-600/30 bg-teal-50/70',
                                  )}
                                >
                                  {isReorderOver ? (
                                    <span
                                      className={cn(
                                        'pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-teal-600',
                                        dragOverBefore ? '-top-0.5' : '-bottom-0.5',
                                      )}
                                    />
                                  ) : null}
                                  <p className="text-[13px] leading-snug font-semibold text-teal-950">
                                    {hotel ||
                                      (isNoTransfer(booking.pickupZone)
                                        ? 'Hotel TBA'
                                        : booking.pickupZone.trim()) ||
                                      'Hotel TBA'}
                                    {booking.roomNumber ? ` · Rm ${booking.roomNumber}` : ''}
                                    {split ? (
                                      <span className="ml-1 font-normal text-teal-900/40">van split</span>
                                    ) : null}
                                    {boatSplit ? (
                                      <span className="ml-1 font-normal text-teal-900/40">boat split</span>
                                    ) : null}
                                  </p>
                                  <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] leading-tight">
                                    <span className="tabular-nums text-teal-900/60">
                                      {booking.pickupTime}
                                    </span>
                                    <span className="tabular-nums font-medium text-teal-900" title={`${legPax} pax on this van`}>
                                      {formatVanPaxMix(mix)}
                                    </span>
                                  </div>
                                </LongPressCard>
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
                              const theme = boatThemeFor(boatPlan, boat)
                              const chipLabel = boatAssignChipLabel(boatPlan, boat)
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
                                      : `Boat ${chipLabel}${theme.colorName ? ` · ${theme.colorName}` : ''}`
                                  }
                                >
                                  {chipLabel}
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
                    Default 3 boats / day. Add a rental with seats, name, and color. Delete any
                    boat — if guests are still on it, you get a warning first.
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {rentalOpen ? (
                    <div className="w-full max-w-sm space-y-2 rounded-xl border border-teal-900/12 bg-white p-3 sm:w-72">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-teal-950">Add rental boat</p>
                        <button
                          type="button"
                          className="text-teal-800/40 hover:text-teal-900"
                          onClick={() => setRentalOpen(false)}
                          aria-label="Close rental form"
                        >
                          ×
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="block text-[10px] font-medium text-teal-900/50">
                            Boat No <span className="text-rose-600">*</span>
                          </span>
                          <Input
                            value={rentalBoatNo}
                            onChange={(event) => setRentalBoatNo(event.target.value)}
                            placeholder={String(DEFAULT_BOAT_LABEL_START + boatNumbers.length)}
                            className="h-8 px-2 text-sm tabular-nums"
                            aria-required
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="block text-[10px] font-medium text-teal-900/50">Seats</span>
                          <Input
                            type="number"
                            min={1}
                            max={200}
                            value={rentalCapacity}
                            onChange={(event) => {
                              const next = Number(event.target.value)
                              if (Number.isFinite(next)) setRentalCapacity(Math.max(1, Math.min(200, next)))
                            }}
                            className="h-8 px-2 text-sm"
                          />
                        </label>
                      </div>
                      <label className="block space-y-1">
                        <span className="block text-[10px] font-medium text-teal-900/50">
                          Boat name <span className="font-normal text-teal-900/35">(optional)</span>
                        </span>
                        <Input
                          value={rentalName}
                          onChange={(event) => setRentalName(event.target.value)}
                          placeholder="Optional"
                          className="h-8 px-2 text-sm"
                        />
                      </label>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-medium text-teal-900/50">Color</span>
                        <div className="flex flex-wrap gap-1.5">
                          {boatColorOptions().map((option) => (
                            <button
                              key={option.key}
                              type="button"
                              title={option.colorName}
                              onClick={() => setRentalColor(option.key)}
                              className={cn(
                                'size-6 rounded-full border-2 transition-transform',
                                option.swatch,
                                rentalColor === option.key
                                  ? 'scale-110 border-teal-950'
                                  : 'border-white/80 opacity-80 hover:opacity-100',
                              )}
                              aria-label={option.colorName}
                            />
                          ))}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 w-full"
                        disabled={
                          boatNumbers.length >= MAX_DAY_BOATS || !rentalBoatNo.trim()
                        }
                        onClick={() => {
                          const boatNo = rentalBoatNo.trim()
                          if (!boatNo) return
                          addDayBoat(date, program, rentalCapacity, {
                            boatNo,
                            name: rentalName.trim(),
                            color: rentalColor,
                          })
                          setRentalOpen(false)
                          setRentalName('')
                          setRentalBoatNo('')
                          setRentalCapacity(60)
                        }}
                      >
                        Add boat
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8"
                      disabled={boatNumbers.length >= MAX_DAY_BOATS}
                      onClick={() => {
                        setRentalBoatNo(String(DEFAULT_BOAT_LABEL_START + boatNumbers.length))
                        setRentalOpen(true)
                      }}
                    >
                      <Plus data-icon="inline-start" />
                      Add rental boat
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={onClearBoats}>
                    Clear boats
                  </Button>
                  <Button type="button" size="sm" className="h-8" onClick={onAutoAssignBoats}>
                    <Sparkles data-icon="inline-start" />
                    Auto-assign boats
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {byBoat
                  .filter(({ boat }) => partnerBoatLinkedToVan(plan, boatPlan, boat))
                  .map(({ boat, capacity: boatCap, pax, items, over, groups }) => {
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
                            onClick={(event) => {
                              event.stopPropagation()
                              if (
                                !confirmRemoveBoat({
                                  boatPlan,
                                  boat,
                                  bookingCount: items.length,
                                  pax,
                                  totalBoats: boatNumbers.length,
                                })
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
                                  {group.items.map((booking) => {
                                    const onBoat =
                                      group.van !== null
                                        ? bookingPaxOnVanAndBoat(
                                            booking,
                                            plan.assignments[booking.code],
                                            boatPlan.assignments[booking.code],
                                            group.van,
                                            boat,
                                          )
                                        : bookingPaxOnBoat(
                                            booking,
                                            boatPlan.assignments[booking.code],
                                            boat,
                                          )
                                    const vanSplit =
                                      (plan.assignments[booking.code]?.length ?? 0) > 1
                                    const boatSplit =
                                      normalizeBoatAssignment(
                                        boatPlan.assignments[booking.code],
                                      ).length > 1
                                    return (
                                    <li key={`${group.van ?? 'loose'}-${booking.code}`}>
                                      <LongPressCard
                                        className="flex items-center justify-between gap-2 text-xs text-neutral-800"
                                        onLongPress={() => setSplitCode(booking.code)}
                                      >
                                      <span className="min-w-0 truncate">
                                        {booking.pickupHotel || booking.leadGuest} · {onBoat}
                                        {vanSplit ? ' van split' : ''}
                                        {boatSplit ? ' boat split' : ''}
                                      </span>
                                      <button
                                        type="button"
                                        className="shrink-0 text-neutral-400 hover:text-rose-700"
                                        title="Return to guest list"
                                        onClick={() => {
                                          const remaining = normalizeBoatAssignment(
                                            boatPlan.assignments[booking.code],
                                          ).filter((leg) => leg.boat !== boat)
                                          if (remaining.length === 0) {
                                            assignBookingToBoat(date, program, booking.code, null)
                                            return
                                          }
                                          onSaveBoatSplits(booking.code, remaining)
                                        }}
                                      >
                                        ×
                                      </button>
                                      </LongPressCard>
                                    </li>
                                    )
                                  })}
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
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', theme.swatch)} />
                        <div className="min-w-0 space-y-1">
                          {(() => {
                            const packed = unpackOwnBoatLabel(boatPlan.labels[boat - 1], boat)
                            return (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={cn(
                                    'inline-flex rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                                    theme.softBadge,
                                  )}
                                >
                                  No. {packed.boatNo}
                                </span>
                                <span
                                  className={cn(
                                    'inline-flex rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                                    theme.softBadge,
                                  )}
                                >
                                  {theme.colorName}
                                </span>
                              </div>
                            )
                          })()}
                          {(boatPlan.names[boat - 1] ?? '').trim() ? (
                            <p className={cn('truncate text-sm font-semibold', theme.title)}>
                              {(boatPlan.names[boat - 1] ?? '').trim()}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums',
                            over ? 'bg-amber-100 text-amber-900' : 'bg-white/80 text-teal-800',
                          )}
                        >
                          {pax}/{boatCap}
                        </span>
                        <button
                          type="button"
                          className="rounded-md p-1 text-teal-800/35 hover:bg-white/70 hover:text-rose-700"
                          title="Remove boat"
                          onClick={(event) => {
                            event.stopPropagation()
                            if (
                              !confirmRemoveBoat({
                                boatPlan,
                                boat,
                                bookingCount: items.length,
                                pax,
                                totalBoats: boatNumbers.length,
                              })
                            ) {
                              return
                            }
                            removeDayBoat(date, program, boat)
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    <div
                      className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <label className="space-y-0.5">
                        <span className="block text-[10px] font-medium text-teal-900/45">
                          Boat No <span className="text-rose-600">*</span>
                        </span>
                        <Input
                          value={unpackOwnBoatLabel(boatPlan.labels[boat - 1], boat).boatNo}
                          onChange={(event) => {
                            const packed = unpackOwnBoatLabel(boatPlan.labels[boat - 1], boat)
                            const nextNo = event.target.value.replace(/\|/g, '').slice(0, 12)
                            setBoatLabel(
                              date,
                              program,
                              boat,
                              packOwnBoatLabel(nextNo, packed.color ?? theme.key),
                            )
                          }}
                          onBlur={() => {
                            const packed = unpackOwnBoatLabel(boatPlan.labels[boat - 1], boat)
                            if (packed.boatNo.trim()) return
                            setBoatLabel(
                              date,
                              program,
                              boat,
                              packOwnBoatLabel(
                                String(boatFleetNumber(boat)),
                                packed.color ?? theme.key,
                              ),
                            )
                          }}
                          placeholder={String(boatFleetNumber(boat))}
                          className="h-7 px-2 text-sm tabular-nums"
                          aria-label={`Boat ${boat} number`}
                          required
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="block text-[10px] font-medium text-teal-900/45">
                          Boat name{' '}
                          <span className="font-normal text-teal-900/35">(optional)</span>
                        </span>
                        <Input
                          value={boatPlan.names[boat - 1] ?? ''}
                          onChange={(event) =>
                            setBoatName(date, program, boat, event.target.value)
                          }
                          placeholder="Optional"
                          className="h-7 px-2 text-sm"
                          aria-label={`Boat ${boat} name`}
                        />
                      </label>
                    </div>
                    <div
                      className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <label className="space-y-0.5">
                        <span className="block text-[10px] font-medium text-teal-900/45">Seats</span>
                        <Input
                          type="number"
                          min={1}
                          max={200}
                          value={boatCap}
                          onChange={(event) => {
                            const next = Number(event.target.value)
                            if (!Number.isFinite(next)) return
                            setBoatCapacity(date, program, boat, Math.max(1, Math.min(200, next)))
                          }}
                          className="h-7 px-2 text-sm tabular-nums"
                        />
                      </label>
                      <div className="space-y-0.5">
                        <span className="block text-[10px] font-medium text-teal-900/45">Color</span>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {boatColorOptions().map((option) => {
                            const selected = theme.key === option.key
                            return (
                              <button
                                key={option.key}
                                type="button"
                                title={option.colorName}
                                onClick={() => {
                                  const packed = unpackOwnBoatLabel(boatPlan.labels[boat - 1], boat)
                                  setBoatLabel(
                                    date,
                                    program,
                                    boat,
                                    packOwnBoatLabel(packed.boatNo, option.key),
                                  )
                                }}
                                className={cn(
                                  'size-5 rounded-full border-2 transition-transform',
                                  option.swatch,
                                  selected
                                    ? 'scale-110 border-teal-950'
                                    : 'border-white/70 opacity-75 hover:opacity-100',
                                )}
                                aria-label={option.colorName}
                              />
                            )
                          })}
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-teal-900/50">
                      {items.length} booking{items.length === 1 ? '' : 's'}
                      {(boatPlan.names[boat - 1] ?? '').trim().toLowerCase().includes('rental')
                        ? ' · Rental'
                        : ''}
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
                              {group.items.map((booking) => {
                                const onBoat =
                                  group.van !== null
                                    ? bookingPaxOnVanAndBoat(
                                        booking,
                                        plan.assignments[booking.code],
                                        boatPlan.assignments[booking.code],
                                        group.van,
                                        boat,
                                      )
                                    : bookingPaxOnBoat(
                                        booking,
                                        boatPlan.assignments[booking.code],
                                        boat,
                                      )
                                const vanSplit =
                                  (plan.assignments[booking.code]?.length ?? 0) > 1
                                const boatSplit =
                                  normalizeBoatAssignment(boatPlan.assignments[booking.code])
                                    .length > 1
                                return (
                                <li key={`${group.van ?? 'loose'}-${booking.code}`}>
                                  <LongPressCard
                                    className="flex items-center justify-between gap-2 text-xs text-teal-950"
                                    onLongPress={() => setSplitCode(booking.code)}
                                  >
                                  <span className="min-w-0 truncate">
                                    {booking.pickupHotel || booking.leadGuest} · {onBoat}
                                    {vanSplit ? ' van split' : ''}
                                    {boatSplit ? ' boat split' : ''}
                                  </span>
                                  <button
                                    type="button"
                                    className="shrink-0 text-teal-800/40 hover:text-rose-700"
                                    title="Remove from boat"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      const remaining = normalizeBoatAssignment(
                                        boatPlan.assignments[booking.code],
                                      ).filter((leg) => leg.boat !== boat)
                                      if (remaining.length === 0) {
                                        assignBookingToBoat(date, program, booking.code, null)
                                        return
                                      }
                                      onSaveBoatSplits(booking.code, remaining)
                                    }}
                                  >
                                    ×
                                  </button>
                                  </LongPressCard>
                                </li>
                                )
                              })}
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
                    Step 3 · Boat Guides
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-teal-950">
                    Assign a boat guide to each boat
                  </h3>
                  <p className="mt-1 text-sm text-teal-900/55">
                    Gday boat staff only — not the tour group guide on a booking QR. Tour partner
                    boats bring their own guide. Check-in boat changes and extras print on the Boat
                    Guide JO.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  onClick={() => printGuideJobOrder(date, program)}
                >
                  <Printer className="size-3" />
                  Print Boat Guide JO
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
                            Boat guide set
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 space-y-2">
                        <label className="block">
                          <span className="text-[11px] font-semibold tracking-wide text-teal-800/55 uppercase">
                            Boat guide name
                          </span>
                          <Input
                            value={guide.guideName}
                            onChange={(event) =>
                              setBoatGuide(date, program, boat, { guideName: event.target.value })
                            }
                            placeholder="Boat guide full name"
                            className="mt-1 h-9"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] font-semibold tracking-wide text-teal-800/55 uppercase">
                            Boat guide phone
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
                                Boat assistant
                              </span>
                              <Input
                                value={guide.assistantName}
                                onChange={(event) =>
                                  setBoatGuide(date, program, boat, {
                                    assistantName: event.target.value,
                                  })
                                }
                                placeholder="Boat assistant name"
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
                              placeholder="Boat assistant phone"
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
                            + Add boat assistant
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
        vehiclePlan={plan}
        boatPlan={boatPlan}
        boardVans={boardVans.filter((van) => !isNoTransferVan(van))}
        existingLegs={splitBooking ? plan.assignments[splitBooking.code] : undefined}
        existingBoatLegs={
          splitBooking
            ? normalizeBoatAssignment(
                boatPlan.assignments[splitBooking.code],
                totalPassengers(splitBooking),
              )
            : undefined
        }
        nextVanHint={nextEmptyVan}
        open={splitCode !== null}
        onOpenChange={(open) => {
          if (!open) setSplitCode(null)
        }}
        onSave={(legs, vehicle) => {
          if (!splitBooking) return
          if (vehicle) {
            onVanMeta(vehicle.van, {
              capacity: vehicle.seats,
              ...(vehicle.label ? { label: vehicle.label } : {}),
            })
          }
          onSaveSplits(splitBooking.code, legs)
          setSplitCode(null)
        }}
        onSaveBoats={(legs) => {
          if (!splitBooking) return
          onSaveBoatSplits(splitBooking.code, legs)
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
                    {openMeta.specialKind === 'partner' || openMeta.outsourced
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

function suggestBoatSplit(
  pax: number,
  fleet: BoatNumber[],
  startBoat: BoatNumber,
): BoatSplit[] {
  if (pax <= 0) return []
  const first = fleet.includes(startBoat) ? startBoat : (fleet[0] ?? 1)
  const second =
    fleet.find((boat) => boat !== first) ??
    (fleet[1] ?? (first + 1 <= MAX_DAY_BOATS ? ((first + 1) as BoatNumber) : first))
  if (second === first) return [{ boat: first, pax }]
  const left = Math.max(1, Math.ceil(pax / 2))
  return [
    { boat: first, pax: left },
    { boat: second, pax: pax - left },
  ]
}

function SeparateVanDialog({
  booking,
  capacity,
  vehiclePlan,
  boatPlan,
  boardVans,
  existingLegs,
  existingBoatLegs,
  nextVanHint,
  open,
  onOpenChange,
  onSave,
  onSaveBoats,
}: {
  booking: Booking | null
  capacity: number
  vehiclePlan: DayVehiclePlan
  boatPlan: DayBoatPlan
  boardVans: number[]
  existingLegs?: VanSplit[]
  existingBoatLegs?: BoatSplit[]
  nextVanHint: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (
    legs: VanSplit[],
    vehicle?: { van: number; seats: number; label?: string },
  ) => void
  onSaveBoats: (legs: BoatSplit[]) => void
}) {
  const total = booking ? totalPassengers(booking) : 0
  const bookingCode = booking?.code ?? null
  const fleetBoats = boatNumbersForPlan(boatPlan)
  const boats = fleetBoats.length > 0 ? fleetBoats : ([1, 2, 3] as BoatNumber[])
  const [section, setSection] = useState<'van' | 'boat'>('van')
  const [mode, setMode] = useState<'same' | 'split'>('same')
  const [sameVan, setSameVan] = useState(1)
  const [sameSeats, setSameSeats] = useState(capacity)
  const [legs, setLegs] = useState<VanSplit[]>([])
  const [boatMode, setBoatMode] = useState<'same' | 'split'>('same')
  const [sameBoat, setSameBoat] = useState<BoatNumber>(1)
  const [boatLegs, setBoatLegs] = useState<BoatSplit[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !booking) return
    const start = Math.max(1, nextVanHint)
    const existing = existingLegs?.filter((leg) => leg.van > 0) ?? []
    const firstVan = existing[0]?.van || boardVans[0] || 1
    const seats = clampVanCapacity(
      Math.max(totalPassengers(booking), vanSeatCapacity(vehiclePlan, firstVan), capacity),
    )
    setSameVan(firstVan)
    setSameSeats(seats)
    if (existing.length > 1) {
      setMode('split')
      setLegs(
        existing.map((leg) => ({
          ...leg,
          pax: currentPaxOnVan(existing, leg.van, totalPassengers(booking)),
        })),
      )
    } else {
      setMode('same')
      setLegs(suggestVanSplit(totalPassengers(booking), capacity, start))
    }

    const existingBoats = existingBoatLegs?.filter((leg) => leg.boat >= 1 && leg.pax > 0) ?? []
    const firstBoat = (existingBoats[0]?.boat ?? boats[0] ?? 1) as BoatNumber
    setSameBoat(firstBoat)
    if (existingBoats.length > 1) {
      setSection('boat')
      setBoatMode('split')
      setBoatLegs(existingBoats)
    } else {
      setSection('van')
      setBoatMode('same')
      setBoatLegs(suggestBoatSplit(totalPassengers(booking), boats, firstBoat))
    }
    setError('')
  }, [open, bookingCode])

  function pickSameVan(van: number) {
    const next = Math.max(1, Math.floor(van) || 1)
    setSameVan(next)
    setSameSeats(
      clampVanCapacity(Math.max(total, vanSeatCapacity(vehiclePlan, next), capacity)),
    )
    setError('')
  }

  const assigned = legs.reduce((sum, leg) => sum + (Number(leg.pax) || 0), 0)
  const remaining = total - assigned
  const boatAssigned = boatLegs.reduce((sum, leg) => sum + (Number(leg.pax) || 0), 0)
  const boatRemaining = total - boatAssigned

  function updateLeg(index: number, patch: Partial<VanSplit>) {
    setLegs((current) =>
      current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)),
    )
    setError('')
  }

  function updateBoatLeg(index: number, patch: Partial<BoatSplit>) {
    setBoatLegs((current) =>
      current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)),
    )
    setError('')
  }

  function handleSaveVan() {
    if (!booking) return
    if (mode === 'same') {
      const van = Math.max(1, Math.floor(Number(sameVan) || 0))
      if (van < 1) {
        setError('Choose a van number.')
        return
      }
      const seats = clampVanCapacity(Math.max(total, Number(sameSeats) || total))
      const named = vanDisplayName(vehiclePlan.vanMeta[String(van)] ?? emptyVanMeta())
      onSave([{ van, pax: total, sortOrder: 0 }], {
        van,
        seats,
        label: seats > DEFAULT_VAN_CAPACITY && !named ? 'Bus' : undefined,
      })
      return
    }

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

  function handleSaveBoat() {
    if (!booking) return
    if (boatMode === 'same') {
      const boat = Math.max(1, Math.floor(Number(sameBoat) || 0)) as BoatNumber
      if (!boats.includes(boat)) {
        setError(`Boat ${boat} is not on this day. Pick a boat from the list.`)
        return
      }
      onSaveBoats([{ boat, pax: total }])
      return
    }

    const cleaned = boatLegs
      .map((leg) => ({
        boat: Math.max(1, Math.floor(Number(leg.boat) || 0)) as BoatNumber,
        pax: Math.max(0, Math.floor(Number(leg.pax) || 0)),
      }))
      .filter((leg) => leg.boat >= 1 && leg.pax > 0)

    const unknown = cleaned.find((leg) => !boats.includes(leg.boat))
    if (unknown) {
      setError(`Boat ${unknown.boat} is not on this day. Pick a boat from the list.`)
      return
    }
    const byBoat = new Map<BoatNumber, number>()
    for (const leg of cleaned) {
      byBoat.set(leg.boat, (byBoat.get(leg.boat) ?? 0) + leg.pax)
    }
    const merged = [...byBoat.entries()].map(([boat, pax]) => ({ boat, pax }))
    const sum = merged.reduce((s, leg) => s + leg.pax, 0)
    if (merged.length < 2) {
      setError('Add at least two boats to separate this booking.')
      return
    }
    if (sum !== total) {
      setError(`Pax on boats must total ${total} (now ${sum}).`)
      return
    }
    onSaveBoats(merged)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        {booking ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8 font-display text-lg font-semibold text-teal-950">
                Separate guests
              </DialogTitle>
              <DialogDescription className="text-sm text-teal-900/55">
                {booking.leadGuest} · {total} pax. Split onto vans and/or boats. Counts sync to
                pickup, boat load, check-in, and the guide job order.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-teal-950/[0.08] p-1">
              <button
                type="button"
                className={cn(
                  'inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold',
                  section === 'van' ? 'bg-white text-teal-950 shadow-sm' : 'text-teal-900/60',
                )}
                onClick={() => {
                  setSection('van')
                  setError('')
                }}
              >
                <Bus className="size-3.5" />
                Van
              </button>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold',
                  section === 'boat' ? 'bg-white text-teal-950 shadow-sm' : 'text-teal-900/60',
                )}
                onClick={() => {
                  setSection('boat')
                  setError('')
                }}
              >
                <Ship className="size-3.5" />
                Boat
              </button>
            </div>

            {section === 'van' ? (
              <>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-teal-950/[0.05] p-1">
              <button
                type="button"
                className={cn(
                  'rounded-lg px-2 py-1.5 text-xs font-semibold',
                  mode === 'same' ? 'bg-white text-teal-950 shadow-sm' : 'text-teal-900/60',
                )}
                onClick={() => {
                  setMode('same')
                  setError('')
                }}
              >
                Same van / bus
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-lg px-2 py-1.5 text-xs font-semibold',
                  mode === 'split' ? 'bg-white text-teal-950 shadow-sm' : 'text-teal-900/60',
                )}
                onClick={() => {
                  setMode('split')
                  setError('')
                }}
              >
                Separate vans
              </button>
            </div>

            {mode === 'same' ? (
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label>Put this group on</Label>
                  <div className="flex flex-wrap gap-1">
                    {boardVans.map((van) => (
                      <button
                        key={van}
                        type="button"
                        className={cn(
                          'rounded-md px-2 py-1 text-[11px] font-semibold',
                          sameVan === van
                            ? 'bg-teal-800 text-white'
                            : 'bg-teal-950/[0.05] text-teal-900 hover:bg-teal-100',
                        )}
                        onClick={() => pickSameVan(van)}
                      >
                        {vanCardTitle(van, vehiclePlan.vanMeta[String(van)] ?? emptyVanMeta())}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="same-van">Van #</Label>
                    <Input
                      id="same-van"
                      type="number"
                      min={1}
                      value={sameVan}
                      onChange={(event) => pickSameVan(Number(event.target.value) || 1)}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="same-seats">Seats</Label>
                    <Input
                      id="same-seats"
                      type="number"
                      min={MIN_VAN_CAPACITY}
                      max={MAX_VAN_CAPACITY}
                      value={sameSeats}
                      onChange={(event) =>
                        setSameSeats(clampVanCapacity(Number(event.target.value)))
                      }
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {SEAT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={cn(
                        'rounded-md px-1.5 py-1 text-[10px] font-semibold',
                        sameSeats === preset
                          ? 'bg-teal-800 text-white'
                          : 'bg-teal-950/[0.05] text-teal-900 hover:bg-teal-100',
                      )}
                      onClick={() => setSameSeats(preset)}
                    >
                      {preset <= DEFAULT_VAN_CAPACITY ? `Van ${preset}` : `Bus ${preset}`}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] leading-relaxed text-teal-900/55">
                  All {total} guests stay on one vehicle. Raise seats if this is a bus.
                </p>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
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
            )}
              </>
            ) : (
              <>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-teal-950/[0.05] p-1">
              <button
                type="button"
                className={cn(
                  'rounded-lg px-2 py-1.5 text-xs font-semibold',
                  boatMode === 'same' ? 'bg-white text-teal-950 shadow-sm' : 'text-teal-900/60',
                )}
                onClick={() => {
                  setBoatMode('same')
                  setError('')
                }}
              >
                Same boat
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-lg px-2 py-1.5 text-xs font-semibold',
                  boatMode === 'split' ? 'bg-white text-teal-950 shadow-sm' : 'text-teal-900/60',
                )}
                onClick={() => {
                  setBoatMode('split')
                  setError('')
                }}
              >
                Separate boats
              </button>
            </div>

            {boatMode === 'same' ? (
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label>Put this group on</Label>
                  <div className="flex flex-wrap gap-1">
                    {boats.map((boat) => {
                      const theme = boatThemeFor(boatPlan, boat)
                      return (
                        <button
                          key={boat}
                          type="button"
                          className={cn(
                            'rounded-md px-2 py-1 text-[11px] font-semibold',
                            sameBoat === boat ? theme.badge : theme.softBadge,
                          )}
                          onClick={() => {
                            setSameBoat(boat)
                            setError('')
                          }}
                        >
                          {boatDisplayName(boatPlan, boat)}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="same-boat">Boat #</Label>
                  <Input
                    id="same-boat"
                    type="number"
                    min={1}
                    max={boats.length}
                    value={sameBoat}
                    onChange={(event) => {
                      setSameBoat(Math.max(1, Number(event.target.value) || 1) as BoatNumber)
                      setError('')
                    }}
                    className="h-10"
                  />
                </div>
                <p className="text-[12px] leading-relaxed text-teal-900/55">
                  All {total} guests stay on one boat.
                </p>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {boatLegs.map((leg, index) => (
                  <div
                    key={`boat-leg-${index}`}
                    className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
                  >
                    <div className="space-y-1">
                      <Label htmlFor={`split-boat-${index}`}>Boat #</Label>
                      <Input
                        id={`split-boat-${index}`}
                        type="number"
                        min={1}
                        max={boats.length}
                        value={leg.boat}
                        onChange={(event) =>
                          updateBoatLeg(index, {
                            boat: Math.max(1, Number(event.target.value) || 1) as BoatNumber,
                          })
                        }
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`split-boat-pax-${index}`}>Pax</Label>
                      <Input
                        id={`split-boat-pax-${index}`}
                        type="number"
                        min={1}
                        value={leg.pax}
                        onChange={(event) =>
                          updateBoatLeg(index, { pax: Number(event.target.value) || 0 })
                        }
                        className="h-10"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      disabled={boatLegs.length <= 2}
                      onClick={() =>
                        setBoatLegs((current) => current.filter((_, i) => i !== index))
                      }
                      aria-label="Remove boat leg"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}

                <div className="flex flex-wrap gap-1">
                  {boats.map((boat) => {
                    const theme = boatThemeFor(boatPlan, boat)
                    const used = boatLegs.some((leg) => Number(leg.boat) === boat)
                    return (
                      <button
                        key={`hint-${boat}`}
                        type="button"
                        className={cn(
                          'rounded-md px-2 py-1 text-[11px] font-semibold',
                          used ? theme.badge : theme.softBadge,
                        )}
                        onClick={() => {
                          const index = boatLegs.findIndex((leg) => Number(leg.boat) === 0)
                          if (index >= 0) {
                            updateBoatLeg(index, { boat })
                            return
                          }
                          setBoatLegs((current) => [
                            ...current,
                            { boat, pax: Math.max(0, boatRemaining) || 1 },
                          ])
                          setError('')
                        }}
                      >
                        {boatDisplayName(boatPlan, boat)}
                      </button>
                    )
                  })}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={boatLegs.length >= boats.length}
                  onClick={() => {
                    const used = new Set(boatLegs.map((leg) => Number(leg.boat)))
                    const boat = boats.find((item) => !used.has(item))
                    if (!boat) return
                    setBoatLegs((current) => [
                      ...current,
                      { boat, pax: Math.max(0, boatRemaining) || 1 },
                    ])
                    setError('')
                  }}
                >
                  <Plus data-icon="inline-start" />
                  Add boat
                </Button>

                <div
                  className={cn(
                    'rounded-xl px-3 py-2 text-sm',
                    boatRemaining === 0 ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-900',
                  )}
                >
                  Assigned {boatAssigned} / {total} pax
                  {boatRemaining === 0
                    ? ' · ready to save'
                    : boatRemaining > 0
                      ? ` · ${boatRemaining} still to place`
                      : ` · ${Math.abs(boatRemaining)} over`}
                </div>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
              </div>
            )}
              </>
            )}

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={section === 'van' ? handleSaveVan : handleSaveBoat}
              >
                {section === 'van'
                  ? mode === 'same'
                    ? 'Save van'
                    : 'Save van split'
                  : boatMode === 'same'
                    ? 'Save boat'
                    : 'Save boat split'}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
