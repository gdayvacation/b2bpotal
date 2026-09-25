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
  MERGE_HEADERS,
  MONTHLY_SUMMARY_HEADERS,
  buildBookingRows,
  buildGuestRows,
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
  const summaryRows = withHeader(MONTHLY_SUMMARY_HEADERS, buildMonthlySummaryRows(source))
  const months = uniqueMonths(source)

  const sheets = await ensureSheets(Object.values(SHEET_TITLES))
  const bookingsId = sheetIdByTitle(sheets, SHEET_TITLES.bookings)
  const guestsId = sheetIdByTitle(sheets, SHEET_TITLES.guests)
  const mergeId = sheetIdByTitle(sheets, SHEET_TITLES.merge)
  const monthlyId = sheetIdByTitle(sheets, SHEET_TITLES.monthly)
  const monthsId = sheetIdByTitle(sheets, SHEET_TITLES.months)
  const selectedMonth =
    (await getSelectedMonthSafe()) ||
    (months.includes(currentThaiMonth()) ? currentThaiMonth() : (months[0] ?? currentThaiMonth()))

  await batchUpdate([
    expandGridRequests(bookingsId),
    expandGridRequests(guestsId),
    expandGridRequests(mergeId),
    expandGridRequests(monthlyId, 10000, 80),
    expandGridRequests(monthsId, 200, 4),
  ])

  await Promise.all([
    clearRange(`${SHEET_TITLES.bookings}!A:ZZ`),
    clearRange(`${SHEET_TITLES.guests}!A:ZZ`),
    clearRange(`${SHEET_TITLES.merge}!A:ZZ`),
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
    writeValues(`${SHEET_TITLES.monthly}!A1`, [
      ['Pick a month', selectedMonth, 'Synced (Thai time)', source.syncedAt],
      [
        'Use the dropdown in B1 to see that month. Bookings, check-in guests, and merge also have a Month column you can filter.',
      ],
    ]),
    writeValues(`${SHEET_TITLES.monthly}!A${summaryStart}`, [['Month summary'], ...summaryRows]),
    writeValues(
      `${SHEET_TITLES.monthly}!A${bookingsQueryRow}`,
      [
        ['Bookings for selected month'],
        [`=IF(B1="","Select a month",QUERY(Bookings!A:AA,"select * where Col1 = '"&B1&"'",1))`],
      ],
      'USER_ENTERED',
    ),
    writeValues(
      `${SHEET_TITLES.monthly}!${mergeQueryCol}${summaryStart}`,
      [
        ['Merge for selected month — booked vs real check-in vs extra charge'],
        [`=IF(B1="","Select a month",QUERY(Merge!A:AK,"select * where Col1 = '"&B1&"'",1))`],
      ],
      'USER_ENTERED',
    ),
    writeValues(`${SHEET_TITLES.months}!A1`, [['Month'], ...months.map((month) => [month])]),
  ])

  await batchUpdate([
    ...freezeAndFilterRequests(bookingsId, BOOKING_HEADERS.length, bookingRows.length),
    ...freezeAndFilterRequests(guestsId, GUEST_HEADERS.length, guestRows.length),
    ...freezeAndFilterRequests(mergeId, MERGE_HEADERS.length, mergeRows.length),
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
