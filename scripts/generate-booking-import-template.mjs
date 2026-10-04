/**
 * Generates public/templates/booking-import-template.xlsx and .csv
 * Run: node scripts/generate-booking-import-template.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'public', 'templates')
fs.mkdirSync(outDir, { recursive: true })

const headers = [
  'Date',
  'Program',
  'Agent',
  'Voucher',
  'Name',
  'Hotel',
  'ADL',
  'CHD',
  'INF',
  'COT',
  'Remark',
  'Pick Up',
  'Zone',
  'VAN',
]

const exampleRows = [
  [
    '5 Oct 26',
    'PP',
    'Good Day',
    'GDV-13699',
    'Mr. Example Guest',
    'Patong Resort',
    '2',
    '',
    '',
    '800',
    'Excluding National Park Fee',
    '08:00',
    'Patong',
    '',
  ],
  [
    '6 Oct 26',
    'James Bond',
    'Booking Window',
    'BW-12345',
    'Ms. Sample Name',
    'Kata Beach Hotel',
    '2',
    '1',
    '',
    '',
    '',
    '07:30',
    'Kata',
    '',
  ],
]

const blankRows = Array.from({ length: 8 }, () => headers.map(() => ''))

/** Optional banner row (same layout as pickup lists) — date also in Date column per row */
const sheetRows = [['5 Oct 26', '', '', '', '', '', '', '', '', '', '', '', '', ''], headers, ...exampleRows, ...blankRows]

const wb = XLSX.utils.book_new()
const ws = XLSX.utils.aoa_to_sheet(sheetRows)
for (const addr of Object.keys(ws)) {
  if (addr.startsWith('!')) continue
  const cell = ws[addr]
  if (!cell || typeof cell.v !== 'string' || !/^[0-9]{1,2} [A-Za-z]{3} [0-9]{2}$/.test(cell.v)) continue
  cell.t = 's'
  cell.z = '@'
}
ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }))
XLSX.utils.book_append_sheet(wb, ws, 'Bookings')

const xlsxPath = path.join(outDir, 'booking-import-template.xlsx')
XLSX.writeFile(wb, xlsxPath)

const csvPath = path.join(outDir, 'booking-import-template.csv')
const csvLines = sheetRows.map((row) =>
  row.map((cell) => {
    const s = String(cell ?? '')
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(','),
)
fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8')

console.log('Wrote', xlsxPath)
console.log('Wrote', csvPath)
