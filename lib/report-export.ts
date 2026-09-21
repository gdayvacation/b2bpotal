import type { Booking } from '@/lib/types'
import { formatPaxBreakdown, totalPassengers } from '@/lib/types'
import { formatIncludeLabel, formatCollectTotal } from '@/lib/format'

export type ReportExportRow = {
  Agent: string
  'Agent slug': string
  'VC No.': string
  Date: string
  Program: string
  Guest: string
  Adults: number
  Children: number
  Infants: number
  'Tour leaders': number
  'Total pax': number
  Breakdown: string
  Hotel: string
  COT: string
  Park: string
  Total: string
  Canoe: string
  Note: string
  'Transfer extra': string
}

const HEADERS = [
  'Agent',
  'Agent slug',
  'VC No.',
  'Date',
  'Program',
  'Guest',
  'Adults',
  'Children',
  'Infants',
  'Tour leaders',
  'Total pax',
  'Breakdown',
  'Hotel',
  'COT',
  'Park',
  'Total',
  'Canoe',
  'Note',
  'Transfer extra',
] as const satisfies readonly (keyof ReportExportRow)[]

export function bookingsToReportRows(bookings: Booking[]): ReportExportRow[] {
  return bookings.map((booking) => ({
    Agent: booking.agentName,
    'Agent slug': booking.agentSlug,
    'VC No.': booking.agentRef,
    Date: booking.date,
    Program: booking.program === 'PP' ? 'Phi Phi' : 'James Bond',
    Guest: booking.leadGuest,
    Adults: booking.adults,
    Children: booking.children,
    Infants: booking.infants,
    'Tour leaders': booking.tourLeaders,
    'Total pax': totalPassengers(booking),
    Breakdown: formatPaxBreakdown(booking),
    Hotel: booking.pickupHotel,
    COT: booking.cashOnTour.trim(),
    Park: formatIncludeLabel(booking.parkFee),
    Total: formatCollectTotal(
      booking.parkFee,
      booking.program,
      booking.adults,
      booking.children,
      booking.cashOnTour,
    ),
    Canoe: booking.canoe ? formatIncludeLabel(booking.canoe) : '',
    Note: booking.note,
    'Transfer extra': booking.transferExtraCharge,
  }))
}

export function reportExportFilename(fromIso: string, toIso: string, ext: 'csv' | 'xlsx') {
  const stamp = fromIso === toIso ? fromIso : `${fromIso}_${toIso}`
  return `gday-report-${stamp}.${ext}`
}

export function downloadReportCsv(rows: ReportExportRow[], filename: string) {
  const lines = [
    HEADERS.join(','),
    ...rows.map((row) => HEADERS.map((key) => csvEscape(row[key])).join(',')),
  ]
  // UTF-8 BOM so Excel opens Thai / special characters correctly
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, filename)
}

export async function downloadReportXlsx(rows: ReportExportRow[], filename: string) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...HEADERS] })
  sheet['!cols'] = HEADERS.map((key) => ({ wch: columnWidth(key, rows) }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, filename)
}

function csvEscape(value: string | number) {
  const text = String(value ?? '')
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function columnWidth(key: keyof ReportExportRow, rows: ReportExportRow[]) {
  let max = key.length
  for (const row of rows) {
    max = Math.max(max, String(row[key] ?? '').length)
  }
  return Math.min(Math.max(max + 1, 8), 40)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
