'use client'

import {
  COMPANY_LOGO_SRC,
  formatInvoiceDate,
  formatInvoiceMoney,
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
    <div className="mt-8 grid grid-cols-3 gap-6 text-center text-[11px] text-neutral-700">
      <div>
        <p>ผู้รับเงิน</p>
        <div className="mx-auto mt-10 w-36 border-t border-neutral-400 pt-1">วันที่</div>
      </div>
      <div>
        <p>ผู้รับเงิน</p>
        <div className="mx-auto mt-10 w-36 border-t border-neutral-400 pt-1">วันที่</div>
      </div>
      <div>
        <p>ในนาม {settings.companyName}</p>
        <p className="mt-8 font-medium text-neutral-900">{settings.issuerName}</p>
        <p>{paid ? 'ออกใบเสร็จ' : settings.issuerTitle}</p>
      </div>
    </div>
  )
}

function LineTable({
  doc,
  emptyRows = 6,
}: {
  doc: InvoiceDocument
  emptyRows?: number
}) {
  const filler = Math.max(0, emptyRows - doc.items.length)
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className="bg-[#f3d4ff] text-neutral-900">
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">ลำดับ</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">วันที่</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">Voucher No.</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">รายละเอียด</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">Ad</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">Chd</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">ราคา/หน่วย</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">ราคา/หน่วย</th>
          <th className="border border-neutral-400 px-1.5 py-1.5 font-semibold">จำนวนเงิน</th>
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
    mode === 'receipt'
      ? 'ใบเสร็จรับเงิน / RECEIPT'
      : mode === 'billing_note'
        ? 'ใบวางบิล / BILLING NOTE'
        : 'ใบแจ้งหนี้ / INVOICE'
  const number = mode === 'receipt' ? (doc.receiptNo ?? doc.number) : doc.number
  const related = (linked ?? []).filter((item) => doc.linkedInvoiceIds.includes(item.id))

  return (
    <article className="invoice-print-page bg-white text-neutral-900">
      <CompanyHead settings={settings} />
      <p className="mt-5 text-center text-lg font-semibold tracking-wide">{title}</p>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-10 gap-y-1 text-[12px]">
        <p>
          <span className="inline-block w-24 text-neutral-500">นามลูกค้า</span>
          {doc.agentName}
        </p>
        <p>
          <span className="inline-block w-14 text-neutral-500">เลขที่</span>
          {number}
        </p>
        <p>
          <span className="inline-block w-24 text-neutral-500">ที่อยู่</span>
          Agent
        </p>
        <p>
          <span className="inline-block w-14 text-neutral-500">วันที่</span>
          {formatInvoiceDate(doc.issueDate)}
        </p>
      </div>

      {mode === 'billing_note' ? (
        <table className="mt-4 w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#f3d4ff] text-neutral-900">
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
          <LineTable doc={doc} />
        </div>
      )}

      <div className="mt-3 grid grid-cols-[1fr_16rem] items-start gap-4">
        <div>
          <p className="text-[11px] text-neutral-500">หมายเหตุ :</p>
          {doc.notes ? <p className="mt-1 text-[11px]">{doc.notes}</p> : null}
          <div className="mt-3">
            <BankBlock settings={settings} />
          </div>
        </div>
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            <tr className="bg-[#f3d4ff]">
              <td className="border border-neutral-400 px-2 py-1.5 font-semibold">ศูนย์รวม / GRAND TOTAL</td>
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
        </p>
      ) : null}

      <SignatureBlock settings={settings} paid={mode === 'receipt'} />
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
  const showSummary = doc.kind === 'invoice'
  return (
    <div className="invoice-print-bundle space-y-0">
      {showSummary ? (
        <div className="invoice-print-break">
          <InvoicePrintSheet doc={doc} settings={settings} mode="billing_note" linked={linked} />
        </div>
      ) : null}
      <InvoicePrintSheet
        doc={doc}
        settings={settings}
        linked={linked}
        mode={doc.kind === 'billing_note' ? 'billing_note' : 'invoice'}
      />
    </div>
  )
}
