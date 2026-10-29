import type { AllotmentSheetLine } from '@/lib/allotment-sheet'
import { formatMonthLabel, formatShortDate } from '@/lib/format'
import type { AgentAllotment } from '@/lib/supabase/agent-allotment-db'

export type AllotmentExportRange = {
  from: string
  to: string
}

function lotOpen(lot: AgentAllotment) {
  return (lot.paidDate || lot.createdAt).slice(0, 10)
}

function dayBefore(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, month - 1, day - 1)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function sortAllotmentLots(lots: AgentAllotment[]) {
  return [...lots].sort(
    (a, b) => lotOpen(a).localeCompare(lotOpen(b)) || a.createdAt.localeCompare(b.createdAt),
  )
}

/** Inclusive dates this lot covers on the running sheet. */
export function allotmentLotRange(lots: AgentAllotment[], lotId: string): AllotmentExportRange | null {
  const sorted = sortAllotmentLots(lots)
  const index = sorted.findIndex((lot) => lot.id === lotId)
  if (index < 0) return null
  const from = lotOpen(sorted[index]!)
  const next = sorted[index + 1]
  return { from, to: next ? dayBefore(lotOpen(next)) : '9999-12-31' }
}

export function filterAllotmentSheetLines(
  lines: AllotmentSheetLine[],
  input: { month: string; range: AllotmentExportRange | null; today: string; includeFuture: boolean },
) {
  return lines.filter((line) => {
    if (input.month && line.date.slice(0, 7) !== input.month) return false
    if (input.range && (line.date < input.range.from || line.date > input.range.to)) return false
    if (!input.includeFuture && line.date > input.today) return false
    return true
  })
}

export function allotmentExportPeriodLabel(input: {
  month: string
  lotLabel: string
  includeFuture: boolean
  lines: AllotmentSheetLine[]
}) {
  const parts = [
    input.month ? formatMonthLabel(`${input.month}-01`) : 'All months',
    input.lotLabel || 'All lots',
    input.includeFuture ? 'With future bookings' : 'Up to today',
  ]
  if (!input.month && input.lines.length > 0) {
    const first = input.lines[0]!.date
    const last = input.lines[input.lines.length - 1]!.date
    parts[0] = first === last ? formatShortDate(first) : `${formatShortDate(first)} – ${formatShortDate(last)}`
  }
  return parts.join(' · ')
}

function lineType(line: AllotmentSheetLine) {
  if (line.kind === 'manual') return 'Top up'
  if (line.kind === 'refund') return 'No transfer refund'
  return 'Usage'
}

function lineDetail(line: AllotmentSheetLine) {
  if (line.kind === 'refund') return 'No transfer refund'
  if (line.kind === 'manual') return line.note.trim() || 'Top up'
  const guests = line.bookings.length
  const guestNote = guests > 0 ? `${guests} booking${guests === 1 ? '' : 's'}` : 'Used heads'
  return [guestNote, line.note.trim()].filter(Boolean).join(' · ')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function fileSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'agent'
}

export function allotmentExportFilename(agentName: string, program: string, period: string) {
  const stamp = fileSlug(period) || 'all'
  return `allotment-${fileSlug(agentName)}-${fileSlug(program)}-${stamp}`
}

export async function downloadAllotmentExcel(input: {
  agentName: string
  programLabel: string
  periodLabel: string
  lines: AllotmentSheetLine[]
  filename: string
}) {
  const XLSX = await import('xlsx')
  const counted = input.lines.filter((line) => line.counted)
  const last = counted.at(-1) ?? input.lines.at(-1)
  const headsAdded = counted
    .filter((line) => line.kind === 'manual')
    .reduce((sum, line) => sum + line.headsDelta, 0)
  const headsUsed = counted
    .filter((line) => line.kind === 'usage')
    .reduce((sum, line) => sum + -line.headsDelta, 0)

  const ledger = [
    ['Agent', input.agentName],
    ['Program', input.programLabel],
    ['Period', input.periodLabel],
    ['Heads added', headsAdded],
    ['Heads used', headsUsed],
    ['Heads left', last?.headsLeft ?? 0],
    ['Money left', last?.moneyLeft ?? 0],
    [],
    ['Date', 'Type', 'Detail', 'Heads', 'Heads left', 'Money', 'Money left'],
    ...input.lines.map((line) => [
      line.date,
      lineType(line),
      lineDetail(line),
      line.headsDelta,
      line.headsLeft,
      line.moneyDelta ?? '',
      line.moneyLeft,
    ]),
  ]
  const bookings = [
    ['Date', 'Agent reference', 'Guest', 'Hotel', 'Adults', 'Children', 'Transfers', 'Refund', 'Status'],
    ...input.lines.flatMap((line) =>
      line.bookings.map((booking) => [
        line.date,
        booking.agentRef,
        booking.guestName,
        booking.hotel,
        booking.adults,
        booking.children,
        booking.noTransfer ? 'NoTF' : '',
        booking.noTransfer
          ? -(booking.adults + booking.children) * 100
          : '',
        booking.status === 'Canceled' ? 'Canceled' : '',
      ]),
    ),
  ]

  const workbook = XLSX.utils.book_new()
  const ledgerSheet = XLSX.utils.aoa_to_sheet(ledger)
  ledgerSheet['!cols'] = [12, 14, 42, 12, 12, 14, 14].map((wch) => ({ wch }))
  const bookingSheet = XLSX.utils.aoa_to_sheet(bookings)
  bookingSheet['!cols'] = [12, 18, 24, 24, 10, 10, 12, 12, 14].map((wch) => ({ wch }))
  XLSX.utils.book_append_sheet(workbook, ledgerSheet, 'Ledger')
  XLSX.utils.book_append_sheet(workbook, bookingSheet, 'Bookings')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  triggerDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    input.filename.endsWith('.xlsx') ? input.filename : `${input.filename}.xlsx`,
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function printAllotmentPdf(input: {
  agentName: string
  programLabel: string
  periodLabel: string
  lines: AllotmentSheetLine[]
}) {
  const counted = input.lines.filter((line) => line.counted)
  const last = counted.at(-1) ?? input.lines.at(-1)
  const headsUsed = counted
    .filter((line) => line.kind === 'usage')
    .reduce((sum, line) => sum + -line.headsDelta, 0)
  const ledgerRows = input.lines
    .map((line) => {
      const bookingRows =
        line.bookings.length === 0
          ? ''
          : `<tr><td></td><td colspan="6"><table class="guests"><thead><tr><th>Reference</th><th>Guest</th><th>Hotel</th><th>Transfers</th><th>AD</th><th>CH</th><th>Refund</th><th>Status</th></tr></thead><tbody>${line.bookings
              .map((booking) => {
                const people = Math.max(0, booking.adults) + Math.max(0, booking.children)
                const refund = booking.noTransfer && people > 0 ? `-${(people * 100).toLocaleString('en-US')}` : ''
                const status = booking.status === 'Canceled' ? 'Canceled' : ''
                return `<tr><td>${escapeHtml(booking.agentRef || '—')}</td><td>${escapeHtml(booking.guestName || '—')}</td><td>${escapeHtml(booking.hotel || '—')}</td><td>${booking.noTransfer ? 'NoTF' : ''}</td><td class="num">${booking.adults}</td><td class="num">${booking.children}</td><td class="num refund">${refund}</td><td class="${status ? 'cancel' : ''}">${escapeHtml(status)}</td></tr>`
              })
              .join('')}</tbody></table></td></tr>`
      return `<tr><td>${escapeHtml(formatShortDate(line.date))}</td><td>${escapeHtml(lineType(line))}</td><td>${escapeHtml(lineDetail(line))}</td><td class="num">${line.headsDelta > 0 ? '+' : ''}${line.headsDelta}</td><td class="num">${line.headsLeft}</td><td class="num">${line.moneyDelta == null ? '—' : money(line.moneyDelta)}</td><td class="num">${money(line.moneyLeft)}</td></tr>${bookingRows}`
    })
    .join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Allotment · ${escapeHtml(input.agentName)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; color: #142824; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0 0 12px; font-size: 12px; color: #3d5c54; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #d5e3dc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #e7eee9; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .guests { margin: 4px 0; }
  .guests th { background: #f4faf7; }
  .cancel { color: #dc2626; font-weight: 600; }
  .refund { color: #be123c; }
  @page { size: A4 landscape; margin: 12mm; }
</style></head><body>
<h1>${escapeHtml(input.agentName)} · ${escapeHtml(input.programLabel)}</h1>
<p>${escapeHtml(input.periodLabel)} · Used ${headsUsed} heads · Left ${last?.headsLeft ?? 0} heads · ${money(last?.moneyLeft ?? 0)} THB</p>
<table><thead><tr><th>Date</th><th>Type</th><th>Detail</th><th>Heads</th><th>Heads left</th><th>Money</th><th>Money left</th></tr></thead><tbody>${ledgerRows}</tbody></table>
</body></html>`

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  const frameWindow = iframe.contentWindow
  if (!doc || !frameWindow) {
    iframe.remove()
    throw new Error('Could not open the PDF preview.')
  }
  doc.open()
  doc.write(html)
  doc.close()
  const cleanup = () => {
    frameWindow.removeEventListener('afterprint', cleanup)
    iframe.remove()
  }
  frameWindow.addEventListener('afterprint', cleanup)
  const print = () => {
    frameWindow.focus()
    frameWindow.print()
  }
  if (doc.readyState === 'complete') print()
  else iframe.addEventListener('load', print, { once: true })
  window.setTimeout(cleanup, 60_000)
}
