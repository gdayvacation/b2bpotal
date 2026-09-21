'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, CalendarIcon, Check, ClipboardList, Pencil, Printer, Ship } from 'lucide-react'
import { EditVanDetailsDialog } from '@/components/edit-van-details-dialog'
import { usePortal } from '@/components/portal-provider'
import { EmptyState, PageHeader, SoftLabel, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatIncludeLabel, formatCollectTotal, collectTotal, formatLongDate, formatParkFeeTotal, formatShortDate, toISODate } from '@/lib/format'
import { usePortalDefaultDateISO } from '@/lib/use-portal-today'
import {
  DEFAULT_VAN_CAPACITY,
  isActiveBooking,
  isNoTransfer,
  totalPassengers,
  type Booking,
  type CheckInAttendance,
  type DayVehiclePlan,
  type Program,
  type VanMeta,
} from '@/lib/types'
import { autoAssignVans, listVanNumbers, primaryVan, sortOrderOnVan } from '@/lib/vehicle-assign'
import { BoatFleetBadge } from '@/components/boat-badge'
import { cn } from '@/lib/utils'

type JobOrderRow = {
  no: number
  booking: Booking
}

type VanGroup = {
  id: string
  van: number | null
  driver: string
  plate: string
  phone: string
  mockMeta: boolean
  rows: JobOrderRow[]
  totals: {
    adults: number
    children: number
    infants: number
    tourLeaders: number
    pax: number
    collect: number
  }
}

type PickupSortDir = 'asc' | 'desc'
type JobAudience = 'ops' | 'agent' | 'check-in'

type AgentJobRow = {
  no: number
  booking: Booking
  vanLabel: string
  driver: string
  plate: string
  phone: string
  /** Display cash on tour (booking value or mock preview). */
  cashOnTour: string
}

type AgentGroup = {
  id: string
  agentSlug: string
  agentName: string
  rows: AgentJobRow[]
  totals: {
    adults: number
    children: number
    infants: number
    tourLeaders: number
    pax: number
    collect: number
  }
}

const MOCK_VAN_CREW = [
  { driver: 'Somchai Jaidee', plate: 'กข 1234 Phuket', phone: '081-234-5678' },
  { driver: 'Nattapong Srisuk', plate: 'ขค 5678 Phuket', phone: '089-111-2233' },
  { driver: 'Wichai Thongdi', plate: 'งจ 9012 Phuket', phone: '086-555-7788' },
  { driver: 'Anan Chaiyaphum', plate: 'ฉช 3456 Phuket', phone: '082-999-0011' },
  { driver: 'Preecha Boonmee', plate: 'ฐฑ 7890 Phuket', phone: '088-444-5566' },
] as const

function mockCrewForVan(van: number | null) {
  if (van === null || van < 1) {
    return { driver: '—', plate: '—', phone: '—' }
  }
  return MOCK_VAN_CREW[(van - 1) % MOCK_VAN_CREW.length]
}

function displayVanCrew(group: VanGroup) {
  const mock = mockCrewForVan(group.van)
  if (group.van === null) {
    return { driver: '—', plate: '—', phone: '—' }
  }
  return {
    driver: group.driver.trim() || mock.driver,
    plate: group.plate.trim() || mock.plate,
    phone: group.phone.trim() || mock.phone,
  }
}

/** rowspan for Detail: merge consecutive rows that share the same van. */
function detailRowSpans(rows: AgentJobRow[]): number[] {
  const spans = Array.from({ length: rows.length }, () => 0)
  let i = 0
  while (i < rows.length) {
    const key = rows[i].vanLabel
    let end = i + 1
    while (end < rows.length && rows[end].vanLabel === key) end += 1
    spans[i] = end - i
    i = end
  }
  return spans
}

export function AdminDailyJobOrder({
  onBack,
  audience = 'ops',
}: {
  onBack: () => void
  audience?: JobAudience
}) {
  const { bookings, getDayVehiclePlan, getDayBoatPlan, resolveVanMeta, getCheckInAttendance, setCheckInAttendance, getCheckInEnrollments } =
    usePortal()
  const [selectedDate, setSelectedDate, portalToday] = usePortalDefaultDateISO()
  const [program, setProgram] = useState<Program | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [pickupSortDir, setPickupSortDir] = useState<PickupSortDir>('asc')
  const [editVan, setEditVan] = useState<number | null>(null)
  const [agentFilter, setAgentFilter] = useState<string>('all')

  const selectedDateObj = new Date(`${selectedDate}T12:00:00`)
  const isAgentView = audience === 'agent'
  const isCheckInView = audience === 'check-in'
  const sheetVariant: 'driver' | 'check-in' = isCheckInView ? 'check-in' : 'driver'

  const boatAssignments = useMemo(() => {
    if (!program || !isCheckInView) return {} as Record<string, number>
    return getDayBoatPlan(selectedDate, program).assignments
  }, [getDayBoatPlan, isCheckInView, program, selectedDate])

  const dayBookings = useMemo(
    () =>
      bookings.filter((booking) => booking.date === selectedDate && isActiveBooking(booking)),
    [bookings, selectedDate],
  )

  const ppDay = dayBookings.filter((b) => b.program === 'PP')
  const jbDay = dayBookings.filter((b) => b.program === 'James Bond')
  const ppPax = ppDay.reduce((sum, b) => sum + totalPassengers(b), 0)
  const jbPax = jbDay.reduce((sum, b) => sum + totalPassengers(b), 0)

  const { groups, agentGroups, usingMockAssignments, bookingCount, totals } = useMemo(() => {
    if (!program) {
      return {
        groups: [] as VanGroup[],
        agentGroups: [] as AgentGroup[],
        usingMockAssignments: false,
        bookingCount: 0,
        totals: { adults: 0, children: 0, infants: 0, tourLeaders: 0 },
      }
    }
    const plan = getDayVehiclePlan(selectedDate, program)
    const programBookings = dayBookings
      .filter((booking) => booking.program === program)
      .slice()
      .sort((a, b) => compareJobOrder(a, b, pickupSortDir))
    const built = buildVanGroups(programBookings, plan, pickupSortDir, resolveVanMeta)
    const allRows = built.groups.flatMap((group) => group.rows)
    return {
      groups: built.groups,
      agentGroups: buildAgentGroups(built.groups),
      usingMockAssignments: built.usingMockAssignments,
      bookingCount: allRows.length,
      totals: allRows.reduce(
        (acc, row) => {
          acc.adults += row.booking.adults
          acc.children += row.booking.children
          acc.infants += row.booking.infants
          acc.tourLeaders += row.booking.tourLeaders
          return acc
        },
        { adults: 0, children: 0, infants: 0, tourLeaders: 0 },
      ),
    }
  }, [dayBookings, getDayVehiclePlan, program, selectedDate, pickupSortDir, resolveVanMeta])

  const visibleAgentGroups = useMemo(() => {
    if (agentFilter === 'all') return agentGroups
    return agentGroups.filter((group) => group.agentSlug === agentFilter)
  }, [agentGroups, agentFilter])

  const jobNumber = program
    ? jobOrderNumber(selectedDate, program, isAgentView ? 'agent' : isCheckInView ? 'check-in' : 'ops')
    : ''
  const programLabel =
    program === 'PP' ? 'PP · Phi Phi Islands' : program === 'James Bond' ? 'James Bond · Phang Nga Bay' : ''

  function selectDate(date: Date | undefined) {
    if (!date) return
    setSelectedDate(toISODate(date))
    setProgram(null)
    setAgentFilter('all')
    setCalendarOpen(false)
  }

  function handlePrint() {
    if (!program) return
    const previousTitle = document.title
    const programTag = program === 'PP' ? 'PP' : 'JB'
    const kind = isAgentView ? 'AgentJO' : isCheckInView ? 'CheckIn' : 'JobOrder'
    document.title = `${programTag} ${kind} ${formatShortDate(selectedDate)}`
    let restored = false
    const restoreTitle = () => {
      if (restored) return
      restored = true
      document.title = previousTitle
      window.removeEventListener('afterprint', restoreTitle)
    }
    window.addEventListener('afterprint', restoreTitle)
    window.print()
    window.setTimeout(restoreTitle, 2000)
  }

  return (
    <div className="w-full">
      <div className="print:hidden">
        <div className="mb-4">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            Report
          </Button>
        </div>

        <PageHeader
          title={
            isAgentView
              ? 'Agent Job Order'
              : isCheckInView
                ? 'Check in Report'
                : 'Driver Job Order'
          }
          description={
            isAgentView
              ? 'Grouped by agency with van number for each pickup — filter one agent, then print to send.'
              : isCheckInView
                ? 'Pick a date and program, then print the check-in sheet (same layout as Driver Job Order for now).'
                : 'Pick a date and program, then print the ops day sheet grouped by van with driver details.'
          }
          actions={
            program ? (
              <Button
                type="button"
                onClick={handlePrint}
                disabled={
                  bookingCount === 0 || (isAgentView && visibleAgentGroups.length === 0)
                }
              >
                <Printer data-icon="inline-start" />
                Print A4 landscape
              </Button>
            ) : null
          }
        />

        {program ? (
          <div className="mb-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setProgram(null)
                setAgentFilter('all')
              }}
            >
              <ArrowLeft className="size-3.5" />
              Choose program
            </Button>
          </div>
        ) : null}

        {!program ? (
          <>
            <Surface className="mb-5 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                  <SoftLabel>Trip date</SoftLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <PopoverTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 min-w-[12rem] justify-start gap-2 font-normal"
                          />
                        }
                      >
                        <CalendarIcon className="size-4 text-teal-700/60" />
                        {formatShortDate(selectedDate)}
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={selectedDateObj}
                          onSelect={selectDate}
                          defaultMonth={selectedDateObj}
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedDate(portalToday)
                        setProgram(null)
                        setAgentFilter('all')
                      }}
                    >
                      Today
                    </Button>
                  </div>
                  <p className="text-sm text-teal-900/55">
                    {formatLongDate(selectedDate)} · {dayBookings.length} booking
                    {dayBookings.length === 1 ? '' : 's'} · {ppPax + jbPax} pax
                  </p>
                </div>
              </div>
            </Surface>

            <div className="grid gap-4 sm:grid-cols-2">
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

        {program && !isAgentView ? (
          <>
            <Surface className="mb-5 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold tracking-[0.14em] text-teal-700/55 uppercase">
                    {formatLongDate(selectedDate)}
                  </p>
                  <p className="mt-1 font-display text-2xl font-semibold text-teal-950">
                    {programLabel}
                  </p>
                  <p className="mt-1.5 text-sm text-teal-900/55">
                    <span className="font-semibold text-teal-950">{bookingCount}</span> booking
                    {bookingCount === 1 ? '' : 's'} · {groups.length} van group
                    {groups.length === 1 ? '' : 's'} · Job {jobNumber}
                  </p>
                </div>
                <p className="text-xs text-teal-800/55 sm:max-w-[18rem] sm:text-right">
                  {usingMockAssignments
                    ? 'No van plan yet — showing mock van groups from Arrange vehicles for preview.'
                    : isCheckInView
                      ? 'Van groups from Arrange vehicles. Boat column from Arrange boats. For marina check-in staff.'
                      : 'Grouped from Arrange vehicles. Missing driver/plate uses mock details.'}
                </p>
              </div>
            </Surface>

            {bookingCount === 0 ? (
              <Surface className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/8 px-4 py-3 sm:px-5">
                  <div>
                    <p className="text-sm font-semibold text-teal-950">Preview</p>
                    <p className="text-xs text-teal-900/45">{programLabel} · grouped by van</p>
                  </div>
                  <p className="text-xs font-medium text-teal-800/55">
                    AD {totals.adults} · CHD {totals.children} · INF {totals.infants} · TL{' '}
                    {totals.tourLeaders}
                  </p>
                </div>
                <EmptyState>No active bookings for this program on this date.</EmptyState>
              </Surface>
            ) : (
              <div className="space-y-4">
                <Surface className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                    <div>
                      <p className="text-sm font-semibold text-teal-950">Preview</p>
                      <p className="text-xs text-teal-900/45">
                        {programLabel} · {groups.length} van card
                        {groups.length === 1 ? '' : 's'}
                        {isCheckInView ? ' · marina check-in' : ''}
                      </p>
                    </div>
                    <p className="text-xs font-medium text-teal-800/55">
                      AD {totals.adults} · CHD {totals.children} · INF {totals.infants} · TL{' '}
                      {totals.tourLeaders}
                    </p>
                  </div>
                </Surface>
                {groups.map((group) => (
                  <Surface key={group.id} className="overflow-hidden">
                    <VanGroupSection
                      group={group}
                      variant={sheetVariant}
                      program={program}
                      boatAssignments={boatAssignments}
                      getAttendance={
                        isCheckInView
                          ? (code) => getCheckInAttendance(selectedDate, program, code)
                          : undefined
                      }
                      getQrSeats={
                        isCheckInView
                          ? (code) => {
                              const enrolled = getCheckInEnrollments(selectedDate, program, code)
                              return enrolled.reduce((sum, item) => sum + item.seats, 0)
                            }
                          : undefined
                      }
                      onAttendanceChange={
                        isCheckInView
                          ? (code, status) =>
                              setCheckInAttendance(selectedDate, program, code, status)
                          : undefined
                      }
                      pickupSortDir={pickupSortDir}
                      onTogglePickupSort={() =>
                        setPickupSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
                      }
                      onEditVan={isCheckInView ? undefined : setEditVan}
                    />
                  </Surface>
                ))}
              </div>
            )}

            <EditVanDetailsDialog
              open={!isCheckInView && editVan !== null}
              onOpenChange={(open) => {
                if (!open) setEditVan(null)
              }}
              date={selectedDate}
              program={program}
              van={editVan}
            />
          </>
        ) : null}

        {program && isAgentView ? (
          <>
            <Surface className="mb-5 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold tracking-[0.14em] text-teal-700/55 uppercase">
                    {formatLongDate(selectedDate)}
                  </p>
                  <p className="mt-1 font-display text-2xl font-semibold text-teal-950">
                    {programLabel}
                  </p>
                  <p className="mt-1.5 text-sm text-teal-900/55">
                    <span className="font-semibold text-teal-950">{bookingCount}</span> booking
                    {bookingCount === 1 ? '' : 's'} · {agentGroups.length} agent
                    {agentGroups.length === 1 ? '' : 's'} · Job {jobNumber}
                  </p>
                </div>
                <div className="space-y-1.5 sm:min-w-[16rem]">
                  <SoftLabel>Filter agent</SoftLabel>
                  <select
                    value={agentFilter}
                    onChange={(event) => setAgentFilter(event.target.value)}
                    className="h-10 w-full rounded-xl border border-teal-900/12 bg-white px-3 text-sm font-medium text-teal-950 outline-none focus:border-teal-700/40"
                    aria-label="Filter by agent"
                  >
                    <option value="all">All agents</option>
                    {agentGroups.map((group) => (
                      <option key={group.agentSlug} value={group.agentSlug}>
                        {group.agentName} ({group.rows.length})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-teal-800/55 sm:text-right">
                    Print uses this filter — choose one agent to send their sheet only.
                  </p>
                </div>
              </div>
            </Surface>

            {bookingCount === 0 ? (
              <Surface className="overflow-hidden">
                <EmptyState>No active bookings for this program on this date.</EmptyState>
              </Surface>
            ) : visibleAgentGroups.length === 0 ? (
              <Surface className="overflow-hidden">
                <EmptyState>No bookings for this agent.</EmptyState>
              </Surface>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <div>
                    <p className="text-sm font-semibold text-teal-950">Preview</p>
                    <p className="text-xs text-teal-900/45">{programLabel} · one card per agency</p>
                  </div>
                  <p className="text-xs font-medium text-teal-800/55">
                    Showing {visibleAgentGroups.length} of {agentGroups.length} agent
                    {agentGroups.length === 1 ? '' : 's'}
                  </p>
                </div>
                {visibleAgentGroups.map((group) => (
                  <AgentGroupSection key={group.id} group={group} program={program} />
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>

      {program && !isAgentView ? (
        <JobOrderPrintSheet
          date={selectedDate}
          program={program}
          programLabel={programLabel}
          jobNumber={jobNumber}
          groups={groups}
          totals={totals}
          usingMockAssignments={usingMockAssignments}
          variant={sheetVariant}
          boatAssignments={boatAssignments}
          getAttendance={
            isCheckInView
              ? (code) => getCheckInAttendance(selectedDate, program, code)
              : undefined
          }
        />
      ) : null}

      {program && isAgentView ? (
        <AgentJobOrderPrintSheet
          date={selectedDate}
          program={program}
          programLabel={programLabel}
          jobNumber={jobNumber}
          groups={visibleAgentGroups}
          usingMockAssignments={usingMockAssignments}
        />
      ) : null}

      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 7mm;
          }
          html, body {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          .job-order-print-sheet,
          .job-order-print-sheet * {
            visibility: visible !important;
          }
          .job-order-print-sheet {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: #0f3d3e !important;
            box-shadow: none !important;
            border: 0 !important;
            overflow: visible !important;
            z-index: 99999 !important;
          }
          .job-order-print-sheet table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          .job-order-print-sheet thead {
            display: table-header-group;
          }
          .job-order-print-sheet tfoot {
            display: table-footer-group;
          }
          .job-order-van-card,
          .job-order-agent-card {
            break-inside: avoid;
            page-break-inside: avoid;
            -webkit-column-break-inside: avoid;
          }
          .job-order-van-card--tall,
          .job-order-agent-card--tall {
            break-inside: auto;
            page-break-inside: auto;
          }
          .job-order-van-card--tall tr,
          .job-order-agent-card--tall tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .job-order-print-footer {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}

function CheckInGuestCopyCell({
  guestName,
  vcNo,
}: {
  guestName: string
  vcNo: string
}) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)
  const longPressedRef = useRef(false)

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  async function copyGuestAndVc() {
    const text = `${guestName}\nVC No.: ${vcNo.trim() || '—'}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      window.prompt('Copy guest + VC No.:', text)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function startPress() {
    longPressedRef.current = false
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      longPressedRef.current = true
      void copyGuestAndVc()
    }, 450)
  }

  function endPress() {
    clearTimer()
  }

  return (
    <button
      type="button"
      className={cn(
        'block w-full select-none truncate text-left font-medium outline-none transition-colors',
        copied ? 'text-emerald-700' : 'text-teal-950 hover:text-sky-800',
      )}
      title="Long-press to copy guest name + VC No."
      aria-label={`Guest ${guestName}. Long-press to copy name and voucher number.`}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={(event) => {
        event.preventDefault()
        void copyGuestAndVc()
      }}
      onClick={(event) => {
        if (longPressedRef.current) {
          event.preventDefault()
          longPressedRef.current = false
        }
      }}
    >
      {copied ? 'Copied' : guestName}
    </button>
  )
}

function CheckInActionCell({
  status,
  onChange,
}: {
  status: CheckInAttendance | null
  onChange: (status: CheckInAttendance | null) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressedRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const clearPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const startPress = () => {
    longPressedRef.current = false
    clearPress()
    longPressTimer.current = setTimeout(() => {
      longPressedRef.current = true
      setMenuOpen(true)
    }, 480)
  }

  const endPress = () => {
    clearPress()
  }

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  return (
    <div ref={rootRef} className="relative inline-flex justify-center">
      <button
        type="button"
        className={cn(
          'inline-flex size-7 items-center justify-center rounded-md border transition-colors',
          status === 'checked' && 'border-teal-700/40 bg-teal-700 text-white',
          status === 'no-show' && 'border-orange-500/50 bg-orange-500 text-white',
          !status && 'border-teal-900/30 bg-white text-transparent hover:border-teal-800/45',
        )}
        aria-label={
          status === 'checked'
            ? 'Checked in. Long-press for No Show options.'
            : status === 'no-show'
              ? 'No show. Long-press for options.'
              : 'Not marked. Click to tick, long-press for No Show.'
        }
        title="Click to tick · Long-press for No Show"
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onPointerCancel={endPress}
        onContextMenu={(event) => {
          event.preventDefault()
          setMenuOpen(true)
        }}
        onClick={(event) => {
          if (longPressedRef.current) {
            event.preventDefault()
            longPressedRef.current = false
            return
          }
          setMenuOpen(false)
          onChange(status === 'checked' ? null : 'checked')
        }}
      >
        {status === 'checked' ? (
          <Check className="size-3.5" strokeWidth={3} />
        ) : status === 'no-show' ? (
          <span className="text-[9px] font-bold tracking-wide text-white">NS</span>
        ) : (
          <span className="size-3.5" />
        )}
      </button>
      {menuOpen ? (
        <div className="absolute top-full right-0 z-30 mt-1 w-36 overflow-hidden rounded-lg border border-teal-900/10 bg-white py-1 shadow-md">
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm font-medium text-orange-800 transition-colors hover:bg-orange-50"
            onClick={() => {
              onChange('no-show')
              setMenuOpen(false)
            }}
          >
            No Show
          </button>
          {status ? (
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm font-medium text-teal-900/70 transition-colors hover:bg-teal-50"
              onClick={() => {
                onChange(null)
                setMenuOpen(false)
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function VanGroupSection({
  group,
  variant = 'driver',
  program,
  boatAssignments = {},
  getAttendance,
  getQrSeats,
  onAttendanceChange,
  pickupSortDir,
  onTogglePickupSort,
  onEditVan,
}: {
  group: VanGroup
  variant?: 'driver' | 'check-in'
  program: Program
  boatAssignments?: Record<string, number>
  getAttendance?: (bookingCode: string) => CheckInAttendance | null
  getQrSeats?: (bookingCode: string) => number
  onAttendanceChange?: (bookingCode: string, status: CheckInAttendance | null) => void
  pickupSortDir: PickupSortDir
  onTogglePickupSort: () => void
  onEditVan?: (van: number) => void
}) {
  const title = group.van === null ? 'No Transfer / Unassigned' : `Van ${group.van}`
  const SortIcon = pickupSortDir === 'asc' ? ArrowUp : ArrowDown
  const isCheckIn = variant === 'check-in'
  const showCanoe = isCheckIn && program === 'James Bond'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-teal-50/70 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-teal-950">{title}</p>
            {group.mockMeta ? (
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                Needs details
              </span>
            ) : null}
            {group.van !== null && onEditVan ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-teal-800/70 transition-colors hover:bg-teal-100 hover:text-teal-950"
                onClick={() => onEditVan(group.van!)}
              >
                <Pencil className="size-3" />
                Edit van
              </button>
            ) : null}
          </div>
          {group.van !== null ? (
            <p className="mt-0.5 text-xs text-teal-900/60">
              Driver:{' '}
              <span className="font-medium text-teal-950">{group.driver || '—'}</span>
              {group.phone ? (
                <>
                  <span className="mx-1.5 text-teal-900/25">·</span>
                  Tel: <span className="font-medium text-teal-950">{group.phone}</span>
                </>
              ) : null}
              <span className="mx-1.5 text-teal-900/25">·</span>
              Plate: <span className="font-medium text-teal-950">{group.plate || '—'}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-teal-900/55">No hotel transfer for these bookings.</p>
          )}
        </div>
        <p className="text-xs font-medium tabular-nums text-teal-800/60">
          {group.rows.length} booking{group.rows.length === 1 ? '' : 's'} · {group.totals.pax} pax
        </p>
      </div>

      <div className={cn(!isCheckIn && 'overflow-x-auto')}>
        <Table
          className={cn(
            'table-fixed text-[13px] [&_th]:px-1 [&_td]:px-1',
            isCheckIn && '[&_th]:px-1 [&_td]:px-1',
          )}
          containerClassName={isCheckIn ? 'overflow-x-hidden' : undefined}
        >
          <TableHeader>
            <TableRow className="border-b border-teal-900/15 bg-teal-950/[0.04] hover:bg-teal-950/[0.04]">
              <TableHead
                className={cn(
                  'text-[11px] font-bold tracking-wide text-teal-900/80 uppercase',
                  isCheckIn ? 'w-[3%]' : 'w-10',
                )}
              >
                No.
              </TableHead>
              {isCheckIn ? (
                <>
                  <TableHead className="w-[8%] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    VC No.
                  </TableHead>
                  <TableHead className="w-[11%] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    Guest name
                  </TableHead>
                  <TableHead
                    className={cn(
                      'text-[11px] font-bold tracking-wide text-teal-900/80 uppercase',
                      showCanoe ? 'w-[12%]' : 'w-[15%]',
                    )}
                  >
                    Hotel
                  </TableHead>
                  <TableHead className="w-[3%] px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    AD
                  </TableHead>
                  <TableHead className="w-[3%] px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    CHD
                  </TableHead>
                  <TableHead className="w-[3%] px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    INF
                  </TableHead>
                  <TableHead className="w-[3%] px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    TL
                  </TableHead>
                  <TableHead className="w-[3.5%] px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    Boat
                  </TableHead>
                  <TableHead className="w-[5%] px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    Park
                  </TableHead>
                  <TableHead className="w-[4.5%] px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    Fee
                  </TableHead>
                  {showCanoe ? (
                    <TableHead className="w-[5.5%] px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                      Canoe
                    </TableHead>
                  ) : null}
                  <TableHead className="w-[5%] px-0.5 pr-0 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    COT
                  </TableHead>
                  <TableHead className="w-[4.5%] px-0.5 pl-0 text-right text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    Total
                  </TableHead>
                  <TableHead className="w-[8%] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    Remark
                  </TableHead>
                  <TableHead className="w-[7%] px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    Status
                  </TableHead>
                  <TableHead className="w-[4.5%] px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    Action
                  </TableHead>
                </>
              ) : (
                <>
                  <TableHead className="w-[22%] pr-1 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    Hotel
                  </TableHead>
                  <TableHead className="w-[18%] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    Guest name
                  </TableHead>
                  <TableHead className="w-[4.5rem] px-1 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 rounded-md transition-colors hover:text-teal-950"
                      onClick={onTogglePickupSort}
                      aria-label={`Sort by pickup time, currently ${pickupSortDir === 'asc' ? 'earliest first' : 'latest first'}`}
                      title="Sort by pickup time"
                    >
                      P/U Time
                      <SortIcon className="size-3 opacity-70" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[5.5rem] px-1 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    Zone
                  </TableHead>
                  <TableHead className="w-9 px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    AD
                  </TableHead>
                  <TableHead className="w-9 px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    CHD
                  </TableHead>
                  <TableHead className="w-9 px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    INF
                  </TableHead>
                  <TableHead className="w-9 px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    TL
                  </TableHead>
                  <TableHead className="w-10 px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                    Tot
                  </TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.rows.map(({ no, booking }) => {
              const attendance = getAttendance?.(booking.code) ?? null
              return (
              <TableRow
                key={`${group.van ?? 'none'}-${booking.code}`}
                className={cn(attendance === 'no-show' && 'bg-orange-50/70 hover:bg-orange-50/90')}
              >
                <TableCell className="tabular-nums text-teal-900/55">{no}</TableCell>
                {isCheckIn ? (
                  <>
                    <TableCell className="text-teal-900/55">
                      <div className="truncate font-mono text-xs" title={booking.agentRef}>
                        {booking.agentRef || '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <CheckInGuestCopyCell
                        guestName={booking.leadGuest}
                        vcNo={booking.agentRef}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="truncate" title={booking.pickupHotel}>
                        {booking.pickupHotel || '—'}
                      </div>
                    </TableCell>
                    <TableCell className="px-1 text-center tabular-nums">
                      {booking.adults || ''}
                    </TableCell>
                    <TableCell className="px-1 text-center tabular-nums">
                      {booking.children || ''}
                    </TableCell>
                    <TableCell className="px-1 text-center tabular-nums">
                      {booking.infants || ''}
                    </TableCell>
                    <TableCell className="px-1 text-center tabular-nums">
                      {booking.tourLeaders || ''}
                    </TableCell>
                    <TableCell className="px-1 text-center">
                      <BoatFleetBadge boat={boatAssignments[booking.code]} />
                    </TableCell>
                    <TableCell className="px-1 text-center text-xs whitespace-nowrap">
                      {formatIncludeLabel(booking.parkFee)}
                    </TableCell>
                    <TableCell className="px-1 text-center tabular-nums text-xs font-medium text-teal-950">
                      {formatParkFeeTotal(
                        booking.parkFee,
                        program,
                        booking.adults,
                        booking.children,
                      )}
                    </TableCell>
                    {showCanoe ? (
                      <TableCell className="px-1 text-center text-xs whitespace-nowrap">
                        {formatIncludeLabel(booking.canoe)}
                      </TableCell>
                    ) : null}
                    <TableCell className="pr-0.5">
                      <div
                        className="truncate text-xs font-medium text-teal-950"
                        title={booking.cashOnTour}
                      >
                        {booking.cashOnTour.trim() || ''}
                      </div>
                    </TableCell>
                    <TableCell className="px-0.5 pl-0 text-right tabular-nums text-xs font-medium text-teal-950">
                      {formatCollectTotal(
                        booking.parkFee,
                        program,
                        booking.adults,
                        booking.children,
                        booking.cashOnTour,
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="truncate text-teal-900/60" title={booking.note}>
                        {booking.note || ''}
                      </div>
                    </TableCell>
                    <TableCell className="px-1 text-center text-xs text-teal-900/70">
                      {(() => {
                        const qrSeats = getQrSeats?.(booking.code) ?? 0
                        const pax = totalPassengers(booking)
                        if (attendance === 'checked' || qrSeats >= pax) {
                          return (
                            <span className="font-semibold text-emerald-700">QR {pax}/{pax}</span>
                          )
                        }
                        if (qrSeats > 0) {
                          return (
                            <span className="font-medium text-amber-700">
                              QR {qrSeats}/{pax}
                            </span>
                          )
                        }
                        return <span className="text-teal-900/30">—</span>
                      })()}
                    </TableCell>
                    <TableCell className="px-1 text-center">
                      {onAttendanceChange ? (
                        <CheckInActionCell
                          status={attendance}
                          onChange={(next) => onAttendanceChange(booking.code, next)}
                        />
                      ) : (
                        <span className="inline-block size-3.5 rounded-sm border border-teal-900/35" />
                      )}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="pr-1">
                      <div className="truncate" title={booking.pickupHotel}>
                        {booking.pickupHotel || '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="truncate font-medium" title={booking.leadGuest}>
                        {booking.leadGuest}
                      </div>
                    </TableCell>
                    <TableCell className="px-1 whitespace-nowrap tabular-nums text-teal-950">
                      {formatPickupTime(booking.pickupTime)}
                    </TableCell>
                    <TableCell className="px-1">
                      <div className="truncate" title={booking.pickupZone}>
                        {booking.pickupZone || '—'}
                      </div>
                    </TableCell>
                    <TableCell className="px-0.5 text-center tabular-nums">{booking.adults || ''}</TableCell>
                    <TableCell className="px-0.5 text-center tabular-nums">{booking.children || ''}</TableCell>
                    <TableCell className="px-0.5 text-center tabular-nums">{booking.infants || ''}</TableCell>
                    <TableCell className="px-0.5 text-center tabular-nums">
                      {booking.tourLeaders || ''}
                    </TableCell>
                    <TableCell className="px-0.5 text-center font-medium tabular-nums text-teal-950">
                      {totalPassengers(booking)}
                    </TableCell>
                  </>
                )}
              </TableRow>
              )
            })}
            <TableRow className="bg-teal-50/40 hover:bg-teal-50/40">
              {isCheckIn ? (
                <>
                  <TableCell colSpan={4} className="text-xs font-semibold text-teal-900/70">
                    Group total
                  </TableCell>
                  <TableCell className="px-1 text-center tabular-nums text-xs font-semibold">
                    {group.totals.adults}
                  </TableCell>
                  <TableCell className="px-1 text-center tabular-nums text-xs font-semibold">
                    {group.totals.children}
                  </TableCell>
                  <TableCell className="px-1 text-center tabular-nums text-xs font-semibold">
                    {group.totals.infants}
                  </TableCell>
                  <TableCell className="px-1 text-center tabular-nums text-xs font-semibold">
                    {group.totals.tourLeaders}
                  </TableCell>
                  <TableCell colSpan={showCanoe ? 5 : 4} />
                  <TableCell className="px-0.5 pl-0 text-right tabular-nums text-xs font-semibold text-teal-950">
                    {group.totals.collect > 0
                      ? group.totals.collect.toLocaleString('en-US')
                      : ''}
                  </TableCell>
                  <TableCell colSpan={3} />
                </>
              ) : (
                <>
                  <TableCell colSpan={5} className="text-xs font-semibold text-teal-900/70">
                    Group total
                  </TableCell>
                  <TableCell className="px-1 text-center tabular-nums text-xs font-semibold">
                    {group.totals.adults}
                  </TableCell>
                  <TableCell className="px-1 text-center tabular-nums text-xs font-semibold">
                    {group.totals.children}
                  </TableCell>
                  <TableCell className="px-1 text-center tabular-nums text-xs font-semibold">
                    {group.totals.infants}
                  </TableCell>
                  <TableCell className="px-1 text-center tabular-nums text-xs font-semibold">
                    {group.totals.tourLeaders}
                  </TableCell>
                  <TableCell className="px-1 text-center tabular-nums text-xs font-semibold text-teal-950">
                    {group.totals.pax}
                  </TableCell>
                </>
              )}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function AgentGroupSection({
  group,
  program,
}: {
  group: AgentGroup
  program: Program
}) {
  const detailSpans = detailRowSpans(group.rows)
  const showCanoe = program === 'James Bond'

  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/10 bg-gradient-to-r from-teal-50/90 to-white px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-teal-700/55 uppercase">
            Agency
          </p>
          <p className="mt-0.5 text-base font-semibold text-teal-950">{group.agentName}</p>
        </div>
        <div className="rounded-full border border-teal-900/10 bg-white/80 px-3 py-1 text-xs font-medium tabular-nums text-teal-800/70">
          {group.rows.length} booking{group.rows.length === 1 ? '' : 's'} · {group.totals.pax} pax
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="border-b border-teal-900/15 bg-teal-950/[0.04] hover:bg-teal-950/[0.04]">
              <TableHead className="w-8 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                No.
              </TableHead>
              <TableHead className="w-[6.2rem] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                VC No.
              </TableHead>
              <TableHead className="w-[8.5rem] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Guest name
              </TableHead>
              <TableHead className="w-7 px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                AD
              </TableHead>
              <TableHead className="w-7 px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                CHD
              </TableHead>
              <TableHead className="w-7 px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                INF
              </TableHead>
              <TableHead className="w-7 px-0.5 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                TL
              </TableHead>
              <TableHead className="w-[4rem] px-1 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                P/U Time
              </TableHead>
              <TableHead className="w-[9rem] pr-1 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Hotel
              </TableHead>
              <TableHead className="w-[5.5rem] px-1 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                National Park
              </TableHead>
              {showCanoe ? (
                <TableHead className="w-[5rem] px-1 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                  Canoe
                </TableHead>
              ) : null}
              <TableHead className="w-[7rem] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                COT
              </TableHead>
              <TableHead className="w-[5.5rem] px-1 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Total
              </TableHead>
              <TableHead className="w-[11rem] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Detail
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.rows.map(({ no, booking, vanLabel, driver, plate, phone, cashOnTour }, index) => {
              const span = detailSpans[index]
              let owningGroup = 0
              {
                let seen = 0
                for (let i = 0; i <= index; i++) {
                  if (detailSpans[i] > 0) owningGroup = seen++
                }
              }
              const stripe = owningGroup % 2 === 0
              return (
                <TableRow
                  key={`${group.agentSlug}-${booking.code}`}
                  className={cn(
                    stripe
                      ? 'bg-teal-50/50 hover:bg-teal-50/70'
                      : 'bg-stone-50/80 hover:bg-stone-100/70',
                  )}
                >
                  <TableCell className="tabular-nums text-teal-900/55">{no}</TableCell>
                  <TableCell>
                    <div className="truncate tabular-nums text-teal-950" title={booking.agentRef || undefined}>
                      {booking.agentRef?.trim() || '—'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="truncate font-medium" title={booking.leadGuest}>
                      {booking.leadGuest}
                    </div>
                  </TableCell>
                  <TableCell className="px-0.5 text-center tabular-nums">{booking.adults || ''}</TableCell>
                  <TableCell className="px-0.5 text-center tabular-nums">{booking.children || ''}</TableCell>
                  <TableCell className="px-0.5 text-center tabular-nums">{booking.infants || ''}</TableCell>
                  <TableCell className="px-0.5 text-center tabular-nums">
                    {booking.tourLeaders || ''}
                  </TableCell>
                  <TableCell className="px-1 whitespace-nowrap tabular-nums text-teal-950">
                    {formatPickupTime(booking.pickupTime)}
                  </TableCell>
                  <TableCell className="pr-1">
                    <div className="truncate" title={booking.pickupHotel}>
                      {booking.pickupHotel || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="px-1 text-center text-xs whitespace-nowrap">
                    {formatIncludeLabel(booking.parkFee)}
                  </TableCell>
                  {showCanoe ? (
                    <TableCell className="px-1 text-center text-xs whitespace-nowrap">
                      {formatIncludeLabel(booking.canoe)}
                    </TableCell>
                  ) : null}
                  <TableCell className="px-1 text-center">
                    <div
                      className="truncate text-xs font-medium text-teal-950"
                      title={cashOnTour}
                    >
                      {cashOnTour || ''}
                    </div>
                  </TableCell>
                  <TableCell className="px-1 text-center tabular-nums text-xs font-medium text-teal-950">
                    {formatCollectTotal(
                      booking.parkFee,
                      program,
                      booking.adults,
                      booking.children,
                      cashOnTour,
                    )}
                  </TableCell>
                  {span > 0 ? (
                    <TableCell
                      rowSpan={span}
                      className={cn(
                        'align-middle border-l border-teal-900/15 px-3 py-2.5',
                        stripe ? 'bg-teal-50/50' : 'bg-stone-50/80',
                      )}
                    >
                      {vanLabel.startsWith('Van') ? (
                        <div className="space-y-1.5 text-sm leading-snug text-teal-900/80">
                          <p>
                            <span className="text-teal-900/50">Driver</span>{' '}
                            <span className="font-semibold text-teal-950">{driver}</span>
                          </p>
                          <p>
                            <span className="text-teal-900/50">Plate</span>{' '}
                            <span className="font-semibold text-teal-950">{plate}</span>
                          </p>
                          <p>
                            <span className="text-teal-900/50">Tel</span>{' '}
                            <span className="font-semibold text-teal-950">{phone}</span>
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-teal-900/40">—</span>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              )
            })}
            <TableRow className="bg-teal-50/40 hover:bg-teal-50/40">
              <TableCell colSpan={3} className="text-xs font-semibold text-teal-900/70">
                Agent total
              </TableCell>
              <TableCell className="px-0.5 text-center tabular-nums text-xs font-semibold">
                {group.totals.adults}
              </TableCell>
              <TableCell className="px-0.5 text-center tabular-nums text-xs font-semibold">
                {group.totals.children}
              </TableCell>
              <TableCell className="px-0.5 text-center tabular-nums text-xs font-semibold">
                {group.totals.infants}
              </TableCell>
              <TableCell className="px-0.5 text-center tabular-nums text-xs font-semibold">
                {group.totals.tourLeaders}
              </TableCell>
              <TableCell colSpan={showCanoe ? 5 : 4} />
              <TableCell className="px-1 text-center tabular-nums text-xs font-semibold text-teal-950">
                {group.totals.collect > 0
                  ? group.totals.collect.toLocaleString('en-US')
                  : ''}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Surface>
  )
}

function AgentJobOrderPrintSheet({
  date,
  program,
  programLabel,
  jobNumber,
  groups,
  usingMockAssignments,
}: {
  date: string
  program: Program
  programLabel: string
  jobNumber: string
  groups: AgentGroup[]
  usingMockAssignments: boolean
}) {
  const showCanoe = program === 'James Bond'
  const border = 'border border-teal-900/20'
  const th = cn(border, 'bg-teal-950/[0.06] px-1 py-1.5 text-[9px] font-bold tracking-wide text-teal-900/80 uppercase')
  const td = cn(border, 'px-1 py-1 text-[9.5px] text-teal-950')

  return (
    <div className="job-order-print-sheet hidden print:block">
      <div className="mb-3 flex items-end justify-between gap-4 border-b-2 border-teal-900/25 pb-2.5">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-teal-700/70 uppercase">
            G&apos;Day Tours Phuket · Agent Job Order
          </p>
          <h1 className="mt-0.5 text-lg font-bold text-teal-950">
            {program === 'PP' ? 'PP' : 'JB'} · {programLabel}
          </h1>
          <p className="mt-0.5 text-xs text-teal-900/60">
            {formatLongDate(date)} · Job {jobNumber}
            {usingMockAssignments ? ' · preview vans' : ''}
            {groups.length > 0
              ? ` · ${groups.length} agent${groups.length === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>
        <div className="text-right text-[11px] text-teal-900/65">
          <p>
            Prepared by: <span className="inline-block min-w-[7rem] border-b border-teal-900/25" />
          </p>
          <p className="mt-1">
            Checked by: <span className="inline-block min-w-[7rem] border-b border-teal-900/25" />
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-teal-900/45">No bookings to print.</p>
      ) : (
        <div className="space-y-3.5">
          {groups.map((group) => {
            const detailSpans = detailRowSpans(group.rows)
            const tall = group.rows.length > 10
            return (
              <div
                key={group.id}
                className={cn(
                  'job-order-agent-card overflow-hidden rounded-xl border border-teal-900/15',
                  tall && 'job-order-agent-card--tall',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/10 bg-gradient-to-r from-teal-50 to-white px-3 py-2">
                  <div>
                    <p className="text-[9px] font-semibold tracking-[0.14em] text-teal-700/55 uppercase">
                      Agency
                    </p>
                    <p className="text-sm font-semibold text-teal-950">{group.agentName}</p>
                  </div>
                  <p className="rounded-full border border-teal-900/10 bg-white/90 px-2.5 py-0.5 text-[10px] font-medium tabular-nums text-teal-800/70">
                    {group.rows.length} booking{group.rows.length === 1 ? '' : 's'} ·{' '}
                    {group.totals.pax} pax
                  </p>
                </div>

                <table className="w-full border-collapse text-left leading-tight">
                  <thead>
                    <tr>
                      <th className={cn(th, 'w-7 text-center')}>No.</th>
                      <th className={cn(th, 'w-[5rem]')}>VC No.</th>
                      <th className={th}>Guest name</th>
                      <th className={cn(th, 'w-7 text-center')}>AD</th>
                      <th className={cn(th, 'w-7 text-center')}>CHD</th>
                      <th className={cn(th, 'w-7 text-center')}>INF</th>
                      <th className={cn(th, 'w-7 text-center')}>TL</th>
                      <th className={cn(th, 'w-12')}>P/U Time</th>
                      <th className={th}>Hotel</th>
                      <th className={cn(th, 'w-16 text-center')}>Nat. Park</th>
                      {showCanoe ? (
                        <th className={cn(th, 'w-14 text-center')}>Canoe</th>
                      ) : null}
                      <th className={cn(th, 'w-14')}>COT</th>
                      <th className={cn(th, 'w-14 text-center')}>Total</th>
                      <th className={th}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map(
                      ({ no, booking, vanLabel, driver, plate, phone, cashOnTour }, index) => {
                        const span = detailSpans[index]
                        const stripe = (() => {
                          let owning = 0
                          let seen = 0
                          for (let i = 0; i <= index; i++) {
                            if (detailSpans[i] > 0) owning = seen++
                          }
                          return owning % 2 === 0
                        })()
                        return (
                          <tr
                            key={`${group.agentSlug}-${booking.code}`}
                            className={stripe ? 'bg-teal-50/55' : 'bg-stone-50/70'}
                          >
                            <td className={cn(td, 'text-center tabular-nums text-teal-900/55')}>
                              {no}
                            </td>
                            <td className={cn(td, 'tabular-nums')}>
                              {booking.agentRef?.trim() || '—'}
                            </td>
                            <td className={cn(td, 'font-medium')}>{booking.leadGuest}</td>
                            <td className={cn(td, 'text-center tabular-nums')}>
                              {blankIfZero(booking.adults)}
                            </td>
                            <td className={cn(td, 'text-center tabular-nums')}>
                              {blankIfZero(booking.children)}
                            </td>
                            <td className={cn(td, 'text-center tabular-nums')}>
                              {blankIfZero(booking.infants)}
                            </td>
                            <td className={cn(td, 'text-center tabular-nums')}>
                              {blankIfZero(booking.tourLeaders)}
                            </td>
                            <td className={cn(td, 'tabular-nums')}>
                              {formatPickupTime(booking.pickupTime)}
                            </td>
                            <td className={td}>{booking.pickupHotel}</td>
                            <td className={cn(td, 'text-center whitespace-nowrap')}>
                              {formatIncludeLabel(booking.parkFee)}
                            </td>
                            {showCanoe ? (
                              <td className={cn(td, 'text-center whitespace-nowrap')}>
                                {formatIncludeLabel(booking.canoe)}
                              </td>
                            ) : null}
                            <td className={cn(td, 'font-medium')}>{cashOnTour}</td>
                            <td className={cn(td, 'text-center tabular-nums font-medium')}>
                              {formatCollectTotal(
                                booking.parkFee,
                                program,
                                booking.adults,
                                booking.children,
                                cashOnTour,
                              )}
                            </td>
                            {span > 0 ? (
                              <td
                                rowSpan={span}
                                className={cn(
                                  td,
                                  'align-middle',
                                  stripe ? 'bg-teal-50/55' : 'bg-stone-50/70',
                                )}
                              >
                                {vanLabel.startsWith('Van')
                                  ? `${driver} · ${plate} · ${phone}`
                                  : '—'}
                              </td>
                            ) : null}
                          </tr>
                        )
                      },
                    )}
                    <tr className="bg-teal-50/80 font-semibold">
                      <td className={cn(td, 'text-teal-900/70')} colSpan={3}>
                        Agent total
                      </td>
                      <td className={cn(td, 'text-center tabular-nums')}>
                        {group.totals.adults}
                      </td>
                      <td className={cn(td, 'text-center tabular-nums')}>
                        {group.totals.children}
                      </td>
                      <td className={cn(td, 'text-center tabular-nums')}>
                        {group.totals.infants}
                      </td>
                      <td className={cn(td, 'text-center tabular-nums')}>
                        {group.totals.tourLeaders}
                      </td>
                      <td className={td} colSpan={showCanoe ? 5 : 4} />
                      <td className={cn(td, 'text-center tabular-nums')}>
                        {group.totals.collect > 0
                          ? group.totals.collect.toLocaleString('en-US')
                          : ''}
                      </td>
                      <td className={td} />
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}
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
          <p className="text-xs font-medium tracking-wide text-teal-700/50 uppercase">Bookings</p>
          <p className="mt-1 font-display text-3xl font-semibold text-teal-950">{bookings}</p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-teal-700/50 uppercase">Pax</p>
          <p className="mt-1 font-display text-3xl font-semibold text-teal-950">{pax}</p>
        </div>
      </div>
      <p className="mt-5 text-base font-medium text-teal-800">Open job order →</p>
    </button>
  )
}

function JobOrderPrintSheet({
  date,
  program,
  programLabel,
  jobNumber,
  groups,
  totals,
  usingMockAssignments,
  variant = 'driver',
  boatAssignments = {},
  getAttendance,
}: {
  date: string
  program: Program
  programLabel: string
  jobNumber: string
  groups: VanGroup[]
  totals: { adults: number; children: number; infants: number; tourLeaders: number }
  usingMockAssignments: boolean
  variant?: 'driver' | 'check-in'
  boatAssignments?: Record<string, number>
  getAttendance?: (bookingCode: string) => CheckInAttendance | null
}) {
  const isCheckIn = variant === 'check-in'
  const showCanoe = isCheckIn && program === 'James Bond'
  const trailingBeforeTotal = isCheckIn ? (showCanoe ? 5 : 4) : 0
  const trailingAfterTotal = isCheckIn ? 3 : 0
  const leadingColSpan = isCheckIn ? 4 : 5

  return (
    <div className="job-order-print-sheet hidden print:block">
      <div className="mb-3 flex items-end justify-between gap-4 border-b-2 border-teal-900/25 pb-2.5">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-teal-700/70 uppercase">
            G&apos;Day Tours Phuket · {isCheckIn ? 'Check in Report' : 'Driver Job Order'}
          </p>
          <h1 className="mt-0.5 text-lg font-bold text-teal-950">
            {program === 'PP' ? 'PP' : 'JB'} · {programLabel}
          </h1>
          <p className="mt-0.5 text-xs text-teal-900/60">
            {formatLongDate(date)} · Job {jobNumber}
            {usingMockAssignments ? ' · preview vans' : ''}
            {isCheckIn ? ' · marina check-in' : ''}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-[11px] text-teal-900/70">
          <p>
            Prepared by: <span className="inline-block min-w-[6.5rem] border-b border-teal-900/25" />
          </p>
          <p>
            Checked by: <span className="inline-block min-w-[6.5rem] border-b border-teal-900/25" />
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          No active bookings for this program on this date.
        </p>
      ) : (
        <>
          {groups.map((group) => {
            const tall = group.rows.length > 12
            return (
              <div
                key={group.id}
                className={cn(
                  'job-order-van-card mb-3 overflow-hidden rounded-xl border border-teal-900/15',
                  tall && 'job-order-van-card--tall',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/10 bg-gradient-to-r from-teal-50 to-white px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-teal-950">
                      {group.van === null ? 'No Transfer / Unassigned' : `Van ${group.van}`}
                    </p>
                    {group.van !== null ? (
                      <p className="mt-0.5 text-[10px] text-teal-900/60">
                        Driver: <span className="font-medium text-teal-950">{group.driver || '—'}</span>
                        {group.phone ? (
                          <>
                            {' · '}Tel:{' '}
                            <span className="font-medium text-teal-950">{group.phone}</span>
                          </>
                        ) : null}
                        {' · '}Plate:{' '}
                        <span className="font-medium text-teal-950">{group.plate || '—'}</span>
                        {group.mockMeta ? ' · needs details' : ''}
                      </p>
                    ) : null}
                  </div>
                  <p className="rounded-full border border-teal-900/10 bg-white/90 px-2.5 py-0.5 text-[10px] font-medium tabular-nums text-teal-800/70">
                    {group.rows.length} booking{group.rows.length === 1 ? '' : 's'} ·{' '}
                    {group.totals.pax} pax
                  </p>
                </div>
                <table className="w-full table-fixed border-collapse text-left text-[9.5px] leading-tight">
                  <thead>
                    <tr className="bg-teal-950/[0.06]">
                      <th className="w-8 border border-teal-900/20 px-1 py-1.5 font-bold tracking-wide text-teal-900/80 uppercase">
                        No.
                      </th>
                      {isCheckIn ? (
                        <>
                          <th className="w-[9%] border border-teal-900/20 px-1 py-1 font-semibold">
                            VC NO.
                          </th>
                          <th className="w-[12%] border border-teal-900/20 px-1 py-1 font-semibold">
                            GUEST NAME
                          </th>
                          <th className="w-[14%] border border-teal-900/20 px-1 py-1 font-semibold">
                            HOTEL
                          </th>
                        </>
                      ) : (
                        <>
                          <th className="w-[22%] border border-teal-900/20 px-1 py-1 font-semibold">
                            Hotel
                          </th>
                          <th className="w-[18%] border border-teal-900/20 px-1 py-1 font-semibold">
                            Guest name
                          </th>
                          <th className="w-12 border border-teal-900/20 px-0.5 py-1 font-semibold">
                            P/U Time
                          </th>
                          <th className="w-14 border border-teal-900/20 px-0.5 py-1 font-semibold">
                            Zone
                          </th>
                        </>
                      )}
                      <th className="w-8 border border-teal-900/20 px-0.5 py-1 text-center font-semibold">
                        AD
                      </th>
                      <th className="w-8 border border-teal-900/20 px-0.5 py-1 text-center font-semibold">
                        CHD
                      </th>
                      <th className="w-8 border border-teal-900/20 px-0.5 py-1 text-center font-semibold">
                        INF
                      </th>
                      <th className="w-8 border border-teal-900/20 px-0.5 py-1 text-center font-semibold">
                        TL
                      </th>
                      {isCheckIn ? (
                        <>
                          <th className="w-10 border border-teal-900/20 px-0.5 py-1 text-center font-semibold">
                            BOAT
                          </th>
                          <th className="w-16 border border-teal-900/20 px-0.5 py-1 text-center font-semibold">
                            PARK
                          </th>
                          <th className="w-10 border border-teal-900/20 px-0.5 py-1 text-center font-semibold">
                            FEE
                          </th>
                          {showCanoe ? (
                            <th className="w-16 border border-teal-900/20 px-0.5 py-1 text-center font-semibold">
                              CANOE
                            </th>
                          ) : null}
                          <th className="w-14 border border-teal-900/20 px-1 py-1 font-semibold">COT</th>
                          <th className="w-12 border border-teal-900/20 px-0.5 py-1 text-right font-semibold">
                            TOTAL
                          </th>
                          <th className="w-16 border border-teal-900/20 px-1 py-1 font-semibold">
                            REMARK
                          </th>
                          <th className="w-16 border border-teal-900/20 px-0.5 py-1 text-center font-semibold">
                            STATUS
                          </th>
                          <th className="w-14 border border-teal-900/20 px-0.5 py-1 text-center font-semibold">
                            ACTION
                          </th>
                        </>
                      ) : (
                        <th className="w-8 border border-teal-900/20 px-0.5 py-1 text-center font-semibold">
                          TOT
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map(({ no, booking }) => (
                      <tr key={`${group.van ?? 'none'}-${booking.code}`}>
                        <td className="border border-teal-900/20 px-1 py-0.5 text-center tabular-nums">
                          {no}
                        </td>
                        {isCheckIn ? (
                          <>
                            <td className="border border-teal-900/20 px-1 py-0.5">
                              {booking.agentRef || '—'}
                            </td>
                            <td className="border border-teal-900/20 px-1 py-0.5">
                              {booking.leadGuest}
                            </td>
                            <td className="border border-teal-900/20 px-1 py-0.5">
                              {booking.pickupHotel || '—'}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="border border-teal-900/20 px-1 py-0.5">
                              {booking.pickupHotel}
                            </td>
                            <td className="border border-teal-900/20 px-1 py-0.5 font-medium">
                              {booking.leadGuest}
                            </td>
                            <td className="border border-teal-900/20 px-1 py-0.5 tabular-nums">
                              {formatPickupTime(booking.pickupTime)}
                            </td>
                            <td className="border border-teal-900/20 px-1 py-0.5">
                              {booking.pickupZone}
                            </td>
                          </>
                        )}
                        <td className="border border-teal-900/20 px-1 py-0.5 text-center tabular-nums">
                          {blankIfZero(booking.adults)}
                        </td>
                        <td className="border border-teal-900/20 px-1 py-0.5 text-center tabular-nums">
                          {blankIfZero(booking.children)}
                        </td>
                        <td className="border border-teal-900/20 px-1 py-0.5 text-center tabular-nums">
                          {blankIfZero(booking.infants)}
                        </td>
                        <td className="border border-teal-900/20 px-1 py-0.5 text-center tabular-nums">
                          {blankIfZero(booking.tourLeaders)}
                        </td>
                        {isCheckIn ? (
                          <>
                            <td className="border border-teal-900/20 px-1 py-0.5 text-center">
                              <BoatFleetBadge boat={boatAssignments[booking.code]} />
                            </td>
                            <td className="border border-teal-900/20 px-1 py-0.5 text-center whitespace-nowrap">
                              {formatIncludeLabel(booking.parkFee)}
                            </td>
                            <td className="border border-teal-900/20 px-1 py-0.5 text-center tabular-nums">
                              {formatParkFeeTotal(
                                booking.parkFee,
                                program,
                                booking.adults,
                                booking.children,
                              )}
                            </td>
                            {showCanoe ? (
                              <td className="border border-teal-900/20 px-1 py-0.5 text-center whitespace-nowrap">
                                {formatIncludeLabel(booking.canoe)}
                              </td>
                            ) : null}
                            <td className="border border-teal-900/20 px-1 py-0.5 font-medium">
                              {booking.cashOnTour.trim() || ''}
                            </td>
                            <td className="border border-teal-900/20 px-1 py-0.5 text-right tabular-nums font-semibold">
                              {formatCollectTotal(
                                booking.parkFee,
                                program,
                                booking.adults,
                                booking.children,
                                booking.cashOnTour,
                              )}
                            </td>
                            <td className="border border-teal-900/20 px-1 py-0.5">
                              {booking.note || ''}
                            </td>
                            <td className="border border-teal-900/20 px-1 py-0.5 text-center" />
                            <td className="border border-teal-900/20 px-1 py-0.5 text-center font-semibold">
                              {getAttendance?.(booking.code) === 'checked'
                                ? '✓'
                                : getAttendance?.(booking.code) === 'no-show'
                                  ? 'NS'
                                  : '□'}
                            </td>
                          </>
                        ) : (
                          <td className="border border-teal-900/20 px-1 py-0.5 text-center tabular-nums font-semibold">
                            {totalPassengers(booking)}
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="bg-teal-50/80 font-semibold">
                      <td className="border border-teal-900/20 px-1 py-1" colSpan={leadingColSpan}>
                        Group total
                      </td>
                      <td className="border border-teal-900/20 px-1 py-1 text-center tabular-nums">
                        {group.totals.adults}
                      </td>
                      <td className="border border-teal-900/20 px-1 py-1 text-center tabular-nums">
                        {group.totals.children}
                      </td>
                      <td className="border border-teal-900/20 px-1 py-1 text-center tabular-nums">
                        {group.totals.infants}
                      </td>
                      <td className="border border-teal-900/20 px-1 py-1 text-center tabular-nums">
                        {group.totals.tourLeaders}
                      </td>
                      {isCheckIn ? (
                        <>
                          <td
                            className="border border-teal-900/20 px-1 py-1"
                            colSpan={trailingBeforeTotal}
                          />
                          <td className="border border-teal-900/20 px-1 py-1 text-right tabular-nums">
                            {group.totals.collect > 0
                              ? group.totals.collect.toLocaleString('en-US')
                              : ''}
                          </td>
                          <td
                            className="border border-teal-900/20 px-1 py-1"
                            colSpan={trailingAfterTotal}
                          />
                        </>
                      ) : (
                        <td className="border border-teal-900/20 px-1 py-1 text-center tabular-nums">
                          {group.totals.pax}
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          })}

          <div className="job-order-print-footer">
            <table className="mt-2 w-full border-collapse text-[9px]">
              <tbody>
                <tr className="bg-teal-50 font-semibold text-teal-950">
                  <td className="border border-teal-900/20 px-2 py-1" colSpan={2}>
                    Day total
                  </td>
                  <td className="border border-teal-900/20 px-2 py-1 text-center tabular-nums">
                    AD {totals.adults}
                  </td>
                  <td className="border border-teal-900/20 px-2 py-1 text-center tabular-nums">
                    CHD {totals.children}
                  </td>
                  <td className="border border-teal-900/20 px-2 py-1 text-center tabular-nums">
                    INF {totals.infants}
                  </td>
                  <td className="border border-teal-900/20 px-2 py-1 text-center tabular-nums">
                    TL {totals.tourLeaders}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="mt-3 border border-teal-900/20">
              <p className="border-b border-teal-900/20 bg-teal-50 px-2 py-1 text-[10px] font-semibold">
                Notes
              </p>
              <div className="min-h-[3.5rem] px-2 py-1 text-[10px] text-neutral-500">
                {groups
                  .flatMap((group) => group.rows)
                  .filter(({ booking }) => booking.note.trim())
                  .map(({ booking }) => (
                    <p key={booking.code}>
                      {booking.leadGuest}: {booking.note}
                    </p>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function DailyJobOrderModeCard({
  onClick,
  title = 'Driver Job Order',
  subtitle = 'Ops day sheet grouped by van with driver details.',
  meta = 'For operations',
}: {
  onClick: () => void
  title?: string
  subtitle?: string
  meta?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="gday-sheet rounded-[1.4rem] p-6 text-left transition-all hover:border-teal-700/25 hover:bg-white active:scale-[0.99] sm:p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-700 text-white shadow-sm shadow-teal-700/20">
          <ClipboardList className="size-7" />
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

function buildAgentGroups(vanGroups: VanGroup[]): AgentGroup[] {
  const vanInfoByCode = new Map<
    string,
    { label: string; driver: string; plate: string; phone: string }
  >()
  for (const group of vanGroups) {
    const label =
      group.van !== null
        ? `Van ${group.van}`
        : group.id === 'no-transfer'
          ? 'No transfer'
          : '—'
    const crew = displayVanCrew(group)
    for (const row of group.rows) {
      vanInfoByCode.set(row.booking.code, {
        label,
        driver: crew.driver,
        plate: crew.plate,
        phone: crew.phone,
      })
    }
  }

  const byAgent = new Map<string, { name: string; bookings: Booking[] }>()
  for (const group of vanGroups) {
    for (const { booking } of group.rows) {
      const key = booking.agentSlug || booking.agentName
      const existing = byAgent.get(key)
      if (existing) existing.bookings.push(booking)
      else byAgent.set(key, { name: booking.agentName, bookings: [booking] })
    }
  }

  return [...byAgent.entries()]
    .sort((a, b) => a[1].name.localeCompare(b[1].name) || a[0].localeCompare(b[0]))
    .map(([slug, { name, bookings }]) => {
      const sorted = bookings.slice().sort((a, b) => {
        const vanA = vanInfoByCode.get(a.code)?.label ?? ''
        const vanB = vanInfoByCode.get(b.code)?.label ?? ''
        const byVan = vanA.localeCompare(vanB)
        if (byVan !== 0) return byVan
        return compareJobOrder(a, b, 'asc')
      })
      return {
        id: slug,
        agentSlug: slug,
        agentName: name,
        rows: sorted.map((booking, index) => {
          const info = vanInfoByCode.get(booking.code)
          return {
            no: index + 1,
            booking,
            vanLabel: info?.label ?? '—',
            driver: info?.driver ?? '—',
            plate: info?.plate ?? '—',
            phone: info?.phone ?? '—',
            cashOnTour: booking.cashOnTour?.trim() ?? '',
          }
        }),
        totals: {
          adults: sorted.reduce((sum, b) => sum + b.adults, 0),
          children: sorted.reduce((sum, b) => sum + b.children, 0),
          infants: sorted.reduce((sum, b) => sum + b.infants, 0),
          tourLeaders: sorted.reduce((sum, b) => sum + b.tourLeaders, 0),
          pax: sorted.reduce((sum, b) => sum + totalPassengers(b), 0),
          collect: sorted.reduce(
            (sum, b) =>
              sum + collectTotal(b.parkFee, b.program, b.adults, b.children, b.cashOnTour),
            0,
          ),
        },
      }
    })
}

function buildVanGroups(
  bookings: Booking[],
  plan: DayVehiclePlan,
  pickupSortDir: PickupSortDir = 'asc',
  resolveMeta: (
    van: number,
    dayMeta?: VanMeta | null,
  ) => VanMeta & { fromFleet: boolean; incomplete: boolean },
) {
  const transferBookings = bookings.filter((booking) => !isNoTransfer(booking.pickupZone))
  const noTransferBookings = bookings.filter((booking) => isNoTransfer(booking.pickupZone))
  const byPickup = (a: Booking, b: Booking) => compareJobOrder(a, b, pickupSortDir)

  const assignedCount = transferBookings.filter(
    (booking) => (plan.assignments[booking.code]?.length ?? 0) > 0,
  ).length

  let assignments = plan.assignments
  let usingMockAssignments = false

  if (transferBookings.length > 0 && assignedCount === 0) {
    assignments = autoAssignVans(transferBookings, plan.vanCapacity || DEFAULT_VAN_CAPACITY)
    usingMockAssignments = true
  }

  const vanNumbers = listVanNumbers(assignments)
  const groups: VanGroup[] = []

  for (const van of vanNumbers) {
    const vanBookings = transferBookings
      .filter((booking) => primaryVan(assignments[booking.code]) === van)
      .sort((a, b) => {
        const orderA = sortOrderOnVan(assignments[a.code], van)
        const orderB = sortOrderOnVan(assignments[b.code], van)
        if (orderA !== orderB) return orderA - orderB
        return byPickup(a, b)
      })
    if (vanBookings.length === 0) continue

    const meta = resolveMeta(van, plan.vanMeta[String(van)])
    groups.push(
      makeGroup(
        `van-${van}`,
        van,
        meta.driver,
        meta.plate,
        meta.phone,
        meta.incomplete,
        vanBookings,
      ),
    )
  }

  const leftover = transferBookings.filter((booking) => !primaryVan(assignments[booking.code]))
  if (leftover.length > 0) {
    const mockVanStart = (vanNumbers[vanNumbers.length - 1] ?? 0) + 1
    const mockAssign = autoAssignVans(leftover, plan.vanCapacity || DEFAULT_VAN_CAPACITY)
    const mockVans = listVanNumbers(mockAssign)
    if (mockVans.length === 0) {
      groups.push(makeGroup('unassigned', null, '', '', '', false, leftover.slice().sort(byPickup)))
    } else {
      usingMockAssignments = true
      for (const van of mockVans) {
        const displayVan = mockVanStart + van - 1
        const vanBookings = leftover
          .filter((booking) => primaryVan(mockAssign[booking.code]) === van)
          .sort((a, b) => {
            const orderA = sortOrderOnVan(mockAssign[a.code], van)
            const orderB = sortOrderOnVan(mockAssign[b.code], van)
            if (orderA !== orderB) return orderA - orderB
            return byPickup(a, b)
          })
        if (vanBookings.length === 0) continue
        const meta = resolveMeta(displayVan, undefined)
        groups.push(
          makeGroup(
            `mock-van-${displayVan}`,
            displayVan,
            meta.driver,
            meta.plate,
            meta.phone,
            meta.incomplete,
            vanBookings,
          ),
        )
      }
      const stillLeft = leftover.filter((booking) => !primaryVan(mockAssign[booking.code]))
      if (stillLeft.length > 0) {
        groups.push(
          makeGroup(
            'unassigned-oversize',
            null,
            '',
            '',
            '',
            false,
            stillLeft.slice().sort(byPickup),
          ),
        )
      }
    }
  }

  if (noTransferBookings.length > 0) {
    groups.push(
      makeGroup(
        'no-transfer',
        null,
        '',
        '',
        '',
        false,
        noTransferBookings.slice().sort(byPickup),
      ),
    )
  }

  return { groups, usingMockAssignments }
}

function makeGroup(
  id: string,
  van: number | null,
  driver: string,
  plate: string,
  phone: string,
  mockMeta: boolean,
  bookings: Booking[],
): VanGroup {
  const rows = bookings.map((booking, index) => ({ no: index + 1, booking }))
  return {
    id,
    van,
    driver,
    plate,
    phone,
    mockMeta,
    rows,
    totals: {
      adults: bookings.reduce((sum, b) => sum + b.adults, 0),
      children: bookings.reduce((sum, b) => sum + b.children, 0),
      infants: bookings.reduce((sum, b) => sum + b.infants, 0),
      tourLeaders: bookings.reduce((sum, b) => sum + b.tourLeaders, 0),
      pax: bookings.reduce((sum, b) => sum + totalPassengers(b), 0),
      collect: bookings.reduce(
        (sum, b) =>
          sum + collectTotal(b.parkFee, b.program, b.adults, b.children, b.cashOnTour),
        0,
      ),
    },
  }
}

function blankIfZero(value: number) {
  return value > 0 ? value : ''
}

function jobOrderNumber(
  date: string,
  program: Program,
  kind: 'ops' | 'agent' | 'check-in' = 'ops',
) {
  const compact = date.replaceAll('-', '').slice(2)
  const suffix = program === 'PP' ? 'PP' : 'JB'
  const prefix = kind === 'agent' ? 'AJO' : kind === 'check-in' ? 'CIR' : 'JO'
  return `${prefix}-${compact}-${suffix}`
}

function formatPickupTime(time: string) {
  const trimmed = time.trim()
  if (!trimmed) return '—'
  if (trimmed.toLowerCase().includes('awaiting')) return 'Awaiting'
  if (trimmed.toLowerCase() === 'no transfer') return '—'
  return trimmed
}

function pickupSortValue(time: string) {
  const trimmed = time.trim()
  if (/^\d{1,2}:\d{2}/.test(trimmed)) return trimmed.padStart(5, '0')
  return `~${trimmed}`
}

function compareJobOrder(a: Booking, b: Booking, dir: PickupSortDir = 'asc') {
  const byTime = pickupSortValue(a.pickupTime).localeCompare(pickupSortValue(b.pickupTime))
  if (byTime !== 0) return dir === 'asc' ? byTime : -byTime
  const byHotel = a.pickupHotel.localeCompare(b.pickupHotel)
  if (byHotel !== 0) return byHotel
  return a.code.localeCompare(b.code)
}
