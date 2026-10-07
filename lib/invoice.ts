import { originalBookedPax, type BookedPaxSnapshot } from '@/lib/check-in-booked-pax'
import { DEFAULT_BOOKING_CUTOFFS } from '@/lib/booking-cutoffs'
import { formatShortDate, parkFeeRates, parkFeeTotalWithThai, parseCashOnTourAmount } from '@/lib/format'
import { THAI_PARK_FEE_THB } from '@/lib/nationalities'
import {
  isNoTransfer,
  isPrivateTransfer,
  type Booking,
  type CheckInAttendance,
  type Program,
} from '@/lib/types'

export type InvoiceKind = 'invoice' | 'billing_note' | 'credit_note'
export type InvoiceStatus = 'unpaid' | 'partial' | 'paid'
export type PaymentChannel = 'bank_transfer' | 'deduct_deposit' | 'payment_link' | 'cash'

export const PAYMENT_CHANNELS: { value: PaymentChannel; label: string }[] = [
  { value: 'deduct_deposit', label: 'Deduct Deposit' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'payment_link', label: 'Payment Link' },
  { value: 'cash', label: 'Cash' },
]

export function formatPaymentChannel(channel: PaymentChannel | null | undefined) {
  return PAYMENT_CHANNELS.find((row) => row.value === channel)?.label ?? ''
}

export function parsePaymentChannel(value: unknown): PaymentChannel | null {
  if (
    value === 'bank_transfer' ||
    value === 'deduct_deposit' ||
    value === 'payment_link' ||
    value === 'cash'
  ) {
    return value
  }
  return null
}
export type InvoiceLineKind =
  | 'tour'
  | 'no_show'
  | 'change_date'
  | 'cancel'
  | 'private_transfer'
  | 'extra_zone'
  | 'park_fee'
  | 'park_guest'
  | 'service'
  | 'other'

export type InvoiceSettings = {
  companyName: string
  companyLegal: string
  addressTh: string
  addressEn: string
  bankName: string
  bankAccountType: string
  bankAccountName: string
  bankAccountNo: string
  issuerName: string
  issuerTitle: string
  signatureImage: string
}

export type AgentBillingType = 'prebuy' | 'invoice'

export const AGENT_BILLING_TYPES: { value: AgentBillingType; label: string }[] = [
  { value: 'prebuy', label: 'Prebuy' },
  { value: 'invoice', label: 'Invoice' },
]

export function parseAgentBillingType(value: unknown): AgentBillingType {
  return value === 'prebuy' ? 'prebuy' : 'invoice'
}

export function formatAgentBillingType(value: AgentBillingType | null | undefined) {
  return value === 'prebuy' ? 'Prebuy' : 'Invoice'
}

export type AgencyInvoiceRates = {
  agentSlug: string
  billingType: AgentBillingType
  adultPrice: number
  childPrice: number
  infantPrice: number
  tourLeaderPrice: number
  /** When true, National Park is Included for this agent (no Exc price). */
  nationalParkIncluded: boolean
  /** Per-adult National Park fee when Excluded (default 400). Ignored if included. */
  nationalParkFee: number
  changeDatePrice: number
  cancelPrice: number
  privateTransferExtra: number
  extraZoneCharge: number
  otherServiceCharge: number
  otherServiceLabel: string
}

export type InvoiceItem = {
  id: string
  invoiceId: string
  bookingCode: string
  travelDate: string
  voucherNo: string
  description: string
  adults: number
  children: number
  infants: number
  tourLeaders: number
  adultPrice: number
  childPrice: number
  infantPrice: number
  tourLeaderPrice: number
  cot: number
  amount: number
  lineKind: InvoiceLineKind
  sortOrder: number
  /** Qty unit the agent can type, e.g. Pax, Box, Pcs, Van. */
  unit?: string
}

export function defaultChargeUnit(kind: InvoiceLineKind) {
  if (kind === 'tour' || kind === 'no_show' || kind === 'cancel' || kind === 'park_fee') return 'Person'
  if (kind === 'change_date') return 'Person'
  if (kind === 'private_transfer') return 'Van'
  return ''
}

export function invoiceLineKindLabel(kind: InvoiceLineKind) {
  switch (kind) {
    case 'tour':
      return 'Tour'
    case 'no_show':
      return 'No show'
    case 'change_date':
      return 'Change date'
    case 'cancel':
      return 'Cancel'
    case 'private_transfer':
      return 'Private transfer'
    case 'extra_zone':
      return 'Extra zone'
    case 'park_fee':
      return 'Park fee'
    case 'park_guest':
      return 'Park (guest)'
    case 'service':
      return 'Service'
    default:
      return 'Other'
  }
}

export function chargeUnit(item: Pick<InvoiceItem, 'lineKind' | 'unit'>) {
  const written = item.unit?.trim()
  return written || defaultChargeUnit(item.lineKind)
}

export type InvoiceDocument = {
  id: string
  number: string
  kind: InvoiceKind
  agentSlug: string
  agentName: string
  issueDate: string
  status: InvoiceStatus
  notes: string
  grandTotal: number
  paidAt: string | null
  paymentChannel: PaymentChannel | null
  receiptNo: string | null
  linkedInvoiceIds: string[]
  items: InvoiceItem[]
  /** Payment ledger — one invoice can be paid in several instalments. */
  payments?: InvoicePayment[]
  createdAt: string
  /** Admin marked this invoice to send to the agent. */
  sendToAgent?: boolean
  /** Saved line edits that have not been issued as an invoice yet. */
  isDraft?: boolean
}

export type InvoicePayment = {
  id: string
  amount: number
  /** Travel / payment calendar date YYYY-MM-DD */
  paidDate: string
  channel: PaymentChannel
  /** Each instalment gets its own receipt number. */
  receiptNo: string
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  companyName: 'Good Day Vacation Co., Ltd',
  companyLegal: 'Good Day Vacation Co., Ltd.',
  addressTh: 'สำนักงานใหญ่ : 35/84 หมู่ที่ 3 ตำบลรัษฎา อำเภอเมือง จังหวัดภูเก็ต',
  addressEn: 'Head Office : 35/84 Moo 3, Ratsada, Mueang, Phuket',
  bankName: 'SCB Bank',
  bankAccountType: 'Saving account',
  bankAccountName: 'Nusara Darayang',
  bankAccountNo: '822-215284-9',
  issuerName: 'Jerawan',
  issuerTitle: 'Director',
  signatureImage: '',
}

export function normalizeInvoiceSettings(
  settings: Partial<InvoiceSettings> | null | undefined,
): InvoiceSettings {
  const next = { ...DEFAULT_INVOICE_SETTINGS, ...settings }
  if (next.companyName === 'Good Day Vacation Speedboat') {
    next.companyName = DEFAULT_INVOICE_SETTINGS.companyName
  }
  if (next.issuerName === 'Jererawan') {
    next.issuerName = DEFAULT_INVOICE_SETTINGS.issuerName
  }
  if (next.issuerTitle === 'ผู้อำนวยการ') {
    next.issuerTitle = DEFAULT_INVOICE_SETTINGS.issuerTitle
  }
  next.signatureImage = next.signatureImage ?? ''
  return next
}

export const DEFAULT_NATIONAL_PARK_FEE = 400
/** Invoice agents only — discount per AD+CH when pickup is No Transfer. Prebuy gets none. */
export const NO_TRANSFER_DISCOUNT_PER_PERSON = 100

export const COMPANY_LOGO_SRC = '/goodday-logo.png'

export function emptyAgencyRates(agentSlug: string): AgencyInvoiceRates {
  return {
    agentSlug,
    billingType: 'invoice',
    adultPrice: 0,
    childPrice: 0,
    infantPrice: 0,
    tourLeaderPrice: 0,
    nationalParkIncluded: false,
    nationalParkFee: DEFAULT_NATIONAL_PARK_FEE,
    changeDatePrice: 0,
    cancelPrice: 0,
    privateTransferExtra: 0,
    extraZoneCharge: 0,
    otherServiceCharge: 0,
    otherServiceLabel: 'Other Service Charge',
  }
}

export function ratesForAgent(
  rates: AgencyInvoiceRates[],
  agentSlug: string,
): AgencyInvoiceRates {
  const found = rates.find((row) => row.agentSlug === agentSlug)
  if (!found) return emptyAgencyRates(agentSlug)
  return {
    ...emptyAgencyRates(agentSlug),
    ...found,
    billingType: parseAgentBillingType(found.billingType),
  }
}

export function agencyRatesReady(rates: AgencyInvoiceRates) {
  if (parseAgentBillingType(rates.billingType) === 'prebuy') return true
  return (
    rates.adultPrice > 0 ||
    rates.childPrice > 0 ||
    rates.cancelPrice > 0 ||
    rates.changeDatePrice > 0 ||
    rates.privateTransferExtra > 0 ||
    rates.extraZoneCharge > 0 ||
    rates.otherServiceCharge > 0
  )
}

/**
 * Days a booking can show on Bills.
 * A date change is listed on the original booked day (head / tour charge) and on the new day (change-date fee).
 */
export function invoiceListedDates(
  booking: Pick<Booking, 'date' | 'status' | 'movedFrom'>,
): string[] {
  const origin = dateMoveOrigin(booking)
  if (!origin) return [booking.date]
  return origin < booking.date ? [origin, booking.date] : [booking.date, origin]
}

/** Original booked day when this booking was moved to another date. */
export function dateMoveOrigin(
  booking: Pick<Booking, 'date' | 'status' | 'movedFrom'>,
): string | null {
  const origin = booking.movedFrom?.date
  if (booking.status === 'Cancelled' || !origin || origin === booking.date) return null
  return origin
}

/**
 * Day shown in the bills date column when the filter covers the booking's current travel date.
 * Head use for a date change is still listed on the original day via `invoiceListedDates`.
 */
export function invoiceBillDate(
  booking: Pick<Booking, 'date' | 'noShowDateMove' | 'movedFrom' | 'lateChangeFee'>,
  _prebuy = false,
) {
  return booking.date
}

/** Prebuy + staff date change after a no-show. */
export function isPrebuyNoShowDateMove(
  booking: Pick<Booking, 'status' | 'noShowDateMove' | 'movedFrom'>,
  prebuy: boolean,
) {
  return (
    prebuy &&
    booking.status !== 'Cancelled' &&
    booking.noShowDateMove === true &&
    Boolean(booking.movedFrom?.date)
  )
}

/** 300 THB (date-change fee) × AD+CH, kept on the same bill as the original head deduct. */
export function prebuyNoShowMoveMoney(
  booking: Pick<Booking, 'adults' | 'children' | 'lateChangeFee' | 'movedFrom' | 'date'>,
) {
  const heads = Math.max(0, booking.adults) + Math.max(0, booking.children)
  const perDefault = Math.max(0, DEFAULT_BOOKING_CUTOFFS.dateChangeFeePerPerson)
  const stored = Math.max(0, Math.floor(Number(booking.lateChangeFee) || 0))
  const perPerson =
    heads > 0 && stored > 0 && stored % heads === 0 ? Math.floor(stored / heads) : perDefault
  const amount = stored > 0 ? stored : heads * perPerson
  return {
    heads,
    perPerson,
    amount,
    fromDate: booking.movedFrom?.date ?? booking.date,
    toDate: booking.date,
  }
}

export function prebuyOriginalDeductDescription(fromDate: string) {
  const label = formatShortDate(fromDate)
  return `Booked on ${label} · deducted on ${label}`
}

export function prebuyNoShowMoveFeeDescription(input: { perPerson: number }) {
  return `Extra Charge for Changed date · ${input.perPerson} THB / person`
}

/** New-day bill line: the original heads were already charged on the booked date. */
export function tripsAlreadyChargedDescription(fromDate: string, heads: number) {
  const people = Math.max(0, Math.floor(heads))
  return `Trips booked ${formatShortDate(fromDate)} ${people} People already charged`
}

/** AD+CH who checked in on the new date. Guides are excluded. Tour leaders and infants are free, so the fee never exceeds booked AD+CH. */
export function arrivedChangeDateHeads(
  booking: Pick<Booking, 'adults' | 'children'>,
  checkedInSeats: number,
) {
  const chargeable = Math.max(0, booking.adults) + Math.max(0, booking.children)
  const arrived = Math.max(0, Math.floor(checkedInSeats))
  return Math.min(chargeable, arrived)
}

/** New-day bill line: the only money charged for guests who checked in after a date change. */
export function changeDateFeeLineDescription(heads: number, perPerson: number) {
  const people = Math.max(0, Math.floor(heads))
  const per = Math.max(0, Math.floor(perPerson))
  return `Change date Fee ${people} People (${per} THB / Person)`
}

/** AD+CH heads that count against prebuy (tour + no-show + late change date). */
export function prebuyDeductHeads(
  items: Pick<InvoiceItem, 'lineKind' | 'adults' | 'children'>[],
) {
  return items
    .filter(
      (item) =>
        item.lineKind === 'tour' ||
        item.lineKind === 'no_show' ||
        item.lineKind === 'change_date',
    )
    .reduce(
      (sum, item) => sum + Math.max(0, item.adults) + Math.max(0, item.children),
      0,
    )
}

export function programLabel(program: Program) {
  return program === 'PP' ? 'Phi Phi Speedboat' : 'James Bond Speedboat'
}

/** Short program name for per-pax invoice lines (Adult / Children). */
export function programShortLabel(program: Program) {
  return program === 'PP' ? 'Phi Phi' : 'James Bond'
}

/** Which program a saved bill belongs to. Null when the lines do not say. */
export function documentProgram(
  doc: { items: { bookingCode?: string; description?: string }[] },
  bookingProgram?: (code: string) => Program | undefined,
): Program | null {
  let pp = 0
  let jb = 0
  for (const item of doc.items) {
    const fromBooking = item.bookingCode ? bookingProgram?.(item.bookingCode) : undefined
    const text = item.description || ''
    const program: Program | null = fromBooking
      ? fromBooking
      : /james bond/i.test(text)
        ? 'James Bond'
        : /phi phi/i.test(text)
          ? 'PP'
          : null
    if (program === 'James Bond') jb += 1
    else if (program === 'PP') pp += 1
  }
  if (pp === 0 && jb === 0) return null
  return jb > pp ? 'James Bond' : 'PP'
}

export function programPaxLineLabel(
  program: Program,
  paxKind: 'adult' | 'child' | 'infant' | 'tourLeader',
  options?: { prebuy?: boolean; prefix?: string },
) {
  const short = programShortLabel(program)
  const role =
    paxKind === 'adult'
      ? 'Adult'
      : paxKind === 'child'
        ? 'Children'
        : paxKind === 'infant'
          ? 'Infant'
          : 'Tour Leader'
  const base = `${options?.prefix ? `${options.prefix} · ` : ''}${short} ${role}`
  return options?.prebuy ? `${base} · deduct` : base
}

export function invoicePrefix(program: Program) {
  return program === 'PP' ? 'PP' : 'JB'
}

export function formatInvoiceMoney(amount: number) {
  const value = Number.isFinite(amount) ? amount : 0
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function parseInvoiceStatus(value: unknown): InvoiceStatus {
  if (value === 'paid' || value === 'partial' || value === 'unpaid') return value
  return 'unpaid'
}

export function invoicePayments(
  doc: Pick<
    InvoiceDocument,
    'payments' | 'status' | 'paidAt' | 'paymentChannel' | 'grandTotal' | 'receiptNo'
  >,
): InvoicePayment[] {
  const listed = (doc.payments ?? [])
    .map((row) => ({
      ...row,
      amount: Math.max(0, Number(row.amount) || 0),
      receiptNo: String(row.receiptNo ?? '').trim(),
    }))
    .filter((row) => row.amount > 0)
  if (listed.length > 0) {
    return listed.map((row, index) => ({
      ...row,
      // Older rows may lack receiptNo — keep usable for history.
      receiptNo: row.receiptNo || (index === 0 ? doc.receiptNo ?? '' : ''),
    }))
  }
  // Legacy single paid flag → one synthetic payment for balance math.
  if (doc.status === 'paid' && doc.paidAt) {
    return [
      {
        id: 'legacy-full',
        amount: Math.max(0, Number(doc.grandTotal) || 0),
        paidDate: doc.paidAt.slice(0, 10),
        channel: doc.paymentChannel ?? 'deduct_deposit',
        receiptNo: doc.receiptNo ?? '',
      },
    ]
  }
  return []
}

export function invoicePaidTotal(
  doc: Pick<
    InvoiceDocument,
    'payments' | 'status' | 'paidAt' | 'paymentChannel' | 'grandTotal' | 'receiptNo'
  >,
) {
  return invoicePayments(doc).reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0)
}

export function invoiceBalance(
  doc: Pick<
    InvoiceDocument,
    'grandTotal' | 'payments' | 'status' | 'paidAt' | 'paymentChannel' | 'receiptNo'
  >,
) {
  return Math.max(0, Math.round((Number(doc.grandTotal) || 0) * 100) / 100 - invoicePaidTotal(doc))
}

export function deriveInvoiceStatus(grandTotal: number, paidTotal: number): InvoiceStatus {
  const due = Math.max(0, Number(grandTotal) || 0)
  const paid = Math.max(0, Number(paidTotal) || 0)
  if (paid <= 0.009) return 'unpaid'
  if (paid + 0.009 >= due) return 'paid'
  return 'partial'
}

export function withInvoicePayments(
  doc: InvoiceDocument,
  payments: InvoicePayment[],
): InvoiceDocument {
  const paidTotal = payments.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0)
  const status = deriveInvoiceStatus(doc.grandTotal, paidTotal)
  const latest = payments[payments.length - 1]
  return {
    ...doc,
    payments,
    status,
    paidAt: latest ? `${latest.paidDate}T12:00:00.000Z` : null,
    paymentChannel: latest?.channel ?? null,
    // Latest receipt on the invoice header (list column); each payment still keeps its own.
    receiptNo: status === 'unpaid' ? null : latest?.receiptNo || doc.receiptNo,
  }
}

export function lateReduceFeeDescription(input: {
  amount: number
  adults?: number
  children?: number
  adultPrice?: number
}) {
  const perPerson = Math.max(
    0,
    Number(input.adultPrice) || DEFAULT_BOOKING_CUTOFFS.dateChangeFeePerPerson,
  )
  const amount = Math.max(0, Number(input.amount) || 0)
  const storedHeads = Math.max(0, Number(input.adults) || 0) + Math.max(0, Number(input.children) || 0)
  const heads =
    storedHeads > 0
      ? storedHeads
      : perPerson > 0 && amount % perPerson === 0
        ? Math.floor(amount / perPerson)
        : 0
  if (heads > 0) return `Late Reduce, ${heads}Pax, not cancel`
  return `Late Reduce, not cancel`
}

export function lateChangeDateDescription(input: { heads: number; prebuy: boolean }) {
  const heads = Math.max(0, Math.floor(input.heads))
  if (input.prebuy) {
    return heads > 0
      ? `Late Change Date, ${heads}Pax, deduct heads`
      : 'Late Change Date, deduct heads'
  }
  return heads > 0 ? `Late Change Date, ${heads}Pax, full price` : 'Late Change Date, full price'
}

export function lateCancelDescription(program: Program, fullPrice: boolean) {
  return fullPrice
    ? `Cancelled · full price · ${programLabel(program)}`
    : `Cancelled · ${programLabel(program)}`
}

export function freeCancelDescription(program: Program) {
  return `Cancelled · no charge · ${programLabel(program)}`
}

/** Normalize older vague labels on print / edit. */
export function formatInvoiceLineDescription(
  item: Pick<InvoiceItem, 'description' | 'amount' | 'adults' | 'children' | 'adultPrice' | 'lineKind'>,
) {
  const text = item.description.trim()
  if (
    /^Reduce guests · late fee$/i.test(text) ||
    /^Late reduce/i.test(text) ||
    (item.lineKind === 'other' && /late reduce|reduce guests.*late/i.test(text))
  ) {
    return lateReduceFeeDescription(item)
  }
  if (
    !/^Change date Fee\b/i.test(text) &&
    (item.lineKind === 'change_date' || /^Change date/i.test(text) || /^Late Change Date/i.test(text))
  ) {
    const heads = Math.max(0, item.adults) + Math.max(0, item.children)
    const prebuy = /deduct/i.test(text) || item.amount === 0
    return lateChangeDateDescription({ heads, prebuy })
  }
  if (
    item.lineKind === 'cancel' ||
    /^Cancel/i.test(text) ||
    /^Late Cancel/i.test(text) ||
    /^Cancelled/i.test(text)
  ) {
    const fullPrice = /full price/i.test(text)
    const program: Program = /james bond/i.test(text) ? 'James Bond' : 'PP'
    if (fullPrice || item.amount > 0) return lateCancelDescription(program, fullPrice)
    return freeCancelDescription(program)
  }
  return item.description
}

export type InvoiceDisplayLine = {
  key: string
  travelDate: string
  description: string
  qty: number | ''
  unit: string
  unitPrice: number | ''
  amount: number
  guestCollect: boolean
}

function detectProgramFromDescription(description: string): Program {
  return /james bond/i.test(description) ? 'James Bond' : 'PP'
}

function isLegacyCombinedTourLine(item: Pick<InvoiceItem, 'description' | 'lineKind' | 'adults' | 'children' | 'infants' | 'tourLeaders'>) {
  if (item.lineKind !== 'tour' && item.lineKind !== 'no_show' && item.lineKind !== 'cancel') {
    return false
  }
  if (/Adult|Children|Infant|Tour Leader/i.test(item.description)) return false
  const kinds =
    Number(item.adults > 0) +
    Number(item.children > 0) +
    Number(item.infants > 0) +
    Number(item.tourLeaders > 0)
  return kinds > 1 || /Speedboat/i.test(item.description)
}

/** Guest, booking code, and that booking's voucher — one identity per line. */
export function invoiceLineIdentity(
  item: Pick<InvoiceItem, 'bookingCode' | 'voucherNo'>,
  guestName?: string,
) {
  return [guestName?.trim(), item.bookingCode.trim(), item.voucherNo.trim()].filter(Boolean).join(' · ')
}

/** Hide the prebuy "deduct" marker on the printed description. */
function stripDeductWord(text: string) {
  return text
    .replace(/,?\s*deduct heads?\b/gi, '')
    .replace(/\s*·\s*deduct\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*,\s*$/g, '')
    .trim()
}

type InvoiceDisplayPart = {
  label: string
  qty: number | ''
  unit: string
  unitPrice: number | ''
  amount: number
  guestCollect: boolean
  travelDate: string
}

function displayPartsForItem(item: InvoiceItem): InvoiceDisplayPart[] {
  if (isLateReduceFeeLine(item)) {
    const late = lateReduceFeeDisplay(item)
    return [
      {
        label: stripDeductWord(formatInvoiceLineDescription(item)),
        qty: late.heads || '',
        unit: late.heads > 0 ? 'Person' : 'Fee',
        unitPrice: late.perPerson || '',
        amount: item.amount,
        guestCollect: isGuestCollectLine(item),
        travelDate: item.travelDate,
      },
    ]
  }

  if (isLegacyCombinedTourLine(item)) {
    const program = detectProgramFromDescription(item.description)
    const prebuy = /deduct/i.test(item.description) || item.amount === 0
    const prefix =
      item.lineKind === 'no_show'
        ? 'No show'
        : item.lineKind === 'cancel'
          ? /full price/i.test(item.description)
            ? 'Cancelled, full price'
            : /no charge/i.test(item.description)
              ? 'Cancelled, no charge'
              : 'Cancelled'
          : undefined
    const parts: Array<{
      kind: 'adult' | 'child' | 'infant' | 'tourLeader'
      qty: number
      unitPrice: number
    }> = []
    if (item.adults > 0) {
      parts.push({ kind: 'adult', qty: item.adults, unitPrice: prebuy ? 0 : item.adultPrice })
    }
    if (item.children > 0) {
      parts.push({ kind: 'child', qty: item.children, unitPrice: prebuy ? 0 : item.childPrice })
    }
    if (item.infants > 0) {
      parts.push({ kind: 'infant', qty: item.infants, unitPrice: prebuy ? 0 : item.infantPrice })
    }
    if (item.tourLeaders > 0) {
      parts.push({
        kind: 'tourLeader',
        qty: item.tourLeaders,
        unitPrice: prebuy ? 0 : item.tourLeaderPrice,
      })
    }
    return parts.map((part) => ({
      label: stripDeductWord(programPaxLineLabel(program, part.kind, { prebuy, prefix })),
      qty: part.qty,
      unit: 'Person',
      unitPrice: part.unitPrice || '',
      amount: prebuy ? 0 : part.qty * part.unitPrice,
      guestCollect: false,
      travelDate: item.travelDate,
    }))
  }

  const qty =
    item.adults ||
    item.children ||
    item.infants ||
    item.tourLeaders ||
    (item.amount !== 0 || item.lineKind === 'tour' ? 1 : 0)
  const unitPrice =
    item.adultPrice ||
    item.childPrice ||
    item.infantPrice ||
    item.tourLeaderPrice ||
    (qty === 1 ? Math.abs(item.amount) : 0)

  return [
    {
      label: stripDeductWord(formatInvoiceLineDescription(item)),
      qty: qty || '',
      unit: chargeUnit(item) || (qty ? 'Person' : ''),
      unitPrice: unitPrice || '',
      amount: item.amount,
      guestCollect: isGuestCollectLine(item),
      travelDate: item.travelDate,
    },
  ]
}

function partQty(qty: number | '') {
  return typeof qty === 'number' && Number.isFinite(qty) ? qty : 0
}

/** One print row per booking: charges together, guest and reference once, no "deduct". */
export function expandInvoiceDisplayLines(
  items: InvoiceItem[],
  guests?: ReadonlyMap<string, string>,
): InvoiceDisplayLine[] {
  const groups: InvoiceItem[][] = []
  const indexByKey = new Map<string, number>()
  items.forEach((item, index) => {
    const key = item.bookingCode.trim() || `line:${item.id || index}`
    const at = indexByKey.get(key)
    if (at == null) {
      indexByKey.set(key, groups.length)
      groups.push([item])
    } else {
      groups[at]!.push(item)
    }
  })

  return groups.map((group) => {
    const first = group[0]!
    const parts = group.flatMap(displayPartsForItem)
    const qtys = parts.map((part) => partQty(part.qty)).filter((qty) => qty > 0)
    const sameQty = qtys.length > 0 && qtys.every((qty) => qty === qtys[0])
    const charges = parts
      .map((part) => {
        const qty = partQty(part.qty)
        if (!part.label) return ''
        if (sameQty || qty <= 0) return part.label
        return `${part.label} ${qty}`
      })
      .filter(Boolean)
      .join(', ')
    const who = invoiceLineIdentity(first, guests?.get(first.bookingCode))
    const prices = [
      ...new Set(
        parts
          .map((part) => part.unitPrice)
          .filter((price): price is number => typeof price === 'number' && price !== 0),
      ),
    ]
    const units = [...new Set(parts.map((part) => part.unit).filter(Boolean))]
    return {
      key: first.bookingCode.trim() || first.id,
      travelDate: parts.find((part) => part.travelDate)?.travelDate || first.travelDate,
      description: who ? `${charges}\n${who}` : charges,
      qty: sameQty ? qtys[0]! : qtys.reduce((sum, qty) => sum + qty, 0) || '',
      unit: units.length === 1 ? units[0]! : units[0] || '',
      unitPrice: prices.length === 1 ? prices[0]! : '',
      amount: parts.reduce((sum, part) => sum + part.amount, 0),
      guestCollect: parts.length > 0 && parts.every((part) => part.guestCollect),
    }
  })
}

export function isLateReduceFeeLine(
  item: Pick<InvoiceItem, 'description' | 'lineKind'>,
) {
  const text = item.description.trim()
  return (
    /^Reduce guests · late fee$/i.test(text) ||
    /^Late [Rr]educe/i.test(text) ||
    (item.lineKind === 'other' && /late reduce|reduce guests.*late/i.test(text))
  )
}

export function lateReduceFeeDisplay(item: Pick<InvoiceItem, 'amount' | 'adults' | 'children' | 'adultPrice'>) {
  const perPerson = Math.max(
    0,
    Number(item.adultPrice) || DEFAULT_BOOKING_CUTOFFS.dateChangeFeePerPerson,
  )
  const amount = Math.max(0, Number(item.amount) || 0)
  const storedHeads = Math.max(0, Number(item.adults) || 0) + Math.max(0, Number(item.children) || 0)
  const heads =
    storedHeads > 0
      ? storedHeads
      : perPerson > 0 && amount % perPerson === 0
        ? Math.floor(amount / perPerson)
        : 0
  return { heads, perPerson, amount }
}

export function formatInvoicePayStatus(doc: InvoiceDocument) {
  const status = deriveInvoiceStatus(doc.grandTotal, invoicePaidTotal(doc))
  if (status === 'paid') return 'PAID'
  if (status === 'partial') return 'Partial'
  return 'Unpaid'
}

/** Flatten every payment receipt for the Receipts tab / numbering. */
export function invoiceReceiptRows(docs: InvoiceDocument[]) {
  return docs.flatMap((doc) =>
    invoicePayments(doc)
      .filter((payment) => payment.receiptNo)
      .map((payment) => ({ doc, payment })),
  )
}

export function formatInvoiceDate(isoDate: string) {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-')
  return `${Number(day)}/${Number(month)}/${year}`
}

export function parseMoneyInput(value: string) {
  const cleaned = value.replace(/,/g, '').trim()
  if (!cleaned) return 0
  const amount = Number(cleaned)
  return Number.isFinite(amount) && amount >= 0 ? amount : 0
}

/** Allows minus amounts (e.g. agent cash-on-tour deduct on the invoice). */
export function parseSignedMoneyInput(value: string) {
  const cleaned = value.replace(/,/g, '').trim()
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return 0
  const amount = Number(cleaned)
  return Number.isFinite(amount) ? amount : 0
}

function documentKindPrefix(kind: InvoiceKind | 'receipt') {
  if (kind === 'receipt') return 'RC'
  if (kind === 'billing_note') return 'BN'
  if (kind === 'credit_note') return 'CN'
  return 'INV'
}

function sequenceFromDocumentNumber(
  source: string,
  kind: InvoiceKind | 'receipt',
  yy: string,
  mm: string,
) {
  const prefix = documentKindPrefix(kind)
  const next = source.match(new RegExp(`^${prefix}${yy}-${mm}(\\d{3,})$`))
  if (next) return Number(next[1])
  const oldStem =
    kind === 'receipt'
      ? 'RC-GDV'
      : kind === 'billing_note'
        ? 'BN-GDV'
        : kind === 'credit_note'
          ? 'CN-GDV'
          : '(?:PP|JB)-GDV'
  const previous = source.match(new RegExp(`^${oldStem}-${yy}${mm}-(\\d+)$`))
  if (previous) return Number(previous[1])
  return null
}

export function nextDocumentNumber(
  existing: InvoiceDocument[],
  kind: InvoiceKind | 'receipt',
  issueDate: string,
  _program?: Program,
) {
  const [year, month] = issueDate.split('-')
  const yy = (year ?? '').slice(2)
  const mm = (month ?? '01').padStart(2, '0')
  const seq = existing.reduce((max, doc) => {
    if (kind === 'receipt') {
      const sources = [
        doc.receiptNo ?? '',
        ...invoicePayments(doc).map((payment) => payment.receiptNo),
      ]
      let localMax = max
      for (const source of sources) {
        const n = sequenceFromDocumentNumber(source, kind, yy, mm)
        if (n != null && Number.isFinite(n)) localMax = Math.max(localMax, n)
      }
      return localMax
    }
    const source = doc.kind === kind ? doc.number : ''
    const n = sequenceFromDocumentNumber(source, kind, yy, mm)
    return n != null && Number.isFinite(n) ? Math.max(max, n) : max
  }, 0)
  return `${documentKindPrefix(kind)}${yy}-${mm}${String(seq + 1).padStart(3, '0')}`
}

export function toNewDocumentNumber(source: string, kind: InvoiceKind | 'receipt') {
  const trimmed = source.trim()
  if (!trimmed) return trimmed
  const prefix = documentKindPrefix(kind)
  if (trimmed.match(new RegExp(`^${prefix}\\d{2}-\\d{5,}$`))) return trimmed
  const oldStem =
    kind === 'receipt'
      ? 'RC-GDV'
      : kind === 'billing_note'
        ? 'BN-GDV'
        : kind === 'credit_note'
          ? 'CN-GDV'
          : '(?:PP|JB)-GDV'
  const previous = trimmed.match(new RegExp(`^${oldStem}-(\\d{2})(\\d{2})-(\\d+)$`))
  if (!previous) return trimmed
  return `${prefix}${previous[1]}-${previous[2]}${String(Number(previous[3])).padStart(3, '0')}`
}

export function migrateInvoiceDocumentNumbers(docs: InvoiceDocument[]) {
  const used = new Set<string>()
  const numberMap = new Map<string, string>()
  const byCreated = [...docs].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
  const assigned = new Map<string, InvoiceDocument>()

  for (const doc of byCreated) {
    let number = toNewDocumentNumber(doc.number, doc.kind)
    if (used.has(`${doc.kind}:${number}`)) {
      number = nextDocumentNumber([...assigned.values()], doc.kind, doc.issueDate)
    }
    used.add(`${doc.kind}:${number}`)
    if (number !== doc.number) numberMap.set(doc.number, number)
    const receiptNo = doc.receiptNo ? toNewDocumentNumber(doc.receiptNo, 'receipt') : doc.receiptNo
    assigned.set(doc.id, { ...doc, number, receiptNo })
  }

  return docs.map((doc) => {
    const next = assigned.get(doc.id) ?? doc
    if (next.kind !== 'billing_note' || !next.notes) return next
    let notes = next.notes
    for (const [from, to] of numberMap) notes = notes.split(from).join(to)
    return notes === next.notes ? next : { ...next, notes }
  })
}

export function bookingVoucherNo(booking: Booking) {
  return booking.agentRef.trim() || booking.code
}

function moneyId() {
  return crypto.randomUUID()
}

function snapshotTotal(row: BookedPaxSnapshot) {
  return row.adults + row.children + row.infants + row.tourLeaders
}

export function bookingTourAmount(
  booking: Pick<Booking, 'adults' | 'children' | 'infants' | 'tourLeaders'>,
  rates: AgencyInvoiceRates,
) {
  return snapshotAmount(
    {
      adults: booking.adults,
      children: booking.children,
      infants: booking.infants,
      tourLeaders: booking.tourLeaders,
    },
    rates,
  )
}

function snapshotAmount(row: BookedPaxSnapshot, rates: AgencyInvoiceRates) {
  return (
    row.adults * rates.adultPrice +
    row.children * rates.childPrice +
    row.infants * rates.infantPrice +
    row.tourLeaders * rates.tourLeaderPrice
  )
}

function emptySnapshot(): BookedPaxSnapshot {
  return { adults: 0, children: 0, infants: 0, tourLeaders: 0 }
}

function pushProgramPaxLines(
  items: Omit<InvoiceItem, 'invoiceId'>[],
  input: {
    booking: Booking
    voucherNo: string
    pax: BookedPaxSnapshot
    rates: AgencyInvoiceRates
    prebuy: boolean
    lineKind: 'tour' | 'no_show'
    prefix?: string
    /** Bill these heads on the original date when a no-show was moved. */
    travelDate?: string
  },
) {
  const { booking, voucherNo, pax, rates, prebuy, lineKind, prefix, travelDate } = input
  const rows: Array<{
    kind: 'adult' | 'child' | 'infant' | 'tourLeader'
    qty: number
    unitPrice: number
    adults: number
    children: number
    infants: number
    tourLeaders: number
  }> = []

  if (pax.adults > 0) {
    rows.push({
      kind: 'adult',
      qty: pax.adults,
      unitPrice: prebuy ? 0 : rates.adultPrice,
      adults: pax.adults,
      children: 0,
      infants: 0,
      tourLeaders: 0,
    })
  }
  if (pax.children > 0) {
    rows.push({
      kind: 'child',
      qty: pax.children,
      unitPrice: prebuy ? 0 : rates.childPrice,
      adults: 0,
      children: pax.children,
      infants: 0,
      tourLeaders: 0,
    })
  }
  // Infants are free — no invoice line. Tour leaders / guides get a 0 THB row staff can delete.
  if (lineKind === 'tour' && pax.tourLeaders > 0) {
    rows.push({
      kind: 'tourLeader',
      qty: pax.tourLeaders,
      unitPrice: prebuy ? 0 : rates.tourLeaderPrice,
      adults: 0,
      children: 0,
      infants: 0,
      tourLeaders: pax.tourLeaders,
    })
  }

  for (const row of rows) {
    const freeLeader = row.kind === 'tourLeader' && row.unitPrice === 0
    const label = programPaxLineLabel(booking.program, row.kind, {
      prebuy: prebuy && !freeLeader,
      prefix,
    })
    items.push({
      id: moneyId(),
      bookingCode: booking.code,
      travelDate: travelDate || booking.date,
      voucherNo,
      description: freeLeader ? `${label} · Free` : label,
      adults: row.adults,
      children: row.children,
      infants: row.infants,
      tourLeaders: row.tourLeaders,
      adultPrice: row.kind === 'adult' ? row.unitPrice : 0,
      childPrice: row.kind === 'child' ? row.unitPrice : 0,
      infantPrice: row.kind === 'infant' ? row.unitPrice : 0,
      tourLeaderPrice: row.kind === 'tourLeader' ? row.unitPrice : 0,
      cot: 0,
      amount: prebuy ? 0 : row.qty * row.unitPrice,
      lineKind,
      sortOrder: items.length,
      unit: 'Person',
    })
  }
}

export function noShowPaxForInvoice(
  booking: Booking,
  original: BookedPaxSnapshot,
  attendance: CheckInAttendance | null | undefined,
): BookedPaxSnapshot {
  const current = {
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    tourLeaders: booking.tourLeaders,
  }
  if (attendance === 'no-show') {
    return {
      adults: Math.max(original.adults, current.adults),
      children: Math.max(original.children, current.children),
      infants: Math.max(original.infants, current.infants),
      tourLeaders: Math.max(original.tourLeaders, current.tourLeaders),
    }
  }
  return {
    adults: Math.max(0, original.adults - current.adults),
    children: Math.max(0, original.children - current.children),
    infants: Math.max(0, original.infants - current.infants),
    tourLeaders: Math.max(0, original.tourLeaders - current.tourLeaders),
  }
}

export function buildInvoiceItemsForBooking(
  booking: Booking,
  rates: AgencyInvoiceRates,
  options?: {
    includeOtherService?: boolean
    attendance?: CheckInAttendance | null
    thaiGuests?: number
    /** Checked-in Tour Group Guide enrollments (scope 'guide'). */
    groupGuides?: number
    /**
     * Non-guide seats checked in on the new date.
     * The change-date fee is only these guests who actually came.
     */
    checkedInSeats?: number
  },
): Omit<InvoiceItem, 'invoiceId'>[] {
  const items: Omit<InvoiceItem, 'invoiceId'>[] = []
  const voucherNo = bookingVoucherNo(booking)
  const prebuy = parseAgentBillingType(rates.billingType) === 'prebuy'

  if (booking.status === 'Cancelled') {
    const adminFee = booking.cancelFee
    const hasAdminFee = typeof adminFee === 'number' && Number.isFinite(adminFee)
    if (hasAdminFee && adminFee > 0) {
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: booking.date,
        voucherNo,
        description: lateCancelDescription(booking.program, false),
        adults: booking.adults,
        children: booking.children,
        infants: booking.infants,
        tourLeaders: booking.tourLeaders,
        adultPrice: 0,
        childPrice: 0,
        infantPrice: 0,
        tourLeaderPrice: 0,
        cot: 0,
        amount: Math.max(0, Math.floor(adminFee)),
        lineKind: 'cancel',
        sortOrder: items.length,
      })
    } else if (!hasAdminFee && booking.lateCancel) {
      const pax = {
        adults: booking.adults,
        children: booking.children,
        infants: booking.infants,
        tourLeaders: booking.tourLeaders,
      }
      const amount = snapshotAmount(pax, rates)
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: booking.date,
        voucherNo,
        description: lateCancelDescription(booking.program, true),
        adults: pax.adults,
        children: pax.children,
        infants: pax.infants,
        tourLeaders: pax.tourLeaders,
        adultPrice: rates.adultPrice,
        childPrice: rates.childPrice,
        infantPrice: rates.infantPrice,
        tourLeaderPrice: rates.tourLeaderPrice,
        cot: 0,
        amount,
        lineKind: 'cancel',
        sortOrder: items.length,
      })
    } else {
      const original = originalBookedPax(booking.date, booking.program, booking)
      const pax = {
        adults: Math.max(booking.adults, original.adults),
        children: Math.max(booking.children, original.children),
        infants: Math.max(booking.infants, original.infants),
        tourLeaders: Math.max(booking.tourLeaders, original.tourLeaders),
      }
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: booking.date,
        voucherNo,
        description: freeCancelDescription(booking.program),
        adults: pax.adults,
        children: pax.children,
        infants: pax.infants,
        tourLeaders: pax.tourLeaders,
        adultPrice: 0,
        childPrice: 0,
        infantPrice: 0,
        tourLeaderPrice: 0,
        cot: 0,
        amount: 0,
        lineKind: 'cancel',
        sortOrder: items.length,
      })
    }
  } else if (dateMoveOrigin(booking)) {
    const origin = dateMoveOrigin(booking)!
    const original = originalBookedPax(booking.date, booking.program, booking)
    const noShowBeforeMove = noShowPaxForInvoice(booking, original, options?.attendance)
    const movedOut = booking.movedOutPax
    const noShow = movedOut
      ? {
          adults: Math.max(0, noShowBeforeMove.adults - movedOut.adults),
          children: Math.max(0, noShowBeforeMove.children - movedOut.children),
          infants: Math.max(0, noShowBeforeMove.infants - movedOut.infants),
          tourLeaders: Math.max(0, noShowBeforeMove.tourLeaders - movedOut.tourLeaders),
        }
      : noShowBeforeMove
    const wholeNoShow = options?.attendance === 'no-show'
    // The live booking size is the cap. No-shows are part of that group, not extra people on top.
    const bookedAdults = Math.max(0, booking.adults)
    const bookedChildren = Math.max(0, booking.children)
    const nsAdults = wholeNoShow
      ? bookedAdults
      : Math.min(bookedAdults, Math.max(0, noShow.adults))
    const nsChildren = wholeNoShow
      ? bookedChildren
      : Math.min(bookedChildren, Math.max(0, noShow.children))
    const cameAdults = bookedAdults - nsAdults
    const cameChildren = bookedChildren - nsChildren
    const bookedHeads = bookedAdults + bookedChildren
    const cameHeads = cameAdults + cameChildren
    const nsHeads = nsAdults + nsChildren
    const programName = programShortLabel(booking.program)

    if (cameHeads > 0) {
      const amount = prebuy
        ? 0
        : cameAdults * rates.adultPrice + cameChildren * rates.childPrice
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: origin,
        voucherNo,
        description: `${programName} booked ${bookedHeads}, check in ${cameHeads}`,
        adults: cameAdults,
        children: cameChildren,
        infants: 0,
        tourLeaders: 0,
        adultPrice: prebuy ? 0 : rates.adultPrice,
        childPrice: prebuy ? 0 : rates.childPrice,
        infantPrice: 0,
        tourLeaderPrice: 0,
        cot: 0,
        amount,
        lineKind: 'tour',
        unit: 'Person',
        sortOrder: items.length,
      })
    }

    if (nsHeads > 0) {
      const amount = prebuy ? 0 : nsAdults * rates.adultPrice + nsChildren * rates.childPrice
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: origin,
        voucherNo,
        description: `No Show ${nsHeads} pax`,
        adults: nsAdults,
        children: nsChildren,
        infants: 0,
        tourLeaders: 0,
        adultPrice: prebuy ? 0 : rates.adultPrice,
        childPrice: prebuy ? 0 : rates.childPrice,
        infantPrice: 0,
        tourLeaderPrice: 0,
        cot: 0,
        amount,
        lineKind: 'no_show',
        unit: 'Person',
        sortOrder: items.length,
      })
    }

    // New day: fee only for guests who checked in. No-shows stay on the original date.
    const movedHeads = wholeNoShow
      ? 0
      : arrivedChangeDateHeads(booking, options?.checkedInSeats ?? 0)
    if (movedHeads > 0) {
      const perPerson = Math.max(0, DEFAULT_BOOKING_CUTOFFS.dateChangeFeePerPerson)
      const amount = movedHeads * perPerson
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: booking.date,
        voucherNo,
        description: tripsAlreadyChargedDescription(origin, movedHeads),
        adults: movedHeads,
        children: 0,
        infants: 0,
        tourLeaders: 0,
        adultPrice: 0,
        childPrice: 0,
        infantPrice: 0,
        tourLeaderPrice: 0,
        cot: 0,
        amount: 0,
        lineKind: 'other',
        unit: 'Person',
        sortOrder: items.length,
      })
      if (amount > 0) {
        items.push({
          id: moneyId(),
          bookingCode: booking.code,
          travelDate: booking.date,
          voucherNo,
          description: changeDateFeeLineDescription(movedHeads, perPerson),
          adults: movedHeads,
          children: 0,
          infants: 0,
          tourLeaders: 0,
          adultPrice: perPerson,
          childPrice: 0,
          infantPrice: 0,
          tourLeaderPrice: 0,
          cot: 0,
          amount,
          lineKind: 'other',
          unit: 'Person',
          sortOrder: items.length,
        })
      }
    }
  } else {
    const original = originalBookedPax(booking.date, booking.program, booking)
    const noShowBeforeMove = noShowPaxForInvoice(booking, original, options?.attendance)
    // Guests moved to another date are billed on that date (plus the change-date charge), not here.
    const movedOut = booking.movedOutPax
    const noShow = movedOut
      ? {
          adults: Math.max(0, noShowBeforeMove.adults - movedOut.adults),
          children: Math.max(0, noShowBeforeMove.children - movedOut.children),
          infants: Math.max(0, noShowBeforeMove.infants - movedOut.infants),
          tourLeaders: Math.max(0, noShowBeforeMove.tourLeaders - movedOut.tourLeaders),
        }
      : noShowBeforeMove
    const wholeNoShow = options?.attendance === 'no-show'
    const tourPax = wholeNoShow
      ? emptySnapshot()
      : {
          adults: booking.adults,
          children: booking.children,
          infants: booking.infants,
          tourLeaders: booking.tourLeaders,
        }

    if (snapshotTotal(tourPax) > 0) {
      pushProgramPaxLines(items, {
        booking,
        voucherNo,
        pax: tourPax,
        rates,
        prebuy,
        lineKind: 'tour',
      })
    }

    // Checked-in Tour Group Guides beyond the booked TL seats: shown free, never billed.
    const extraGuides = wholeNoShow
      ? 0
      : Math.max(0, Math.floor(options?.groupGuides ?? 0) - Math.max(0, tourPax.tourLeaders))
    if (extraGuides > 0) {
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: booking.date,
        voucherNo,
        description: `${programShortLabel(booking.program)} Tour Group Guide · Free`,
        adults: 0,
        children: 0,
        infants: 0,
        tourLeaders: extraGuides,
        adultPrice: 0,
        childPrice: 0,
        infantPrice: 0,
        tourLeaderPrice: 0,
        cot: 0,
        amount: 0,
        lineKind: 'other',
        unit: 'Person',
        sortOrder: items.length,
      })
    }

    if (snapshotTotal(noShow) > 0) {
      pushProgramPaxLines(items, {
        booking,
        voucherNo,
        pax: noShow,
        rates,
        prebuy,
        lineKind: 'no_show',
        prefix: 'No show',
      })
    }
  }

  // Separate Change date line (not cancel / not no-show). Sticky flag from Change date action.
  // Legacy: bookings that only have lateChangeFee (pre-flag) still get a Change date line.
  // Prebuy no-show moves already deducted heads above and add 300 THB / person instead.
  const prebuyNoShowMove = isPrebuyNoShowDateMove(booking, prebuy)
  const reduceFee = Math.max(0, booking.lateChangeFee ?? 0)
  const lateDateFlagged = booking.lateDateChange === true
  const lateDateLegacy = booking.lateDateChange == null && reduceFee > 0

  const movedOrigin = dateMoveOrigin(booking)

  if (!movedOrigin && prebuyNoShowMove && booking.movedFrom && Math.max(0, booking.lateChangeFee ?? 0) > 0) {
    const move = prebuyNoShowMoveMoney(booking)
    if (move.amount > 0) {
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: booking.date,
        voucherNo,
        description: prebuyNoShowMoveFeeDescription(move),
        adults: move.heads,
        children: 0,
        infants: 0,
        tourLeaders: 0,
        adultPrice: move.perPerson,
        childPrice: 0,
        infantPrice: 0,
        tourLeaderPrice: 0,
        cot: 0,
        amount: move.amount,
        lineKind: 'other',
        unit: 'Person',
        sortOrder: items.length,
      })
    }
  }

  if (!movedOrigin && !prebuyNoShowMove && (lateDateFlagged || lateDateLegacy)) {
    const changePax = {
      adults: booking.adults,
      children: booking.children,
      infants: booking.infants,
      tourLeaders: booking.tourLeaders,
    }
    const fullAmount = snapshotAmount(changePax, rates)
    const changeHeads = Math.max(0, changePax.adults) + Math.max(0, changePax.children)
    // After 8pm Thai: Invoice = full tour price. Prebuy = head deduct only (like no-show).
    items.push({
      id: moneyId(),
      bookingCode: booking.code,
      travelDate: booking.date,
      voucherNo,
      description: lateChangeDateDescription({ heads: changeHeads, prebuy }),
      adults: changePax.adults,
      children: changePax.children,
      infants: changePax.infants,
      tourLeaders: changePax.tourLeaders,
      adultPrice: prebuy ? 0 : rates.adultPrice,
      childPrice: prebuy ? 0 : rates.childPrice,
      infantPrice: prebuy ? 0 : rates.infantPrice,
      tourLeaderPrice: prebuy ? 0 : rates.tourLeaderPrice,
      cot: 0,
      amount: prebuy ? 0 : fullAmount,
      lineKind: 'change_date',
      sortOrder: items.length,
    })
  }

  // Late reduce AD/CH after lateFeeFromTime (not late cancel, not late date change).
  // Prebuy no-show moves already added their own per-person line above.
  if (!movedOrigin && !prebuyNoShowMove && reduceFee > 0 && booking.lateDateChange != null) {
    const perPerson = Math.max(0, DEFAULT_BOOKING_CUTOFFS.dateChangeFeePerPerson)
    const heads =
      perPerson > 0 && reduceFee % perPerson === 0 ? Math.floor(reduceFee / perPerson) : 0
    items.push({
      id: moneyId(),
      bookingCode: booking.code,
      travelDate: booking.date,
      voucherNo,
      description: booking.movedFrom
        ? // Guests moved here from another date at marina check-in (extra charge per person).
          `Moved to this date · extra charge${heads > 0 ? `, ${heads}Pax` : ''} (from ${booking.movedFrom.code} · ${booking.movedFrom.date})`
        : lateReduceFeeDescription({
            amount: reduceFee,
            adults: heads,
            adultPrice: perPerson,
          }),
      adults: heads,
      children: 0,
      infants: 0,
      tourLeaders: 0,
      adultPrice: heads > 0 ? perPerson : 0,
      childPrice: 0,
      infantPrice: 0,
      tourLeaderPrice: 0,
      cot: 0,
      amount: reduceFee,
      lineKind: 'other',
      unit: heads > 0 ? 'Person' : 'Fee',
      sortOrder: items.length,
    })
  }

  if (isPrivateTransfer(booking)) {
    const stored = parseCashOnTourAmount(booking.privateTransferPrice)
    const amount = stored > 0 ? stored : rates.privateTransferExtra
    if (amount > 0) {
      const vehicle = booking.privateTransferVehicle
        ? ` (${booking.privateTransferVehicle})`
        : ''
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: booking.date,
        voucherNo,
        description: `Private Transfer Extra Charge${vehicle}`,
        adults: 0,
        children: 0,
        infants: 0,
        tourLeaders: 0,
        adultPrice: 0,
        childPrice: 0,
        infantPrice: 0,
        tourLeaderPrice: 0,
        cot: 0,
        amount,
        lineKind: 'private_transfer',
        sortOrder: items.length,
      })
    }
  }

  if (booking.transferExtraCharge.trim() && rates.extraZoneCharge > 0) {
    items.push({
      id: moneyId(),
      bookingCode: booking.code,
      travelDate: booking.date,
      voucherNo,
      description: `Extra Zone Charge · ${booking.transferExtraCharge}`,
      adults: 0,
      children: 0,
      infants: 0,
      tourLeaders: 0,
      adultPrice: 0,
      childPrice: 0,
      infantPrice: 0,
      tourLeaderPrice: 0,
      cot: 0,
      amount: rates.extraZoneCharge,
      lineKind: 'extra_zone',
      sortOrder: items.length,
    })
  }

  // Invoice agents only: No Transfer pickup → -100 THB per AD+CH. Prebuy: no discount.
  if (
    !prebuy &&
    booking.status !== 'Cancelled' &&
    isNoTransfer(booking.pickupZone)
  ) {
    const heads =
      Math.max(0, booking.adults) + Math.max(0, booking.children)
    if (heads > 0) {
      const per = NO_TRANSFER_DISCOUNT_PER_PERSON
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: movedOrigin ?? booking.date,
        voucherNo,
        description: `No Transfer · -${per} THB / Person`,
        adults: booking.adults,
        children: booking.children,
        infants: 0,
        tourLeaders: 0,
        adultPrice: -per,
        childPrice: -per,
        infantPrice: 0,
        tourLeaderPrice: 0,
        cot: 0,
        amount: -(heads * per),
        lineKind: 'other',
        unit: 'Person',
        sortOrder: items.length,
      })
    }
  }

  const thaiGuests = Math.max(0, Math.floor(options?.thaiGuests ?? 0))

  // Agent-billed park (PP + Included only). Sync Thai seats from check-in nationality.
  // Foreigners → full park rate line. Thai → separate 40 THB/AD·CH line.
  // Not Included: guest pays at marina — do not bill the agent.
  if (
    booking.status !== 'Cancelled' &&
    booking.program === 'PP' &&
    booking.parkFee === 'Included'
  ) {
    const ratesPP = parkFeeRates('PP')
    const park = parkFeeTotalWithThai(
      'Not Included',
      'PP',
      booking.adults,
      booking.children,
      thaiGuests,
    )
    if (park.foreignAdults + park.foreignChildren > 0) {
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: movedOrigin ?? booking.date,
        voucherNo,
        description: 'National Park Fee · Included',
        adults: park.foreignAdults,
        children: park.foreignChildren,
        infants: 0,
        tourLeaders: 0,
        adultPrice: ratesPP.adult,
        childPrice: ratesPP.child,
        infantPrice: 0,
        tourLeaderPrice: 0,
        cot: 0,
        amount: park.foreignAdults * ratesPP.adult + park.foreignChildren * ratesPP.child,
        lineKind: 'park_fee',
        sortOrder: items.length,
      })
    }
    if (park.thaiAdults + park.thaiChildren > 0 && park.thaiAmount > 0) {
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: movedOrigin ?? booking.date,
        voucherNo,
        description: 'Thai nationality · National Park',
        adults: park.thaiAdults,
        children: park.thaiChildren,
        infants: 0,
        tourLeaders: 0,
        adultPrice: THAI_PARK_FEE_THB,
        childPrice: THAI_PARK_FEE_THB,
        infantPrice: 0,
        tourLeaderPrice: 0,
        cot: 0,
        amount: park.thaiAmount,
        lineKind: 'park_fee',
        sortOrder: items.length,
      })
    }
  }

  if (options?.includeOtherService && rates.otherServiceCharge > 0) {
    items.push({
      id: moneyId(),
      bookingCode: booking.code,
      travelDate: booking.date,
      voucherNo,
      description: rates.otherServiceLabel.trim() || 'Other Service Charge',
      adults: 0,
      children: 0,
      infants: 0,
      tourLeaders: 0,
      adultPrice: 0,
      childPrice: 0,
      infantPrice: 0,
      tourLeaderPrice: 0,
      cot: 0,
      amount: rates.otherServiceCharge,
      lineKind: 'other',
      sortOrder: items.length,
    })
  }

  return items.map((item) => ({ ...item, unit: chargeUnit(item) }))
}

export function itemsGrandTotal(items: Pick<InvoiceItem, 'amount'>[]) {
  return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
}

type InvoiceLinePriceFields = Pick<
  InvoiceItem,
  | 'adults'
  | 'children'
  | 'infants'
  | 'tourLeaders'
  | 'adultPrice'
  | 'childPrice'
  | 'infantPrice'
  | 'tourLeaderPrice'
  | 'amount'
>

/** Display / edit unit price for a line (AD rate, else CH / IF / TL, else amount ÷ qty). */
export function invoiceLineUnitPrice(item: InvoiceLinePriceFields) {
  if (item.adults > 0 && item.adultPrice !== 0) return item.adultPrice
  if (item.children > 0 && item.childPrice !== 0) return item.childPrice
  if (item.infants > 0 && item.infantPrice !== 0) return item.infantPrice
  if (item.tourLeaders > 0 && item.tourLeaderPrice !== 0) return item.tourLeaderPrice
  if (item.adultPrice !== 0) return item.adultPrice
  if (item.childPrice !== 0) return item.childPrice
  if (item.infantPrice !== 0) return item.infantPrice
  if (item.tourLeaderPrice !== 0) return item.tourLeaderPrice
  const qty =
    Math.max(0, item.adults) +
    Math.max(0, item.children) +
    Math.max(0, item.infants) +
    Math.max(0, item.tourLeaders)
  if (qty > 0 && item.amount !== 0) {
    return Math.round((item.amount / qty) * 100) / 100
  }
  return item.amount !== 0 ? item.amount : 0
}

/** Amount from qty × rates. Flat fee (no heads) uses adultPrice as the line amount. */
export function invoiceLineComputedAmount(item: InvoiceLinePriceFields) {
  const adults = Math.max(0, Math.floor(Number(item.adults) || 0))
  const children = Math.max(0, Math.floor(Number(item.children) || 0))
  const infants = Math.max(0, Math.floor(Number(item.infants) || 0))
  const tourLeaders = Math.max(0, Math.floor(Number(item.tourLeaders) || 0))
  const qty = adults + children + infants + tourLeaders
  if (qty > 0) {
    return (
      Math.round(
        (adults * (Number(item.adultPrice) || 0) +
          children * (Number(item.childPrice) || 0) +
          infants * (Number(item.infantPrice) || 0) +
          tourLeaders * (Number(item.tourLeaderPrice) || 0)) *
          100,
      ) / 100
    )
  }
  return Math.round((Number(item.adultPrice) || 0) * 100) / 100
}

/** Apply a single Price/Unit to the line and recompute amount. */
export function withInvoiceLineUnitPrice(item: InvoiceItem, unitPrice: number): InvoiceItem {
  const price = Number.isFinite(unitPrice) ? unitPrice : 0
  const next: InvoiceItem = { ...item }
  if (item.adults > 0 || (item.children <= 0 && item.infants <= 0 && item.tourLeaders <= 0)) {
    next.adultPrice = price
  }
  if (item.children > 0) {
    // Keep CH in sync when it was unused or matched the previous AD rate.
    if (item.childPrice === 0 || item.childPrice === item.adultPrice || item.adults <= 0) {
      next.childPrice = price
    }
  }
  if (item.infants > 0 && (item.infantPrice === 0 || item.infantPrice === item.adultPrice)) {
    next.infantPrice = price
  }
  if (
    item.tourLeaders > 0 &&
    (item.tourLeaderPrice === 0 || item.tourLeaderPrice === item.adultPrice)
  ) {
    next.tourLeaderPrice = price
  }
  if (
    item.adults <= 0 &&
    item.children <= 0 &&
    item.infants <= 0 &&
    item.tourLeaders <= 0
  ) {
    next.adultPrice = price
  }
  next.amount = invoiceLineComputedAmount(next)
  return next
}

export function withInvoiceLineRecalc(
  item: InvoiceItem,
  patch: Partial<InvoiceItem>,
): InvoiceItem {
  const next = { ...item, ...patch }
  next.amount = invoiceLineComputedAmount(next)
  return next
}

export function isGuestCollectLine(item: Pick<InvoiceItem, 'lineKind'>) {
  return item.lineKind === 'park_guest'
}

export function itemsAgentTotal(items: Pick<InvoiceItem, 'amount' | 'lineKind'>[]) {
  return itemsGrandTotal(items.filter((item) => !isGuestCollectLine(item)))
}

export function itemsGuestTotal(items: Pick<InvoiceItem, 'amount' | 'lineKind'>[]) {
  return itemsGrandTotal(items.filter(isGuestCollectLine))
}

export function invoiceAmountForBooking(doc: InvoiceDocument, bookingCode: string) {
  return itemsAgentTotal(doc.items.filter((item) => item.bookingCode === bookingCode))
}

export function invoiceGuestAmountForBooking(doc: InvoiceDocument, bookingCode: string) {
  return itemsGuestTotal(doc.items.filter((item) => item.bookingCode === bookingCode))
}

export function invoiceAutoAmountForBooking(doc: InvoiceDocument, bookingCode: string) {
  return itemsAgentTotal(
    doc.items.filter((item) => item.bookingCode === bookingCode && item.lineKind !== 'other'),
  )
}

export function isInvoiceAmountStale(storedAmount: number, liveAmount: number) {
  return Math.round(storedAmount) !== Math.round(liveAmount)
}

export function invoiceTravelRange(doc: InvoiceDocument) {
  const dates = doc.items
    .map((item) => item.travelDate)
    .filter(Boolean)
    .sort()
  if (dates.length === 0) return doc.issueDate
  if (dates[0] === dates[dates.length - 1]) return formatInvoiceDate(dates[0]!)
  return `${formatInvoiceDate(dates[0]!)} – ${formatInvoiceDate(dates[dates.length - 1]!)}`
}

export function isIssuedInvoice(doc: InvoiceDocument) {
  return doc.kind === 'invoice' && doc.isDraft !== true
}

export function invoicedBookingCodes(invoices: InvoiceDocument[]) {
  const codes = new Set<string>()
  for (const doc of invoices) {
    if (!isIssuedInvoice(doc)) continue
    for (const item of doc.items) {
      if (item.bookingCode) codes.add(item.bookingCode)
    }
  }
  return codes
}

export function invoicesForBookings(invoices: InvoiceDocument[], bookingCodes: string[]) {
  const wanted = new Set(bookingCodes)
  return invoices.filter(
    (doc) =>
      isIssuedInvoice(doc) && doc.items.some((item) => wanted.has(item.bookingCode)),
  )
}

export function majorityProgram(bookings: Booking[]): Program {
  const pp = bookings.filter((booking) => booking.program === 'PP').length
  const jb = bookings.length - pp
  return jb > pp ? 'James Bond' : 'PP'
}

export function checkInStatusLabel(status: CheckInAttendance | null, cancelled: boolean) {
  if (cancelled) return 'Cancelled'
  if (status === 'checked') return 'Checked in'
  if (status === 'no-show') return 'No-show'
  return 'Pending'
}

export function parseInvoiceKind(value: unknown): InvoiceKind {
  if (value === 'billing_note') return 'billing_note'
  if (value === 'credit_note') return 'credit_note'
  return 'invoice'
}

export function newInvoiceDocument(input: {
  existing: InvoiceDocument[]
  kind: InvoiceKind
  agentSlug: string
  agentName: string
  issueDate: string
  notes?: string
  items: Omit<InvoiceItem, 'invoiceId'>[]
  program?: Program
  linkedInvoiceIds?: string[]
}): InvoiceDocument {
  const id = moneyId()
  const items = input.items.map((item, index) => ({
    ...item,
    invoiceId: id,
    sortOrder: index,
  }))
  return {
    id,
    number: nextDocumentNumber(input.existing, input.kind, input.issueDate, input.program),
    kind: input.kind,
    agentSlug: input.agentSlug,
    agentName: input.agentName,
    issueDate: input.issueDate,
    status: 'unpaid',
    notes: input.notes ?? '',
    grandTotal: itemsAgentTotal(items),
    paidAt: null,
    paymentChannel: null,
    receiptNo: null,
    linkedInvoiceIds: input.linkedInvoiceIds ?? [],
    items,
    payments: [],
    createdAt: new Date().toISOString(),
    sendToAgent: false,
  }
}

export function newCreditNoteFromInvoice(
  source: InvoiceDocument,
  existing: InvoiceDocument[],
  issueDate: string,
): InvoiceDocument {
  const items = source.items.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    amount: -Math.abs(Number(item.amount) || 0),
    adultPrice: item.adultPrice ? -Math.abs(item.adultPrice) : item.adultPrice,
    childPrice: item.childPrice ? -Math.abs(item.childPrice) : item.childPrice,
    description: `Credit · ${item.description}`,
  }))
  const doc = newInvoiceDocument({
    existing,
    kind: 'credit_note',
    agentSlug: source.agentSlug,
    agentName: source.agentName,
    issueDate,
    notes: `Credit note for ${source.number}`,
    items,
    linkedInvoiceIds: [source.id],
  })
  return {
    ...doc,
    status: 'paid',
    paidAt: `${issueDate}T12:00:00.000Z`,
  }
}
