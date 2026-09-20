'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, CalendarIcon, ClipboardList, Pencil, Printer, Ship } from 'lucide-react'
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
import { formatLongDate, formatShortDate, todayISO, toISODate } from '@/lib/format'
import {
  DEFAULT_VAN_CAPACITY,
  isActiveBooking,
  isNoTransfer,
  totalPassengers,
  type Booking,
  type DayVehiclePlan,
  type Program,
  type VanMeta,
} from '@/lib/types'
import { autoAssignVans, listVanNumbers, primaryVan } from '@/lib/vehicle-assign'
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
  totals: { adults: number; children: number; infants: number; tourLeaders: number; pax: number }
}

type PickupSortDir = 'asc' | 'desc'
type JobAudience = 'ops' | 'agent'

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
  totals: { adults: number; children: number; infants: number; tourLeaders: number; pax: number }
}

const MOCK_VAN_CREW = [
  { driver: 'Somchai Jaidee', plate: 'กข 1234 Phuket', phone: '081-234-5678' },
  { driver: 'Nattapong Srisuk', plate: 'ขค 5678 Phuket', phone: '089-111-2233' },
  { driver: 'Wichai Thongdi', plate: 'งจ 9012 Phuket', phone: '086-555-7788' },
  { driver: 'Anan Chaiyaphum', plate: 'ฉช 3456 Phuket', phone: '082-999-0011' },
  { driver: 'Preecha Boonmee', plate: 'ฐฑ 7890 Phuket', phone: '088-444-5566' },
] as const

const MOCK_CASH_SAMPLES = ['1,500 THB', '2,000 THB', '900 THB', '3,200 THB', '1,800 THB'] as const

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

function displayCashOnTour(booking: Booking, index: number) {
  const real = booking.cashOnTour?.trim() ?? ''
  if (real) return real
  // Preview mock so empty COT cells are visible while testing.
  if (index % 3 === 0) return MOCK_CASH_SAMPLES[index % MOCK_CASH_SAMPLES.length]
  return ''
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
  const { bookings, getDayVehiclePlan, resolveVanMeta } = usePortal()
  const [selectedDate, setSelectedDate] = useState(() => todayISO())
  const [program, setProgram] = useState<Program | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [pickupSortDir, setPickupSortDir] = useState<PickupSortDir>('asc')
  const [editVan, setEditVan] = useState<number | null>(null)
  const [agentFilter, setAgentFilter] = useState<string>('all')

  const selectedDateObj = new Date(`${selectedDate}T12:00:00`)
  const isAgentView = audience === 'agent'

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

  const jobNumber = program ? jobOrderNumber(selectedDate, program, isAgentView) : ''
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
    const kind = isAgentView ? 'AgentJO' : 'JobOrder'
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
    <div className="mx-auto max-w-7xl">
      <div className="print:hidden">
        <div className="mb-4">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            Report
          </Button>
        </div>

        <PageHeader
          title={isAgentView ? 'Agent Job Order' : 'OP Job Order'}
          description={
            isAgentView
              ? 'Grouped by agency with van number for each pickup — filter one agent, then print to send.'
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
                        setSelectedDate(todayISO())
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
                    ? 'No van plan yet — showing mock van groups & drivers for preview.'
                    : 'Grouped from Arrange vehicles. Missing driver/plate uses mock details.'}
                </p>
              </div>
            </Surface>

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

              {bookingCount === 0 ? (
                <EmptyState>No active bookings for this program on this date.</EmptyState>
              ) : (
                <div className="divide-y divide-teal-900/8">
                  {groups.map((group) => (
                    <VanGroupSection
                      key={group.id}
                      group={group}
                      pickupSortDir={pickupSortDir}
                      onTogglePickupSort={() =>
                        setPickupSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
                      }
                      onEditVan={setEditVan}
                    />
                  ))}
                </div>
              )}
            </Surface>

            <EditVanDetailsDialog
              open={editVan !== null}
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
                  <AgentGroupSection key={group.id} group={group} />
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
            margin: 8mm;
          }
          html, body {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .job-order-print-sheet {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: 0 !important;
            overflow: visible !important;
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
          .job-order-van-card {
            break-inside: avoid;
            page-break-inside: avoid;
            -webkit-column-break-inside: avoid;
          }
          .job-order-van-card--tall {
            break-inside: auto;
            page-break-inside: auto;
          }
          .job-order-van-card--tall tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .job-order-agent-card {
            break-before: page;
            page-break-before: always;
          }
          .job-order-agent-card:first-child {
            break-before: auto;
            page-break-before: auto;
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

function VanGroupSection({
  group,
  pickupSortDir,
  onTogglePickupSort,
  onEditVan,
}: {
  group: VanGroup
  pickupSortDir: PickupSortDir
  onTogglePickupSort: () => void
  onEditVan: (van: number) => void
}) {
  const title = group.van === null ? 'No Transfer / Unassigned' : `Van ${group.van}`
  const SortIcon = pickupSortDir === 'asc' ? ArrowUp : ArrowDown

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
            {group.van !== null ? (
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

      <div className="overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="border-b border-teal-900/15 bg-teal-950/[0.04] hover:bg-teal-950/[0.04]">
              <TableHead className="w-10 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                No.
              </TableHead>
              <TableHead className="w-[12rem] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Guest name
              </TableHead>
              <TableHead className="w-11 px-1 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                AD
              </TableHead>
              <TableHead className="w-11 px-1 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                CHD
              </TableHead>
              <TableHead className="w-11 px-1 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                INF
              </TableHead>
              <TableHead className="w-11 px-1 text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                TL
              </TableHead>
              <TableHead className="w-[5.5rem] px-1 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
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
              <TableHead className="w-[12rem] pr-1 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Hotel
              </TableHead>
              <TableHead className="w-16 pl-1 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Room
              </TableHead>
              <TableHead className="w-[7rem] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Cash on tour
              </TableHead>
              <TableHead className="text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Remark
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.rows.map(({ no, booking }) => (
              <TableRow key={`${group.van ?? 'none'}-${booking.code}`}>
                <TableCell className="tabular-nums text-teal-900/55">{no}</TableCell>
                <TableCell>
                  <div className="truncate font-medium" title={booking.leadGuest}>
                    {booking.leadGuest}
                  </div>
                </TableCell>
                <TableCell className="px-1 text-center tabular-nums">{booking.adults || ''}</TableCell>
                <TableCell className="px-1 text-center tabular-nums">{booking.children || ''}</TableCell>
                <TableCell className="px-1 text-center tabular-nums">{booking.infants || ''}</TableCell>
                <TableCell className="px-1 text-center tabular-nums">
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
                <TableCell className="pl-1 whitespace-nowrap tabular-nums">
                  {booking.roomNumber || ''}
                </TableCell>
                <TableCell>
                  <div className="truncate font-medium text-teal-950" title={booking.cashOnTour}>
                    {booking.cashOnTour || ''}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="truncate text-teal-900/60" title={booking.note}>
                    {booking.note || ''}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-teal-50/40 hover:bg-teal-50/40">
              <TableCell colSpan={2} className="text-xs font-semibold text-teal-900/70">
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
              <TableCell colSpan={5} />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function AgentGroupSection({ group }: { group: AgentGroup }) {
  const detailSpans = detailRowSpans(group.rows)

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
              <TableHead className="w-9 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                No.
              </TableHead>
              <TableHead className="w-[8.5rem] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Guest name
              </TableHead>
              <TableHead className="w-[6.5rem] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Voucher no.
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
              <TableHead className="w-[5rem] px-1 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Zone
              </TableHead>
              <TableHead className="w-[4rem] px-1 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                P/U Time
              </TableHead>
              <TableHead className="w-[9rem] pr-1 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Hotel
              </TableHead>
              <TableHead className="w-11 pl-1 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Room
              </TableHead>
              <TableHead className="w-[7rem] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                COT
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
                    <div className="truncate font-medium" title={booking.leadGuest}>
                      {booking.leadGuest}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="truncate tabular-nums text-teal-950" title={booking.agentRef || undefined}>
                      {booking.agentRef?.trim() || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="px-0.5 text-center tabular-nums">{booking.adults || ''}</TableCell>
                  <TableCell className="px-0.5 text-center tabular-nums">{booking.children || ''}</TableCell>
                  <TableCell className="px-0.5 text-center tabular-nums">{booking.infants || ''}</TableCell>
                  <TableCell className="px-0.5 text-center tabular-nums">
                    {booking.tourLeaders || ''}
                  </TableCell>
                  <TableCell className="px-1 whitespace-nowrap text-teal-950">
                    {booking.pickupZone}
                  </TableCell>
                  <TableCell className="px-1 whitespace-nowrap tabular-nums text-teal-950">
                    {formatPickupTime(booking.pickupTime)}
                  </TableCell>
                  <TableCell className="pr-1">
                    <div className="truncate" title={booking.pickupHotel}>
                      {booking.pickupHotel || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="pl-1 whitespace-nowrap tabular-nums">
                    {booking.roomNumber || ''}
                  </TableCell>
                  <TableCell>
                    <div className="truncate font-medium text-teal-950" title={cashOnTour}>
                      {cashOnTour || ''}
                    </div>
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
              <TableCell colSpan={6} />
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
  return (
    <div className="job-order-print-sheet hidden print:block">
      {groups.length === 0 ? (
        <p className="text-sm text-neutral-500">No bookings to print.</p>
      ) : (
        groups.map((group) => {
          const detailSpans = detailRowSpans(group.rows)
          return (
          <div key={group.id} className="job-order-agent-card mb-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border border-neutral-400 bg-neutral-100 px-2 py-1.5 text-[10px]">
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  Agent Job Order · {program === 'PP' ? 'PP' : 'JB'} · {group.agentName}
                </p>
                <p className="mt-0.5 text-neutral-600">
                  {formatLongDate(date)} · {programLabel} · Job {jobNumber}
                  {usingMockAssignments ? ' · preview vans' : ''}
                </p>
              </div>
              <p className="font-semibold tabular-nums text-neutral-700">
                {group.rows.length} bookings · {group.totals.pax} pax
              </p>
            </div>

            <table className="w-full border-collapse text-[9px]">
              <thead>
                <tr className="bg-neutral-100">
                  <th className="w-7 border border-neutral-400 px-1 py-1 font-semibold">NO.</th>
                  <th className="border border-neutral-400 px-1 py-1 font-semibold">GUEST</th>
                  <th className="w-16 border border-neutral-400 px-1 py-1 font-semibold">
                    VOUCHER
                  </th>
                  <th className="w-7 border border-neutral-400 px-0.5 py-1 text-center font-semibold">
                    AD
                  </th>
                  <th className="w-7 border border-neutral-400 px-0.5 py-1 text-center font-semibold">
                    CHD
                  </th>
                  <th className="w-7 border border-neutral-400 px-0.5 py-1 text-center font-semibold">
                    INF
                  </th>
                  <th className="w-7 border border-neutral-400 px-0.5 py-1 text-center font-semibold">
                    TL
                  </th>
                  <th className="w-14 border border-neutral-400 px-0.5 py-1 font-semibold">ZONE</th>
                  <th className="w-12 border border-neutral-400 px-0.5 py-1 font-semibold">
                    P/U TIME
                  </th>
                  <th className="border border-neutral-400 px-1 py-1 font-semibold">HOTEL</th>
                  <th className="w-10 border border-neutral-400 px-0.5 py-1 font-semibold">ROOM</th>
                  <th className="w-14 border border-neutral-400 px-1 py-1 font-semibold">COT</th>
                  <th className="border border-neutral-400 px-1 py-1 font-semibold">DETAIL</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map(({ no, booking, vanLabel, driver, plate, phone, cashOnTour }, index) => {
                  const span = detailSpans[index]
                  return (
                  <tr key={`${group.agentSlug}-${booking.code}`}>
                    <td className="border border-neutral-400 px-1 py-0.5 text-center tabular-nums">
                      {no}
                    </td>
                    <td className="border border-neutral-400 px-1 py-0.5">{booking.leadGuest}</td>
                    <td className="border border-neutral-400 px-1 py-0.5 tabular-nums">
                      {booking.agentRef?.trim() || '—'}
                    </td>
                    <td className="border border-neutral-400 px-1 py-0.5 text-center tabular-nums">
                      {blankIfZero(booking.adults)}
                    </td>
                    <td className="border border-neutral-400 px-1 py-0.5 text-center tabular-nums">
                      {blankIfZero(booking.children)}
                    </td>
                    <td className="border border-neutral-400 px-1 py-0.5 text-center tabular-nums">
                      {blankIfZero(booking.infants)}
                    </td>
                    <td className="border border-neutral-400 px-1 py-0.5 text-center tabular-nums">
                      {blankIfZero(booking.tourLeaders)}
                    </td>
                    <td className="border border-neutral-400 px-1 py-0.5">{booking.pickupZone}</td>
                    <td className="border border-neutral-400 px-1 py-0.5 tabular-nums">
                      {formatPickupTime(booking.pickupTime)}
                    </td>
                    <td className="border border-neutral-400 px-1 py-0.5">{booking.pickupHotel}</td>
                    <td className="border border-neutral-400 px-1 py-0.5">{booking.roomNumber}</td>
                    <td className="border border-neutral-400 px-1 py-0.5 font-medium">{cashOnTour}</td>
                    {span > 0 ? (
                      <td
                        rowSpan={span}
                        className="border border-neutral-400 px-1 py-0.5 align-middle"
                      >
                        {vanLabel.startsWith('Van')
                          ? `${driver} · ${plate} · ${phone}`
                          : '—'}
                      </td>
                    ) : null}
                  </tr>
                  )
                })}
                <tr className="bg-neutral-50 font-semibold">
                  <td className="border border-neutral-400 px-1 py-1" colSpan={3}>
                    AGENT TOTAL
                  </td>
                  <td className="border border-neutral-400 px-1 py-1 text-center tabular-nums">
                    {group.totals.adults}
                  </td>
                  <td className="border border-neutral-400 px-1 py-1 text-center tabular-nums">
                    {group.totals.children}
                  </td>
                  <td className="border border-neutral-400 px-1 py-1 text-center tabular-nums">
                    {group.totals.infants}
                  </td>
                  <td className="border border-neutral-400 px-1 py-1 text-center tabular-nums">
                    {group.totals.tourLeaders}
                  </td>
                  <td className="border border-neutral-400 px-1 py-1" colSpan={6} />
                </tr>
              </tbody>
            </table>
          </div>
          )
        })
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
}: {
  date: string
  program: Program
  programLabel: string
  jobNumber: string
  groups: VanGroup[]
  totals: { adults: number; children: number; infants: number; tourLeaders: number }
  usingMockAssignments: boolean
}) {
  return (
    <div className="job-order-print-sheet hidden print:block">
      <div className="mb-2 flex items-start justify-between gap-4 border-b-2 border-neutral-900 pb-2">
        <div>
          <p className="text-base font-bold tracking-wide text-neutral-900">G&apos;DAY TOURS PHUKET</p>
          <p className="mt-0.5 text-sm font-semibold text-neutral-800">
            Daily Job Order · {program === 'PP' ? 'PP' : 'JB'}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-600">
            {programLabel}
            {usingMockAssignments ? ' · mock van groups' : ''}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-neutral-800">
          <p>
            <span className="font-semibold">Date:</span> {formatLongDate(date)}
          </p>
          <p>
            <span className="font-semibold">Job No:</span> {jobNumber}
          </p>
          <p>
            <span className="font-semibold">Prepared by:</span> ______________
          </p>
          <p>
            <span className="font-semibold">Checked by:</span> ______________
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
                className={cn('job-order-van-card mb-3', tall && 'job-order-van-card--tall')}
              >
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 border border-neutral-400 bg-neutral-100 px-2 py-1 text-[10px]">
                  <p className="font-semibold text-neutral-900">
                    {group.van === null ? 'NO TRANSFER / UNASSIGNED' : `VAN ${group.van}`}
                    {group.van !== null ? (
                      <span className="ml-2 font-normal text-neutral-700">
                        Driver: {group.driver || '—'}
                        {group.phone ? ` · Tel: ${group.phone}` : ''}
                        {' · '}
                        Plate: {group.plate || '—'}
                        {group.mockMeta ? ' (needs details)' : ''}
                      </span>
                    ) : null}
                  </p>
                  <p className="tabular-nums text-neutral-600">
                    {group.rows.length} bk · {group.totals.pax} pax
                  </p>
                </div>
                <table className="w-full table-fixed border-collapse text-left text-[9px] leading-tight">
                  <thead>
                    <tr className="bg-neutral-50">
                      <th className="w-8 border border-neutral-400 px-1 py-1 font-semibold">NO.</th>
                      <th className="w-[18%] border border-neutral-400 px-1 py-1 font-semibold">
                        GUEST NAME
                      </th>
                      <th className="w-8 border border-neutral-400 px-0.5 py-1 text-center font-semibold">
                        AD
                      </th>
                      <th className="w-8 border border-neutral-400 px-0.5 py-1 text-center font-semibold">
                        CHD
                      </th>
                      <th className="w-8 border border-neutral-400 px-0.5 py-1 text-center font-semibold">
                        INF
                      </th>
                      <th className="w-8 border border-neutral-400 px-0.5 py-1 text-center font-semibold">
                        TL
                      </th>
                      <th className="w-12 border border-neutral-400 px-0.5 py-1 font-semibold">
                        P/U TIME
                      </th>
                      <th className="w-[20%] border border-neutral-400 px-1 py-1 pr-0.5 font-semibold">
                        HOTEL
                      </th>
                      <th className="w-12 border border-neutral-400 px-0.5 py-1 pl-0.5 font-semibold">
                        ROOM
                      </th>
                      <th className="w-16 border border-neutral-400 px-1 py-1 font-semibold">
                        CASH ON TOUR
                      </th>
                      <th className="border border-neutral-400 px-1 py-1 font-semibold">REMARK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map(({ no, booking }) => (
                      <tr key={`${group.van ?? 'none'}-${booking.code}`}>
                        <td className="border border-neutral-400 px-1 py-0.5 text-center tabular-nums">
                          {no}
                        </td>
                        <td className="border border-neutral-400 px-1 py-0.5">{booking.leadGuest}</td>
                        <td className="border border-neutral-400 px-1 py-0.5 text-center tabular-nums">
                          {blankIfZero(booking.adults)}
                        </td>
                        <td className="border border-neutral-400 px-1 py-0.5 text-center tabular-nums">
                          {blankIfZero(booking.children)}
                        </td>
                        <td className="border border-neutral-400 px-1 py-0.5 text-center tabular-nums">
                          {blankIfZero(booking.infants)}
                        </td>
                        <td className="border border-neutral-400 px-1 py-0.5 text-center tabular-nums">
                          {blankIfZero(booking.tourLeaders)}
                        </td>
                        <td className="border border-neutral-400 px-1 py-0.5 tabular-nums">
                          {formatPickupTime(booking.pickupTime)}
                        </td>
                        <td className="border border-neutral-400 px-1 py-0.5">{booking.pickupHotel}</td>
                        <td className="border border-neutral-400 px-1 py-0.5">{booking.roomNumber}</td>
                        <td className="border border-neutral-400 px-1 py-0.5 font-medium">
                          {booking.cashOnTour}
                        </td>
                        <td className="border border-neutral-400 px-1 py-0.5">{booking.note}</td>
                      </tr>
                    ))}
                    <tr className="bg-neutral-50 font-semibold">
                      <td className="border border-neutral-400 px-1 py-1" colSpan={2}>
                        GROUP TOTAL
                      </td>
                      <td className="border border-neutral-400 px-1 py-1 text-center tabular-nums">
                        {group.totals.adults}
                      </td>
                      <td className="border border-neutral-400 px-1 py-1 text-center tabular-nums">
                        {group.totals.children}
                      </td>
                      <td className="border border-neutral-400 px-1 py-1 text-center tabular-nums">
                        {group.totals.infants}
                      </td>
                      <td className="border border-neutral-400 px-1 py-1 text-center tabular-nums">
                        {group.totals.tourLeaders}
                      </td>
                      <td className="border border-neutral-400 px-1 py-1" colSpan={5} />
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          })}

          <div className="job-order-print-footer">
            <table className="mt-2 w-full border-collapse text-[9px]">
              <tbody>
                <tr className="bg-neutral-100 font-semibold">
                  <td className="border border-neutral-400 px-2 py-1" colSpan={2}>
                    DAY TOTAL
                  </td>
                  <td className="border border-neutral-400 px-2 py-1 text-center tabular-nums">
                    AD {totals.adults}
                  </td>
                  <td className="border border-neutral-400 px-2 py-1 text-center tabular-nums">
                    CHD {totals.children}
                  </td>
                  <td className="border border-neutral-400 px-2 py-1 text-center tabular-nums">
                    INF {totals.infants}
                  </td>
                  <td className="border border-neutral-400 px-2 py-1 text-center tabular-nums">
                    TL {totals.tourLeaders}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="mt-3 border border-neutral-400">
              <p className="border-b border-neutral-400 bg-neutral-100 px-2 py-1 text-[10px] font-semibold">
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
  title = 'OP Job Order',
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
            cashOnTour: displayCashOnTour(booking, index),
          }
        }),
        totals: {
          adults: sorted.reduce((sum, b) => sum + b.adults, 0),
          children: sorted.reduce((sum, b) => sum + b.children, 0),
          infants: sorted.reduce((sum, b) => sum + b.infants, 0),
          tourLeaders: sorted.reduce((sum, b) => sum + b.tourLeaders, 0),
          pax: sorted.reduce((sum, b) => sum + totalPassengers(b), 0),
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
      .sort(byPickup)
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
          .sort(byPickup)
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
    },
  }
}

function blankIfZero(value: number) {
  return value > 0 ? value : ''
}

function jobOrderNumber(date: string, program: Program, agentView = false) {
  const compact = date.replaceAll('-', '').slice(2)
  const suffix = program === 'PP' ? 'PP' : 'JB'
  const prefix = agentView ? 'AJO' : 'JO'
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
