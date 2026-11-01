'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, Hotel as HotelIcon, PenLine } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Hotel } from '@/lib/types'

const MAX_SUGGESTIONS = 12

function normalizeHotelName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string) {
  const rows = a.length + 1
  const cols = b.length + 1
  const grid = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
  for (let i = 0; i < rows; i += 1) grid[i]![0] = i
  for (let j = 0; j < cols; j += 1) grid[0]![j] = j
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      grid[i]![j] = Math.min(
        grid[i - 1]![j]! + 1,
        grid[i]![j - 1]! + 1,
        grid[i - 1]![j - 1]! + cost,
      )
    }
  }
  return grid[a.length]![b.length]!
}

function hotelMatchScore(query: string, name: string) {
  const q = normalizeHotelName(query)
  const n = normalizeHotelName(name)
  if (!q || !n) return 0
  if (n === q) return 100
  if (q.length === 1) {
    return n.startsWith(q) || n.split(' ').some((word) => word.startsWith(q)) ? 80 : 0
  }
  if (n.startsWith(q)) return 90
  if (n.includes(q)) return 80
  const words = n.split(' ')
  if (words.some((word) => word.startsWith(q))) return 70
  const compactQ = q.replace(/ /g, '')
  const compactN = n.replace(/ /g, '')
  if (compactN.includes(compactQ)) return 68
  let best = 0
  const candidates = [compactN.slice(0, compactQ.length + 2), ...words]
  for (const candidate of candidates) {
    if (!candidate) continue
    const dist = levenshtein(compactQ, candidate.slice(0, compactQ.length + 2))
    const size = Math.max(compactQ.length, Math.min(candidate.length, compactQ.length + 2))
    best = Math.max(best, 1 - dist / size)
  }
  return best * 60
}

export function hotelQueryHasMatches(hotels: Hotel[], query: string) {
  return rankHotelSuggestions(hotels, query).length > 0
}

function rankHotelSuggestions(hotels: Hotel[], query: string) {
  const active = hotels.filter((hotel) => hotel.active)
  const q = query.trim()
  if (!q) {
    return active
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_SUGGESTIONS)
      .map((hotel) => ({ hotel, similar: false }))
  }
  return active
    .map((hotel) => ({ hotel, score: hotelMatchScore(q, hotel.name) }))
    .filter((item) => item.score >= 32)
    .sort(
      (a, b) => b.score - a.score || a.hotel.name.localeCompare(b.hotel.name),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map((item) => ({
      hotel: item.hotel,
      similar: item.score < 80,
    }))
}

export function HotelCombobox({
  hotels,
  value,
  onChange,
  onSelectHotel,
  onSelectOther,
  onCommit,
  allowCreate = false,
  id = 'hotel',
  placeholder = 'Type to search hotels…',
}: {
  hotels: Hotel[]
  value: string
  onChange: (value: string) => void
  onSelectHotel: (hotel: Hotel) => void
  /** Called when the last line is chosen. Agents use it for Other only. */
  onSelectOther?: (typedName: string) => void
  /** Called after the field is left, once a list click has had time to register. */
  onCommit?: (typedName: string) => void
  /** When true, the last line can save a new hotel name. Agents leave this off. */
  allowCreate?: boolean
  id?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const blurTimer = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = value.trim()
  const suggestions = useMemo(
    () => rankHotelSuggestions(hotels, query),
    [hotels, query],
  )
  const exactMatch = suggestions.some(
    (item) => item.hotel.name.toLowerCase() === query.toLowerCase(),
  )
  const options = useMemo(
    () => [
      ...suggestions.map((item) => ({ kind: 'hotel' as const, hotel: item.hotel, similar: item.similar })),
      { kind: 'other' as const },
    ],
    [suggestions],
  )

  function clearBlurTimer() {
    if (blurTimer.current !== null) {
      window.clearTimeout(blurTimer.current)
      blurTimer.current = null
    }
  }

  function pick(hotel: Hotel) {
    onSelectHotel(hotel)
    setOpen(false)
    setHighlight(0)
  }

  function pickOther() {
    onSelectOther?.(value)
    setOpen(false)
    setHighlight(0)
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        className="h-11"
        onFocus={() => {
          clearBlurTimer()
          setOpen(true)
          setHighlight(0)
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => {
            setOpen(false)
            onCommit?.(inputRef.current?.value ?? value)
          }, 120)
        }}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            setOpen(true)
            return
          }
          if (!open || options.length === 0) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlight((current) => (current + 1) % options.length)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlight((current) => (current - 1 + options.length) % options.length)
          } else if (event.key === 'Enter') {
            const option = options[highlight]
            if (!option) return
            event.preventDefault()
            if (option.kind === 'other') pickOther()
            else pick(option.hotel)
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1.5 max-h-80 w-full min-w-full overflow-auto rounded-xl border border-teal-900/10 bg-white py-1 shadow-lg shadow-teal-950/10"
        >
          {suggestions.length === 0 && query.length > 0 ? (
            <li className="px-3 py-2 text-xs text-teal-900/50">
              {allowCreate
                ? 'No similar hotel saved. Use the last line to add this name.'
                : 'No saved hotel matches. Hotel and zone will be Other.'}
            </li>
          ) : suggestions.some((item) => item.similar) ? (
            <li className="px-3 py-1.5 text-[11px] font-medium tracking-wide text-teal-900/45 uppercase">
              Similar saved hotels
            </li>
          ) : null}
          {suggestions.map((item, index) => {
            const hotel = item.hotel
            const selected = hotel.name.toLowerCase() === query.toLowerCase()
            const active = index === highlight
            return (
              <li key={hotel.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors',
                    active ? 'bg-teal-50 text-teal-950' : 'text-teal-950 hover:bg-teal-950/[0.04]',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(hotel)}
                >
                  <HotelIcon className="size-3.5 shrink-0 text-teal-800/45" />
                  <span className="min-w-0 flex-1 font-medium">{hotel.name}</span>
                  <span className="shrink-0 text-xs text-teal-900/45">
                    {item.similar ? 'Similar' : (hotel.zoneName ?? 'Other')}
                  </span>
                  {selected ? <Check className="size-3.5 shrink-0 text-teal-800" /> : null}
                </button>
              </li>
            )
          })}
          <li role="option" aria-selected={false} className="border-t border-amber-200 bg-amber-50">
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-amber-950 transition-colors',
                highlight === suggestions.length ? 'bg-amber-100' : 'hover:bg-amber-100',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(suggestions.length)}
              onClick={pickOther}
            >
              <PenLine className="size-3.5 shrink-0 text-amber-700" />
              <span className="min-w-0 flex-1 font-medium">
                {allowCreate && query && !exactMatch
                  ? `Add “${query}” as a new hotel`
                  : 'Other'}
              </span>
              {allowCreate ? (
                <span className="shrink-0 text-xs font-semibold text-amber-800">New</span>
              ) : null}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  )
}
