import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'

export type AgentAllotmentPayment = {
  id: string
  amount: number
  /** Transfer / paid calendar date YYYY-MM-DD */
  paidDate: string
  note: string
}

export type AgentAllotmentPayStatus = 'unpaid' | 'partial' | 'paid'

/** Park fee included in / excluded from the allotment rate. */
export type AgentAllotmentParkFee = 'inc' | 'exc'

export type AgentAllotment = {
  id: string
  agentSlug: string
  agentName: string
  seats: number
  adultSeats: number
  childSeats: number
  adultPrice: number
  childPrice: number
  parkFee: AgentAllotmentParkFee
  totalAmount: number
  paidDate: string | null
  payments: AgentAllotmentPayment[]
  note: string
  createdAt: string
  updatedAt: string
}

type AgentAllotmentRow = {
  id: string
  agent_slug: string
  agent_name: string
  seats: number | string
  adult_seats?: number | string | null
  child_seats?: number | string | null
  adult_price?: number | string | null
  child_price?: number | string | null
  park_fee?: string | null
  total_amount: number | string
  paid_date?: string | null
  payments?: unknown
  note: string | null
  created_at: string
  updated_at: string
}

export type AgentAllotmentInput = {
  agentSlug: string
  agentName: string
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
      const amount = money(num(item.amount))
      const paidDate = String(item.paidDate ?? item.paid_date ?? '').slice(0, 10)
      if (amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) return null
      return {
        id: String(item.id || crypto.randomUUID()),
        amount,
        paidDate,
        note: String(item.note ?? '').trim(),
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

export function allotmentPaidTotal(row: Pick<AgentAllotment, 'payments' | 'paidDate' | 'totalAmount'>) {
  return money(allotmentPayments(row).reduce((sum, payment) => sum + payment.amount, 0))
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
  return payments.map((payment) => ({
    id: payment.id,
    amount: money(payment.amount),
    paidDate: payment.paidDate,
    note: payment.note.trim(),
  }))
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
    seats: Math.max(seats, adultSeats + childSeats),
    adultSeats,
    childSeats,
    adultPrice: Math.max(0, num(row.adult_price)),
    childPrice: Math.max(0, num(row.child_price)),
    parkFee: parseAllotmentParkFee(row.park_fee),
    totalAmount: Math.max(0, num(row.total_amount)),
    paidDate: row.paid_date?.slice(0, 10) || null,
    payments: parseAllotmentPayments(row.payments),
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
  const amount = money(input.amount)
  const paidDate = input.paidDate.trim()
  if (amount <= 0) throw new Error('Enter a payment amount greater than 0.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) throw new Error('Enter a valid paid date.')

  const existing = await getAgentAllotment(id)
  const current = writablePayments(existing)
  const balance = allotmentBalance(existing)
  if (balance <= 0.009) throw new Error('This allotment is already fully paid.')
  if (amount - balance > 0.009) {
    throw new Error(`Payment exceeds remaining balance (${balance.toLocaleString('en-US')} THB).`)
  }

  const nextPayments = [
    ...current,
    {
      id: crypto.randomUUID(),
      amount,
      paidDate,
      note: input.note?.trim() || '',
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
