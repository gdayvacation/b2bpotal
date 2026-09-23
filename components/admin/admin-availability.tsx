'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { PageHeader, Segment, SegmentedControl, SoftLabel, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  addCalendarDays,
  formatCutoffDeadline,
  formatThbAmount,
  isBookingOpenForDate,
  isCancelOpenForDate,
  isLateAmendmentForDate,
  summarizeCutoffRule,
} from '@/lib/booking-cutoffs'
import { formatLongDate, formatShortDate, startOfThisMonth, toISODate } from '@/lib/format'
import { usePortalTodayISO } from '@/lib/use-portal-today'
import { DEFAULT_JB_CAPACITY, DEFAULT_PP_CAPACITY, type Program } from '@/lib/types'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Tab = 'capacity' | 'status' | 'close' | 'cutoffs'
type ProgramFilter = 'all' | Program

export function AdminAvailability() {
  const {
    getCapacity,
    bookedPaxFor,
    setCapacityForDates,
    nudgeCapacityForDates,
    bookingCutoffs,
    updateBookingCutoffs,
    bookingClosures,
    isProgramClosed,
    getBookingClosure,
    closeBookingForDates,
    openBookingForDates,
  } = usePortal()
  const portalToday = usePortalTodayISO()
  const prevTodayRef = useRef(portalToday)
  const [tab, setTab] = useState<Tab>('capacity')
  const [month, setMonth] = useState(() => startOfThisMonth())
  const [selected, setSelected] = useState(() => [portalToday])
  const [programFilter, setProgramFilter] = useState<ProgramFilter>('all')
  const [closePrograms, setClosePrograms] = useState<Program[]>(['PP', 'James Bond'])
  const [closureReason, setClosureReason] = useState('')
  const showPP = programFilter === 'all' || programFilter === 'PP'
  const showJB = programFilter === 'all' || programFilter === 'James Bond'

  useEffect(() => {
    if (portalToday === prevTodayRef.current) return
    const previousToday = prevTodayRef.current
    prevTodayRef.current = portalToday
    setSelected((current) => {
      if (current.length === 1 && current[0] === previousToday) return [portalToday]
      return current
    })
  }, [portalToday])

  const days = useMemo(() => buildMonth(month), [month])
  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const selectedSorted = useMemo(() => [...selected].sort(), [selected])
  const singleIso = selectedSorted.length === 1 ? selectedSorted[0] : null

  const sharedCapacity = useMemo(() => {
    if (selectedSorted.length === 0) return null
    const caps = selectedSorted.map((iso) => getCapacity(iso))
    const ppValues = new Set(caps.map((c) => c.ppCapacity))
    const jbValues = new Set(caps.map((c) => c.jamesBondCapacity))
    return {
      ppCapacity: ppValues.size === 1 ? [...ppValues][0] : null,
      jamesBondCapacity: jbValues.size === 1 ? [...jbValues][0] : null,
    }
  }, [selectedSorted, getCapacity])

  const selectedClosureState = useMemo(() => {
    if (selectedSorted.length === 0) {
      return { pp: 'none' as const, jb: 'none' as const, reason: '' }
    }
    const ppClosed = selectedSorted.map((iso) => isProgramClosed(iso, 'PP'))
    const jbClosed = selectedSorted.map((iso) => isProgramClosed(iso, 'James Bond'))
    const reasons = new Set(
      selectedSorted.flatMap((iso) => {
        const notes: string[] = []
        const pp = getBookingClosure(iso, 'PP')
        const jb = getBookingClosure(iso, 'James Bond')
        if (pp?.reason) notes.push(pp.reason)
        if (jb?.reason) notes.push(jb.reason)
        return notes
      }),
    )
    return {
      pp: ppClosed.every(Boolean) ? ('all' as const) : ppClosed.some(Boolean) ? ('mixed' as const) : ('none' as const),
      jb: jbClosed.every(Boolean) ? ('all' as const) : jbClosed.some(Boolean) ? ('mixed' as const) : ('none' as const),
      reason: reasons.size === 1 ? [...reasons][0] : '',
    }
  }, [selectedSorted, isProgramClosed, getBookingClosure])

  const monthClosures = useMemo(() => {
    const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
    return bookingClosures.filter((item) => item.date.startsWith(monthPrefix))
  }, [bookingClosures, month])

  const previewTravelDate = useMemo(() => {
    const bangkokToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: bookingCutoffs.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    return addCalendarDays(bangkokToday, 1)
  }, [bookingCutoffs.timezone])

  function toggleDay(iso: string) {
    setSelected((current) =>
      current.includes(iso) ? current.filter((d) => d !== iso) : [...current, iso],
    )
  }

  function selectOnly(iso: string) {
    setSelected([iso])
  }

  function bumpCapacity(program: 'PP' | 'James Bond', delta: number) {
    if (selectedSorted.length === 0) return
    nudgeCapacityForDates(selectedSorted, program, delta)
  }

  function setAbsoluteCapacity(program: 'PP' | 'James Bond', value: number) {
    if (selectedSorted.length === 0) return
    const key = program === 'PP' ? 'ppCapacity' : 'jamesBondCapacity'
    setCapacityForDates(selectedSorted, { [key]: Math.max(0, value) })
  }

  function toggleCloseProgram(program: Program) {
    setClosePrograms((current) =>
      current.includes(program)
        ? current.filter((item) => item !== program)
        : [...current, program],
    )
  }

  function applyCloseBooking() {
    if (selectedSorted.length === 0 || closePrograms.length === 0) return
    closeBookingForDates(selectedSorted, closePrograms, closureReason)
  }

  function applyOpenBooking(programs: Program[] = closePrograms) {
    if (selectedSorted.length === 0 || programs.length === 0) return
    openBookingForDates(selectedSorted, programs)
  }

  function selectWeekFromFirst() {
    const anchorIso =
      selectedSorted[0] ?? toISODate(new Date(month.getFullYear(), month.getMonth(), 1))
    const anchor = new Date(`${anchorIso}T12:00:00`)
    const next: string[] = []
    for (let i = 0; i < 7; i += 1) {
      next.push(
        toISODate(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i)),
      )
    }
    setSelected(next)
  }

  const headerDescription =
    tab === 'cutoffs'
      ? `One time control per rule (${bookingCutoffs.timezone}). Agents may book or modify until the set time. After the late-fee time, date changes and cancels are charged. Admin can always bypass.`
      : tab === 'close'
        ? 'Close booking on specific dates for PP, James Bond, or both — for weather, boat issues, or other ops holds. Agents cannot book closed dates; admin can still bypass.'
        : `Default every day: PP ${DEFAULT_PP_CAPACITY} · James Bond ${DEFAULT_JB_CAPACITY}. Adjust per day or view live booking status.`

  return (
    <div className="w-full">
      <PageHeader title="Availability" description={headerDescription} />

      <SegmentedControl className="mb-4 w-full sm:w-auto">
        <Segment
          active={tab === 'capacity'}
          onClick={() => setTab('capacity')}
          className="flex-1 sm:flex-none"
        >
          Adjust capacity
        </Segment>
        <Segment
          active={tab === 'status'}
          onClick={() => setTab('status')}
          className="flex-1 sm:flex-none"
        >
          Booking status
        </Segment>
        <Segment
          active={tab === 'close'}
          onClick={() => setTab('close')}
          className="flex-1 sm:flex-none"
        >
          Close booking
        </Segment>
        <Segment
          active={tab === 'cutoffs'}
          onClick={() => setTab('cutoffs')}
          className="flex-1 sm:flex-none"
        >
          Booking cutoffs
        </Segment>
      </SegmentedControl>

      {tab === 'cutoffs' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Surface className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-teal-950">1. New bookings</h2>
            <p className="mt-1 text-xs leading-relaxed text-teal-950/50">
              Agents can book the next-day trip until this time today. After midnight, that day is
              closed — they must book the following day.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[7.5rem_1fr]">
              <div>
                <SoftLabel htmlFor="book-before-days">Days before</SoftLabel>
                <Input
                  id="book-before-days"
                  type="number"
                  min={0}
                  max={30}
                  className="mt-1.5 h-10"
                  value={bookingCutoffs.bookBeforeDays}
                  onChange={(event) =>
                    updateBookingCutoffs({ bookBeforeDays: Number(event.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <SoftLabel htmlFor="book-until-time">Until time</SoftLabel>
                <Input
                  id="book-until-time"
                  type="time"
                  className="mt-1.5 h-10"
                  value={bookingCutoffs.bookUntilTime}
                  onChange={(event) => updateBookingCutoffs({ bookUntilTime: event.target.value })}
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-teal-800/65">
              Rule: {summarizeCutoffRule(bookingCutoffs.bookBeforeDays, bookingCutoffs.bookUntilTime)}
            </p>
          </Surface>

          <Surface className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-teal-950">2. Modify bookings</h2>
            <p className="mt-1 text-xs leading-relaxed text-teal-950/50">
              Agents can edit, add guests, cancel, or change the date until this time. After that,
              changes close and they must contact land service.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[7.5rem_1fr]">
              <div>
                <SoftLabel htmlFor="cancel-before-days">Days before</SoftLabel>
                <Input
                  id="cancel-before-days"
                  type="number"
                  min={0}
                  max={30}
                  className="mt-1.5 h-10"
                  value={bookingCutoffs.cancelBeforeDays}
                  onChange={(event) =>
                    updateBookingCutoffs({ cancelBeforeDays: Number(event.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <SoftLabel htmlFor="cancel-until-time">Until time</SoftLabel>
                <Input
                  id="cancel-until-time"
                  type="time"
                  className="mt-1.5 h-10"
                  value={bookingCutoffs.cancelUntilTime}
                  onChange={(event) =>
                    updateBookingCutoffs({ cancelUntilTime: event.target.value })
                  }
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-teal-800/65">
              Rule:{' '}
              {summarizeCutoffRule(bookingCutoffs.cancelBeforeDays, bookingCutoffs.cancelUntilTime)}
            </p>
          </Surface>

          <Surface className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-teal-950">3. Extra charges after</h2>
            <p className="mt-1 text-xs leading-relaxed text-teal-950/50">
              After this time on the modify day, agents can still change until the modify cutoff,
              but extra charges apply. Reducing AD / CH or changing the date is charged. Adding
              guests is free. Infant and TL are free.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_7.5rem]">
              <div>
                <SoftLabel htmlFor="late-fee-from-time">From time</SoftLabel>
                <Input
                  id="late-fee-from-time"
                  type="time"
                  className="mt-1.5 h-10"
                  value={bookingCutoffs.lateFeeFromTime}
                  onChange={(event) =>
                    updateBookingCutoffs({ lateFeeFromTime: event.target.value })
                  }
                />
              </div>
              <div>
                <SoftLabel htmlFor="date-change-fee">THB / person</SoftLabel>
                <Input
                  id="date-change-fee"
                  type="number"
                  min={0}
                  max={20000}
                  step={50}
                  className="mt-1.5 h-10"
                  value={bookingCutoffs.dateChangeFeePerPerson}
                  onChange={(event) =>
                    updateBookingCutoffs({
                      dateChangeFeePerPerson: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-teal-800/65">
              Reduce AD / CH or change date: +{formatThbAmount(bookingCutoffs.dateChangeFeePerPerson)}{' '}
              per AD / CH (forced for agents). Adding guests is free. Infant and TL are free. Cancel
              the whole booking: full price (no refund).
            </p>
          </Surface>

          <Surface className="p-5 sm:p-6 lg:col-span-3">
            <h2 className="text-sm font-semibold text-teal-950">Live preview</h2>
            <p className="mt-1 text-xs text-teal-950/50">
              Example travel date {formatLongDate(previewTravelDate)} (tomorrow in{' '}
              {bookingCutoffs.timezone}).
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <CutoffPreviewCard
                label="Book"
                open={isBookingOpenForDate(bookingCutoffs, previewTravelDate)}
                deadline={formatCutoffDeadline(
                  previewTravelDate,
                  bookingCutoffs.bookBeforeDays,
                  bookingCutoffs.bookUntilTime,
                )}
              />
              <CutoffPreviewCard
                label="Modify"
                open={isCancelOpenForDate(bookingCutoffs, previewTravelDate)}
                deadline={formatCutoffDeadline(
                  previewTravelDate,
                  bookingCutoffs.cancelBeforeDays,
                  bookingCutoffs.cancelUntilTime,
                )}
              />
              <LateFeePreviewCard
                modifyOpen={isCancelOpenForDate(bookingCutoffs, previewTravelDate)}
                charging={isLateAmendmentForDate(bookingCutoffs, previewTravelDate)}
                deadline={`From ${formatCutoffDeadline(
                  previewTravelDate,
                  bookingCutoffs.cancelBeforeDays,
                  bookingCutoffs.lateFeeFromTime,
                )}`}
              />
            </div>
          </Surface>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Surface className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight text-teal-950">{monthLabel}</h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>

            {tab === 'capacity' || tab === 'close' ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-teal-950/50">
                  {tab === 'close'
                    ? 'Click days to select, then close or reopen booking in the panel.'
                    : 'Click days to select. Use the panel to raise or lower seats.'}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={selectWeekFromFirst}>
                    Next 7 days
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={selected.length === 0}
                    onClick={() => setSelected([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-xs text-teal-950/55">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-emerald-500" /> Available
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-rose-500" /> Booked
                  </span>
                </div>
                <SegmentedControl>
                  <Segment active={programFilter === 'all'} onClick={() => setProgramFilter('all')}>
                    All
                  </Segment>
                  <Segment active={programFilter === 'PP'} onClick={() => setProgramFilter('PP')}>
                    PP
                  </Segment>
                  <Segment
                    active={programFilter === 'James Bond'}
                    onClick={() => setProgramFilter('James Bond')}
                  >
                    James Bond
                  </Segment>
                </SegmentedControl>
              </div>
            )}

            {tab === 'close' ? (
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-teal-950/55">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-rose-500" /> Closed
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-emerald-500" /> Open
                </span>
                {monthClosures.length > 0 ? (
                  <span className="text-teal-900/40">
                    {monthClosures.length} closed slot{monthClosures.length === 1 ? '' : 's'} this
                    month
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-teal-900/12">
              <div className="grid grid-cols-7 -mb-px -mr-px">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="border-r border-b border-teal-900/12 bg-teal-50/80 px-1 py-2 text-center text-[10px] font-medium tracking-wide text-teal-700/45 uppercase sm:text-[11px]"
                  >
                    <span className="sm:hidden">{day.slice(0, 1)}</span>
                    <span className="hidden sm:inline">{day}</span>
                  </div>
                ))}

                {days.map((cell, index) => {
                  if (!cell) {
                    return (
                      <div
                        key={`empty-${index}`}
                        className="min-h-[88px] border-r border-b border-teal-900/12 bg-white/70 sm:min-h-[104px]"
                      />
                    )
                  }

                  const iso = toISODate(cell)
                  const capacity = getCapacity(iso)
                  const ppBooked = bookedPaxFor(iso, 'PP')
                  const jbBooked = bookedPaxFor(iso, 'James Bond')
                  const ppLeft = Math.max(capacity.ppCapacity - ppBooked, 0)
                  const jbLeft = Math.max(capacity.jamesBondCapacity - jbBooked, 0)
                  const isSelected = selected.includes(iso)
                  const ppClosed = isProgramClosed(iso, 'PP')
                  const jbClosed = isProgramClosed(iso, 'James Bond')

                  if (tab === 'capacity') {
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => toggleDay(iso)}
                        className={cn(
                          'min-h-[88px] border-r border-b border-teal-900/12 bg-white p-1.5 text-left transition-colors hover:bg-teal-50/70 sm:min-h-[104px] sm:p-2',
                          isSelected && 'bg-teal-50 shadow-[inset_0_0_0_2px_rgb(15_118_110)]',
                        )}
                      >
                        <div className="text-xs font-medium text-teal-900 sm:text-sm">
                          {cell.getDate()}
                        </div>
                        <div className="mt-1.5 space-y-1">
                          <CapacityChip label="PP" value={capacity.ppCapacity} />
                          <CapacityChip label="JB" value={capacity.jamesBondCapacity} />
                        </div>
                      </button>
                    )
                  }

                  if (tab === 'close') {
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => toggleDay(iso)}
                        className={cn(
                          'min-h-[88px] border-r border-b border-teal-900/12 bg-white p-1.5 text-left transition-colors hover:bg-teal-50/70 sm:min-h-[104px] sm:p-2',
                          (ppClosed || jbClosed) && 'bg-rose-50/60',
                          isSelected && 'shadow-[inset_0_0_0_2px_rgb(15_118_110)]',
                          isSelected && !(ppClosed || jbClosed) && 'bg-teal-50',
                        )}
                      >
                        <div className="text-xs font-medium text-teal-900 sm:text-sm">
                          {cell.getDate()}
                        </div>
                        <div className="mt-1.5 space-y-1">
                          <ClosureChip label="PP" closed={ppClosed} />
                          <ClosureChip label="JB" closed={jbClosed} />
                        </div>
                      </button>
                    )
                  }

                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => selectOnly(iso)}
                      className={cn(
                        'min-h-[88px] border-r border-b border-teal-900/12 bg-white p-1.5 text-left transition-colors hover:bg-teal-50/70 sm:min-h-[104px] sm:p-2',
                        isSelected &&
                          selected.length === 1 &&
                          'bg-teal-50/80 shadow-[inset_0_0_0_2px_rgb(15_118_110)]',
                      )}
                    >
                      <div className="text-xs font-medium text-teal-900 sm:text-sm">
                        {cell.getDate()}
                      </div>
                      <div className="mt-1.5 space-y-1">
                        {showPP ? (
                          <StatusChips label="PP" available={ppLeft} booked={ppBooked} />
                        ) : null}
                        {showJB ? (
                          <StatusChips label="JB" available={jbLeft} booked={jbBooked} />
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </Surface>

          <Surface className="flex h-fit flex-col p-5">
            {tab === 'capacity' ? (
              <>
                <h2 className="text-sm font-semibold text-teal-950">Edit seats</h2>
                <p className="mt-1 text-xs text-teal-950/50">
                  {selectedSorted.length === 0
                    ? 'Select one or more days on the calendar.'
                    : selectedSorted.length === 1
                      ? formatLongDate(selectedSorted[0])
                      : `${selectedSorted.length} days selected`}
                </p>

                {selectedSorted.length > 1 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedSorted.slice(0, 8).map((iso) => (
                      <span
                        key={iso}
                        className="rounded-md bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-800"
                      >
                        {formatShortDate(iso)}
                      </span>
                    ))}
                    {selectedSorted.length > 8 ? (
                      <span className="px-1 py-1 text-[11px] text-neutral-500">
                        +{selectedSorted.length - 8} more
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-5 space-y-4">
                  <StepperRow
                    name="PP"
                    value={sharedCapacity?.ppCapacity ?? null}
                    disabled={selectedSorted.length === 0}
                    onDecrement={() => bumpCapacity('PP', -1)}
                    onIncrement={() => bumpCapacity('PP', 1)}
                    onChange={(value) => setAbsoluteCapacity('PP', value)}
                  />
                  <StepperRow
                    name="James Bond"
                    value={sharedCapacity?.jamesBondCapacity ?? null}
                    disabled={selectedSorted.length === 0}
                    onDecrement={() => bumpCapacity('James Bond', -1)}
                    onIncrement={() => bumpCapacity('James Bond', 1)}
                    onChange={(value) => setAbsoluteCapacity('James Bond', value)}
                  />
                </div>

                {selectedSorted.length > 1 &&
                (sharedCapacity?.ppCapacity === null ||
                  sharedCapacity?.jamesBondCapacity === null) ? (
                  <p className="mt-4 text-xs leading-relaxed text-neutral-500">
                    Mixed values across selected days. +/- adjusts each day from its current number.
                  </p>
                ) : null}
              </>
            ) : tab === 'close' ? (
              <>
                <h2 className="text-sm font-semibold text-teal-950">Close booking</h2>
                <p className="mt-1 text-xs text-teal-950/50">
                  {selectedSorted.length === 0
                    ? 'Select one or more days on the calendar.'
                    : selectedSorted.length === 1
                      ? formatLongDate(selectedSorted[0])
                      : `${selectedSorted.length} days selected`}
                </p>

                {selectedSorted.length > 1 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedSorted.slice(0, 8).map((iso) => (
                      <span
                        key={iso}
                        className="rounded-md bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-800"
                      >
                        {formatShortDate(iso)}
                      </span>
                    ))}
                    {selectedSorted.length > 8 ? (
                      <span className="px-1 py-1 text-[11px] text-neutral-500">
                        +{selectedSorted.length - 8} more
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {selectedSorted.length > 0 ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <ClosureStatusPill label="PP" state={selectedClosureState.pp} />
                    <ClosureStatusPill label="JB" state={selectedClosureState.jb} />
                  </div>
                ) : null}

                <div className="mt-5 space-y-3">
                  <p className="text-xs font-medium text-teal-900/60">Programs to close / reopen</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={closePrograms.includes('PP') ? 'default' : 'outline'}
                      onClick={() => toggleCloseProgram('PP')}
                    >
                      PP
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={closePrograms.includes('James Bond') ? 'default' : 'outline'}
                      onClick={() => toggleCloseProgram('James Bond')}
                    >
                      James Bond
                    </Button>
                  </div>

                  <div>
                    <SoftLabel htmlFor="closure-reason">Reason (optional)</SoftLabel>
                    <Textarea
                      id="closure-reason"
                      className="mt-1.5 min-h-[72px] resize-none"
                      placeholder="e.g. Storm warning, boat maintenance"
                      value={closureReason}
                      onChange={(event) => setClosureReason(event.target.value)}
                    />
                    {selectedClosureState.reason && !closureReason ? (
                      <p className="mt-1.5 text-[11px] text-teal-900/45">
                        Current note: {selectedClosureState.reason}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      disabled={selectedSorted.length === 0 || closePrograms.length === 0}
                      onClick={applyCloseBooking}
                    >
                      Close booking
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={selectedSorted.length === 0 || closePrograms.length === 0}
                      onClick={() => applyOpenBooking()}
                    >
                      Reopen booking
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold text-teal-950">Day status</h2>
                <p className="mt-1 text-xs text-teal-950/50">
                  {singleIso ? formatLongDate(singleIso) : 'Click a day to inspect seats.'}
                </p>

                {singleIso ? (
                  <div className="mt-5 space-y-3">
                    {showPP ? (
                      <StatusDetail
                        name="PP"
                        capacity={getCapacity(singleIso).ppCapacity}
                        booked={bookedPaxFor(singleIso, 'PP')}
                      />
                    ) : null}
                    {showJB ? (
                      <StatusDetail
                        name="James Bond"
                        capacity={getCapacity(singleIso).jamesBondCapacity}
                        booked={bookedPaxFor(singleIso, 'James Bond')}
                      />
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-neutral-500">
                    Green is seats still open. Red is seats already booked.
                    {programFilter === 'all'
                      ? ''
                      : programFilter === 'PP'
                        ? ' Showing PP only.'
                        : ' Showing James Bond only.'}
                  </p>
                )}
              </>
            )}
          </Surface>
        </div>
      )}
    </div>
  )
}

function CutoffPreviewCard({
  label,
  open,
  deadline,
}: {
  label: string
  open: boolean
  deadline: string
}) {
  return (
    <div className="rounded-xl border border-teal-900/8 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-teal-950">{label}</p>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-[11px] font-semibold',
            open ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800',
          )}
        >
          {open ? 'Open' : 'Closed'}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-teal-950/55">Until {deadline}</p>
    </div>
  )
}

function LateFeePreviewCard({
  modifyOpen,
  charging,
  deadline,
}: {
  modifyOpen: boolean
  charging: boolean
  deadline: string
}) {
  const label = !modifyOpen ? 'Closed' : charging ? 'Charging now' : 'Free now'
  return (
    <div className="rounded-xl border border-teal-900/8 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-teal-950">Extra charges</p>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-[11px] font-semibold',
            !modifyOpen
              ? 'bg-rose-50 text-rose-800'
              : charging
                ? 'bg-amber-50 text-amber-900'
                : 'bg-emerald-50 text-emerald-800',
          )}
        >
          {label}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-teal-950/55">{deadline}</p>
    </div>
  )
}

function CapacityChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-neutral-50 px-1.5 py-1 text-[10px] font-medium text-teal-900 sm:text-[11px]">
      {label} {value}
    </div>
  )
}

function ClosureChip({ label, closed }: { label: string; closed: boolean }) {
  return (
    <div
      className={cn(
        'rounded-md px-1.5 py-1 text-[10px] font-medium sm:text-[11px]',
        closed ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-800',
      )}
    >
      {label} {closed ? 'Closed' : 'Open'}
    </div>
  )
}

function ClosureStatusPill({
  label,
  state,
}: {
  label: string
  state: 'all' | 'none' | 'mixed'
}) {
  return (
    <div
      className={cn(
        'rounded-lg px-2.5 py-2 text-center text-[11px] font-semibold',
        state === 'all'
          ? 'bg-rose-50 text-rose-800'
          : state === 'mixed'
            ? 'bg-amber-50 text-amber-900'
            : 'bg-emerald-50 text-emerald-800',
      )}
    >
      {label}: {state === 'all' ? 'Closed' : state === 'mixed' ? 'Mixed' : 'Open'}
    </div>
  )
}

function StatusChips({
  label,
  available,
  booked,
}: {
  label: string
  available: number
  booked: number
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-5 shrink-0 text-[9px] font-medium text-teal-900/55 sm:text-[10px]">
        {label}
      </span>
      <span className="rounded-md bg-emerald-50 px-1 py-0.5 text-[9px] font-semibold text-emerald-700 sm:text-[10px]">
        {available}
      </span>
      <span className="rounded-md bg-rose-50 px-1 py-0.5 text-[9px] font-semibold text-rose-700 sm:text-[10px]">
        {booked}
      </span>
    </div>
  )
}

function StepperRow({
  name,
  value,
  disabled,
  onDecrement,
  onIncrement,
  onChange,
}: {
  name: string
  value: number | null
  disabled?: boolean
  onDecrement: () => void
  onIncrement: () => void
  onChange: (value: number) => void
}) {
  return (
    <div className="rounded-xl border border-teal-900/8 p-3">
      <div className="mb-2 text-sm font-medium text-teal-950">{name}</div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          disabled={disabled}
          onClick={onDecrement}
        >
          <Minus />
        </Button>
        <input
          type="number"
          min={0}
          disabled={disabled}
          value={value ?? ''}
          placeholder="Mixed"
          className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-center text-base font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          onChange={(event) => {
            if (event.target.value === '') return
            onChange(Number(event.target.value) || 0)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          disabled={disabled}
          onClick={onIncrement}
        >
          <Plus />
        </Button>
      </div>
    </div>
  )
}

function StatusDetail({
  name,
  capacity,
  booked,
}: {
  name: string
  capacity: number
  booked: number
}) {
  const available = Math.max(capacity - booked, 0)
  const overbooked = booked > capacity
  return (
    <div className="rounded-xl border border-teal-900/8 p-3">
      <div className="mb-3 text-sm font-medium text-teal-950">{name}</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-emerald-50 px-3 py-3 text-center">
          <div className="text-[10px] font-medium tracking-wide text-emerald-700/70 uppercase">
            Available
          </div>
          <div className="mt-1 text-xl font-semibold text-emerald-800">{available}</div>
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-3 text-center',
            overbooked ? 'bg-rose-100 ring-1 ring-rose-300' : 'bg-rose-50',
          )}
        >
          <div className="text-[10px] font-medium tracking-wide text-rose-700/70 uppercase">
            Booked
          </div>
          <div className="mt-1 text-xl font-semibold text-rose-800">{booked}</div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-neutral-500">
        Capacity {capacity}
        {overbooked ? (
          <span className="font-medium text-rose-700">
            {' '}
            · Over by {booked - capacity}
          </span>
        ) : null}
      </p>
    </div>
  )
}

function buildMonth(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null)
  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
