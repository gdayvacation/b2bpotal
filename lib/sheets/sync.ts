import { SHEET_TITLES, missingSheetsBackupEnv, sheetsBackupConfigured } from '@/lib/sheets/config'
import {
  batchUpdate,
  clearRange,
  ensureSheets,
  expandGridRequests,
  freezeAndFilterRequests,
  getCell,
  hideSheetRequest,
  monthDropdownRequest,
  sheetIdByTitle,
  writeValues,
} from '@/lib/sheets/google'
import {
  BOOKING_HEADERS,
  GUEST_HEADERS,
  INVOICE_HEADERS,
  INVOICE_LINE_HEADERS,
  MERGE_HEADERS,
  MONTHLY_SUMMARY_HEADERS,
  buildBookingRows,
  buildGuestRows,
  buildInvoiceLineRows,
  buildInvoiceRows,
  buildMergeRows,
  buildMonthlySummaryRows,
  currentThaiMonth,
  uniqueMonths,
} from '@/lib/sheets/rows'
import { loadSheetsBackupSource } from '@/lib/sheets/source-data'

export type SheetsBackupResult = {
  ok: true
  syncedAt: string
  bookings: number
  guests: number
  merge: number
  invoices: number
  months: number
}

function withHeader(headers: readonly string[], rows: Array<Array<string | number>>) {
  return [headers as unknown as Array<string | number>, ...rows]
}

export async function runSheetsBackup(): Promise<SheetsBackupResult> {
  const missing = missingSheetsBackupEnv()
  if (missing.length > 0) {
    throw new Error(`Google Sheets backup is not configured: ${missing.join(', ')}`)
  }

  const source = await loadSheetsBackupSource()
  const bookingRows = withHeader(BOOKING_HEADERS, buildBookingRows(source))
  const guestRows = withHeader(GUEST_HEADERS, buildGuestRows(source))
  const mergeRows = withHeader(MERGE_HEADERS, buildMergeRows(source))
  const invoiceRows = withHeader(INVOICE_HEADERS, buildInvoiceRows(source))
  const invoiceLineRows = withHeader(INVOICE_LINE_HEADERS, buildInvoiceLineRows(source))
  const summaryRows = withHeader(MONTHLY_SUMMARY_HEADERS, buildMonthlySummaryRows(source))
  const months = uniqueMonths(source)

  const sheets = await ensureSheets(Object.values(SHEET_TITLES))
  const bookingsId = sheetIdByTitle(sheets, SHEET_TITLES.bookings)
  const guestsId = sheetIdByTitle(sheets, SHEET_TITLES.guests)
  const mergeId = sheetIdByTitle(sheets, SHEET_TITLES.merge)
  const invoicesId = sheetIdByTitle(sheets, SHEET_TITLES.invoices)
  const invoiceLinesId = sheetIdByTitle(sheets, SHEET_TITLES.invoiceLines)
  const monthlyId = sheetIdByTitle(sheets, SHEET_TITLES.monthly)
  const monthsId = sheetIdByTitle(sheets, SHEET_TITLES.months)
  const selectedMonth =
    (await getSelectedMonthSafe()) ||
    (months.includes(currentThaiMonth()) ? currentThaiMonth() : (months[0] ?? currentThaiMonth()))

  const bookingRowBudget = Math.max(50000, bookingRows.length + 2000)
  const guestRowBudget = Math.max(50000, guestRows.length + 2000)
  const mergeRowBudget = Math.max(50000, mergeRows.length + 2000)
  const invoiceRowBudget = Math.max(20000, invoiceRows.length + 1000)
  const invoiceLineRowBudget = Math.max(50000, invoiceLineRows.length + 2000)
  // Monthly tab holds summary + QUERY spill of selected-month bookings/merge.
  const monthlyRowBudget = Math.max(50000, bookingRows.length + 5000)

  await batchUpdate([
    expandGridRequests(bookingsId, bookingRowBudget),
    expandGridRequests(guestsId, guestRowBudget),
    expandGridRequests(mergeId, mergeRowBudget),
    expandGridRequests(invoicesId, invoiceRowBudget),
    expandGridRequests(invoiceLinesId, invoiceLineRowBudget),
    expandGridRequests(monthlyId, monthlyRowBudget, 80),
    expandGridRequests(monthsId, Math.max(200, months.length + 20), 4),
  ])

  await Promise.all([
    clearRange(`${SHEET_TITLES.bookings}!A:ZZ`),
    clearRange(`${SHEET_TITLES.guests}!A:ZZ`),
    clearRange(`${SHEET_TITLES.merge}!A:ZZ`),
    clearRange(`${SHEET_TITLES.invoices}!A:ZZ`),
    clearRange(`${SHEET_TITLES.invoiceLines}!A:ZZ`),
    clearRange(`${SHEET_TITLES.monthly}!A:ZZ`),
    clearRange(`${SHEET_TITLES.months}!A:ZZ`),
  ])

  const summaryStart = 3
  const bookingsQueryRow = summaryStart + summaryRows.length + 2
  const mergeQueryCol = 'AC'

  await Promise.all([
    writeValues(`${SHEET_TITLES.bookings}!A1`, bookingRows),
    writeValues(`${SHEET_TITLES.guests}!A1`, guestRows),
    writeValues(`${SHEET_TITLES.merge}!A1`, mergeRows),
    writeValues(`${SHEET_TITLES.invoices}!A1`, invoiceRows),
    writeValues(`${SHEET_TITLES.invoiceLines}!A1`, invoiceLineRows),
    writeValues(`${SHEET_TITLES.monthly}!A1`, [
      ['Pick a month', selectedMonth, 'Synced (Thai time)', source.syncedAt],
      [
        'Use the dropdown in B1 to see that month. Bookings, check-in guests, merge, and invoices also have filterable columns.',
      ],
    ]),
    writeValues(`${SHEET_TITLES.monthly}!A${summaryStart}`, [['Month summary'], ...summaryRows]),
    writeValues(
      `${SHEET_TITLES.monthly}!A${bookingsQueryRow}`,
      [
        ['Bookings for selected month'],
        [`=IF(B1="","Select a month",QUERY(Bookings!A:AD,"select * where Col1 = '"&B1&"'",1))`],
      ],
      'USER_ENTERED',
    ),
    writeValues(
      `${SHEET_TITLES.monthly}!${mergeQueryCol}${summaryStart}`,
      [
        ['Merge for selected month — booked vs real check-in vs extra charge'],
        [`=IF(B1="","Select a month",QUERY(Merge!A:AO,"select * where Col1 = '"&B1&"'",1))`],
      ],
      'USER_ENTERED',
    ),
    writeValues(`${SHEET_TITLES.months}!A1`, [['Month'], ...months.map((month) => [month])]),
  ])

  await batchUpdate([
    ...freezeAndFilterRequests(bookingsId, BOOKING_HEADERS.length, bookingRows.length),
    ...freezeAndFilterRequests(guestsId, GUEST_HEADERS.length, guestRows.length),
    ...freezeAndFilterRequests(mergeId, MERGE_HEADERS.length, mergeRows.length),
    ...freezeAndFilterRequests(invoicesId, INVOICE_HEADERS.length, invoiceRows.length),
    ...freezeAndFilterRequests(invoiceLinesId, INVOICE_LINE_HEADERS.length, invoiceLineRows.length),
    hideSheetRequest(monthsId),
    monthDropdownRequest(monthlyId, months.length),
    {
      updateSheetProperties: {
        properties: {
          sheetId: monthlyId,
          gridProperties: { frozenRowCount: 3 },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    },
  ])

  return {
    ok: true,
    syncedAt: source.syncedAt,
    bookings: source.bookings.length,
    guests: source.enrollments.length,
    merge: source.bookings.length,
    invoices: source.invoices.length,
    months: months.length,
  }
}

async function getSelectedMonthSafe() {
  if (!sheetsBackupConfigured()) return ''
  try {
    const value = String(await getCell(`${SHEET_TITLES.monthly}!B1`)).trim()
    return /^\d{4}-\d{2}$/.test(value) ? value : ''
  } catch {
    return ''
  }
}
