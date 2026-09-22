'use client'

import { useMemo, useState, Fragment, type ReactNode } from 'react'
import {
  ArrowLeft,
  Bus,
  CalendarIcon,
  ClipboardList,
  Minus,
  Plus,
  Printer,
  Save,
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
  emptyBoatGuide,
  isActiveBooking,
  isNoTransfer,
  totalPassengers,
  type BoatGuide,
  type BoatNumber,
  type Booking,
  type Program,
  type VanSplit,
} from '@/lib/types'
import { listVanNumbers, paxOnVan, primaryVan, sortOrderOnVan } from '@/lib/vehicle-assign'
import { boatTheme } from '@/lib/boat-theme'
import {
  formatCheckInServicesOption,
  type CheckInServiceLine,
} from '@/lib/check-in-services'
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
    commitDayBoatPlan,
    resolveVanMeta,
    getCheckInAttendance,
    getCheckInEnrollments,
    getCheckInServices,
    setBoatName,
    setBoatGuide,
  } = usePortal()

  const [selectedDate, setSelectedDate] = usePortalDefaultDateISO()
  const [program, setProgram] = useState<Program | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  /** Draft edits stay local until Save — avoids production reset from auto-save races. */
  const draft = { persist: false as const }

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

  function markDraft() {
    setDirty(true)
    setSaveMessage(null)
    setSaveError(null)
  }

  function confirmLeaveDraft() {
    if (!dirty) return true
    return window.confirm(
      'You have unsaved boat arrangement or guide changes. Leave without saving?',
    )
  }

  async function handleSave() {
    if (!program) return
    setSaving(true)
    setSaveError(null)
    setSaveMessage(null)
    const result = await commitDayBoatPlan(selectedDate, program)
    setSaving(false)
    if (!result.ok) {
      setSaveError(result.error)
      return
    }
    setDirty(false)
    setSaveMessage(result.warning ?? 'Boat arrangement and guide information saved.')
  }

  function selectDate(date: Date | undefined) {
    if (!date) return
    if (!confirmLeaveDraft()) return
    setSelectedDate(toISODate(date))
    setProgram(null)
    setCalendarOpen(false)
    setDirty(false)
    setSaveMessage(null)
    setSaveError(null)
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="w-full">
      <div className="print:hidden">
        <div className="mb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              if (!confirmLeaveDraft()) return
              onBack()
            }}
          >
            <ArrowLeft className="size-3.5" />
            Daily Board
          </Button>
        </div>
        <PageHeader
          title="Arrange boats"
          description="Vans first, then boats — put each van on a boat so the whole group stays together. Place No Transfer guests on any boat. Save when you are done so production keeps your arrangement."
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
                  onClick={() => {
                    clearDayBoatAssignments(selectedDate, program, draft)
                    markDraft()
                  }}
                >
                  Clear boats
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    autoAssignDayBoats(selectedDate, program, draft)
                    markDraft()
                  }}
                >
                  <Sparkles data-icon="inline-start" />
                  Auto-assign by van
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || !dirty}
                  onClick={() => void handleSave()}
                >
                  <Save data-icon="inline-start" />
                  {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
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
            onClick={() => {
              if (!confirmLeaveDraft()) return
              setProgram(null)
              setDirty(false)
              setSaveMessage(null)
              setSaveError(null)
            }}
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
          dirty={dirty}
          saving={saving}
          saveMessage={saveMessage}
          saveError={saveError}
          onSave={() => void handleSave()}
          isNoShow={(code) => getCheckInAttendance(selectedDate, program, code) === 'no-show'}
          getEnrollments={(code) => getCheckInEnrollments(selectedDate, program, code)}
          getServices={(code) => getCheckInServices(selectedDate, program, code)}
          onAssignBooking={(code, boat) => {
            assignBookingToBoat(selectedDate, program, code, boat, draft)
            markDraft()
          }}
          onAssignVan={(van, boat) => {
            assignVanToBoat(selectedDate, program, van, boat, draft)
            markDraft()
          }}
          onCapacity={(boat, capacity) => {
            setBoatCapacity(selectedDate, program, boat, capacity, draft)
            markDraft()
          }}
          onRename={(boat, name) => {
            setBoatName(selectedDate, program, boat, name, draft)
            markDraft()
          }}
          onSetGuide={(boat, guide) => {
            setBoatGuide(selectedDate, program, boat, guide, draft)
            markDraft()
          }}
          onAddBoat={(capacity) => {
            addDayBoat(selectedDate, program, capacity, draft)
            markDraft()
          }}
          onRemoveBoat={(boat) => {
            removeDayBoat(selectedDate, program, boat, draft)
            markDraft()
          }}
          onResetCapacities={() => {
            resetDayBoatCapacities(selectedDate, program, draft)
            markDraft()
          }}
          onResetFleet={() => {
            resetDayBoatFleet(selectedDate, program, draft)
            markDraft()
          }}
          onAutoAssign={() => {
            autoAssignDayBoats(selectedDate, program, draft)
            markDraft()
          }}
          onClear={() => {
            clearDayBoatAssignments(selectedDate, program, draft)
            markDraft()
          }}
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
  dirty,
  saving,
  saveMessage,
  saveError,
  onSave,
  isNoShow,
  getEnrollments,
  getServices,
  onAssignBooking,
  onAssignVan,
  onCapacity,
  onRename,
  onSetGuide,
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
  dirty: boolean
  saving: boolean
  saveMessage: string | null
  saveError: string | null
  onSave: () => void
  isNoShow: (bookingCode: string) => boolean
  getEnrollments: (bookingCode: string) => ReturnType<ReturnType<typeof usePortal>['getCheckInEnrollments']>
  getServices: (bookingCode: string) => CheckInServiceLine[]
  onAssignBooking: (code: string, boat: BoatNumber | null) => void
  onAssignVan: (van: number, boat: BoatNumber | null) => void
  onCapacity: (boat: BoatNumber, capacity: number) => void
  onRename: (boat: BoatNumber, name: string) => void
  onSetGuide: (boat: BoatNumber, guide: Partial<BoatGuide>) => void
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
  const [editingBoat, setEditingBoat] = useState<BoatNumber | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [printTarget, setPrintTarget] = useState<'board' | 'guide'>('board')
  const [showAssistantFor, setShowAssistantFor] = useState<Record<number, boolean>>({})

  function clearDrag() {
    setDragVan(null)
    setDropTarget(null)
  }

  function handleVanDrop(target: 'pool' | BoatNumber) {
    if (dragVan === null) return
    onAssignVan(dragVan, target === 'pool' ? null : target)
    clearDrag()
  }

  function handlePrintGuide() {
    setPrintTarget('guide')
    window.setTimeout(() => {
      const previous = document.title
      const programShort = program === 'PP' ? 'PP' : 'JB'
      document.title = `GuideJO-${date}-${programShort}`
      document.body.classList.add('printing-guide-jo')
      const restore = () => {
        document.title = previous
        document.body.classList.remove('printing-guide-jo')
        window.removeEventListener('afterprint', restore)
        setPrintTarget('board')
      }
      window.addEventListener('afterprint', restore)
      window.print()
    }, 50)
  }

  function handlePrintBoard() {
    setPrintTarget('board')
    window.setTimeout(() => onPrint(), 0)
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
        const adults = items.reduce((sum, booking) => sum + booking.adults, 0)
        const children = items.reduce((sum, booking) => sum + booking.children, 0)
        const infants = items.reduce((sum, booking) => sum + booking.infants, 0)
        const tourLeaders = items.reduce((sum, booking) => sum + booking.tourLeaders, 0)
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
        return {
          van,
          items,
          pax,
          adults,
          children,
          infants,
          tourLeaders,
          zone,
          assignedBoat,
          boatMixed,
          meta,
        }
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
              <Button type="button" variant="outline" size="sm" className="sm:hidden" onClick={handlePrintBoard}>
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
                            <p className="text-base font-semibold text-teal-950">
                              VAN {group.van}
                            </p>
                            <p className="mt-1 text-sm tabular-nums text-teal-900/70">
                              AD {group.adults}
                              {group.children ? ` + CHD ${group.children}` : ''}
                              {group.infants ? ` + INF ${group.infants}` : ''}
                              {group.tourLeaders ? ` + TL ${group.tourLeaders}` : ''}
                            </p>
                            <p className="mt-0.5 text-xs text-teal-900/45">{group.zone}</p>
                          </div>
                          <span className="rounded-lg bg-teal-50 px-2.5 py-1 text-sm font-semibold tabular-nums text-teal-800">
                            {group.pax} pax
                          </span>
                        </div>
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
                              className={cn(
                                'rounded-xl px-2 py-2 text-xs font-semibold transition-colors',
                                boatTheme(boat).badge,
                              )}
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
                          VAN {group.van} · {group.pax} pax
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-teal-900/60">
                          AD {group.adults}
                          {group.children ? ` + CHD ${group.children}` : ''}
                          {group.infants ? ` + INF ${group.infants}` : ''}
                          {group.tourLeaders ? ` + TL ${group.tourLeaders}` : ''}
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
                              className={cn(
                                'rounded-lg px-2 py-1.5 text-xs font-semibold text-white',
                                boatTheme(boat).badge,
                              )}
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
                const theme = boatTheme(boat)
                return (
                  <Surface
                    key={boat}
                    className={cn(
                      'flex min-h-0 flex-col overflow-hidden transition-colors',
                      theme.sheet,
                      over && 'border-amber-500/50',
                      dropTarget === boat && dragVan !== null && cn('ring-2', theme.ring),
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
                    <div className={cn('shrink-0 border-b px-4 py-3.5', theme.headerBorder)}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {editingBoat === boat ? (
                            <input
                              type="text"
                              autoFocus
                              value={editDraft}
                              maxLength={40}
                              onChange={(event) => setEditDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  onRename(boat, editDraft)
                                  setEditingBoat(null)
                                }
                                if (event.key === 'Escape') {
                                  setEditingBoat(null)
                                }
                              }}
                              onBlur={() => {
                                onRename(boat, editDraft)
                                setEditingBoat(null)
                              }}
                              className="h-8 w-full min-w-0 rounded-lg border border-teal-900/15 bg-white px-1 text-lg font-semibold text-teal-950 outline-none focus:border-teal-700/40 print:border-0"
                              aria-label={`${boatDisplayName(plan, boat)} name`}
                            />
                          ) : (
                            <div className="flex min-w-0 items-start gap-2 px-1">
                              <span
                                className={cn('mt-1.5 size-3 shrink-0 rounded-full', theme.swatch)}
                                aria-hidden
                              />
                              <div className="min-w-0">
                                <p className={cn('truncate text-lg font-semibold leading-tight', theme.title)}>
                                  {boatDisplayName(plan, boat)}
                                </p>
                                <span
                                  className={cn(
                                    'mt-0.5 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                    theme.softBadge,
                                  )}
                                >
                                  {theme.colorName}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
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
                            className="h-8 px-2 text-teal-800/70 print:hidden"
                            onMouseDown={(event) => {
                              if (editingBoat === boat) event.preventDefault()
                            }}
                            onClick={() => {
                              if (editingBoat === boat) {
                                onRename(boat, editDraft)
                                setEditingBoat(null)
                                return
                              }
                              setEditDraft(
                                plan.names?.[boat - 1]?.trim() || boatDisplayName(plan, boat),
                              )
                              setEditingBoat(boat)
                            }}
                          >
                            {editingBoat === boat ? 'Done' : 'Edit'}
                          </Button>
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
                              if (editingBoat === boat) setEditingBoat(null)
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
                          aria-label={`Decrease ${boatDisplayName(plan, boat)} capacity`}
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
                          aria-label={`Increase ${boatDisplayName(plan, boat)} capacity`}
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
                                  VAN {group.van}
                                </p>
                                <p className="mt-1 text-sm tabular-nums text-teal-900/70">
                                  AD {group.adults}
                                  {group.children ? ` + CHD ${group.children}` : ''}
                                  {group.infants ? ` + INF ${group.infants}` : ''}
                                  {group.tourLeaders ? ` + TL ${group.tourLeaders}` : ''}
                                </p>
                                <p className="mt-0.5 text-xs text-teal-900/45">
                                  Total {group.pax} pax · drag to move
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

      {bookings.length > 0 ? (
        <Surface className="mt-5 p-5 print:hidden">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList className="size-5 text-teal-700/50" />
                <h2 className="font-display text-xl font-semibold text-teal-950">
                  Guide Job Order
                </h2>
              </div>
              <p className="mt-1.5 text-sm text-teal-900/55">
                Add guide and assistant for each boat, then print the passenger list grouped by van
                (guest names from check-in / booking).
              </p>
            </div>
            <Button type="button" size="sm" onClick={handlePrintGuide}>
              <Printer data-icon="inline-start" />
              Print Guide Job Order
            </Button>
          </div>

          <div
            className={cn(
              'mt-5 grid gap-4',
              boatNumbers.length <= 2
                ? 'lg:grid-cols-2'
                : boatNumbers.length === 3
                  ? 'lg:grid-cols-3'
                  : 'lg:grid-cols-2 xl:grid-cols-4',
            )}
          >
            {boatNumbers.map((boat) => {
              const guide = plan.guides?.[boat - 1] ?? emptyBoatGuide()
              const loadPax = boatLoad(boat)
              const vansHere = assignedVansByBoat(boat)
              const freeGuests = noTransferOnBoat(boat)
              const theme = boatTheme(boat)
              const hasAssistant =
                Boolean(guide.assistantName.trim() || guide.assistantPhone.trim()) ||
                showAssistantFor[boat] === true
              const guideAssigned = Boolean(guide.guideName.trim() || guide.guidePhone.trim())
              return (
                <div
                  key={`guide-${boat}`}
                  className={cn('rounded-2xl border p-4', theme.sheet)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-start gap-2">
                        <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', theme.swatch)} aria-hidden />
                        <div className="min-w-0">
                          <p className={cn('text-base font-semibold leading-tight', theme.title)}>
                            {boatDisplayName(plan, boat)}
                          </p>
                          <span
                            className={cn(
                              'mt-0.5 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                              theme.softBadge,
                            )}
                          >
                            {theme.colorName}
                          </span>
                        </div>
                      </div>
                      <p className="mt-0.5 text-xs text-teal-900/50">
                        {loadPax} pax · {vansHere.length} van
                        {vansHere.length === 1 ? '' : 's'}
                        {freeGuests.length > 0 ? ` · ${freeGuests.length} no transfer` : ''}
                      </p>
                    </div>
                    {guideAssigned ? (
                      <span className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-900 uppercase">
                        Guide set
                      </span>
                    ) : null}
                  </div>
                  {guideAssigned ? (
                    <p className="mt-2 text-sm font-medium text-teal-950">
                      {guide.guideName.trim() || 'Guide'}
                      {guide.guidePhone.trim() ? (
                        <span className="font-normal text-teal-900/60">
                          {' '}
                          · {guide.guidePhone.trim()}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-2.5">
                    <GuideField
                      label="Guide name"
                      value={guide.guideName}
                      onChange={(value) => onSetGuide(boat, { guideName: value })}
                      placeholder="Guide full name"
                    />
                    <GuideField
                      label="Guide phone"
                      value={guide.guidePhone}
                      onChange={(value) => onSetGuide(boat, { guidePhone: value })}
                      placeholder="Phone number"
                    />
                    {hasAssistant ? (
                      <>
                        <GuideField
                          label="Assistant guide"
                          value={guide.assistantName}
                          onChange={(value) => onSetGuide(boat, { assistantName: value })}
                          placeholder="Assistant name"
                        />
                        <GuideField
                          label="Assistant phone"
                          value={guide.assistantPhone}
                          onChange={(value) => onSetGuide(boat, { assistantPhone: value })}
                          placeholder="Phone number"
                        />
                        <button
                          type="button"
                          className="justify-self-start text-xs font-medium text-teal-800/55 transition-colors hover:text-red-700"
                          onClick={() => {
                            onSetGuide(boat, { assistantName: '', assistantPhone: '' })
                            setShowAssistantFor((current) => ({ ...current, [boat]: false }))
                          }}
                        >
                          Remove assistant
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="justify-self-start text-xs font-semibold text-teal-800/70 transition-colors hover:text-teal-950"
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

      <Surface className="mt-5 p-5 print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-teal-950">Save boat arrangement & guides</p>
            <p className="mt-0.5 text-sm text-teal-900/55">
              {dirty
                ? 'You have unsaved changes. Save so production keeps this arrangement and guide information.'
                : 'Arrangement matches the last save.'}
            </p>
            {saveMessage ? (
              <p className="mt-1.5 text-sm font-medium text-emerald-800">{saveMessage}</p>
            ) : null}
            {saveError ? (
              <p className="mt-1.5 text-sm font-medium text-rose-700">{saveError}</p>
            ) : null}
          </div>
          <Button
            type="button"
            size="lg"
            className="h-12 shrink-0 rounded-xl px-6"
            disabled={saving || !dirty}
            onClick={onSave}
          >
            <Save data-icon="inline-start" />
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </Button>
        </div>
      </Surface>

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
                          ? boatTheme(n).badge
                          : boatTheme(n).softBadge,
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

      <div
        className={cn(
          'mt-6 hidden',
          printTarget === 'board' && 'print:block',
        )}
      >
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

      <div
        className={cn(
          'guide-job-order-print hidden',
          printTarget === 'guide' && 'print:block',
        )}
      >
        {boatNumbers.map((boat, boatIndex) => {
          const guide = plan.guides?.[boat - 1] ?? emptyBoatGuide()
          const vansHere = assignedVansByBoat(boat)
          const freeGuests = noTransferOnBoat(boat)
          const pax = boatLoad(boat)
          const capacity = plan.capacities[boat - 1] ?? DEFAULT_BOAT_CAPACITY

          const vanSections = vansHere.map((group) => ({
            key: `print-van-${boat}-${group.van}`,
            title: `Van ${group.van}${group.zone !== '—' ? ` · ${group.zone}` : ''} · ${group.pax} pax${group.meta.driver ? ` · Driver ${group.meta.driver}` : ''}`,
            vanLabel: `Van ${group.van}`,
            rows: group.items.map((booking) =>
              guideLeaderPrintRow(
                booking,
                paxOnVan(vanAssignments[booking.code], group.van) || totalPassengers(booking),
                getServices(booking.code),
              ),
            ),
          }))
          const noTransferSection =
            freeGuests.length > 0
              ? {
                  key: `print-nt-${boat}`,
                  title: `No transfer · ${freeGuests.reduce((sum, b) => sum + totalPassengers(b), 0)} pax`,
                  vanLabel: 'No transfer',
                  rows: freeGuests.map((booking) =>
                    guideLeaderPrintRow(booking, totalPassengers(booking), getServices(booking.code)),
                  ),
                }
              : null

          let rowNo = 0
          const numberedSections = [
            ...vanSections,
            ...(noTransferSection ? [noTransferSection] : []),
          ].map((section) => {
            const startNo = rowNo
            rowNo += section.rows.length
            return { ...section, startNo }
          })
          const theme = boatTheme(boat)

          return (
            <div
              key={`guide-print-${boat}`}
              className={cn(
                'guide-jo-boat mb-2',
                boatIndex < boatNumbers.length - 1 && 'print:break-after-page',
              )}
            >
              <div
                className="guide-jo-color-bar mb-2 h-1.5 w-full rounded-sm"
                style={{ backgroundColor: theme.printHex }}
              />
              <div className="guide-jo-header mb-2 flex items-end justify-between gap-3 border-b-2 border-teal-900/30 pb-2">
                <div>
                  <p className="text-[8px] font-bold tracking-[0.16em] text-teal-800 uppercase">
                    G&apos;Day Tours Phuket · Guide Job Order
                  </p>
                  <h1 className="mt-1 text-[15px] leading-snug font-bold text-teal-950">
                    <span
                      className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
                      style={{ backgroundColor: theme.printHex }}
                    />
                    {boatDisplayName(plan, boat)} · {theme.colorName} ·{' '}
                    {program === 'PP' ? 'PP' : 'JB'} ·{' '}
                    {program === 'PP' ? 'Phi Phi Islands' : 'Phang Nga Bay'}
                  </h1>
                  <p className="mt-1 text-[10px] leading-snug font-medium text-teal-900/75">
                    {formatLongDate(date)} · {pax} / {capacity} pax
                  </p>
                </div>
                <div className="text-right text-[10px] leading-snug text-teal-900/80">
                  <p>
                    Guide:{' '}
                    <span className="font-bold text-teal-950">
                      {guide.guideName || '—'}
                    </span>
                    {guide.guidePhone ? ` · ${guide.guidePhone}` : ''}
                  </p>
                  {guide.assistantName.trim() || guide.assistantPhone.trim() ? (
                    <p className="mt-1">
                      Assistant:{' '}
                      <span className="font-bold text-teal-950">
                        {guide.assistantName || '—'}
                      </span>
                      {guide.assistantPhone ? ` · ${guide.assistantPhone}` : ''}
                    </p>
                  ) : null}
                </div>
              </div>

              {numberedSections.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-neutral-500">No guests on this boat.</p>
              ) : (
                <GuideBoatPassengerTable sections={numberedSections} />
              )}

              <p className="guide-jo-footer mt-2 text-[9px] font-medium text-teal-900/60">
                Total passengers on {boatDisplayName(plan, boat)}: {pax} / {capacity}
              </p>
            </div>
          )
        })}
      </div>

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body.printing-guide-jo * {
            visibility: hidden !important;
          }
          body.printing-guide-jo .guide-job-order-print,
          body.printing-guide-jo .guide-job-order-print * {
            visibility: visible !important;
          }
          body.printing-guide-jo .guide-job-order-print {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            color: #042f2e !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body.printing-guide-jo .guide-jo-table {
            table-layout: fixed !important;
            width: 100% !important;
            font-size: 11px !important;
            line-height: 1.35 !important;
          }
          body.printing-guide-jo .guide-jo-table thead th {
            font-size: 9px !important;
            letter-spacing: 0.06em !important;
            padding-top: 4px !important;
            padding-bottom: 5px !important;
            border-bottom: 1.5px solid #134e4a !important;
            color: #134e4a !important;
          }
          body.printing-guide-jo .guide-jo-table td {
            padding-top: 5px !important;
            padding-bottom: 5px !important;
            vertical-align: top !important;
          }
          body.printing-guide-jo .guide-jo-van-title td {
            padding-top: 10px !important;
            padding-bottom: 4px !important;
            font-size: 11px !important;
            background: #f0fdfa !important;
            border-top: 1px solid #99f6e4 !important;
            border-bottom: 1px solid #99f6e4 !important;
          }
          body.printing-guide-jo .guide-jo-pax {
            color: #0f766e !important;
            font-weight: 700 !important;
          }
          body.printing-guide-jo .guide-jo-boat {
            margin-bottom: 0.5rem !important;
          }
          body.printing-guide-jo .guide-jo-header h1 {
            font-size: 16px !important;
            line-height: 1.25 !important;
          }
          body.printing-guide-jo .guide-jo-footer {
            font-size: 10px !important;
            margin-top: 8px !important;
          }
        }
      `}</style>
    </div>
  )
}

function GuideField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold tracking-wide text-teal-800/55 uppercase">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-lg border border-teal-900/12 bg-white px-2.5 text-sm text-teal-950 outline-none placeholder:text-teal-900/30 focus:border-teal-700/40"
      />
    </label>
  )
}

type GuidePassengerRow = {
  bookingCode: string
  guestName: string
  /** Shown next to lead name, e.g. "(2AD+2IF)". */
  leadPaxTag: string
  hotel: string
  /** Extra paid marina services for guide (e.g. Private Longtail · 2,000). */
  option: string
}

/** Compact booking mix for lead guest — e.g. (2AD+1CHD+2IF). */
function formatGuideLeadPaxTag(
  booking: Pick<Booking, 'adults' | 'children' | 'infants' | 'tourLeaders'>,
  seatsOnThisVan?: number,
) {
  const total =
    booking.adults + booking.children + booking.infants + booking.tourLeaders
  if (
    typeof seatsOnThisVan === 'number' &&
    seatsOnThisVan > 0 &&
    seatsOnThisVan !== total
  ) {
    return `(${seatsOnThisVan}pax)`
  }
  const parts: string[] = []
  if (booking.adults > 0) parts.push(`${booking.adults}AD`)
  if (booking.children > 0) parts.push(`${booking.children}CHD`)
  if (booking.infants > 0) parts.push(`${booking.infants}IF`)
  if (booking.tourLeaders > 0) parts.push(`${booking.tourLeaders}TL`)
  return parts.length > 0 ? `(${parts.join('+')})` : ''
}

/** One print row per booking — leader name only. */
function guideLeaderPrintRow(
  booking: Booking,
  seatsOnThisVan?: number,
  services: CheckInServiceLine[] = [],
): GuidePassengerRow {
  return {
    bookingCode: booking.code,
    guestName: booking.leadGuest,
    leadPaxTag: formatGuideLeadPaxTag(booking, seatsOnThisVan),
    hotel: booking.pickupHotel?.trim() || '—',
    option: formatCheckInServicesOption(services),
  }
}

function GuideBoatPassengerTable({
  sections,
}: {
  sections: Array<{
    key: string
    title: string
    rows: GuidePassengerRow[]
    startNo: number
  }>
}) {
  return (
    <table className="guide-jo-table w-full table-fixed border-collapse text-[11px] leading-snug">
      <colgroup>
        <col style={{ width: '6%' }} />
        <col style={{ width: '42%' }} />
        <col style={{ width: '38%' }} />
        <col style={{ width: '14%' }} />
      </colgroup>
      <thead>
        <tr className="border-b border-teal-900/30 text-left text-[9px] tracking-wide text-teal-900/70 uppercase">
          <th className="py-1.5 pr-2 font-bold">No.</th>
          <th className="py-1.5 pr-2 font-bold">Guest name</th>
          <th className="py-1.5 pr-2 font-bold">Hotel</th>
          <th className="py-1.5 font-bold">Option</th>
        </tr>
      </thead>
      <tbody>
        {sections.map((section) => (
          <Fragment key={section.key}>
            <tr className="guide-jo-van-title">
              <td
                colSpan={4}
                className="bg-teal-50/80 px-1.5 pt-2.5 pb-1.5 text-[11px] leading-snug font-bold text-teal-950"
              >
                {section.title}
              </td>
            </tr>
            {section.rows.map((row, index) => (
              <tr key={row.bookingCode} className="border-b border-teal-900/12">
                <td className="py-1.5 pr-2 align-top text-[11px] font-semibold tabular-nums text-teal-900/55">
                  {section.startNo + index + 1}
                </td>
                <td className="py-1.5 pr-2 align-top text-[11px] font-semibold break-words text-teal-950">
                  {row.guestName}
                  {row.leadPaxTag ? (
                    <span className="guide-jo-pax ml-1.5 inline-block font-bold text-teal-700">
                      {row.leadPaxTag}
                    </span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-2 align-top text-[11px] break-words text-teal-900/85">
                  {row.hotel}
                </td>
                <td className="py-1.5 align-top text-[10px] font-medium text-teal-900/70">
                  {row.option || ''}
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
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
              assignedBoat === boat ? boatTheme(boat).badge : boatTheme(boat).softBadge,
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

