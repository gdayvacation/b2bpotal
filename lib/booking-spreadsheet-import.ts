import { normalizeBookingImageDraft } from '@/lib/booking-from-image'
import type { BookingImageDraft } from '@/lib/booking-from-image'

export type BookingSpreadsheetRow = {
  id: string
  sheet: string
  rowNumber: number
  draft: BookingImageDraft
}

export type ParseSpreadsheetResult = {
  format: 'generic' | 'goodday'
  rows: BookingSpreadsheetRow[]
  skipped: number
  /** When format is goodday and month could not be inferred from the file name. */
  needsMonth?: boolean
  inferredYearMonth?: string
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

const HEADER_ALIASES: Record<string, string> = {
  agent: 'agentName',
  agency: 'agentName',
  'agent name': 'agentName',
  'agent slug': 'agentSlug',
  ref: 'agentRef',
  voucher: 'agentRef',
  'vc no': 'agentRef',
  'vc no.': 'agentRef',
  'booking ref': 'agentRef',
  'agent ref': 'agentRef',
  program: 'program',
  tour: 'program',
  trip: 'program',
  date: 'date',
  'tour date': 'date',
  'travel date': 'date',
  guest: 'leadGuest',
  name: 'leadGuest',
  'lead guest': 'leadGuest',
  'guest name': 'leadGuest',
  hotel: 'pickupHotel',
  'pickup hotel': 'pickupHotel',
  zone: 'pickupZone',
  'pickup zone': 'pickupZone',
  area: 'pickupZone',
  room: 'roomNumber',
  'room number': 'roomNumber',
  adults: 'adults',
  ad: 'adults',
  adult: 'adults',
  children: 'children',
  child: 'children',
  ch: 'children',
  infants: 'infants',
  infant: 'infants',
  inf: 'infants',
  'tour leaders': 'tourLeaders',
  tl: 'tourLeaders',
  foc: 'tourLeaders',
  park: 'parkFee',
  'park fee': 'parkFee',
  npf: 'parkFee',
  'national park': 'parkFee',
  canoe: 'canoe',
  canoeing: 'canoe',
  note: 'note',
  notes: 'note',
  remark: 'note',
  cot: 'cashOnTour',
  'cash on tour': 'cashOnTour',
  cash: 'cashOnTour',
}

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function cell(row: unknown[], index: number) {
  return String(row[index] ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\u200e/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function num(row: unknown[], index: number) {
  const t = cell(row, index).replace(/,/g, '')
  if (!t || t === '-') return 0
  const n = Number(t)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

export function inferYearMonthFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, '')
  const ymd = base.match(/(20\d{2})[-_./](\d{1,2})/)
  if (ymd) {
    const month = Number(ymd[2])
    if (month >= 1 && month <= 12) {
      return `${ymd[1]}-${String(month).padStart(2, '0')}`
    }
  }
  const named = base.match(
    /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[^0-9]*(?:'?|\.)(\d{2})\b/i,
  )
  if (named) {
    const key = named[1].toLowerCase().replace(/[^a-z]/g, '')
    const monthKey = Object.keys(MONTH_NAMES).find((m) => key.startsWith(m.replace(/[^a-z]/g, '')))
    const month = monthKey ? MONTH_NAMES[monthKey] : MONTH_NAMES[key.slice(0, 3)]
    if (month) {
      const year = 2000 + Number(named[2])
      return `${year}-${String(month).padStart(2, '0')}`
    }
  }
  return null
}

export function isGoodDayDaySheetWorkbook(sheetNames: string[]) {
  const daySheets = sheetNames.filter((name) => {
    const day = Number(name)
    return Number.isInteger(day) && day >= 1 && day <= 31
  })
  return daySheets.length >= 2
}

function recordFromMappedRow(mapped: Record<string, string | number>) {
  return normalizeBookingImageDraft(mapped)
}

function findHeaderRow(rows: unknown[][]) {
  for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
    const row = rows[index]
    if (!Array.isArray(row)) continue
    let hits = 0
    for (const cellValue of row) {
      const key = HEADER_ALIASES[normalizeHeader(cellValue)]
      if (key) hits += 1
    }
    if (hits >= 3) return index
  }
  return 0
}

function parseGenericSheet(
  sheetName: string,
  rows: unknown[][],
  idPrefix: string,
): { rows: BookingSpreadsheetRow[]; skipped: number } {
  const headerIndex = findHeaderRow(rows)
  const headerRow = rows[headerIndex] ?? []
  const columnMap: Array<{ field: string; index: number }> = []
  headerRow.forEach((header, index) => {
    const field = HEADER_ALIASES[normalizeHeader(header)]
    if (field && field !== 'agentSlug') columnMap.push({ field, index })
  })

  if (columnMap.length === 0) {
    return { rows: [], skipped: rows.length }
  }

  const out: BookingSpreadsheetRow[] = []
  let skipped = headerIndex + 1

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (!Array.isArray(row)) {
      skipped += 1
      continue
    }
    const mapped: Record<string, string | number> = {}
    let hasData = false
    for (const { field, index } of columnMap) {
      const raw = cell(row, index)
      if (!raw) continue
      hasData = true
      if (field === 'adults' || field === 'children' || field === 'infants' || field === 'tourLeaders') {
        mapped[field] = num(row, index)
      } else {
        mapped[field] = raw
      }
    }
    if (!hasData) {
      skipped += 1
      continue
    }
    const draft = recordFromMappedRow(mapped)
    if (!draft.leadGuest && !draft.agentRef && !draft.pickupHotel) {
      skipped += 1
      continue
    }
    out.push({
      id: `${idPrefix}-${sheetName}-${rowIndex + 1}`,
      sheet: sheetName,
      rowNumber: rowIndex + 1,
      draft,
    })
  }

  return { rows: out, skipped }
}

function isJameBondMarker(row: unknown[]) {
  const line = [0, 1, 2, 3, 4, 5]
    .map((i) => cell(row, i))
    .filter(Boolean)
    .join(' | ')
    .toLowerCase()
  return /jame\s*bond/.test(line) && !/phi phi/.test(line)
}

function isPhiPhiProduct(row: unknown[]) {
  const text = `${cell(row, 0)} ${cell(row, 3)}`
  return /phi phi/i.test(text) && /private speed|island tour/i.test(text)
}

function isJamesBondProduct(row: unknown[]) {
  return /james bond island/i.test(`${cell(row, 0)} ${cell(row, 3)}`)
}

function isTotalsRow(row: unknown[]) {
  return !cell(row, 1) && !cell(row, 3) && num(row, 7) > 0
}

function isHeaderRow(row: unknown[]) {
  const a = cell(row, 1).toLowerCase()
  const n = cell(row, 3).toLowerCase()
  return a === 'agent' || n === 'name' || cell(row, 0).startsWith('ใบงาน')
}

function isJunkGuest(guest: string) {
  return /phi phi island tour|private speed boat|james bond island tour/i.test(guest)
}

function parkExcluded(remark: string) {
  return /excl(?:uding)?(?:\s*national)?(?:\s*park)?|\bexc\b[\s.]*npf|exc\s*npf|npf\s*excl/i.test(
    remark,
  )
}

function parkIncludedRemark(remark: string) {
  return /inc(?:luding)?\s*npf|inc\s*npf|including national/i.test(remark)
}

function canoeFromRemark(remark: string, program: string) {
  if (program !== 'James Bond') return 'Included' as const
  if (/no canoe|exc(?:luded|luding)?\s*(?:sea\s*)?canoe|exc\s*canoe/i.test(remark)) {
    return 'Not Included' as const
  }
  return 'Included' as const
}

function normalizeZone(zone: string, hotel: string) {
  const z = zone.trim()
  const zl = z.toLowerCase()
  if (zl === 'private' || zl === 'privat') return 'Private'
  if (zl === 'patong') return 'Patong'
  if (zl === 'kata') return 'Kata'
  if (zl === 'karon') return 'Karon'
  if (zl === 'kamala') return 'Kamala'
  if (/no\s*tran/i.test(hotel) && !z) return 'No Transfer'
  if (!z) return 'Other'
  return z
}

function parseGoodDaySheet(
  sheetName: string,
  dateIso: string,
  rows: unknown[][],
  idPrefix: string,
): BookingSpreadsheetRow[] {
  const out: BookingSpreadsheetRow[] = []
  let program: 'PP' | 'James Bond' = 'PP'
  let justSawJameBond = false

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (!Array.isArray(row)) continue

    if (isJameBondMarker(row)) {
      program = 'James Bond'
      justSawJameBond = true
      continue
    }
    if (isPhiPhiProduct(row)) {
      program = 'PP'
      justSawJameBond = false
      continue
    }
    if (isJamesBondProduct(row)) {
      program = 'James Bond'
      justSawJameBond = false
      continue
    }
    if (cell(row, 0).startsWith('ใบงาน')) {
      justSawJameBond = false
      continue
    }
    if (isHeaderRow(row)) continue
    if (isTotalsRow(row)) continue

    const agentRaw = cell(row, 1)
    const voucher = cell(row, 2).replace(/^-+$/, '')
    const guest = cell(row, 3)
    const hotelRaw = cell(row, 5)
    const room = cell(row, 6)
    const adults = num(row, 7)
    const children = num(row, 8)
    const infants = num(row, 9)
    const tourLeaders = num(row, 10)
    const cotRaw = cell(row, 11)
    const remark = cell(row, 12)
    const zoneRaw = cell(row, 14)

    if (!guest && !voucher && !agentRaw) continue
    if (!guest || isJunkGuest(guest)) continue
    if (adults + children + infants + tourLeaders < 1) continue

    const zone = normalizeZone(zoneRaw, hotelRaw)
    let parkFee: 'Included' | 'Not Included' = 'Included'
    if (parkExcluded(remark)) parkFee = 'Not Included'
    else if (parkIncludedRemark(remark)) parkFee = 'Included'

    const draft = normalizeBookingImageDraft({
      agentName: agentRaw,
      agentRef: voucher,
      program,
      date: dateIso,
      parkFee,
      canoe: canoeFromRemark(remark, program),
      adults,
      children,
      infants,
      tourLeaders,
      leadGuest: guest,
      pickupHotel: hotelRaw,
      pickupZone: zone,
      roomNumber: room,
      note: remark,
      cashOnTour: cotRaw,
      confidence: 'high',
      warnings: [],
    })

    if (/cxl|cancel|ยกเลิก/i.test(remark)) {
      draft.warnings.push('Row looks cancelled in remarks — skipped by default.')
    }

    out.push({
      id: `${idPrefix}-${sheetName}-${rowIndex + 1}`,
      sheet: sheetName,
      rowNumber: rowIndex + 1,
      draft,
    })
  }

  return out
}

export async function parseBookingSpreadsheetFile(
  file: File,
  options?: { yearMonth?: string },
): Promise<ParseSpreadsheetResult> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', raw: false })
  const sheetNames = workbook.SheetNames
  const idPrefix = `import-${Date.now()}`
  const inferred = inferYearMonthFromFileName(file.name)
  const yearMonth = options?.yearMonth?.trim() || inferred || ''

  if (isGoodDayDaySheetWorkbook(sheetNames)) {
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return {
        format: 'goodday',
        rows: [],
        skipped: 0,
        needsMonth: true,
        inferredYearMonth: inferred ?? undefined,
      }
    }
    const [yearStr, monthStr] = yearMonth.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    const allRows: BookingSpreadsheetRow[] = []
    let skipped = 0

    for (const sheetName of sheetNames) {
      const day = Number(sheetName)
      if (!Number.isInteger(day) || day < 1 || day > 31) continue
      const dateIso = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`
      const parsed = new Date(`${dateIso}T12:00:00`)
      if (parsed.getMonth() + 1 !== month) {
        skipped += 1
        continue
      }
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: false,
      }) as unknown[][]

      allRows.push(...parseGoodDaySheet(sheetName, dateIso, rows, idPrefix))
    }

    return { format: 'goodday', rows: allRows, skipped }
  }

  const allRows: BookingSpreadsheetRow[] = []
  let skipped = 0
  for (const sheetName of sheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][]
    const parsed = parseGenericSheet(sheetName, rows, idPrefix)
    allRows.push(...parsed.rows)
    skipped += parsed.skipped
  }

  return { format: 'generic', rows: allRows, skipped }
}

export function defaultSelectedForImportRow(draft: BookingImageDraft) {
  if (draft.warnings.some((w) => /cancelled/i.test(w))) return false
  return draftReadyForImport(draft)
}

function draftReadyForImport(draft: BookingImageDraft) {
  return Boolean(
    draft.program &&
      draft.date &&
      draft.leadGuest.trim() &&
      draft.adults + draft.children + draft.infants + draft.tourLeaders > 0,
  )
}

export function emptyImportSelection(rows: BookingSpreadsheetRow[]) {
  return rows.map((row) => ({
    ...row,
    selected: defaultSelectedForImportRow(row.draft),
  }))
}

export type BookingSpreadsheetImportRow = BookingSpreadsheetRow & { selected: boolean }
