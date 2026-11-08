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
  input: { month: string; day: string; range: AllotmentExportRange | null; today: string; includeFuture: boolean },
) {
  return lines.filter((line) => {
    if (input.day && line.date !== input.day) return false
    if (!input.day && input.month && line.date.slice(0, 7) !== input.month) return false
    if (input.range && (line.date < input.range.from || line.date > input.range.to)) return false
    if (!input.day && !input.includeFuture && line.date > input.today) return false
    return true
  })
}

export function allotmentExportPeriodLabel(input: {
  month: string
  day: string
  lotLabel: string
  includeFuture: boolean
  lines: AllotmentSheetLine[]
}) {
  const parts = [
    input.day
      ? formatShortDate(input.day)
      : input.month
        ? formatMonthLabel(`${input.month}-01`)
        : 'All months',
    input.lotLabel || 'All lots',
    input.day ? '' : input.includeFuture ? 'With future bookings' : 'Up to today',
  ].filter(Boolean)
  if (!input.month && !input.day && input.lines.length > 0) {
    const first = input.lines[0]!.date
    const last = input.lines[input.lines.length - 1]!.date
    parts[0] = first === last ? formatShortDate(first) : `${formatShortDate(first)} – ${formatShortDate(last)}`
  }
  return parts.join(' · ')
}

function lineType(line: AllotmentSheetLine) {
  if (line.kind === 'manual') return 'Top up'
  if (line.kind === 'refund') return 'No transfer refund'
  if (line.kind === 'charge') return line.note || 'Extra charge'
  return 'Usage'
}

function lineDetail(line: AllotmentSheetLine, options?: { hideInvoices?: boolean }) {
  if (line.kind === 'refund' || line.kind === 'charge') return line.note || lineType(line)
  if (line.kind === 'manual') return line.note.trim() || 'Top up'
  const guests = line.bookings.length
  const guestNote = guests > 0 ? `${guests} booking${guests === 1 ? '' : 's'}` : 'Used heads'
  const note = options?.hideInvoices
    ? line.note
        .split(' · ')
        .map((part) => part.trim())
        .filter((part) => part && !/\bINV\b/i.test(part))
        .join(' · ')
    : line.note.trim()
  return [guestNote, note].filter(Boolean).join(' · ')
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
        booking.status === 'Canceled'
          ? 'Canceled'
          : line.childrenInvoiced > 0 && booking.children > 0
            ? `${booking.children} CH invoiced`
            : '',
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

const ALLOTMENT_PRINT_STYLE_ID = 'allotment-sheet-print-style'
const ALLOTMENT_PRINT_PREVIEW_ID = 'allotment-sheet-print-preview'
const ALLOTMENT_PRINT_BAR_ID = 'allotment-sheet-print-bar'

let allotmentPrintTitle: string | null = null
let allotmentPrintOnKeydown: ((event: KeyboardEvent) => void) | null = null

/** Phones ignore print() on a hidden iframe. Show the sheet, then print from a tap. */
function usesMobileAllotmentPrint() {
  const touchDesktop = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return (
    window.matchMedia('(max-width: 1023px)').matches ||
    touchDesktop ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  )
}

function closeAllotmentPrintPreview() {
  document.body.classList.remove('allotment-sheet-printing', 'allotment-sheet-print-open')
  document.getElementById(ALLOTMENT_PRINT_PREVIEW_ID)?.remove()
  document.getElementById(ALLOTMENT_PRINT_BAR_ID)?.remove()
  document.getElementById(ALLOTMENT_PRINT_STYLE_ID)?.remove()
  if (allotmentPrintOnKeydown) {
    document.removeEventListener('keydown', allotmentPrintOnKeydown)
    allotmentPrintOnKeydown = null
  }
  if (allotmentPrintTitle !== null) {
    document.title = allotmentPrintTitle
    allotmentPrintTitle = null
  }
}

function openAllotmentMobilePreview(title: string, body: string) {
  closeAllotmentPrintPreview()
  allotmentPrintTitle = document.title
  document.title = title
  document.body.classList.add('allotment-sheet-printing', 'allotment-sheet-print-open')

  const style = document.createElement('style')
  style.id = ALLOTMENT_PRINT_STYLE_ID
  style.textContent = ALLOTMENT_MOBILE_PRINT_CSS
  document.head.appendChild(style)

  const preview = document.createElement('div')
  preview.id = ALLOTMENT_PRINT_PREVIEW_ID
  preview.className = 'allotment-sheet-print-preview'
  preview.innerHTML = body
  document.body.appendChild(preview)

  const bar = document.createElement('div')
  bar.id = ALLOTMENT_PRINT_BAR_ID
  bar.className = 'allotment-sheet-print-bar'
  bar.innerHTML =
    '<p>Print or save as PDF</p><span>Swipe sideways to see every column. In the print menu, choose Save as PDF.</span><div><button type="button" data-action="print">Print</button><button type="button" data-action="close">Close</button></div>'
  bar.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const action = target.closest('button')?.getAttribute('data-action')
    if (action === 'print') window.print()
    if (action === 'close') closeAllotmentPrintPreview()
  })
  document.body.appendChild(bar)
  preview.scrollTop = 0
  bar.querySelector<HTMLButtonElement>('button[data-action="print"]')?.focus()

  allotmentPrintOnKeydown = (event) => {
    if (event.key === 'Escape') closeAllotmentPrintPreview()
  }
  document.addEventListener('keydown', allotmentPrintOnKeydown)
}

function printAllotmentDesktop(title: string, body: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; color: #142824; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { margin: 0 0 12px; font-size: 12px; color: #3d5c54; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #d5e3dc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #e7eee9; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .guests { margin: 4px 0; }
  .guests th { background: #f4faf7; }
  .cancel { color: #dc2626; font-weight: 600; }
  .refund { color: #be123c; }
  @page { size: A4 landscape; margin: 12mm; }
</style></head><body>${body}</body></html>`

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
                const status =
                  booking.status === 'Canceled'
                    ? 'Canceled'
                    : line.childrenInvoiced > 0 && booking.children > 0
                      ? `${booking.children} CH invoiced`
                      : ''
                return `<tr><td>${escapeHtml(booking.agentRef || '—')}</td><td>${escapeHtml(booking.guestName || '—')}</td><td>${escapeHtml(booking.hotel || '—')}</td><td>${booking.noTransfer ? 'NoTF' : ''}</td><td class="num">${booking.adults}</td><td class="num">${booking.children}</td><td class="num refund">${refund}</td><td class="${booking.status === 'Canceled' ? 'cancel' : ''}">${escapeHtml(status)}</td></tr>`
              })
              .join('')}</tbody></table></td></tr>`
      return `<tr><td>${escapeHtml(formatShortDate(line.date))}</td><td>${escapeHtml(lineType(line))}</td><td>${escapeHtml(lineDetail(line, { hideInvoices: true }))}</td><td class="num">${line.headsDelta > 0 ? '+' : ''}${line.headsDelta}</td><td class="num">${line.headsLeft}</td><td class="num">${line.moneyDelta == null ? '—' : money(line.moneyDelta)}</td><td class="num">${money(line.moneyLeft)}</td></tr>${bookingRows}`
    })
    .join('')

  const title = `Allotment · ${input.agentName}`
  const body = `<div class="sheet"><h1>${escapeHtml(input.agentName)} · ${escapeHtml(input.programLabel)}</h1>
<p class="meta">${escapeHtml(input.periodLabel)} · Used ${headsUsed} heads · Left ${last?.headsLeft ?? 0} heads · ${money(last?.moneyLeft ?? 0)} THB</p>
<table><thead><tr><th>Date</th><th>Type</th><th>Detail</th><th>Heads</th><th>Heads left</th><th>Money</th><th>Money left</th></tr></thead><tbody>${ledgerRows}</tbody></table></div>`

  if (usesMobileAllotmentPrint()) {
    openAllotmentMobilePreview(title, body)
    return
  }
  printAllotmentDesktop(title, body)
}

const ALLOTMENT_MOBILE_PRINT_CSS = `
  body.allotment-sheet-print-open {
    overflow: hidden;
  }
  .allotment-sheet-print-preview {
    position: fixed;
    z-index: 130;
    inset: 0;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    background: #e7eeec;
    padding: 12px 12px calc(148px + env(safe-area-inset-bottom));
    color: #142824;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .allotment-sheet-print-preview .sheet {
    min-width: 720px;
    padding: 16px 14px;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 8px 24px rgba(4, 47, 46, 0.08);
  }
  .allotment-sheet-print-preview h1 {
    margin: 0 0 4px;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.3;
  }
  .allotment-sheet-print-preview .meta {
    margin: 0 0 12px;
    font-size: 12px;
    color: #3d5c54;
  }
  .allotment-sheet-print-preview table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  .allotment-sheet-print-preview th,
  .allotment-sheet-print-preview td {
    border: 1px solid #d5e3dc;
    padding: 4px 6px;
    text-align: left;
    vertical-align: top;
  }
  .allotment-sheet-print-preview th {
    background: #e7eee9;
  }
  .allotment-sheet-print-preview .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .allotment-sheet-print-preview .guests {
    margin: 4px 0;
  }
  .allotment-sheet-print-preview .guests th {
    background: #f4faf7;
  }
  .allotment-sheet-print-preview .cancel {
    color: #dc2626;
    font-weight: 600;
  }
  .allotment-sheet-print-preview .refund {
    color: #be123c;
  }
  .allotment-sheet-print-bar {
    position: fixed;
    z-index: 140;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 14px calc(12px + env(safe-area-inset-bottom));
    background: #fff;
    border-top: 1px solid rgba(19, 78, 74, 0.15);
  }
  .allotment-sheet-print-bar p {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0f766e;
  }
  .allotment-sheet-print-bar span {
    margin: 0;
    font-size: 12px;
    line-height: 1.35;
    color: #3d5c54;
  }
  .allotment-sheet-print-bar div {
    display: flex;
    gap: 8px;
  }
  .allotment-sheet-print-bar button {
    height: 44px;
    flex: 1;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
  }
  .allotment-sheet-print-bar button[data-action='print'] {
    border: 0;
    background: #115e59;
    color: #fff;
  }
  .allotment-sheet-print-bar button[data-action='close'] {
    border: 1px solid rgba(19, 78, 74, 0.2);
    background: #fff;
    color: #134e4a;
  }
  @media print {
    @page {
      size: A4 landscape;
      margin: 12mm;
    }
    html,
    body.allotment-sheet-printing {
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      background: #fff !important;
    }
    body.allotment-sheet-printing > *:not(#allotment-sheet-print-preview) {
      display: none !important;
    }
    #allotment-sheet-print-preview {
      display: block !important;
      position: static !important;
      inset: auto !important;
      width: auto !important;
      height: auto !important;
      overflow: visible !important;
      padding: 0 !important;
      background: #fff !important;
    }
    #allotment-sheet-print-preview .sheet {
      min-width: 0 !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    #allotment-sheet-print-preview th {
      background: #e7eee9 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`
