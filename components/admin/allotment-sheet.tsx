'use client'

import { Fragment, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatShortDate, todayISO } from '@/lib/format'
import type { AllotmentSheetLine } from '@/lib/allotment-sheet'
import { cn } from '@/lib/utils'

export type SheetLineDraft = {
  date: string
  heads: number
  amount: number
  note: string
}

type DraftFields = {
  date: string
  heads: string
  amount: string
  note: string
}

const emptyFields = (date = todayISO()): DraftFields => ({
  date,
  heads: '',
  amount: '',
  note: '',
})

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function parseMoney(value: string) {
  const n = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : NaN
}

function parseHeads(value: string) {
  const n = Math.trunc(Number(String(value).trim()))
  return Number.isFinite(n) ? n : NaN
}

function parseFields(fields: DraftFields): SheetLineDraft | { error: string } {
  const date = fields.date.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Enter a date.' }
  const heads = fields.heads.trim() === '' ? 0 : parseHeads(fields.heads)
  const amount = fields.amount.trim() === '' ? 0 : parseMoney(fields.amount)
  if (!Number.isFinite(heads)) return { error: 'Enter heads. Use a positive number to add, or a negative number to reduce.' }
  if (!Number.isFinite(amount)) return { error: 'Enter money. Use a positive number to add, or a negative number to deduct.' }
  if (heads === 0 && amount === 0) return { error: 'Enter heads or money.' }
  const note = fields.note.trim()
  if ((heads < 0 || amount < 0) && !note) return { error: 'Enter a note explaining this reduction.' }
  return { date, heads, amount, note }
}

function usageParts(note: string) {
  return note
    .split(' · ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const plus = part.match(/^(.*)\s+\+(\d+)$/)
      if (!plus) return { label: part, heads: null as number | null }
      return { label: plus[1].trim(), heads: Number(plus[2]) }
    })
}

function lineTitle(line: AllotmentSheetLine, hideNote = false) {
  if (line.kind === 'usage') {
    return [line.counted ? 'Heads used' : 'Future booking', line.pending ? 'From bookings' : '', hideNote ? '' : line.note]
      .filter(Boolean)
      .join(' · ')
  }
  const bits: string[] = []
  if (line.headsDelta > 0) bits.push('Add heads')
  if (line.headsDelta < 0) bits.push('Reduce heads')
  if ((line.moneyDelta ?? 0) > 0) bits.push('Add money')
  if ((line.moneyDelta ?? 0) < 0) bits.push('Deduct money')
  if (line.note) bits.push(line.note)
  return bits.join(' · ') || 'Adjustment'
}

function readCollapsedDays(storageKey: string) {
  if (typeof window === 'undefined') return new Set<string>()
  try {
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set(
      parsed.filter((item): item is string => typeof item === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item)),
    )
  } catch {
    return new Set<string>()
  }
}

/** Soft green rule between days. Visible, without a black stroke. */
const dayEdge = 'border-x border-b border-teal-900/[0.08] border-t-2 border-t-[#6aab98]'
const dayGap = 'h-2.5 border-0 bg-[#e4f2ec] p-0'

function cellInputClass(align: 'left' | 'right' = 'left') {
  return cn(
    'h-8 w-full bg-transparent px-2 text-[13px] text-teal-950 outline-none focus:bg-white',
    align === 'right' && 'text-right tabular-nums',
  )
}

export function AllotmentSheet({
  lines,
  today,
  storageKey,
  onAdd,
  onUpdate,
}: {
  lines: AllotmentSheetLine[]
  today: string
  storageKey: string
  onAdd: (draft: SheetLineDraft) => Promise<void>
  onUpdate: (line: AllotmentSheetLine, draft: SheetLineDraft) => Promise<void>
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [openUsage, setOpenUsage] = useState<Set<string>>(new Set())
  const [readyKey, setReadyKey] = useState('')
  const [addFields, setAddFields] = useState<DraftFields>(() => emptyFields(today))
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<DraftFields>(emptyFields())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCollapsed(readCollapsedDays(storageKey))
    setOpenUsage(new Set())
    setEditingKey(null)
    setReadyKey(storageKey)
  }, [storageKey])

  useEffect(() => {
    if (readyKey !== storageKey) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...collapsed]))
    } catch {
      // Private mode or a full disk should not block the sheet.
    }
  }, [collapsed, readyKey, storageKey])

  function toggleDay(date: string) {
    const next = new Set(collapsed)
    if (next.has(date)) next.delete(date)
    else {
      next.add(date)
      const editing = lines.find((line) => line.key === editingKey)
      if (editing?.date === date) setEditingKey(null)
    }
    setCollapsed(next)
  }

  function toggleUsage(key: string) {
    setOpenUsage((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function onDayKeyDown(date: string, event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggleDay(date)
  }
  const ordered = lines.map((line, index) => ({ line, index }))
  const history = ordered
    .filter((item) => item.line.date <= today)
    .sort((a, b) => b.line.date.localeCompare(a.line.date) || a.index - b.index)
  const future = ordered
    .filter((item) => item.line.date > today)
    .sort((a, b) => a.line.date.localeCompare(b.line.date) || a.index - b.index)
  const hasToday = history.some((item) => item.line.date === today)
  const asOfToday = [...lines].reverse().find((line) => line.date <= today)
  const todayHeads = asOfToday?.headsLeft ?? 0
  const todayMoney = asOfToday?.moneyLeft ?? 0

  type DayGroup = { date: string; lines: { line: AllotmentSheetLine; index: number }[] }

  function groupDays(source: { line: AllotmentSheetLine; index: number }[]): DayGroup[] {
    const groups: DayGroup[] = []
    for (const item of source) {
      const last = groups.at(-1)
      if (!last || last.date !== item.line.date) groups.push({ date: item.line.date, lines: [item] })
      else last.lines.push(item)
    }
    return groups
  }

  const historyDays = groupDays(history)
  const futureDays = groupDays(future)

  async function submitAdd(event: FormEvent) {
    event.preventDefault()
    const parsed = parseFields(addFields)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setError('')
    setSaving(true)
    try {
      await onAdd(parsed)
      setAddFields(emptyFields(today))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function submitEdit(line: AllotmentSheetLine, event: FormEvent) {
    event.preventDefault()
    const parsed = parseFields(editFields)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setError('')
    setSaving(true)
    try {
      await onUpdate(line, parsed)
      setEditingKey(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(line: AllotmentSheetLine) {
    setError('')
    setEditingKey(line.key)
    setEditFields({
      date: line.date,
      heads: line.headsDelta === 0 ? '' : String(line.headsDelta),
      amount: line.moneyDelta == null || line.moneyDelta === 0 ? '' : String(line.moneyDelta),
      note: line.note,
    })
  }

  function renderDayBar(group: DayGroup) {
    const open = !collapsed.has(group.date)
    const rows = group.lines.map((item) => item.line)
    const heads = rows.reduce((sum, line) => sum + line.headsDelta, 0)
    const money = rows.reduce((sum, line) => sum + (line.moneyDelta ?? 0), 0)
    const last = rows.at(-1)
    const cell = cn(dayEdge, 'px-2 py-1.5')
    return (
      <tr
        key={`day-${group.date}`}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${open ? 'Fold' : 'Open'} ${formatShortDate(group.date)}`}
        className="cursor-pointer bg-[#cfe3d9] text-teal-950 hover:bg-[#c3ddd2]"
        onClick={() => toggleDay(group.date)}
        onKeyDown={(event) => onDayKeyDown(group.date, event)}
      >
        <td className={cn(cell, 'bg-[#c3ddd2] px-1 text-center')}>
          {open ? <ChevronDown className="mx-auto size-3.5" /> : <ChevronRight className="mx-auto size-3.5" />}
        </td>
        <td className={cn(cell, 'font-semibold whitespace-nowrap')}>
          {formatShortDate(group.date)}
          {group.date === today ? (
            <span className="ml-1 text-[10px] font-semibold tracking-wide text-teal-800 uppercase">Today</span>
          ) : null}
        </td>
        <td className={cn(cell, 'font-medium text-teal-900/70')}>Daily Sum</td>
        <td
          className={cn(
            cell,
            'text-right font-semibold tabular-nums',
            heads > 0 && 'text-emerald-800',
            heads < 0 && 'text-teal-950',
            heads === 0 && 'text-teal-900/35',
          )}
        >
          {heads === 0 ? '—' : heads > 0 ? `+${heads}` : heads}
        </td>
        <td
          className={cn(
            cell,
            'text-right font-semibold tabular-nums',
            (last?.headsLeft ?? 0) < 0 ? 'text-rose-700' : 'text-teal-950',
          )}
        >
          {last?.headsLeft ?? 0}
        </td>
        <td
          className={cn(
            cell,
            'text-right font-semibold tabular-nums',
            money > 0 && 'text-emerald-800',
            money < 0 && 'text-rose-700',
            money === 0 && 'text-teal-900/35',
          )}
        >
          {money === 0 ? '—' : `${money > 0 ? '+' : ''}${formatMoney(money)}`}
        </td>
        <td
          className={cn(
            cell,
            'text-right font-semibold tabular-nums',
            (last?.moneyLeft ?? 0) < 0 ? 'text-rose-700' : 'text-teal-950',
          )}
        >
          {formatMoney(last?.moneyLeft ?? 0)}
        </td>
        <td className={cell} />
      </tr>
    )
  }

  function renderUsageDetails(line: AllotmentSheetLine, columns: number) {
    return (
      <tr key={`${line.key}-bookings`} className="bg-[#f4faf7] text-teal-950">
        <td className="border border-teal-900/10" />
        <td className="border border-teal-900/10 px-2 py-2" colSpan={columns - 1}>
          {line.bookings.length === 0 ? (
            <p className="text-teal-900/55">
              {usageParts(line.note).map((part) => part.label).join(' · ') || 'No bookings for this day.'}
            </p>
          ) : (
            <table className="w-auto text-[12px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold tracking-wide text-teal-900/45">
                  <th className="py-1 pr-6 font-semibold whitespace-nowrap">Agent reference</th>
                  <th className="py-1 pr-6 font-semibold whitespace-nowrap">Guest name</th>
                  <th className="py-1 pr-6 font-semibold whitespace-nowrap">Hotel</th>
                  <th className="py-1 pr-6 text-right font-semibold whitespace-nowrap">Adults</th>
                  <th className="py-1 text-right font-semibold whitespace-nowrap">Children</th>
                </tr>
              </thead>
              <tbody>
                {line.bookings.map((booking) => (
                  <tr key={booking.code}>
                    <td className="py-0.5 pr-6 whitespace-nowrap">{booking.agentRef || '—'}</td>
                    <td className="py-0.5 pr-6 whitespace-nowrap">{booking.guestName || '—'}</td>
                    <td className="py-0.5 pr-6 whitespace-nowrap">{booking.hotel || '—'}</td>
                    <td className="py-0.5 pr-6 text-right tabular-nums">{booking.adults}</td>
                    <td className="py-0.5 text-right tabular-nums">{booking.children}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </td>
      </tr>
    )
  }

  function renderLedgerRow(line: AllotmentSheetLine, index: number) {
    const editing = editingKey === line.key
    const cell = 'border border-teal-900/10'
    const canOpen = line.kind === 'usage' && (line.bookings.length > 0 || usageParts(line.note).length > 0)
    const open = canOpen && openUsage.has(line.key)
    return (
      <tr
        key={line.key}
        role={canOpen ? 'button' : undefined}
        tabIndex={canOpen ? 0 : undefined}
        aria-expanded={canOpen ? open : undefined}
        aria-label={canOpen ? `${open ? 'Hide' : 'Show'} ${line.counted ? 'heads used' : 'future booking'} detail` : undefined}
        className={cn(
          line.kind === 'manual' && (line.moneyDelta ?? 0) < 0 && 'bg-rose-50',
          line.kind === 'manual' && (line.moneyDelta ?? 0) >= 0 && 'bg-[#fff8e6]',
          line.kind === 'usage' && 'bg-white',
          canOpen && 'cursor-pointer hover:bg-teal-50/70',
        )}
        onClick={canOpen ? () => toggleUsage(line.key) : undefined}
        onKeyDown={
          canOpen
            ? (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                toggleUsage(line.key)
              }
            : undefined
        }
      >
        <td className={cn(cell, 'bg-[#f4f7f5] px-1 text-center text-[11px] text-teal-900/40 tabular-nums')}>
          {canOpen ? (
            open ? <ChevronDown className="mx-auto size-3.5 text-teal-800" /> : <ChevronRight className="mx-auto size-3.5 text-teal-800" />
          ) : (
            index + 1
          )}
        </td>
        {editing ? (
          <>
            <td className={cn(cell, 'p-0')}>
              <input
                form="allotment-sheet-edit"
                type="date"
                aria-label="Date"
                value={editFields.date}
                onChange={(event) => setEditFields((current) => ({ ...current, date: event.target.value }))}
                className={cellInputClass()}
              />
            </td>
            <td className={cn(cell, 'p-0')}>
              <input
                form="allotment-sheet-edit"
                aria-label="Detail"
                value={editFields.note}
                onChange={(event) => setEditFields((current) => ({ ...current, note: event.target.value }))}
                placeholder="Note"
                className={cellInputClass()}
              />
            </td>
            <td className={cn(cell, 'p-0')}>
              <input
                form="allotment-sheet-edit"
                aria-label="Heads"
                inputMode="numeric"
                value={editFields.heads}
                onChange={(event) => setEditFields((current) => ({ ...current, heads: event.target.value }))}
                placeholder="+10 or -5"
                className={cellInputClass('right')}
              />
            </td>
            <td className={cn(cell, 'px-2 text-right text-teal-900/35')}>—</td>
            <td className={cn(cell, 'p-0')}>
              <input
                form="allotment-sheet-edit"
                aria-label="Money"
                inputMode="decimal"
                value={editFields.amount}
                onChange={(event) => setEditFields((current) => ({ ...current, amount: event.target.value }))}
                placeholder="+3500 or -500"
                className={cellInputClass('right')}
              />
            </td>
            <td className={cn(cell, 'px-2 text-right text-teal-900/35')}>—</td>
            <td className={cn(cell, 'px-1 text-center')}>
              <form
                id="allotment-sheet-edit"
                className="flex items-center justify-center gap-1"
                onSubmit={(event) => void submitEdit(line, event)}
              >
                <Button type="submit" size="sm" disabled={saving} className="h-7 px-2 text-[11px]">
                  Save
                </Button>
                <button type="button" className="text-[11px] text-teal-900/50" onClick={() => setEditingKey(null)}>
                  Cancel
                </button>
              </form>
            </td>
          </>
        ) : (
          <>
            <td className={cn(cell, 'px-2 whitespace-nowrap text-teal-900/45')}>{formatShortDate(line.date)}</td>
            <td className={cn(cell, 'px-2 text-teal-950')}>
              <span>{lineTitle(line, canOpen)}</span>
            </td>
            <td
              className={cn(
                cell,
                'px-2 text-right font-medium tabular-nums',
                line.headsDelta > 0 && 'text-emerald-800',
                line.headsDelta < 0 && 'text-teal-950',
                line.headsDelta === 0 && 'text-teal-900/35',
              )}
            >
              {line.headsDelta === 0 ? '—' : line.headsDelta > 0 ? `+${line.headsDelta}` : line.headsDelta}
            </td>
            <td
              className={cn(
                cell,
                'px-2 text-right font-semibold tabular-nums',
                line.headsLeft < 0 ? 'text-rose-700' : 'text-teal-950',
              )}
            >
              {line.headsLeft}
            </td>
            <td
              className={cn(
                cell,
                'px-2 text-right tabular-nums',
                (line.moneyDelta ?? 0) > 0 && 'text-emerald-800',
                (line.moneyDelta ?? 0) < 0 && 'text-rose-700',
                (line.moneyDelta ?? 0) === 0 && 'text-teal-900/35',
              )}
            >
              {line.moneyDelta == null || line.moneyDelta === 0
                ? '—'
                : `${line.moneyDelta > 0 ? '+' : ''}${formatMoney(line.moneyDelta)}`}
            </td>
            <td
              className={cn(
                cell,
                'px-2 text-right font-semibold tabular-nums',
                line.moneyLeft < 0 ? 'text-rose-700' : 'text-teal-950',
              )}
            >
              {formatMoney(line.moneyLeft)}
            </td>
            <td className={cn(cell, 'px-1 text-center')}>
              {line.kind === 'manual' && line.paymentId ? (
                <button
                  type="button"
                  aria-label={`Edit row ${index + 1}`}
                  className="inline-flex size-7 items-center justify-center rounded-md text-teal-900/45 hover:bg-white hover:text-teal-900"
                  onClick={() => startEdit(line)}
                >
                  <Pencil className="size-3.5" />
                </button>
              ) : null}
            </td>
          </>
        )}
      </tr>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/10 px-3 py-2">
        <p className="text-xs text-teal-900/55">
          Today is the top day. Older days run down the sheet. Tap a day to fold or open its rows.
          Tap a Heads used row to see each booking’s agent reference, guest name, and hotel. Those details stay closed until you open them.
          Cream rows can add or reduce heads and money. White rows are that day’s heads, filled in automatically,
          and the money those heads use is taken off the balance.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {collapsed.size > 0 ? (
            <button
              type="button"
              className="text-xs font-semibold text-teal-800 underline decoration-teal-800/30 underline-offset-2"
              onClick={() => setCollapsed(new Set())}
            >
              Open all days
            </button>
          ) : null}
        </div>
      </div>
      <div className="max-h-[min(68vh,760px)] overflow-auto">
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#e7eee9] text-left text-[11px] font-semibold tracking-wide text-teal-900/55">
              <th className="w-10 border border-teal-900/10 px-1 py-2 text-center">#</th>
              <th className="w-[132px] border border-teal-900/10 px-2 py-2">Date</th>
              <th className="border border-teal-900/10 px-2 py-2">Detail</th>
              <th className="w-[88px] border border-teal-900/10 px-2 py-2 text-right">Heads</th>
              <th className="w-[88px] border border-teal-900/10 px-2 py-2 text-right">Heads left</th>
              <th className="w-[120px] border border-teal-900/10 px-2 py-2 text-right">Money</th>
              <th className="w-[120px] border border-teal-900/10 px-2 py-2 text-right">Money left</th>
              <th className="w-10 border border-teal-900/10 px-1 py-2 text-center">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-[#e7eee9]">
              <td className="border border-teal-900/10 text-center text-[11px] text-teal-900/40">+</td>
              <td className="border border-teal-900/10 p-0">
                <input
                  form="allotment-sheet-add"
                  type="date"
                  required
                  aria-label="Date for the new row"
                  value={addFields.date}
                  onChange={(event) => setAddFields((current) => ({ ...current, date: event.target.value }))}
                  className={cellInputClass()}
                />
              </td>
              <td className="border border-teal-900/10 p-0">
                <input
                  form="allotment-sheet-add"
                  aria-label="Note for the new row"
                  value={addFields.note}
                  onChange={(event) => setAddFields((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Note — required when reducing heads or deducting money"
                  className={cellInputClass()}
                />
              </td>
              <td className="border border-teal-900/10 p-0">
                <input
                  form="allotment-sheet-add"
                  aria-label="Heads for the new row"
                  inputMode="numeric"
                  value={addFields.heads}
                  onChange={(event) => setAddFields((current) => ({ ...current, heads: event.target.value }))}
                  placeholder="+heads / -heads"
                  className={cellInputClass('right')}
                />
              </td>
              <td className="border border-teal-900/10 px-2 text-right text-teal-900/35">—</td>
              <td className="border border-teal-900/10 p-0">
                <input
                  form="allotment-sheet-add"
                  aria-label="Money for the new row"
                  inputMode="decimal"
                  value={addFields.amount}
                  onChange={(event) => setAddFields((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="+money / -money"
                  className={cellInputClass('right')}
                />
              </td>
              <td colSpan={2} className="border border-teal-900/10 px-2">
                <form id="allotment-sheet-add" onSubmit={(event) => void submitAdd(event)}>
                  <Button type="submit" size="sm" disabled={saving} className="h-8">
                    {saving ? 'Saving…' : 'Add row'}
                  </Button>
                </form>
              </td>
            </tr>
            {!hasToday ? (
              <tr aria-hidden="true">
                <td className={dayGap} colSpan={8} />
              </tr>
            ) : null}
            {!hasToday ? (
              <tr className="bg-[#cfe3d9] text-teal-950">
                <td className={cn(dayEdge, 'bg-[#c3ddd2] px-1 py-1.5 text-center text-[11px] text-teal-900/40')} />
                <td className={cn(dayEdge, 'px-2 py-1.5 font-semibold whitespace-nowrap')}>
                  {formatShortDate(today)}
                  <span className="ml-1 text-[10px] font-semibold tracking-wide text-teal-800 uppercase">Today</span>
                </td>
                <td className={cn(dayEdge, 'px-2 py-1.5 font-medium text-teal-900/70')}>Daily Sum</td>
                <td className={cn(dayEdge, 'px-2 py-1.5 text-right text-teal-900/35')}>—</td>
                <td
                  className={cn(
                    dayEdge,
                    'px-2 py-1.5 text-right font-semibold tabular-nums',
                    todayHeads < 0 ? 'text-rose-700' : 'text-teal-950',
                  )}
                >
                  {todayHeads}
                </td>
                <td className={cn(dayEdge, 'px-2 py-1.5 text-right text-teal-900/35')}>—</td>
                <td
                  className={cn(
                    dayEdge,
                    'px-2 py-1.5 text-right font-semibold tabular-nums',
                    todayMoney < 0 ? 'text-rose-700' : 'text-teal-950',
                  )}
                >
                  {formatMoney(todayMoney)}
                </td>
                <td className={cn(dayEdge, 'py-1.5')} />
              </tr>
            ) : null}
            {historyDays.map((group) => (
              <Fragment key={group.date}>
                <tr aria-hidden="true">
                  <td colSpan={8} className={dayGap} />
                </tr>
                {renderDayBar(group)}
                {collapsed.has(group.date)
                  ? null
                  : group.lines.map((item) => (
                      <Fragment key={item.line.key}>
                        {renderLedgerRow(item.line, item.index)}
                        {item.line.kind === 'usage' && openUsage.has(item.line.key)
                          ? renderUsageDetails(item.line, 8)
                          : null}
                      </Fragment>
                    ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {futureDays.length > 0 ? (
        <div className="border-t border-teal-900/10">
          <div className="px-3 py-2">
            <h3 className="text-sm font-semibold text-teal-950">Future bookings</h3>
            <p className="text-xs text-teal-900/45">
              Tap a day to fold or open it. These days are not deducted from heads or money yet.
            </p>
          </div>
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#e7eee9] text-left text-[11px] font-semibold tracking-wide text-teal-900/55">
                  <th className="w-10 border border-teal-900/10 px-1 py-2 text-center">
                    <span className="sr-only">Day</span>
                  </th>
                  <th className="w-[132px] border border-teal-900/10 px-2 py-2">Date</th>
                  <th className="border border-teal-900/10 px-2 py-2">Detail</th>
                  <th className="w-[88px] border border-teal-900/10 px-2 py-2 text-right">Heads</th>
                  <th className="w-[120px] border border-teal-900/10 px-2 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {futureDays.map((group) => {
                  const open = !collapsed.has(group.date)
                  const rows = group.lines.map((item) => item.line)
                  const heads = rows.reduce((sum, line) => sum + line.headsDelta, 0)
                  const value = rows.reduce((sum, line) => sum + (line.value ?? 0), 0)
                  const bar = cn(dayEdge, 'px-2 py-1.5')
                  return (
                    <Fragment key={`future-${group.date}`}>
                      <tr aria-hidden="true">
                        <td colSpan={5} className={dayGap} />
                      </tr>
                      <tr
                        role="button"
                        tabIndex={0}
                        aria-expanded={open}
                        aria-label={`${open ? 'Fold' : 'Open'} ${formatShortDate(group.date)}`}
                        className="cursor-pointer bg-[#cfe3d9] text-teal-950 hover:bg-[#c3ddd2]"
                        onClick={() => toggleDay(group.date)}
                        onKeyDown={(event) => onDayKeyDown(group.date, event)}
                      >
                        <td className={cn(bar, 'bg-[#c3ddd2] px-1 text-center')}>
                          {open ? (
                            <ChevronDown className="mx-auto size-3.5" />
                          ) : (
                            <ChevronRight className="mx-auto size-3.5" />
                          )}
                        </td>
                        <td className={cn(bar, 'font-semibold whitespace-nowrap')}>{formatShortDate(group.date)}</td>
                        <td className={cn(bar, 'font-medium text-teal-900/70')}>Daily Sum</td>
                        <td className={cn(bar, 'text-right font-semibold tabular-nums')}>{heads}</td>
                        <td className={cn(bar, 'text-right font-semibold tabular-nums')}>
                          {value === 0 ? '—' : formatMoney(value)}
                        </td>
                      </tr>
                      {open
                        ? group.lines.map(({ line }) => {
                            const canOpen = line.bookings.length > 0 || usageParts(line.note).length > 0
                            const detailOpen = canOpen && openUsage.has(line.key)
                            return (
                              <Fragment key={line.key}>
                                <tr
                                  role={canOpen ? 'button' : undefined}
                                  tabIndex={canOpen ? 0 : undefined}
                                  aria-expanded={canOpen ? detailOpen : undefined}
                                  className={cn('bg-white text-teal-950', canOpen && 'cursor-pointer hover:bg-teal-50/70')}
                                  onClick={canOpen ? () => toggleUsage(line.key) : undefined}
                                  onKeyDown={
                                    canOpen
                                      ? (event) => {
                                          if (event.key !== 'Enter' && event.key !== ' ') return
                                          event.preventDefault()
                                          toggleUsage(line.key)
                                        }
                                      : undefined
                                  }
                                >
                                  <td className="border border-teal-900/10 px-1 text-center">
                                    {canOpen ? (
                                      detailOpen ? (
                                        <ChevronDown className="mx-auto size-3.5 text-teal-800" />
                                      ) : (
                                        <ChevronRight className="mx-auto size-3.5 text-teal-800" />
                                      )
                                    ) : null}
                                  </td>
                                  <td className="border border-teal-900/10 px-2 whitespace-nowrap text-teal-900/45">
                                    {formatShortDate(line.date)}
                                  </td>
                                  <td className="border border-teal-900/10 px-2">{lineTitle(line, canOpen)}</td>
                                  <td className="border border-teal-900/10 px-2 text-right font-medium tabular-nums">
                                    {line.headsDelta}
                                  </td>
                                  <td className="border border-teal-900/10 px-2 text-right tabular-nums text-teal-900/70">
                                    {line.value == null ? '—' : formatMoney(line.value)}
                                  </td>
                                </tr>
                                {detailOpen ? renderUsageDetails(line, 5) : null}
                              </Fragment>
                            )
                          })
                        : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {error ? <p className="px-3 py-2 text-sm text-red-600">{error}</p> : null}
    </div>
  )
}
