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

export function toISODate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function bookingPrefix(program: 'PP' | 'James Bond') {
  return program === 'PP' ? 'PP' : 'JB'
}

/** Stem like PP2609- / JB2610- (program + YY + MM). */
export function bookingCodeStem(program: 'PP' | 'James Bond', date: string) {
  const prefix = bookingPrefix(program)
  const [year, month] = date.split('-')
  const yy = (year ?? '').slice(2)
  const mm = (month ?? '01').padStart(2, '0')
  return `${prefix}${yy}${mm}-`
}

/** Next code in format PP2609-0001 (monthly sequence per program). */
export function nextBookingCode(program: 'PP' | 'James Bond', date: string, existingCodes: string[]) {
  const stem = bookingCodeStem(program, date)
  const sequence = existingCodes
    .filter((code) => code.startsWith(stem))
    .map((code) => Number(code.slice(stem.length) || '0'))
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
