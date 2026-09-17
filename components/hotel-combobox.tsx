'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, Hotel as HotelIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Hotel } from '@/lib/types'

const MAX_SUGGESTIONS = 12

export function HotelCombobox({
  hotels,
  value,
  onChange,
  onSelectHotel,
  id = 'hotel',
  placeholder = 'Type to search hotels…',
}: {
  hotels: Hotel[]
  value: string
  onChange: (value: string) => void
  onSelectHotel: (hotel: Hotel) => void
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
          if (!open || suggestions.length === 0) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlight((current) => (current + 1) % suggestions.length)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlight((current) => (current - 1 + suggestions.length) % suggestions.length)
          } else if (event.key === 'Enter') {
            const hotel = suggestions[highlight]
            if (hotel) {
              event.preventDefault()
              pick(hotel)
            }
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && suggestions.length > 0 ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-40 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-teal-900/10 bg-white py-1 shadow-lg shadow-teal-950/10"
        >
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
        </ul>
      ) : null}
      {open && query.length > 0 && suggestions.length === 0 ? (
        <div className="absolute z-40 mt-1.5 w-full rounded-xl border border-teal-900/10 bg-white px-3 py-2.5 text-sm text-teal-900/50 shadow-lg shadow-teal-950/10">
          No matching hotel — keep typing a custom name, or ask admin to add it.
        </div>
      ) : null}
    </div>
  )
}
