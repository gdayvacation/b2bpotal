'use client'

import {
  COMPANY_LOGO_SRC,
  chargeUnit,
  formatInvoiceDate,
  formatInvoiceLineDescription,
  formatInvoiceMoney,
  formatPaymentChannel,
  invoiceBalance,
  invoicePaidTotal,
  invoicePayments,
  invoiceTravelRange,
  isGuestCollectLine,
  isLateReduceFeeLine,
  itemsAgentTotal,
  itemsGuestTotal,
  lateReduceFeeDisplay,
  prebuyDeductHeads,
  type InvoiceDocument,
  type InvoiceSettings,
} from '@/lib/invoice'
import { cn } from '@/lib/utils'

function CompanyHead({ settings }: { settings: InvoiceSettings }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="font-display text-2xl font-semibold tracking-tight text-neutral-900">
          {settings.companyName}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-700">{settings.addressTh}</p>
        <p className="text-[11px] leading-relaxed text-neutral-700">{settings.addressEn}</p>
      </div>
      <img
        src={COMPANY_LOGO_SRC}
        alt={settings.companyLegal}
        className="h-20 w-auto object-contain"
      />
    </div>
  )
}

function toneBar(tone: 'invoice' | 'receipt') {
  return tone === 'receipt'
    ? 'bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-600'
    : 'bg-gradient-to-r from-violet-500 via-pink-300 to-violet-400'
}

function DocumentTitle({
  title,
  tone,
}: {
  title: string
  tone: 'invoice' | 'receipt'
}) {
  return (
    <div className={`mt-5 overflow-hidden rounded-lg ${toneBar(tone)} px-4 py-2.5 text-center shadow-sm`}>
      <p className="text-[11px] font-medium tracking-[0.35em] text-white/75">
        GOOD DAY VACATION
      </p>
      <p className="text-lg font-semibold tracking-[0.28em] text-white">{title}</p>
    </div>
  )
}

function DocumentFooter({
  settings,
  tone,
  mode,
}: {
  settings: InvoiceSettings
  tone: 'invoice' | 'receipt'
  mode: 'invoice' | 'billing_note' | 'receipt'
}) {
  return (
    <footer className="mt-8 overflow-hidden rounded-lg border border-neutral-200">
      <div className={`h-1.5 ${toneBar(tone)}`} />
      <div className="flex items-end justify-between gap-4 bg-neutral-50 px-4 py-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-neutral-900">
            {settings.companyName}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-neutral-500">
            {settings.addressEn}
          </p>
        </div>
        <p className="shrink-0 text-right text-[10px] font-medium tracking-wide text-neutral-500">
          {mode === 'receipt' ? 'Thank you for your payment' : 'Thank you for your business'}
        </p>
      </div>
    </footer>
  )
}

function BankBlock({ settings }: { settings: InvoiceSettings }) {
  return (
    <div className="text-[11px] leading-relaxed text-neutral-800">
      <p className="font-semibold">Bank Details</p>
      <p>
        {settings.bankName} ({settings.bankAccountType})
      </p>
      <p>Account Name: {settings.bankAccountName}</p>
      <p>Account No. {settings.bankAccountNo}</p>
    </div>
  )
}

function SignatureBlock({
  settings,
  paid,
}: {
  settings: InvoiceSettings
  paid?: boolean
}) {
  return (
    <div className="mt-8 grid grid-cols-2 gap-10 text-center text-[11px] text-neutral-700">
      <div>
        <p>Customer name</p>
        <div className="mx-auto mt-10 w-40 border-t border-neutral-400 pt-1">Date</div>
      </div>
      <div>
        <p>For {settings.companyName}</p>
        {settings.signatureImage ? (
          <img
            src={settings.signatureImage}
            alt=""
            className="mx-auto mt-2 h-14 w-auto object-contain"
          />
        ) : (
          <div className="mt-8" />
        )}
        <p className="mt-1 font-medium text-neutral-900">{settings.issuerName}</p>
        <p>
          {paid
            ? 'Issued receipt'
            : settings.issuerTitle === 'ผู้อำนวยการ'
              ? 'Director'
              : settings.issuerTitle}
        </p>
      </div>
    </div>
  )
}

function LineTable({
  doc,
  emptyRows = 6,
  tone = 'invoice',
}: {
  doc: InvoiceDocument
  emptyRows?: number
  tone?: 'invoice' | 'receipt'
}) {
  const filler = Math.max(0, emptyRows - doc.items.length)
  const head = tone === 'receipt' ? 'bg-[#c8ecd4] text-emerald-950' : 'bg-[#f3d4ff] text-neutral-900'
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className={head}>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">No.</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">Date</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">Description</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">Unit</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">AD</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">CH</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">AD price</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">CH price</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {doc.items.map((item, index) => {
          const lateReduce = isLateReduceFeeLine(item) ? lateReduceFeeDisplay(item) : null
          return (
          <tr key={item.id} className={isGuestCollectLine(item) ? 'bg-orange-50/70 text-neutral-700' : undefined}>
            <td className="border border-neutral-300 px-1.5 py-1 text-center">{index + 1}</td>
            <td className="border border-neutral-300 px-1.5 py-1 whitespace-nowrap">
              {formatInvoiceDate(item.travelDate)}
            </td>
            <td className="border border-neutral-300 px-1.5 py-1">
              {formatInvoiceLineDescription(item)}
            </td>
            <td className="border border-neutral-300 px-1.5 py-1">
              {lateReduce ? (lateReduce.heads > 0 ? 'Pax' : 'Fee') : chargeUnit(item)}
            </td>
            <td className="border border-neutral-300 px-1.5 py-1 text-center">
              {lateReduce ? lateReduce.heads || '' : item.adults || ''}
            </td>
            <td className="border border-neutral-300 px-1.5 py-1 text-center">
              {item.children || ''}
            </td>
            <td className="border border-neutral-300 px-1.5 py-1 text-right">
              {lateReduce
                ? lateReduce.perPerson
                  ? formatInvoiceMoney(lateReduce.perPerson)
                  : ''
                : item.adultPrice
                  ? formatInvoiceMoney(item.adultPrice)
                  : ''}
            </td>
            <td className="border border-neutral-300 px-1.5 py-1 text-right">
              {item.childPrice ? formatInvoiceMoney(item.childPrice) : ''}
            </td>
            <td
              className={cn(
                'border border-neutral-300 px-1.5 py-1 text-right',
                item.amount < 0 && 'font-semibold text-rose-700',
              )}
            >
              {formatInvoiceMoney(item.amount)}
            </td>
          </tr>
          )
        })}
        {Array.from({ length: filler }, (_, index) => (
          <tr key={`empty-${index}`}>
            {Array.from({ length: 9 }, (__, cell) => (
              <td key={cell} className="border border-neutral-300 px-1.5 py-2.5">
                &nbsp;
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function InvoicePrintSheet({
  doc,
  settings,
  linked,
  mode = 'invoice',
  paymentId = null,
}: {
  doc: InvoiceDocument
  settings: InvoiceSettings
  linked?: InvoiceDocument[]
  mode?: 'invoice' | 'billing_note' | 'receipt'
  /** When printing a receipt for one instalment. */
  paymentId?: string | null
}) {
  const payments = invoicePayments(doc)
  const focusedPayment =
    mode === 'receipt'
      ? payments.find((row) => row.id === paymentId) ?? payments.at(-1) ?? null
      : null
  const title =
    mode === 'receipt' ? 'RECEIPT' : mode === 'billing_note' ? 'BILLING NOTE' : 'INVOICE'
  const number =
    mode === 'receipt'
      ? focusedPayment?.receiptNo || doc.receiptNo || doc.number
      : doc.number
  const related = (linked ?? []).filter((item) => doc.linkedInvoiceIds.includes(item.id))
  const tone = mode === 'receipt' ? 'receipt' : 'invoice'
  const accent = tone === 'receipt' ? 'bg-[#c8ecd4] text-emerald-950' : 'bg-[#f3d4ff] text-neutral-900'
  const prebuy =
    (doc.items.some((item) => item.lineKind === 'tour') &&
      doc.items.every((item) => item.lineKind !== 'tour' || item.amount === 0)) ||
    doc.items.some(
      (item) =>
        (item.lineKind === 'no_show' || item.lineKind === 'change_date') &&
        /deduct \d+ heads?/i.test(item.description),
    )
  const deductHeads = prebuy
    ? related.length > 0
      ? related.reduce((sum, item) => sum + prebuyDeductHeads(item.items), 0)
      : prebuyDeductHeads(doc.items)
    : 0
  const moneyTotal =
    mode === 'receipt' && focusedPayment
      ? focusedPayment.amount
      : related.length > 0
        ? related.reduce((sum, item) => sum + (item.grandTotal || itemsAgentTotal(item.items)), 0)
        : doc.grandTotal || itemsAgentTotal(doc.items)
  const receiptDate = focusedPayment?.paidDate ?? doc.paidAt?.slice(0, 10) ?? doc.issueDate
  const receiptChannel = focusedPayment?.channel ?? doc.paymentChannel

  return (
    <article className="invoice-print-page relative overflow-hidden bg-white text-neutral-900 [print-color-adjust:exact]">
      {mode === 'receipt' ? (
        <div
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
          aria-hidden
        >
          <div className="rotate-[-22deg] rounded-[2.5rem] border-[5px] border-neutral-400/40 px-12 py-5 text-7xl font-black tracking-[0.45em] text-neutral-400/35">
            PAID
          </div>
        </div>
      ) : null}
      <div className="relative z-10">
      <CompanyHead settings={settings} />
      <DocumentTitle title={title} tone={tone} />

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-10 gap-y-1 text-[12px]">
        <p>
          <span className="inline-block w-24 text-neutral-500">Customer</span>
          {doc.agentName}
        </p>
        <p>
          <span className="inline-block w-14 text-neutral-500">No.</span>
          {number}
        </p>
        {mode === 'receipt' ? (
          <p>
            <span className="inline-block w-24 text-neutral-500">Invoice</span>
            {doc.number}
          </p>
        ) : (
          <p>
            <span className="inline-block w-24 text-neutral-500">Voucher</span>
            {[...new Set(doc.items.map((item) => item.voucherNo.trim()).filter(Boolean))].join(', ') || '—'}
          </p>
        )}
        <p>
          <span className="inline-block w-14 text-neutral-500">Date</span>
          {formatInvoiceDate(mode === 'receipt' ? receiptDate : doc.issueDate)}
        </p>
      </div>

      {mode === 'billing_note' ? (
        <table className="mt-4 w-full border-collapse text-[11px]">
          <thead>
            <tr className={accent}>
              <th className="border border-neutral-400 px-2 py-1.5 text-left">Invoice No.</th>
              <th className="border border-neutral-400 px-2 py-1.5 text-left">Travel dates</th>
              <th className="border border-neutral-400 px-2 py-1.5 text-right">Lines</th>
              <th className="border border-neutral-400 px-2 py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(related.length > 0 ? related : [doc]).map((item) => (
              <tr key={item.id}>
                <td className="border border-neutral-300 px-2 py-1.5">{item.number}</td>
                <td className="border border-neutral-300 px-2 py-1.5">{invoiceTravelRange(item)}</td>
                <td className="border border-neutral-300 px-2 py-1.5 text-right">
                  {item.items.length}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5 text-right">
                  {formatInvoiceMoney(item.grandTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : mode === 'receipt' && focusedPayment ? (
        <table className="mt-4 w-full border-collapse text-[12px]">
          <thead>
            <tr className={accent}>
              <th className="border border-neutral-400 px-2 py-1.5 text-left">Description</th>
              <th className="border border-neutral-400 px-2 py-1.5 text-left">Channel</th>
              <th className="border border-neutral-400 px-2 py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-neutral-300 px-2 py-2">
                Payment received for invoice {doc.number}
                {invoiceBalance(doc) > 0.009
                  ? ` · balance left ${formatInvoiceMoney(invoiceBalance(doc))}`
                  : ' · paid in full'}
              </td>
              <td className="border border-neutral-300 px-2 py-2">
                {formatPaymentChannel(focusedPayment.channel)}
              </td>
              <td className="border border-neutral-300 px-2 py-2 text-right font-semibold tabular-nums">
                {formatInvoiceMoney(focusedPayment.amount)}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div className="mt-4">
          <LineTable doc={doc} tone={tone} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-[1fr_17rem] items-start gap-5">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-neutral-500">Remarks</p>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">
            {prebuy
              ? 'Pre-buy: tour / no-show / late change-date AD+CH deduct heads (no amount). Extras are billed. Not-included park is collected from the guest at check-in.'
              : 'Tour price and included park are billed to the agent. Not-included park is collected from the guest at check-in and is not deducted.'}
          </p>
          {doc.notes ? <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-800">{doc.notes}</p> : null}
          <div className="mt-3">
            <BankBlock settings={settings} />
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-neutral-400">
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {mode === 'receipt' && focusedPayment ? (
                <>
                  <tr>
                    <td className="border-b border-neutral-300 px-2.5 py-1.5 text-neutral-600">
                      Invoice total
                    </td>
                    <td className="border-b border-neutral-300 px-2.5 py-1.5 text-right tabular-nums text-neutral-700">
                      {formatInvoiceMoney(doc.grandTotal)}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-neutral-300 px-2.5 py-1.5 text-neutral-600">
                      Paid to date
                    </td>
                    <td className="border-b border-neutral-300 px-2.5 py-1.5 text-right tabular-nums text-neutral-700">
                      {formatInvoiceMoney(invoicePaidTotal(doc))}
                    </td>
                  </tr>
                  {invoiceBalance(doc) > 0.009 ? (
                    <tr className="bg-orange-100 text-orange-950">
                      <td className="border-b border-neutral-300 px-2.5 py-2 font-semibold">
                        Balance left
                      </td>
                      <td className="border-b border-neutral-300 px-2.5 py-2 text-right text-base font-bold tabular-nums">
                        {formatInvoiceMoney(invoiceBalance(doc))}
                      </td>
                    </tr>
                  ) : null}
                  <tr className={accent}>
                    <td className="px-2.5 py-2 font-semibold">This receipt</td>
                    <td className="px-2.5 py-2 text-right text-base font-bold tabular-nums">
                      {formatInvoiceMoney(focusedPayment.amount)}
                    </td>
                  </tr>
                </>
              ) : (
                <>
                  {itemsGuestTotal(doc.items) > 0 ? (
                    <tr>
                      <td className="border-b border-neutral-300 px-2.5 py-1.5 text-neutral-600">
                        Guest at marina
                      </td>
                      <td className="border-b border-neutral-300 px-2.5 py-1.5 text-right tabular-nums text-neutral-600">
                        {formatInvoiceMoney(itemsGuestTotal(doc.items))}
                      </td>
                    </tr>
                  ) : null}
                  {prebuy && deductHeads > 0 ? (
                    <tr className="bg-[#d8f3ea] text-teal-950">
                      <td className="border-b border-neutral-300 px-2.5 py-2 font-semibold">
                        Deduct heads
                      </td>
                      <td className="border-b border-neutral-300 px-2.5 py-2 text-right text-base font-bold tabular-nums">
                        {deductHeads}
                      </td>
                    </tr>
                  ) : null}
                  {invoicePaidTotal(doc) > 0 ? (
                    <tr>
                      <td className="border-b border-neutral-300 px-2.5 py-1.5 text-neutral-600">
                        Paid to date
                      </td>
                      <td className="border-b border-neutral-300 px-2.5 py-1.5 text-right tabular-nums text-neutral-700">
                        {formatInvoiceMoney(invoicePaidTotal(doc))}
                      </td>
                    </tr>
                  ) : null}
                  {invoiceBalance(doc) > 0.009 && invoicePaidTotal(doc) > 0 ? (
                    <tr className="bg-orange-100 text-orange-950">
                      <td className="border-b border-neutral-300 px-2.5 py-2 font-semibold">
                        Balance left
                      </td>
                      <td className="border-b border-neutral-300 px-2.5 py-2 text-right text-base font-bold tabular-nums">
                        {formatInvoiceMoney(invoiceBalance(doc))}
                      </td>
                    </tr>
                  ) : null}
                  <tr className={accent}>
                    <td className="px-2.5 py-2 font-semibold">
                      {prebuy ? 'To pay' : 'GRAND TOTAL'}
                    </td>
                    <td className="px-2.5 py-2 text-right text-base font-bold tabular-nums">
                      {formatInvoiceMoney(moneyTotal)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {mode === 'receipt' ? (
        <p className="mt-4 text-center text-sm font-semibold tracking-wide text-emerald-800">
          RECEIVED · {formatInvoiceDate(receiptDate)}
          {formatPaymentChannel(receiptChannel) ? ` · ${formatPaymentChannel(receiptChannel)}` : ''}
          {focusedPayment && invoiceBalance(doc) > 0.009
            ? ` · balance left ${formatInvoiceMoney(invoiceBalance(doc))}`
            : ''}
        </p>
      ) : payments.length > 0 ? (
        <div className="mt-4 rounded-md border border-neutral-300 px-3 py-2 text-[11px]">
          <p className="font-semibold text-neutral-800">Payment history</p>
          <ul className="mt-1 space-y-0.5 text-neutral-700">
            {payments.map((payment) => (
              <li key={payment.id} className="flex justify-between gap-3">
                <span>
                  {payment.receiptNo ? `${payment.receiptNo} · ` : ''}
                  {formatInvoiceDate(payment.paidDate)} · {formatPaymentChannel(payment.channel)}
                </span>
                <span className="tabular-nums">{formatInvoiceMoney(payment.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <SignatureBlock settings={settings} paid={mode === 'receipt'} />
      <DocumentFooter settings={settings} tone={tone} mode={mode} />
      </div>
    </article>
  )
}

export function InvoicePrintBundle({
  doc,
  settings,
  linked,
}: {
  doc: InvoiceDocument
  settings: InvoiceSettings
  linked?: InvoiceDocument[]
}) {
  return (
    <InvoicePrintSheet
      doc={doc}
      settings={settings}
      linked={linked}
      mode={doc.kind === 'billing_note' ? 'billing_note' : 'invoice'}
    />
  )
}
