'use client'

import { useEffect, useMemo, useState } from 'react'
import { EmptyState, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { checkInStatusLabel, formatInvoiceDate } from '@/lib/invoice'
import {
  emptyPartnerCheck,
  loadPartnerInvoiceChecks,
  savePartnerInvoiceCheck,
  type PartnerInvoiceCheck,
} from '@/lib/partner-invoice-check'
import { formatShortDate, todayISO } from '@/lib/format'
import {
  boatDisplayName,
  isActiveBooking,
  DUMMY_VAN_LABEL,
  DUMMY_VAN_NUMBER,
  isDummyVan,
  isPartnerBoat,
  type Booking,
  type CheckInAttendance,
  type DayBoatPlan,
  type DayVehiclePlan,
  type Program,
} from '@/lib/types'
import { allocatePaxBreakdown, paxBreakdownTotal, type PaxBreakdown } from '@/lib/vehicle-assign'

type DummyRow = {
  booking: Booking
  dummyVan: boolean
  partnerBoat: boolean
  partnerName: string
  pax: PaxBreakdown
  paxTotal: number
  hotel: string
  attendance: CheckInAttendance | null
  agentInvoiceNo: string
}

function formatDummyPax(pax: PaxBreakdown) {
  return `${pax.adults}+${pax.children}+${pax.infants}+${pax.tourLeaders}T`
}

function programShort(program: Program) {
  return program === 'PP' ? 'PP' : 'JB'
}

function paidDateValue(paidAt: string | null | undefined) {
  return paidAt?.slice(0, 10) || ''
}

function PartnerPayAction({
  bookingCode,
  guestName,
  paid,
  paidAt,
  onConfirm,
  onUndo,
}: {
  bookingCode: string
  guestName: string
  paid: boolean
  paidAt: string | null
  onConfirm: (paidDate: string) => void
  onUndo: () => void
}) {
  const today = todayISO()
  const [open, setOpen] = useState(false)
  const [paidDate, setPaidDate] = useState(paidDateValue(paidAt) || today)

  useEffect(() => {
    if (!open) return
    setPaidDate(paidDateValue(paidAt) || today)
  }, [open, paidAt, today])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              'inline-flex flex-col items-start rounded-lg px-2 py-1 text-left outline-none hover:bg-white/80',
              paid ? 'text-emerald-700' : 'text-amber-800',
            )}
            aria-label={`${paid ? 'Paid' : 'Not paid'}. Set partner payment date for ${guestName}`}
          />
        }
      >
        <span className="text-xs font-semibold">{paid ? 'Paid' : 'Not paid'}</span>
        {paid && paidDateValue(paidAt) ? (
          <span className="text-[10px] font-medium text-emerald-800/70">
            {formatShortDate(paidDateValue(paidAt))}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-3 p-3">
        <div>
          <p className="text-sm font-medium text-teal-950">{guestName}</p>
          <p className="text-xs text-teal-900/55">
            {paid ? 'Change the paid date, or mark not paid.' : 'Enter the date you paid the partner.'}
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="gday-soft-label" htmlFor={`partner-paid-${bookingCode}`}>
            Paid date
          </label>
          <Input
            id={`partner-paid-${bookingCode}`}
            type="date"
            value={paidDate}
            onChange={(event) => setPaidDate(event.target.value)}
            className="h-9"
          />
        </div>
        <Button
          type="button"
          className="h-9 w-full rounded-xl"
          onClick={() => {
            if (!paidDate) return
            setOpen(false)
            onConfirm(paidDate)
          }}
        >
          {paid ? 'Update date' : 'Mark paid'}
        </Button>
        {paid ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full rounded-xl text-amber-800"
            onClick={() => {
              setOpen(false)
              onUndo()
            }}
          >
            Not paid
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export function InvoiceDummyVanPanel({
  bookings,
  fromDate,
  toDate,
  agentSlug,
  getDayVehiclePlan,
  getDayBoatPlan,
  getCheckInAttendance,
  agentInvoiceNo,
}: {
  bookings: Booking[]
  fromDate: string
  toDate: string
  agentSlug: string
  getDayVehiclePlan: (date: string, program: Program) => DayVehiclePlan
  getDayBoatPlan: (date: string, program: Program) => DayBoatPlan
  getCheckInAttendance: (date: string, program: Program, code: string) => CheckInAttendance | null
  agentInvoiceNo: (code: string) => string
}) {
  const [checks, setChecks] = useState<Record<string, PartnerInvoiceCheck>>({})
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    void loadPartnerInvoiceChecks().then((map) => {
      if (!cancelled) setChecks(map)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo<DummyRow[]>(() => {
    return bookings
      .filter((booking) => booking.date >= fromDate && booking.date <= toDate)
      .filter((booking) => (agentSlug === 'all' ? true : booking.agentSlug === agentSlug))
      .flatMap((booking) => {
        const vehicle = getDayVehiclePlan(booking.date, booking.program)
        const boatPlan = getDayBoatPlan(booking.date, booking.program)
        const legs = vehicle.assignments[booking.code]
        const dummyVan = Boolean(legs?.some((leg) => isDummyVan(leg.van)))
        const boat = boatPlan.assignments[booking.code] ?? null
        const partnerBoat = Boolean(boat && isPartnerBoat(boatPlan, boat))
        if (!dummyVan && !partnerBoat) return []

        const pax = dummyVan
          ? allocatePaxBreakdown(
              {
                adults: booking.adults,
                children: booking.children,
                infants: booking.infants,
                tourLeaders: booking.tourLeaders,
              },
              legs,
              DUMMY_VAN_NUMBER,
            )
          : {
              adults: booking.adults,
              children: booking.children,
              infants: booking.infants,
              tourLeaders: booking.tourLeaders,
            }

        return [
          {
            booking,
            dummyVan,
            partnerBoat,
            partnerName:
              partnerBoat && boat ? boatDisplayName(boatPlan, boat) : DUMMY_VAN_LABEL,
            pax,
            paxTotal: paxBreakdownTotal(pax),
            hotel: booking.pickupHotel?.trim() || booking.pickupZone?.trim() || '—',
            attendance: getCheckInAttendance(booking.date, booking.program, booking.code),
            agentInvoiceNo: agentInvoiceNo(booking.code),
          },
        ]
      })
      .sort(
        (a, b) =>
          a.booking.date.localeCompare(b.booking.date) ||
          a.partnerName.localeCompare(b.partnerName) ||
          a.booking.leadGuest.localeCompare(b.booking.leadGuest),
      )
  }, [
    agentInvoiceNo,
    agentSlug,
    bookings,
    fromDate,
    getCheckInAttendance,
    getDayBoatPlan,
    getDayVehiclePlan,
    toDate,
  ])

  const dayGroups = useMemo(() => {
    const map = new Map<string, DummyRow[]>()
    for (const row of rows) {
      const list = map.get(row.booking.date) ?? []
      list.push(row)
      map.set(row.booking.date, list)
    }
    return [...map.entries()].map(([date, dayRows]) => {
      const boats = new Map<string, DummyRow[]>()
      for (const row of dayRows) {
        const list = boats.get(row.partnerName) ?? []
        list.push(row)
        boats.set(row.partnerName, list)
      }
      return {
        date,
        pax: dayRows.reduce((sum, row) => sum + row.paxTotal, 0),
        checked: dayRows.filter((row) => checks[row.booking.code]?.checked).length,
        paid: dayRows.filter((row) => checks[row.booking.code]?.paid).length,
        boats: [...boats.entries()].map(([partnerName, boatRows]) => ({
          partnerName,
          pax: boatRows.reduce((sum, row) => sum + row.paxTotal, 0),
          rows: boatRows,
        })),
      }
    })
  }, [checks, rows])

  function checkFor(row: DummyRow): PartnerInvoiceCheck {
    return (
      checks[row.booking.code] ??
      emptyPartnerCheck(row.booking.code, row.booking.date, row.booking.program)
    )
  }

  async function persist(next: PartnerInvoiceCheck) {
    setChecks((current) => ({ ...current, [next.bookingCode]: next }))
    await savePartnerInvoiceCheck(next)
  }

  async function toggleChecked(row: DummyRow) {
    const current = checkFor(row)
    const checked = !current.checked
    await persist({
      ...current,
      travelDate: row.booking.date,
      program: row.booking.program,
      checked,
      checkedAt: checked ? new Date().toISOString() : null,
    })
  }

  async function markPaid(row: DummyRow, paidDate: string) {
    const current = checkFor(row)
    await persist({
      ...current,
      travelDate: row.booking.date,
      program: row.booking.program,
      paid: true,
      paidAt: `${paidDate}T12:00:00.000Z`,
    })
  }

  async function markUnpaid(row: DummyRow) {
    const current = checkFor(row)
    await persist({
      ...current,
      travelDate: row.booking.date,
      program: row.booking.program,
      paid: false,
      paidAt: null,
    })
  }

  async function saveNote(row: DummyRow) {
    const current = checkFor(row)
    const note = (noteDrafts[row.booking.code] ?? current.note).trim()
    if (note === current.note) return
    await persist({
      ...current,
      travelDate: row.booking.date,
      program: row.booking.program,
      note,
    })
  }

  const dateLabel =
    fromDate === toDate
      ? formatShortDate(fromDate)
      : `${formatShortDate(fromDate)} – ${formatShortDate(toDate)}`

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-teal-900/55">
          {rows.length} sent-out booking{rows.length === 1 ? '' : 's'}
          {rows.length > 0
            ? ` · ${rows.reduce((sum, row) => sum + row.paxTotal, 0)} pax · ${
                rows.filter((row) => checks[row.booking.code]?.checked).length
              } checked · ${
                rows.filter((row) => checks[row.booking.code]?.paid).length
              } paid`
            : ''}
        </p>
        <p className="text-xs text-teal-900/45">
          Agent invoices stay on Bills. Tick a row after you check the partner invoice.
        </p>
      </div>
      <Surface className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState>
            No Send to Partner bookings for {dateLabel}.
          </EmptyState>
        ) : (
          <div className="space-y-5 px-3 py-3 sm:px-4">
            {dayGroups.map((group) => (
              <div key={group.date}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-teal-950">
                    {formatInvoiceDate(group.date)}
                    <span className="ml-2 text-xs font-medium text-teal-900/50">
                      {group.pax} pax · {group.checked}/{group.boats.reduce((n, boat) => n + boat.rows.length, 0)} checked · {group.paid} paid
                    </span>
                  </p>
                </div>
                {group.boats.map((boat) => (
                  <div key={`${group.date}-${boat.partnerName}`} className="mb-3 last:mb-0">
                    <p className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                      {boat.partnerName}
                      <span className="ml-1.5 font-medium normal-case text-neutral-500">
                        {boat.rows.length} bk · {boat.pax} pax
                      </span>
                    </p>
                    <div className="overflow-x-auto rounded-xl ring-1 ring-teal-900/10">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">OK</TableHead>
                            <TableHead className="w-14">Prog</TableHead>
                            <TableHead>Guest</TableHead>
                            <TableHead>Pax</TableHead>
                            <TableHead>Hotel</TableHead>
                            <TableHead>Agent</TableHead>
                            <TableHead className="w-20">Check-in</TableHead>
                            <TableHead className="w-24">Agent inv.</TableHead>
                            <TableHead className="min-w-[12rem]">Partner invoice note</TableHead>
                            <TableHead className="w-28">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {boat.rows.map((row) => {
                            const check = checkFor(row)
                            const noteValue = noteDrafts[row.booking.code] ?? check.note
                            return (
                              <TableRow
                                key={row.booking.code}
                                className={
                                  check.paid
                                    ? 'bg-emerald-50/60'
                                    : check.checked
                                      ? 'bg-amber-50/40'
                                      : undefined
                                }
                              >
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    checked={check.checked}
                                    onChange={() => void toggleChecked(row)}
                                    className="size-4 rounded border-teal-900/20"
                                    aria-label={`Mark ${row.booking.leadGuest} checked against partner invoice`}
                                  />
                                </TableCell>
                                <TableCell className="text-xs font-semibold text-teal-900/70">
                                  {programShort(row.booking.program)}
                                </TableCell>
                                <TableCell>
                                  <p className="font-medium text-teal-950">{row.booking.leadGuest}</p>
                                  <p className="text-[11px] text-teal-900/45">
                                    {row.booking.agentRef?.trim() || row.booking.code}
                                  </p>
                                </TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums">
                                  {formatDummyPax(row.pax)}
                                </TableCell>
                                <TableCell className="min-w-[8rem]" title={row.hotel}>
                                  <span className="line-clamp-2">{row.hotel}</span>
                                </TableCell>
                                <TableCell>{row.booking.agentName}</TableCell>
                                <TableCell className="text-xs">
                                  {checkInStatusLabel(
                                    row.attendance,
                                    !isActiveBooking(row.booking),
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-teal-900/60">
                                  {row.agentInvoiceNo || 'Open'}
                                </TableCell>
                                <TableCell onClick={(event) => event.stopPropagation()}>
                                  <Input
                                    value={noteValue}
                                    onChange={(event) =>
                                      setNoteDrafts((current) => ({
                                        ...current,
                                        [row.booking.code]: event.target.value,
                                      }))
                                    }
                                    onBlur={() => void saveNote(row)}
                                    placeholder="Partner INV / amount"
                                    className="h-8 text-xs"
                                    aria-label={`Partner invoice note for ${row.booking.leadGuest}`}
                                  />
                                </TableCell>
                                <TableCell>
                                  <PartnerPayAction
                                    bookingCode={row.booking.code}
                                    guestName={row.booking.leadGuest}
                                    paid={check.paid}
                                    paidAt={check.paidAt}
                                    onConfirm={(paidDate) => void markPaid(row, paidDate)}
                                    onUndo={() => void markUnpaid(row)}
                                  />
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Surface>
    </>
  )
}
