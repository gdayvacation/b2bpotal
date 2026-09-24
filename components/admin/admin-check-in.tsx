'use client'

import { startTransition, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  ExternalLink,
  Plus,
  Printer,
  QrCode,
  Ship,
  Trash2,
  Users,
  Waves,
} from 'lucide-react'
import { BoatFleetBadge } from '@/components/boat-badge'
import { AdminCheckInBookingPanel } from '@/components/admin/admin-check-in-booking-panel'
import { usePortal } from '@/components/portal-provider'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  enrolledSeatCount,
  guestDisplayName,
  type CheckInEnrollment,
} from '@/lib/check-in-enrollment'
import { formatGuestPaxParts, hasPartialNoShow, originalBookedPax } from '@/lib/check-in-booked-pax'
import {
  HELPER_BOARD_CLOSE_HOUR,
  helperBoardIssueDate,
  helperBoardQrImageUrl,
  helperBoardUrl,
  isHelperBoardClosed,
} from '@/lib/check-in-helper'
import {
  guestCheckInQrImageUrl,
  guestCheckInUrl,
} from '@/lib/check-in-qr'
import {
  CHECK_IN_SERVICE_KINDS,
  checkInServiceLabel,
  newCheckInServiceId,
  serviceLineTotal,
  type CheckInServiceKind,
  type CheckInServiceLine,
} from '@/lib/check-in-services'
import {
  collectTotal,
  formatIncludeShort,
  formatLongDate,
  formatShortDate,
  parseCashOnTourAmount,
  todayISO,
  toISODate,
} from '@/lib/format'
import { usePortalDefaultDateISO } from '@/lib/use-portal-today'
import {
  DEFAULT_INSURANCE_POLICY_NUMBER,
  loadInsurancePolicyNumber,
  saveInsurancePolicyNumber,
} from '@/lib/insurance-policy'
import {
  allocatePaxBreakdown,
  listVanNumbers,
  paxBreakdownTotal,
  paxOnVan,
  primaryVan,
  sortOrderOnVan,
  type PaxBreakdown,
} from '@/lib/vehicle-assign'
import { cn } from '@/lib/utils'
import {
  isActiveBooking,
  isNoTransfer,
  totalPassengers,
  vanOutsourceLabel,
  type Booking,
  type Program,
  type VanSplit,
} from '@/lib/types'

type AdminTab = 'qr' | 'today' | 'insurance'

type InsuranceGuestRow = {
  key: string
  fullName: string
  birthday: string
  passportNumber: string
  hotel: string
}

type InsuranceProgramGroup = {
  program: Program
  guests: InsuranceGuestRow[]
}

type GuestLineStatus = 'checked' | 'waiting' | 'no-show'

type CheckedGuest = {
  key: string
  guestName: string
  nationality: string
  birthday: string
  passportNumber: string
  checkedInAt: string
  seats: number
}

type BookingLine = {
  key: string
  booking: Booking
  van: number | null
  split: boolean
  pax: PaxBreakdown
  originalPax: PaxBreakdown
  seatsTotal: number
  bookingSeats: number
  checkedInCount: number
  leaderName: string
  status: GuestLineStatus
  boat: number | null
  guests: CheckedGuest[]
}

type DriverGroup = {
  id: string
  program: Program
  van: number | null
  driver: string
  plate: string
  phone: string
  outsourced: boolean
  outsourceCompany: string
  lines: BookingLine[]
  checked: number
  waiting: number
  noShow: number
  seatsTotal: number
}

function programLabel(program: Program) {
  return program === 'PP' ? 'Phi Phi' : 'James Bond'
}

function driverGroupTitle(group: DriverGroup, showProgram: boolean) {
  const program = showProgram ? `${programLabel(group.program)} · ` : ''
  if (group.van !== null) return `${program}Van ${group.van}`
  if (group.id.includes('no-transfer')) return `${program}No Transfer`
  return `${program}Unassigned / no van`
}

function buildBookingLine(
  booking: Booking,
  enrollments: CheckInEnrollment[],
  attendance: 'checked' | 'no-show' | null,
  boat: number | null,
  today: string,
  van: number | null,
  legs?: VanSplit[],
): BookingLine {
  const bookingSeats = Math.max(1, totalPassengers(booking))
  const bookedFull = originalBookedPax(today, booking.program, booking)
  const currentFull: PaxBreakdown = {
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    tourLeaders: booking.tourLeaders,
  }
  const pax = allocatePaxBreakdown(currentFull, legs, van)
  const originalPax = allocatePaxBreakdown(bookedFull, legs, van)
  const vanSeats = paxBreakdownTotal(pax)
  const seats = van !== null && vanSeats > 0 ? vanSeats : bookingSeats
  const enrolled = Math.min(enrolledSeatCount(enrollments), bookingSeats)
  const guests: CheckedGuest[] = enrollments.map((enrollment) => ({
    key: enrollment.id,
    guestName: guestDisplayName(enrollment) || booking.leadGuest,
    nationality: enrollment.nationality,
    birthday: enrollment.birthday,
    passportNumber: enrollment.passportNumber,
    checkedInAt: enrollment.checkedInAt,
    seats: enrollment.seats,
  }))

  let status: GuestLineStatus = 'waiting'
  if (attendance === 'no-show') status = 'no-show'
  else if (attendance === 'checked' || enrolled >= bookingSeats) status = 'checked'

  return {
    key: van !== null ? `${booking.code}-van-${van}` : booking.code,
    booking,
    van,
    split: (legs?.length ?? 0) > 1,
    pax,
    originalPax,
    seatsTotal: seats,
    bookingSeats,
    checkedInCount: enrolled,
    leaderName: booking.leadGuest,
    status,
    boat,
    guests,
  }
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

  const headerDate = tab === 'qr' ? portalToday : boardDate

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="gday-soft-label">Marina</p>
          <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight text-teal-950 sm:text-3xl">
            Guest check-in
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-teal-950/55">
            Live board by day — one line per booking. Generate a QR for each booking when guests
            arrive so payment due is never mixed up.
          </p>
        </div>
        <p className="text-sm font-medium text-teal-900/50">{formatLongDate(headerDate)}</p>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-teal-950/[0.04] p-1 print:hidden sm:inline-grid sm:w-auto">
        <TabButton
          active={tab === 'today'}
          onClick={() => setTab('today')}
          icon={<Users className="size-3.5" />}
        >
          Live board
        </TabButton>
        <TabButton active={tab === 'qr'} onClick={() => setTab('qr')} icon={<QrCode className="size-3.5" />}>
          QR code for Helper
        </TabButton>
        <TabButton
          active={tab === 'insurance'}
          onClick={() => setTab('insurance')}
          icon={<ClipboardList className="size-3.5" />}
        >
          Insurance
        </TabButton>
      </div>

      {tab === 'qr' ? (
        <QrTab />
      ) : tab === 'insurance' ? (
        <InsuranceListTab
          boardDate={boardDate}
          onBoardDateChange={setBoardDate}
          portalToday={portalToday}
          programFilter={programFilter}
          onProgramFilter={setProgramFilter}
        />
      ) : (
        <TodayBoardTab
          boardDate={boardDate}
          onBoardDateChange={setBoardDate}
          portalToday={portalToday}
          programFilter={programFilter}
          onProgramFilter={setProgramFilter}
          origin={origin}
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

function QrTab() {
  const [origin, setOrigin] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [copied, setCopied] = useState(false)
  const issueDate = helperBoardIssueDate(now)
  const todayClosed = isHelperBoardClosed(todayISO(now), now)
  const helperUrl = origin ? helperBoardUrl(origin, issueDate) : ''
  const qrSrc = origin ? helperBoardQrImageUrl(origin, issueDate, 512) : ''

  useEffect(() => {
    setOrigin(window.location.origin)
    const id = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(id)
  }, [])

  async function copyLink() {
    if (!helperUrl) return
    try {
      await navigator.clipboard.writeText(helperUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="gday-sheet flex flex-col items-center rounded-[1.5rem] p-6 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-teal-950/[0.05] text-teal-800">
          <QrCode className="size-5" />
        </div>
        <p className="text-sm font-semibold text-teal-950">QR code for Helper</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-teal-900/50">
          Staff scan this to open the van board for {formatLongDate(issueDate)}. They can make guest
          QR codes and see hotel, boat, and pay. Service and ticket stay admin-only. The page closes
          at {String(HELPER_BOARD_CLOSE_HOUR).padStart(2, '0')}:00 Thailand time and cannot be opened
          again.
        </p>
        {todayClosed ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            Today’s helper board is already closed. This QR is for tomorrow.
          </p>
        ) : null}
        <div className="mt-5 w-full overflow-hidden rounded-2xl bg-white p-3 ring-1 ring-teal-900/10">
          {qrSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrSrc}
              alt={`Helper check-in QR for ${formatShortDate(issueDate)}`}
              width={512}
              height={512}
              className="aspect-square h-auto w-full object-contain"
            />
          ) : (
            <div className="flex aspect-square items-center justify-center text-sm text-teal-900/40">
              Preparing QR…
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
            {copied ? (
              <CheckCircle2 data-icon="inline-start" />
            ) : (
              <Copy data-icon="inline-start" />
            )}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          {helperUrl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(helperUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink data-icon="inline-start" />
              Open
            </Button>
          ) : null}
        </div>
        <p className="mt-3 break-all text-[11px] text-teal-900/40">{helperUrl}</p>
      </div>
    </div>
  )
}

function formatInsuranceBirthday(iso: string) {
  if (!iso) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  return `${match[3]}/${match[2]}/${match[1]}`
}

function formatInsuranceTravelDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return formatShortDate(iso)
  const day = String(Number(match[3]))
  const month = String(Number(match[2]))
  const year = match[1].slice(2)
  return `${day}/${month}/${year}`
}

function InsuranceListTab({
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
  const { bookings, getCheckInEnrollments, getCheckInAttendance, hydrated } = usePortal()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [policyNumber, setPolicyNumber] = useState(DEFAULT_INSURANCE_POLICY_NUMBER)
  const boardDateObj = useMemo(() => new Date(`${boardDate}T12:00:00`), [boardDate])
  const portalTodayObj = useMemo(() => new Date(`${portalToday}T12:00:00`), [portalToday])
  const isToday = boardDate === portalToday

  useEffect(() => {
    setPolicyNumber(loadInsurancePolicyNumber())
  }, [])

  const groups = useMemo(() => {
    const dayBookings = bookings
      .filter((booking) => booking.date === boardDate && isActiveBooking(booking))
      .filter((booking) => (programFilter === 'all' ? true : booking.program === programFilter))
      .slice()
      .sort(
        (a, b) =>
          a.program.localeCompare(b.program) ||
          a.leadGuest.localeCompare(b.leadGuest) ||
          a.code.localeCompare(b.code),
      )

    const byProgram = new Map<Program, InsuranceGuestRow[]>()

    for (const booking of dayBookings) {
      if (getCheckInAttendance(boardDate, booking.program, booking.code) === 'no-show') {
        continue
      }
      const enrollments = getCheckInEnrollments(boardDate, booking.program, booking.code)
      if (enrollments.length === 0) continue

      const list = byProgram.get(booking.program) ?? []
      const hotel = booking.pickupHotel?.trim() || '—'

      for (const enrollment of enrollments) {
        const fullName = guestDisplayName(enrollment)
        if (!fullName) continue
        list.push({
          key: `${booking.code}-${enrollment.id}`,
          fullName,
          birthday: enrollment.birthday,
          passportNumber: enrollment.passportNumber || '',
          hotel,
        })
      }
      byProgram.set(booking.program, list)
    }

    const programOrder: Program[] =
      programFilter === 'all' ? ['PP', 'James Bond'] : [programFilter]
    const result: InsuranceProgramGroup[] = []
    for (const program of programOrder) {
      const guests = (byProgram.get(program) ?? [])
        .slice()
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
      if (guests.length === 0) continue
      result.push({ program, guests })
    }
    return result
  }, [boardDate, bookings, getCheckInAttendance, getCheckInEnrollments, programFilter])

  const totalGuests = useMemo(
    () => groups.reduce((sum, program) => sum + program.guests.length, 0),
    [groups],
  )

  function selectDate(date: Date | undefined) {
    if (!date) return
    onBoardDateChange(toISODate(date))
    setCalendarOpen(false)
  }

  function onPolicyChange(value: string) {
    setPolicyNumber(value)
    saveInsurancePolicyNumber(value)
  }

  function buildPlainText() {
    const lines: string[] = [
      'บริษัท กู๊ด เดย์ วาเคชั่น จำกัด',
      '35/84 หมู่ 3 ต.รัษฎา อ.เมือง จ.ภูเก็ต 83000',
      'เรียน บริษัท กรุงเทพประกันภัย จำกัด (มหาชน) สาขาภูเก็ต',
      'โทร. 076-304055-8    Email : Phuket@bangkokinsurance.com',
      `กรมธรรม์เลขที่ : ${policyNumber.trim() || DEFAULT_INSURANCE_POLICY_NUMBER}          เดินทางวันที่ : ${formatInsuranceTravelDate(boardDate)}`,
      'รายละเอียดการท่องเที่ยวตามโปรแกรมทัวร์ที่แนบมาด้วยนี้',
      '',
    ]
    for (const program of groups) {
      lines.push(`Program: ${programLabel(program.program)}`)
      lines.push('No.\tName-Surname\tPassport No.\tDate Of Birth\tHotel')
      program.guests.forEach((guest, index) => {
        lines.push(
          [
            String(index + 1),
            guest.fullName,
            guest.passportNumber || '',
            formatInsuranceBirthday(guest.birthday),
            guest.hotel,
          ].join('\t'),
        )
      })
      lines.push('')
    }
    return lines.join('\n').trim()
  }

  async function copyList() {
    try {
      await navigator.clipboard.writeText(buildPlainText())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  function handlePrint() {
    const previousTitle = document.title
    document.title = `Insurance ${formatShortDate(boardDate)}`
    document.body.classList.add('printing-insurance')
    let restored = false
    const restore = () => {
      if (restored) return
      restored = true
      document.title = previousTitle
      document.body.classList.remove('printing-insurance')
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
    window.setTimeout(restore, 2000)
  }

  if (!hydrated) {
    return (
      <div className="gday-sheet rounded-[1.5rem] p-8 text-center text-sm text-teal-900/50">
        Loading insurance list…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
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
              onClick={() => onBoardDateChange(portalToday)}
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
          <label className="flex items-center gap-2 text-sm text-teal-900/60">
            <span className="whitespace-nowrap">Policy no.</span>
            <Input
              value={policyNumber}
              onChange={(event) => onPolicyChange(event.target.value)}
              className="h-10 w-[10.5rem] font-semibold text-red-700"
              aria-label="Insurance policy number"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-teal-900/50">
            {totalGuests} guest{totalGuests === 1 ? '' : 's'} checked in
          </p>
          <Button type="button" variant="outline" size="sm" disabled={totalGuests === 0} onClick={copyList}>
            {copied ? <CheckCircle2 data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? 'Copied' : 'Copy list'}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={totalGuests === 0} onClick={handlePrint}>
            <Printer data-icon="inline-start" />
            Print
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="gday-sheet rounded-[1.5rem] p-8 text-center text-sm text-teal-900/55">
          No checked-in guests with names for {formatLongDate(boardDate)}
          {programFilter === 'all' ? '' : ` · ${programLabel(programFilter)}`}.
        </div>
      ) : (
        <div className="space-y-8">
          {programFilter === 'all' && groups.length > 1 ? (
            <p className="print:hidden text-sm text-teal-900/50">
              All programs shows separate lists — Phi Phi first, then James Bond. Print keeps both
              on as few pages as possible.
            </p>
          ) : null}
          <div className="insurance-print-sheet space-y-8 print:space-y-3">
            {groups.map((program, groupIndex) => (
              <div key={program.program} className="space-y-2 print:space-y-0">
                {programFilter === 'all' ? (
                  <div className="print:hidden flex items-baseline justify-between gap-3 px-1">
                    <p className="font-display text-lg font-semibold text-teal-950">
                      {groupIndex + 1}. {programLabel(program.program)}
                      {program.program === 'PP' ? ' (PP)' : ' (JB)'}
                    </p>
                    <p className="text-sm text-teal-900/45">
                      {program.guests.length} guest{program.guests.length === 1 ? '' : 's'}
                    </p>
                  </div>
                ) : null}
                <div className="gday-sheet overflow-hidden rounded-[1.5rem] print:rounded-none print:border print:border-neutral-300 print:shadow-none">
                  <div className="space-y-2 border-b border-teal-900/8 px-4 py-4 text-sm leading-relaxed text-teal-950 sm:px-5 print:hidden">
                    <p className="text-lg font-semibold sm:text-xl">
                      บริษัท กู๊ด เดย์ วาเคชั่น จำกัด
                    </p>
                    <p>35/84 หมู่ 3 ต.รัษฎา อ.เมือง จ.ภูเก็ต 83000</p>
                    <p>เรียน บริษัท กรุงเทพประกันภัย จำกัด (มหาชน) สาขาภูเก็ต</p>
                    <p>
                      โทร. 076-304055-8{' '}
                      <span className="mx-2 text-teal-900/35">|</span>
                      Email : Phuket@bangkokinsurance.com
                    </p>
                    <p>
                      กรมธรรม์เลขที่ :{' '}
                      <span className="font-semibold text-red-700">
                        {policyNumber.trim() || DEFAULT_INSURANCE_POLICY_NUMBER}
                      </span>
                      <span className="inline-block w-16 sm:w-24" aria-hidden />
                      เดินทางวันที่ : {formatInsuranceTravelDate(boardDate)}
                    </p>
                    <p>รายละเอียดการท่องเที่ยวตามโปรแกรมทัวร์ที่แนบมาด้วยนี้</p>
                    <p className="pt-1 text-base font-semibold text-teal-950">
                      Program · {programLabel(program.program)}
                      {program.program === 'PP' ? ' (PP)' : ' (JB)'} · {program.guests.length} guest
                      {program.guests.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="hidden border-b border-neutral-300 pb-1.5 text-[9px] leading-snug text-teal-950 print:block">
                    <p className="text-[10px] font-semibold">
                      บริษัท กู๊ด เดย์ วาเคชั่น จำกัด
                      <span className="mx-1.5 font-normal text-teal-900/45">·</span>
                      <span className="font-normal">
                        35/84 หมู่ 3 ต.รัษฎา อ.เมือง จ.ภูเก็ต 83000
                      </span>
                    </p>
                    <p>
                      เรียน บริษัท กรุงเทพประกันภัย จำกัด (มหาชน) สาขาภูเก็ต
                      <span className="mx-1.5 text-teal-900/45">·</span>
                      โทร. 076-304055-8
                      <span className="mx-1.5 text-teal-900/45">·</span>
                      Phuket@bangkokinsurance.com
                    </p>
                    <p className="font-semibold">
                      กรมธรรม์เลขที่ :{' '}
                      <span className="text-red-700">
                        {policyNumber.trim() || DEFAULT_INSURANCE_POLICY_NUMBER}
                      </span>
                      <span className="mx-2 font-normal">เดินทางวันที่ : {formatInsuranceTravelDate(boardDate)}</span>
                      <span className="mx-1.5 font-normal text-teal-900/45">·</span>
                      Program · {programLabel(program.program)}
                      {program.program === 'PP' ? ' (PP)' : ' (JB)'} · {program.guests.length} guest
                      {program.guests.length === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-14 print:h-auto print:w-8 print:px-1 print:text-[8px]">
                            No.
                          </TableHead>
                          <TableHead className="print:h-auto print:px-1 print:text-[8px]">
                            Name-Surname
                          </TableHead>
                          <TableHead className="print:h-auto print:px-1 print:text-[8px]">
                            Passport No.
                          </TableHead>
                          <TableHead className="print:h-auto print:px-1 print:text-[8px]">
                            Date Of Birth
                          </TableHead>
                          <TableHead className="print:h-auto print:px-1 print:text-[8px]">Hotel</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {program.guests.map((guest, index) => (
                          <TableRow key={guest.key}>
                            <TableCell className="tabular-nums text-teal-900/55 print:p-0.5 print:px-1">
                              {index + 1}
                            </TableCell>
                            <TableCell className="font-medium text-teal-950 print:p-0.5 print:px-1">
                              {guest.fullName}
                            </TableCell>
                            <TableCell className="font-mono text-[0.85rem] print:p-0.5 print:px-1 print:text-[8.5px]">
                              {guest.passportNumber || '—'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap print:p-0.5 print:px-1">
                              {formatInsuranceBirthday(guest.birthday) || '—'}
                            </TableCell>
                            <TableCell className="print:p-0.5 print:px-1">{guest.hotel}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 7mm;
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
          .insurance-print-sheet,
          .insurance-print-sheet * {
            visibility: visible !important;
          }
          .insurance-print-sheet {
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
          .insurance-print-sheet .gday-sheet {
            background: white !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
            overflow: visible !important;
            border-radius: 0 !important;
            break-inside: auto;
            page-break-inside: auto;
          }
          .insurance-print-sheet [data-slot='table-container'],
          .insurance-print-sheet .overflow-x-auto {
            overflow: visible !important;
          }
          .insurance-print-sheet table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 8.5px !important;
            line-height: 1.2 !important;
          }
          .insurance-print-sheet thead {
            display: table-header-group;
          }
          .insurance-print-sheet th,
          .insurance-print-sheet td {
            background: white !important;
            padding: 1px 4px !important;
            height: auto !important;
            font-size: 8.5px !important;
            line-height: 1.2 !important;
            vertical-align: middle !important;
          }
          .insurance-print-sheet th {
            font-size: 8px !important;
            font-weight: 700 !important;
            padding: 2px 4px !important;
          }
          .insurance-print-sheet tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .insurance-print-sheet [class~='print:hidden'] {
            display: none !important;
            visibility: hidden !important;
          }
          .insurance-print-sheet [class~='print:block'] {
            display: block !important;
            visibility: visible !important;
          }
          .gday-admin-main::before {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}

export type CheckInBoardVariant = 'admin' | 'helper'

function TodayBoardTab({
  boardDate,
  onBoardDateChange,
  portalToday,
  programFilter,
  onProgramFilter,
  origin,
  variant = 'admin',
}: {
  boardDate: string
  onBoardDateChange: (date: string) => void
  portalToday: string
  programFilter: 'all' | Program
  onProgramFilter: (value: 'all' | Program) => void
  origin: string
  variant?: CheckInBoardVariant
}) {
  const isHelper = variant === 'helper'
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
  const [helperGroupId, setHelperGroupId] = useState<string | null>(null)
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
          .filter((b) => paxOnVan(plan.assignments[b.code], van) > 0)
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
            plan.assignments,
            getCheckInEnrollments,
            getCheckInAttendance,
            {
              outsourced: meta.outsourced === true,
              outsourceCompany: meta.outsourceCompany?.trim() || '',
            },
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
            plan.assignments,
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
            plan.assignments,
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
    const seen = new Set<string>()
    let checked = 0
    let waiting = 0
    let noShow = 0
    for (const group of groups) {
      for (const line of group.lines) {
        if (seen.has(line.booking.code)) continue
        seen.add(line.booking.code)
        if (line.status === 'no-show') {
          noShow += line.bookingSeats
          continue
        }
        checked += line.checkedInCount
        waiting += Math.max(0, line.bookingSeats - line.checkedInCount)
      }
    }
    return { checked, waiting, noShow, total: checked + waiting + noShow }
  }, [groups])

  function selectDate(date: Date | undefined) {
    if (!date) return
    onBoardDateChange(toISODate(date))
    setSelectedCode(null)
    setCalendarOpen(false)
  }

  const visibleGroups = useMemo(() => {
    if (!isHelper) return groups
    const selected =
      groups.find((group) => group.id === helperGroupId) ?? groups[0]
    return selected ? [selected] : []
  }, [groups, helperGroupId, isHelper])

  const activeHelperGroupId = visibleGroups[0]?.id ?? null

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
          {isHelper ? (
            <p className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-teal-950 ring-1 ring-teal-900/10">
              {formatShortDate(boardDate)}
            </p>
          ) : (
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
          )}
          {!isHelper && !isToday ? (
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

      {isHelper && groups.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-teal-950/[0.04] p-1.5">
          {groups.map((group) => {
            const active = group.id === activeHelperGroupId
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setHelperGroupId(group.id)}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-semibold transition-all',
                  active
                    ? 'bg-white text-teal-950 shadow-sm'
                    : 'text-teal-900/55 hover:text-teal-950',
                )}
              >
                {driverGroupTitle(group, programFilter === 'all')}
                <span className="ml-1.5 text-xs font-medium text-teal-900/45">
                  {group.seatsTotal}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div className="gday-sheet rounded-[1.5rem] p-8 text-center text-sm text-teal-900/55">
          No active bookings for {formatLongDate(boardDate)}
          {programFilter === 'all' ? '' : ` · ${programLabel(programFilter)}`}.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <DriverGroupCard
              key={group.id}
              group={group}
              showProgram={programFilter === 'all'}
              today={boardDate}
              origin={origin}
              variant={variant}
              onSelectBooking={(code) => {
                if (!isHelper) setSelectedCode(code)
              }}
            />
          ))}
        </div>
      )}

      {isHelper ? null : (
        <AdminCheckInBookingPanel
          open={Boolean(selectedCode && selectedBooking)}
          onOpenChange={(open) => {
            if (!open) setSelectedCode(null)
          }}
          booking={selectedBooking}
          boat={selectedBoat}
          today={boardDate}
        />
      )}
    </div>
  )
}

export function HelperCheckInBoard({
  date,
  origin,
}: {
  date: string
  origin: string
}) {
  const [programFilter, setProgramFilter] = useState<'all' | Program>('all')
  return (
    <TodayBoardTab
      boardDate={date}
      onBoardDateChange={() => {}}
      portalToday={date}
      programFilter={programFilter}
      onProgramFilter={setProgramFilter}
      origin={origin}
      variant="helper"
    />
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
  vanAssignments: Record<string, VanSplit[]>,
  getEnrollments: ReturnType<typeof usePortal>['getCheckInEnrollments'],
  getAttendance: ReturnType<typeof usePortal>['getCheckInAttendance'],
  outsource?: { outsourced?: boolean; outsourceCompany?: string },
): DriverGroup {
  const lines = bookings.map((booking) =>
    buildBookingLine(
      booking,
      getEnrollments(today, booking.program, booking.code),
      getAttendance(today, booking.program, booking.code),
      boatAssignments[booking.code] ?? null,
      today,
      van,
      vanAssignments[booking.code],
    ),
  )

  let checked = 0
  let waiting = 0
  let noShow = 0
  let seatsTotal = 0
  for (const line of lines) {
    seatsTotal += line.seatsTotal
    if (line.status === 'no-show') {
      noShow += line.seatsTotal
      continue
    }
    checked += line.checkedInCount
    waiting += Math.max(0, line.seatsTotal - line.checkedInCount)
  }

  return {
    id,
    program,
    van,
    driver,
    plate,
    phone,
    outsourced: outsource?.outsourced === true,
    outsourceCompany: outsource?.outsourceCompany?.trim() || '',
    lines,
    checked,
    waiting,
    noShow,
    seatsTotal,
  }
}

function DriverGroupCard({
  group,
  showProgram,
  today,
  origin,
  onSelectBooking,
  variant = 'admin',
}: {
  group: DriverGroup
  showProgram: boolean
  today: string
  origin: string
  onSelectBooking: (code: string) => void
  variant?: CheckInBoardVariant
}) {
  const isHelper = variant === 'helper'
  const {
    getCheckInPayment,
    setCheckInPayment,
    getCheckInTicket,
    setCheckInTicket,
    getCheckInServices,
    setCheckInServices,
  } = usePortal()
  const [expandedCodes, setExpandedCodes] = useState<Record<string, boolean>>({})
  const [qrBooking, setQrBooking] = useState<Booking | null>(null)
  const [qrCopied, setQrCopied] = useState(false)
  const [serviceBooking, setServiceBooking] = useState<Booking | null>(null)
  const title = driverGroupTitle(group, showProgram)

  const qrUrl = qrBooking && origin ? guestCheckInUrl(origin, qrBooking.code) : ''
  const qrSrc = qrUrl ? guestCheckInQrImageUrl(qrUrl, 512) : ''

  function toggleExpanded(code: string) {
    setExpandedCodes((current) => ({ ...current, [code]: !current[code] }))
  }

  async function copyQrLink() {
    if (!qrUrl) return
    try {
      await navigator.clipboard.writeText(qrUrl)
      setQrCopied(true)
      window.setTimeout(() => setQrCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="gday-sheet overflow-hidden rounded-[1.5rem]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/8 bg-gradient-to-r from-teal-50 to-white px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p
            className={cn(
              'font-semibold text-teal-950',
              isHelper ? 'font-display text-xl' : 'text-sm',
            )}
          >
            {title}
            {group.outsourced ? (
              <span className="ml-2 inline-flex rounded-md bg-violet-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-violet-900 uppercase">
                {vanOutsourceLabel(group)}
              </span>
            ) : null}
          </p>
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
            <p className="mt-0.5 text-xs text-teal-900/55">
              Guests without a van assignment or with no hotel transfer.
            </p>
          )}
        </div>
        <p className="rounded-full border border-teal-900/10 bg-white/90 px-2.5 py-1 text-xs font-medium tabular-nums text-teal-800/70">
          {group.lines.length} booking{group.lines.length === 1 ? '' : 's'} · {group.seatsTotal} pax
          <span className="text-teal-900/40">
            {' '}
            · {group.lines.filter((line) => line.status === 'checked').length}/{group.lines.length} in
          </span>
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
            <TableHead className="w-11 px-1 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              QR
            </TableHead>
            <TableHead className="w-[16%] px-1.5 text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Booking
            </TableHead>
            <TableHead className="w-7 px-0.5 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              AD
            </TableHead>
            <TableHead className="w-7 px-0.5 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              CH
            </TableHead>
            <TableHead className="w-7 px-0.5 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              INF
            </TableHead>
            <TableHead className="w-7 px-0.5 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              TL
            </TableHead>
            <TableHead className="w-[16%] px-1.5 text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Hotel
            </TableHead>
            <TableHead className="w-12 px-1 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Boat
            </TableHead>
            <TableHead className="w-10 px-1 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Park
            </TableHead>
            <TableHead className="w-[9%] px-1.5 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Status
            </TableHead>
            <TableHead
              className="w-[11%] px-1.5 text-[10px] font-bold tracking-wide text-teal-900/80 uppercase"
              title={isHelper ? 'Payment due' : 'Click an amount to mark it paid'}
            >
              Pay
            </TableHead>
            {isHelper ? null : (
              <>
                <TableHead className="w-[14%] px-1.5 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
                  Service
                </TableHead>
                <TableHead
                  className="w-12 px-1.5 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase"
                  title="Tick when the guest received their boat ticket"
                >
                  Ticket
                </TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.lines.map((line, index) => {
            const payment = bookingPayment(line.booking)
            const paid =
              getCheckInPayment(today, line.booking.program, line.booking.code) === 'paid'
            const ticketed =
              getCheckInTicket(today, line.booking.program, line.booking.code) === 'issued'
            const hotel = line.booking.pickupHotel || line.booking.pickupZone || '—'
            const expanded = Boolean(expandedCodes[line.key])
            const progressLabel = `${line.checkedInCount}/${line.bookingSeats}`
            const booked = line.originalPax
            const wholeNoShow = line.status === 'no-show'
            const partialNoShow = !wholeNoShow && hasPartialNoShow(booked, line.pax)
            const missingPax =
              Math.max(0, booked.adults - line.pax.adults) +
              Math.max(0, booked.children - line.pax.children) +
              Math.max(0, booked.infants - line.pax.infants) +
              Math.max(0, booked.tourLeaders - line.pax.tourLeaders)
            const services = getCheckInServices(
              today,
              line.booking.program,
              line.booking.code,
            )

            return (
              <TableRow
                key={line.key}
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={() => toggleExpanded(line.key)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggleExpanded(line.key)
                  }
                }}
                className={cn(
                  'cursor-pointer',
                  line.status === 'checked' && 'bg-emerald-50/40',
                  line.status === 'waiting' && 'bg-amber-50/30',
                  line.status === 'no-show' && 'bg-rose-50/40',
                  !isHelper && ticketed && 'bg-sky-50/40',
                )}
              >
                <TableCell className="px-1.5 align-top tabular-nums text-teal-900/45">
                  {index + 1}
                </TableCell>
                <TableCell
                  className="px-1 text-center align-top"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    aria-label={`Show check-in QR for ${line.leaderName || line.booking.code}`}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-teal-900/12 bg-white text-teal-800 shadow-sm transition-colors hover:bg-teal-50"
                    onClick={() => {
                      setQrCopied(false)
                      setQrBooking(line.booking)
                    }}
                  >
                    <QrCode className="size-3.5" />
                  </button>
                </TableCell>
                <TableCell className="max-w-0 whitespace-normal px-1.5 align-top">
                  <div className="flex items-start gap-1.5">
                    <ChevronDown
                      className={cn(
                        'mt-1 size-3.5 shrink-0 text-teal-900/40 transition-transform',
                        expanded && 'rotate-180',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-teal-950">
                        {line.leaderName || line.booking.code}
                        {line.split ? (
                          <span className="ml-1.5 text-[10px] font-semibold text-teal-700/55">
                            split
                          </span>
                        ) : null}
                      </p>
                      <p
                        className={cn(
                          'mt-0.5 text-[11px] font-medium tabular-nums',
                          line.status === 'checked'
                            ? 'text-emerald-800/80'
                            : line.status === 'no-show'
                              ? 'text-rose-800/80'
                              : 'text-amber-900/80',
                        )}
                      >
                        {wholeNoShow
                          ? 'Whole booking no-show'
                          : line.status === 'checked'
                            ? `Checked in · ${progressLabel}`
                            : partialNoShow
                              ? `Waiting · ${progressLabel} · pickup NS ${missingPax}`
                              : `Waiting · ${progressLabel}`}
                      </p>

                      {expanded ? (
                        <div className="mt-2 space-y-1.5 border-t border-teal-900/8 pt-2">
                          {partialNoShow || wholeNoShow ? (
                            <p className="text-[11px] text-teal-900/55">
                              Original {formatGuestPaxParts(booked)}
                              {partialNoShow ? ` · pickup NS ${missingPax}` : ''}
                            </p>
                          ) : null}
                          {line.guests.length > 0 ? (
                            line.guests.map((guest) => {
                              const details = [
                                guest.nationality,
                                guest.birthday ? formatShortDate(guest.birthday) : '',
                                guest.passportNumber,
                              ]
                                .filter(Boolean)
                                .join(' · ')
                              return (
                                <div key={guest.key} className="rounded-lg bg-white/70 px-2 py-1.5">
                                  <p className="truncate text-[12px] font-semibold text-teal-950">
                                    {guest.guestName}
                                    {guest.seats > 1 ? (
                                      <span className="ml-1 font-medium text-teal-900/45">
                                        · {guest.seats} seats
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="mt-0.5 truncate text-[10px] text-teal-900/50">
                                    {formatCheckInTime(guest.checkedInAt)}
                                    {formatCheckInTime(guest.checkedInAt) && details ? ' · ' : null}
                                    {details}
                                  </p>
                                </div>
                              )
                            })
                          ) : (
                            <p className="text-[11px] text-teal-900/45">No guests checked in yet.</p>
                          )}
                          {line.status === 'waiting' && line.checkedInCount < line.seatsTotal ? (
                            <p className="text-[11px] text-amber-900/70">
                              {line.seatsTotal - line.checkedInCount} seat
                              {line.seatsTotal - line.checkedInCount === 1 ? '' : 's'} still waiting
                            </p>
                          ) : null}
                          {isHelper ? null : (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-teal-800 underline-offset-2 hover:underline"
                              onClick={(event) => {
                                event.stopPropagation()
                                onSelectBooking(line.booking.code)
                              }}
                            >
                              Open booking
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-0.5 text-center align-top tabular-nums">
                  <PaxCount
                    original={booked.adults}
                    current={line.pax.adults}
                    wholeNoShow={wholeNoShow}
                  />
                </TableCell>
                <TableCell className="px-0.5 text-center align-top tabular-nums">
                  <PaxCount
                    original={booked.children}
                    current={line.pax.children}
                    wholeNoShow={wholeNoShow}
                  />
                </TableCell>
                <TableCell className="px-0.5 text-center align-top tabular-nums">
                  <PaxCount
                    original={booked.infants}
                    current={line.pax.infants}
                    wholeNoShow={wholeNoShow}
                  />
                </TableCell>
                <TableCell className="px-0.5 text-center align-top tabular-nums">
                  <PaxCount
                    original={booked.tourLeaders}
                    current={line.pax.tourLeaders}
                    wholeNoShow={wholeNoShow}
                  />
                </TableCell>
                <TableCell className="max-w-0 whitespace-normal px-1.5 align-top">
                  <p className="truncate text-teal-900/80" title={hotel}>
                    {hotel}
                  </p>
                </TableCell>
                <TableCell className="px-1 text-center align-top">
                  <BoatFleetBadge boat={line.boat} />
                </TableCell>
                <TableCell className="px-1 text-center align-top text-teal-900/70">
                  {formatIncludeShort(line.booking.parkFee)}
                </TableCell>
                <TableCell className="px-1.5 text-center align-top">
                  <StatusBadge status={line.status} />
                </TableCell>
                <TableCell
                  className="max-w-0 whitespace-normal px-1.5 align-top"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {payment.kind === 'none' ? (
                    <span className="text-teal-900/35">—</span>
                  ) : isHelper ? (
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        payment.kind === 'note' && 'text-[11px]',
                        paid
                          ? 'text-teal-900/45 line-through decoration-2 decoration-teal-900/45'
                          : 'text-orange-800',
                      )}
                      title={payment.label}
                    >
                      {payment.label}
                    </span>
                  ) : (
                    <PayableAmount
                      label={payment.label}
                      paid={paid}
                      disabled={wholeNoShow}
                      compact={payment.kind === 'note'}
                      onToggle={() =>
                        setCheckInPayment(
                          today,
                          line.booking.program,
                          line.booking.code,
                          paid ? null : 'paid',
                        )
                      }
                    />
                  )}
                </TableCell>
                {isHelper ? null : (
                <>
                <TableCell
                  className="px-1.5 align-top"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    aria-label={`Services for ${line.leaderName || line.booking.code}`}
                    className="grid min-h-8 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-lg border border-teal-900/12 bg-white px-1.5 py-1 text-left shadow-sm transition-colors hover:bg-teal-50"
                    onClick={() => setServiceBooking(line.booking)}
                  >
                    <span className="flex min-w-0 items-center gap-0.5">
                      {services.length === 0 ? (
                        <Plus className="size-3.5 text-teal-900/45" />
                      ) : (
                        CHECK_IN_SERVICE_KINDS.filter((kind) =>
                          services.some((item) => item.kind === kind),
                        ).map((kind) => (
                          <ServiceKindIcon key={kind} kind={kind} size="sm" />
                        ))
                      )}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-[10px] font-semibold tabular-nums',
                        services.length === 0
                          ? 'text-teal-900/30'
                          : services.every((item) => item.paid)
                            ? 'text-teal-900/45 line-through decoration-teal-900/40'
                            : 'text-orange-800',
                      )}
                    >
                      {services.length === 0
                        ? '—'
                        : `${services
                            .reduce((sum, item) => sum + serviceLineTotal(item), 0)
                            .toLocaleString('en-US')}`}
                    </span>
                  </button>
                </TableCell>
                <TableCell
                  className="px-1.5 text-center align-top"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {wholeNoShow ? (
                    <span
                      className="inline-flex rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800"
                      title="Whole booking no-show — do not give any ticket"
                    >
                      All NS
                    </span>
                  ) : (
                    <TicketToggle
                      issued={ticketed}
                      guestName={line.leaderName || line.booking.code}
                      onChange={(issued) =>
                        setCheckInTicket(
                          today,
                          line.booking.program,
                          line.booking.code,
                          issued ? 'issued' : null,
                        )
                      }
                    />
                  )}
                </TableCell>
                </>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <Dialog
        open={Boolean(qrBooking)}
        onOpenChange={(open) => {
          if (!open) {
            setQrBooking(null)
            setQrCopied(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle className="pr-8 font-display text-lg font-semibold text-teal-950">
              Check-in QR
            </DialogTitle>
            <DialogDescription className="text-teal-900/60">
              {qrBooking
                ? `${qrBooking.leadGuest} · ${qrBooking.code}`
                : 'Show this code to the guest.'}
            </DialogDescription>
          </DialogHeader>
          {qrBooking ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-2xl bg-white p-3 ring-1 ring-teal-900/10">
                {qrSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrSrc}
                    alt={`Check-in QR for ${qrBooking.leadGuest}`}
                    width={512}
                    height={512}
                    className="aspect-square h-auto w-full object-contain"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-sm text-teal-900/40">
                    Preparing QR…
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copyQrLink}>
                  {qrCopied ? (
                    <CheckCircle2 data-icon="inline-start" />
                  ) : (
                    <Copy data-icon="inline-start" />
                  )}
                  {qrCopied ? 'Copied' : 'Copy link'}
                </Button>
                {qrUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(qrUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink data-icon="inline-start" />
                    Open
                  </Button>
                ) : null}
              </div>
              <p className="break-all text-[11px] text-teal-900/40">{qrUrl}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {isHelper ? null : (
        <BookingServicesDialog
          booking={serviceBooking}
          today={today}
          open={Boolean(serviceBooking)}
          onOpenChange={(open) => {
            if (!open) setServiceBooking(null)
          }}
          services={
            serviceBooking
              ? getCheckInServices(today, serviceBooking.program, serviceBooking.code)
              : []
          }
          onSave={(next) => {
            if (!serviceBooking) return
            setCheckInServices(today, serviceBooking.program, serviceBooking.code, next)
          }}
        />
      )}
    </div>
  )
}

function ServiceKindIcon({
  kind,
  size = 'md',
}: {
  kind: CheckInServiceKind
  size?: 'sm' | 'md'
}) {
  const box = size === 'sm' ? 'size-6' : 'size-10'
  const icon = size === 'sm' ? 'size-3' : 'size-5'
  if (kind === 'share-longtail') {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full bg-sky-100 text-sky-800 ring-1 ring-sky-200/80',
          box,
        )}
        title={checkInServiceLabel(kind)}
      >
        <Users className={icon} />
      </span>
    )
  }
  if (kind === 'private-longtail') {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-900 ring-1 ring-amber-200/80',
          box,
        )}
        title={checkInServiceLabel(kind)}
      >
        <Ship className={icon} />
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-cyan-100 text-cyan-900 ring-1 ring-cyan-200/80',
        box,
      )}
      title={checkInServiceLabel(kind)}
    >
      <Waves className={icon} />
    </span>
  )
}

function BookingServicesDialog({
  booking,
  today,
  open,
  onOpenChange,
  services,
  onSave,
}: {
  booking: Booking | null
  today: string
  open: boolean
  onOpenChange: (open: boolean) => void
  services: CheckInServiceLine[]
  onSave: (services: CheckInServiceLine[]) => void
}) {
  const [draft, setDraft] = useState<CheckInServiceLine[]>([])
  const [kind, setKind] = useState<CheckInServiceKind>('share-longtail')
  const [people, setPeople] = useState('1')
  const [price, setPrice] = useState('')
  const bookingCode = booking?.code ?? ''

  // Snapshot services only when the dialog opens — avoid resetting while typing
  // (parent re-renders / poll give `services` a new array reference each time).
  useEffect(() => {
    if (!open) return
    setDraft(services)
    setKind('share-longtail')
    setPeople('1')
    setPrice('')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open snapshot
  }, [open, bookingCode])

  function addService() {
    const nextPeople = Math.max(1, Math.floor(Number(people) || 1))
    const nextPrice = Math.max(0, Math.floor(Number(price) || 0))
    setDraft((current) => [
      ...current,
      {
        id: newCheckInServiceId(),
        kind,
        people: nextPeople,
        pricePerPerson: nextPrice,
        paid: false,
      },
    ])
    setPeople('1')
    setPrice('')
  }

  function updateLine(id: string, patch: Partial<CheckInServiceLine>) {
    setDraft((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  function removeLine(id: string) {
    setDraft((current) => current.filter((item) => item.id !== id))
  }

  const peopleCount = Math.max(0, Math.floor(Number(people) || 0))
  const priceAmount = Math.max(0, Math.floor(Number(price) || 0))
  const addLineTotal = peopleCount * priceAmount
  const total = draft.reduce((sum, item) => sum + serviceLineTotal(item), 0)
  const unpaidTotal = draft
    .filter((item) => !item.paid)
    .reduce((sum, item) => sum + serviceLineTotal(item), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle className="pr-8 font-display text-lg font-semibold text-teal-950">
            Booking services
          </DialogTitle>
          <DialogDescription className="text-teal-900/60">
            {booking
              ? `${booking.leadGuest} · ${booking.code} · ${formatShortDate(today)}`
              : 'Add longtail or scuba for this booking.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {CHECK_IN_SERVICE_KINDS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center transition-all',
                  kind === option
                    ? 'border-teal-700 bg-teal-50 ring-1 ring-teal-700'
                    : 'border-teal-900/10 bg-white hover:border-teal-700/30',
                )}
              >
                <ServiceKindIcon kind={option} />
                <span className="text-[11px] font-semibold leading-tight text-teal-950">
                  {checkInServiceLabel(option)}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="service-people">People</Label>
              <Input
                id="service-people"
                inputMode="numeric"
                value={people}
                onChange={(event) => setPeople(event.target.value.replace(/[^\d]/g, ''))}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-price">Price / person (THB)</Label>
              <Input
                id="service-price"
                inputMode="numeric"
                value={price}
                onChange={(event) => setPrice(event.target.value.replace(/[^\d]/g, ''))}
                className="h-10"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-teal-950/[0.04] px-3.5 py-2.5 text-sm">
            <span className="text-teal-900/60">This line total</span>
            <span className="font-semibold tabular-nums text-teal-950">
              {addLineTotal.toLocaleString('en-US')} THB
            </span>
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={addService}>
            <Plus data-icon="inline-start" />
            Add {checkInServiceLabel(kind)}
          </Button>

          <div className="space-y-2">
            {draft.length === 0 ? (
              <p className="rounded-xl bg-teal-950/[0.04] px-3 py-3 text-sm text-teal-900/55">
                No services yet for this booking.
              </p>
            ) : (
              draft.map((line) => (
                <div
                  key={line.id}
                  className="flex items-start gap-3 rounded-2xl border border-teal-900/10 bg-white px-3 py-2.5"
                >
                  <ServiceKindIcon kind={line.kind} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-teal-950">
                      {checkInServiceLabel(line.kind)}
                    </p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-teal-900/55">
                      {line.people} pax · {line.pricePerPerson.toLocaleString('en-US')} THB each ·{' '}
                      <PayableAmount
                        label={`${serviceLineTotal(line).toLocaleString('en-US')} THB`}
                        paid={line.paid}
                        className="inline text-[11px]"
                        onToggle={() => updateLine(line.id, { paid: !line.paid })}
                      />
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-teal-900/55">
                      {line.paid ? 'Paid — click the amount to undo' : 'Click the amount to mark paid'}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${checkInServiceLabel(line.kind)}`}
                    className="rounded-lg p-1.5 text-teal-900/35 transition-colors hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => removeLine(line.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {draft.length > 0 ? (
            <div className="space-y-1 rounded-xl border border-teal-900/10 bg-white px-3.5 py-3 text-sm">
              <div className="flex items-center justify-between tabular-nums">
                <span className="text-teal-900/55">Services total</span>
                <span className="font-semibold text-teal-950">
                  {total.toLocaleString('en-US')} THB
                </span>
              </div>
              <div className="flex items-center justify-between tabular-nums">
                <span className="text-teal-900/55">Still to pay</span>
                <span
                  className={cn(
                    'font-semibold',
                    unpaidTotal > 0 ? 'text-orange-800' : 'text-emerald-800',
                  )}
                >
                  {unpaidTotal.toLocaleString('en-US')} THB
                </span>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onSave(draft)
                onOpenChange(false)
              }}
            >
              Save services
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TicketToggle({
  issued,
  guestName,
  onChange,
}: {
  issued: boolean
  guestName: string
  onChange: (issued: boolean) => void
}) {
  const [on, setOn] = useState(issued)

  useEffect(() => {
    setOn(issued)
  }, [issued])

  function toggle() {
    const next = !on
    setOn(next)
    startTransition(() => onChange(next))
  }

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`Boat ticket given for ${guestName}`}
      title={
        on
          ? 'Boat ticket given — click to undo'
          : 'Click when the guest received their boat ticket'
      }
      className={cn(
        'inline-flex h-11 w-full items-center justify-center rounded-lg border transition-colors',
        on
          ? 'border-sky-300 bg-sky-100 text-sky-800'
          : 'border-teal-900/15 bg-white text-teal-900/30 hover:border-teal-700/30 hover:bg-teal-50',
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        toggle()
      }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        toggle()
      }}
    >
      <Check className="size-4" strokeWidth={on ? 2.75 : 2} />
    </button>
  )
}

function PayableAmount({
  label,
  paid,
  disabled,
  compact,
  onToggle,
  className,
}: {
  label: string
  paid: boolean
  disabled?: boolean
  compact?: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={paid}
      aria-label={paid ? `Mark ${label} as unpaid` : `Mark ${label} as paid`}
      title={
        disabled
          ? label
          : paid
            ? 'Paid — click to undo'
            : 'Click to mark paid'
      }
      className={cn(
        'max-w-full truncate text-left font-semibold tabular-nums transition-colors disabled:cursor-not-allowed',
        compact && 'text-[11px]',
        paid
          ? 'text-teal-900/45 line-through decoration-2 decoration-teal-900/45'
          : 'text-orange-800 hover:text-orange-950',
        disabled && 'text-teal-900/35 no-underline',
        className,
      )}
      onClick={onToggle}
    >
      {label}
    </button>
  )
}

function PaxCount({
  original,
  current,
  wholeNoShow = false,
}: {
  original: number
  current: number
  wholeNoShow?: boolean
}) {
  const bookedCount = Math.max(original, current)
  if (wholeNoShow && bookedCount > 0) {
    return (
      <span className="inline-flex flex-col items-center leading-none">
        <span>{bookedCount}</span>
        <span className="mt-0.5 text-[10px] font-semibold text-orange-700">-all</span>
      </span>
    )
  }
  const missing = original - current
  if (missing <= 0) return <>{current || ''}</>
  return (
    <span className="inline-flex flex-col items-center leading-none">
      <span>{original}</span>
      <span className="mt-0.5 text-[10px] font-semibold text-orange-700">-{missing}</span>
    </span>
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
      <span
        className="inline-flex rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800"
        title="Whole booking no-show"
      >
        All NS
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
