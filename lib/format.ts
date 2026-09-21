export function formatLongDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatShortDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Portal ops calendar — matches booking cutoffs. */
export const PORTAL_TIMEZONE = 'Asia/Bangkok' as const

export function toISODate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Parse YYYY-MM-DD into a local Date at midnight (no UTC shift). */
export function dateFromISO(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

/**
 * Portal ops / check-in calendar date in Thailand time.
 * Rolls at midnight Asia/Bangkok (not the browser's local TZ, not UTC).
 * Example: 23:50 on 20 Sep → "20 Sep"; 00:10 on 21 Sep → "21 Sep".
 */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PORTAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Thailand calendar date at local midnight (no time-of-day). */
export function startOfToday(now: Date = new Date()): Date {
  return dateFromISO(todayISO(now))
}

/** First day of the Thailand calendar month containing `now`. */
export function startOfThisMonth(now: Date = new Date()): Date {
  const [y, m] = todayISO(now).split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, 1)
}

export function bookingPrefix(program: 'PP' | 'James Bond') {
  return program === 'PP' ? 'PP' : 'JB'
}

/**
 * Monthly stem: program + YY + MM + '-'
 * Examples: PP2609-  JB2701-
 * (YY/MM from travel date, Gregorian calendar)
 */
export function bookingCodeStem(program: 'PP' | 'James Bond', date: string) {
  const prefix = bookingPrefix(program)
  const [year, month] = date.split('-')
  const yy = (year ?? '').slice(2)
  const mm = (month ?? '01').padStart(2, '0')
  return `${prefix}${yy}${mm}-`
}

const CODE_SEQ_RE = /^(?:PP|JB)\d{4}-(\d+)$/

/** Next code in format PP2609-0001 (monthly sequence per program). */
export function nextBookingCode(program: 'PP' | 'James Bond', date: string, existingCodes: string[]) {
  const stem = bookingCodeStem(program, date)
  const sequence = existingCodes
    .filter((code) => code.startsWith(stem))
    .map((code) => {
      const match = CODE_SEQ_RE.exec(code)
      return match ? Number(match[1]) : Number(code.slice(stem.length) || '0')
    })
    .filter((value) => Number.isFinite(value))
    .reduce((max, value) => Math.max(max, value), 0)

  return `${stem}${String(sequence + 1).padStart(4, '0')}`
}

export function slugifyAgentName(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'agent'
}

export function uniqueAgentSlug(name: string, existingSlugs: string[]) {
  const base = slugifyAgentName(name)
  if (!existingSlugs.includes(base)) return base
  let index = 2
  while (existingSlugs.includes(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

/** Report display label — stored value stays "Not Included". */
export function formatIncludeLabel(value: string | null | undefined) {
  if (!value) return '—'
  if (value === 'Not Included') return 'Excluded'
  return value
}

/** Compact print label for park / canoe. */
export function formatIncludeShort(value: string | null | undefined) {
  if (!value) return '—'
  if (value === 'Included') return 'Inc'
  if (value === 'Not Included') return 'Excl'
  return value
}

/** National park AD/CH rates (THB) by program. */
export function parkFeeRates(program: 'PP' | 'James Bond') {
  return program === 'James Bond'
    ? { adult: 300, child: 150 }
    : { adult: 400, child: 200 }
}

export function parkFeeRateLabel(program: 'PP' | 'James Bond') {
  const rates = parkFeeRates(program)
  return `${rates.adult}/${rates.child}`
}

/** Total national park fee for a booking when park is not included. */
export function parkFeeTotal(
  parkFee: string,
  program: 'PP' | 'James Bond',
  adults: number,
  children: number,
) {
  if (parkFee !== 'Not Included') return 0
  const rates = parkFeeRates(program)
  return adults * rates.adult + children * rates.child
}

export function formatParkFeeTotal(
  parkFee: string,
  program: 'PP' | 'James Bond',
  adults: number,
  children: number,
) {
  const total = parkFeeTotal(parkFee, program, adults, children)
  return total > 0 ? total.toLocaleString('en-US') : ''
}

/** Parse a cash-on-tour string like "1,800 THB" into a number. */
export function parseCashOnTourAmount(cashOnTour: string | null | undefined) {
  const raw = cashOnTour?.trim() ?? ''
  if (!raw) return 0
  const match = raw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  if (!match) return 0
  const value = Number(match[1])
  return Number.isFinite(value) ? value : 0
}

/** Park fee (AD + CH) + cash on tour. */
export function collectTotal(
  parkFee: string,
  program: 'PP' | 'James Bond',
  adults: number,
  children: number,
  cashOnTour: string | null | undefined,
) {
  return (
    parkFeeTotal(parkFee, program, adults, children) + parseCashOnTourAmount(cashOnTour)
  )
}

export function formatCollectTotal(
  parkFee: string,
  program: 'PP' | 'James Bond',
  adults: number,
  children: number,
  cashOnTour: string | null | undefined,
) {
  const total = collectTotal(parkFee, program, adults, children, cashOnTour)
  return total > 0 ? total.toLocaleString('en-US') : ''
}
