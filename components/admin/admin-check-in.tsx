'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  QrCode,
  RefreshCw,
  Users,
} from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  enrolledSeatCount,
  guestDisplayName,
  type CheckInEnrollment,
} from '@/lib/check-in-enrollment'
import {
  formatIncludeShort,
  formatLongDate,
  formatShortDate,
  parseCashOnTourAmount,
} from '@/lib/format'
import { usePortalTodayISO } from '@/lib/use-portal-today'
import {
  listVanNumbers,
  primaryVan,
  sortOrderOnVan,
} from '@/lib/vehicle-assign'
import { cn } from '@/lib/utils'
import {
  isActiveBooking,
  isNoTransfer,
  totalPassengers,
  type Booking,
  type Program,
} from '@/lib/types'

type AdminTab = 'qr' | 'today'

type GuestLineStatus = 'checked' | 'waiting' | 'no-show'

type GuestLine = {
  key: string
  booking: Booking
  slot: number
  guestName: string
  nationality: string
  birthday: string
  passportNumber: string
  checkedInAt: string
  status: GuestLineStatus
}

type DriverGroup = {
  id: string
  van: number | null
  driver: string
  plate: string
  phone: string
  lines: GuestLine[]
  checked: number
  waiting: number
  noShow: number
}

function programLabel(program: Program) {
  return program === 'PP' ? 'Phi Phi' : 'James Bond'
}

function expandGuestLines(
  booking: Booking,
  enrollments: CheckInEnrollment[],
  attendance: 'checked' | 'no-show' | null,
): GuestLine[] {
  const seats = Math.max(1, totalPassengers(booking))
  const filled: Array<{
    guestName: string
    nationality: string
    birthday: string
    passportNumber: string
    checkedInAt: string
  }> = []

  for (const enrollment of enrollments) {
    const name = guestDisplayName(enrollment)
    for (let i = 0; i < enrollment.seats; i += 1) {
      filled.push({
        guestName: i === 0 ? name : name ? `${name} (party)` : '',
        nationality: enrollment.nationality,
        birthday: enrollment.birthday,
        passportNumber: enrollment.passportNumber,
        checkedInAt: enrollment.checkedInAt,
      })
    }
  }

  const enrolled = enrolledSeatCount(enrollments)
  const fullyChecked =
    attendance === 'checked' || enrolled >= seats

  return Array.from({ length: seats }, (_, slot) => {
    const filledRow = filled[slot]
    if (attendance === 'no-show') {
      return {
        key: `${booking.code}-${slot}`,
        booking,
        slot,
        guestName: filledRow?.guestName || (slot === 0 ? booking.leadGuest : ''),
        nationality: filledRow?.nationality || '',
        birthday: filledRow?.birthday || '',
        passportNumber: filledRow?.passportNumber || '',
        checkedInAt: filledRow?.checkedInAt || '',
        status: 'no-show' as const,
      }
    }
    if (filledRow) {
      return {
        key: `${booking.code}-${slot}`,
        booking,
        slot,
        guestName: filledRow.guestName,
        nationality: filledRow.nationality,
        birthday: filledRow.birthday,
        passportNumber: filledRow.passportNumber,
        checkedInAt: filledRow.checkedInAt,
        status: 'checked' as const,
      }
    }
    return {
      key: `${booking.code}-${slot}`,
      booking,
      slot,
      guestName: slot === 0 && fullyChecked ? booking.leadGuest : '',
      nationality: '',
      birthday: '',
      passportNumber: '',
      checkedInAt: '',
      status: fullyChecked ? ('checked' as const) : ('waiting' as const),
    }
  })
}

function formatCheckInTime(iso: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  })
}

export function AdminCheckIn() {
  const today = usePortalTodayISO()
  const [tab, setTab] = useState<AdminTab>('qr')
  const [programFilter, setProgramFilter] = useState<'all' | Program>('all')
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const checkInUrl = origin ? `${origin}/check-in` : '/check-in'
  const qrSrc = origin
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(checkInUrl)}`
    : ''

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(checkInUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="gday-soft-label">Marina</p>
          <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight text-teal-950 sm:text-3xl">
            Guest check-in
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-teal-950/55">
            QR for guests, plus today&apos;s live board grouped by driver — one line per guest with
            check-in status.
          </p>
        </div>
        <p className="text-sm font-medium text-teal-900/50">{formatLongDate(today)}</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-teal-950/[0.04] p-1 sm:inline-grid sm:w-auto">
        <TabButton active={tab === 'qr'} onClick={() => setTab('qr')} icon={<QrCode className="size-3.5" />}>
          QR code
        </TabButton>
        <TabButton
          active={tab === 'today'}
          onClick={() => setTab('today')}
          icon={<Users className="size-3.5" />}
        >
          Today&apos;s board
        </TabButton>
      </div>

      {tab === 'qr' ? (
        <QrTab
          today={today}
          checkInUrl={checkInUrl}
          qrSrc={qrSrc}
          copied={copied}
          onCopy={copyLink}
        />
      ) : (
        <TodayBoardTab
          today={today}
          programFilter={programFilter}
          onProgramFilter={setProgramFilter}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all',
        active ? 'bg-white text-teal-950 shadow-sm' : 'text-teal-900/55 hover:text-teal-950',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function QrTab({
  today,
  checkInUrl,
  qrSrc,
  copied,
  onCopy,
}: {
  today: string
  checkInUrl: string
  qrSrc: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="gday-sheet flex flex-col items-center rounded-[1.5rem] p-6 text-center">
          <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-teal-950/[0.05] text-teal-800">
            <QrCode className="size-5" />
          </div>
          <p className="text-sm font-semibold text-teal-950">Guest QR code</p>
          <p className="mt-1 text-xs text-teal-900/45">Opens the public check-in flow</p>
          <div className="mt-5 rounded-2xl bg-white p-3 ring-1 ring-teal-900/8">
            {qrSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrSrc}
                alt="QR code linking to guest check-in"
                width={260}
                height={260}
                className="size-[min(100%,260px)]"
              />
            ) : (
              <div className="flex size-[260px] items-center justify-center text-sm text-teal-900/40">
                Preparing QR…
              </div>
            )}
          </div>
          <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={onCopy}>
              {copied ? <CheckCircle2 data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Link
              href="/check-in"
              target="_blank"
              className="inline-flex h-8 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-teal-900/12 bg-white/80 px-2.5 text-[0.8rem] font-medium text-teal-950 transition-colors hover:bg-teal-950/[0.04]"
            >
              <ExternalLink className="size-3.5" />
              Open guest page
            </Link>
          </div>
          <p className="mt-3 break-all text-[11px] text-teal-900/40">{checkInUrl}</p>
        </div>

        <div className="space-y-4">
          <div className="gday-sheet rounded-[1.5rem] p-5">
            <div className="mb-3 flex items-center gap-2">
              <BrandMark />
            </div>
            <h2 className="font-display text-lg font-semibold text-teal-950">How guests check in</h2>
            <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-teal-950/65">
              <li>
                <span className="font-semibold text-teal-950">1.</span> Scan QR → date is{' '}
                {formatShortDate(today)}
              </li>
              <li>
                <span className="font-semibold text-teal-950">2.</span> Choose Phi Phi or James Bond
              </li>
              <li>
                <span className="font-semibold text-teal-950">3.</span> Find booking by van number or
                hotel, then leader / guest name
              </li>
              <li>
                <span className="font-semibold text-teal-950">4.</span> Check in 1 person or whole
                group (group = details for every guest)
              </li>
              <li>
                <span className="font-semibold text-teal-950">5.</span> Enter name, nationality,
                birthday, passport → confirm park / canoe / COT
              </li>
              <li>
                <span className="font-semibold text-teal-950">6.</span>{' '}
                <span className="text-emerald-700">Green</span> = done, no payment ·{' '}
                <span className="text-orange-600">Orange</span> = contact staff to pay
              </li>
            </ol>
          </div>

          <div className="gday-sheet rounded-[1.5rem] p-5">
            <h2 className="font-display text-lg font-semibold text-teal-950">Also available</h2>
            <ul className="mt-3 space-y-2 text-sm text-teal-950/65">
              <li>
                Printable marina sheet:{' '}
                <Link
                  href="/admin/reports"
                  className="font-semibold text-teal-800 underline-offset-2 hover:underline"
                >
                  Report → Check in
                </Link>
              </li>
              <li>Use the Today&apos;s board tab to watch live guest check-in by driver.</li>
            </ul>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              <RefreshCw data-icon="inline-start" />
              Refresh QR
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TodayBoardTab({
  today,
  programFilter,
  onProgramFilter,
}: {
  today: string
  programFilter: 'all' | Program
  onProgramFilter: (value: 'all' | Program) => void
}) {
  const {
    bookings,
    getDayVehiclePlan,
    resolveVanMeta,
    getCheckInEnrollments,
    getCheckInAttendance,
    hydrated,
  } = usePortal()

  const dayBookings = useMemo(
    () =>
      bookings
        .filter((booking) => booking.date === today && isActiveBooking(booking))
        .filter((booking) => (programFilter === 'all' ? true : booking.program === programFilter))
        .slice()
        .sort(
          (a, b) =>
            a.program.localeCompare(b.program) ||
            a.leadGuest.localeCompare(b.leadGuest) ||
            a.code.localeCompare(b.code),
        ),
    [bookings, programFilter, today],
  )

  const groups = useMemo(() => {
    const programs: Program[] =
      programFilter === 'all' ? ['PP', 'James Bond'] : [programFilter]
    const result: DriverGroup[] = []

    for (const program of programs) {
      const programBookings = dayBookings.filter((b) => b.program === program)
      if (programBookings.length === 0) continue
      const plan = getDayVehiclePlan(today, program)
      const transfer = programBookings.filter((b) => !isNoTransfer(b.pickupZone))
      const noTransfer = programBookings.filter((b) => isNoTransfer(b.pickupZone))
      const vanNums = listVanNumbers(plan.assignments)

      for (const van of vanNums) {
        const vanBookings = transfer
          .filter((b) => primaryVan(plan.assignments[b.code]) === van)
          .sort(
            (a, b) =>
              sortOrderOnVan(plan.assignments[a.code], van) -
                sortOrderOnVan(plan.assignments[b.code], van) ||
              a.leadGuest.localeCompare(b.leadGuest),
          )
        if (vanBookings.length === 0) continue
        const meta = resolveVanMeta(van, plan.vanMeta[String(van)])
        result.push(
          makeDriverGroup(
            `${program}-van-${van}`,
            van,
            meta.driver,
            meta.plate,
            meta.phone,
            vanBookings,
            today,
            getCheckInEnrollments,
            getCheckInAttendance,
          ),
        )
      }

      const unassigned = transfer.filter((b) => primaryVan(plan.assignments[b.code]) === null)
      if (unassigned.length > 0) {
        result.push(
          makeDriverGroup(
            `${program}-unassigned`,
            null,
            '',
            '',
            '',
            unassigned,
            today,
            getCheckInEnrollments,
            getCheckInAttendance,
          ),
        )
      }

      if (noTransfer.length > 0) {
        result.push(
          makeDriverGroup(
            `${program}-no-transfer`,
            null,
            '',
            '',
            '',
            noTransfer,
            today,
            getCheckInEnrollments,
            getCheckInAttendance,
          ),
        )
      }
    }

    return result
  }, [
    dayBookings,
    getCheckInAttendance,
    getCheckInEnrollments,
    getDayVehiclePlan,
    programFilter,
    resolveVanMeta,
    today,
  ])

  const summary = useMemo(() => {
    let checked = 0
    let waiting = 0
    let noShow = 0
    for (const group of groups) {
      checked += group.checked
      waiting += group.waiting
      noShow += group.noShow
    }
    return { checked, waiting, noShow, total: checked + waiting + noShow }
  }, [groups])

  if (!hydrated) {
    return (
      <div className="gday-sheet rounded-[1.5rem] p-8 text-center text-sm text-teal-900/50">
        Loading today&apos;s check-in…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-teal-950/[0.04] p-1">
          {(
            [
              ['all', 'All programs'],
              ['PP', 'Phi Phi'],
              ['James Bond', 'James Bond'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onProgramFilter(value)}
              className={cn(
                'rounded-xl px-3 py-2 text-sm font-semibold transition-all',
                programFilter === value
                  ? 'bg-white text-teal-950 shadow-sm'
                  : 'text-teal-900/55 hover:text-teal-950',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <StatPill tone="emerald" label="Checked in" value={summary.checked} />
          <StatPill tone="amber" label="Waiting" value={summary.waiting} />
          <StatPill tone="rose" label="No-show" value={summary.noShow} />
          <StatPill tone="teal" label="Total seats" value={summary.total} />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="gday-sheet rounded-[1.5rem] p-8 text-center text-sm text-teal-900/55">
          No active bookings for {formatLongDate(today)}
          {programFilter === 'all' ? '' : ` · ${programLabel(programFilter)}`}.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <DriverGroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}

function makeDriverGroup(
  id: string,
  van: number | null,
  driver: string,
  plate: string,
  phone: string,
  bookings: Booking[],
  today: string,
  getEnrollments: ReturnType<typeof usePortal>['getCheckInEnrollments'],
  getAttendance: ReturnType<typeof usePortal>['getCheckInAttendance'],
): DriverGroup {
  const lines = bookings.flatMap((booking) =>
    expandGuestLines(
      booking,
      getEnrollments(today, booking.program, booking.code),
      getAttendance(today, booking.program, booking.code),
    ),
  )
  return {
    id,
    van,
    driver,
    plate,
    phone,
    lines,
    checked: lines.filter((line) => line.status === 'checked').length,
    waiting: lines.filter((line) => line.status === 'waiting').length,
    noShow: lines.filter((line) => line.status === 'no-show').length,
  }
}

function DriverGroupCard({ group }: { group: DriverGroup }) {
  const title =
    group.van === null
      ? group.id.includes('no-transfer')
        ? 'No Transfer'
        : 'Unassigned / no van'
      : `Van ${group.van}`

  return (
    <div className="gday-sheet overflow-hidden rounded-[1.5rem]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/8 bg-teal-50/70 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-teal-950">{title}</p>
          {group.van !== null ? (
            <p className="mt-0.5 text-xs text-teal-900/60">
              Driver: <span className="font-medium text-teal-950">{group.driver || '—'}</span>
              <span className="mx-1.5 text-teal-900/25">·</span>
              Tel: <span className="font-medium text-teal-950">{group.phone || '—'}</span>
              <span className="mx-1.5 text-teal-900/25">·</span>
              Plate: <span className="font-medium text-teal-950">{group.plate || '—'}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-teal-900/55">
              Guests without a van assignment or with no hotel transfer.
            </p>
          )}
        </div>
        <p className="text-xs font-medium tabular-nums text-teal-800/60">
          {group.checked}/{group.lines.length} checked in
          {group.waiting > 0 ? ` · ${group.waiting} waiting` : ''}
        </p>
      </div>

      <div className="overflow-x-auto">
        <Table className="min-w-[920px] text-[13px]">
          <TableHeader>
            <TableRow className="border-b border-teal-900/15 bg-teal-950/[0.03] hover:bg-teal-950/[0.03]">
              <TableHead className="w-10 text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                No.
              </TableHead>
              <TableHead className="text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Guest
              </TableHead>
              <TableHead className="w-[9%] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Nationality
              </TableHead>
              <TableHead className="w-[9%] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Birthday
              </TableHead>
              <TableHead className="w-[10%] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Passport
              </TableHead>
              <TableHead className="text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Hotel
              </TableHead>
              <TableHead className="w-[9%] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                VC No.
              </TableHead>
              <TableHead className="w-[8%] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Program
              </TableHead>
              <TableHead className="w-[5%] text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Park
              </TableHead>
              <TableHead className="w-[5%] text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Canoe
              </TableHead>
              <TableHead className="w-[7%] text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                COT
              </TableHead>
              <TableHead className="w-[10%] text-center text-[11px] font-bold tracking-wide text-teal-900/80 uppercase">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.lines.map((line, index) => (
              <TableRow
                key={line.key}
                className={cn(
                  line.status === 'checked' && 'bg-emerald-50/40',
                  line.status === 'waiting' && 'bg-amber-50/30',
                  line.status === 'no-show' && 'bg-rose-50/40',
                )}
              >
                <TableCell className="tabular-nums text-teal-900/45">{index + 1}</TableCell>
                <TableCell>
                  <div className="font-medium text-teal-950">
                    {line.guestName || (
                      <span className="font-normal text-teal-900/35">Waiting for name…</span>
                    )}
                  </div>
                  {line.status === 'checked' && line.checkedInAt ? (
                    <p className="mt-0.5 text-[11px] text-teal-900/45">
                      {formatCheckInTime(line.checkedInAt)}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-teal-900/70">{line.nationality || '—'}</TableCell>
                <TableCell className="text-teal-900/70">
                  {line.birthday ? formatShortDate(line.birthday) : '—'}
                </TableCell>
                <TableCell className="font-mono text-xs text-teal-900/70">
                  {line.passportNumber || '—'}
                </TableCell>
                <TableCell className="text-teal-900/80">
                  {line.booking.pickupHotel || line.booking.pickupZone || '—'}
                </TableCell>
                <TableCell className="font-medium tabular-nums text-teal-950">
                  {line.booking.code}
                </TableCell>
                <TableCell>{programLabel(line.booking.program)}</TableCell>
                <TableCell className="text-center text-teal-900/70">
                  {formatIncludeShort(line.booking.parkFee)}
                </TableCell>
                <TableCell className="text-center text-teal-900/70">
                  {line.booking.program === 'James Bond'
                    ? formatIncludeShort(line.booking.canoe)
                    : '—'}
                </TableCell>
                <TableCell className="text-teal-900/80">
                  {line.booking.cashOnTour.trim()
                    ? parseCashOnTourAmount(line.booking.cashOnTour) > 0
                      ? parseCashOnTourAmount(line.booking.cashOnTour).toLocaleString('en-US')
                      : line.booking.cashOnTour
                    : '—'}
                </TableCell>
                <TableCell className="text-center">
                  <StatusBadge status={line.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: GuestLineStatus }) {
  if (status === 'checked') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
        <CheckCircle2 className="size-3" />
        Checked in
      </span>
    )
  }
  if (status === 'no-show') {
    return (
      <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
        No-show
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
      <Clock3 className="size-3" />
      Waiting
    </span>
  )
}

function StatPill({
  tone,
  label,
  value,
}: {
  tone: 'emerald' | 'amber' | 'rose' | 'teal'
  label: string
  value: number
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200/70',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200/70',
    rose: 'bg-rose-50 text-rose-800 ring-rose-200/70',
    teal: 'bg-teal-50 text-teal-800 ring-teal-200/70',
  }
  return (
    <span className={cn('rounded-full px-2.5 py-1 ring-1', tones[tone])}>
      {label} <span className="tabular-nums">{value}</span>
    </span>
  )
}
