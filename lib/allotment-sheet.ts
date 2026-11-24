import {
  allotmentPaidTotal,
  allotmentPayments,
  type AgentAllotment,
} from '@/lib/supabase/agent-allotment-db'
import {
  changeDateFeeForAllotment,
  extraZoneChargeFromNote,
  NO_TRANSFER_DISCOUNT_PER_PERSON,
} from '@/lib/invoice'
import type { AgentAllotmentDaily, AgentBookingDayPax } from '@/lib/supabase/agent-allotment-daily-db'

export type LotTransfer = {
  id: string
  date: string
  heads: number
  amount: number
  note: string
}

/** Cash and head movements stored on one allotment record. */
export function lotTransfers(lot: AgentAllotment): LotTransfer[] {
  const payments = allotmentPayments(lot)
  const date = (lot.paidDate || lot.createdAt).slice(0, 10)
  const paid = allotmentPaidTotal(lot)
  const headPayments = payments.filter((payment) => !payment.moneyOnly)
  const moneyLines = payments
    .filter((payment) => payment.moneyOnly)
    .map((payment) => ({
      id: payment.id,
      date: (payment.headsDate || payment.paidDate).slice(0, 10),
      heads: 0,
      amount: payment.amount,
      note: payment.note.replace(/^Ref\s*/i, '').trim(),
    }))
  const lump: LotTransfer = {
    id: lot.id,
    date,
    heads: lot.seats,
    amount: paid,
    note: headPayments
      .map((payment) => payment.note.replace(/^Ref\s*/i, '').trim())
      .filter(Boolean)
      .join(', '),
  }
  if (headPayments.length === 0) return [lump, ...moneyLines]
  const explicit = headPayments.filter((payment) => (payment.heads ?? 0) !== 0)
  if (explicit.length === 0) return [lump, ...moneyLines]
  const known = explicit.reduce((sum, payment) => sum + (payment.heads ?? 0), 0)
  const missing = headPayments.filter((payment) => (payment.heads ?? 0) === 0)
  const shares = new Map<string, number>()
  let leftover = lot.seats - known
  if (missing.length > 0 && leftover > 0) {
    const base = Math.floor(leftover / missing.length)
    let extra = leftover - base * missing.length
    for (const payment of missing) {
      const share = base + (extra > 0 ? 1 : 0)
      if (extra > 0) extra -= 1
      shares.set(payment.id, share)
    }
  }
  const headLines = headPayments.map((payment) => {
    const noted = payment.note.replace(/^Ref\s*/i, '').trim()
    const stored = payment.heads ?? 0
    return {
      id: payment.id,
      date: (payment.headsDate || payment.paidDate).slice(0, 10),
      heads: stored !== 0 ? stored : (shares.get(payment.id) ?? 0),
      amount: payment.amount,
      note: noted,
    }
  })
  const assigned = headLines.reduce((sum, line) => sum + line.heads, 0)
  const remainder = lot.seats - assigned
  // Only fill heads that are on the lot but not on a payment line.
  // A negative gap means the payment lines already exceed the stored seat
  // total. That is not a transfer, so do not invent a Reduce heads row —
  // it shows up as a balance carried in from another month.
  const opening =
    remainder > 0
      ? [
          {
            id: `${lot.id}-opening`,
            date,
            heads: remainder,
            amount: 0,
            note: '',
          },
        ]
      : []
  return [...opening, ...headLines, ...moneyLines]
}

export type AllotmentSheetBooking = {
  code: string
  agentRef: string
  guestName: string
  hotel: string
  adults: number
  children: number
  chargedCancel?: boolean
  dateChanged?: boolean
  noTransfer?: boolean
  /** Canceled when the booking was cancelled with a charge. Empty otherwise. */
  status?: string
}

export type AllotmentSheetLine = {
  key: string
  date: string
  kind: 'manual' | 'usage' | 'refund' | 'charge'
  note: string
  /** Bookings on a usage day. Empty on manual rows. */
  bookings: AllotmentSheetBooking[]
  headsDelta: number
  /** Cash on this row. Usage rows charge the day's heads. Refund rows add the No Transfer credit. Charge rows take zone and change-date fees. */
  moneyDelta: number | null
  /** Positive head value at that day's adult and child rates. Usage rows deduct this from money left. */
  value: number | null
  headsLeft: number
  moneyLeft: number
  /** False for future days that are not saved onto the account yet. */
  counted: boolean
  /** Usage taken from live bookings before Daily checker save. */
  pending: boolean
  /**
   * Children on this day that are NOT taken off the head count because the agent
   * pays for them on a separate invoice. 0 when children are deducted.
   */
  childrenInvoiced: number
  lotId: string | null
  paymentId: string | null
}

function lotOpen(lot: AgentAllotment) {
  return (lot.paidDate || lot.createdAt).slice(0, 10)
}

export type AllotmentUsageRange = { from: string; until: string }

/**
 * Booking days for one lot. The oldest lot keeps every day until someone moves
 * a day onto a later lot. A move starts at usageFrom and runs until the next one.
 */
export function allotmentUsageRanges(lot: AgentAllotment, lots: AgentAllotment[]): AllotmentUsageRange[] {
  if (lots.length === 0) return []
  const base = lots[0]!
  const cuts = lots
    .flatMap((row) => (row.usageFrom ? [{ id: row.id, day: row.usageFrom }] : []))
    .sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id))
  const segments: { lotId: string; from: string; until: string }[] = []
  let owner = base.id
  let cursor = lotOpen(base)
  for (const cut of cuts) {
    if (cut.day > cursor) {
      segments.push({ lotId: owner, from: cursor, until: cut.day })
      cursor = cut.day
    }
    owner = cut.id
    cursor = cut.day
  }
  segments.push({ lotId: owner, from: cursor, until: '' })
  return segments
    .filter((segment) => segment.lotId === lot.id && segment.from < (segment.until || '9999-12-31'))
    .map(({ from, until }) => ({ from, until }))
}

export function allotmentUsageOwner(day: string, lots: AgentAllotment[]) {
  for (const lot of lots) {
    if (allotmentUsageRanges(lot, lots).some((range) => day >= range.from && (!range.until || day < range.until))) {
      return lot.id
    }
  }
  return lots[0]?.id ?? ''
}

function sortLots(lots: AgentAllotment[]) {
  return [...lots].sort((a, b) => {
    return lotOpen(a).localeCompare(lotOpen(b)) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  })
}

function firstLedgerUsageDay(daily: AgentAllotmentDaily[]) {
  const days = daily
    .filter((row) => row.totalDeduct > 0)
    .map((row) => row.day)
    .sort((a, b) => a.localeCompare(b))
  return days[0] ?? ''
}

/** Charge used heads at the day's adult and child rates. Unknown mix is priced as adults. */
function usageCharge(
  heads: number,
  adults: number,
  children: number,
  adultPrice: number,
  childPrice: number,
) {
  const used = Math.max(0, Math.floor(heads))
  if (used <= 0) return 0
  const dayTotal = Math.max(0, adults) + Math.max(0, children)
  let adultHeads = used
  let childHeads = 0
  if (dayTotal > 0) {
    adultHeads = Math.round((Math.max(0, adults) * used) / dayTotal)
    adultHeads = Math.min(used, Math.max(0, adultHeads))
    childHeads = used - adultHeads
  }
  return Math.round(adultHeads * adultPrice + childHeads * childPrice)
}

/** 100 THB back to the agent account for each adult and child with no transfer. */
function noTransferCredit(bookings: { noTransfer?: boolean; adults: number; children: number }[]) {
  return bookings.reduce((sum, booking) => {
    if (!booking.noTransfer) return sum
    const people = Math.max(0, booking.adults) + Math.max(0, booking.children)
    return sum + people * NO_TRANSFER_DISCOUNT_PER_PERSON
  }, 0)
}

function cleanNote(value: string) {
  const note = value.replace(/^BW ledger:\s*/i, '').trim()
  if (!note || /^bw ledger$/i.test(note)) return ''
  return note
}

/**
 * One running account, oldest row first.
 * Manual rows are transfers and adjustments. Usage rows are each day's heads.
 */
type BuildAllotmentSheetInput = {
  lots: AgentAllotment[]
  daily: AgentAllotmentDaily[]
  bookings: AgentBookingDayPax[]
  today: string
  /** false = only adults come off the head count; children are shown as invoiced. Default true. */
  deductChildren?: boolean
  /** When daily ledger rows exist, past usage uses saved daily only (not full booking back-fill). */
  ledgerBacked?: boolean
  /** First day of this lot. Earlier usage stays on the previous lot. Balance starts at 0. */
  fromDay?: string
  /** First day of the next lot. Usage from this day onward stays off this lot. */
  usageUntilDay?: string
  /** Booking days that belong on this lot. An empty list shows the lot's money and heads only. */
  usageRanges?: AllotmentUsageRange[] | null
  __fullBuild?: boolean
  /** Running balance before the first visible row when the sheet starts mid-history. */
  __startingBalance?: { heads: number; money: number } | null
}

export function buildAllotmentSheet(input: BuildAllotmentSheetInput): AllotmentSheetLine[] {
  const fromDay = String(input.fromDay ?? '').slice(0, 10)
  const usageUntil = String(input.usageUntilDay ?? '').slice(0, 10)
  if (fromDay && !input.__fullBuild) {
    // This lot starts at 0. Nothing is carried in from the previous lot.
    return buildAllotmentSheet({
      ...input,
      fromDay,
      usageUntilDay: usageUntil,
      __fullBuild: true,
      __startingBalance: { heads: 0, money: 0 },
    })
  }

  const deductChildren = input.deductChildren !== false
  const lots = sortLots(input.lots)
  if (lots.length === 0) return []
  const ledgerBacked =
    input.ledgerBacked ?? input.daily.some((row) => row.totalDeduct > 0)
  const ledgerFirstDay = ledgerBacked ? firstLedgerUsageDay(input.daily) : ''
  const lotEarliest = lotOpen(lots[0]!)
  const ledgerEarliest =
    ledgerFirstDay && ledgerFirstDay < lotEarliest ? ledgerFirstDay : lotEarliest
  const earliest = fromDay || ledgerEarliest
  const ratesOn = (day: string) => {
    const open = lots.filter((lot) => lotOpen(lot) <= day)
    const lot = open.at(-1) ?? lots.at(-1)
    return {
      adult: Math.max(0, lot?.adultPrice ?? 0),
      child: Math.max(0, lot?.childPrice ?? 0),
    }
  }

  type Event = Omit<AllotmentSheetLine, 'headsLeft' | 'moneyLeft'> & { sort: string }
  const events: Event[] = []
  let seq = 0
  for (const lot of lots) {
    for (const transfer of lotTransfers(lot)) {
      if (transfer.heads === 0 && transfer.amount === 0) continue
      if (transfer.date < earliest) continue
      // Same day: usage before money-only and head top-ups (green bar money left stays after tours).
      const sortPrefix =
        transfer.heads === 0 && transfer.amount !== 0 ? '3' : '6'
      events.push({
        key: `manual-${lot.id}-${transfer.id}`,
        date: transfer.date,
        sort: `${sortPrefix}-${String(seq).padStart(5, '0')}`,
        kind: 'manual',
        note: transfer.note,
        bookings: [],
        headsDelta: transfer.heads,
        moneyDelta: transfer.amount,
        value: null,
        counted: true,
        pending: false,
        childrenInvoiced: 0,
        lotId: lot.id,
        paymentId: transfer.id.endsWith('-opening') ? null : transfer.id,
      })
      seq += 1
    }
  }

  if (ledgerBacked && ledgerFirstDay && !fromDay) {
    const preLotDeduct = input.daily
      .filter((row) => row.day < lotEarliest && row.totalDeduct > 0)
      .reduce((sum, row) => sum + row.totalDeduct, 0)
    if (preLotDeduct > 0) {
      events.push({
        key: 'legacy-wallet',
        date: ledgerFirstDay,
        sort: '0-00000',
        kind: 'manual',
        note: 'Carry-forward heads (ledger before lots on sheet)',
        bookings: [],
        headsDelta: 200,
        moneyDelta: null,
        value: null,
        counted: true,
        pending: false,
        childrenInvoiced: 0,
        lotId: null,
        paymentId: null,
      })
    }
  }

  const usageRanges = input.usageRanges ?? null
  const savedByDay = new Map<string, AgentAllotmentDaily>()
  for (const row of input.daily) {
    if (!usageRanges && row.day < earliest) continue
    savedByDay.set(row.day, row)
  }
  const bookingByDay = new Map(input.bookings.map((row) => [row.day, row]))
  const days = new Set<string>([...savedByDay.keys(), ...bookingByDay.keys()])
  for (const day of days) {
    if (usageRanges) {
      const inRange = usageRanges.some((range) => day >= range.from && (!range.until || day < range.until))
      if (!inRange) continue
    } else {
      if (day < earliest) continue
      if (usageUntil && day >= usageUntil) continue
    }
    const saved = savedByDay.get(day)
    const booking = bookingByDay.get(day)
    const savedHeads = Math.max(0, saved?.totalDeduct ?? 0)
    const dayAdults = Math.max(0, booking?.adults ?? 0)
    const dayChildren = Math.max(0, booking?.children ?? 0)
    // Adults-only agents: children never come off the head count. They are shown as invoiced.
    const bookingHeads = booking ? (deductChildren ? dayAdults + dayChildren : dayAdults) : 0
    const childrenInvoiced = deductChildren ? 0 : dayChildren
    // A saved 0 must not hide live bookings. Charged cancels are already inside bookingHeads.
    if (savedHeads <= 0 && bookingHeads <= 0 && childrenInvoiced <= 0) continue
    const pending = !saved
    let heads = 0
    if (ledgerBacked) {
      if (savedHeads > 0) {
        heads = Math.max(savedHeads, bookingHeads)
      } else if (bookingHeads <= 0) {
        continue
      } else if (fromDay && day < fromDay) {
        continue
      } else {
        // From sheet start onward: show tour days from live bookings even before daily save.
        heads = bookingHeads
      }
    } else {
      // A saved daily total can be only part of the day (one invoice). Every booking on the day is still used.
      heads = Math.max(savedHeads, bookingHeads)
    }
    if (heads <= 0 && childrenInvoiced <= 0) continue
    const counted = saved ? Boolean(saved.allotmentId) || day <= input.today : day <= input.today
    const mix =
      booking && (pending || bookingHeads === heads)
        ? deductChildren
          ? `${booking.adults}A+${booking.children}C`
          : childrenInvoiced > 0
            ? `${booking.adults}A · ${childrenInvoiced}C invoiced`
            : `${booking.adults}A`
        : ''
    const note = [mix, saved ? cleanNote(saved.note) : ''].filter(Boolean).join(' · ')
    const rates = ratesOn(day)
    const value = usageCharge(
      heads,
      dayAdults,
      deductChildren ? dayChildren : 0,
      rates.adult,
      rates.child,
    )
    const bookings = (booking?.bookings ?? []).map((item) => ({
      code: item.code,
      agentRef: item.agentRef,
      guestName: item.guestName,
      hotel: item.hotel,
      adults: item.adults,
      children: item.children,
      chargedCancel: item.chargedCancel,
      dateChanged: item.dateChanged,
      noTransfer: item.noTransfer,
    }))
    const zoneCharge = (booking?.bookings ?? []).reduce((sum, item) => {
      if (item.chargedCancel) return sum
      return sum + extraZoneChargeFromNote(item.transferExtra ?? '', item.adults, item.children).amount
    }, 0)
    const changeDateFee = (booking?.bookings ?? []).reduce(
      (sum, item) =>
        sum +
        changeDateFeeForAllotment({
          adults: item.adults,
          children: item.children,
          storedFee: item.changeDateFee,
          moved: item.moved,
          chargedCancel: item.chargedCancel,
        }),
      0,
    )
    if (zoneCharge > 0) {
      events.push({
        key: `zone-${day}`,
        date: day,
        sort: `2-${day}`,
        kind: 'charge',
        note: 'Extra zone charge',
        bookings: [],
        headsDelta: 0,
        moneyDelta: -zoneCharge,
        value: null,
        counted,
        pending: false,
        childrenInvoiced: 0,
        lotId: null,
        paymentId: null,
      })
    }
    if (changeDateFee > 0) {
      events.push({
        key: `change-${day}`,
        date: day,
        sort: `3-${day}`,
        kind: 'charge',
        note: 'Change date fee',
        bookings: [],
        headsDelta: 0,
        moneyDelta: -changeDateFee,
        value: null,
        counted,
        pending: false,
        childrenInvoiced: 0,
        lotId: null,
        paymentId: null,
      })
    }
    events.push({
      key: `usage-${day}`,
      date: day,
      sort: `4-${day}`,
      kind: 'usage',
      note,
      bookings,
      headsDelta: -heads,
      moneyDelta: value === 0 ? null : -value,
      value: value === 0 ? null : value,
      counted,
      pending,
      childrenInvoiced,
      lotId: null,
      paymentId: null,
    })
    const credit = noTransferCredit(bookings)
    if (credit > 0) {
      events.push({
        key: `notf-${day}`,
        date: day,
        sort: `1-${day}`,
        kind: 'refund',
        note: 'No transfer refund',
        bookings: [],
        headsDelta: 0,
        moneyDelta: credit,
        value: null,
        counted,
        pending: false,
        childrenInvoiced: 0,
        lotId: null,
        paymentId: null,
      })
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.sort.localeCompare(b.sort))

  let headsLeft = input.__startingBalance?.heads ?? 0
  let moneyLeft = input.__startingBalance?.money ?? 0
  return events.map((event) => {
    if (event.counted) {
      headsLeft += event.headsDelta
      if (event.moneyDelta != null) moneyLeft += event.moneyDelta
    }
    return {
      key: event.key,
      date: event.date,
      kind: event.kind,
      note: event.note,
      bookings: event.bookings,
      headsDelta: event.headsDelta,
      moneyDelta: event.moneyDelta,
      value: event.value,
      headsLeft,
      moneyLeft,
      counted: event.counted,
      pending: event.pending,
      childrenInvoiced: event.childrenInvoiced,
      lotId: event.lotId,
      paymentId: event.paymentId,
    }
  })
}

export function allotmentSheetTotals(lines: AllotmentSheetLine[]) {
  const counted = lines.filter((line) => line.counted)
  const last = counted.at(-1)
  return {
    purchased: counted
      .filter((line) => line.kind === 'manual')
      .reduce((sum, line) => sum + line.headsDelta, 0),
    used: counted
      .filter((line) => line.kind === 'usage')
      .reduce((sum, line) => sum + -line.headsDelta, 0),
    headsLeft: last?.headsLeft ?? 0,
    moneyLeft: last?.moneyLeft ?? 0,
    pendingHeads: lines
      .filter((line) => line.pending && line.counted)
      .reduce((sum, line) => sum + -line.headsDelta, 0),
  }
}

/** Green-bar balance after every head and money movement that day, including same-day top-ups. */
export function allotmentSheetDayClose(dayLines: AllotmentSheetLine[]): {
  headsLeft: number
  moneyLeft: number
} {
  const last = dayLines.at(-1)
  return {
    headsLeft: last?.headsLeft ?? 0,
    moneyLeft: last?.moneyLeft ?? 0,
  }
}
