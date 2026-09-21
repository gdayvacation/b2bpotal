'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  CalendarIcon,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  QrCode,
  Users,
} from 'lucide-react'
import { BoatFleetBadge } from '@/components/boat-badge'
import { AdminCheckInBookingPanel } from '@/components/admin/admin-check-in-booking-panel'
import { usePortal } from '@/components/portal-provider'
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
import {
  enrolledSeatCount,
  guestDisplayName,
  type CheckInEnrollment,
} from '@/lib/check-in-enrollment'
import { checkInPaymentSeatKey } from '@/lib/check-in-payment'
import {
  collectTotal,
  formatIncludeShort,
  formatLongDate,
  formatShortDate,
  parseCashOnTourAmount,
  toISODate,
} from '@/lib/format'
import { usePortalDefaultDateISO } from '@/lib/use-portal-today'
import {
  listVanNumbers,
  primaryVan,
  sortOrderOnVan,
} from '@/lib/vehicle-assign'
import { cn } from '@/lib/utils'
import {
  isActiveBooking,
  isNoTransfer,
  totalPassengers,
  type Booking,
  type Program,
} from '@/lib/types'

type AdminTab = 'qr' | 'today'

type GuestLineStatus = 'checked' | 'waiting' | 'no-show'

type GuestLine = {
  key: string
  booking: Booking
  slot: number
  seatsTotal: number
  checkedInCount: number
  guestName: string
  leaderName: string
  nationality: string
  birthday: string
  passportNumber: string
  checkedInAt: string
  status: GuestLineStatus
  isFirstOfBooking: boolean
  boat: number | null
}

type DriverGroup = {
  id: string
  program: Program
  van: number | null
  driver: string
  plate: string
  phone: string
  lines: GuestLine[]
  checked: number
  waiting: number
  noShow: number
}

function programLabel(program: Program) {
  return program === 'PP' ? 'Phi Phi' : 'James Bond'
}

function expandGuestLines(
  booking: Booking,
  enrollments: CheckInEnrollment[],
  attendance: 'checked' | 'no-show' | null,
  boat: number | null,
): GuestLine[] {
  const seats = Math.max(1, totalPassengers(booking))
  const filled: Array<{
    guestName: string
    nationality: string
    birthday: string
    passportNumber: string
    checkedInAt: string
  }> = []

  for (const enrollment of enrollments) {
    const name = guestDisplayName(enrollment)
    for (let i = 0; i < enrollment.seats; i += 1) {
      filled.push({
        guestName: i === 0 ? name : name ? `${name} (party)` : '',
        nationality: enrollment.nationality,
        birthday: enrollment.birthday,
        passportNumber: enrollment.passportNumber,
        checkedInAt: enrollment.checkedInAt,
      })
    }
  }

  const enrolled = enrolledSeatCount(enrollments)
  const fullyChecked = attendance === 'checked' || enrolled >= seats

  return Array.from({ length: seats }, (_, slot) => {
    const filledRow = filled[slot]
    const base = {
      key: `${booking.code}-${slot}`,
      booking,
      slot,
      seatsTotal: seats,
      checkedInCount: Math.min(enrolled, seats),
      leaderName: booking.leadGuest,
      isFirstOfBooking: slot === 0,
      boat,
    }

    if (attendance === 'no-show') {
      return {
        ...base,
        guestName: filledRow?.guestName || (slot === 0 ? booking.leadGuest : ''),
        nationality: filledRow?.nationality || '',
        birthday: filledRow?.birthday || '',
        passportNumber: filledRow?.passportNumber || '',
        checkedInAt: filledRow?.checkedInAt || '',
        status: 'no-show' as const,
      }
    }
    if (filledRow) {
      return {
        ...base,
        guestName: filledRow.guestName,
        nationality: filledRow.nationality,
        birthday: filledRow.birthday,
        passportNumber: filledRow.passportNumber,
        checkedInAt: filledRow.checkedInAt,
        status: 'checked' as const,
      }
    }
    return {
      ...base,
      guestName: '',
      nationality: '',
      birthday: '',
      passportNumber: '',
      checkedInAt: '',
      status: fullyChecked ? ('checked' as const) : ('waiting' as const),
    }
  })
}

function bookingPayment(booking: Booking) {
  const amount = collectTotal(
    booking.parkFee,
    booking.program,
    booking.adults,
    booking.children,
    booking.cashOnTour,
  )
  const cashNote = booking.cashOnTour.trim()
  const hasCashText = Boolean(cashNote) && parseCashOnTourAmount(cashNote) === 0
  if (amount > 0) {
    return { kind: 'due' as const, label: `${amount.toLocaleString('en-US')} THB` }
  }
  if (hasCashText) {
    return { kind: 'note' as const, label: cashNote }
  }
  return { kind: 'none' as const, label: '—' }
}

function formatCheckInTime(iso: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  })
}

export function AdminCheckIn() {
  const [boardDate, setBoardDate, portalToday] = usePortalDefaultDateISO()
  const [tab, setTab] = useState<AdminTab>('today')
  const [programFilter, setProgramFilter] = useState<'all' | Program>('all')
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const checkInUrl = origin ? `${origin}/check-in` : '/check-in'
  const qrSrc = origin
    ? `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=16&data=${encodeURIComponent(checkInUrl)}`
    : ''
  const qrDownloadSrc = origin
    ? `https://api.qrserver.com/v1/create-qr-code/?size=1024x1024&margin=24&data=${encodeURIComponent(checkInUrl)}`
    : ''

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(checkInUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const headerDate = tab === 'today' ? boardDate : portalToday

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="gday-soft-label">Marina</p>
          <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight text-teal-950 sm:text-3xl">
            Guest check-in
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-teal-950/55">
            Live board by day — one line per passenger, check-in status, and payment if due.
          </p>
        </div>
        <p className="text-sm font-medium text-teal-900/50">{formatLongDate(headerDate)}</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-teal-950/[0.04] p-1 sm:inline-grid sm:w-auto">
        <TabButton
          active={tab === 'today'}
          onClick={() => setTab('today')}
          icon={<Users className="size-3.5" />}
        >
          Live board
        </TabButton>
        <TabButton active={tab === 'qr'} onClick={() => setTab('qr')} icon={<QrCode className="size-3.5" />}>
          QR code
        </TabButton>
      </div>

      {tab === 'qr' ? (
        <QrTab
          checkInUrl={checkInUrl}
          qrSrc={qrSrc}
          qrDownloadSrc={qrDownloadSrc}
          copied={copied}
          onCopy={copyLink}
        />
      ) : (
        <TodayBoardTab
          boardDate={boardDate}
          onBoardDateChange={setBoardDate}
          portalToday={portalToday}
          programFilter={programFilter}
          onProgramFilter={setProgramFilter}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all',
        active ? 'bg-white text-teal-950 shadow-sm' : 'text-teal-900/55 hover:text-teal-950',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function QrTab({
  checkInUrl,
  qrSrc,
  qrDownloadSrc,
  copied,
  onCopy,
}: {
  checkInUrl: string
  qrSrc: string
  qrDownloadSrc: string
  copied: boolean
  onCopy: () => void
}) {
  const [saving, setSaving] = useState(false)

  async function saveQr() {
    if (!qrDownloadSrc) return
    setSaving(true)
    try {
      const response = await fetch(qrDownloadSrc)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = 'gday-marina-check-in-qr.png'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      // Fallback: open image so staff can save manually
      window.open(qrDownloadSrc, '_blank', 'noopener,noreferrer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="gday-sheet flex flex-col items-center rounded-[1.5rem] p-6 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-teal-950/[0.05] text-teal-800">
          <QrCode className="size-5" />
        </div>
        <p className="text-sm font-semibold text-teal-950">Guest QR code</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-teal-900/50">
          One QR for every day. After midnight (Thailand time), the check-in page shows the next
          tour date automatically.
        </p>

        <div className="mt-5 w-full max-w-[280px] overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-teal-900/8">
          {qrSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrSrc}
              alt="QR code linking to guest check-in"
              width={512}
              height={512}
              className="aspect-square h-auto w-full object-contain"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center text-sm text-teal-900/40">
              Preparing QR…
            </div>
          )}
        </div>

        <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={onCopy}>
            {copied ? <CheckCircle2 data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button variant="outline" size="sm" disabled={!qrDownloadSrc || saving} onClick={saveQr}>
            <Download data-icon="inline-start" />
            {saving ? 'Saving…' : 'Save QR'}
          </Button>
          <Link
            href="/check-in"
            target="_blank"
            className="inline-flex h-8 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-teal-900/12 bg-white/80 px-2.5 text-[0.8rem] font-medium text-teal-950 transition-colors hover:bg-teal-950/[0.04]"
          >
            <ExternalLink className="size-3.5" />
            Open guest page
          </Link>
        </div>
        <p className="mt-3 break-all text-[11px] text-teal-900/40">{checkInUrl}</p>
      </div>
    </div>
  )
}

function TodayBoardTab({
  boardDate,
  onBoardDateChange,
  portalToday,
  programFilter,
  onProgramFilter,
}: {
  boardDate: string
  onBoardDateChange: (date: string) => void
  portalToday: string
  programFilter: 'all' | Program
  onProgramFilter: (value: 'all' | Program) => void
}) {
  const {
    bookings,
    getDayVehiclePlan,
    getDayBoatPlan,
    resolveVanMeta,
    getCheckInEnrollments,
    getCheckInAttendance,
    hydrated,
  } = usePortal()

  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const boardDateObj = useMemo(() => new Date(`${boardDate}T12:00:00`), [boardDate])
  const portalTodayObj = useMemo(() => new Date(`${portalToday}T12:00:00`), [portalToday])
  const isToday = boardDate === portalToday

  const selectedBooking = useMemo(
    () => (selectedCode ? bookings.find((item) => item.code === selectedCode) ?? null : null),
    [bookings, selectedCode],
  )

  const selectedBoat = useMemo(() => {
    if (!selectedBooking) return null
    const plan = getDayBoatPlan(boardDate, selectedBooking.program)
    return plan.assignments[selectedBooking.code] ?? null
  }, [boardDate, getDayBoatPlan, selectedBooking])

  const dayBookings = useMemo(
    () =>
      bookings
        .filter((booking) => booking.date === boardDate && isActiveBooking(booking))
        .filter((booking) => (programFilter === 'all' ? true : booking.program === programFilter))
        .slice()
        .sort(
          (a, b) =>
            a.program.localeCompare(b.program) ||
            a.leadGuest.localeCompare(b.leadGuest) ||
            a.code.localeCompare(b.code),
        ),
    [boardDate, bookings, programFilter],
  )

  const groups = useMemo(() => {
    const programs: Program[] =
      programFilter === 'all' ? ['PP', 'James Bond'] : [programFilter]
    const result: DriverGroup[] = []

    for (const program of programs) {
      const programBookings = dayBookings.filter((b) => b.program === program)
      if (programBookings.length === 0) continue
      const plan = getDayVehiclePlan(boardDate, program)
      const boatPlan = getDayBoatPlan(boardDate, program)
      const transfer = programBookings.filter((b) => !isNoTransfer(b.pickupZone))
      const noTransfer = programBookings.filter((b) => isNoTransfer(b.pickupZone))
      const vanNums = listVanNumbers(plan.assignments)

      for (const van of vanNums) {
        const vanBookings = transfer
          .filter((b) => primaryVan(plan.assignments[b.code]) === van)
          .sort(
            (a, b) =>
              sortOrderOnVan(plan.assignments[a.code], van) -
                sortOrderOnVan(plan.assignments[b.code], van) ||
              a.leadGuest.localeCompare(b.leadGuest),
          )
        if (vanBookings.length === 0) continue
        const meta = resolveVanMeta(van, plan.vanMeta[String(van)])
        result.push(
          makeDriverGroup(
            `${program}-van-${van}`,
            program,
            van,
            meta.driver,
            meta.plate,
            meta.phone,
            vanBookings,
            boardDate,
            boatPlan.assignments,
            getCheckInEnrollments,
            getCheckInAttendance,
          ),
        )
      }

      const unassigned = transfer.filter((b) => primaryVan(plan.assignments[b.code]) === null)
      if (unassigned.length > 0) {
        result.push(
          makeDriverGroup(
            `${program}-unassigned`,
            program,
            null,
            '',
            '',
            '',
            unassigned,
            boardDate,
            boatPlan.assignments,
            getCheckInEnrollments,
            getCheckInAttendance,
          ),
        )
      }

      if (noTransfer.length > 0) {
        result.push(
          makeDriverGroup(
            `${program}-no-transfer`,
            program,
            null,
            '',
            '',
            '',
            noTransfer,
            boardDate,
            boatPlan.assignments,
            getCheckInEnrollments,
            getCheckInAttendance,
          ),
        )
      }
    }

    return result
  }, [
    boardDate,
    dayBookings,
    getCheckInAttendance,
    getCheckInEnrollments,
    getDayBoatPlan,
    getDayVehiclePlan,
    programFilter,
    resolveVanMeta,
  ])

  const summary = useMemo(() => {
    let checked = 0
    let waiting = 0
    let noShow = 0
    for (const group of groups) {
      checked += group.checked
      waiting += group.waiting
      noShow += group.noShow
    }
    return { checked, waiting, noShow, total: checked + waiting + noShow }
  }, [groups])

  function selectDate(date: Date | undefined) {
    if (!date) return
    onBoardDateChange(toISODate(date))
    setSelectedCode(null)
    setCalendarOpen(false)
  }

  if (!hydrated) {
    return (
      <div className="gday-sheet rounded-[1.5rem] p-8 text-center text-sm text-teal-900/50">
        Loading check-in board…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 min-w-[11rem] justify-start gap-2 font-normal"
                />
              }
            >
              <CalendarIcon className="size-4 text-teal-700/60" />
              {formatShortDate(boardDate)}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={boardDateObj}
                onSelect={selectDate}
                defaultMonth={boardDateObj}
                disabled={{ after: portalTodayObj }}
              />
            </PopoverContent>
          </Popover>
          {!isToday ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onBoardDateChange(portalToday)
                setSelectedCode(null)
              }}
            >
              Today
            </Button>
          ) : null}
          <div className="flex flex-wrap gap-1.5 rounded-2xl bg-teal-950/[0.04] p-1">
            {(
              [
                ['all', 'All programs'],
                ['PP', 'Phi Phi'],
                ['James Bond', 'James Bond'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onProgramFilter(value)}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-semibold transition-all',
                  programFilter === value
                    ? 'bg-white text-teal-950 shadow-sm'
                    : 'text-teal-900/55 hover:text-teal-950',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <StatPill tone="emerald" label="Checked in" value={summary.checked} />
          <StatPill tone="amber" label="Waiting" value={summary.waiting} />
          <StatPill tone="rose" label="No-show" value={summary.noShow} />
          <StatPill tone="teal" label="Total seats" value={summary.total} />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="gday-sheet rounded-[1.5rem] p-8 text-center text-sm text-teal-900/55">
          No active bookings for {formatLongDate(boardDate)}
          {programFilter === 'all' ? '' : ` · ${programLabel(programFilter)}`}.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <DriverGroupCard
              key={group.id}
              group={group}
              showProgram={programFilter === 'all'}
              today={boardDate}
              onSelectBooking={(code) => setSelectedCode(code)}
            />
          ))}
        </div>
      )}

      <AdminCheckInBookingPanel
        open={Boolean(selectedCode && selectedBooking)}
        onOpenChange={(open) => {
          if (!open) setSelectedCode(null)
        }}
        booking={selectedBooking}
        boat={selectedBoat}
        today={boardDate}
      />
    </div>
  )
}

function makeDriverGroup(
  id: string,
  program: Program,
  van: number | null,
  driver: string,
  plate: string,
  phone: string,
  bookings: Booking[],
  today: string,
  boatAssignments: Record<string, number>,
  getEnrollments: ReturnType<typeof usePortal>['getCheckInEnrollments'],
  getAttendance: ReturnType<typeof usePortal>['getCheckInAttendance'],
): DriverGroup {
  const lines = bookings.flatMap((booking) =>
    expandGuestLines(
      booking,
      getEnrollments(today, booking.program, booking.code),
      getAttendance(today, booking.program, booking.code),
      boatAssignments[booking.code] ?? null,
    ),
  )
  return {
    id,
    program,
    van,
    driver,
    plate,
    phone,
    lines,
    checked: lines.filter((line) => line.status === 'checked').length,
    waiting: lines.filter((line) => line.status === 'waiting').length,
    noShow: lines.filter((line) => line.status === 'no-show').length,
  }
}

function DriverGroupCard({
  group,
  showProgram,
  today,
  onSelectBooking,
}: {
  group: DriverGroup
  showProgram: boolean
  today: string
  onSelectBooking: (code: string) => void
}) {
  const { getCheckInPayment, setCheckInPayment } = usePortal()
  const title =
    group.van === null
      ? group.id.includes('no-transfer')
        ? 'No Transfer'
        : 'Unassigned / no van'
      : group.plate.trim() || `Van ${group.van}`

  return (
    <div className="gday-sheet overflow-hidden rounded-[1.5rem]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/8 bg-gradient-to-r from-teal-50 to-white px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-teal-950">
            {showProgram ? `${programLabel(group.program)} · ` : ''}
            {title}
          </p>
          {group.van !== null ? (
            <p className="mt-0.5 text-xs text-teal-900/60">
              Driver: <span className="font-medium text-teal-950">{group.driver || '—'}</span>
              <span className="mx-1.5 text-teal-900/25">·</span>
              Tel: <span className="font-medium text-teal-950">{group.phone || '—'}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-teal-900/55">
              Guests without a van assignment or with no hotel transfer.
            </p>
          )}
        </div>
        <p className="rounded-full border border-teal-900/10 bg-white/90 px-2.5 py-1 text-xs font-medium tabular-nums text-teal-800/70">
          {group.checked}/{group.lines.length} checked in
          {group.waiting > 0 ? ` · ${group.waiting} waiting` : ''}
        </p>
      </div>

      <Table
        containerClassName="overflow-visible"
        className="table-fixed text-[12px] leading-snug"
      >
        <TableHeader>
          <TableRow className="border-b border-teal-900/15 bg-teal-950/[0.03] hover:bg-teal-950/[0.03]">
            <TableHead className="w-8 px-1.5 text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              No.
            </TableHead>
            <TableHead className="w-[30%] px-1.5 text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Guest
            </TableHead>
            <TableHead className="w-[24%] px-1.5 text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Hotel
            </TableHead>
            <TableHead className="w-12 px-1 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Boat
            </TableHead>
            <TableHead className="w-10 px-1 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Park
            </TableHead>
            <TableHead className="w-[10%] px-1.5 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Status
            </TableHead>
            <TableHead className="w-[12%] px-1.5 text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Pay
            </TableHead>
            <TableHead className="w-[12%] px-1.5 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.lines.map((line, index) => {
            const payment = bookingPayment(line.booking)
            const paymentKey = checkInPaymentSeatKey(line.booking.code, line.slot)
            const paid =
              getCheckInPayment(today, line.booking.program, paymentKey) === 'paid'
            const prev = index > 0 ? group.lines[index - 1] : null
            const newBooking = !prev || prev.booking.code !== line.booking.code
            const hotel = line.booking.pickupHotel || line.booking.pickupZone || '—'
            const details = [
              line.nationality,
              line.birthday ? formatShortDate(line.birthday) : '',
              line.passportNumber,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <TableRow
                key={line.key}
                role="button"
                tabIndex={0}
                onClick={() => onSelectBooking(line.booking.code)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectBooking(line.booking.code)
                  }
                }}
                className={cn(
                  'cursor-pointer',
                  newBooking && index > 0 && 'border-t-2 border-teal-900/10',
                  line.status === 'checked' && 'bg-emerald-50/40',
                  line.status === 'waiting' && 'bg-amber-50/30',
                  line.status === 'no-show' && 'bg-rose-50/40',
                  paid && 'bg-sky-50/40',
                )}
              >
                <TableCell className="px-1.5 tabular-nums text-teal-900/45">
                  {index + 1}
                </TableCell>
                <TableCell className="max-w-0 whitespace-normal px-1.5">
                  {line.status === 'waiting' ? (
                    <div>
                      <p className="truncate text-sm font-semibold text-teal-950">
                        {line.leaderName || '—'}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-amber-900/80">
                        Waiting · {line.slot + 1}/{line.seatsTotal}
                        {line.checkedInCount > 0
                          ? ` · ${line.checkedInCount}/${line.seatsTotal} done`
                          : ''}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="truncate text-sm font-semibold text-teal-950">
                        {line.guestName || line.leaderName || '—'}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-teal-900/45">
                        {line.status === 'checked' && line.checkedInAt
                          ? formatCheckInTime(line.checkedInAt)
                          : null}
                        {line.status === 'checked' && line.checkedInAt && details ? ' · ' : null}
                        {details ||
                          (line.seatsTotal > 1
                            ? `${line.checkedInCount}/${line.seatsTotal} · ${line.leaderName}`
                            : '')}
                      </p>
                    </div>
                  )}
                </TableCell>
                <TableCell className="max-w-0 whitespace-normal px-1.5">
                  <p className="truncate text-teal-900/80" title={hotel}>
                    {hotel}
                  </p>
                </TableCell>
                <TableCell className="px-1 text-center">
                  <BoatFleetBadge boat={line.boat} />
                </TableCell>
                <TableCell className="px-1 text-center text-teal-900/70">
                  {formatIncludeShort(line.booking.parkFee)}
                </TableCell>
                <TableCell className="px-1.5 text-center">
                  <StatusBadge status={line.status} />
                </TableCell>
                <TableCell className="max-w-0 whitespace-normal px-1.5">
                  {payment.kind === 'due' ? (
                    <span
                      className={cn(
                        'font-semibold',
                        paid ? 'text-emerald-800' : 'text-orange-800',
                      )}
                    >
                      {payment.label}
                    </span>
                  ) : payment.kind === 'note' ? (
                    <span
                      className={cn(
                        'truncate text-[11px]',
                        paid ? 'text-emerald-800/80' : 'text-orange-800/80',
                      )}
                      title={payment.label}
                    >
                      {payment.label}
                    </span>
                  ) : (
                    <span className="text-teal-900/35">—</span>
                  )}
                </TableCell>
                <TableCell
                  className="px-1.5 text-center"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    aria-label={`Done for ${line.guestName || line.leaderName || line.booking.code}`}
                    className="size-4 rounded border-teal-900/25 text-teal-800 focus-visible:ring-teal-700/30"
                    checked={paid}
                    onChange={(event) =>
                      setCheckInPayment(
                        today,
                        line.booking.program,
                        paymentKey,
                        event.target.checked ? 'paid' : null,
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function StatusBadge({ status }: { status: GuestLineStatus }) {
  if (status === 'checked') {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
        In
      </span>
    )
  }
  if (status === 'no-show') {
    return (
      <span className="inline-flex rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
        NS
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
      Wait
    </span>
  )
}

function StatPill({
  tone,
  label,
  value,
}: {
  tone: 'emerald' | 'amber' | 'rose' | 'teal'
  label: string
  value: number
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200/70',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200/70',
    rose: 'bg-rose-50 text-rose-800 ring-rose-200/70',
    teal: 'bg-teal-50 text-teal-800 ring-teal-200/70',
  }
  return (
    <span className={cn('rounded-full px-2.5 py-1 ring-1', tones[tone])}>
      {label} <span className="tabular-nums">{value}</span>
    </span>
  )
}
