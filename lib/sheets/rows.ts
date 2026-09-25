import {
  formatGuestPaxParts,
  hasPartialNoShow,
  snapshotPaxTotal,
  type BookedPaxSnapshot,
} from '@/lib/check-in-booked-pax'
import { guestDisplayName } from '@/lib/check-in-enrollment'
import { formatCheckInServicesOption, serviceLineTotal } from '@/lib/check-in-services'
import { collectTotal, formatIncludeLabel, formatMonthLabel } from '@/lib/format'
import { assignmentKey, type SheetsBackupSource } from '@/lib/sheets/source-data'
import {
  formatPaxBreakdown,
  isActiveBooking,
  totalPassengers,
  type Booking,
} from '@/lib/types'

export const BOOKING_HEADERS = [
  'Month',
  'Month label',
  'Date',
  'Program',
  'Booking code',
  'Status',
  'Agent',
  'VC No.',
  'Guest',
  'Adults',
  'Children',
  'Infants',
  'Tour leaders',
  'Total pax',
  'Breakdown',
  'Hotel',
  'Zone',
  'Pickup time',
  'Room',
  'COT',
  'Park',
  'Collect due',
  'Canoe',
  'Transfer extra',
  'Late change fee',
  'Private transfer',
  'Note',
] as const

export const GUEST_HEADERS = [
  'Month',
  'Month label',
  'Date',
  'Program',
  'Booking code',
  'Agent',
  'Lead guest',
  'Guest name',
  'Nationality',
  'Birthday',
  'Passport',
  'Seats',
  'Scope',
  'Checked in at',
] as const

export const MERGE_HEADERS = [
  'Month',
  'Month label',
  'Date',
  'Program',
  'Booking code',
  'Agent',
  'VC No.',
  'Guest',
  'Hotel',
  'Booked AD',
  'Booked CH',
  'Booked INF',
  'Booked TL',
  'Booked total',
  'Booked label',
  'Current AD',
  'Current CH',
  'Current INF',
  'Current TL',
  'Current total',
  'Checked-in seats',
  'Status',
  'No-show AD',
  'No-show CH',
  'No-show INF',
  'No-show TL',
  'Park',
  'COT',
  'Transfer extra',
  'Late change fee',
  'Collect due',
  'Paid',
  'Services',
  'Service total',
  'Boat',
  'Van',
  'Note',
] as const

export const MONTHLY_SUMMARY_HEADERS = [
  'Month',
  'Month label',
  'Bookings',
  'Active',
  'Pax',
  'Checked-in guests',
  'Checked-in seats',
  'Collect due',
  'Late change fee',
] as const

export type SheetCell = string | number

function programLabel(program: Booking['program']) {
  return program === 'PP' ? 'Phi Phi' : 'James Bond'
}

function monthKey(date: string) {
  return date.slice(0, 7)
}

function thaiCheckInTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function currentPax(booking: Booking): BookedPaxSnapshot {
  return {
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    tourLeaders: booking.tourLeaders,
  }
}

function mergeStatus(
  booking: Booking,
  attendance: 'checked' | 'no-show' | undefined,
  booked: BookedPaxSnapshot,
  checkedIn: number,
) {
  if (booking.status === 'Cancelled') return 'cancelled'
  if (attendance === 'no-show') return 'no-show'
  const currentTotal = totalPassengers(booking)
  if (currentTotal > 0 && checkedIn >= currentTotal) return 'checked'
  if (checkedIn > 0 && (checkedIn < currentTotal || hasPartialNoShow(booked, currentPax(booking)))) {
    return 'partial'
  }
  if (attendance === 'checked') return 'checked'
  return 'waiting'
}

export function buildBookingRows(source: SheetsBackupSource): SheetCell[][] {
  return source.bookings.map((booking) => [
    monthKey(booking.date),
    formatMonthLabel(booking.date),
    booking.date,
    programLabel(booking.program),
    booking.code,
    booking.status,
    booking.agentName,
    booking.agentRef,
    booking.leadGuest,
    booking.adults,
    booking.children,
    booking.infants,
    booking.tourLeaders,
    totalPassengers(booking),
    formatPaxBreakdown(booking),
    booking.pickupHotel,
    booking.pickupZone,
    booking.pickupTime,
    booking.roomNumber,
    booking.cashOnTour,
    formatIncludeLabel(booking.parkFee),
    collectTotal(
      booking.parkFee,
      booking.program,
      booking.adults,
      booking.children,
      booking.cashOnTour,
    ),
    booking.canoe ? formatIncludeLabel(booking.canoe) : '',
    booking.transferExtraCharge,
    booking.lateChangeFee ?? 0,
    [booking.privateTransferVehicle, booking.privateTransferPrice].filter(Boolean).join(' · '),
    booking.note,
  ])
}

export function buildGuestRows(source: SheetsBackupSource): SheetCell[][] {
  const bookingByCode = new Map(source.bookings.map((booking) => [booking.code, booking]))
  return source.enrollments.map((enrollment) => {
    const booking = bookingByCode.get(enrollment.bookingCode)
    return [
      monthKey(enrollment.date),
      formatMonthLabel(enrollment.date),
      enrollment.date,
      programLabel(enrollment.program),
      enrollment.bookingCode,
      booking?.agentName ?? '',
      booking?.leadGuest ?? '',
      guestDisplayName(enrollment),
      enrollment.nationality,
      enrollment.birthday,
      enrollment.passportNumber,
      enrollment.seats,
      enrollment.scope,
      thaiCheckInTime(enrollment.checkedInAt),
    ]
  })
}

export function buildMergeRows(source: SheetsBackupSource): SheetCell[][] {
  const enrollmentsByCode = new Map<string, number>()
  for (const enrollment of source.enrollments) {
    const key = assignmentKey(enrollment.date, enrollment.program, enrollment.bookingCode)
    enrollmentsByCode.set(key, (enrollmentsByCode.get(key) ?? 0) + enrollment.seats)
  }

  const servicesByCode = new Map<string, typeof source.services>()
  for (const service of source.services) {
    const key = assignmentKey(service.date, service.program, service.bookingCode)
    const list = servicesByCode.get(key) ?? []
    list.push(service)
    servicesByCode.set(key, list)
  }

  return source.bookings.map((booking) => {
    const key = assignmentKey(booking.date, booking.program, booking.code)
    const current = currentPax(booking)
    const booked = source.bookedPax[key] ?? current
    const checkedIn = enrollmentsByCode.get(key) ?? 0
    const services = servicesByCode.get(key) ?? []
    const noShow = {
      adults: Math.max(0, booked.adults - booking.adults),
      children: Math.max(0, booked.children - booking.children),
      infants: Math.max(0, booked.infants - booking.infants),
      tourLeaders: Math.max(0, booked.tourLeaders - booking.tourLeaders),
    }
    if (source.attendance[key] === 'no-show') {
      noShow.adults = booked.adults
      noShow.children = booked.children
      noShow.infants = booked.infants
      noShow.tourLeaders = booked.tourLeaders
    }

    return [
      monthKey(booking.date),
      formatMonthLabel(booking.date),
      booking.date,
      programLabel(booking.program),
      booking.code,
      booking.agentName,
      booking.agentRef,
      booking.leadGuest,
      booking.pickupHotel,
      booked.adults,
      booked.children,
      booked.infants,
      booked.tourLeaders,
      snapshotPaxTotal(booked),
      formatGuestPaxParts(booked),
      booking.adults,
      booking.children,
      booking.infants,
      booking.tourLeaders,
      totalPassengers(booking),
      checkedIn,
      mergeStatus(booking, source.attendance[key], booked, checkedIn),
      noShow.adults,
      noShow.children,
      noShow.infants,
      noShow.tourLeaders,
      formatIncludeLabel(booking.parkFee),
      booking.cashOnTour,
      booking.transferExtraCharge,
      booking.lateChangeFee ?? 0,
      collectTotal(
        booking.parkFee,
        booking.program,
        booking.adults,
        booking.children,
        booking.cashOnTour,
      ),
      source.paidCodes.has(key) ? 'Paid' : '',
      formatCheckInServicesOption(services),
      services.reduce((sum, line) => sum + serviceLineTotal(line), 0),
      source.boats[key] ?? '',
      source.vans[key] ?? '',
      booking.note,
    ]
  })
}

export function buildMonthlySummaryRows(source: SheetsBackupSource): SheetCell[][] {
  const months = new Map<
    string,
    {
      label: string
      bookings: number
      active: number
      pax: number
      guests: number
      seats: number
      collect: number
      late: number
    }
  >()

  for (const booking of source.bookings) {
    const month = monthKey(booking.date)
    const row = months.get(month) ?? {
      label: formatMonthLabel(booking.date),
      bookings: 0,
      active: 0,
      pax: 0,
      guests: 0,
      seats: 0,
      collect: 0,
      late: 0,
    }
    row.bookings += 1
    if (isActiveBooking(booking)) {
      row.active += 1
      row.pax += totalPassengers(booking)
      row.collect += collectTotal(
        booking.parkFee,
        booking.program,
        booking.adults,
        booking.children,
        booking.cashOnTour,
      )
      row.late += booking.lateChangeFee ?? 0
    }
    months.set(month, row)
  }

  for (const enrollment of source.enrollments) {
    const month = monthKey(enrollment.date)
    const row = months.get(month)
    if (!row) continue
    row.guests += 1
    row.seats += enrollment.seats
  }

  return [...months.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, row]) => [
      month,
      row.label,
      row.bookings,
      row.active,
      row.pax,
      row.guests,
      row.seats,
      row.collect,
      row.late,
    ])
}

export function uniqueMonths(source: SheetsBackupSource) {
  const months = new Set<string>()
  for (const booking of source.bookings) months.add(monthKey(booking.date))
  return [...months].sort((a, b) => b.localeCompare(a))
}

export function currentThaiMonth(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
  })
    .format(now)
    .slice(0, 7)
}
