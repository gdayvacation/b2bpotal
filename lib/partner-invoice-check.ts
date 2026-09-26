import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'

const LOCAL_KEY = 'gday-partner-invoice-checks'

export type PartnerInvoiceCheck = {
  bookingCode: string
  travelDate: string
  program: string
  checked: boolean
  paid: boolean
  note: string
  checkedAt: string | null
  paidAt: string | null
}

type CheckRow = {
  booking_code: string
  travel_date: string
  program: string
  checked: boolean
  paid?: boolean | null
  note: string | null
  checked_at: string | null
  paid_at?: string | null
}

function readLocal(): Record<string, PartnerInvoiceCheck> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, Partial<PartnerInvoiceCheck>>
    if (!parsed || typeof parsed !== 'object') return {}
    const map: Record<string, PartnerInvoiceCheck> = {}
    for (const [code, row] of Object.entries(parsed)) {
      if (!row || typeof row !== 'object') continue
      map[code] = {
        bookingCode: row.bookingCode || code,
        travelDate: row.travelDate ?? '',
        program: row.program ?? '',
        checked: row.checked === true,
        paid: row.paid === true,
        note: row.note?.trim() ?? '',
        checkedAt: row.checkedAt ?? null,
        paidAt: row.paidAt ?? null,
      }
    }
    return map
  } catch {
    return {}
  }
}

function writeLocal(map: Record<string, PartnerInvoiceCheck>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

function mapRow(row: CheckRow): PartnerInvoiceCheck {
  return {
    bookingCode: row.booking_code,
    travelDate: row.travel_date,
    program: row.program,
    checked: row.checked === true,
    paid: row.paid === true,
    note: row.note?.trim() ?? '',
    checkedAt: row.checked_at,
    paidAt: row.paid_at ?? null,
  }
}

function isMissingTable(message: string) {
  return /could not find the table|schema cache|does not exist/i.test(message)
}

export function emptyPartnerCheck(
  bookingCode: string,
  travelDate: string,
  program: string,
): PartnerInvoiceCheck {
  return {
    bookingCode,
    travelDate,
    program,
    checked: false,
    paid: false,
    note: '',
    checkedAt: null,
    paidAt: null,
  }
}

export async function loadPartnerInvoiceChecks(): Promise<Record<string, PartnerInvoiceCheck>> {
  const local = readLocal()
  if (!hasSupabaseConfig()) return local

  try {
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase.from('partner_invoice_checks').select('*')
    if (error) {
      if (isMissingTable(error.message)) {
        console.warn(
          '[supabase] partner_invoice_checks unavailable — run supabase/add-partner-invoice-checks.sql',
        )
      } else {
        console.warn('[supabase] partner invoice checks load failed', error.message)
      }
      return local
    }
    const map: Record<string, PartnerInvoiceCheck> = { ...local }
    for (const row of (data ?? []) as CheckRow[]) {
      map[row.booking_code] = mapRow(row)
    }
    writeLocal(map)
    return map
  } catch (error) {
    console.warn('[supabase] partner invoice checks load failed', error)
    return local
  }
}

export async function savePartnerInvoiceCheck(
  check: PartnerInvoiceCheck,
): Promise<{ error?: string }> {
  const current = readLocal()
  const next = { ...current, [check.bookingCode]: check }
  writeLocal(next)

  if (!hasSupabaseConfig()) return {}
  try {
    const supabase = getSupabaseBrowserClient()
    const row = {
      booking_code: check.bookingCode,
      travel_date: check.travelDate,
      program: check.program,
      checked: check.checked,
      paid: check.paid === true,
      note: check.note,
      checked_at: check.checkedAt,
      paid_at: check.paidAt,
    }
    const { error } = await supabase.from('partner_invoice_checks').upsert(row)
    if (error) {
      if (isMissingTable(error.message)) {
        console.warn(
          '[supabase] partner_invoice_checks unavailable — run supabase/add-partner-invoice-checks.sql',
        )
        return {}
      }
      const missingPaid = /paid|paid_at|schema cache|column/i.test(error.message)
      if (missingPaid) {
        const { paid: _paid, paid_at: _paidAt, ...withoutPaid } = row
        const retry = await supabase.from('partner_invoice_checks').upsert(withoutPaid)
        if (!retry.error) return {}
      }
      console.warn('[supabase] partner invoice check save failed', error.message)
      return { error: error.message }
    }
    return {}
  } catch (error) {
    const msg = String(error)
    console.warn('[supabase] partner invoice check save failed', msg)
    return { error: msg }
  }
}
