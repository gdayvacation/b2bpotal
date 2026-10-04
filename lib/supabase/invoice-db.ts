import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'
import { selectAllPaged } from '@/lib/supabase/paged'
import {
  DEFAULT_INVOICE_SETTINGS,
  DEFAULT_NATIONAL_PARK_FEE,
  emptyAgencyRates,
  invoicePayments,
  migrateInvoiceDocumentNumbers,
  nextDocumentNumber,
  normalizeInvoiceSettings,
  parseAgentBillingType,
  parseInvoiceKind,
  parseInvoiceStatus,
  type AgencyInvoiceRates,
  type InvoiceDocument,
  type InvoiceItem,
  type InvoiceKind,
  type InvoiceLineKind,
  type InvoicePayment,
  type InvoiceSettings,
  type InvoiceStatus,
  parsePaymentChannel,
} from '@/lib/invoice'
import {
  allocateUniqueDocumentNumber,
  fetchCloudInvoiceNumberPool,
  isDuplicateInvoiceNoError,
} from '@/lib/invoice-number'

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
  signature_image?: string | null
}

type RatesRow = {
  agent_slug: string
  billing_type?: string | null
  adult_price: number | string
  child_price: number | string
  infant_price: number | string
  tour_leader_price: number | string
  national_park_included?: boolean | null
  national_park_fee?: number | string | null
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
  payment_channel?: string | null
  receipt_no: string | null
  linked_invoice_ids: unknown
  created_at: string
  send_to_agent?: boolean | null
  payments?: unknown
  is_draft?: boolean | null
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
  unit?: string | null
}

function num(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function isLineKind(value: unknown): value is InvoiceLineKind {
  return (
    value === 'tour' ||
    value === 'no_show' ||
    value === 'change_date' ||
    value === 'cancel' ||
    value === 'private_transfer' ||
    value === 'extra_zone' ||
    value === 'park_fee' ||
    value === 'park_guest' ||
    value === 'service' ||
    value === 'other'
  )
}

function mapSettings(row: SettingsRow): InvoiceSettings {
  return normalizeInvoiceSettings({
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
    signatureImage: row.signature_image ?? '',
  })
}

function settingsToRow(settings: InvoiceSettings, includeSignature = true): SettingsRow {
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
    ...(includeSignature ? { signature_image: settings.signatureImage || '' } : {}),
  }
}

function mapRates(row: RatesRow): AgencyInvoiceRates {
  return {
    agentSlug: row.agent_slug,
    billingType: parseAgentBillingType(row.billing_type),
    adultPrice: num(row.adult_price),
    childPrice: num(row.child_price),
    infantPrice: num(row.infant_price),
    tourLeaderPrice: num(row.tour_leader_price),
    nationalParkIncluded: Boolean(row.national_park_included),
    nationalParkFee:
      row.national_park_fee == null || row.national_park_fee === ''
        ? DEFAULT_NATIONAL_PARK_FEE
        : num(row.national_park_fee),
    changeDatePrice: num(row.change_date_price),
    cancelPrice: num(row.cancel_price),
    privateTransferExtra: num(row.private_transfer_extra),
    extraZoneCharge: num(row.extra_zone_charge),
    otherServiceCharge: num(row.other_service_charge),
    otherServiceLabel: row.other_service_label?.trim() || 'Other Service Charge',
  }
}

function normalizeRates(rates: AgencyInvoiceRates[]): AgencyInvoiceRates[] {
  return rates.map((row) => ({
    ...emptyAgencyRates(row.agentSlug),
    ...row,
    billingType: parseAgentBillingType(row.billingType),
  }))
}

/** Sync read of agency rates (local cache) for ops that cannot await the store. */
export function readLocalAgencyRates(): AgencyInvoiceRates[] {
  return normalizeRates(readLocal<AgencyInvoiceRates[]>(RATES_KEY, []))
}

function mergeRatesWithLocal(
  cloudRates: AgencyInvoiceRates[],
  localRates: AgencyInvoiceRates[],
  rawRows: RatesRow[],
): AgencyInvoiceRates[] {
  const localBySlug = new Map(normalizeRates(localRates).map((row) => [row.agentSlug, row]))
  const rawBySlug = new Map(rawRows.map((row) => [row.agent_slug, row]))
  const merged = cloudRates.map((row) => {
    const raw = rawBySlug.get(row.agentSlug)
    const local = localBySlug.get(row.agentSlug)
    if ((raw?.billing_type == null || raw.billing_type === '') && local?.billingType) {
      return { ...row, billingType: local.billingType }
    }
    return row
  })
  const seen = new Set(merged.map((row) => row.agentSlug))
  for (const row of localBySlug.values()) {
    if (!seen.has(row.agentSlug)) merged.push(row)
  }
  return merged
}

function ratesToRow(rates: AgencyInvoiceRates, includeBillingType = true): RatesRow {
  return {
    agent_slug: rates.agentSlug,
    ...(includeBillingType ? { billing_type: parseAgentBillingType(rates.billingType) } : {}),
    adult_price: rates.adultPrice,
    child_price: rates.childPrice,
    infant_price: rates.infantPrice,
    tour_leader_price: rates.tourLeaderPrice,
    national_park_included: Boolean(rates.nationalParkIncluded),
    national_park_fee: rates.nationalParkFee ?? DEFAULT_NATIONAL_PARK_FEE,
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
    unit: row.unit?.trim() || '',
  }
}

function itemToRow(item: InvoiceItem, includeUnit = true): ItemRow {
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
    ...(includeUnit ? { unit: item.unit?.trim() || '' } : {}),
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

function parsePayments(value: unknown): InvoicePayment[] {
  const raw = (() => {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  })()
  return raw
    .map((row) => {
      const item = row as Partial<InvoicePayment>
      const amount = Math.max(0, Math.round((Number(item.amount) || 0) * 100) / 100)
      const paidDate = String(item.paidDate ?? '').slice(0, 10)
      const channel = parsePaymentChannel(item.channel) ?? 'deduct_deposit'
      if (!paidDate || amount <= 0) return null
      return {
        id: String(item.id || crypto.randomUUID()),
        amount,
        paidDate,
        channel,
        receiptNo: String(item.receiptNo ?? '').trim(),
      } satisfies InvoicePayment
    })
    .filter((row): row is InvoicePayment => row != null)
}

function mapInvoice(row: InvoiceRow, items: InvoiceItem[]): InvoiceDocument {
  return {
    id: row.id,
    number: row.invoice_no,
    kind: parseInvoiceKind(row.kind),
    agentSlug: row.agent_slug,
    agentName: row.agent_name,
    issueDate: row.issue_date,
    status: parseInvoiceStatus(row.status),
    notes: row.notes ?? '',
    grandTotal: num(row.grand_total),
    paidAt: row.paid_at,
    paymentChannel: parsePaymentChannel(row.payment_channel),
    receiptNo: row.receipt_no,
    linkedInvoiceIds: parseLinkedIds(row.linked_invoice_ids),
    items: items.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    payments: parsePayments(row.payments),
    createdAt: row.created_at,
    sendToAgent: row.send_to_agent === true,
    isDraft: row.is_draft === true,
  }
}

function invoiceToRow(doc: InvoiceDocument, includeChannel = true): InvoiceRow {
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
    ...(includeChannel ? { payment_channel: doc.paymentChannel } : {}),
    receipt_no: doc.receiptNo,
    linked_invoice_ids: doc.linkedInvoiceIds,
    created_at: doc.createdAt,
    send_to_agent: doc.sendToAgent === true,
    payments: invoicePayments(doc),
    is_draft: doc.isDraft === true,
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

function withMigratedNumbers(docs: InvoiceDocument[]) {
  const invoices = migrateInvoiceDocumentNumbers(docs)
  const changed = invoices.filter((doc) => {
    const prev = docs.find((row) => row.id === doc.id)
    return Boolean(
      prev &&
        (prev.number !== doc.number ||
          prev.receiptNo !== doc.receiptNo ||
          prev.notes !== doc.notes),
    )
  })
  return { invoices, changed }
}

export async function loadInvoiceStore(): Promise<InvoiceStoreSnapshot> {
  const localDocs = withMigratedNumbers(readLocal<InvoiceDocument[]>(DOCS_KEY, []))
  if (localDocs.changed.length > 0) writeLocal(DOCS_KEY, localDocs.invoices)

  const local: InvoiceStoreSnapshot = {
    settings: normalizeInvoiceSettings(readLocal<InvoiceSettings>(SETTINGS_KEY, DEFAULT_INVOICE_SETTINGS)),
    rates: normalizeRates(readLocal<AgencyInvoiceRates[]>(RATES_KEY, [])),
    invoices: localDocs.invoices,
    cloud: false,
  }

  if (!hasSupabaseConfig()) return local

  try {
    const supabase = getSupabaseBrowserClient()
    const [settingsRes, ratesRes, invoicesRes, itemsRes] = await Promise.all([
      supabase.from('invoice_settings').select('*').eq('id', 'default').maybeSingle(),
      supabase.from('agency_invoice_rates').select('*'),
      selectAllPaged<InvoiceRow>('invoices', ['created_at', 'id']).then((res) => ({
        ...res,
        data: res.data ? [...res.data].reverse() : null,
      })),
      selectAllPaged<ItemRow>('invoice_items', ['id']),
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

    const mapped = ((invoicesRes.data ?? []) as InvoiceRow[]).map((row) =>
      mapInvoice(row, itemsByInvoice.get(row.id) ?? []),
    )
    const cloudDocs = withMigratedNumbers(mapped)
    if (cloudDocs.changed.length > 0) {
      writeLocal(DOCS_KEY, cloudDocs.invoices)
      await saveInvoiceDocuments(cloudDocs.changed)
    }

    const rawRates = (ratesRes.data ?? []) as RatesRow[]
    const rates = mergeRatesWithLocal(rawRates.map(mapRates), local.rates, rawRates)
    writeLocal(RATES_KEY, rates)

    return {
      settings: settingsRes.data
        ? mapSettings(settingsRes.data as SettingsRow)
        : local.settings,
      rates,
      invoices: cloudDocs.invoices,
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

export async function saveInvoiceSettings(settings: InvoiceSettings): Promise<{ error?: string }> {
  writeLocal(SETTINGS_KEY, settings)
  if (!hasSupabaseConfig()) return {}
  try {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from('invoice_settings').upsert(settingsToRow(settings))
    if (error) {
      const missingSignature = /signature_image|schema cache|column/i.test(error.message)
      if (missingSignature) {
        const retry = await supabase.from('invoice_settings').upsert(settingsToRow(settings, false))
        if (!retry.error) return {}
      }
      console.warn('[supabase] invoice settings save failed', error.message)
      return { error: error.message }
    }
    return {}
  } catch (error) {
    const msg = String(error)
    console.warn('[supabase] invoice settings save failed', msg)
    return { error: msg }
  }
}

export async function saveAgencyRates(rates: AgencyInvoiceRates): Promise<{ error?: string }> {
  const current = readLocal<AgencyInvoiceRates[]>(RATES_KEY, [])
  const next = [...current.filter((row) => row.agentSlug !== rates.agentSlug), rates]
  writeLocal(RATES_KEY, next)
  if (!hasSupabaseConfig()) return {}
  try {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from('agency_invoice_rates').upsert(ratesToRow(rates))
    if (error) {
      const missingColumn =
        /billing_type|national_park_fee|national_park_included|schema cache|column/i.test(
          error.message,
        )
      if (missingColumn) {
        const full = ratesToRow(rates, false)
        const {
          national_park_fee: _park,
          national_park_included: _inc,
          ...withoutPark
        } = full
        const retryPark = await supabase.from('agency_invoice_rates').upsert(withoutPark)
        if (!retryPark.error) return {}
        const retry = await supabase.from('agency_invoice_rates').upsert(ratesToRow(rates, false))
        if (!retry.error) return {}
        console.warn('[supabase] agency invoice rates save failed', retry.error.message)
        return { error: retry.error.message }
      }
      console.warn('[supabase] agency invoice rates save failed', error.message)
      return { error: error.message }
    }
    return {}
  } catch (error) {
    const msg = String(error)
    console.warn('[supabase] agency invoice rates save failed', msg)
    return { error: msg }
  }
}

export async function saveInvoiceDocument(
  doc: InvoiceDocument,
): Promise<{ error?: string; document?: InvoiceDocument }> {
  let working = doc
  try {
    working = await allocateUniqueDocumentNumber(doc)
  } catch {
    working = doc
  }
  const current = readLocal<InvoiceDocument[]>(DOCS_KEY, [])
  writeLocal(DOCS_KEY, [working, ...current.filter((row) => row.id !== working.id)])
  if (!hasSupabaseConfig()) return { document: working }
  try {
    const supabase = getSupabaseBrowserClient()
    let row = invoiceToRow(working)
    let invoiceError = (await supabase.from('invoices').upsert(row)).error

    if (invoiceError && isDuplicateInvoiceNoError(invoiceError.message)) {
      let pool = await fetchCloudInvoiceNumberPool()
      for (let attempt = 0; attempt < 5; attempt += 1) {
        pool = pool.filter((item) => item.id !== working.id)
        working = {
          ...working,
          number: nextDocumentNumber(pool, working.kind, working.issueDate),
        }
        pool = [...pool, working]
        writeLocal(DOCS_KEY, [working, ...current.filter((row) => row.id !== working.id)])
        row = invoiceToRow(working)
        invoiceError = (await supabase.from('invoices').upsert(row)).error
        if (!invoiceError) break
        if (!isDuplicateInvoiceNoError(invoiceError.message)) break
      }
    }

    if (invoiceError) {
      const missingColumn = /payment_channel|send_to_agent|payments|schema cache|column/i.test(
        invoiceError.message,
      )
      if (missingColumn) {
        const { send_to_agent: _send, payments: _payments, is_draft: _draft, ...withoutExtras } = row
        const retryExtras = await supabase.from('invoices').upsert(withoutExtras)
        if (retryExtras.error) {
          const retry = await supabase.from('invoices').upsert(invoiceToRow(working, false))
          if (retry.error) {
            console.warn('[supabase] invoice save failed', retry.error.message)
            return { error: retry.error.message }
          }
        }
      } else {
        console.warn('[supabase] invoice save failed', invoiceError.message)
        return { error: invoiceError.message }
      }
    }
    await supabase.from('invoice_items').delete().eq('invoice_id', working.id)
    if (working.items.length > 0) {
      const { error: itemError } = await supabase
        .from('invoice_items')
        .insert(working.items.map((item) => itemToRow(item)))
      if (itemError) {
        const missingUnit = /unit|schema cache|column/i.test(itemError.message)
        if (missingUnit) {
          const retry = await supabase
            .from('invoice_items')
            .insert(working.items.map((item) => itemToRow(item, false)))
          if (!retry.error) return { document: working }
          console.warn('[supabase] invoice items save failed', retry.error.message)
          return { error: retry.error.message }
        }
        console.warn('[supabase] invoice items save failed', itemError.message)
        return { error: itemError.message }
      }
    }
    return { document: working }
  } catch (error) {
    const msg = String(error)
    console.warn('[supabase] invoice save failed', msg)
    return { error: msg }
  }
}

export async function saveInvoiceDocuments(
  docs: InvoiceDocument[],
): Promise<{ error?: string; documents?: InvoiceDocument[] }> {
  const saved: InvoiceDocument[] = []
  for (const doc of docs) {
    const result = await saveInvoiceDocument(doc)
    if (result.error) return { error: result.error, documents: saved }
    if (result.document) saved.push(result.document)
  }
  return { documents: saved }
}

export async function deleteInvoiceDocument(id: string): Promise<{ error?: string }> {
  const current = readLocal<InvoiceDocument[]>(DOCS_KEY, [])
  writeLocal(
    DOCS_KEY,
    current.filter((row) => row.id !== id),
  )
  if (!hasSupabaseConfig()) return {}
  try {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from('invoices').delete().eq('id', id)
    if (error) {
      console.warn('[supabase] invoice delete failed', error.message)
      return { error: error.message }
    }
    return {}
  } catch (error) {
    const msg = String(error)
    console.warn('[supabase] invoice delete failed', msg)
    return { error: msg }
  }
}

export function persistInvoiceSnapshot(snapshot: Omit<InvoiceStoreSnapshot, 'cloud'>) {
  persistLocal(snapshot)
}

export { emptyAgencyRates }
