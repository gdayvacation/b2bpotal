import {
  SHEET_TITLES,
  SNAPSHOT_SPREADSHEET_TITLE,
  shareEmails,
  snapshotSpreadsheetId,
} from '@/lib/sheets/config'
import {
  batchUpdate,
  clearRange,
  createSpreadsheet,
  ensureSheets,
  expandGridRequests,
  listSheets,
  readValues,
  sheetIdByTitle,
  shareSpreadsheetWithEmails,
  writeValues,
} from '@/lib/sheets/google'
import type { SheetCell } from '@/lib/sheets/rows'
import {
  ALLOTMENT_DAILY_HEADERS,
  ALLOTMENT_HEADERS,
  BOOKING_HEADERS,
  GUEST_HEADERS,
  INVOICE_HEADERS,
  INVOICE_LINE_HEADERS,
  MERGE_HEADERS,
} from '@/lib/sheets/rows'

export const SNAPSHOT_STATUS_TAB = 'สถานะ'

/** Raw data tabs. Monthly is derived with formulas, so the frozen copy stores values from these. */
export const SNAPSHOT_SOURCE_TABS = [
  SHEET_TITLES.bookings,
  SHEET_TITLES.guests,
  SHEET_TITLES.merge,
  SHEET_TITLES.invoices,
  SHEET_TITLES.invoiceLines,
  SHEET_TITLES.allotments,
  SHEET_TITLES.allotmentDaily,
] as const

const COLUMN_COUNTS: Record<(typeof SNAPSHOT_SOURCE_TABS)[number], number> = {
  [SHEET_TITLES.bookings]: BOOKING_HEADERS.length,
  [SHEET_TITLES.guests]: GUEST_HEADERS.length,
  [SHEET_TITLES.merge]: MERGE_HEADERS.length,
  [SHEET_TITLES.invoices]: INVOICE_HEADERS.length,
  [SHEET_TITLES.invoiceLines]: INVOICE_LINE_HEADERS.length,
  [SHEET_TITLES.allotments]: ALLOTMENT_HEADERS.length,
  [SHEET_TITLES.allotmentDaily]: ALLOTMENT_DAILY_HEADERS.length,
}

export type SnapshotTable = {
  title: (typeof SNAPSHOT_SOURCE_TABS)[number]
  values: SheetCell[][]
}

export type SnapshotSaveResult = {
  saved: boolean
  blocked: boolean
  bookings: number
  previousBookings: number
  note: string
}

function snapshotTabTitle(title: string) {
  return `ภาพนิ่ง ${title}`
}

function previousTabTitle(title: string) {
  return `ก่อนหน้า ${title}`
}

function dawnTabTitle(title: string) {
  return `ตี3 ${title}`
}

function exportLooksTooSmall(incoming: number, previous: number) {
  return (
    previous > 0 &&
    (incoming === 0 || (previous >= 100 && incoming < previous * 0.5))
  )
}

function quotedRange(title: string, a1: string) {
  const quoted = /[^A-Za-z0-9_]/.test(title) ? `'${title.replace(/'/g, "''")}'` : title
  return `${quoted}!${a1}`
}

function dataRowCount(values: SheetCell[][]) {
  return Math.max(0, values.length - 1)
}

function allTabTitles() {
  return [
    SNAPSHOT_STATUS_TAB,
    ...SNAPSHOT_SOURCE_TABS.map(snapshotTabTitle),
    ...SNAPSHOT_SOURCE_TABS.map(previousTabTitle),
  ]
}

async function replaceValues(id: string, title: string, values: SheetCell[][], columns: number) {
  const sheets = await listSheets(id)
  const sheetId = sheetIdByTitle(sheets, title)
  await batchUpdate(
    [expandGridRequests(sheetId, Math.max(values.length + 50, 100), Math.max(columns, 1))],
    id,
  )
  await writeValues(quotedRange(title, 'A1'), values, 'RAW', id)
  await clearRange(quotedRange(title, `A${values.length + 1}:ZZ`), id)
}

/**
 * Copy plain values into the snapshot workbook before the live sheet is changed.
 * The previous generation is written first. A suspiciously small export does not replace either set.
 */
export async function saveRawSnapshot(
  tables: SnapshotTable[],
  savedAt: string,
): Promise<SnapshotSaveResult> {
  const id = snapshotSpreadsheetId()
  const incomingBookings = dataRowCount(
    tables.find((table) => table.title === SHEET_TITLES.bookings)?.values ?? [],
  )
  if (!id) {
    return {
      saved: false,
      blocked: false,
      bookings: incomingBookings,
      previousBookings: 0,
      note: 'Snapshot sheet is not configured',
    }
  }

  await ensureSheets(allTabTitles(), id)
  const priorRows = await readValues(quotedRange(SNAPSHOT_STATUS_TAB, 'A6:J6'), id)
  const prior = priorRows[0] ?? []
  const previousBookings = Number(prior[2]) || 0
  const tooSmall = exportLooksTooSmall(incomingBookings, previousBookings)

  if (tooSmall) {
    const note = `ไม่ทับภาพนิ่ง: ข้อมูลใหม่มี bookings ${incomingBookings} แถว จากที่เซฟไว้ ${previousBookings} แถว เก็บชุดเดิมไว้`
    await writeValues(quotedRange(SNAPSHOT_STATUS_TAB, 'A11'), [[note]], 'RAW', id)
    return {
      saved: false,
      blocked: true,
      bookings: incomingBookings,
      previousBookings,
      note,
    }
  }

  for (const title of SNAPSHOT_SOURCE_TABS) {
    const current = await readValues(quotedRange(snapshotTabTitle(title), 'A:AZ'), id)
    if (current.length === 0) continue
    const columns = Math.max(COLUMN_COUNTS[title], current[0]?.length ?? 1)
    await replaceValues(id, previousTabTitle(title), current, columns)
  }

  for (const table of tables) {
    const columns = Math.max(COLUMN_COUNTS[table.title], table.values[0]?.length ?? 1)
    await replaceValues(id, snapshotTabTitle(table.title), table.values, columns)
  }

  const counts = SNAPSHOT_SOURCE_TABS.map((title) => {
    const table = tables.find((item) => item.title === title)
    return table ? dataRowCount(table.values) : 0
  })
  const note = 'เซฟค่าจริงก่อนเขียนไฟล์หลัก ถ้าซิงก์ตี 4 พลาด เปิดแท็บชุดนี้หรือแท็บก่อนหน้า'
  await writeValues(
    quotedRange(SNAPSHOT_STATUS_TAB, 'A1'),
    [
      ['ภาพนิ่งรายวัน — ค่าที่คัดลอกไว้ ไม่ได้เชื่อมกับไฟล์หลัก'],
      ['ตี 3 คัดลอกไฟล์หลักไปแท็บ ตี3 โดยไม่แก้ไฟล์หลัก ตี 4 เซฟชุดใหม่ลงแท็บ ภาพนิ่ง แล้วค่อยอัปเดตไฟล์หลัก'],
      ['ถ้าไฟล์หลักพังตอนตี 4 ให้เปิดแท็บ ตี3 ถ้าแท็บ ภาพนิ่ง มีเวลาของเช้านี้และจำนวนแถวปกติ ให้ใช้แท็บ ภาพนิ่งเพราะใหม่กว่า'],
      [],
      [
        'ชุด',
        'บันทึกเมื่อ',
        'Bookings',
        'Check-in guests',
        'Merge',
        'Invoices',
        'Invoice lines',
        'Agent allotments',
        'Allotment daily',
        'หมายเหตุ',
      ],
      ['ล่าสุด', savedAt, ...counts, note],
      [],
      [
        'ชุด',
        'บันทึกเมื่อ',
        'Bookings',
        'Check-in guests',
        'Merge',
        'Invoices',
        'Invoice lines',
        'Agent allotments',
        'Allotment daily',
        'หมายเหตุ',
      ],
      [
        'ก่อนหน้า',
        prior[1] ?? '',
        ...([2, 3, 4, 5, 6, 7, 8].map((index) => Number(prior[index]) || 0) as SheetCell[]),
        'ชุดที่เซฟไว้รอบก่อน',
      ],
    ],
    'RAW',
    id,
  )
  await clearRange(quotedRange(SNAPSHOT_STATUS_TAB, 'A11:J12'), id)

  return {
    saved: true,
    blocked: false,
    bookings: incomingBookings,
    previousBookings,
    note,
  }
}

/**
 * 03:00 Thai time. Copy the live sheet as plain values into ตี3 tabs.
 * This job never writes the live sheet. A later 04:00 failure cannot clear these tabs.
 * A wiped live sheet does not replace a fuller ตี3 copy.
 */
export async function freezeLiveSheet(savedAt: string): Promise<SnapshotSaveResult> {
  const id = snapshotSpreadsheetId()
  if (!id) {
    return {
      saved: false,
      blocked: false,
      bookings: 0,
      previousBookings: 0,
      note: 'Snapshot sheet is not configured',
    }
  }

  const tables: SnapshotTable[] = []
  for (const title of SNAPSHOT_SOURCE_TABS) {
    const values = await readValues(quotedRange(title, 'A:AZ'))
    tables.push({ title, values })
  }
  const incomingBookings = dataRowCount(
    tables.find((table) => table.title === SHEET_TITLES.bookings)?.values ?? [],
  )

  await ensureSheets([SNAPSHOT_STATUS_TAB, ...SNAPSHOT_SOURCE_TABS.map(dawnTabTitle)], id)
  const existing = await readValues(quotedRange(dawnTabTitle(SHEET_TITLES.bookings), 'A:A'), id)
  const previousBookings = dataRowCount(existing)
  if (exportLooksTooSmall(incomingBookings, previousBookings)) {
    const note = `ไม่ทับชุดตี 3: ไฟล์หลักมี bookings ${incomingBookings} แถว จากที่เซฟไว้ ${previousBookings} แถว เก็บชุดตี 3 เดิม`
    await writeValues(quotedRange(SNAPSHOT_STATUS_TAB, 'A18'), [[note]], 'RAW', id)
    return {
      saved: false,
      blocked: true,
      bookings: incomingBookings,
      previousBookings,
      note,
    }
  }

  for (const table of tables) {
    const columns = Math.max(COLUMN_COUNTS[table.title], table.values[0]?.length ?? 1)
    await replaceValues(id, dawnTabTitle(table.title), table.values, columns)
  }

  const counts = SNAPSHOT_SOURCE_TABS.map((title) => {
    const table = tables.find((item) => item.title === title)
    return table ? dataRowCount(table.values) : 0
  })
  const note = 'คัดลอกจากไฟล์หลักก่อนงานตี 4 งานตี 4 ไม่ได้ลบแท็บนี้'
  await writeValues(
    quotedRange(SNAPSHOT_STATUS_TAB, 'A14'),
    [
      ['ชุดตี 3 — สำเนาไฟล์หลักก่อนเริ่มซิงก์'],
      ['เปิดแท็บ ตี3 เมื่อไฟล์หลักว่างหรือผิดหลังตี 4 ข้อมูลคือชุดล่าสุดที่ไฟล์หลักยังสมบูรณ์'],
      [
        'ชุด',
        'บันทึกเมื่อ',
        'Bookings',
        'Check-in guests',
        'Merge',
        'Invoices',
        'Invoice lines',
        'Agent allotments',
        'Allotment daily',
        'หมายเหตุ',
      ],
      ['ตี 3', savedAt, ...counts, note],
    ],
    'RAW',
    id,
  )
  await clearRange(quotedRange(SNAPSHOT_STATUS_TAB, 'A18:J18'), id)

  return {
    saved: true,
    blocked: false,
    bookings: incomingBookings,
    previousBookings,
    note,
  }
}

export async function createSnapshotSpreadsheet(email?: string) {
  const created = await createSpreadsheet(SNAPSHOT_SPREADSHEET_TITLE, allTabTitles())
  const emails = shareEmails(email)
  if (emails.length > 0) {
    await shareSpreadsheetWithEmails(created.spreadsheetId, emails, 'writer')
  }
  return { ...created, sharedWith: emails.join(', ') }
}
