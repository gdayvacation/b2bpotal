'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, Hotel as HotelIcon, PenLine } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Hotel } from '@/lib/types'

const MAX_SUGGESTIONS = 12

export function HotelCombobox({
  hotels,
  value,
  onChange,
  onSelectHotel,
  onSelectOther,
  id = 'hotel',
  placeholder = 'Type to search hotels…',
}: {
  hotels: Hotel[]
  value: string
  onChange: (value: string) => void
  onSelectHotel: (hotel: Hotel) => void
  /** Called when staff pick “Other” for a hotel not in the catalog. */
  onSelectOther?: () => void
  id?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const blurTimer = useRef<number | null>(null)

  const activeHotels = useMemo(
    () => hotels.filter((hotel) => hotel.active).sort((a, b) => a.name.localeCompare(b.name)),
    [hotels],
  )

  const query = value.trim().toLowerCase()
  const suggestions = useMemo(() => {
    if (!query) return activeHotels.slice(0, MAX_SUGGESTIONS)
    return activeHotels
      .filter((hotel) => hotel.name.toLowerCase().includes(query))
      .slice(0, MAX_SUGGESTIONS)
  }, [activeHotels, query])

  const options = useMemo(
    () => [...suggestions.map((hotel) => ({ kind: 'hotel' as const, hotel })), { kind: 'other' as const }],
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
    onSelectOther?.()
    setOpen(false)
    setHighlight(0)
  }

  return (
    <div className="relative">
      <Input
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
          blurTimer.current = window.setTimeout(() => setOpen(false), 120)
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
          className="absolute z-40 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-teal-900/10 bg-white py-1 shadow-lg shadow-teal-950/10"
        >
          {suggestions.length === 0 && query.length > 0 ? (
            <li className="px-3 py-2 text-xs text-teal-900/50">
              No catalog match — choose Other and type the hotel name.
            </li>
          ) : null}
          {suggestions.map((hotel, index) => {
            const selected = hotel.name.toLowerCase() === query
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
                  <span className="min-w-0 flex-1 truncate font-medium">{hotel.name}</span>
                  <span className="shrink-0 text-xs text-teal-900/45">
                    {hotel.zoneName ?? 'Unassigned'}
                  </span>
                  {selected ? <Check className="size-3.5 shrink-0 text-teal-800" /> : null}
                </button>
              </li>
            )
          })}
          <li role="option" aria-selected={false} className="border-t border-teal-900/8">
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors',
                highlight === suggestions.length
                  ? 'bg-teal-50 text-teal-950'
                  : 'text-teal-950 hover:bg-teal-950/[0.04]',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(suggestions.length)}
              onClick={pickOther}
            >
              <PenLine className="size-3.5 shrink-0 text-teal-800/45" />
              <span className="min-w-0 flex-1 font-medium">Other — not in list</span>
              <span className="shrink-0 text-xs text-teal-900/45">Custom</span>
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  )
}
