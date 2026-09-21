'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, Globe2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { filterNationalities, matchNationality } from '@/lib/nationalities'
import { cn } from '@/lib/utils'

const MAX_SUGGESTIONS = 10

export function NationalityCombobox({
  value,
  onChange,
  id = 'nationality',
  required,
  showError,
}: {
  value: string
  onChange: (value: string) => void
  id?: string
  required?: boolean
  showError?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const blurTimer = useRef<number | null>(null)

  const query = value.trim()
  const matched = matchNationality(value)
  const suggestions = useMemo(() => filterNationalities(query, MAX_SUGGESTIONS), [query])
  const invalid = showError && !matched

  function clearBlurTimer() {
    if (blurTimer.current !== null) {
      window.clearTimeout(blurTimer.current)
      blurTimer.current = null
    }
  }

  function pick(nationality: string) {
    onChange(nationality)
    setOpen(false)
    setHighlight(0)
  }

  return (
    <div className="relative">
      <Label className="mb-1.5" htmlFor={id}>
        Nationality
        {required ? <span className="text-rose-600"> *</span> : null}
      </Label>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        value={value}
        placeholder="Type to search — e.g. Thai, Australian"
        className={cn('h-11', invalid && 'border-rose-400 focus-visible:border-rose-500')}
        onFocus={() => {
          clearBlurTimer()
          setOpen(true)
          setHighlight(0)
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => {
            setOpen(false)
            const exact = matchNationality(value)
            if (exact && exact !== value.trim()) onChange(exact)
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
          if (!open || suggestions.length === 0) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlight((current) => (current + 1) % suggestions.length)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlight((current) => (current - 1 + suggestions.length) % suggestions.length)
          } else if (event.key === 'Enter') {
            const item = suggestions[highlight]
            if (item) {
              event.preventDefault()
              pick(item)
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
          className="absolute z-40 mt-1.5 max-h-56 w-full overflow-auto rounded-xl border border-teal-900/10 bg-white py-1 shadow-lg shadow-teal-950/10"
        >
          {suggestions.map((item, index) => {
            const selected = item.toLowerCase() === query.toLowerCase()
            const active = index === highlight
            return (
              <li key={item} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors',
                    active ? 'bg-teal-50 text-teal-950' : 'text-teal-950 hover:bg-teal-950/[0.04]',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(item)}
                >
                  <Globe2 className="size-3.5 shrink-0 text-teal-800/45" />
                  <span className="min-w-0 flex-1 truncate font-medium">{item}</span>
                  {selected ? <Check className="size-3.5 shrink-0 text-teal-800" /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
      {open && query.length > 0 && suggestions.length === 0 ? (
        <div className="absolute z-40 mt-1.5 w-full rounded-xl border border-teal-900/10 bg-white px-3 py-2.5 text-sm text-teal-900/50 shadow-lg shadow-teal-950/10">
          No match — keep typing, then pick from the list.
        </div>
      ) : null}
      {invalid ? (
        <p className="mt-1.5 text-xs font-medium text-rose-700">
          Required — type and select a nationality from the list.
        </p>
      ) : null}
    </div>
  )
}
