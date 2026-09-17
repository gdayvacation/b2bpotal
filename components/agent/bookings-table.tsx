'use client'

import Link from 'next/link'
import { usePortal } from '@/components/portal-provider'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState, PageHeader, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatShortDate } from '@/lib/format'
import { totalPassengers, type Booking } from '@/lib/types'
import { cn } from '@/lib/utils'

export function BookingsTable({
  bookings,
  slug,
  showAgent = false,
}: {
  bookings: Booking[]
  slug?: string
  showAgent?: boolean
}) {
  const { cancelBooking, isCancelOpen } = usePortal()

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
    const result = cancelBooking(code)
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
          bookings.map((booking) => (
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
              {booking.status !== 'Cancelled' ? (
                isCancelOpen(booking.date) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4 h-9 w-full border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-900"
                    onClick={() => handleCancel(booking.code, booking.date)}
                  >
                    Cancel booking
                  </Button>
                ) : (
                  <p className="mt-4 text-center text-xs font-medium text-teal-900/45">
                    Cancel closed for this date
                  </p>
                )
              ) : null}
            </Surface>
          ))
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
              <TableHead className="text-teal-800/50">Status</TableHead>
              <TableHead className="px-4 text-right text-teal-800/50">Actions</TableHead>
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
                    <StatusBadge status={booking.status} />
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    {booking.status !== 'Cancelled' ? (
                      isCancelOpen(booking.date) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-rose-700 hover:bg-rose-50 hover:text-rose-900"
                          onClick={() => handleCancel(booking.code, booking.date)}
                        >
                          Cancel
                        </Button>
                      ) : (
                        <span className="text-xs font-medium text-teal-900/40">Cancel closed</span>
                      )
                    ) : (
                      <span className="text-xs font-medium text-rose-700/70">Cancelled</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Surface>
    </>
  )
}
