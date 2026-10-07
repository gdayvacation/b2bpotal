import { SHEET_TITLES, missingSheetsBackupEnv, sheetsBackupConfigured } from '@/lib/sheets/config'
import {
  batchUpdate,
  clearRange,
  ensureSheets,
  expandGridRequests,
  freezeAndFilterRequests,
  getCell,
  hideSheetRequest,
  dateDropdownRequest,
  monthDropdownRequest,
  sheetIdByTitle,
  writeValues,
} from '@/lib/sheets/google'
import {
  ALL_DATES_LABEL,
  ALLOTMENT_DAILY_HEADERS,
  ALLOTMENT_HEADERS,
  BOOKING_HEADERS,
  GUEST_HEADERS,
  INVOICE_HEADERS,
  INVOICE_LINE_HEADERS,
  MERGE_HEADERS,
  MONTHLY_SUMMARY_HEADERS,
  buildAllotmentDailyRows,
  buildAllotmentRows,
  buildBookingRows,
  buildGuestRows,
  buildInvoiceLineRows,
  buildInvoiceRows,
  buildMergeRows,
  buildMonthlySummaryRows,
  columnLetter,
  currentThaiMonth,
  monthlyQueryFormula,
  sheetA1Range,
  uniqueDates,
  uniqueMonths,
} from '@/lib/sheets/rows'
import { saveRawSnapshot, type SnapshotSaveResult } from '@/lib/sheets/snapshot'
import { loadSheetsBackupSource } from '@/lib/sheets/source-data'

export type SheetsBackupResult = {
  ok: true
  syncedAt: string
  bookings: number
  guests: number
  merge: number
  invoices: number
  allotments: number
  months: number
  snapshot: SnapshotSaveResult
}

async function writeReplacing(title: string, values: Array<Array<string | number>>) {
  await writeValues(`${title}!A1`, values)
  await clearRange(`${title}!A${values.length + 1}:ZZ`)
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
  const allotmentRows = withHeader(ALLOTMENT_HEADERS, buildAllotmentRows(source))
  const allotmentDailyRows = withHeader(ALLOTMENT_DAILY_HEADERS, buildAllotmentDailyRows(source))
  const summaryRows = withHeader(MONTHLY_SUMMARY_HEADERS, buildMonthlySummaryRows(source))
  const months = uniqueMonths(source)
  const dates = uniqueDates(source)

  const snapshot = await saveRawSnapshot(
    [
      { title: SHEET_TITLES.bookings, values: bookingRows },
      { title: SHEET_TITLES.guests, values: guestRows },
      { title: SHEET_TITLES.merge, values: mergeRows },
      { title: SHEET_TITLES.invoices, values: invoiceRows },
      { title: SHEET_TITLES.invoiceLines, values: invoiceLineRows },
      { title: SHEET_TITLES.allotments, values: allotmentRows },
      { title: SHEET_TITLES.allotmentDaily, values: allotmentDailyRows },
    ],
    source.syncedAt,
  )
  if (snapshot.blocked) {
    throw new Error(snapshot.note)
  }

  const sheets = await ensureSheets(Object.values(SHEET_TITLES))
  const bookingsId = sheetIdByTitle(sheets, SHEET_TITLES.bookings)
  const guestsId = sheetIdByTitle(sheets, SHEET_TITLES.guests)
  const mergeId = sheetIdByTitle(sheets, SHEET_TITLES.merge)
  const invoicesId = sheetIdByTitle(sheets, SHEET_TITLES.invoices)
  const invoiceLinesId = sheetIdByTitle(sheets, SHEET_TITLES.invoiceLines)
  const allotmentsId = sheetIdByTitle(sheets, SHEET_TITLES.allotments)
  const allotmentDailyId = sheetIdByTitle(sheets, SHEET_TITLES.allotmentDaily)
  const monthlyId = sheetIdByTitle(sheets, SHEET_TITLES.monthly)
  const monthsId = sheetIdByTitle(sheets, SHEET_TITLES.months)
  const datesId = sheetIdByTitle(sheets, SHEET_TITLES.dates)
  const selectedMonth =
    (await getSelectedMonthSafe()) ||
    (months.includes(currentThaiMonth()) ? currentThaiMonth() : (months[0] ?? currentThaiMonth()))
  const selectedDate = (await getSelectedDateSafe(dates)) || ALL_DATES_LABEL
  const mergeQueryIndex = 29
  const invoiceQueryIndex = mergeQueryIndex + MERGE_HEADERS.length + 1
  const allotmentQueryIndex = invoiceQueryIndex + INVOICE_HEADERS.length + 1
  const monthlyColumnCount = allotmentQueryIndex + ALLOTMENT_HEADERS.length + 2

  // Row budgets stay well under Google Sheets' hard 20,000,000-cell-per-workbook
  // limit (sum of every tab's rowCount * columnCount). The whole resize batch
  // below is atomic — if any one tab would push the workbook over the cap,
  // Google rejects the entire batchUpdate and NOTHING gets cleared or written
  // to ANY tab (this previously made Agent allotments / Allotment daily /
  // Invoices appear permanently empty). Keep headroom here comfortable but
  // sane — these floors are a few years of growth, not "infinite".
  const bookingRowBudget = Math.max(20000, bookingRows.length + 3000)
  const guestRowBudget = Math.max(10000, guestRows.length + 3000)
  const mergeRowBudget = Math.max(20000, mergeRows.length + 3000)
  const invoiceRowBudget = Math.max(5000, invoiceRows.length + 1000)
  const invoiceLineRowBudget = Math.max(10000, invoiceLineRows.length + 2000)
  const allotmentRowBudget = Math.max(2000, allotmentRows.length + 500)
  const allotmentDailyRowBudget = Math.max(6000, allotmentDailyRows.length + 1000)
  // Monthly tab holds summary + QUERY spill of selected-month bookings/merge/invoices.
  const monthlyRowBudget = Math.max(15000, bookingRows.length + invoiceRows.length + 3000)

  await batchUpdate([
    expandGridRequests(bookingsId, bookingRowBudget),
    expandGridRequests(guestsId, guestRowBudget),
    expandGridRequests(mergeId, mergeRowBudget),
    expandGridRequests(invoicesId, invoiceRowBudget),
    expandGridRequests(invoiceLinesId, invoiceLineRowBudget),
    expandGridRequests(allotmentsId, allotmentRowBudget),
    expandGridRequests(allotmentDailyId, allotmentDailyRowBudget),
    expandGridRequests(monthlyId, monthlyRowBudget, monthlyColumnCount),
    expandGridRequests(monthsId, Math.max(200, months.length + 20), 4),
    expandGridRequests(datesId, Math.max(500, dates.length + 20), 4),
  ])

  // Write the new rows first, then drop only the leftover tail. Clearing the whole tab
  // before the write used to leave every tab empty when a later write failed.
  await Promise.all([
    writeReplacing(SHEET_TITLES.bookings, bookingRows),
    writeReplacing(SHEET_TITLES.guests, guestRows),
    writeReplacing(SHEET_TITLES.merge, mergeRows),
    writeReplacing(SHEET_TITLES.invoices, invoiceRows),
    writeReplacing(SHEET_TITLES.invoiceLines, invoiceLineRows),
    writeReplacing(SHEET_TITLES.allotments, allotmentRows),
    writeReplacing(SHEET_TITLES.allotmentDaily, allotmentDailyRows),
    writeReplacing(SHEET_TITLES.months, [['Month'], ...months.map((month) => [month])]),
    writeReplacing(SHEET_TITLES.dates, [['Date'], [ALL_DATES_LABEL], ...dates.map((date) => [date])]),
  ])

  await clearRange(`${SHEET_TITLES.monthly}!A:ZZ`)

  const summaryStart = 3
  const bookingsQueryRow = summaryStart + summaryRows.length + 2
  const mergeQueryCol = columnLetter(mergeQueryIndex)
  const invoiceQueryCol = columnLetter(invoiceQueryIndex)
  const allotmentQueryCol = columnLetter(allotmentQueryIndex)

  await Promise.all([
    writeValues(`${SHEET_TITLES.monthly}!A1`, [
      ['Pick a month', selectedMonth, 'Pick a date', selectedDate, 'Synced (Thai time)', source.syncedAt],
      [
        'B1 filters the month. D1 filters one date inside that month — choose (All dates) to see the whole month, sorted by date. Invoices show Receipt status: Paid, Partial, or Not paid.',
      ],
    ]),
    writeValues(`${SHEET_TITLES.monthly}!A${summaryStart}`, [['Month summary'], ...summaryRows]),
    writeValues(
      `${SHEET_TITLES.monthly}!A${bookingsQueryRow}`,
      [
        ['Bookings for selected month or date'],
        [monthlyQueryFormula(sheetA1Range(SHEET_TITLES.bookings, BOOKING_HEADERS.length))],
      ],
      'USER_ENTERED',
    ),
    writeValues(
      `${SHEET_TITLES.monthly}!${mergeQueryCol}${summaryStart}`,
      [
        ['Merge for selected month or date — booked vs real check-in vs extra charge'],
        [monthlyQueryFormula(sheetA1Range(SHEET_TITLES.merge, MERGE_HEADERS.length))],
      ],
      'USER_ENTERED',
    ),
    writeValues(
      `${SHEET_TITLES.monthly}!${invoiceQueryCol}${summaryStart}`,
      [
        ['Invoices for selected month or date — Receipt status is Paid, Partial, or Not paid'],
        [monthlyQueryFormula(sheetA1Range(SHEET_TITLES.invoices, INVOICE_HEADERS.length))],
      ],
      'USER_ENTERED',
    ),
    writeValues(
      `${SHEET_TITLES.monthly}!${allotmentQueryCol}${summaryStart}`,
      [
        ['Agent allotments for selected month or date'],
        [monthlyQueryFormula(sheetA1Range(SHEET_TITLES.allotments, ALLOTMENT_HEADERS.length))],
      ],
      'USER_ENTERED',
    ),
  ])

  await batchUpdate([
    ...freezeAndFilterRequests(bookingsId, BOOKING_HEADERS.length, bookingRows.length),
    ...freezeAndFilterRequests(guestsId, GUEST_HEADERS.length, guestRows.length),
    ...freezeAndFilterRequests(mergeId, MERGE_HEADERS.length, mergeRows.length),
    ...freezeAndFilterRequests(invoicesId, INVOICE_HEADERS.length, invoiceRows.length),
    ...freezeAndFilterRequests(invoiceLinesId, INVOICE_LINE_HEADERS.length, invoiceLineRows.length),
    ...freezeAndFilterRequests(allotmentsId, ALLOTMENT_HEADERS.length, allotmentRows.length),
    ...freezeAndFilterRequests(allotmentDailyId, ALLOTMENT_DAILY_HEADERS.length, allotmentDailyRows.length),
    hideSheetRequest(monthsId),
    hideSheetRequest(datesId),
    monthDropdownRequest(monthlyId, months.length),
    dateDropdownRequest(monthlyId, dates.length + 1),
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
    allotments: source.allotments.length,
    months: months.length,
    snapshot,
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

async function getSelectedDateSafe(dates: string[]) {
  if (!sheetsBackupConfigured()) return ''
  try {
    const value = String(await getCell(`${SHEET_TITLES.monthly}!D1`)).trim()
    if (value === ALL_DATES_LABEL) return value
    return dates.includes(value) ? value : ''
  } catch {
    return ''
  }
}
