import {
  nextDocumentNumber,
  type InvoiceDocument,
  type InvoiceKind,
} from '@/lib/invoice'
import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'

export function isDuplicateInvoiceNoError(message: string) {
  return /duplicate key|unique constraint|invoices_invoice_no_key|23505/i.test(message)
}

/** Build a minimal existing-docs list from cloud invoice numbers for nextDocumentNumber. */
export async function fetchCloudInvoiceNumberPool(): Promise<InvoiceDocument[]> {
  if (!hasSupabaseConfig()) return []
  try {
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_no, kind, issue_date, created_at, receipt_no, payments')
    if (error || !data) return []
    return data.map((row) => {
      const paymentsRaw = Array.isArray(row.payments) ? row.payments : []
      return {
        id: String(row.id),
        number: String(row.invoice_no ?? ''),
        kind: (row.kind === 'billing_note'
          ? 'billing_note'
          : row.kind === 'credit_note'
            ? 'credit_note'
            : 'invoice') as InvoiceKind,
        agentSlug: '',
        agentName: '',
        issueDate: String(row.issue_date ?? '').slice(0, 10),
        status: 'unpaid' as const,
        notes: '',
        grandTotal: 0,
        paidAt: null,
        paymentChannel: null,
        receiptNo: row.receipt_no ? String(row.receipt_no) : null,
        linkedInvoiceIds: [],
        items: [],
        payments: paymentsRaw.map(
          (payment: {
            receiptNo?: string
            amount?: number
            paidDate?: string
            id?: string
          }) => ({
            id: String(payment.id || crypto.randomUUID()),
            amount: Number(payment.amount) || 0,
            paidDate: String(payment.paidDate ?? '').slice(0, 10),
            channel: 'deduct_deposit' as const,
            receiptNo: String(payment.receiptNo ?? ''),
          }),
        ),
        createdAt: String(row.created_at ?? new Date().toISOString()),
        sendToAgent: false,
      }
    })
  } catch {
    return []
  }
}

export async function allocateUniqueDocumentNumber(
  doc: InvoiceDocument,
  localPool: InvoiceDocument[] = [],
): Promise<InvoiceDocument> {
  const cloud = await fetchCloudInvoiceNumberPool()
  const pool = [
    ...cloud,
    ...localPool.filter((row) => !cloud.some((c) => c.id === row.id)),
  ]
  if (
    !pool.some(
      (row) => row.kind === doc.kind && row.number === doc.number && row.id !== doc.id,
    )
  ) {
    return doc
  }
  return {
    ...doc,
    number: nextDocumentNumber(pool, doc.kind, doc.issueDate),
  }
}
