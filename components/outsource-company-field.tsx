'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { matchVanOutsourceCompany, VAN_OUTSOURCE_COMPANIES } from '@/lib/types'

const OTHER_VALUE = '__other__'

function isCustomCompany(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 && !matchVanOutsourceCompany(trimmed)
}

export function OutsourceCompanyField({
  id,
  value,
  onChange,
  label = 'Company name',
  size = 'default',
}: {
  id: string
  value: string
  onChange: (value: string) => void
  label?: string
  size?: 'sm' | 'default'
}) {
  const [otherMode, setOtherMode] = useState(() => isCustomCompany(value))
  const trimmed = value.trim()
  const matched = matchVanOutsourceCompany(trimmed)
  const selectValue = otherMode ? OTHER_VALUE : matched || undefined
  const inputClass = size === 'sm' ? 'h-9' : 'h-10'

  useEffect(() => {
    if (matchVanOutsourceCompany(value)) {
      setOtherMode(false)
      return
    }
    if (isCustomCompany(value)) setOtherMode(true)
  }, [value])

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={selectValue}
        onValueChange={(next) => {
          if (!next || next === OTHER_VALUE) {
            setOtherMode(true)
            if (matched) onChange('')
            return
          }
          setOtherMode(false)
          onChange(next)
        }}
      >
        <SelectTrigger id={id} className={`${inputClass} w-full min-w-0`}>
          <SelectValue placeholder="Choose company" />
        </SelectTrigger>
        <SelectContent>
          {VAN_OUTSOURCE_COMPANIES.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
          <SelectItem value={OTHER_VALUE}>Other</SelectItem>
        </SelectContent>
      </Select>
      {otherMode ? (
        <Input
          id={`${id}-other`}
          value={matched ? '' : value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type company name"
          className={inputClass}
        />
      ) : null}
    </div>
  )
}
