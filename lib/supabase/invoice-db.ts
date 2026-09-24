import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'
import {
  DEFAULT_INVOICE_SETTINGS,
  emptyAgencyRates,
  type AgencyInvoiceRates,
  type InvoiceDocument,
  type InvoiceItem,
  type InvoiceKind,
  type InvoiceLineKind,
  type InvoiceSettings,
  type InvoiceStatus,
} from '@/lib/invoice'

const SETTINGS_KEY = 'gday-invoice-settings'
const RATES_KEY = 'gday-agency-invoice-rates'
const DOCS_KEY = 'gday-invoice-documents'

type SettingsRow = {
  id: string
  company_name: string
  company_legal: string
  address_th: string
  address_en: string
  bank_name: string
  bank_account_type: string
  bank_account_name: string
  bank_account_no: string
  issuer_name: string
  issuer_title: string
}

type RatesRow = {
  agent_slug: string
  adult_price: number | string
  child_price: number | string
  infant_price: number | string
  tour_leader_price: number | string
  change_date_price: number | string
  cancel_price: number | string
  private_transfer_extra: number | string
  extra_zone_charge: number | string
  other_service_charge: number | string
  other_service_label: string | null
}

type InvoiceRow = {
  id: string
  invoice_no: string
  kind: InvoiceKind
  agent_slug: string
  agent_name: string
  issue_date: string
  status: InvoiceStatus
  notes: string | null
  grand_total: number | string
  paid_at: string | null
  receipt_no: string | null
  linked_invoice_ids: unknown
  created_at: string
}

type ItemRow = {
  id: string
  invoice_id: string
  booking_code: string | null
  travel_date: string | null
  voucher_no: string | null
  description: string | null
  adults: number | null
  children: number | null
  infants: number | null
  tour_leaders: number | null
  adult_price: number | string | null
  child_price: number | string | null
  infant_price: number | string | null
  tour_leader_price: number | string | null
  cot: number | string | null
  amount: number | string | null
  line_kind: string | null
  sort_order: number | null
}

function num(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function isLineKind(value: unknown): value is InvoiceLineKind {
  return (
    value === 'tour' ||
    value === 'change_date' ||
    value === 'cancel' ||
    value === 'private_transfer' ||
    value === 'extra_zone' ||
    value === 'other'
  )
}

function mapSettings(row: SettingsRow): InvoiceSettings {
  return {
    companyName: row.company_name,
    companyLegal: row.company_legal,
    addressTh: row.address_th,
    addressEn: row.address_en,
    bankName: row.bank_name,
    bankAccountType: row.bank_account_type,
    bankAccountName: row.bank_account_name,
    bankAccountNo: row.bank_account_no,
    issuerName: row.issuer_name,
    issuerTitle: row.issuer_title,
  }
}

function settingsToRow(settings: InvoiceSettings): SettingsRow {
  return {
    id: 'default',
    company_name: settings.companyName,
    company_legal: settings.companyLegal,
    address_th: settings.addressTh,
    address_en: settings.addressEn,
    bank_name: settings.bankName,
    bank_account_type: settings.bankAccountType,
    bank_account_name: settings.bankAccountName,
    bank_account_no: settings.bankAccountNo,
    issuer_name: settings.issuerName,
    issuer_title: settings.issuerTitle,
  }
}

function mapRates(row: RatesRow): AgencyInvoiceRates {
  return {
    agentSlug: row.agent_slug,
    adultPrice: num(row.adult_price),
    childPrice: num(row.child_price),
    infantPrice: num(row.infant_price),
    tourLeaderPrice: num(row.tour_leader_price),
    changeDatePrice: num(row.change_date_price),
    cancelPrice: num(row.cancel_price),
    privateTransferExtra: num(row.private_transfer_extra),
    extraZoneCharge: num(row.extra_zone_charge),
    otherServiceCharge: num(row.other_service_charge),
    otherServiceLabel: row.other_service_label?.trim() || 'Other Service Charge',
  }
}

function ratesToRow(rates: AgencyInvoiceRates): RatesRow {
  return {
    agent_slug: rates.agentSlug,
    adult_price: rates.adultPrice,
    child_price: rates.childPrice,
    infant_price: rates.infantPrice,
    tour_leader_price: rates.tourLeaderPrice,
    change_date_price: rates.changeDatePrice,
    cancel_price: rates.cancelPrice,
    private_transfer_extra: rates.privateTransferExtra,
    extra_zone_charge: rates.extraZoneCharge,
    other_service_charge: rates.otherServiceCharge,
    other_service_label: rates.otherServiceLabel,
  }
}

function mapItem(row: ItemRow): InvoiceItem {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    bookingCode: row.booking_code ?? '',
    travelDate: row.travel_date ?? '',
    voucherNo: row.voucher_no ?? '',
    description: row.description ?? '',
    adults: num(row.adults),
    children: num(row.children),
    infants: num(row.infants),
    tourLeaders: num(row.tour_leaders),
    adultPrice: num(row.adult_price),
    childPrice: num(row.child_price),
    infantPrice: num(row.infant_price),
    tourLeaderPrice: num(row.tour_leader_price),
    cot: num(row.cot),
    amount: num(row.amount),
    lineKind: isLineKind(row.line_kind) ? row.line_kind : 'tour',
    sortOrder: num(row.sort_order),
  }
}

function itemToRow(item: InvoiceItem): ItemRow {
  return {
    id: item.id,
    invoice_id: item.invoiceId,
    booking_code: item.bookingCode,
    travel_date: item.travelDate || null,
    voucher_no: item.voucherNo,
    description: item.description,
    adults: item.adults,
    children: item.children,
    infants: item.infants,
    tour_leaders: item.tourLeaders,
    adult_price: item.adultPrice,
    child_price: item.childPrice,
    infant_price: item.infantPrice,
    tour_leader_price: item.tourLeaderPrice,
    cot: item.cot,
    amount: item.amount,
    line_kind: item.lineKind,
    sort_order: item.sortOrder,
  }
}

function parseLinkedIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
    } catch {
      return []
    }
  }
  return []
}

function mapInvoice(row: InvoiceRow, items: InvoiceItem[]): InvoiceDocument {
  return {
    id: row.id,
    number: row.invoice_no,
    kind: row.kind,
    agentSlug: row.agent_slug,
    agentName: row.agent_name,
    issueDate: row.issue_date,
    status: row.status,
    notes: row.notes ?? '',
    grandTotal: num(row.grand_total),
    paidAt: row.paid_at,
    receiptNo: row.receipt_no,
    linkedInvoiceIds: parseLinkedIds(row.linked_invoice_ids),
    items: items.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    createdAt: row.created_at,
  }
}

function invoiceToRow(doc: InvoiceDocument): InvoiceRow {
  return {
    id: doc.id,
    invoice_no: doc.number,
    kind: doc.kind,
    agent_slug: doc.agentSlug,
    agent_name: doc.agentName,
    issue_date: doc.issueDate,
    status: doc.status,
    notes: doc.notes,
    grand_total: doc.grandTotal,
    paid_at: doc.paidAt,
    receipt_no: doc.receiptNo,
    linked_invoice_ids: doc.linkedInvoiceIds,
    created_at: doc.createdAt,
  }
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / private mode
  }
}

function isMissingTable(message: string) {
  return /could not find the table|schema cache|does not exist/i.test(message)
}

export type InvoiceStoreSnapshot = {
  settings: InvoiceSettings
  rates: AgencyInvoiceRates[]
  invoices: InvoiceDocument[]
  cloud: boolean
}

export async function loadInvoiceStore(): Promise<InvoiceStoreSnapshot> {
  const local: InvoiceStoreSnapshot = {
    settings: { ...DEFAULT_INVOICE_SETTINGS, ...readLocal<InvoiceSettings>(SETTINGS_KEY, DEFAULT_INVOICE_SETTINGS) },
    rates: readLocal<AgencyInvoiceRates[]>(RATES_KEY, []),
    invoices: readLocal<InvoiceDocument[]>(DOCS_KEY, []),
    cloud: false,
  }

  if (!hasSupabaseConfig()) return local

  try {
    const supabase = getSupabaseBrowserClient()
    const [settingsRes, ratesRes, invoicesRes, itemsRes] = await Promise.all([
      supabase.from('invoice_settings').select('*').eq('id', 'default').maybeSingle(),
      supabase.from('agency_invoice_rates').select('*'),
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('invoice_items').select('*'),
    ])

    if (settingsRes.error || ratesRes.error || invoicesRes.error || itemsRes.error) {
      const message =
        settingsRes.error?.message ||
        ratesRes.error?.message ||
        invoicesRes.error?.message ||
        itemsRes.error?.message ||
        'unknown'
      if (isMissingTable(message)) {
        console.warn('[supabase] invoice tables unavailable — run supabase/add-invoices.sql', message)
      } else {
        console.warn('[supabase] invoice load failed', message)
      }
      return local
    }

    const itemsByInvoice = new Map<string, InvoiceItem[]>()
    for (const row of (itemsRes.data ?? []) as ItemRow[]) {
      const item = mapItem(row)
      const list = itemsByInvoice.get(item.invoiceId) ?? []
      list.push(item)
      itemsByInvoice.set(item.invoiceId, list)
    }

    return {
      settings: settingsRes.data
        ? mapSettings(settingsRes.data as SettingsRow)
        : local.settings,
      rates: ((ratesRes.data ?? []) as RatesRow[]).map(mapRates),
      invoices: ((invoicesRes.data ?? []) as InvoiceRow[]).map((row) =>
        mapInvoice(row, itemsByInvoice.get(row.id) ?? []),
      ),
      cloud: true,
    }
  } catch (error) {
    console.warn('[supabase] invoice load failed', error)
    return local
  }
}

function persistLocal(snapshot: Omit<InvoiceStoreSnapshot, 'cloud'>) {
  writeLocal(SETTINGS_KEY, snapshot.settings)
  writeLocal(RATES_KEY, snapshot.rates)
  writeLocal(DOCS_KEY, snapshot.invoices)
}

export async function saveInvoiceSettings(settings: InvoiceSettings) {
  writeLocal(SETTINGS_KEY, settings)
  if (!hasSupabaseConfig()) return
  try {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from('invoice_settings').upsert(settingsToRow(settings))
    if (error) console.warn('[supabase] invoice settings save failed', error.message)
  } catch (error) {
    console.warn('[supabase] invoice settings save failed', error)
  }
}

export async function saveAgencyRates(rates: AgencyInvoiceRates) {
  const current = readLocal<AgencyInvoiceRates[]>(RATES_KEY, [])
  const next = [...current.filter((row) => row.agentSlug !== rates.agentSlug), rates]
  writeLocal(RATES_KEY, next)
  if (!hasSupabaseConfig()) return
  try {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from('agency_invoice_rates').upsert(ratesToRow(rates))
    if (error) console.warn('[supabase] agency invoice rates save failed', error.message)
  } catch (error) {
    console.warn('[supabase] agency invoice rates save failed', error)
  }
}

export async function saveInvoiceDocument(doc: InvoiceDocument) {
  const current = readLocal<InvoiceDocument[]>(DOCS_KEY, [])
  writeLocal(DOCS_KEY, [doc, ...current.filter((row) => row.id !== doc.id)])
  if (!hasSupabaseConfig()) return
  try {
    const supabase = getSupabaseBrowserClient()
    const { error: invoiceError } = await supabase.from('invoices').upsert(invoiceToRow(doc))
    if (invoiceError) {
      console.warn('[supabase] invoice save failed', invoiceError.message)
      return
    }
    await supabase.from('invoice_items').delete().eq('invoice_id', doc.id)
    if (doc.items.length > 0) {
      const { error: itemError } = await supabase.from('invoice_items').insert(doc.items.map(itemToRow))
      if (itemError) console.warn('[supabase] invoice items save failed', itemError.message)
    }
  } catch (error) {
    console.warn('[supabase] invoice save failed', error)
  }
}

export async function saveInvoiceDocuments(docs: InvoiceDocument[]) {
  for (const doc of docs) {
    await saveInvoiceDocument(doc)
  }
}

export async function deleteInvoiceDocument(id: string) {
  const current = readLocal<InvoiceDocument[]>(DOCS_KEY, [])
  writeLocal(
    DOCS_KEY,
    current.filter((row) => row.id !== id),
  )
  if (!hasSupabaseConfig()) return
  try {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from('invoices').delete().eq('id', id)
    if (error) console.warn('[supabase] invoice delete failed', error.message)
  } catch (error) {
    console.warn('[supabase] invoice delete failed', error)
  }
}

export function persistInvoiceSnapshot(snapshot: Omit<InvoiceStoreSnapshot, 'cloud'>) {
  persistLocal(snapshot)
}

export { emptyAgencyRates }
