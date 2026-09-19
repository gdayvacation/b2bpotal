'use client'

import { useEffect, useState } from 'react'
import { usePortal } from '@/components/portal-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Booking, BookingEvent } from '@/lib/types'

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function typeLabel(type: BookingEvent['type']) {
  switch (type) {
    case 'created':
      return 'Created'
    case 'cancelled':
      return 'Cancelled'
    case 'date_changed':
      return 'Date changed'
    case 'rebooked':
      return 'Rebooked'
    case 'pickup_set':
      return 'Pickup time'
    case 'details_edited':
      return 'Details edited'
    default:
      return type
  }
}

export function BookingHistoryDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { getBookingHistory, loadBookingHistory } = usePortal()
  const [events, setEvents] = useState<BookingEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !booking) return
    setEvents(getBookingHistory(booking.code))
    setLoading(true)
    void loadBookingHistory(booking.code)
      .then((next) => setEvents(next))
      .finally(() => setLoading(false))
  }, [open, booking, getBookingHistory, loadBookingHistory])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change history</DialogTitle>
          <DialogDescription>
            {booking ? `${booking.code} · who changed what` : null}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {loading && events.length === 0 ? (
            <p className="py-6 text-center text-sm text-teal-900/45">Loading…</p>
          ) : events.length === 0 ? (
            <p className="py-6 text-center text-sm text-teal-900/45">No history yet.</p>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="rounded-xl border border-teal-900/8 bg-teal-50/40 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-teal-950">{typeLabel(event.type)}</p>
                  <p className="shrink-0 text-[11px] text-teal-900/45">{formatWhen(event.createdAt)}</p>
                </div>
                <p className="mt-0.5 text-sm text-teal-900/70">{event.summary}</p>
                <p className="mt-1 text-[11px] font-medium text-teal-800/55">
                  {event.actorRole === 'admin' ? 'Admin' : 'Agency'}
                  {event.actorName ? ` · ${event.actorName}` : ''}
                </p>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
