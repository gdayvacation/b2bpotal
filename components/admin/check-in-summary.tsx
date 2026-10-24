'use client'

import { useMemo } from 'react'
import {
  Bus,
  CheckCircle2,
  Clock3,
  Ship,
  Ticket,
  UserRoundX,
  Users,
  Wallet,
  Waves,
} from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { boatThemeFor } from '@/lib/boat-theme'
import { originalBookedPax } from '@/lib/check-in-booked-pax'
import { getArrivedPaxSnapshot } from '@/lib/check-in-arrived-pax'
import { enrolledSeatCount } from '@/lib/check-in-enrollment'
import {
  checkInServiceLabel,
  serviceLineTotal,
  type CheckInServiceKind,
} from '@/lib/check-in-services'
import { collectTotal, formatShortDate } from '@/lib/format'
import {
  boatDisplayName,
  boatNumbersForPlan,
  isActiveBooking,
  isPartnerBoat,
  normalizeBoatAssignment,
  type Booking,
  type Program,
  type VanSplit,
} from '@/lib/types'
import {
  addPaxBreakdown,
  allocatePaxBreakdown,
  emptyPaxBreakdown,
  paxBreakdownTotal,
  takePaxBreakdown,
  type PaxBreakdown,
} from '@/lib/vehicle-assign'
import { cn } from '@/lib/utils'

const PAX_TYPES = [
  { key: 'adults', label: 'AD' },
  { key: 'children', label: 'CH' },
  { key: 'infants', label: 'INF' },
  { key: 'tourLeaders', label: 'TL' },
] as const

function asPax(row: {
  adults: number
  children: number
  infants: number
  tourLeaders: number
}): PaxBreakdown {
  return {
    adults: row.adults,
    children: row.children,
    infants: row.infants,
    tourLeaders: row.tourLeaders,
  }
}

function minusMoved(booked: PaxBreakdown, booking: Booking): PaxBreakdown {
  const moved = booking.movedOutPax
  if (!moved) return booked
  return {
    adults: Math.max(0, booked.adults - moved.adults),
    children: Math.max(0, booked.children - moved.children),
    infants: Math.max(0, booked.infants - moved.infants),
    tourLeaders: Math.max(0, booked.tourLeaders - moved.tourLeaders),
  }
}

function legsFor(
  assignment: Parameters<typeof normalizeBoatAssignment>[0],
  total: number,
): VanSplit[] {
  return normalizeBoatAssignment(assignment, total).map((leg, index) => ({
    van: leg.boat,
    pax: leg.pax,
    sortOrder: index,
  }))
}

type BoatSummary = {
  key: string
  program: Program
  boat: number
  name: string
  colorName: string
  hex: string
  partner: boolean
  capacity: number
  guide: string
  arranged: PaxBreakdown
  checked: PaxBreakdown
}

type ServiceSummary = {
  kind: CheckInServiceKind
  people: number
  bookings: number
  total: number
  paidPeople: number
  unpaidPeople: number
  unpaidTotal: number
}

export function CheckInSummary({
  date,
  programFilter,
  revision = 0,
}: {
  date: string
  programFilter: 'all' | Program
  /** Bumps when marina staff save an arrived guest mix. */
  revision?: number
}) {
  const {
    bookings,
    getDayBoatPlan,
    getCheckInEnrollments,
    getCheckInAttendance,
    getCheckInServices,
    getJobOrderAction,
  } = usePortal()

  const model = useMemo(() => {
    const programs: Program[] = programFilter === 'all' ? ['PP', 'James Bond'] : [programFilter]
    const dayBookings = bookings.filter(
      (booking) =>
        booking.date === date &&
        isActiveBooking(booking) &&
        (programFilter === 'all' || booking.program === programFilter),
    )

    let booked = emptyPaxBreakdown()
    let pickedUp = emptyPaxBreakdown()
    let checkedIn = emptyPaxBreakdown()
    let noShow = emptyPaxBreakdown()
    let stillToPickUp = emptyPaxBreakdown()
    let waitingCheckIn = emptyPaxBreakdown()
    let noBoat = emptyPaxBreakdown()
    let partner = emptyPaxBreakdown()
    let toCollect = 0
    let bookingCount = 0
    let checkedWithoutPickup = 0

    const boats = new Map<string, BoatSummary>()
    const services = new Map<CheckInServiceKind, ServiceSummary>()

    for (const program of programs) {
      const plan = getDayBoatPlan(date, program)
      for (const boat of boatNumbersForPlan(plan)) {
        const theme = boatThemeFor(plan, boat)
        const partnerBoat = isPartnerBoat(plan, boat)
        boats.set(`${program}-${boat}`, {
          key: `${program}-${boat}`,
          program,
          boat,
          name: boatDisplayName(plan, boat),
          colorName: partnerBoat ? 'Partner' : theme.colorName,
          hex: theme.printHex,
          partner: partnerBoat,
          capacity: plan.capacities[boat - 1] ?? 0,
          guide: plan.guides?.[boat - 1]?.guideName?.trim() || '',
          arranged: emptyPaxBreakdown(),
          checked: emptyPaxBreakdown(),
        })
      }
    }

    for (const booking of dayBookings) {
      const plan = getDayBoatPlan(date, booking.program)
      const bookedPax = minusMoved(asPax(originalBookedPax(date, booking.program, booking)), booking)
      const arrived = getArrivedPaxSnapshot(date, booking.program, booking.code)
      const live = arrived
        ? asPax(arrived)
        : asPax(booking)
      const attendance = getCheckInAttendance(date, booking.program, booking.code)
      const pickupAction = getJobOrderAction(date, booking.program, booking.code)
      const wholeNoShow = attendance === 'no-show' || pickupAction === 'no-show'
      const enrolled = Math.min(
        enrolledSeatCount(getCheckInEnrollments(date, booking.program, booking.code)),
        paxBreakdownTotal(wholeNoShow ? bookedPax : live),
      )
      const markedPickup = pickupAction === 'picked-up' || Boolean(arrived)

      booked = addPaxBreakdown(booked, bookedPax)
      bookingCount += 1

      if (wholeNoShow) {
        noShow = addPaxBreakdown(noShow, bookedPax)
        continue
      }

      const partialMiss = {
        adults: Math.max(0, bookedPax.adults - live.adults),
        children: Math.max(0, bookedPax.children - live.children),
        infants: Math.max(0, bookedPax.infants - live.infants),
        tourLeaders: Math.max(0, bookedPax.tourLeaders - live.tourLeaders),
      }
      noShow = addPaxBreakdown(noShow, partialMiss)

      if (markedPickup) pickedUp = addPaxBreakdown(pickedUp, live)
      else stillToPickUp = addPaxBreakdown(stillToPickUp, live)

      const checkedSlice = takePaxBreakdown(live, enrolled)
      checkedIn = addPaxBreakdown(checkedIn, checkedSlice)
      const notIn = {
        adults: Math.max(0, live.adults - checkedSlice.adults),
        children: Math.max(0, live.children - checkedSlice.children),
        infants: Math.max(0, live.infants - checkedSlice.infants),
        tourLeaders: Math.max(0, live.tourLeaders - checkedSlice.tourLeaders),
      }
      waitingCheckIn = addPaxBreakdown(waitingCheckIn, notIn)
      if (!markedPickup && enrolled > 0) checkedWithoutPickup += enrolled

      toCollect += collectTotal(
        booking.parkFee,
        booking.program,
        live.adults,
        live.children,
        booking.cashOnTour,
      )

      const arrangedPax = asPax(booking)
      const marinaPax = arrived ? asPax(arrived) : null
      const checkInPax =
        marinaPax ?? (enrolled > 0 ? takePaxBreakdown(arrangedPax, enrolled) : emptyPaxBreakdown())
      const legs = legsFor(
        plan.assignments[booking.code],
        Math.max(paxBreakdownTotal(arrangedPax), paxBreakdownTotal(checkInPax)),
      )
      if (legs.length === 0) {
        noBoat = addPaxBreakdown(noBoat, live)
      }

      for (const boat of boatNumbersForPlan(plan)) {
        const row = boats.get(`${booking.program}-${boat}`)
        if (!row) continue
        const arranged = allocatePaxBreakdown(arrangedPax, legs, boat)
        const checkedOnBoat = allocatePaxBreakdown(checkInPax, legs, boat)
        if (paxBreakdownTotal(arranged) === 0 && paxBreakdownTotal(checkedOnBoat) === 0) continue
        row.arranged = addPaxBreakdown(row.arranged, arranged)
        row.checked = addPaxBreakdown(row.checked, checkedOnBoat)
        if (row.partner) partner = addPaxBreakdown(partner, arranged)
      }

      for (const line of getCheckInServices(date, booking.program, booking.code)) {
        const current = services.get(line.kind) ?? {
          kind: line.kind,
          people: 0,
          bookings: 0,
          total: 0,
          paidPeople: 0,
          unpaidPeople: 0,
          unpaidTotal: 0,
        }
        const amount = serviceLineTotal(line)
        current.people += line.people
        current.bookings += 1
        current.total += amount
        if (line.paid) current.paidPeople += line.people
        else {
          current.unpaidPeople += line.people
          current.unpaidTotal += amount
        }
        services.set(line.kind, current)
      }
    }

    const boatRows = [...boats.values()].filter(
      (row) =>
        !row.partner ||
        paxBreakdownTotal(row.arranged) > 0 ||
        paxBreakdownTotal(row.checked) > 0,
    )
    const serviceRows = (['share-longtail', 'private-longtail', 'scuba'] as const)
      .map((kind) => services.get(kind))
      .filter((row): row is ServiceSummary => Boolean(row && row.people > 0))

    return {
      programs,
      bookingCount,
      booked,
      pickedUp,
      checkedIn,
      noShow,
      stillToPickUp,
      waitingCheckIn,
      noBoat,
      partner,
      toCollect,
      checkedWithoutPickup,
      boatRows,
      serviceRows,
      servicePeople: serviceRows.reduce((sum, row) => sum + row.people, 0),
      serviceTotal: serviceRows.reduce((sum, row) => sum + row.total, 0),
      serviceUnpaid: serviceRows.reduce((sum, row) => sum + row.unpaidTotal, 0),
    }
  }, [
    bookings,
    date,
    getCheckInAttendance,
    getCheckInEnrollments,
    getCheckInServices,
    getDayBoatPlan,
    getJobOrderAction,
    programFilter,
    revision,
  ])

  const seatsLeft = model.boatRows
    .filter((row) => !row.partner)
    .reduce((sum, row) => sum + Math.max(0, row.capacity - paxBreakdownTotal(row.arranged)), 0)

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-teal-900/10 bg-white shadow-sm shadow-teal-950/5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-teal-900/8 bg-gradient-to-r from-teal-50/90 to-white px-4 py-4 sm:px-5">
        <div>
          <p className="text-[11px] font-bold tracking-[0.16em] text-teal-700/60 uppercase">
            Daily check-in
          </p>
          <h2 className="font-display mt-0.5 text-xl font-semibold tracking-tight text-teal-950">
            Check-in summary
          </h2>
          <p className="mt-1 text-sm text-teal-900/55">
            {formatShortDate(date)}
            {programFilter === 'all' ? ' · All programs' : programFilter === 'PP' ? ' · Phi Phi' : ' · James Bond'}
            {' · '}
            {model.bookingCount} booking{model.bookingCount === 1 ? '' : 's'}
          </p>
        </div>
        <p className="text-sm font-medium text-teal-900/70">
          {paxBreakdownTotal(model.booked)} booked
          <span className="mx-1.5 text-teal-900/25">→</span>
          {paxBreakdownTotal(model.pickedUp)} picked up
          <span className="mx-1.5 text-teal-900/25">→</span>
          {paxBreakdownTotal(model.checkedIn)} checked in
        </p>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <FlowCard
            tone="sky"
            icon={Users}
            label="Booked"
            hint="On this date, after guests moved to another day"
            pax={model.booked}
          />
          <FlowCard
            tone="amber"
            icon={Bus}
            label="Picked up"
            hint="Driver marked picked up, or arrival was recorded"
            pax={model.pickedUp}
          />
          <FlowCard
            tone="emerald"
            icon={CheckCircle2}
            label="Checked in"
            hint="Names recorded at the marina"
            pax={model.checkedIn}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat icon={UserRoundX} label="No-show" value={paxBreakdownTotal(model.noShow)} detail={paxLine(model.noShow)} tone="rose" />
          <MiniStat icon={Clock3} label="Still to pick up" value={paxBreakdownTotal(model.stillToPickUp)} detail={paxLine(model.stillToPickUp)} tone="amber" />
          <MiniStat icon={Ticket} label="Waiting check-in" value={paxBreakdownTotal(model.waitingCheckIn)} detail={paxLine(model.waitingCheckIn)} tone="sky" />
          <MiniStat icon={Wallet} label="To collect" value={model.toCollect > 0 ? model.toCollect.toLocaleString('en-US') : '0'} detail="Park fee + cash on tour" tone="teal" />
        </div>

        {model.checkedWithoutPickup > 0 || paxBreakdownTotal(model.noBoat) > 0 || paxBreakdownTotal(model.partner) > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {model.checkedWithoutPickup > 0 ? (
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-orange-800 ring-1 ring-orange-200/80">
                {model.checkedWithoutPickup} checked in, pickup not marked
              </span>
            ) : null}
            {paxBreakdownTotal(model.noBoat) > 0 ? (
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-800 ring-1 ring-violet-200/80">
                {paxBreakdownTotal(model.noBoat)} not on a boat yet
              </span>
            ) : null}
            {paxBreakdownTotal(model.partner) > 0 ? (
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 ring-1 ring-neutral-200">
                {paxBreakdownTotal(model.partner)} sent to a partner boat
              </span>
            ) : null}
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-end justify-between gap-3">
            <h3 className="text-sm font-semibold text-teal-950">Boats</h3>
            <p className="text-xs font-medium text-teal-800/70">
              {seatsLeft} own-boat seat{seatsLeft === 1 ? '' : 's'} left
            </p>
          </div>
          {model.boatRows.length === 0 ? (
            <p className="rounded-2xl bg-teal-50/50 px-4 py-6 text-center text-sm text-teal-900/50">
              No boats on this day.
            </p>
          ) : (
            <div className="space-y-3">
              {model.programs.map((program) => {
                const rows = model.boatRows.filter((row) => row.program === program)
                if (rows.length === 0) return null
                return (
                  <BoatTable
                    key={program}
                    title={model.programs.length > 1 ? (program === 'PP' ? 'Phi Phi' : 'James Bond') : undefined}
                    rows={rows}
                  />
                )
              })}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-end justify-between gap-3">
            <h3 className="text-sm font-semibold text-teal-950">Adding services</h3>
            <p className="text-xs font-medium text-teal-800/70">
              {model.servicePeople} sold
              {model.serviceTotal > 0 ? ` · ${model.serviceTotal.toLocaleString('en-US')} THB` : ''}
              {model.serviceUnpaid > 0 ? ` · ${model.serviceUnpaid.toLocaleString('en-US')} not paid` : ''}
            </p>
          </div>
          {model.serviceRows.length === 0 ? (
            <p className="rounded-2xl bg-teal-50/40 px-4 py-5 text-sm text-teal-900/50">
              No scuba or longtail sold today.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {model.serviceRows.map((row) => (
                <ServiceCard key={row.kind} row={row} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function formatPaxEasy(pax: PaxBreakdown) {
  const parts: string[] = []
  if (pax.adults > 0) parts.push(`${pax.adults}AD`)
  if (pax.children > 0) parts.push(`${pax.children}CH`)
  if (pax.infants > 0) parts.push(`${pax.infants}INF`)
  if (pax.tourLeaders > 0) parts.push(`${pax.tourLeaders}TL`)
  return parts.length > 0 ? parts.join(' + ') : '—'
}

function paxLine(pax: PaxBreakdown) {
  return PAX_TYPES.map((type) => `${type.label} ${pax[type.key]}`).join(' · ')
}

function PaxChips({ pax }: { pax: PaxBreakdown }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PAX_TYPES.map((type) => (
        <span
          key={type.key}
          className="rounded-md bg-white/80 px-1.5 py-0.5 text-[11px] font-semibold text-teal-950 ring-1 ring-teal-900/10"
        >
          {type.label} <span className="tabular-nums">{pax[type.key]}</span>
        </span>
      ))}
    </div>
  )
}

function FlowCard({
  tone,
  icon: Icon,
  label,
  hint,
  pax,
}: {
  tone: 'sky' | 'amber' | 'emerald'
  icon: typeof Users
  label: string
  hint: string
  pax: PaxBreakdown
}) {
  const tones = {
    sky: 'from-sky-50 to-white text-sky-800 ring-sky-200/80',
    amber: 'from-amber-50 to-white text-amber-800 ring-amber-200/80',
    emerald: 'from-emerald-50 to-white text-emerald-800 ring-emerald-200/80',
  }
  return (
    <article className={cn('rounded-2xl bg-gradient-to-br p-4 ring-1', tones[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
          <Icon className="size-3.5" />
          {label}
        </p>
        <p className="font-display text-3xl font-semibold tracking-tight text-teal-950 tabular-nums">
          {paxBreakdownTotal(pax)}
        </p>
      </div>
      <div className="mt-3">
        <PaxChips pax={pax} />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-teal-900/50">{hint}</p>
    </article>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Users
  label: string
  value: number | string
  detail: string
  tone: 'rose' | 'amber' | 'sky' | 'teal'
}) {
  const tones = {
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-800',
    sky: 'bg-sky-50 text-sky-800',
    teal: 'bg-teal-50 text-teal-800',
  }
  return (
    <div className="rounded-2xl border border-teal-900/8 bg-white px-3 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-teal-900/50 uppercase">
        <span className={cn('inline-flex size-5 items-center justify-center rounded-full', tones[tone])}>
          <Icon className="size-3" />
        </span>
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-teal-950 tabular-nums">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-teal-900/45">{detail}</p>
    </div>
  )
}

function BoatTable({ title, rows }: { title?: string; rows: BoatSummary[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-teal-900/10">
      {title ? (
        <p className="border-b border-teal-900/8 bg-teal-50/70 px-3 py-2 text-[11px] font-bold tracking-[0.14em] text-teal-800/70 uppercase">
          {title}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-teal-900/10 bg-teal-950/[0.03] text-[11px] font-bold tracking-wide text-teal-900/55 uppercase">
              <th className="px-3 py-2 text-left font-bold">Boat</th>
              <th className="px-2 py-2 text-left font-bold">Guide</th>
              <th className="px-3 py-2 text-left font-bold">Arranged</th>
              <th className="px-3 py-2 text-left font-bold">Real check-in</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const checkInDiffers =
                row.arranged.adults !== row.checked.adults ||
                row.arranged.children !== row.checked.children ||
                row.arranged.infants !== row.checked.infants ||
                row.arranged.tourLeaders !== row.checked.tourLeaders
              return (
              <tr key={row.key} className="border-b border-teal-900/8 last:border-0">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: row.hex }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-teal-950">{row.name}</p>
                      <p className="text-[11px] text-teal-900/45">
                        {row.colorName}
                        {row.partner ? '' : ` · ${row.boat}`}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-teal-900/80">{row.guide || '—'}</td>
                <td className="px-3 py-2.5 font-medium whitespace-nowrap tabular-nums text-teal-950">
                  {formatPaxEasy(row.arranged)}
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 font-semibold whitespace-nowrap tabular-nums',
                    checkInDiffers ? 'text-rose-700' : 'text-emerald-800',
                  )}
                >
                  {formatPaxEasy(row.checked)}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ServiceCard({ row }: { row: ServiceSummary }) {
  const Icon = row.kind === 'scuba' ? Waves : row.kind === 'private-longtail' ? Ship : Users
  const tone =
    row.kind === 'scuba'
      ? 'bg-cyan-100 text-cyan-900'
      : row.kind === 'private-longtail'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-sky-100 text-sky-800'
  return (
    <article className="rounded-2xl border border-teal-900/10 bg-white p-3.5">
      <div className="flex items-center gap-2">
        <span className={cn('inline-flex size-8 items-center justify-center rounded-full', tone)}>
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-teal-950">{checkInServiceLabel(row.kind)}</p>
          <p className="text-[11px] text-teal-900/45">
            {row.bookings} booking{row.bookings === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-teal-950 tabular-nums">
        {row.people}
        <span className="ml-1 text-sm font-medium text-teal-900/45">
          {row.kind === 'private-longtail' ? 'boats' : 'people'}
        </span>
      </p>
      <p className="mt-1 text-xs font-medium text-teal-900/70 tabular-nums">
        {row.total.toLocaleString('en-US')} THB
      </p>
      <p className="mt-1 text-[11px] text-teal-900/50">
        Paid {row.paidPeople}
        {row.unpaidPeople > 0 ? ` · Not paid ${row.unpaidPeople} (${row.unpaidTotal.toLocaleString('en-US')})` : ''}
      </p>
    </article>
  )
}
