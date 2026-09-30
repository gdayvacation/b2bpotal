import {
  formatAgentBillingType,
  formatInvoiceMoney,
  formatInvoicePayStatus,
  formatPaymentChannel,
  invoiceBalance,
  invoicePaidTotal,
  invoicePayments,
  parseAgentBillingType,
  prebuyDeductHeads,
  ratesForAgent,
  type AgencyInvoiceRates,
  type InvoiceDocument,
} from '@/lib/invoice'

export type InvoiceExportRow = {
  Number: string
  Kind: string
  Agent: string
  'Billing type': string
  'Issue date': string
  Status: string
  'Grand total': string
  Paid: string
  Balance: string
  'Payment channel': string
  Receipts: string
  'Send to agent': string
  'Prebuy deduct heads': string
  Notes: string
  'Booking codes': string
}

function kindLabel(kind: InvoiceDocument['kind']) {
  if (kind === 'billing_note') return 'Billing note'
  if (kind === 'credit_note') return 'Credit note'
  return 'Invoice'
}

export function invoicesToExportRows(
  docs: InvoiceDocument[],
  rates: AgencyInvoiceRates[],
): InvoiceExportRow[] {
  return docs.map((doc) => {
    const billing = parseAgentBillingType(ratesForAgent(rates, doc.agentSlug).billingType)
    const payments = invoicePayments(doc)
    return {
      Number: doc.number,
      Kind: kindLabel(doc.kind),
      Agent: doc.agentName,
      'Billing type': formatAgentBillingType(billing),
      'Issue date': doc.issueDate,
      Status: formatInvoicePayStatus(doc),
      'Grand total': formatInvoiceMoney(doc.grandTotal),
      Paid: formatInvoiceMoney(invoicePaidTotal(doc)),
      Balance: formatInvoiceMoney(invoiceBalance(doc)),
      'Payment channel': payments.map((p) => formatPaymentChannel(p.channel)).filter(Boolean).join('; '),
      Receipts: payments.map((p) => p.receiptNo).filter(Boolean).join('; '),
      'Send to agent': doc.sendToAgent ? 'Yes' : 'No',
      'Prebuy deduct heads':
        billing === 'prebuy' && doc.kind === 'invoice'
          ? String(prebuyDeductHeads(doc.items))
          : '',
      Notes: doc.notes ?? '',
      'Booking codes': [
        ...new Set(doc.items.map((item) => item.bookingCode).filter(Boolean)),
      ].join('; '),
    }
  })
}

const INVOICE_HEADERS = [
  'Number',
  'Kind',
  'Agent',
  'Billing type',
  'Issue date',
  'Status',
  'Grand total',
  'Paid',
  'Balance',
  'Payment channel',
  'Receipts',
  'Send to agent',
  'Prebuy deduct heads',
  'Notes',
  'Booking codes',
] as const satisfies readonly (keyof InvoiceExportRow)[]

function csvEscape(value: string | number) {
  const text = String(value ?? '')
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function downloadInvoiceCsv(rows: InvoiceExportRow[], filename: string) {
  const lines = [
    INVOICE_HEADERS.join(','),
    ...rows.map((row) => INVOICE_HEADERS.map((key) => csvEscape(row[key])).join(',')),
  ]
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, filename)
}

export async function downloadInvoiceXlsx(rows: InvoiceExportRow[], filename: string) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...INVOICE_HEADERS] })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Invoices')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, filename)
}

export function invoiceExportFilename(fromIso: string, toIso: string, ext: 'csv' | 'xlsx') {
  const stamp = fromIso === toIso ? fromIso : `${fromIso}_${toIso}`
  return `gday-invoices-${stamp}.${ext}`
}

export function buildInvoiceShareText(doc: InvoiceDocument) {
  const payments = invoicePayments(doc)
  const lines = [
    `${kindLabel(doc.kind)} ${doc.number}`,
    `Agent: ${doc.agentName}`,
    `Issue date: ${doc.issueDate}`,
    `Amount: ${formatInvoiceMoney(doc.grandTotal)} THB`,
    `Status: ${formatInvoicePayStatus(doc)}`,
    `Balance: ${formatInvoiceMoney(invoiceBalance(doc))} THB`,
  ]
  if (payments.length > 0) {
    lines.push(
      'Payments:',
      ...payments.map(
        (p) =>
          `  · ${formatInvoiceMoney(p.amount)} · ${formatPaymentChannel(p.channel)} · ${p.paidDate}${p.receiptNo ? ` · ${p.receiptNo}` : ''}`,
      ),
    )
  }
  if (doc.notes.trim()) lines.push(`Notes: ${doc.notes.trim()}`)
  return lines.join('\n')
}
