import {
  formatGuestPaxParts,
  hasPartialNoShow,
  snapshotPaxTotal,
  type BookedPaxSnapshot,
} from '@/lib/check-in-booked-pax'
import { guestDisplayName } from '@/lib/check-in-enrollment'
import { formatCheckInServicesOption, serviceLineTotal } from '@/lib/check-in-services'
import { collectTotal, formatIncludeLabel, formatMonthLabel } from '@/lib/format'
import {
  deriveInvoiceStatus,
  formatPaymentChannel,
  invoiceBalance,
  invoicePaidTotal,
  invoicePayments,
  type InvoiceDocument,
} from '@/lib/invoice'
import {
  allotmentBalance,
  allotmentPaidTotal,
  allotmentPayments,
  allotmentPayStatus,
  formatAllotmentParkFee,
} from '@/lib/supabase/agent-allotment-db'
import { assignmentKey, type SheetsBackupSource } from '@/lib/sheets/source-data'
import {
  bookedPaxOf,
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
  'Late cancel',
  'Cancel fee',
  'Private transfer',
  'Note',
  'Moved',
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
  'Marina note',
  'Pickup NS',
  'Own arrival',
  'Job order',
  'Note',
] as const

export const INVOICE_HEADERS = [
  'Month',
  'Month label',
  'Date',
  'Invoice no',
  'Kind',
  'Receipt status',
  'Agent',
  'Grand total',
  'Paid',
  'Balance',
  'Receipt',
  'Payment',
  'Paid at',
  'Send to agent',
  'Booking codes',
  'Travel dates',
  'Detail',
  'Notes',
  'Draft',
] as const

export const INVOICE_LINE_HEADERS = [
  'Month',
  'Month label',
  'Date',
  'Invoice no',
  'Kind',
  'Receipt status',
  'Agent',
  'Line',
  'Booking',
  'Voucher',
  'Description',
  'Adults',
  'Children',
  'Infants',
  'Tour leaders',
  'Amount',
] as const

export const ALLOTMENT_HEADERS = [
  'Month',
  'Month label',
  'Date',
  'Agent',
  'Program',
  'Adult seats',
  'Child seats',
  'Seats',
  'Adult price',
  'Child price',
  'Park fee',
  'Total',
  'Paid',
  'Balance',
  'Receipt status',
  'Payments',
  'Receives bookings',
  'Note',
] as const

export const ALLOTMENT_DAILY_HEADERS = [
  'Month',
  'Month label',
  'Date',
  'Agent',
  'Program',
  'Deduct heads',
  'Note',
] as const

/** First option in the Monthly date dropdown. Blank date means the whole month. */
export const ALL_DATES_LABEL = '(All dates)'

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

/** "7>3 moved to other date" / "Moved from 2026-10-01 (PP2610-0001)" for the Bookings sheet. */
export function movedLabel(booking: Booking) {
  const parts: string[] = []
  const out = booking.movedOutPax
  const outTotal = out ? out.adults + out.children + out.infants + out.tourLeaders : 0
  if (out && outTotal > 0) {
    parts.push(
      `${snapshotPaxTotal(bookedPaxOf(booking))}>${outTotal} moved to other date (${formatGuestPaxParts(out)})`,
    )
  }
  if (booking.movedFrom) {
    parts.push(
      `Moved from ${booking.movedFrom.date}${booking.movedFrom.code !== booking.code ? ` (${booking.movedFrom.code})` : ''}`,
    )
  }
  return parts.join(' · ')
}

/**
 * The Bookings sheet records the booking as it was made: no-show / own-arrival at the marina
 * lower the live counts but never these numbers (the Merge sheet shows booked vs live).
 */
export function buildBookingRows(source: SheetsBackupSource): SheetCell[][] {
  return source.bookings.map((booking) => {
    const booked = bookedPaxOf(booking)
    return [
      monthKey(booking.date),
      formatMonthLabel(booking.date),
      booking.date,
      programLabel(booking.program),
      booking.code,
      booking.status,
      booking.agentName,
      booking.agentRef,
      booking.leadGuest,
      booked.adults,
      booked.children,
      booked.infants,
      booked.tourLeaders,
      snapshotPaxTotal(booked),
      formatPaxBreakdown(booked),
      booking.pickupHotel,
      booking.pickupZone,
      booking.pickupTime,
      booking.roomNumber,
      booking.cashOnTour,
      formatIncludeLabel(booking.parkFee),
      collectTotal(
        booking.parkFee,
        booking.program,
        booked.adults,
        booked.children,
        booking.cashOnTour,
      ),
      booking.canoe ? formatIncludeLabel(booking.canoe) : '',
      booking.transferExtraCharge,
      booking.lateChangeFee ?? 0,
      booking.lateCancel ? 'Yes' : '',
      booking.cancelFee ?? '',
      [booking.privateTransferVehicle, booking.privateTransferPrice].filter(Boolean).join(' · '),
      booking.note,
      movedLabel(booking),
    ]
  })
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
    const snapshot = source.bookedPax[key] ?? current
    const recorded = bookedPaxOf(booking)
    const booked: BookedPaxSnapshot = {
      adults: Math.max(snapshot.adults, recorded.adults),
      children: Math.max(snapshot.children, recorded.children),
      infants: Math.max(snapshot.infants, recorded.infants),
      tourLeaders: Math.max(snapshot.tourLeaders, recorded.tourLeaders),
    }
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
      source.notes[key] ?? '',
      source.pickupNoShows[key] && snapshotPaxTotal(source.pickupNoShows[key]!) > 0
        ? formatGuestPaxParts(source.pickupNoShows[key]!)
        : '',
      source.ownArrivals[key] && snapshotPaxTotal(source.ownArrivals[key]!) > 0
        ? formatGuestPaxParts(source.ownArrivals[key]!)
        : '',
      source.jobOrderActions[key] ?? '',
      booking.note,
    ]
  })
}

function receiptStatusLabel(doc: InvoiceDocument) {
  const status = deriveInvoiceStatus(doc.grandTotal, invoicePaidTotal(doc))
  if (status === 'paid') return 'Paid'
  if (status === 'partial') return 'Partial'
  return 'Not paid'
}

function invoiceKindLabel(kind: InvoiceDocument['kind']) {
  if (kind === 'billing_note') return 'Billing note'
  if (kind === 'credit_note') return 'Credit note'
  return 'Invoice'
}

function invoiceOpenDate(doc: InvoiceDocument) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(doc.issueDate)) return doc.issueDate
  const travel = doc.items.find((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.travelDate))
  return travel?.travelDate ?? ''
}

function invoiceDetail(doc: InvoiceDocument) {
  return doc.items
    .map((item) =>
      [item.travelDate, item.bookingCode, item.voucherNo, item.description, item.amount || '']
        .filter((part) => part !== '' && part !== 0)
        .join(' '),
    )
    .filter(Boolean)
    .join(' | ')
}

function invoicePaymentDetail(doc: InvoiceDocument) {
  return invoicePayments(doc)
    .map((payment) =>
      [payment.paidDate, payment.amount, payment.receiptNo, formatPaymentChannel(payment.channel)]
        .filter((part) => part !== '' && part !== 0)
        .join(' '),
    )
    .join(' | ')
}

export function buildInvoiceRows(source: SheetsBackupSource): SheetCell[][] {
  return source.invoices.map((doc) => {
    const date = invoiceOpenDate(doc)
    const payments = invoicePayments(doc)
    const latestPaid = payments.at(-1)?.paidDate || (doc.paidAt ? doc.paidAt.slice(0, 10) : '')
    return [
      monthKey(date),
      date ? formatMonthLabel(date) : '',
      date,
      doc.number,
      invoiceKindLabel(doc.kind),
      receiptStatusLabel(doc),
      doc.agentName,
      doc.grandTotal,
      invoicePaidTotal(doc),
      invoiceBalance(doc),
      [...new Set(payments.map((payment) => payment.receiptNo).filter(Boolean))].join(', ') ||
        doc.receiptNo ||
        '',
      invoicePaymentDetail(doc) || formatPaymentChannel(doc.paymentChannel),
      latestPaid,
      doc.sendToAgent ? 'Yes' : '',
      [...new Set(doc.items.map((item) => item.bookingCode).filter(Boolean))].join(', '),
      [...new Set(doc.items.map((item) => item.travelDate).filter(Boolean))].join(', '),
      invoiceDetail(doc),
      doc.notes,
      doc.isDraft ? 'Yes' : '',
    ]
  })
}

export function buildInvoiceLineRows(source: SheetsBackupSource): SheetCell[][] {
  return source.invoices.flatMap((doc) =>
    doc.items.map((item, index) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(item.travelDate) ? item.travelDate : invoiceOpenDate(doc)
      return [
        monthKey(date),
        date ? formatMonthLabel(date) : '',
        date,
        doc.number,
        invoiceKindLabel(doc.kind),
        receiptStatusLabel(doc),
        doc.agentName,
        index + 1,
        item.bookingCode,
        item.voucherNo,
        item.description,
        item.adults,
        item.children,
        item.infants,
        item.tourLeaders,
        item.amount,
      ]
    }),
  )
}

function allotmentDate(row: SheetsBackupSource['allotments'][number]) {
  if (row.paidDate && /^\d{4}-\d{2}-\d{2}$/.test(row.paidDate)) return row.paidDate
  const created = new Date(row.createdAt)
  if (Number.isNaN(created.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(created)
}

function allotmentStatusLabel(row: SheetsBackupSource['allotments'][number]) {
  const status = allotmentPayStatus(row)
  if (status === 'paid') return 'Paid'
  if (status === 'partial') return 'Partial'
  return 'Not paid'
}

export function buildAllotmentRows(source: SheetsBackupSource): SheetCell[][] {
  return source.allotments.map((row) => {
    const date = allotmentDate(row)
    const payments = allotmentPayments(row)
      .map((payment) =>
        [
          payment.paidDate,
          payment.amount,
          payment.moneyOnly ? 'other cash' : '',
          payment.heads ? `${payment.heads} heads` : '',
          payment.note,
        ]
          .filter(Boolean)
          .join(' '),
      )
      .join(' | ')
    return [
      monthKey(date),
      date ? formatMonthLabel(date) : '',
      date,
      row.agentName,
      programLabel(row.program),
      row.adultSeats,
      row.childSeats,
      row.seats,
      row.adultPrice,
      row.childPrice,
      formatAllotmentParkFee(row.parkFee),
      row.totalAmount,
      allotmentPaidTotal(row),
      allotmentBalance(row),
      allotmentStatusLabel(row),
      payments,
      row.receivesBookings ? 'Yes' : '',
      row.note,
    ]
  })
}

export function buildAllotmentDailyRows(source: SheetsBackupSource): SheetCell[][] {
  return source.allotmentDaily.map((row) => [
    monthKey(row.day),
    formatMonthLabel(row.day),
    row.day,
    row.agentName,
    programLabel(row.program),
    row.totalDeduct,
    row.note,
  ])
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

function rememberMonth(months: Set<string>, date: string) {
  const month = monthKey(date)
  if (/^\d{4}-\d{2}$/.test(month)) months.add(month)
}

function rememberDate(dates: Set<string>, date: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.add(date)
}

export function uniqueMonths(source: SheetsBackupSource) {
  const months = new Set<string>()
  for (const booking of source.bookings) rememberMonth(months, booking.date)
  for (const enrollment of source.enrollments) rememberMonth(months, enrollment.date)
  for (const doc of source.invoices) rememberMonth(months, doc.issueDate)
  for (const row of source.allotments) {
    if (row.paidDate) rememberMonth(months, row.paidDate)
  }
  for (const row of source.allotmentDaily) rememberMonth(months, row.day)
  return [...months].sort((a, b) => b.localeCompare(a))
}

export function uniqueDates(source: SheetsBackupSource) {
  const dates = new Set<string>()
  for (const booking of source.bookings) rememberDate(dates, booking.date)
  for (const enrollment of source.enrollments) rememberDate(dates, enrollment.date)
  for (const doc of source.invoices) {
    rememberDate(dates, doc.issueDate)
    for (const item of doc.items) rememberDate(dates, item.travelDate)
  }
  for (const row of source.allotments) {
    if (row.paidDate) rememberDate(dates, row.paidDate)
  }
  for (const row of source.allotmentDaily) rememberDate(dates, row.day)
  return [...dates].sort((a, b) => b.localeCompare(a))
}

export function columnLetter(index: number) {
  let n = index
  let letters = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

export function sheetA1Range(title: string, columnCount: number) {
  const quoted = /[^A-Za-z0-9_]/.test(title) ? `'${title.replace(/'/g, "''")}'` : title
  return `${quoted}!A:${columnLetter(columnCount)}`
}

/** Monthly tab: month in B1, date in D1. Col1 is month and Col3 is date on each data tab. */
export function monthlyQueryFormula(sheetRange: string) {
  const wholeMonth = `QUERY(${sheetRange},"select * where Col1 = '"&B1&"' order by Col3",1)`
  const oneDate = `QUERY(${sheetRange},"select * where Col1 = '"&B1&"' and Col3 = '"&D1&"' order by Col3",1)`
  return `=IF(B1="","Select a month",IF(OR(D1="",D1="${ALL_DATES_LABEL}"),${wholeMonth},${oneDate}))`
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
