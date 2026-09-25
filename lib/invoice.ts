import { parseCashOnTourAmount } from '@/lib/format'
import {
  chargeablePax,
  isPrivateTransfer,
  type Booking,
  type CheckInAttendance,
  type Program,
} from '@/lib/types'

export type InvoiceKind = 'invoice' | 'billing_note'
export type InvoiceStatus = 'unpaid' | 'paid'
export type PaymentChannel = 'bank_transfer' | 'deduct_deposit' | 'payment_link'

export const PAYMENT_CHANNELS: { value: PaymentChannel; label: string }[] = [
  { value: 'deduct_deposit', label: 'Deduct Deposit' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'payment_link', label: 'Payment Link' },
]

export function formatPaymentChannel(channel: PaymentChannel | null | undefined) {
  return PAYMENT_CHANNELS.find((row) => row.value === channel)?.label ?? ''
}

export function parsePaymentChannel(value: unknown): PaymentChannel | null {
  if (value === 'bank_transfer' || value === 'deduct_deposit' || value === 'payment_link') {
    return value
  }
  return null
}
export type InvoiceLineKind =
  | 'tour'
  | 'change_date'
  | 'cancel'
  | 'private_transfer'
  | 'extra_zone'
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

export type AgencyInvoiceRates = {
  agentSlug: string
  adultPrice: number
  childPrice: number
  infantPrice: number
  tourLeaderPrice: number
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
  createdAt: string
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
  issuerName: 'Jererawan',
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
  if (next.issuerTitle === 'ผู้อำนวยการ') {
    next.issuerTitle = DEFAULT_INVOICE_SETTINGS.issuerTitle
  }
  next.signatureImage = next.signatureImage ?? ''
  return next
}

export const COMPANY_LOGO_SRC = '/goodday-logo.png'

export function emptyAgencyRates(agentSlug: string): AgencyInvoiceRates {
  return {
    agentSlug,
    adultPrice: 0,
    childPrice: 0,
    infantPrice: 0,
    tourLeaderPrice: 0,
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
  return rates.find((row) => row.agentSlug === agentSlug) ?? emptyAgencyRates(agentSlug)
}

export function agencyRatesReady(rates: AgencyInvoiceRates) {
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

export function programLabel(program: Program) {
  return program === 'PP' ? 'Phi Phi Speedboat' : 'James Bond Speedboat'
}

export function invoicePrefix(program: Program) {
  return program === 'PP' ? 'PP' : 'JB'
}

export function formatInvoiceMoney(amount: number) {
  const value = Number.isFinite(amount) ? amount : 0
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

function documentKindPrefix(kind: InvoiceKind | 'receipt') {
  if (kind === 'receipt') return 'RC'
  if (kind === 'billing_note') return 'BN'
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
    kind === 'receipt' ? 'RC-GDV' : kind === 'billing_note' ? 'BN-GDV' : '(?:PP|JB)-GDV'
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
    const source =
      kind === 'receipt' ? (doc.receiptNo ?? '') : doc.kind === kind ? doc.number : ''
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
    kind === 'receipt' ? 'RC-GDV' : kind === 'billing_note' ? 'BN-GDV' : '(?:PP|JB)-GDV'
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

export function buildInvoiceItemsForBooking(
  booking: Booking,
  rates: AgencyInvoiceRates,
  options?: { includeOtherService?: boolean },
): Omit<InvoiceItem, 'invoiceId'>[] {
  const items: Omit<InvoiceItem, 'invoiceId'>[] = []
  const voucherNo = bookingVoucherNo(booking)

  if (booking.status === 'Cancelled') {
    const pax = chargeablePax(booking)
    const unit = rates.cancelPrice
    const amount = unit * pax
    if (amount > 0) {
      items.push({
        id: moneyId(),
        bookingCode: booking.code,
        travelDate: booking.date,
        voucherNo,
        description: `Cancel · ${programLabel(booking.program)}`,
        adults: booking.adults,
        children: booking.children,
        infants: booking.infants,
        tourLeaders: booking.tourLeaders,
        adultPrice: unit,
        childPrice: unit,
        infantPrice: 0,
        tourLeaderPrice: 0,
        cot: 0,
        amount,
        lineKind: 'cancel',
        sortOrder: items.length,
      })
    }
    return items
  }

  const tourAmount =
    booking.adults * rates.adultPrice +
    booking.children * rates.childPrice +
    booking.infants * rates.infantPrice +
    booking.tourLeaders * rates.tourLeaderPrice

  items.push({
    id: moneyId(),
    bookingCode: booking.code,
    travelDate: booking.date,
    voucherNo,
    description: programLabel(booking.program),
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    tourLeaders: booking.tourLeaders,
    adultPrice: rates.adultPrice,
    childPrice: rates.childPrice,
    infantPrice: rates.infantPrice,
    tourLeaderPrice: rates.tourLeaderPrice,
    cot: 0,
    amount: tourAmount,
    lineKind: 'tour',
    sortOrder: items.length,
  })

  const lateFee = Math.max(0, booking.lateChangeFee ?? 0)
  if (lateFee > 0) {
    items.push({
      id: moneyId(),
      bookingCode: booking.code,
      travelDate: booking.date,
      voucherNo,
      description: 'Change date',
      adults: booking.adults,
      children: booking.children,
      infants: 0,
      tourLeaders: 0,
      adultPrice: rates.changeDatePrice,
      childPrice: rates.changeDatePrice,
      infantPrice: 0,
      tourLeaderPrice: 0,
      cot: 0,
      amount: lateFee,
      lineKind: 'change_date',
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

  return items
}

export function itemsGrandTotal(items: Pick<InvoiceItem, 'amount'>[]) {
  return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
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

export function invoicedBookingCodes(invoices: InvoiceDocument[]) {
  const codes = new Set<string>()
  for (const doc of invoices) {
    if (doc.kind !== 'invoice') continue
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
      doc.kind === 'invoice' && doc.items.some((item) => wanted.has(item.bookingCode)),
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
    grandTotal: itemsGrandTotal(items),
    paidAt: null,
    paymentChannel: null,
    receiptNo: null,
    linkedInvoiceIds: input.linkedInvoiceIds ?? [],
    items,
    createdAt: new Date().toISOString(),
  }
}
