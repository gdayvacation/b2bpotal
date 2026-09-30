'use client'

import { useMemo } from 'react'
import {
  formatInvoiceMoney,
  invoiceBalance,
  invoicePaidTotal,
  NO_TRANSFER_DISCOUNT_PER_PERSON,
  parseAgentBillingType,
  prebuyDeductHeads,
  ratesForAgent,
  type AgencyInvoiceRates,
  type InvoiceDocument,
} from '@/lib/invoice'
import { isNoTransfer, type Booking } from '@/lib/types'
import { SoftLabel, Surface } from '@/components/ui-primitives'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Props = {
  invoices: InvoiceDocument[]
  rates: AgencyInvoiceRates[]
  bookings: Booking[]
  fromDate: string
  toDate: string
}

type AgentSummary = {
  agentSlug: string
  agentName: string
  billingType: 'prebuy' | 'invoice'
  invoiceCount: number
  creditCount: number
  billed: number
  paid: number
  balance: number
  prebuyHeads: number
  noTransferDiscount: number
  parkCharge: number
}

export function InvoiceMonthlySummary({
  invoices,
  rates,
  bookings,
  fromDate,
  toDate,
}: Props) {
  const rows = useMemo(() => {
    const docs = invoices.filter((doc) => {
      if (doc.issueDate >= fromDate && doc.issueDate <= toDate) return true
      return doc.items.some((item) => {
        const date = item.travelDate
        return Boolean(date) && date >= fromDate && date <= toDate
      })
    })
    const bookingByCode = new Map(bookings.map((booking) => [booking.code, booking]))
    const map = new Map<string, AgentSummary>()

    for (const doc of docs) {
      if (doc.kind === 'billing_note') continue
      const billingType = parseAgentBillingType(
        ratesForAgent(rates, doc.agentSlug).billingType,
      )
      const current = map.get(doc.agentSlug) ?? {
        agentSlug: doc.agentSlug,
        agentName: doc.agentName,
        billingType,
        invoiceCount: 0,
        creditCount: 0,
        billed: 0,
        paid: 0,
        balance: 0,
        prebuyHeads: 0,
        noTransferDiscount: 0,
        parkCharge: 0,
      }
      if (doc.kind === 'credit_note') {
        current.creditCount += 1
        current.billed += Number(doc.grandTotal) || 0
      } else {
        current.invoiceCount += 1
        current.billed += Number(doc.grandTotal) || 0
        current.paid += invoicePaidTotal(doc)
        current.balance += invoiceBalance(doc)
        if (billingType === 'prebuy') {
          current.prebuyHeads += prebuyDeductHeads(doc.items)
        }
      }
      for (const item of doc.items) {
        if (item.lineKind === 'park_fee') {
          current.parkCharge += Number(item.amount) || 0
        }
        if (/no transfer/i.test(item.description) && (Number(item.amount) || 0) < 0) {
          current.noTransferDiscount += Math.abs(Number(item.amount) || 0)
        }
      }
      // Fallback No TF from bookings if line missing on older invoices
      if (doc.kind === 'invoice' && billingType === 'invoice') {
        for (const code of new Set(doc.items.map((item) => item.bookingCode).filter(Boolean))) {
          const booking = bookingByCode.get(code)
          if (!booking || !isNoTransfer(booking.pickupZone)) continue
          const heads = Math.max(0, booking.adults) + Math.max(0, booking.children)
          if (heads <= 0) continue
          const expected = heads * NO_TRANSFER_DISCOUNT_PER_PERSON
          if (current.noTransferDiscount < expected) {
            // only fill gap when invoice lines didn't carry the discount yet
          }
        }
      }
      map.set(doc.agentSlug, current)
    }

    return [...map.values()].sort((a, b) => a.agentName.localeCompare(b.agentName))
  }, [bookings, fromDate, invoices, rates, toDate])

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          billed: acc.billed + row.billed,
          paid: acc.paid + row.paid,
          balance: acc.balance + row.balance,
          prebuyHeads: acc.prebuyHeads + row.prebuyHeads,
          noTransferDiscount: acc.noTransferDiscount + row.noTransferDiscount,
          parkCharge: acc.parkCharge + row.parkCharge,
          invoiceCount: acc.invoiceCount + row.invoiceCount,
          creditCount: acc.creditCount + row.creditCount,
        }),
        {
          billed: 0,
          paid: 0,
          balance: 0,
          prebuyHeads: 0,
          noTransferDiscount: 0,
          parkCharge: 0,
          invoiceCount: 0,
          creditCount: 0,
        },
      ),
    [rows],
  )

  if (rows.length === 0) {
    return (
      <Surface className="p-6">
        <p className="text-sm text-teal-900/55">No invoice activity in this date range.</p>
      </Surface>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Invoices" value={String(totals.invoiceCount)} />
        <SummaryCard label="Billed" value={`${formatInvoiceMoney(totals.billed)} THB`} />
        <SummaryCard label="Outstanding" value={`${formatInvoiceMoney(totals.balance)} THB`} />
        <SummaryCard
          label="Prebuy heads / No TF / Park"
          value={`${totals.prebuyHeads} · −${formatInvoiceMoney(totals.noTransferDiscount)} · ${formatInvoiceMoney(totals.parkCharge)}`}
        />
      </div>
      <Surface className="overflow-hidden">
        <div className="border-b border-teal-900/8 px-4 py-3">
          <SoftLabel>By agent</SoftLabel>
        </div>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">INV</TableHead>
              <TableHead className="text-right">CN</TableHead>
              <TableHead className="text-right">Billed</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Prebuy heads</TableHead>
              <TableHead className="text-right">No TF</TableHead>
              <TableHead className="text-right">Park</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.agentSlug}>
                <TableCell className="font-medium text-teal-950">{row.agentName}</TableCell>
                <TableCell>{row.billingType === 'prebuy' ? 'Prebuy' : 'Invoice'}</TableCell>
                <TableCell className="text-right tabular-nums">{row.invoiceCount}</TableCell>
                <TableCell className="text-right tabular-nums">{row.creditCount || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatInvoiceMoney(row.billed)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatInvoiceMoney(row.paid)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums text-teal-950">
                  {formatInvoiceMoney(row.balance)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.prebuyHeads || '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums text-rose-700">
                  {row.noTransferDiscount > 0
                    ? `−${formatInvoiceMoney(row.noTransferDiscount)}`
                    : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.parkCharge > 0 ? formatInvoiceMoney(row.parkCharge) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Surface>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Surface className="px-4 py-3">
      <p className="text-[11px] font-medium tracking-wide text-teal-900/45 uppercase">{label}</p>
      <p className="mt-1 text-sm font-semibold text-teal-950">{value}</p>
    </Surface>
  )
}
