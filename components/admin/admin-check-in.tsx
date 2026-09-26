'use client'

import { Fragment, startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Search,
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
import { NationalityCombobox } from '@/components/check-in/nationality-combobox'
import {
  enrolledSeatCount,
  guestDisplayName,
  type CheckInEnrollment,
} from '@/lib/check-in-enrollment'
import { matchNationality } from '@/lib/nationalities'
import {
  isEnglishName,
  isEnglishPassport,
  sanitizeEnglishName,
  sanitizeEnglishPassport,
} from '@/lib/check-in-i18n'
import {
  SEQUENCE_START_PRESETS,
  formatSequenceRange,
  sequenceBoardLabel,
  sequenceForSeatOffset,
  type GuestSequenceBlock,
} from '@/lib/check-in-sequence'
import { formatGuestPaxParts, hasPartialNoShow, originalBookedPax } from '@/lib/check-in-booked-pax'
import {
  DEFAULT_HELPER_BOARD_HOURS,
  helperBoardHoursValid,
  helperBoardIssueDate,
  helperBoardQrImageUrl,
  helperBoardUrl,
  isHelperBoardClosed,
  isHelperBoardNotYetOpen,
  isHelperBoardOpen,
  loadHelperBoardHours,
  saveHelperBoardHours,
  type HelperBoardHours,
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
  summarizeCheckInServices,
  type CheckInServiceKind,
  type CheckInServiceKindSummary,
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
  bookingPaxOnVan,
  listVanNumbers,
  paxBreakdownTotal,
  primaryVan,
  sortOrderOnVan,
  type PaxBreakdown,
} from '@/lib/vehicle-assign'
import { canFitBookingOnBoat } from '@/lib/boat-load'
import { boatThemeFor } from '@/lib/boat-theme'
import { cn } from '@/lib/utils'
import {
  boatDisplayName,
  boatNumbersForPlan,
  bookingOnPartnerBoat,
  bookingTransferKind,
  DUMMY_VAN_LABEL,
  isActiveBooking,
  isDummyVan,
  isPartnerBoat,
  isNoTransfer,
  totalPassengers,
  vanOutsourceLabel,
  vanTransferKind,
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
  showBookingMoney: boolean
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
  dummy: boolean
  lines: BookingLine[]
  checked: number
  waiting: number
  noShow: number
  seatsTotal: number
}

function programLabel(program: Program) {
  return program === 'PP' ? 'Phi Phi' : 'James Bond'
}

function normalizeBoardQuery(value: string) {
  return value.trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ')
}

function sequenceMatchesQuery(block: GuestSequenceBlock | null | undefined, query: string) {
  if (!block) return false
  const range = formatSequenceRange(block.start, block.end).toLowerCase().replace(/[–—]/g, '-')
  if (range.includes(query) || query.includes(range)) return true
  const asNum = Number.parseInt(query, 10)
  if (Number.isFinite(asNum) && query === String(asNum) && asNum >= block.start && asNum <= block.end) {
    return true
  }
  const parts = query.match(/^(\d+)\s*-\s*(\d+)$/)
  if (!parts) return false
  const from = Number(parts[1])
  const to = Number(parts[2])
  return from <= block.end && to >= block.start
}

function lineMatchesBoardQuery(
  line: BookingLine,
  block: GuestSequenceBlock | null | undefined,
  query: string,
) {
  const q = normalizeBoardQuery(query)
  if (!q) return true
  if (sequenceMatchesQuery(block, q)) return true
  const hotel = `${line.booking.pickupHotel} ${line.booking.pickupZone}`.toLowerCase()
  if (hotel.includes(q)) return true
  if (line.leaderName.toLowerCase().includes(q)) return true
  if (line.booking.leadGuest.toLowerCase().includes(q)) return true
  if (line.booking.code.toLowerCase().includes(q)) return true
  return line.guests.some((guest) => guest.guestName.toLowerCase().includes(q))
}

function driverGroupTitle(group: DriverGroup, showProgram: boolean) {
  const program = showProgram ? `${programLabel(group.program)} · ` : ''
  if (group.dummy) {
    const company = group.outsourceCompany.trim()
    return `${program}${company || 'Tour partner'}`
  }
  if (group.van !== null) return `${program}Van ${group.van}`
  if (group.id.includes('no-transfer')) return `${program}No Transfer`
  return `${program}Unassigned / no van`
}

function vanGroupPlate(group: DriverGroup) {
  if (group.dummy) return group.outsourceCompany.trim() || 'Tour partner'
  const plate = group.plate?.trim()
  if (plate) return plate
  if (group.van !== null) return `Van ${group.van}`
  if (group.id.includes('no-transfer')) return 'No Transfer'
  return 'Unassigned / no van'
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

  const split = (legs?.length ?? 0) > 1
  return {
    key: van !== null ? `${booking.code}-van-${van}` : booking.code,
    booking,
    van,
    split,
    showBookingMoney: !split || van === primaryVan(legs),
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
  const [hours, setHours] = useState<HelperBoardHours>(DEFAULT_HELPER_BOARD_HOURS)
  const hoursOk = helperBoardHoursValid(hours)
  const issueDate = helperBoardIssueDate(now, hours)
  const today = todayISO(now)
  const todayClosed = isHelperBoardClosed(today, now, hours)
  const todayNotOpen = isHelperBoardNotYetOpen(today, now, hours)
  const todayOpen = isHelperBoardOpen(today, now, hours)
  const helperUrl = origin && hoursOk ? helperBoardUrl(origin, issueDate, hours) : ''
  const qrSrc = origin && hoursOk ? helperBoardQrImageUrl(origin, issueDate, 512, hours) : ''

  useEffect(() => {
    setOrigin(window.location.origin)
    setHours(loadHelperBoardHours())
    const id = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(id)
  }, [])

  function updateHours(patch: Partial<HelperBoardHours>) {
    setHours((current) => saveHelperBoardHours({ ...current, ...patch }))
  }

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
          QR codes and see hotel, boat, and pay. Service and ticket stay admin-only.
        </p>

        <div className="mt-4 grid w-full grid-cols-2 gap-3 text-left">
          <div className="space-y-1.5">
            <Label htmlFor="helper-qr-open">Open QR</Label>
            <Input
              id="helper-qr-open"
              type="time"
              value={hours.open}
              onChange={(event) => updateHours({ open: event.target.value })}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="helper-qr-close">Close QR</Label>
            <Input
              id="helper-qr-close"
              type="time"
              value={hours.close}
              onChange={(event) => updateHours({ close: event.target.value })}
              className="h-10"
            />
          </div>
        </div>
        <p className="mt-2 w-full text-left text-[11px] leading-relaxed text-teal-800/60">
          Helpers can open this board from {hours.open} until {hours.close} Thailand time on{' '}
          {formatLongDate(issueDate)}. After {hours.close} the page locks and cannot be opened again.
        </p>
        {!hoursOk ? (
          <p className="mt-2 w-full rounded-xl bg-rose-50 px-3 py-2 text-left text-xs font-medium text-rose-900">
            Close QR must be later than Open QR.
          </p>
        ) : todayClosed ? (
          <p className="mt-2 w-full rounded-xl bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-900">
            Today’s helper board closed at {hours.close}. This QR is for tomorrow — it opens at{' '}
            {hours.open}.
          </p>
        ) : todayNotOpen ? (
          <p className="mt-2 w-full rounded-xl bg-sky-50 px-3 py-2 text-left text-xs font-medium text-sky-950">
            Helper board opens at {hours.open} Thailand time. This QR is ready to share now.
          </p>
        ) : todayOpen ? (
          <p className="mt-2 w-full rounded-xl bg-teal-50 px-3 py-2 text-left text-xs font-medium text-teal-900">
            Helper board is open now. It closes at {hours.close} Thailand time.
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
    getGuestSequences,
    getCheckInServices,
    setCheckInSequenceBookingStart,
    hydrated,
  } = usePortal()

  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [helperGroupId, setHelperGroupId] = useState<string | null>(null)
  const [boardQuery, setBoardQuery] = useState('')
  const [boardView, setBoardView] = useState<'check-in' | 'partner'>('check-in')
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
      const vanNums = listVanNumbers(plan.assignments)
      const placed = new Set<string>()

      for (const van of vanNums) {
        const vanBookings = programBookings
          .filter((b) => bookingPaxOnVan(b, plan.assignments[b.code], van) > 0)
          .sort(
            (a, b) =>
              sortOrderOnVan(plan.assignments[a.code], van) -
                sortOrderOnVan(plan.assignments[b.code], van) ||
              a.leadGuest.localeCompare(b.leadGuest),
          )
        if (vanBookings.length === 0) continue
        const meta = resolveVanMeta(van, plan.vanMeta[String(van)])
        const sentOut = vanTransferKind(van, meta) === 'partner' || isDummyVan(van)
        for (const booking of vanBookings) placed.add(booking.code)
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
              outsourceCompany: meta.outsourceCompany?.trim() || meta.label?.trim() || '',
              sentOut,
            },
          ),
        )
      }

      const leftoverPartner = programBookings.filter(
        (booking) =>
          !placed.has(booking.code) &&
          (bookingTransferKind(booking, plan, boatPlan) === 'partner' ||
            bookingOnPartnerBoat(boatPlan, booking.code)),
      )
      if (leftoverPartner.length > 0) {
        for (const booking of leftoverPartner) placed.add(booking.code)
        result.push(
          makeDriverGroup(
            `${program}-tour-partner`,
            program,
            null,
            '',
            '',
            '',
            leftoverPartner,
            boardDate,
            boatPlan.assignments,
            plan.assignments,
            getCheckInEnrollments,
            getCheckInAttendance,
            { sentOut: true, outsourceCompany: 'Tour partner' },
          ),
        )
      }

      const unassigned = programBookings.filter(
        (b) =>
          !placed.has(b.code) &&
          !isNoTransfer(b.pickupZone) &&
          primaryVan(plan.assignments[b.code]) === null,
      )
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

      const noTransfer = programBookings.filter(
        (b) => !placed.has(b.code) && isNoTransfer(b.pickupZone),
      )
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
      if (group.dummy) continue
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

  const [dayServicesOpen, setDayServicesOpen] = useState(false)

  const dayServiceDetails = useMemo(() => {
    const rows: DayServiceDetail[] = []
    const seen = new Set<string>()
    for (const group of groups) {
      if (group.dummy) continue
      for (const line of group.lines) {
        if (seen.has(line.booking.code)) continue
        seen.add(line.booking.code)
        const services = getCheckInServices(boardDate, line.booking.program, line.booking.code)
        for (const service of services) {
          rows.push({
            id: service.id,
            bookingCode: line.booking.code,
            bookingName: line.leaderName || line.booking.code,
            hotel: line.booking.pickupHotel || line.booking.pickupZone || '—',
            boat: line.boat,
            kind: service.kind,
            people: service.people,
            total: serviceLineTotal(service),
            paid: service.paid,
          })
        }
      }
    }
    return rows.sort(
      (a, b) =>
        Number(a.paid) - Number(b.paid) ||
        a.hotel.localeCompare(b.hotel) ||
        a.bookingName.localeCompare(b.bookingName),
    )
  }, [boardDate, getCheckInServices, groups])

  const dayServiceSummary = useMemo(
    () =>
      summarizeCheckInServices(
        dayServiceDetails.map((row) => ({
          id: row.id,
          kind: row.kind,
          people: row.people,
          pricePerPerson: row.people > 0 ? Math.round(row.total / row.people) : 0,
          paid: row.paid,
        })),
      ),
    [dayServiceDetails],
  )

  function selectDate(date: Date | undefined) {
    if (!date) return
    onBoardDateChange(toISODate(date))
    setSelectedCode(null)
    setBoardView('check-in')
    setCalendarOpen(false)
  }

  const regularGroups = useMemo(() => groups.filter((group) => !group.dummy), [groups])
  const dummyGroups = useMemo(() => groups.filter((group) => group.dummy), [groups])
  const dummyBookingCount = useMemo(
    () => dummyGroups.reduce((count, group) => count + group.lines.length, 0),
    [dummyGroups],
  )
  const dummyPaxCount = useMemo(
    () => dummyGroups.reduce((sum, group) => sum + group.seatsTotal, 0),
    [dummyGroups],
  )

  const visibleGroups = useMemo(() => {
    const source = !isHelper && boardView === 'partner' ? dummyGroups : regularGroups
    if (!isHelper) return source
    const selected =
      regularGroups.find((group) => group.id === helperGroupId) ?? regularGroups[0]
    return selected ? [selected] : []
  }, [boardView, dummyGroups, regularGroups, helperGroupId, isHelper])

  const listedGroups = useMemo(() => {
    const query = boardQuery.trim()
    if (!query) return visibleGroups
    return visibleGroups.filter((group) => {
      const sequences = getGuestSequences(boardDate, group.program)
      return group.lines.some((line) =>
        lineMatchesBoardQuery(line, sequences[line.booking.code], query),
      )
    })
  }, [boardDate, boardQuery, getGuestSequences, visibleGroups])

  const activeHelperGroupId = visibleGroups[0]?.id ?? null

  if (!hydrated) {
    return (
      <div className="gday-sheet rounded-[1.5rem] p-8 text-center text-sm text-teal-900/50">
        Loading check-in board…
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {isHelper ? (
            <p className="hidden rounded-xl bg-white px-3 py-2 text-sm font-semibold text-teal-950 ring-1 ring-teal-900/10 sm:block">
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
          {!isHelper ? (
            <div className="flex flex-1 gap-1 rounded-2xl bg-teal-950/[0.04] p-1 sm:flex-none sm:gap-1.5">
              <button
                type="button"
                onClick={() => setBoardView('check-in')}
                className={cn(
                  'min-h-9 flex-1 rounded-xl px-2.5 py-1.5 text-[13px] font-semibold transition-all sm:min-h-0 sm:flex-none sm:px-3 sm:py-2 sm:text-sm',
                  boardView === 'check-in'
                    ? 'bg-white text-teal-950 shadow-sm'
                    : 'text-teal-900/55 hover:text-teal-950',
                )}
              >
                Check-in
              </button>
              <button
                type="button"
                onClick={() => setBoardView('partner')}
                className={cn(
                  'min-h-9 flex-1 rounded-xl px-2.5 py-1.5 text-[13px] font-semibold transition-all sm:min-h-0 sm:flex-none sm:px-3 sm:py-2 sm:text-sm',
                  boardView === 'partner'
                    ? 'bg-white text-teal-950 shadow-sm'
                    : 'text-teal-900/55 hover:text-teal-950',
                )}
              >
                Tour partner
                {dummyBookingCount > 0 ? (
                  <span className="ml-1.5 text-[11px] font-medium tabular-nums text-teal-900/45">
                    {dummyBookingCount}
                  </span>
                ) : null}
              </button>
            </div>
          ) : null}
          <div className="flex flex-1 gap-1 rounded-2xl bg-teal-950/[0.04] p-1 sm:flex-none sm:gap-1.5">
            {(
              [
                ['all', 'All programs', 'All'],
                ['PP', 'Phi Phi', 'Phi Phi'],
                ['James Bond', 'James Bond', 'JB'],
              ] as const
            ).map(([value, label, shortLabel]) => (
              <button
                key={value}
                type="button"
                onClick={() => onProgramFilter(value)}
                className={cn(
                  'min-h-9 flex-1 rounded-xl px-2.5 py-1.5 text-[13px] font-semibold transition-all sm:min-h-0 sm:flex-none sm:px-3 sm:py-2 sm:text-sm',
                  programFilter === value
                    ? 'bg-white text-teal-950 shadow-sm'
                    : 'text-teal-900/55 hover:text-teal-950',
                )}
              >
                <span className="sm:hidden">{shortLabel}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          {groups.length > 0 ? (
            <CheckInSearchField value={boardQuery} onChange={setBoardQuery} />
          ) : null}
        </div>
        {boardView === 'partner' && !isHelper ? (
          <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold sm:gap-2 sm:text-xs">
            <StatPill tone="teal" label="Partner bookings" shortLabel="Bk" value={dummyBookingCount} />
            <StatPill tone="teal" label="Partner pax" shortLabel="Pax" value={dummyPaxCount} />
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold sm:gap-2 sm:text-xs">
            <StatPill tone="emerald" label="Checked in" shortLabel="In" value={summary.checked} />
            <StatPill tone="amber" label="Waiting" shortLabel="Wait" value={summary.waiting} />
            <StatPill tone="rose" label="No-show" shortLabel="NS" value={summary.noShow} />
            <StatPill tone="teal" label="Total seats" shortLabel="Total" value={summary.total} />
          </div>
        )}
      </div>

      {!isHelper && boardView === 'check-in' ? (
        <DayServiceSummary rows={dayServiceSummary} onOpen={() => setDayServicesOpen(true)} />
      ) : null}
      {!isHelper && boardView === 'partner' ? (
        <p className="rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-700">
          Tour partner vans are listed for detail only — no marina check-in, QR, or ticket.
        </p>
      ) : null}

      {isHelper && regularGroups.length > 0 ? (
        <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:thin] sm:mx-0 sm:overflow-visible sm:px-0">
          <div className="flex w-max min-w-full gap-1.5 rounded-2xl bg-teal-950/[0.04] p-1 sm:w-auto sm:flex-wrap">
            {regularGroups.map((group) => {
              const active = group.id === activeHelperGroupId
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setHelperGroupId(group.id)}
                  className={cn(
                    'min-h-9 shrink-0 rounded-xl px-2.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-all sm:min-h-0 sm:px-3 sm:py-2 sm:text-sm',
                    active
                      ? 'bg-white text-teal-950 shadow-sm'
                      : 'text-teal-900/55 hover:text-teal-950',
                  )}
                >
                  {vanGroupPlate(group)}
                  <span className="ml-1.5 text-[11px] font-medium text-teal-900/45 sm:text-xs">
                    {group.seatsTotal}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div className="gday-sheet rounded-[1.5rem] p-8 text-center text-sm text-teal-900/55">
          No active bookings for {formatLongDate(boardDate)}
          {programFilter === 'all' ? '' : ` · ${programLabel(programFilter)}`}.
        </div>
      ) : (
        <div className="space-y-4">
          {listedGroups.length === 0 ? (
            <div className="gday-sheet rounded-[1.5rem] px-4 py-8 text-center text-sm text-teal-900/55 sm:px-5">
              {boardQuery.trim()
                ? `No bookings match “${boardQuery.trim()}”.`
                : boardView === 'partner'
                  ? 'No tour partner bookings for this day.'
                  : dummyGroups.length > 0
                    ? 'No vans to check in here. Open Tour partner to see sent-out bookings.'
                    : 'No van groups to show.'}
            </div>
          ) : (
            listedGroups.map((group) => (
              <DriverGroupCard
                key={group.id}
                group={group}
                showProgram={programFilter === 'all'}
                today={boardDate}
                origin={origin}
                variant={variant}
                sequences={getGuestSequences(boardDate, group.program)}
                searchQuery={boardQuery}
                onSetBookingSequenceStart={
                  isHelper || group.dummy
                    ? undefined
                    : (code, start) =>
                        setCheckInSequenceBookingStart(boardDate, group.program, code, start)
                }
                onSelectBooking={(code) => {
                  if (!isHelper) setSelectedCode(code)
                }}
              />
            ))
          )}
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

      <DayServicesDialog
        open={dayServicesOpen}
        onOpenChange={setDayServicesOpen}
        dateLabel={formatShortDate(boardDate)}
        rows={dayServiceDetails}
      />
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

function CheckInBoatPicker({
  booking,
  date,
  boat,
  disabled,
  compact,
}: {
  booking: Booking
  date: string
  boat: number | null
  disabled?: boolean
  compact?: boolean
}) {
  const { getDayBoatPlan, assignBookingToBoat, bookings, getCheckInAttendance } = usePortal()
  const [open, setOpen] = useState(false)
  const holdTimer = useRef<number | null>(null)
  const openedByHold = useRef(false)
  const plan = getDayBoatPlan(date, booking.program)
  const boats = boatNumbersForPlan(plan)
  const dayBookings = useMemo(
    () =>
      bookings.filter(
        (item) =>
          isActiveBooking(item) &&
          item.date === date &&
          item.program === booking.program &&
          getCheckInAttendance(date, item.program, item.code) !== 'no-show',
      ),
    [bookings, date, booking.program, getCheckInAttendance],
  )
  const need = totalPassengers(booking)
  const badge = (
    <BoatFleetBadge
      boat={boat}
      plan={plan}
      className={
        compact ? 'min-w-6 px-1 py-0.5 text-[11px] font-bold' : 'px-1.5 py-0.5 text-sm font-bold'
      }
    />
  )

  function clearHold() {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  if (disabled) return badge

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) openedByHold.current = false
        setOpen(next)
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex rounded-md outline-none hover:ring-1 hover:ring-teal-700/20 focus-visible:ring-2 focus-visible:ring-teal-600/40"
            title="Click or hold to change boat for this booking only"
            aria-label={`Change boat for ${booking.code}`}
            onPointerDown={(event) => {
              event.stopPropagation()
              openedByHold.current = false
              clearHold()
              holdTimer.current = window.setTimeout(() => {
                openedByHold.current = true
                setOpen(true)
              }, 400)
            }}
            onPointerUp={clearHold}
            onPointerLeave={clearHold}
            onPointerCancel={clearHold}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              if (openedByHold.current) {
                event.preventDefault()
                openedByHold.current = false
              }
            }}
            onKeyDown={(event) => event.stopPropagation()}
          />
        }
      >
        {badge}
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-56 p-2"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-semibold text-teal-950">Move {booking.code}</p>
        <p className="mt-0.5 text-[10px] leading-snug text-teal-900/50">
          {need} pax · this booking only, not the whole van
        </p>
        <div className="mt-2 space-y-1">
          {boats.map((target) => {
            const fit = canFitBookingOnBoat(plan, dayBookings, target, booking)
            const selected = boat === target
            const fits = selected || fit.ok
            return (
              <button
                key={target}
                type="button"
                disabled={!fits}
                onClick={() => {
                  if (!selected) {
                    assignBookingToBoat(date, booking.program, booking.code, target)
                  }
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold',
                  selected
                    ? boatThemeFor(plan, target).softBadge
                    : fits
                      ? 'bg-teal-50 text-teal-950 hover:bg-teal-100'
                      : 'cursor-not-allowed bg-neutral-50 text-neutral-400',
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  <BoatFleetBadge boat={target} plan={plan} className="px-1 py-0 text-[11px]" />
                  {boatDisplayName(plan, target)}
                </span>
                <span className="tabular-nums font-medium">
                  {selected
                    ? 'Current'
                    : isPartnerBoat(plan, target)
                      ? 'Partner'
                      : fits
                      ? `${fit.remaining} left`
                      : `Need ${fit.need} · ${Math.max(0, fit.remaining)} left`}
                </span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
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
  outsource?: { outsourced?: boolean; outsourceCompany?: string; sentOut?: boolean },
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
    dummy: outsource?.sentOut === true || isDummyVan(van),
    lines,
    checked,
    waiting,
    noShow,
    seatsTotal,
  }
}

function CheckInSearchField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative w-full min-w-0 sm:min-w-[14rem] sm:w-[20rem]">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-teal-900/35" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Seq, hotel, or guest name"
        className="h-10 pl-8 text-base sm:h-9 sm:text-sm"
        aria-label="Search sequence, hotel, or guest name"
      />
    </div>
  )
}

function DriverGroupCard({
  group,
  showProgram,
  today,
  origin,
  onSelectBooking,
  variant = 'admin',
  sequences,
  searchQuery,
  onSetBookingSequenceStart,
}: {
  group: DriverGroup
  showProgram: boolean
  today: string
  origin: string
  onSelectBooking: (code: string) => void
  variant?: CheckInBoardVariant
  sequences: Record<string, GuestSequenceBlock>
  searchQuery: string
  onSetBookingSequenceStart?: (bookingCode: string, start: number | null) => void
}) {
  const isHelper = variant === 'helper'
  const {
    getDayBoatPlan,
    getCheckInPayment,
    setCheckInPayment,
    getCheckInTicket,
    setCheckInTicket,
    getCheckInServices,
    setCheckInServices,
    getCheckInNote,
    setCheckInNote,
  } = usePortal()
  const boatPlan = getDayBoatPlan(today, group.program)
  const groupSentOut = group.dummy
  const [expandedCodes, setExpandedCodes] = useState<Record<string, boolean>>({})
  const [addingNote, setAddingNote] = useState<Record<string, boolean>>({})
  const [qrBooking, setQrBooking] = useState<Booking | null>(null)
  const [qrCopied, setQrCopied] = useState(false)
  const [editBooking, setEditBooking] = useState<Booking | null>(null)
  const [serviceBooking, setServiceBooking] = useState<Booking | null>(null)
  const title = driverGroupTitle(group, showProgram)
  const visibleLines = useMemo(() => {
    if (!searchQuery.trim()) return group.lines
    return group.lines.filter((line) =>
      lineMatchesBoardQuery(line, sequences[line.booking.code], searchQuery),
    )
  }, [group.lines, searchQuery, sequences])

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
    <div className="gday-sheet overflow-hidden rounded-[1.25rem] sm:rounded-[1.5rem]">
      <div className="flex items-start justify-between gap-2 border-b border-teal-900/8 bg-gradient-to-r from-teal-50 to-white px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="min-w-0">
          <p
            className={cn(
              'font-semibold text-teal-950',
              isHelper ? 'font-display text-[17px] sm:text-xl' : 'font-display text-base sm:text-lg',
            )}
          >
            {group.dummy ? (
              <>
                <span className="tracking-wide">
                  {group.outsourceCompany.trim() || DUMMY_VAN_LABEL}
                </span>
                <span className="ml-2 inline-flex rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-neutral-700 uppercase">
                  Tour partner
                </span>
              </>
            ) : group.van !== null ? (
              <>
                <span className="tracking-wide">{group.plate?.trim() || 'No plate'}</span>
                {group.driver.trim() ? (
                  <span className="ml-2 font-medium text-teal-900/80">
                    {group.driver}
                  </span>
                ) : null}
              </>
            ) : (
              title
            )}
            {group.outsourced ? (
              <span className="ml-2 inline-flex rounded-md bg-violet-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-violet-900 uppercase">
                {vanOutsourceLabel(group)}
              </span>
            ) : null}
          </p>
          {group.dummy ? (
            <p className="mt-0.5 text-[12px] leading-snug text-neutral-600 sm:text-xs">
              Partner picks guests up · details only · no marina check-in
            </p>
          ) : group.van !== null ? (
            <p className="mt-0.5 text-[12px] leading-snug text-teal-900/60 sm:text-xs">
              <span className="font-medium text-teal-950">Van {group.van}</span>
              {group.phone ? (
                <>
                  <span className="mx-1.5 text-teal-900/25">·</span>
                  <a
                    href={`tel:${group.phone.replace(/\s+/g, '')}`}
                    className="font-medium text-teal-800 underline-offset-2 hover:underline"
                  >
                    {group.phone}
                  </a>
                </>
              ) : null}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] text-teal-900/55 sm:text-xs">
              Guests without a van assignment or with no hotel transfer.
            </p>
          )}
        </div>
        <p className="shrink-0 rounded-full border border-teal-900/10 bg-white/90 px-2 py-1 text-[11px] font-medium tabular-nums text-teal-800/70 sm:px-2.5 sm:text-xs">
          {visibleLines.length} bk · {group.seatsTotal} pax
          <span className="text-teal-900/40">
            {' '}
            · {visibleLines.filter((line) => line.status === 'checked').length}/{visibleLines.length} in
          </span>
        </p>
      </div>

      <div className="divide-y divide-teal-900/8 md:hidden">
        {visibleLines.map((line) => {
          const payment = bookingPayment(line.booking)
          const sequence = sequences[line.booking.code] ?? null
          const paid =
            getCheckInPayment(today, line.booking.program, line.booking.code) === 'paid'
          const ticketed =
            getCheckInTicket(today, line.booking.program, line.booking.code) === 'issued'
          const hotel = line.booking.pickupHotel || line.booking.pickupZone || '—'
          const expanded = Boolean(expandedCodes[line.key])
          const progressLabel = `${line.checkedInCount}/${line.bookingSeats}`
          const booked = line.originalPax
          const wholeNoShow = line.status === 'no-show'
          const sequenceLabel = sequenceBoardLabel(sequence, {
            checkedInCount: line.checkedInCount,
            fullyChecked: line.status === 'checked',
            noShow: wholeNoShow,
          })
          const partialNoShow = !wholeNoShow && hasPartialNoShow(booked, line.pax)
          const missingPax =
            Math.max(0, booked.adults - line.pax.adults) +
            Math.max(0, booked.children - line.pax.children) +
            Math.max(0, booked.infants - line.pax.infants) +
            Math.max(0, booked.tourLeaders - line.pax.tourLeaders)
          const services = getCheckInServices(today, line.booking.program, line.booking.code)
          const sentOut =
            groupSentOut ||
            (line.boat != null && isPartnerBoat(boatPlan, line.boat))
          const statusNote = groupSentOut
            ? 'Tour partner · no check-in needed'
            : wholeNoShow
              ? 'Whole booking no-show'
              : line.status === 'checked'
                ? `In · ${progressLabel}`
                : partialNoShow
                  ? `Wait · ${progressLabel} · NS ${missingPax}`
                  : `Wait · ${progressLabel}`

          return (
            <div
              key={line.key}
              className={cn(
                'px-3 py-2.5',
                line.status === 'checked' && 'bg-emerald-50/40',
                line.status === 'waiting' && 'bg-amber-50/25',
                line.status === 'no-show' && 'bg-rose-50/40',
                !isHelper && ticketed && 'bg-sky-50/40',
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    className="w-full min-w-0 text-left"
                    onClick={() => toggleExpanded(line.key)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex min-w-10 shrink-0 flex-col items-start gap-0.5">
                        {sequenceLabel && line.status === 'checked' ? (
                          <span className="text-[15px] font-bold tabular-nums text-emerald-700">
                            {sequenceLabel}
                          </span>
                        ) : null}
                        <StatusBadge status={line.status} compact />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-teal-950" title={hotel}>
                          {hotel}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] font-normal text-teal-900/70">
                          {line.leaderName || line.booking.code}
                          {line.split ? (
                            <span className="ml-1.5 text-[10px] font-semibold text-teal-700/55">
                              split
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-12 text-[12px] text-teal-900/65">
                    <span className="tabular-nums font-medium text-teal-950">
                      {compactPaxLine(booked, line.pax, wholeNoShow)}
                    </span>
                    <CheckInBoatPicker
                      booking={line.booking}
                      date={today}
                      boat={line.boat}
                      disabled={isHelper || wholeNoShow || groupSentOut}
                    />
                    <span>Park {formatIncludeShort(line.booking.parkFee)}</span>
                  </div>
                  <p
                    className={cn(
                      'mt-1 pl-12 text-[12px] font-medium tabular-nums',
                      line.status === 'checked'
                        ? 'text-emerald-800/80'
                        : line.status === 'no-show'
                          ? 'text-rose-800/80'
                          : 'text-amber-900/80',
                    )}
                  >
                    {statusNote}
                  </p>
                </div>
                {sentOut ? (
                  <span className="inline-flex h-11 shrink-0 items-center rounded-xl border border-neutral-200 bg-white px-2 text-[10px] font-semibold tracking-wide text-neutral-600 uppercase">
                    Sent
                  </span>
                ) : (
                <button
                  type="button"
                  aria-label={`Show check-in QR for ${line.leaderName || line.booking.code}`}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-teal-900/12 bg-white text-teal-800 shadow-sm"
                  onClick={() => {
                    setQrCopied(false)
                    setQrBooking(line.booking)
                  }}
                >
                  <QrCode className="size-5" />
                </button>
                )}
              </div>
              {!isHelper && line.showBookingMoney && payment.kind !== 'none' ? (
                <div className="mt-2">
                  <PayableAmount
                    label={payment.label}
                    paid={paid}
                    disabled={wholeNoShow}
                    compact={payment.kind === 'note'}
                    withTick
                    onToggle={() =>
                      setCheckInPayment(
                        today,
                        line.booking.program,
                        line.booking.code,
                        paid ? null : 'paid',
                      )
                    }
                  />
                </div>
              ) : null}
              {line.showBookingMoney ? (
              <div className="mt-2">
                <BoardNoteField
                  note={getCheckInNote(today, line.booking.program, line.booking.code)}
                  onSave={(value) =>
                    setCheckInNote(today, line.booking.program, line.booking.code, value)
                  }
                />
              </div>
              ) : null}

              {expanded ? (
                <div className="mt-2 space-y-1.5 border-t border-teal-900/8 pt-2">
                  {partialNoShow || wholeNoShow ? (
                    <p className="text-[12px] text-teal-900/55">
                      Original {formatGuestPaxParts(booked)}
                      {partialNoShow ? ` · pickup NS ${missingPax}` : ''}
                    </p>
                  ) : null}
                  {line.guests.length > 0 ? (
                    line.guests.map((guest, guestIndex) => {
                      const details = [
                        guest.nationality,
                        guest.birthday ? formatShortDate(guest.birthday) : '',
                        guest.passportNumber,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                      const seatOffset = line.guests
                        .slice(0, guestIndex)
                        .reduce((sum, item) => sum + item.seats, 0)
                      const guestSeq =
                        sequence && line.status === 'checked'
                          ? sequence.seats > 1 && guest.seats > 1
                            ? formatSequenceRange(
                                sequenceForSeatOffset(sequence, seatOffset),
                                sequenceForSeatOffset(sequence, seatOffset + guest.seats - 1),
                              )
                            : String(sequenceForSeatOffset(sequence, seatOffset))
                          : null
                      return (
                        <div key={guest.key} className="rounded-lg bg-white/80 px-2.5 py-1.5">
                          <p className="truncate text-[13px] font-semibold text-teal-950">
                            {guestSeq ? (
                              <span className="mr-1.5 tabular-nums text-teal-800/70">#{guestSeq}</span>
                            ) : null}
                            {guest.guestName}
                            {guest.seats > 1 ? (
                              <span className="ml-1 font-medium text-teal-900/45">
                                · {guest.seats} seats
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-teal-900/50">
                            {formatCheckInTime(guest.checkedInAt)}
                            {formatCheckInTime(guest.checkedInAt) && details ? ' · ' : null}
                            {details}
                          </p>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-[12px] text-teal-900/45">No guests checked in yet.</p>
                  )}
                  {line.status === 'waiting' && line.checkedInCount < line.seatsTotal ? (
                    <p className="text-[12px] text-amber-900/70">
                      {line.seatsTotal - line.checkedInCount} seat
                      {line.seatsTotal - line.checkedInCount === 1 ? '' : 's'} still waiting
                    </p>
                  ) : null}
                  {isHelper ? null : (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        className="text-[12px] font-semibold text-teal-800 underline-offset-2 hover:underline"
                        onClick={() => setEditBooking(line.booking)}
                      >
                        Edit
                      </button>
                      {line.showBookingMoney ? (
                      <button
                        type="button"
                        className="text-[12px] font-semibold text-teal-800 underline-offset-2 hover:underline"
                        onClick={() => setServiceBooking(line.booking)}
                      >
                        Services
                        {services.length > 0
                          ? ` · ${services
                              .reduce((sum, item) => sum + serviceLineTotal(item), 0)
                              .toLocaleString('en-US')}`
                          : ''}
                      </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-[12px] font-semibold text-teal-800 underline-offset-2 hover:underline"
                        onClick={() => onSelectBooking(line.booking.code)}
                      >
                        Open booking
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <Table
        containerClassName="hidden overflow-visible md:block"
        className="table-fixed text-[12px] leading-snug"
      >
        <TableHeader>
          <TableRow className="border-b border-teal-900/15 bg-teal-950/[0.03] hover:bg-teal-950/[0.03]">
            <TableHead
              className="w-14 px-1 text-[10px] font-bold tracking-wide text-teal-900/80 uppercase"
              title="Ticket sequence after check-in. In is done. Wait has no number yet."
            >
              Seq
            </TableHead>
            <TableHead className="w-9 px-0.5 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              QR
            </TableHead>
            <TableHead className="w-[16%] px-1 text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Hotel
            </TableHead>
            <TableHead className="w-[20%] px-1 text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Booking
            </TableHead>
            <TableHead className="w-[5.5rem] px-0.5 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              <span className="grid grid-cols-4 gap-0.5">
                <span>AD</span>
                <span>CH</span>
                <span>INF</span>
                <span>TL</span>
              </span>
            </TableHead>
            <TableHead className="w-8 px-0.5 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Boat
            </TableHead>
            <TableHead className="w-10 px-1 text-center text-[10px] font-bold tracking-wide text-teal-900/80 uppercase">
              Park
            </TableHead>
            {isHelper ? null : (
              <>
                <TableHead
                  className="w-16 px-1 text-[10px] font-bold tracking-wide text-teal-900/80 uppercase"
                  title="Click an amount to mark it paid"
                >
                  Pay
                </TableHead>
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
          {visibleLines.map((line) => {
            const payment = bookingPayment(line.booking)
            const sequence = sequences[line.booking.code] ?? null
            const paid =
              getCheckInPayment(today, line.booking.program, line.booking.code) === 'paid'
            const ticketed =
              getCheckInTicket(today, line.booking.program, line.booking.code) === 'issued'
            const hotel = line.booking.pickupHotel || line.booking.pickupZone || '—'
            const expanded = Boolean(expandedCodes[line.key])
            const progressLabel = `${line.checkedInCount}/${line.bookingSeats}`
            const booked = line.originalPax
            const wholeNoShow = line.status === 'no-show'
            const sequenceLabel = sequenceBoardLabel(sequence, {
              checkedInCount: line.checkedInCount,
              fullyChecked: line.status === 'checked',
              noShow: wholeNoShow,
            })
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
            const sentOut =
              groupSentOut ||
              (line.boat != null && isPartnerBoat(boatPlan, line.boat))
            const noteText = getCheckInNote(today, line.booking.program, line.booking.code)
            const noteOpen =
              line.showBookingMoney &&
              (Boolean(noteText) || Boolean(addingNote[line.key]))

            const rowTone = cn(
              line.status === 'checked' && 'bg-emerald-50/40',
              line.status === 'waiting' && 'bg-amber-50/30',
              line.status === 'no-show' && 'bg-rose-50/40',
              !isHelper && ticketed && 'bg-sky-50/40',
            )

            return (
              <Fragment key={line.key}>
              <TableRow
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
                className={cn('cursor-pointer border-b-0', rowTone)}
              >
                <TableCell
                  className="px-1 align-top tabular-nums"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <SequenceCell
                    label={sequenceLabel}
                    block={sequence}
                    status={line.status}
                    editable={Boolean(onSetBookingSequenceStart)}
                    onSetStart={(start) =>
                      onSetBookingSequenceStart?.(line.booking.code, start)
                    }
                  />
                </TableCell>
                <TableCell
                  className="w-9 px-0.5 text-center align-top"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <div className="flex flex-col items-center gap-1">
                    {sentOut ? (
                      <span className="inline-flex min-h-8 items-center rounded-md border border-neutral-200 bg-white px-1 text-[9px] font-semibold tracking-wide text-neutral-600 uppercase">
                        Sent
                      </span>
                    ) : (
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
                    )}
                    {isHelper ? null : (
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-teal-800 underline-offset-2 hover:underline"
                        onClick={() => setEditBooking(line.booking)}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-0 whitespace-normal px-1.5 align-top">
                  <p
                    className="line-clamp-2 text-[13px] font-semibold leading-snug break-words text-teal-950 sm:text-sm"
                    title={hotel}
                  >
                    {hotel}
                  </p>
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
                      <p className="truncate text-sm font-normal text-teal-900/80">
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
                      {line.showBookingMoney && !noteOpen ? (
                        <button
                          type="button"
                          className="mt-1 text-[11px] font-medium text-orange-600 hover:text-orange-700 hover:underline"
                          onClick={(event) => {
                            event.stopPropagation()
                            setAddingNote((current) => ({ ...current, [line.key]: true }))
                          }}
                        >
                          Add note
                        </button>
                      ) : null}

                      {expanded ? (
                        <div className="mt-2 space-y-1.5 border-t border-teal-900/8 pt-2">
                          {partialNoShow || wholeNoShow ? (
                            <p className="text-[11px] text-teal-900/55">
                              Original {formatGuestPaxParts(booked)}
                              {partialNoShow ? ` · pickup NS ${missingPax}` : ''}
                            </p>
                          ) : null}
                          {line.guests.length > 0 ? (
                            line.guests.map((guest, guestIndex) => {
                              const details = [
                                guest.nationality,
                                guest.birthday ? formatShortDate(guest.birthday) : '',
                                guest.passportNumber,
                              ]
                                .filter(Boolean)
                                .join(' · ')
                              const seatOffset = line.guests
                                .slice(0, guestIndex)
                                .reduce((sum, item) => sum + item.seats, 0)
                              const guestSeq =
                                sequence && line.status === 'checked'
                                  ? sequence.seats > 1 && guest.seats > 1
                                    ? formatSequenceRange(
                                        sequenceForSeatOffset(sequence, seatOffset),
                                        sequenceForSeatOffset(
                                          sequence,
                                          seatOffset + guest.seats - 1,
                                        ),
                                      )
                                    : String(sequenceForSeatOffset(sequence, seatOffset))
                                  : null
                              return (
                                <div key={guest.key} className="rounded-lg bg-white/70 px-2 py-1.5">
                                  <p className="truncate text-[12px] font-semibold text-teal-950">
                                    {guestSeq ? (
                                      <span className="mr-1.5 tabular-nums text-teal-800/70">
                                        #{guestSeq}
                                      </span>
                                    ) : null}
                                    {guest.guestName}
                                    {isHelper ? null : (
                                      <button
                                        type="button"
                                        className="ml-1.5 text-[10px] font-semibold text-teal-800 underline-offset-2 hover:underline"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          setEditBooking(line.booking)
                                        }}
                                      >
                                        Edit
                                      </button>
                                    )}
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
                <TableCell className="w-[5.5rem] px-0.5 text-center align-top tabular-nums">
                  <span className="grid grid-cols-4 gap-0.5">
                    <PaxCount
                      original={booked.adults}
                      current={line.pax.adults}
                      wholeNoShow={wholeNoShow}
                    />
                    <PaxCount
                      original={booked.children}
                      current={line.pax.children}
                      wholeNoShow={wholeNoShow}
                    />
                    <PaxCount
                      original={booked.infants}
                      current={line.pax.infants}
                      wholeNoShow={wholeNoShow}
                    />
                    <PaxCount
                      original={booked.tourLeaders}
                      current={line.pax.tourLeaders}
                      wholeNoShow={wholeNoShow}
                    />
                  </span>
                </TableCell>
                <TableCell
                  className="px-0.5 text-center align-top"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <CheckInBoatPicker
                    booking={line.booking}
                    date={today}
                    boat={line.boat}
                    disabled={isHelper || wholeNoShow}
                    compact
                  />
                </TableCell>
                <TableCell className="px-1 text-center align-top text-teal-900/70">
                  {formatIncludeShort(line.booking.parkFee)}
                </TableCell>
                {isHelper ? null : (
                <>
                <TableCell
                  className="max-w-0 whitespace-normal px-1.5 align-top"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {!line.showBookingMoney || payment.kind === 'none' ? (
                    <span className="text-teal-900/35">—</span>
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
                <TableCell
                  className="px-1.5 align-top"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {!line.showBookingMoney ? (
                    <span className="text-teal-900/35">—</span>
                  ) : (
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
                  )}
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
              {noteOpen ? (
              <TableRow className={cn('hover:bg-transparent', rowTone)}>
                <TableCell
                  colSpan={isHelper ? 7 : 10}
                  className="px-3 pt-0 pb-2.5"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <BoardNoteField
                    autoFocus={!noteText}
                    note={noteText}
                    onSave={(value) => {
                      setCheckInNote(today, line.booking.program, line.booking.code, value)
                      if (!value.trim()) {
                        setAddingNote((current) => {
                          if (!current[line.key]) return current
                          const next = { ...current }
                          delete next[line.key]
                          return next
                        })
                      }
                    }}
                  />
                </TableCell>
              </TableRow>
              ) : null}
              </Fragment>
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
                ? `${qrBooking.leadGuest} · ${qrBooking.code}. Guest can scan to check in or edit details.`
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
        <GuestEditDialog
          booking={editBooking}
          open={Boolean(editBooking)}
          onOpenChange={(open) => {
            if (!open) setEditBooking(null)
          }}
        />
      )}

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

function GuestEditDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const {
    getCheckInEnrollments,
    updateCheckInEnrollment,
    isCheckInGuestEditOpen,
    setCheckInGuestEditOpen,
  } = usePortal()
  const enrollments = booking
    ? getCheckInEnrollments(booking.date, booking.program, booking.code)
    : []
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    firstName: '',
    lastName: '',
    nationality: '',
    birthday: '',
    passportNumber: '',
  })
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open) {
      setActiveId(null)
      setError('')
      setSaved(false)
    }
  }, [open])

  function startEdit(enrollment: CheckInEnrollment) {
    if (!booking) return
    setActiveId(enrollment.id)
    setDraft({
      firstName: enrollment.firstName,
      lastName: enrollment.lastName,
      nationality: enrollment.nationality,
      birthday: enrollment.birthday,
      passportNumber: enrollment.passportNumber,
    })
    setError('')
    setSaved(false)
    setCheckInGuestEditOpen(
      booking.date,
      booking.program,
      booking.code,
      enrollment.id,
      true,
    )
  }

  function togglePhoneEdit(enrollment: CheckInEnrollment, open: boolean) {
    if (!booking) return
    setCheckInGuestEditOpen(
      booking.date,
      booking.program,
      booking.code,
      enrollment.id,
      open,
    )
  }

  function save() {
    if (!booking || !activeId) return
    const enrollment = enrollments.find((item) => item.id === activeId)
    if (!enrollment) return
    const firstName = sanitizeEnglishName(draft.firstName)
    const lastName = sanitizeEnglishName(draft.lastName)
    const passportNumber = sanitizeEnglishPassport(draft.passportNumber)
    const nationality = matchNationality(draft.nationality) ?? draft.nationality.trim()
    if (!isEnglishName(firstName) || !isEnglishName(lastName)) {
      setError('Use English names as on the passport.')
      return
    }
    if (!nationality) {
      setError('Select a nationality from the list.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.birthday)) {
      setError('Select birthday.')
      return
    }
    if (!isEnglishPassport(passportNumber)) {
      setError('Use the passport number as written on the passport.')
      return
    }
    const result = updateCheckInEnrollment({
      date: booking.date,
      program: booking.program,
      bookingCode: booking.code,
      enrollment: {
        ...enrollment,
        firstName,
        lastName,
        nationality,
        birthday: draft.birthday,
        passportNumber,
      },
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError('')
    setSaved(true)
    setActiveId(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="pr-8 font-display text-lg font-semibold text-teal-950">
            Edit guest information
          </DialogTitle>
          <DialogDescription className="text-teal-900/60">
            {booking
              ? `${booking.leadGuest} · ${booking.code}. Open phone edit per guest — the success screen only shows Edit after you open it.`
              : 'Fix checked-in guest details.'}
          </DialogDescription>
        </DialogHeader>
        {enrollments.length === 0 ? (
          <p className="text-sm text-teal-900/55">No guests checked in yet.</p>
        ) : (
          <div className="space-y-2">
            {enrollments.map((enrollment) => {
              const editing = activeId === enrollment.id
              return (
                <div
                  key={enrollment.id}
                  className="rounded-xl bg-teal-950/[0.03] px-3 py-2.5 ring-1 ring-teal-900/8"
                >
                  {editing ? (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="mb-1 text-[11px]">First name</Label>
                          <Input
                            className="h-9"
                            value={draft.firstName}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                firstName: sanitizeEnglishName(event.target.value),
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label className="mb-1 text-[11px]">Last name</Label>
                          <Input
                            className="h-9"
                            value={draft.lastName}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                lastName: sanitizeEnglishName(event.target.value),
                              }))
                            }
                          />
                        </div>
                      </div>
                      <NationalityCombobox
                        id={`admin-edit-nat-${enrollment.id}`}
                        value={draft.nationality}
                        onChange={(value) =>
                          setDraft((current) => ({ ...current, nationality: value }))
                        }
                        label="Nationality"
                        placeholder="Type to search"
                        noMatchText="No match"
                        errorText="Required"
                      />
                      <div>
                        <Label className="mb-1 text-[11px]">Birthday</Label>
                        <Input
                          className="h-9"
                          type="date"
                          value={draft.birthday}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              birthday: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label className="mb-1 text-[11px]">Passport number</Label>
                        <Input
                          className="h-9"
                          value={draft.passportNumber}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              passportNumber: sanitizeEnglishPassport(event.target.value),
                            }))
                          }
                        />
                      </div>
                      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={save}>
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActiveId(null)
                            setError('')
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-teal-950">
                          {guestDisplayName(enrollment)}
                          {booking &&
                          isCheckInGuestEditOpen(
                            booking.date,
                            booking.program,
                            booking.code,
                            enrollment.id,
                          ) ? (
                            <span className="ml-1.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                              Phone open
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-teal-900/55">
                          {[
                            enrollment.nationality,
                            enrollment.birthday ? formatShortDate(enrollment.birthday) : '',
                            enrollment.passportNumber,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(enrollment)}
                        >
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-teal-800 underline-offset-2 hover:underline"
                          onClick={() =>
                            togglePhoneEdit(
                              enrollment,
                              !(
                                booking &&
                                isCheckInGuestEditOpen(
                                  booking.date,
                                  booking.program,
                                  booking.code,
                                  enrollment.id,
                                )
                              ),
                            )
                          }
                        >
                          {booking &&
                          isCheckInGuestEditOpen(
                            booking.date,
                            booking.program,
                            booking.code,
                            enrollment.id,
                          )
                            ? 'Lock phone'
                            : 'Open phone'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {saved ? (
              <p className="text-sm font-medium text-emerald-800">Details updated.</p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function BoardNoteField({
  note,
  onSave,
  autoFocus = false,
}: {
  note: string
  onSave: (value: string) => void
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useState(note)
  const [open, setOpen] = useState(Boolean(note.trim()) || autoFocus)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(note)
    if (note.trim()) setOpen(true)
  }, [note])

  useEffect(() => {
    if (open && (autoFocus || !note.trim())) textareaRef.current?.focus()
  }, [open, autoFocus, note])

  const rows = Math.min(8, Math.max(2, draft.split('\n').length + (draft.length > 90 ? 1 : 0)))

  function commit() {
    if (draft.trim() !== note.trim()) onSave(draft)
    if (!draft.trim()) {
      setOpen(false)
      if (!note.trim()) onSave('')
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="text-[11px] font-medium text-orange-600 hover:text-orange-700 hover:underline"
        onClick={() => setOpen(true)}
      >
        Add note
      </button>
    )
  }

  return (
    <label className="flex items-start gap-2">
      <span className="mt-1.5 w-10 shrink-0 text-[10px] font-bold tracking-wide text-teal-900/55 uppercase">
        Note
      </span>
      <textarea
        ref={textareaRef}
        value={draft}
        rows={rows}
        placeholder="Late pickup, VIP, extra bags…"
        aria-label="Marina note for this booking"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        className="min-h-[2.25rem] w-full resize-y rounded-lg border border-teal-900/12 bg-white/90 px-2.5 py-1.5 text-[12px] leading-snug text-teal-950 outline-none placeholder:text-teal-900/30 focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
      />
    </label>
  )
}

function PayableAmount({
  label,
  paid,
  disabled,
  compact,
  withTick,
  onToggle,
  className,
}: {
  label: string
  paid: boolean
  disabled?: boolean
  compact?: boolean
  withTick?: boolean
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
            ? 'Paid — tap to undo'
            : 'Tap to mark paid'
      }
      className={cn(
        'max-w-full text-left font-semibold tabular-nums transition-colors disabled:cursor-not-allowed',
        compact && !withTick && 'text-[11px]',
        paid
          ? 'text-teal-900/45 line-through decoration-2 decoration-teal-900/45'
          : 'text-orange-800 hover:text-orange-950',
        disabled && 'text-teal-900/35 no-underline',
        withTick &&
          'flex w-full items-center gap-2.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 no-underline text-[14px] text-orange-950 hover:bg-orange-100/80',
        withTick && paid && 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100/70',
        withTick && disabled && 'border-teal-900/10 bg-teal-950/[0.03]',
        className,
      )}
      onClick={onToggle}
    >
      {withTick ? (
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md border-2',
            paid
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-orange-400 bg-white text-transparent',
            disabled && 'border-teal-900/20 bg-white',
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : null}
      <span className={cn(withTick && 'min-w-0 flex-1 truncate', !withTick && 'truncate')}>
        {label}
      </span>
      {withTick ? (
        <span className="shrink-0 text-[12px] font-semibold">
          {disabled ? '—' : paid ? 'Paid' : 'Mark paid'}
        </span>
      ) : null}
    </button>
  )
}

function SequenceStatusStack({
  label,
  status,
}: {
  label: string | null
  status: GuestLineStatus
}) {
  const showNumber = status === 'checked' && Boolean(label)
  return (
    <span className="flex flex-col items-start gap-0.5">
      {showNumber ? (
        <span className="text-lg font-bold leading-tight tabular-nums text-emerald-700">
          {label}
        </span>
      ) : null}
      <StatusBadge status={status} compact />
    </span>
  )
}

function SequenceCell({
  label,
  block,
  status,
  editable,
  onSetStart,
}: {
  label: string | null
  block: GuestSequenceBlock | null
  status: GuestLineStatus
  editable: boolean
  onSetStart: (start: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')

  const planned = block ? formatSequenceRange(block.start, block.end) : '—'
  const previewStart = Number.parseInt(custom, 10)
  const preview =
    block && Number.isFinite(previewStart) && previewStart >= 1
      ? formatSequenceRange(previewStart, previewStart + block.seats - 1)
      : null

  if (!editable) {
    return (
      <span title={block && status === 'checked' ? `Reserved ${planned}` : undefined}>
        <SequenceStatusStack label={label} status={status} />
      </span>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setCustom(block ? String(block.start) : '')
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className="rounded-lg px-0.5 py-0.5 text-left transition-colors hover:bg-teal-50"
            title={
              block
                ? `Ticket sequence ${planned}. Click to set 1–${block.seats} or 100–${99 + block.seats}.`
                : 'Set ticket sequence start'
            }
          />
        }
      >
        <SequenceStatusStack label={label} status={status} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 space-y-3 p-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-teal-800/55 uppercase">
            Ticket sequence
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-teal-950">
            {planned}
            {block?.overridden ? (
              <span className="ml-1.5 text-[10px] font-medium text-teal-700/55">set</span>
            ) : (
              <span className="ml-1.5 text-[10px] font-medium text-teal-700/45">auto</span>
            )}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-teal-900/55">
            {block && block.seats > 1
              ? `Group range shows after all ${block.seats} guests check in.`
              : 'Number shows after this guest checks in.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="rounded-lg bg-teal-950/[0.06] px-2 py-1 text-[11px] font-semibold text-teal-900/70 hover:bg-teal-950/[0.1]"
            onClick={() => {
              onSetStart(null)
              setOpen(false)
            }}
          >
            Auto
          </button>
          {SEQUENCE_START_PRESETS.map((start) => (
            <button
              key={start}
              type="button"
              className="rounded-lg bg-teal-950/[0.06] px-2 py-1 text-[11px] font-semibold tabular-nums text-teal-900/70 hover:bg-teal-950/[0.1]"
              onClick={() => {
                onSetStart(start)
                setOpen(false)
              }}
            >
              {block ? formatSequenceRange(start, start + block.seats - 1) : String(start)}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sequence-start" className="text-[11px] text-teal-900/60">
            Custom start
          </Label>
          <div className="flex gap-1.5">
            <Input
              id="sequence-start"
              inputMode="numeric"
              className="h-8 tabular-nums"
              value={custom}
              onChange={(event) => setCustom(event.target.value.replace(/[^\d]/g, '').slice(0, 4))}
              placeholder="100"
            />
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={!preview}
              onClick={() => {
                if (!Number.isFinite(previewStart) || previewStart < 1) return
                onSetStart(previewStart)
                setOpen(false)
              }}
            >
              Set
            </Button>
          </div>
          {preview ? (
            <p className="text-[11px] tabular-nums text-teal-800/70">Preview {preview}</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
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
  if (missing <= 0) {
    return (
      <span className={current ? undefined : 'text-teal-900/25'}>{current || 0}</span>
    )
  }
  return (
    <span className="inline-flex flex-col items-center leading-none">
      <span>{original}</span>
      <span className="mt-0.5 text-[10px] font-semibold text-orange-700">-{missing}</span>
    </span>
  )
}

function compactPaxLine(
  booked: { adults: number; children: number; infants: number; tourLeaders: number },
  current: { adults: number; children: number; infants: number; tourLeaders: number },
  wholeNoShow: boolean,
) {
  const parts: string[] = []
  const add = (label: string, bookedCount: number, liveCount: number) => {
    if (bookedCount <= 0 && liveCount <= 0) return
    if (wholeNoShow && bookedCount > 0) {
      parts.push(`${bookedCount}${label}-all`)
      return
    }
    const missing = bookedCount - liveCount
    parts.push(missing > 0 ? `${bookedCount}${label}-${missing}` : `${liveCount}${label}`)
  }
  add('A', booked.adults, current.adults)
  add('C', booked.children, current.children)
  add('I', booked.infants, current.infants)
  add('TL', booked.tourLeaders, current.tourLeaders)
  return parts.join(' · ') || '—'
}

function StatusBadge({ status, compact = false }: { status: GuestLineStatus; compact?: boolean }) {
  const size = compact
    ? 'px-2 py-0.5 text-[11px] font-bold'
    : 'px-2.5 py-1 text-sm font-bold'
  if (status === 'checked') {
    return (
      <span className={cn('inline-flex rounded-full bg-emerald-100 text-emerald-800', size)}>
        In
      </span>
    )
  }
  if (status === 'no-show') {
    return (
      <span
        className={cn('inline-flex rounded-full bg-rose-100 text-rose-800', size)}
        title="Whole booking no-show"
      >
        All NS
      </span>
    )
  }
  return (
    <span className={cn('inline-flex rounded-full bg-amber-100 text-amber-900', size)}>
      Wait
    </span>
  )
}

type DayServiceDetail = {
  id: string
  bookingCode: string
  bookingName: string
  hotel: string
  boat: number | null
  kind: CheckInServiceKind
  people: number
  total: number
  paid: boolean
}

function DayServiceSummary({
  rows,
  onOpen,
}: {
  rows: CheckInServiceKindSummary[]
  onOpen: () => void
}) {
  const grand = rows.reduce((sum, row) => sum + row.total, 0)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-wrap items-center gap-1.5 rounded-2xl border border-teal-900/8 bg-white/80 px-3 py-2 text-left hover:bg-teal-50/70"
    >
      <p className="text-[11px] font-bold tracking-wide text-teal-900/45 uppercase">
        Adding service today
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-teal-900/40">No scuba or longtail yet</p>
      ) : (
        <>
          {rows.map((row) => (
            <span
              key={row.kind}
              className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-900 ring-1 ring-teal-200/70"
              title={`${row.lines} booking${row.lines === 1 ? '' : 's'}`}
            >
              <ServiceKindIcon kind={row.kind} size="sm" />
              {checkInServiceLabel(row.kind)}{' '}
              <span className="tabular-nums">{row.people}</span>
              {row.total > 0 ? (
                <span className="font-medium text-teal-900/55 tabular-nums">
                  · {row.total.toLocaleString('en-US')}
                </span>
              ) : null}
            </span>
          ))}
          {grand > 0 ? (
            <span className="ml-auto text-[11px] font-semibold text-teal-900/70 tabular-nums">
              Total {grand.toLocaleString('en-US')}
            </span>
          ) : null}
        </>
      )}
    </button>
  )
}

function DayServicesDialog({
  open,
  onOpenChange,
  dateLabel,
  rows,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dateLabel: string
  rows: DayServiceDetail[]
}) {
  const unpaid = rows.filter((row) => !row.paid)
  const unpaidTotal = unpaid.reduce((sum, row) => sum + row.total, 0)
  const paidTotal = rows.filter((row) => row.paid).reduce((sum, row) => sum + row.total, 0)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-visible p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-teal-900/8 px-5 py-4">
          <DialogTitle>Service today · {dateLabel}</DialogTitle>
          <DialogDescription>
            Daily list across all vans. PAID is done. Not paid still needs follow-up.
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 py-3">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-teal-900/50">
              No scuba or longtail added today.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Boat name</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="py-1.5">
                      <p className="font-semibold text-teal-950">{row.bookingName}</p>
                      <p className="text-[11px] text-teal-900/50">
                        {row.hotel} · {row.bookingCode}
                      </p>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <BoatFleetBadge
                        boat={row.boat}
                        showColorName
                        className="px-1.5 py-0.5 text-[11px] font-bold"
                      />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <ServiceKindIcon kind={row.kind} size="sm" />
                        {checkInServiceLabel(row.kind)}
                        {row.people > 1 ? (
                          <span className="text-teal-900/45">×{row.people}</span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.paid ? (
                        <span className="inline-flex items-center justify-end gap-1 font-semibold text-emerald-800">
                          <Check className="size-3.5" />
                          PAID
                        </span>
                      ) : (
                        <span className="font-semibold text-orange-800">
                          {row.total.toLocaleString('en-US')}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {rows.length > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-4 border-t border-teal-900/8 px-5 py-3 text-sm">
            <p className="text-emerald-800/80">
              PAID ({paidTotal.toLocaleString('en-US')})
            </p>
            <p className="font-semibold text-orange-800">
              Not paid ({unpaidTotal.toLocaleString('en-US')})
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function StatPill({
  tone,
  label,
  shortLabel,
  value,
}: {
  tone: 'emerald' | 'amber' | 'rose' | 'teal'
  label: string
  shortLabel?: string
  value: number
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200/70',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200/70',
    rose: 'bg-rose-50 text-rose-800 ring-rose-200/70',
    teal: 'bg-teal-50 text-teal-800 ring-teal-200/70',
  }
  return (
    <span className={cn('rounded-full px-2 py-1 ring-1 sm:px-2.5', tones[tone])}>
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}{' '}
      <span className="tabular-nums">{value}</span>
    </span>
  )
}
