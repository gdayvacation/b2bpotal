'use client'

import {
  COMPANY_LOGO_SRC,
  formatInvoiceDate,
  formatInvoiceMoney,
  formatPaymentChannel,
  invoiceTravelRange,
  type InvoiceDocument,
  type InvoiceSettings,
} from '@/lib/invoice'

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
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">Voucher No.</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">Description</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">AD</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">CH</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">AD price</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">CH price</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {doc.items.map((item, index) => (
          <tr key={item.id}>
            <td className="border border-neutral-300 px-1.5 py-1 text-center">{index + 1}</td>
            <td className="border border-neutral-300 px-1.5 py-1 whitespace-nowrap">
              {formatInvoiceDate(item.travelDate)}
            </td>
            <td className="border border-neutral-300 px-1.5 py-1">{item.voucherNo}</td>
            <td className="border border-neutral-300 px-1.5 py-1">{item.description}</td>
            <td className="border border-neutral-300 px-1.5 py-1 text-center">
              {item.adults || ''}
            </td>
            <td className="border border-neutral-300 px-1.5 py-1 text-center">
              {item.children || ''}
            </td>
            <td className="border border-neutral-300 px-1.5 py-1 text-right">
              {item.adultPrice ? formatInvoiceMoney(item.adultPrice) : ''}
            </td>
            <td className="border border-neutral-300 px-1.5 py-1 text-right">
              {item.childPrice ? formatInvoiceMoney(item.childPrice) : ''}
            </td>
            <td className="border border-neutral-300 px-1.5 py-1 text-right">
              {formatInvoiceMoney(item.amount)}
            </td>
          </tr>
        ))}
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
}: {
  doc: InvoiceDocument
  settings: InvoiceSettings
  linked?: InvoiceDocument[]
  mode?: 'invoice' | 'billing_note' | 'receipt'
}) {
  const title =
    mode === 'receipt' ? 'RECEIPT' : mode === 'billing_note' ? 'BILLING NOTE' : 'INVOICE'
  const number = mode === 'receipt' ? (doc.receiptNo ?? doc.number) : doc.number
  const related = (linked ?? []).filter((item) => doc.linkedInvoiceIds.includes(item.id))
  const tone = mode === 'receipt' ? 'receipt' : 'invoice'
  const accent = tone === 'receipt' ? 'bg-[#c8ecd4] text-emerald-950' : 'bg-[#f3d4ff] text-neutral-900'

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
        <p>
          <span className="inline-block w-24 text-neutral-500">Address</span>
        </p>
        <p>
          <span className="inline-block w-14 text-neutral-500">Date</span>
          {formatInvoiceDate(doc.issueDate)}
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
      ) : (
        <div className="mt-4">
          <LineTable doc={doc} tone={tone} />
        </div>
      )}

      <div className="mt-3 grid grid-cols-[1fr_16rem] items-start gap-4">
        <div>
          <p className="text-[11px] text-neutral-500">Remarks:</p>
          {doc.notes ? <p className="mt-1 text-[11px]">{doc.notes}</p> : null}
          <div className="mt-3">
            <BankBlock settings={settings} />
          </div>
        </div>
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            <tr className={accent}>
              <td className="border border-neutral-400 px-2 py-1.5 font-semibold">GRAND TOTAL</td>
              <td className="border border-neutral-400 px-2 py-1.5 text-right font-semibold">
                {formatInvoiceMoney(
                  related.length > 0
                    ? related.reduce((sum, item) => sum + item.grandTotal, 0)
                    : doc.grandTotal,
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {mode === 'receipt' ? (
        <p className="mt-4 text-center text-sm font-semibold tracking-wide text-emerald-800">
          PAID · {doc.paidAt ? formatInvoiceDate(doc.paidAt.slice(0, 10)) : formatInvoiceDate(doc.issueDate)}
          {formatPaymentChannel(doc.paymentChannel) ? ` · ${formatPaymentChannel(doc.paymentChannel)}` : ''}
        </p>
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
