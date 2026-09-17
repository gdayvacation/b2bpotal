'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toISODate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { totalPassengers, type Booking } from '@/lib/types'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function BookingCalendar({ bookings }: { bookings: Booking[] }) {
  const [month, setMonth] = useState(new Date(2026, 8, 1))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const days = useMemo(() => buildMonth(month), [month])
  const byDate = useMemo(() => groupByDate(bookings), [bookings])
  const selectedBookings = selectedDate ? (byDate[selectedDate] ?? []) : []

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Monthly passenger totals by tour program. Click a date to see bookings."
      />
      <Surface className="p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{monthLabel}</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-teal-900/10 bg-teal-900/10">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="bg-teal-50/80 px-1 py-2.5 text-center text-[10px] font-semibold tracking-wide text-teal-700/45 uppercase sm:px-2 sm:text-[11px]"
            >
              <span className="sm:hidden">{day.slice(0, 1)}</span>
              <span className="hidden sm:inline">{day}</span>
            </div>
          ))}
          {days.map((cell, index) => {
            if (!cell) {
              return <div key={`empty-${index}`} className="min-h-16 bg-white sm:min-h-[108px]" />
            }
            const iso = toISODate(cell)
            const dayBookings = byDate[iso] ?? []
            const pp = sumProgram(dayBookings, 'PP')
            const jb = sumProgram(dayBookings, 'James Bond')
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDate(iso)}
                className={cn(
                  'min-h-16 bg-white p-1.5 text-left transition-colors hover:bg-teal-50/70 sm:min-h-[108px] sm:p-2',
                  selectedDate === iso && 'bg-teal-50 ring-1 ring-inset ring-teal-700',
                )}
              >
                <div className="text-xs font-medium text-teal-900 sm:text-sm">{cell.getDate()}</div>
                <div className="mt-1 space-y-1 sm:mt-2">
                  {pp > 0 ? (
                    <div className="rounded-md bg-sky-50 px-1 py-0.5 text-[9px] font-medium text-sky-800 sm:px-1.5 sm:py-1 sm:text-[11px]">
                      <span className="sm:hidden">PP {pp}</span>
                      <span className="hidden sm:inline">PP — {pp} Pax</span>
                    </div>
                  ) : null}
                  {jb > 0 ? (
                    <div className="rounded-md bg-amber-50 px-1 py-0.5 text-[9px] font-medium text-amber-800 sm:px-1.5 sm:py-1 sm:text-[11px]">
                      <span className="sm:hidden">JB {jb}</span>
                      <span className="hidden sm:inline">James Bond — {jb} Pax</span>
                    </div>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </Surface>

      <Dialog open={Boolean(selectedDate)} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="max-w-lg sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedDate
                ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : 'Bookings'}
            </DialogTitle>
            <DialogDescription>Passenger breakdown for this departure date.</DialogDescription>
          </DialogHeader>
          {selectedBookings.length === 0 ? (
            <p className="text-sm text-neutral-500">No bookings on this date.</p>
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-auto">
              {selectedBookings.map((booking) => (
                <div key={booking.code} className="rounded-xl border border-neutral-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm font-semibold">{booking.code}</div>
                      <div className="text-sm text-neutral-500">{booking.leadGuest}</div>
                    </div>
                    <StatusBadge status={booking.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                    <Pax label="Adults" value={booking.adults} />
                    <Pax label="Children" value={booking.children} />
                    <Pax label="Infants" value={booking.infants} />
                    <Pax label="Tour Leaders" value={booking.tourLeaders} />
                    <Pax label="Total" value={totalPassengers(booking)} emphasize />
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Pax({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div className={cn('rounded-lg bg-neutral-50 px-2 py-2', emphasize && 'bg-neutral-900 text-white')}>
      <div className={cn('text-[10px] uppercase', emphasize ? 'text-neutral-300' : 'text-neutral-400')}>
        {label}
      </div>
      <div className="font-semibold">{value}</div>
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

function groupByDate(bookings: Booking[]) {
  return bookings.reduce<Record<string, Booking[]>>((acc, booking) => {
    acc[booking.date] = [...(acc[booking.date] ?? []), booking]
    return acc
  }, {})
}

function sumProgram(bookings: Booking[], program: Booking['program']) {
  return bookings
    .filter((booking) => booking.program === program)
    .reduce((sum, booking) => sum + totalPassengers(booking), 0)
}
