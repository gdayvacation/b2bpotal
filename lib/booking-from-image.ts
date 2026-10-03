import type { IncludeOption, Program } from '@/lib/types'
import { inferParkFeeFromRemark } from '@/lib/booking-remark-fees'

/** Draft fields extracted from a chat screenshot before admin confirms. */
export type BookingImageDraft = {
  agentName: string
  agentRef: string
  program: Program | null
  date: string
  parkFee: IncludeOption
  canoe: IncludeOption
  adults: number
  children: number
  infants: number
  tourLeaders: number
  leadGuest: string
  pickupHotel: string
  pickupZone: string
  roomNumber: string
  note: string
  cashOnTour: string
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
  rawNotes: string
}

export const BOOKING_IMAGE_DRAFT_STORAGE_KEY = 'gday-booking-image-draft'

export function emptyBookingImageDraft(): BookingImageDraft {
  return {
    agentName: '',
    agentRef: '',
    program: null,
    date: '',
    parkFee: 'Included',
    canoe: 'Included',
    adults: 0,
    children: 0,
    infants: 0,
    tourLeaders: 0,
    leadGuest: '',
    pickupHotel: '',
    pickupZone: '',
    roomNumber: '',
    note: '',
    cashOnTour: '',
    confidence: 'low',
    warnings: [],
    rawNotes: '',
  }
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asNonNegInt(value: unknown, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.min(99, Math.round(n))
}

function normalizeProgram(value: unknown): Program | null {
  const raw = asString(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  if (!raw) return null
  if (
    raw.includes('james bond') ||
    raw === 'jb' ||
    raw.includes('phang nga') ||
    raw.includes('canoeing') ||
    raw.includes('hong island')
  ) {
    return 'James Bond'
  }
  if (
    raw === 'pp' ||
    raw.includes('phi phi') ||
    raw.includes('phiphi') ||
    raw.includes('maya bay') ||
    raw.includes('bamboo')
  ) {
    return 'PP'
  }
  return null
}

function normalizeInclude(value: unknown, fallback: IncludeOption = 'Included'): IncludeOption {
  const raw = asString(value).toLowerCase()
  if (!raw) return fallback
  if (raw === 'exc' || raw === 'excl' || raw === 'excluded' || raw === 'exclude') {
    return 'Not Included'
  }
  if (raw === 'inc' || raw === 'included') return 'Included'
  if (
    raw.includes('not') ||
    raw.includes('exclude') ||
    raw === 'no' ||
    raw.includes('pay own') ||
    raw.includes('self')
  ) {
    return 'Not Included'
  }
  if (raw.includes('include') || raw === 'yes' || raw === 'inc') return 'Included'
  return fallback
}

function normalizeConfidence(value: unknown): BookingImageDraft['confidence'] {
  const raw = asString(value).toLowerCase()
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw
  return 'medium'
}

function normalizeDate(value: unknown): string {
  const raw = asString(value)
  if (!raw) return ''
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // DD/MM/YYYY or DD-MM-YYYY (common in TH / chat)
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    let year = Number(dmy[3])
    if (year < 100) year += 2000
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  const parsed = Date.parse(raw)
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return ''
}

/** Coerce model JSON into a safe draft (never throws). */
export function normalizeBookingImageDraft(input: unknown): BookingImageDraft {
  const raw =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {}

  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []

  const explicitParkRaw = asString(raw.parkFee ?? raw.nationalParkFee)

  const draft: BookingImageDraft = {
    agentName: asString(raw.agentName ?? raw.agency ?? raw.agent),
    agentRef: asString(raw.agentRef ?? raw.voucher ?? raw.reference ?? raw.bookingRef),
    program: normalizeProgram(raw.program ?? raw.tour ?? raw.trip),
    date: normalizeDate(raw.date ?? raw.tourDate ?? raw.travelDate),
    parkFee: normalizeInclude(raw.parkFee ?? raw.nationalParkFee, 'Included'),
    canoe: normalizeInclude(raw.canoe ?? raw.canoeing, 'Included'),
    adults: asNonNegInt(raw.adults ?? raw.ad, 0),
    children: asNonNegInt(raw.children ?? raw.child ?? raw.ch, 0),
    infants: asNonNegInt(raw.infants ?? raw.infant ?? raw.inf, 0),
    tourLeaders: asNonNegInt(raw.tourLeaders ?? raw.tl ?? raw.foc, 0),
    leadGuest: asString(raw.leadGuest ?? raw.guestName ?? raw.guest ?? raw.name),
    pickupHotel: asString(raw.pickupHotel ?? raw.hotel ?? raw.hotelName),
    pickupZone: asString(raw.pickupZone ?? raw.zone ?? raw.area),
    roomNumber: asString(raw.roomNumber ?? raw.room),
    note: asString(raw.note ?? raw.notes ?? raw.remark ?? raw.specialRequest),
    cashOnTour: asString(raw.cashOnTour ?? raw.cash ?? raw.collectCash),
    confidence: normalizeConfidence(raw.confidence),
    warnings,
    rawNotes: asString(raw.rawNotes ?? raw.summary),
  }

  const fromRemark = inferParkFeeFromRemark(draft.note, explicitParkRaw || raw.parkFee || raw.nationalParkFee)
  if (fromRemark) draft.parkFee = fromRemark

  if (!draft.program) {
    draft.warnings.push('Program could not be read clearly — please choose PP or James Bond.')
  }
  if (!draft.date) {
    draft.warnings.push('Tour date could not be read clearly — please set the date.')
  }
  if (!draft.leadGuest) {
    draft.warnings.push('Lead guest name missing — please enter the guest name.')
  }
  if (draft.adults + draft.children + draft.infants + draft.tourLeaders <= 0) {
    draft.warnings.push('Guest counts look empty — please set pax.')
  }

  return draft
}

export function parseBookingImageModelText(text: string): BookingImageDraft {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return {
      ...emptyBookingImageDraft(),
      warnings: ['AI did not return structured booking data. Please fill the form manually.'],
      rawNotes: trimmed.slice(0, 500),
    }
  }
  try {
    return normalizeBookingImageDraft(JSON.parse(candidate.slice(start, end + 1)))
  } catch {
    return {
      ...emptyBookingImageDraft(),
      warnings: ['Could not parse AI response. Please fill the form manually.'],
      rawNotes: trimmed.slice(0, 500),
    }
  }
}

export function saveBookingImageDraft(draft: BookingImageDraft) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(BOOKING_IMAGE_DRAFT_STORAGE_KEY, JSON.stringify(draft))
}

export function loadBookingImageDraft(): BookingImageDraft | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(BOOKING_IMAGE_DRAFT_STORAGE_KEY)
  if (!raw) return null
  try {
    return normalizeBookingImageDraft(JSON.parse(raw))
  } catch {
    return null
  }
}

export function clearBookingImageDraft() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(BOOKING_IMAGE_DRAFT_STORAGE_KEY)
}
