import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'
import type { Program } from '@/lib/types'

export type AgentAllotmentPayment = {
  id: string
  amount: number
  /** Transfer / paid calendar date YYYY-MM-DD */
  paidDate: string
  note: string
  /**
   * Heads this line adds, or removes when negative.
   * Omitted on money-only lines.
   */
  heads?: number
  /** When these heads join the lot, if that is earlier than the transfer date. */
  headsDate?: string
  /** Cash for other bills. Does not add heads and does not pay down the lot. */
  moneyOnly?: boolean
}

export type AgentAllotmentPayStatus = 'unpaid' | 'partial' | 'paid'

/** Park fee included in / excluded from the allotment rate. */
export type AgentAllotmentParkFee = 'inc' | 'exc'

export type AgentAllotment = {
  id: string
  agentSlug: string
  agentName: string
  /** Phi Phi and James Bond keep separate head pools. */
  program: Program
  seats: number
  adultSeats: number
  childSeats: number
  adultPrice: number
  childPrice: number
  parkFee: AgentAllotmentParkFee
  totalAmount: number
  paidDate: string | null
  payments: AgentAllotmentPayment[]
  /** This lot receives the next Daily checker save for the agent. */
  receivesBookings: boolean
  note: string
  createdAt: string
  updatedAt: string
}

type AgentAllotmentRow = {
  id: string
  agent_slug: string
  agent_name: string
  program?: string | null
  seats: number | string
  adult_seats?: number | string | null
  child_seats?: number | string | null
  adult_price?: number | string | null
  child_price?: number | string | null
  park_fee?: string | null
  total_amount: number | string
  paid_date?: string | null
  payments?: unknown
  receives_bookings?: boolean | null
  note: string | null
  created_at: string
  updated_at: string
}

export type AgentAllotmentInput = {
  agentSlug: string
  agentName: string
  program?: Program
  adultSeats: number
  childSeats: number
  adultPrice: number
  childPrice: number
  parkFee: AgentAllotmentParkFee
  paidDate: string
  /** First instalment amount. Defaults to full total when omitted. */
  paidAmount?: number
  note?: string
}

export function parseAllotmentParkFee(value: unknown): AgentAllotmentParkFee {
  return value === 'inc' ? 'inc' : 'exc'
}

export function formatAllotmentParkFee(value: AgentAllotmentParkFee) {
  return value === 'inc' ? 'Inc' : 'Exc'
}

export type AgentAllotmentPaymentInput = {
  amount: number
  paidDate: string
  note?: string
  heads?: number
  headsDate?: string
  moneyOnly?: boolean
}

function requireSupabase() {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase is not configured.')
  }
  return getSupabaseBrowserClient()
}

function num(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function money(value: number) {
  return Math.round(Math.max(0, Number(value) || 0) * 100) / 100
}

/** Rounded baht that may be negative. Used when other-cash is deducted. */
function signedMoney(value: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

export function allotmentTotalAmount(input: {
  adultSeats: number
  childSeats: number
  adultPrice: number
  childPrice: number
}) {
  const adults = Math.max(0, Math.floor(input.adultSeats))
  const children = Math.max(0, Math.floor(input.childSeats))
  const adultPrice = Math.max(0, Number(input.adultPrice) || 0)
  const childPrice = Math.max(0, Number(input.childPrice) || 0)
  return money(adults * adultPrice + children * childPrice)
}

export function parseAllotmentPayments(value: unknown): AgentAllotmentPayment[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const item = row as Record<string, unknown>
      const moneyOnly = item.moneyOnly === true || item.money_only === true
      const paidDate = String(item.paidDate ?? item.paid_date ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) return null
      const headsRaw = item.heads
      const hasHeadsValue =
        headsRaw !== undefined && headsRaw !== null && String(headsRaw).trim() !== ''
      const heads = Math.trunc(num(headsRaw))
      const keepHeads = !moneyOnly && hasHeadsValue && Number.isFinite(heads) && heads !== 0
      const rawAmount = num(item.amount)
      const amount = moneyOnly || rawAmount < 0 ? signedMoney(rawAmount) : money(rawAmount)
      // Head purchases can be stored without a heads field. Do not treat those as money-only.
      if (!keepHeads && (amount === 0 || (!moneyOnly && amount <= 0))) return null
      const headsDate = String(item.headsDate ?? item.heads_date ?? '').slice(0, 10)
      return {
        id: String(item.id || crypto.randomUUID()),
        amount,
        paidDate,
        note: String(item.note ?? '').trim(),
        ...(keepHeads ? { heads } : {}),
        ...( /^\d{4}-\d{2}-\d{2}$/.test(headsDate) ? { headsDate } : {}),
        ...(moneyOnly ? { moneyOnly: true } : {}),
      }
    })
    .filter((row): row is AgentAllotmentPayment => row !== null)
}

/** Stored payments, or a synthetic full payment when only legacy paid_date exists. */
export function allotmentPayments(
  row: Pick<AgentAllotment, 'payments' | 'paidDate' | 'totalAmount'>,
): AgentAllotmentPayment[] {
  if (row.payments.length > 0) return row.payments
  if (row.paidDate && row.totalAmount > 0) {
    return [
      {
        id: 'legacy',
        amount: money(row.totalAmount),
        paidDate: row.paidDate,
        note: '',
      },
    ]
  }
  return []
}

/** Cash that pays for this lot's heads. Money-only transfers are excluded. */
export function allotmentPaidTotal(row: Pick<AgentAllotment, 'payments' | 'paidDate' | 'totalAmount'>) {
  return money(
    allotmentPayments(row)
      .filter((payment) => !payment.moneyOnly)
      .reduce((sum, payment) => sum + payment.amount, 0),
  )
}

/** Net cash for other bills. A minus deducts this cash and does not change the lot due. */
export function allotmentOtherCash(row: Pick<AgentAllotment, 'payments' | 'paidDate' | 'totalAmount'>) {
  return signedMoney(
    allotmentPayments(row)
      .filter((payment) => payment.moneyOnly)
      .reduce((sum, payment) => sum + payment.amount, 0),
  )
}

export function allotmentBalance(row: Pick<AgentAllotment, 'totalAmount' | 'payments' | 'paidDate'>) {
  return money(Math.max(0, money(row.totalAmount) - allotmentPaidTotal(row)))
}

export function allotmentPayStatus(
  row: Pick<AgentAllotment, 'totalAmount' | 'payments' | 'paidDate'>,
): AgentAllotmentPayStatus {
  const due = money(row.totalAmount)
  const paid = allotmentPaidTotal(row)
  if (paid <= 0.009) return 'unpaid'
  if (paid + 0.009 >= due) return 'paid'
  return 'partial'
}

function paymentsToJson(payments: AgentAllotmentPayment[]) {
  return payments.map((payment) => {
    const heads = Math.trunc(Number(payment.heads) || 0)
    return {
      id: payment.id,
      amount:
        payment.moneyOnly || payment.amount < 0 ? signedMoney(payment.amount) : money(payment.amount),
      paidDate: payment.paidDate,
      note: payment.note.trim(),
      ...(heads !== 0 && !payment.moneyOnly ? { heads } : {}),
      ...(payment.headsDate && /^\d{4}-\d{2}-\d{2}$/.test(payment.headsDate)
        ? { headsDate: payment.headsDate }
        : {}),
      ...(payment.moneyOnly ? { moneyOnly: true } : {}),
    }
  })
}

function latestPaidDate(payments: AgentAllotmentPayment[]) {
  if (payments.length === 0) return null
  return [...payments].sort((a, b) => a.paidDate.localeCompare(b.paidDate)).at(-1)?.paidDate ?? null
}

/** Real payment rows for writes (materialize legacy synthetic if needed). */
function writablePayments(row: AgentAllotment): AgentAllotmentPayment[] {
  if (row.payments.length > 0) return row.payments
  return allotmentPayments(row).map((payment) =>
    payment.id === 'legacy' ? { ...payment, id: crypto.randomUUID() } : payment,
  )
}

function mapRow(row: AgentAllotmentRow): AgentAllotment {
  const seats = Math.max(0, Math.floor(num(row.seats)))
  const adultSeatsRaw = row.adult_seats
  const childSeatsRaw = row.child_seats
  const hasSplit =
    adultSeatsRaw !== undefined &&
    adultSeatsRaw !== null &&
    childSeatsRaw !== undefined &&
    childSeatsRaw !== null
  const adultSeats = hasSplit ? Math.max(0, Math.floor(num(adultSeatsRaw))) : seats
  const childSeats = hasSplit ? Math.max(0, Math.floor(num(childSeatsRaw))) : 0
  return {
    id: row.id,
    agentSlug: row.agent_slug,
    agentName: row.agent_name,
    program: row.program === 'James Bond' ? 'James Bond' : 'PP',
    seats: Math.max(seats, adultSeats + childSeats),
    adultSeats,
    childSeats,
    adultPrice: Math.max(0, num(row.adult_price)),
    childPrice: Math.max(0, num(row.child_price)),
    parkFee: parseAllotmentParkFee(row.park_fee),
    totalAmount: Math.max(0, num(row.total_amount)),
    paidDate: row.paid_date?.slice(0, 10) || null,
    payments: parseAllotmentPayments(row.payments),
    receivesBookings: row.receives_bookings === true,
    note: row.note?.trim() || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRowPayload(input: AgentAllotmentInput, payments: AgentAllotmentPayment[]) {
  const adultSeats = Math.max(0, Math.floor(input.adultSeats))
  const childSeats = Math.max(0, Math.floor(input.childSeats))
  const adultPrice = Math.max(0, Number(input.adultPrice) || 0)
  const childPrice = Math.max(0, Number(input.childPrice) || 0)
  const totalAmount = allotmentTotalAmount({ adultSeats, childSeats, adultPrice, childPrice })
  return {
    agent_slug: input.agentSlug.trim(),
    agent_name: input.agentName.trim(),
    program: input.program === 'James Bond' ? 'James Bond' : 'PP',
    adult_seats: adultSeats,
    child_seats: childSeats,
    seats: adultSeats + childSeats,
    adult_price: adultPrice,
    child_price: childPrice,
    park_fee: parseAllotmentParkFee(input.parkFee),
    total_amount: totalAmount,
    // paid_date is the lot open / business date — not the latest transfer date.
    paid_date: input.paidDate.trim() || latestPaidDate(payments) || null,
    payments: paymentsToJson(payments),
    note: input.note?.trim() || '',
  }
}

async function getAgentAllotment(id: string): Promise<AgentAllotment> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.from('agent_allotments').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  return mapRow(data as AgentAllotmentRow)
}

export async function listAgentAllotments(): Promise<AgentAllotment[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('agent_allotments')
    .select('*')
    .order('paid_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as AgentAllotmentRow[]).map(mapRow)
}

export async function listAgentAllotmentsByAgent(agentSlug: string): Promise<AgentAllotment[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('agent_allotments')
    .select('*')
    .eq('agent_slug', agentSlug.trim())
    .order('paid_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as AgentAllotmentRow[]).map(mapRow)
}

export async function createAgentAllotment(input: AgentAllotmentInput): Promise<AgentAllotment> {
  const supabase = requireSupabase()
  const totalAmount = allotmentTotalAmount(input)
  const paidAmount =
    input.paidAmount === undefined
      ? totalAmount
      : money(Math.min(totalAmount, Math.max(0, input.paidAmount)))
  const payments: AgentAllotmentPayment[] =
    paidAmount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(input.paidDate.trim())
      ? [
          {
            id: crypto.randomUUID(),
            amount: paidAmount,
            paidDate: input.paidDate.trim(),
            note: '',
          },
        ]
      : []

  const payload = toRowPayload(input, payments)
  const { data, error } = await supabase.from('agent_allotments').insert(payload).select('*').single()
  if (error) {
    if (/payments|park_fee|schema cache|column/i.test(error.message)) {
      const { payments: _payments, park_fee: _parkFee, ...base } = payload
      const withoutPark = { ...base, payments: payload.payments }
      const retryPark = await supabase.from('agent_allotments').insert(withoutPark).select('*').single()
      if (!retryPark.error) return mapRow(retryPark.data as AgentAllotmentRow)
      const { payments: _p2, ...withoutExtras } = withoutPark
      const retry = await supabase.from('agent_allotments').insert(withoutExtras).select('*').single()
      if (retry.error) throw new Error(retry.error.message)
      return mapRow(retry.data as AgentAllotmentRow)
    }
    throw new Error(error.message)
  }
  return mapRow(data as AgentAllotmentRow)
}

export async function updateAgentAllotment(
  id: string,
  input: AgentAllotmentInput,
): Promise<AgentAllotment> {
  const supabase = requireSupabase()
  const existing = await getAgentAllotment(id)
  // Keep instalment history intact when editing heads/prices on a lot.
  const preserved = writablePayments(existing)
  const payload = toRowPayload(input, preserved)
  const { data, error } = await supabase
    .from('agent_allotments')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()
  if (error) {
    if (/payments|park_fee|schema cache|column/i.test(error.message)) {
      const { payments: _payments, park_fee: _parkFee, ...base } = payload
      const withoutPark = { ...base, payments: payload.payments }
      const retryPark = await supabase
        .from('agent_allotments')
        .update(withoutPark)
        .eq('id', id)
        .select('*')
        .single()
      if (!retryPark.error) return mapRow(retryPark.data as AgentAllotmentRow)
      const { payments: _p2, ...withoutExtras } = withoutPark
      const retry = await supabase
        .from('agent_allotments')
        .update(withoutExtras)
        .eq('id', id)
        .select('*')
        .single()
      if (retry.error) throw new Error(retry.error.message)
      return mapRow(retry.data as AgentAllotmentRow)
    }
    throw new Error(error.message)
  }
  return mapRow(data as AgentAllotmentRow)
}

export async function addAgentAllotmentPayment(
  id: string,
  input: AgentAllotmentPaymentInput,
): Promise<AgentAllotment> {
  const paidDate = input.paidDate.trim()
  const moneyOnly = input.moneyOnly === true
  const amount = moneyOnly ? signedMoney(input.amount) : money(input.amount)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) throw new Error('Enter a valid paid date.')
  if (moneyOnly) {
    if (amount === 0) {
      throw new Error('Enter an amount. Use a minus, such as -500, to deduct this cash.')
    }
    if (amount < 0 && !input.note?.trim()) {
      throw new Error('Enter what this cash was deducted for.')
    }
  } else if (amount <= 0) {
    throw new Error('Enter a payment amount greater than 0.')
  }

  const existing = await getAgentAllotment(id)
  const current = writablePayments(existing)
  if (!moneyOnly) {
    const balance = allotmentBalance(existing)
    if (balance <= 0.009) throw new Error('This allotment is already fully paid.')
    if (amount - balance > 0.009) {
      throw new Error(`Payment exceeds remaining balance (${balance.toLocaleString('en-US')} THB).`)
    }
  }

  const nextPayments = [
    ...current,
    {
      id: crypto.randomUUID(),
      amount,
      paidDate,
      note: input.note?.trim() || '',
      ...(moneyOnly ? { moneyOnly: true } : {}),
    },
  ]

  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('agent_allotments')
    .update({
      payments: paymentsToJson(nextPayments),
      // Keep lot open date; only fill paid_date if the lot never had one.
      ...(existing.paidDate ? {} : { paid_date: latestPaidDate(nextPayments) }),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as AgentAllotmentRow)
}

function lineAmount(moneyOnly: boolean, rawAmount: number) {
  if (!Number.isFinite(rawAmount)) return NaN
  return moneyOnly || rawAmount < 0 ? signedMoney(rawAmount) : money(rawAmount)
}

function requireAdjustment(input: { heads: number; amount: number; paidDate: string; note?: string }) {
  const heads = Math.trunc(Number(input.heads) || 0)
  const paidDate = input.paidDate.trim()
  const note = input.note?.trim() || ''
  const moneyOnly = heads === 0
  const amount = lineAmount(moneyOnly, Number(input.amount))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) throw new Error('Enter a valid date.')
  if (!Number.isFinite(amount)) throw new Error('Enter an amount. Use 0 when this line changes heads only.')
  if (heads === 0 && amount === 0) throw new Error('Enter heads or an amount.')
  if ((heads < 0 || amount < 0) && !note) {
    throw new Error('Enter a note for this reduction.')
  }
  return { heads, paidDate, note, moneyOnly, amount }
}

async function saveAllotmentAccount(
  existing: AgentAllotment,
  input: { adultSeats: number; totalAmount: number; payments: AgentAllotmentPayment[] },
) {
  const adultSeats = Math.max(0, Math.floor(input.adultSeats))
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('agent_allotments')
    .update({
      seats: adultSeats + existing.childSeats,
      adult_seats: adultSeats,
      total_amount: money(input.totalAmount),
      payments: paymentsToJson(input.payments),
    })
    .eq('id', existing.id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as AgentAllotmentRow)
}

/** Add or reduce heads and money on the agent's account. Heads of 0 records cash only. */
export async function topUpAgentAllotment(
  id: string,
  input: { heads: number; amount: number; paidDate: string; note?: string; headsDate?: string },
): Promise<AgentAllotment> {
  const { heads, paidDate, note, moneyOnly, amount } = requireAdjustment(input)
  const headsDate = input.headsDate?.trim() || paidDate
  if (!moneyOnly && !/^\d{4}-\d{2}-\d{2}$/.test(headsDate)) {
    throw new Error('Enter a valid head date.')
  }

  const existing = await getAgentAllotment(id)
  const nextAdult = existing.adultSeats + (moneyOnly ? 0 : heads)
  if (nextAdult < 0) throw new Error('Cannot reduce heads below zero.')
  const nextPayments = existing.payments.map((payment) => ({ ...payment }))
  const hasHeadPayment = nextPayments.some((payment) => !payment.moneyOnly)
  if (!moneyOnly && !hasHeadPayment && existing.seats > 0) {
    nextPayments.push({
      id: crypto.randomUUID(),
      amount: 0,
      paidDate: (existing.paidDate || existing.createdAt).slice(0, 10),
      note: existing.note,
      heads: existing.seats,
    })
  }
  nextPayments.push({
    id: crypto.randomUUID(),
    amount,
    paidDate,
    note,
    ...(moneyOnly ? { moneyOnly: true as const } : { heads }),
    ...(!moneyOnly && headsDate !== paidDate ? { headsDate } : {}),
  })
  return saveAllotmentAccount(existing, {
    adultSeats: nextAdult,
    totalAmount: existing.totalAmount + (moneyOnly ? 0 : amount),
    payments: nextPayments,
  })
}

/**
 * Rewrite one sheet line. `previousHeads` is the heads that line currently shows
 * when the stored payment has no explicit head count.
 */
export async function updateAllotmentSheetLine(
  id: string,
  input: {
    paymentId: string
    heads: number
    previousHeads: number
    amount: number
    paidDate: string
    note?: string
    /** Keep the lot contract total. Used when the opening row is priced from the rate. */
    preserveTotal?: boolean
  },
): Promise<AgentAllotment> {
  const { heads, paidDate, note, amount } = requireAdjustment({
    heads: input.heads,
    amount: input.amount,
    paidDate: input.paidDate,
    note: input.note,
  })
  const existing = await getAgentAllotment(id)
  const isLump = input.paymentId === id || input.paymentId === 'legacy'

  if (isLump) {
    const stored = existing.payments
    const moneyLines = stored.filter((payment) => payment.moneyOnly)
    const headLines = stored.filter((payment) => !payment.moneyOnly)
    if (headLines.some((payment) => (payment.heads ?? 0) !== 0)) {
      throw new Error('Edit that transfer on its own row.')
    }
    const oldHeads = Math.trunc(Number(input.previousHeads) || 0)
    const nextAdult = existing.adultSeats + (heads - oldHeads)
    if (nextAdult < 0) throw new Error('Cannot reduce heads below zero.')
    const oldCounted = headLines.reduce((sum, payment) => sum + payment.amount, 0)
    const newCounted = heads === 0 ? 0 : amount
    const opening =
      heads !== 0 || amount !== 0
        ? [
            {
              id:
                headLines[0]?.id && headLines[0].id !== 'legacy'
                  ? headLines[0].id
                  : crypto.randomUUID(),
              amount,
              paidDate,
              note,
              ...(heads !== 0 ? { heads } : { moneyOnly: true as const }),
            },
          ]
        : []
    return saveAllotmentAccount(existing, {
      adultSeats: nextAdult,
      totalAmount: input.preserveTotal
        ? existing.totalAmount
        : existing.totalAmount + (newCounted - oldCounted),
      payments: [...opening, ...moneyLines],
    })
  }

  const payments = writablePayments(existing)
  const index = payments.findIndex((payment) => payment.id === input.paymentId)
  if (index < 0) throw new Error('This line was not found.')
  const old = payments[index]!
  const storedHeads = !old.moneyOnly && old.heads != null && old.heads !== 0 ? Math.trunc(old.heads) : null
  const oldHeads = storedHeads ?? Math.trunc(Number(input.previousHeads) || 0)
  const nextAdult = existing.adultSeats + (heads - oldHeads)
  if (nextAdult < 0) throw new Error('Cannot reduce heads below zero.')
  const oldCounted = old.moneyOnly ? 0 : old.amount
  const newCounted = heads === 0 ? 0 : amount
  const nextPayments = payments.map((payment, paymentIndex) =>
    paymentIndex === index
      ? {
          id: payment.id,
          amount,
          paidDate,
          note,
          ...(heads !== 0 ? { heads } : { moneyOnly: true as const }),
        }
      : payment,
  )
  return saveAllotmentAccount(existing, {
    adultSeats: nextAdult,
    totalAmount: existing.totalAmount + (newCounted - oldCounted),
    payments: nextPayments,
  })
}

export async function removeLastAgentAllotmentPayment(id: string): Promise<AgentAllotment> {
  const existing = await getAgentAllotment(id)
  const working = writablePayments(existing)
  if (working.length === 0) throw new Error('No payments to remove.')
  const nextPayments = working.slice(0, -1)

  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('agent_allotments')
    .update({
      payments: paymentsToJson(nextPayments),
      ...(existing.paidDate ? {} : { paid_date: latestPaidDate(nextPayments) }),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as AgentAllotmentRow)
}

export async function deleteAgentAllotment(id: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.from('agent_allotments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** The next Daily checker save for this agent lands on this lot. */
export async function setAgentAllotmentReceiving(agentSlug: string, lotId: string) {
  const supabase = requireSupabase()
  const slug = agentSlug.trim()
  const lot = await getAgentAllotment(lotId)
  const clear = await supabase
    .from('agent_allotments')
    .update({ receives_bookings: false })
    .eq('agent_slug', slug)
    .eq('program', lot.program)
    .neq('id', lotId)
  if (clear.error) throw new Error(clear.error.message)
  const set = await supabase
    .from('agent_allotments')
    .update({ receives_bookings: true })
    .eq('id', lotId)
    .eq('agent_slug', slug)
  if (set.error) throw new Error(set.error.message)
}
