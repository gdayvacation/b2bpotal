'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronDown, History, Pencil } from 'lucide-react'
import { BookingHistoryDialog } from '@/components/booking-history-dialog'
import { ChangeBookingDateDialog } from '@/components/change-booking-date-dialog'
import { EditBookingDialog } from '@/components/edit-booking-dialog'
import { usePortal } from '@/components/portal-provider'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState, PageHeader, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { VoucherShareActions } from '@/components/voucher-share-actions'
import { formatShortDate } from '@/lib/format'
import { totalPassengers, type Booking, type BookingActor } from '@/lib/types'
import { cn } from '@/lib/utils'

function AgentStatusMenu({
  booking,
  onCancel,
  onChangeDate,
  onRebook,
  onEdit,
  onHistory,
}: {
  booking: Booking
  onCancel: (code: string, travelDate: string) => void
  onChangeDate: (booking: Booking) => void
  onRebook: (booking: Booking) => void
  onEdit: (booking: Booking) => void
  onHistory: (booking: Booking) => void
}) {
  const { isCancelOpen } = usePortal()
  const [open, setOpen] = useState(false)
  const cancelled = booking.status === 'Cancelled'
  const canEdit = !cancelled && isCancelOpen(booking.date)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-teal-700/25"
            aria-label={`Manage booking ${booking.code}`}
          />
        }
      >
        <StatusBadge status={booking.status} />
        <ChevronDown className="size-3.5 text-teal-800/45" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 gap-1 p-1.5">
        {cancelled ? (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-teal-950 hover:bg-teal-50"
            onClick={() => {
              setOpen(false)
              onRebook(booking)
            }}
          >
            <CalendarDays className="size-3.5 text-teal-800/50" />
            Rebook
          </button>
        ) : canEdit ? (
          <>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-teal-950 hover:bg-teal-50"
              onClick={() => {
                setOpen(false)
                onEdit(booking)
              }}
            >
              <Pencil className="size-3.5 text-teal-800/50" />
              Edit details
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-teal-950 hover:bg-teal-50"
              onClick={() => {
                setOpen(false)
                onChangeDate(booking)
              }}
            >
              <CalendarDays className="size-3.5 text-teal-800/50" />
              Change date
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
              onClick={() => {
                setOpen(false)
                onCancel(booking.code, booking.date)
              }}
            >
              Cancel booking
            </button>
          </>
        ) : (
          <p className="px-2.5 py-2 text-xs text-teal-900/45">Changes closed for this date</p>
        )}
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-teal-950 hover:bg-teal-50"
          onClick={() => {
            setOpen(false)
            onHistory(booking)
          }}
        >
          <History className="size-3.5 text-teal-800/50" />
          History
        </button>
      </PopoverContent>
    </Popover>
  )
}

export function BookingsTable({
  bookings,
  slug,
  showAgent = false,
}: {
  bookings: Booking[]
  slug?: string
  showAgent?: boolean
}) {
  const { agents, cancelBooking, isCancelOpen } = usePortal()
  const [dateTarget, setDateTarget] = useState<Booking | null>(null)
  const [rebookTarget, setRebookTarget] = useState<Booking | null>(null)
  const [editTarget, setEditTarget] = useState<Booking | null>(null)
  const [historyTarget, setHistoryTarget] = useState<Booking | null>(null)

  const actor: BookingActor | undefined = useMemo(() => {
    if (!slug) return undefined
    const agent = agents.find((item) => item.slug === slug)
    return {
      role: 'agent',
      name: agent?.name ?? slug,
      slug,
    }
  }, [agents, slug])

  function handleCancel(code: string, travelDate: string) {
    if (!isCancelOpen(travelDate)) {
      window.alert('Cancel is closed for this travel date.')
      return
    }
    if (
      !window.confirm(
        `Cancel booking ${code}? Seats on that departure will become available again.`,
      )
    ) {
      return
    }
    const result = cancelBooking(code, { actor })
    if (!result.ok) window.alert(result.error)
  }

  return (
    <>
      <PageHeader
        title="My Bookings"
        description="Confirmed, pending, and cancelled bookings for this agency."
      />

      <div className="space-y-3 md:hidden">
        {bookings.length === 0 ? (
          <Surface>
            <EmptyState>No bookings yet.</EmptyState>
          </Surface>
        ) : (
          bookings.map((booking) => {
            const canEdit = booking.status !== 'Cancelled' && isCancelOpen(booking.date)
            return (
              <Surface
                key={booking.code}
                className={cn(
                  'p-4',
                  booking.status === 'Cancelled' && 'border-rose-200/80 bg-rose-50/50',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {slug ? (
                      <Link
                        href={`/agent/${slug}/voucher/${booking.code}`}
                        className={cn(
                          'font-mono text-sm font-semibold hover:underline',
                          booking.status === 'Cancelled'
                            ? 'text-rose-800 line-through decoration-rose-300'
                            : 'text-teal-900',
                        )}
                      >
                        {booking.code}
                      </Link>
                    ) : (
                      <p
                        className={cn(
                          'font-mono text-sm font-semibold',
                          booking.status === 'Cancelled'
                            ? 'text-rose-800 line-through decoration-rose-300'
                            : 'text-teal-950',
                        )}
                      >
                        {booking.code}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-teal-950/55">
                      {formatShortDate(booking.date)} · {booking.program}
                    </p>
                  </div>
                  <StatusBadge status={booking.status} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="gday-soft-label">Lead guest</p>
                    <p className="mt-0.5 font-semibold text-teal-950">{booking.leadGuest}</p>
                  </div>
                  <div>
                    <p className="gday-soft-label">Pax</p>
                    <p className="mt-0.5 font-semibold text-teal-950">{totalPassengers(booking)}</p>
                  </div>
                  {showAgent ? (
                    <div className="col-span-2">
                      <p className="gday-soft-label">Agent</p>
                      <p className="mt-0.5 font-semibold text-teal-950">{booking.agentName}</p>
                    </div>
                  ) : null}
                  <div className="col-span-2">
                    <p className="gday-soft-label">Pickup</p>
                    <p className="mt-0.5 font-semibold text-teal-950">
                      {booking.pickupZone}
                      {booking.pickupTime ? ` · ${booking.pickupTime}` : ''}
                    </p>
                  </div>
                </div>
                {slug ? (
                  <VoucherShareActions
                    slug={slug}
                    code={booking.code}
                    guestName={booking.leadGuest}
                    size="sm"
                    className="mt-4"
                  />
                ) : null}
                {booking.status !== 'Cancelled' ? (
                  canEdit ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => setEditTarget(booking)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => setDateTarget(booking)}
                      >
                        Change date
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => setHistoryTarget(booking)}
                      >
                        History
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-900"
                        onClick={() => handleCancel(booking.code, booking.date)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-col gap-2">
                      <p className="text-center text-xs font-medium text-teal-900/45">
                        Changes closed for this date
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 w-full"
                        onClick={() => setHistoryTarget(booking)}
                      >
                        History
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => setRebookTarget(booking)}
                    >
                      Rebook
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => setHistoryTarget(booking)}
                    >
                      History
                    </Button>
                  </div>
                )}
              </Surface>
            )
          })
        )}
      </div>

      <Surface className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 text-teal-800/50">Booking Number</TableHead>
              <TableHead className="text-teal-800/50">Date</TableHead>
              <TableHead className="text-teal-800/50">Program</TableHead>
              {showAgent ? <TableHead className="text-teal-800/50">Agent</TableHead> : null}
              <TableHead className="text-teal-800/50">Lead Guest</TableHead>
              <TableHead className="text-teal-800/50">Total Pax</TableHead>
              <TableHead className="text-teal-800/50">Pickup</TableHead>
              <TableHead className="text-teal-800/50">Voucher</TableHead>
              <TableHead className="px-4 text-teal-800/50">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showAgent ? 9 : 8}
                  className="px-4 py-10 text-center text-teal-900/50"
                >
                  No bookings yet.
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((booking) => (
                <TableRow
                  key={booking.code}
                  className={cn(
                    'hover:bg-teal-950/[0.02]',
                    booking.status === 'Cancelled' && 'bg-rose-50/70 text-rose-900/80',
                  )}
                >
                  <TableCell
                    className={cn(
                      'px-4 font-mono text-[13px] font-medium',
                      booking.status === 'Cancelled' &&
                        'text-rose-800 line-through decoration-rose-300',
                    )}
                  >
                    {slug ? (
                      <Link href={`/agent/${slug}/voucher/${booking.code}`} className="hover:underline">
                        {booking.code}
                      </Link>
                    ) : (
                      booking.code
                    )}
                  </TableCell>
                  <TableCell>{formatShortDate(booking.date)}</TableCell>
                  <TableCell>{booking.program}</TableCell>
                  {showAgent ? <TableCell>{booking.agentName}</TableCell> : null}
                  <TableCell className="font-medium">{booking.leadGuest}</TableCell>
                  <TableCell>{totalPassengers(booking)}</TableCell>
                  <TableCell>
                    {booking.pickupZone}
                    {booking.pickupTime ? ` · ${booking.pickupTime}` : ''}
                  </TableCell>
                  <TableCell>
                    {slug ? (
                      <VoucherShareActions
                        slug={slug}
                        code={booking.code}
                        guestName={booking.leadGuest}
                        size="sm"
                      />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="px-4">
                    <AgentStatusMenu
                      booking={booking}
                      onCancel={handleCancel}
                      onChangeDate={setDateTarget}
                      onRebook={setRebookTarget}
                      onEdit={setEditTarget}
                      onHistory={setHistoryTarget}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Surface>

      <ChangeBookingDateDialog
        booking={dateTarget}
        open={dateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDateTarget(null)
        }}
        actor={actor}
      />

      <ChangeBookingDateDialog
        booking={rebookTarget}
        open={rebookTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRebookTarget(null)
        }}
        mode="rebook"
        actor={actor}
      />

      <EditBookingDialog
        booking={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        actor={actor}
      />

      <BookingHistoryDialog
        booking={historyTarget}
        open={historyTarget !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryTarget(null)
        }}
      />
    </>
  )
}
