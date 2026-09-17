'use client'

import Link from 'next/link'
import { StatusBadge } from '@/components/status-badge'
import { PageHeader, Surface } from '@/components/ui-primitives'
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

export function BookingsTable({
  bookings,
  slug,
  showAgent = false,
}: {
  bookings: Booking[]
  slug?: string
  showAgent?: boolean
}) {
  return (
    <>
      <PageHeader
        title="My Bookings"
        description="All confirmed and pending pickup bookings for this agency."
      />

      <div className="space-y-3 md:hidden">
        {bookings.length === 0 ? (
          <Surface className="px-4 py-10 text-center text-sm text-teal-900/50">
            No bookings yet.
          </Surface>
        ) : (
          bookings.map((booking) => (
            <Surface key={booking.code} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {slug ? (
                    <Link
                      href={`/agent/${slug}/voucher/${booking.code}`}
                      className="font-mono text-sm font-semibold text-teal-900 hover:underline"
                    >
                      {booking.code}
                    </Link>
                  ) : (
                    <p className="font-mono text-sm font-semibold">{booking.code}</p>
                  )}
                  <p className="mt-1 text-sm text-teal-950/55">
                    {formatShortDate(booking.date)} · {booking.program}
                  </p>
                </div>
                <StatusBadge status={booking.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] font-medium tracking-wide text-teal-700/45 uppercase">
                    Lead guest
                  </p>
                  <p className="mt-0.5 font-medium">{booking.leadGuest}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium tracking-wide text-teal-700/45 uppercase">
                    Pax
                  </p>
                  <p className="mt-0.5 font-medium">{totalPassengers(booking)}</p>
                </div>
                {showAgent ? (
                  <div className="col-span-2">
                    <p className="text-[11px] font-medium tracking-wide text-teal-700/45 uppercase">
                      Agent
                    </p>
                    <p className="mt-0.5 font-medium">{booking.agentName}</p>
                  </div>
                ) : null}
                <div className="col-span-2">
                  <p className="text-[11px] font-medium tracking-wide text-teal-700/45 uppercase">
                    Pickup
                  </p>
                  <p className="mt-0.5 font-medium">
                    {booking.pickupZone}
                    {booking.pickupTime ? ` · ${booking.pickupTime}` : ''}
                  </p>
                </div>
              </div>
            </Surface>
          ))
        )}
      </div>

      <Surface className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 text-teal-700/45">Booking Number</TableHead>
              <TableHead className="text-teal-700/45">Date</TableHead>
              <TableHead className="text-teal-700/45">Program</TableHead>
              {showAgent ? <TableHead className="text-teal-700/45">Agent</TableHead> : null}
              <TableHead className="text-teal-700/45">Lead Guest</TableHead>
              <TableHead className="text-teal-700/45">Total Pax</TableHead>
              <TableHead className="text-teal-700/45">Pickup</TableHead>
              <TableHead className="text-teal-700/45">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showAgent ? 8 : 7}
                  className="px-4 py-10 text-center text-teal-900/50"
                >
                  No bookings yet.
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((booking) => (
                <TableRow key={booking.code}>
                  <TableCell className="px-4 font-mono text-[13px] font-medium">
                    {slug ? (
                      <Link
                        href={`/agent/${slug}/voucher/${booking.code}`}
                        className="hover:underline"
                      >
                        {booking.code}
                      </Link>
                    ) : (
                      booking.code
                    )}
                  </TableCell>
                  <TableCell>{formatShortDate(booking.date)}</TableCell>
                  <TableCell>{booking.program}</TableCell>
                  {showAgent ? <TableCell>{booking.agentName}</TableCell> : null}
                  <TableCell>{booking.leadGuest}</TableCell>
                  <TableCell>{totalPassengers(booking)}</TableCell>
                  <TableCell>
                    {booking.pickupZone}
                    {booking.pickupTime ? ` · ${booking.pickupTime}` : ''}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={booking.status} />
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
