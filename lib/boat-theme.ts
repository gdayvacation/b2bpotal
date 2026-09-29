import type { BoatNumber, DayBoatPlan } from '@/lib/types'
import { DEFAULT_BOAT_LABEL_START, isPartnerBoat } from '@/lib/types'

export type BoatColorKey = 'orange' | 'green' | 'violet' | 'sky' | 'rose' | 'amber' | 'teal' | 'slate'

/** Fleet slot 1 → Boat 7 Orange, 2 → Boat 8 Green, 3 → Boat 9 Violet, then cycle. */
export const BOAT_COLOR_ORDER: BoatColorKey[] = [
  'orange',
  'green',
  'violet',
  'sky',
  'rose',
  'amber',
  'teal',
  'slate',
]

export type BoatTheme = {
  key: BoatColorKey
  /** Human color name shown on reports */
  colorName: string
  fleetNumber: number
  /** Soft column / card surface */
  sheet: string
  headerBorder: string
  title: string
  /** Solid assign / print chip */
  badge: string
  softBadge: string
  ring: string
  swatch: string
  /** Print-safe solid for color bar / swatch */
  printHex: string
}

const THEMES: Record<BoatColorKey, Omit<BoatTheme, 'key' | 'fleetNumber'>> = {
  orange: {
    colorName: 'Orange',
    sheet: 'border-orange-300/80 bg-orange-50/60',
    headerBorder: 'border-orange-200/80',
    title: 'text-orange-950',
    badge: 'bg-orange-600 text-white hover:bg-orange-700',
    softBadge: 'border border-orange-200 bg-orange-100 text-orange-950',
    ring: 'ring-orange-500/55',
    swatch: 'bg-orange-500',
    printHex: '#ea580c',
  },
  green: {
    colorName: 'Green',
    sheet: 'border-emerald-300/80 bg-emerald-50/60',
    headerBorder: 'border-emerald-200/80',
    title: 'text-emerald-950',
    badge: 'bg-emerald-600 text-white hover:bg-emerald-700',
    softBadge: 'border border-emerald-200 bg-emerald-100 text-emerald-950',
    ring: 'ring-emerald-500/55',
    swatch: 'bg-emerald-500',
    printHex: '#059669',
  },
  violet: {
    colorName: 'Violet',
    sheet: 'border-violet-300/80 bg-violet-50/60',
    headerBorder: 'border-violet-200/80',
    title: 'text-violet-950',
    badge: 'bg-violet-600 text-white hover:bg-violet-700',
    softBadge: 'border border-violet-200 bg-violet-100 text-violet-950',
    ring: 'ring-violet-500/55',
    swatch: 'bg-violet-500',
    printHex: '#7c3aed',
  },
  sky: {
    colorName: 'Sky',
    sheet: 'border-sky-300/80 bg-sky-50/60',
    headerBorder: 'border-sky-200/80',
    title: 'text-sky-950',
    badge: 'bg-sky-600 text-white hover:bg-sky-700',
    softBadge: 'border border-sky-200 bg-sky-100 text-sky-950',
    ring: 'ring-sky-500/55',
    swatch: 'bg-sky-500',
    printHex: '#0284c7',
  },
  rose: {
    colorName: 'Rose',
    sheet: 'border-rose-300/80 bg-rose-50/60',
    headerBorder: 'border-rose-200/80',
    title: 'text-rose-950',
    badge: 'bg-rose-600 text-white hover:bg-rose-700',
    softBadge: 'border border-rose-200 bg-rose-100 text-rose-950',
    ring: 'ring-rose-500/55',
    swatch: 'bg-rose-500',
    printHex: '#e11d48',
  },
  amber: {
    colorName: 'Amber',
    sheet: 'border-amber-300/80 bg-amber-50/60',
    headerBorder: 'border-amber-200/80',
    title: 'text-amber-950',
    badge: 'bg-amber-600 text-white hover:bg-amber-700',
    softBadge: 'border border-amber-200 bg-amber-100 text-amber-950',
    ring: 'ring-amber-500/55',
    swatch: 'bg-amber-500',
    printHex: '#d97706',
  },
  teal: {
    colorName: 'Teal',
    sheet: 'border-teal-300/80 bg-teal-50/60',
    headerBorder: 'border-teal-200/80',
    title: 'text-teal-950',
    badge: 'bg-teal-700 text-white hover:bg-teal-800',
    softBadge: 'border border-teal-200 bg-teal-100 text-teal-950',
    ring: 'ring-teal-500/55',
    swatch: 'bg-teal-600',
    printHex: '#0f766e',
  },
  slate: {
    colorName: 'Slate',
    sheet: 'border-slate-500/70 bg-slate-200/70',
    headerBorder: 'border-slate-400/70',
    title: 'text-slate-950',
    badge: 'bg-slate-800 text-white hover:bg-slate-900',
    softBadge: 'border border-slate-400 bg-slate-200 text-slate-950',
    ring: 'ring-slate-700/55',
    swatch: 'bg-slate-800',
    printHex: '#1e293b',
  },
}

export function isBoatColorKey(value: string): value is BoatColorKey {
  return (BOAT_COLOR_ORDER as string[]).includes(value)
}

/** Own-boat labels store "BoatNo|color" (or legacy color-only / number-only). */
export function packOwnBoatLabel(boatNo: string, color: BoatColorKey | string | null | undefined): string {
  const no = String(boatNo ?? '')
    .trim()
    .replace(/\|/g, '')
    .slice(0, 12)
  const colorKey = String(color ?? '')
    .trim()
    .toLowerCase()
  const validColor = isBoatColorKey(colorKey) ? colorKey : ''
  if (!no && !validColor) return ''
  if (!no) return `|${validColor}`
  if (!validColor) return no
  return `${no}|${validColor}`
}

export function unpackOwnBoatLabel(
  raw: string | null | undefined,
  boat: BoatNumber,
): { boatNo: string; color: BoatColorKey | null } {
  const text = String(raw ?? '').trim()
  const fallbackNo = String(boatFleetNumber(boat))
  if (!text) return { boatNo: fallbackNo, color: null }
  if (isBoatColorKey(text.toLowerCase())) {
    return { boatNo: fallbackNo, color: text.toLowerCase() as BoatColorKey }
  }
  if (text.startsWith('|')) {
    const colorKey = text.slice(1).trim().toLowerCase()
    return {
      boatNo: '',
      color: isBoatColorKey(colorKey) ? colorKey : null,
    }
  }
  const pipe = text.indexOf('|')
  if (pipe >= 0) {
    const no = text.slice(0, pipe).trim().replace(/\|/g, '').slice(0, 12)
    const colorKey = text.slice(pipe + 1).trim().toLowerCase()
    return {
      boatNo: no,
      color: isBoatColorKey(colorKey) ? colorKey : null,
    }
  }
  return { boatNo: text.slice(0, 12), color: null }
}

/** Chip text on van cards — syncs from Boat No. */
export function boatAssignChipLabel(
  plan: Pick<DayBoatPlan, 'capacities' | 'kinds' | 'names' | 'labels'> | null | undefined,
  boat: BoatNumber,
): string {
  if (plan && isPartnerBoat(plan, boat)) {
    const label = String(plan.labels?.[boat - 1] ?? '').trim()
    return label || 'P'
  }
  const { boatNo } = unpackOwnBoatLabel(plan?.labels?.[boat - 1], boat)
  return boatNo || String(boatFleetNumber(boat))
}

export function boatFleetNumber(boat: BoatNumber): number {
  return DEFAULT_BOAT_LABEL_START + Math.max(1, boat) - 1
}

export function boatColorKey(boat: BoatNumber): BoatColorKey {
  const index = Math.max(0, Math.floor(boat) - 1)
  return BOAT_COLOR_ORDER[index % BOAT_COLOR_ORDER.length]
}

export function boatTheme(boat: BoatNumber): BoatTheme {
  const key = boatColorKey(boat)
  return {
    key,
    fleetNumber: boatFleetNumber(boat),
    ...THEMES[key],
  }
}

/** Neutral card for overflow sent to another company — no fleet color. */
export const PARTNER_BOAT_THEME: BoatTheme = {
  key: 'slate',
  colorName: '',
  fleetNumber: 0,
  sheet: 'border-neutral-200 bg-white',
  headerBorder: 'border-neutral-200',
  title: 'text-neutral-950',
  badge: 'bg-neutral-800 text-white hover:bg-neutral-900',
  softBadge: 'border border-neutral-200 bg-white text-neutral-800',
  ring: 'ring-neutral-400/50',
  swatch: 'bg-transparent border border-neutral-300',
  printHex: '#737373',
}

export function boatThemeFor(
  plan: Pick<DayBoatPlan, 'capacities' | 'kinds' | 'names' | 'labels'> | null | undefined,
  boat: BoatNumber,
): BoatTheme {
  if (plan && isPartnerBoat(plan, boat)) return PARTNER_BOAT_THEME
  const { boatNo, color } = unpackOwnBoatLabel(plan?.labels?.[boat - 1], boat)
  const parsedNo = Number(boatNo)
  const fleetNumber =
    Number.isFinite(parsedNo) && parsedNo > 0 ? Math.floor(parsedNo) : boatFleetNumber(boat)
  if (color) {
    return {
      key: color,
      fleetNumber,
      ...THEMES[color],
    }
  }
  const base = boatTheme(boat)
  return { ...base, fleetNumber }
}

export function boatColorOptions(): Array<{ key: BoatColorKey; colorName: string; swatch: string }> {
  return BOAT_COLOR_ORDER.map((key) => ({
    key,
    colorName: THEMES[key].colorName,
    swatch: THEMES[key].swatch,
  }))
}
