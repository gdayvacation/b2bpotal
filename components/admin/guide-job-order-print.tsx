'use client'

import { Fragment } from 'react'
import { usePortal } from '@/components/portal-provider'
import { boatThemeFor } from '@/lib/boat-theme'
import { formatCheckInServicesOption, type CheckInServiceLine } from '@/lib/check-in-services'
import { formatLongDate } from '@/lib/format'
import {
  DEFAULT_BOAT_CAPACITY,
  boatDisplayName,
  boatNumbersForPlan,
  emptyBoatGuide,
  isDummyVan,
  isPartnerBoat,
  isNoTransfer,
  isNoTransferVan,
  totalPassengers,
  type Booking,
  type DayBoatPlan,
  type DayVehiclePlan,
  type Program,
} from '@/lib/types'
import { bookingPaxOnVan, primaryVan } from '@/lib/vehicle-assign'
import { cn } from '@/lib/utils'

type GuidePassengerRow = {
  bookingCode: string
  guestName: string
  leadPaxTag: string
  hotel: string
  optionLines: string[]
  note: string
}

export function printGuideJobOrder(date: string, program: Program) {
  const previous = document.title
  const programShort = program === 'PP' ? 'PP' : 'JB'
  document.title = `GuideJO-${date}-${programShort}`
  document.body.classList.add('printing-guide-jo')
  const restore = () => {
    document.title = previous
    document.body.classList.remove('printing-guide-jo')
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  window.print()
}

export function GuideJobOrderPrint({
  date,
  program,
  boatPlan,
  vehiclePlan,
  bookings,
}: {
  date: string
  program: Program
  boatPlan: DayBoatPlan
  vehiclePlan: DayVehiclePlan
  bookings: Booking[]
}) {
  const { resolveVanMeta, getCheckInAttendance, getCheckInServices, getCheckInNote } = usePortal()
  const boatNumbers = boatNumbersForPlan(boatPlan).filter((boat) => !isPartnerBoat(boatPlan, boat))
  const active = bookings.filter(
    (booking) => getCheckInAttendance(date, program, booking.code) !== 'no-show',
  )

  return (
    <>
      <div className="guide-job-order-print hidden">
        {boatNumbers.map((boat, boatIndex) => {
          const guide = boatPlan.guides?.[boat - 1] ?? emptyBoatGuide()
          const onBoat = active.filter((booking) => boatPlan.assignments[booking.code] === boat)
          const vanMap = new Map<number, Booking[]>()
          const noTransfer: Booking[] = []
          const loose: Booking[] = []
          for (const booking of onBoat) {
            const van = primaryVan(vehiclePlan.assignments[booking.code])
            if (van && isNoTransferVan(van)) {
              noTransfer.push(booking)
              continue
            }
            if (!van && isNoTransfer(booking.pickupZone)) {
              noTransfer.push(booking)
              continue
            }
            if (van && !isDummyVan(van)) {
              const list = vanMap.get(van) ?? []
              list.push(booking)
              vanMap.set(van, list)
              continue
            }
            loose.push(booking)
          }

          const vanSections = [...vanMap.entries()]
            .sort(([a], [b]) => a - b)
            .map(([van, items]) => {
              const meta = resolveVanMeta(van, vehiclePlan.vanMeta[String(van)])
              const pax = items.reduce(
                (sum, booking) =>
                  sum +
                  (bookingPaxOnVan(booking, vehiclePlan.assignments[booking.code], van) ||
                    totalPassengers(booking)),
                0,
              )
              const titleBits = [
                isNoTransferVan(van) ? 'No Transfers' : `Van ${van}`,
                `${pax} pax`,
                meta.driver ? `Driver ${meta.driver}` : '',
              ].filter(Boolean)
              return {
                key: `print-van-${boat}-${van}`,
                title: titleBits.join(' · '),
                rows: items.map((booking) => {
                  const legs = vehiclePlan.assignments[booking.code]
                  const split = (legs?.length ?? 0) > 1
                  const showExtras = !split || primaryVan(legs) === van
                  return guideLeaderPrintRow(
                    booking,
                    bookingPaxOnVan(booking, legs, van) || totalPassengers(booking),
                    showExtras ? getCheckInServices(date, program, booking.code) : [],
                    showExtras ? getCheckInNote(date, program, booking.code) : '',
                  )
                }),
              }
            })

          const extraSections = [
            noTransfer.length > 0
              ? {
                  key: `print-nt-${boat}`,
                  title: `No transfer · ${noTransfer.reduce((sum, booking) => sum + totalPassengers(booking), 0)} pax`,
                  rows: noTransfer.map((booking) =>
                    guideLeaderPrintRow(
                      booking,
                      totalPassengers(booking),
                      getCheckInServices(date, program, booking.code),
                      getCheckInNote(date, program, booking.code),
                    ),
                  ),
                }
              : null,
            loose.length > 0
              ? {
                  key: `print-loose-${boat}`,
                  title: `Guests · ${loose.reduce((sum, booking) => sum + totalPassengers(booking), 0)} pax`,
                  rows: loose.map((booking) =>
                    guideLeaderPrintRow(
                      booking,
                      totalPassengers(booking),
                      getCheckInServices(date, program, booking.code),
                      getCheckInNote(date, program, booking.code),
                    ),
                  ),
                }
              : null,
          ].filter((section): section is NonNullable<typeof section> => section !== null)

          let rowNo = 0
          const numberedSections = [...vanSections, ...extraSections].map((section) => {
            const startNo = rowNo
            rowNo += section.rows.length
            return { ...section, startNo }
          })
          const pax = onBoat.reduce((sum, booking) => sum + totalPassengers(booking), 0)
          const paxDetail = formatGuidePaxDetail({
            adults: onBoat.reduce((sum, booking) => sum + booking.adults, 0),
            children: onBoat.reduce((sum, booking) => sum + booking.children, 0),
            infants: onBoat.reduce((sum, booking) => sum + booking.infants, 0),
            tourLeaders: onBoat.reduce((sum, booking) => sum + booking.tourLeaders, 0),
          })
          const capacity = boatPlan.capacities[boat - 1] ?? DEFAULT_BOAT_CAPACITY
          const theme = boatThemeFor(boatPlan, boat)

          return (
            <div
              key={`guide-print-${boat}`}
              className={cn(
                'guide-jo-boat mb-2',
                boatIndex < boatNumbers.length - 1 && 'print:break-after-page',
              )}
            >
              <div
                className="guide-jo-color-bar mb-2 h-1.5 w-full rounded-sm"
                style={{ backgroundColor: theme.printHex }}
              />
              <div className="guide-jo-header mb-3 flex items-start justify-between gap-4 border-b-2 border-teal-900/30 pb-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[8px] font-bold tracking-[0.16em] text-teal-800 uppercase">
                    G&apos;Day Tours Phuket · Guide Job Order
                  </p>
                  <h1 className="mt-1 text-[15px] leading-snug font-bold text-teal-950">
                    <span
                      className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
                      style={{ backgroundColor: theme.printHex }}
                    />
                    {boatDisplayName(boatPlan, boat)} · {theme.colorName} ·{' '}
                    {program === 'PP' ? 'PP' : 'JB'} ·{' '}
                    {program === 'PP' ? 'Phi Phi Islands' : 'Phang Nga Bay'}
                  </h1>
                  <p className="mt-1 text-[10px] leading-snug font-medium text-teal-900/75">
                    {formatLongDate(date)} · {pax} / {capacity} pax : {paxDetail}
                  </p>
                </div>
                <div className="guide-jo-contact w-[13.5rem] shrink-0 rounded-md border border-teal-900/25 bg-teal-50/60 px-3 py-2.5">
                  <p className="text-[8px] font-bold tracking-[0.14em] text-teal-800/70 uppercase">
                    Guide
                  </p>
                  <p className="mt-1 text-[13px] leading-tight font-bold text-teal-950">
                    {guide.guideName.trim() || '—'}
                  </p>
                  <p className="mt-1 text-[12px] leading-tight font-semibold tabular-nums text-teal-900">
                    {guide.guidePhone.trim() || '—'}
                  </p>
                  {guide.assistantName.trim() || guide.assistantPhone.trim() ? (
                    <div className="mt-2 border-t border-teal-900/15 pt-2">
                      <p className="text-[8px] font-bold tracking-[0.14em] text-teal-800/70 uppercase">
                        Assistant
                      </p>
                      <p className="mt-1 text-[12px] leading-tight font-bold text-teal-950">
                        {guide.assistantName.trim() || '—'}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-tight font-semibold tabular-nums text-teal-900">
                        {guide.assistantPhone.trim() || '—'}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              {numberedSections.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-neutral-500">No guests on this boat.</p>
              ) : (
                <GuideBoatPassengerTable sections={numberedSections} />
              )}

              <p className="guide-jo-footer mt-2 text-[9px] font-medium text-teal-900/60">
                Total passengers on {boatDisplayName(boatPlan, boat)}: {pax} / {capacity} : {paxDetail}
              </p>
            </div>
          )
        })}
      </div>
      <style>{GUIDE_JO_PRINT_CSS}</style>
    </>
  )
}

function formatGuideLeadPaxTag(
  booking: Pick<Booking, 'adults' | 'children' | 'infants' | 'tourLeaders'>,
  seatsOnThisVan?: number,
) {
  const total = booking.adults + booking.children + booking.infants + booking.tourLeaders
  if (typeof seatsOnThisVan === 'number' && seatsOnThisVan > 0 && seatsOnThisVan !== total) {
    return `(${seatsOnThisVan}pax)`
  }
  const parts: string[] = []
  if (booking.adults > 0) parts.push(`${booking.adults}AD`)
  if (booking.children > 0) parts.push(`${booking.children}CHD`)
  if (booking.infants > 0) parts.push(`${booking.infants}IF`)
  if (booking.tourLeaders > 0) parts.push(`${booking.tourLeaders}TL`)
  return parts.length > 0 ? `(${parts.join('+')})` : ''
}

function guideLeaderPrintRow(
  booking: Booking,
  seatsOnThisVan?: number,
  services: CheckInServiceLine[] = [],
  note = '',
): GuidePassengerRow {
  return {
    bookingCode: booking.code,
    guestName: booking.leadGuest,
    leadPaxTag: formatGuideLeadPaxTag(booking, seatsOnThisVan),
    hotel: booking.pickupHotel?.trim() || (isNoTransfer(booking.pickupZone) ? 'No transfer' : '—'),
    optionLines: services.map((line) => formatCheckInServicesOption([line])),
    note: note.trim(),
  }
}

function formatGuidePaxDetail(pax: {
  adults: number
  children: number
  infants: number
  tourLeaders: number
}) {
  return `${pax.adults} AD, ${pax.children} CH, ${pax.infants} INF, ${pax.tourLeaders} TL`
}

function GuideBoatPassengerTable({
  sections,
}: {
  sections: Array<{
    key: string
    title: string
    rows: GuidePassengerRow[]
    startNo: number
  }>
}) {
  return (
    <table className="guide-jo-table w-full table-fixed border-collapse text-[11px] leading-snug">
      <colgroup>
        <col style={{ width: '5%' }} />
        <col style={{ width: '26%' }} />
        <col style={{ width: '24%' }} />
        <col style={{ width: '20%' }} />
        <col style={{ width: '25%' }} />
      </colgroup>
      <thead>
        <tr className="border-b border-teal-900/30 text-left text-[9px] tracking-wide text-teal-900/70 uppercase">
          <th className="py-1.5 pr-2 font-bold">No.</th>
          <th className="py-1.5 pr-2 font-bold">Guest name</th>
          <th className="py-1.5 pr-2 font-bold">Hotel</th>
          <th className="py-1.5 pr-2 font-bold">Option</th>
          <th className="py-1.5 font-bold">Note</th>
        </tr>
      </thead>
      <tbody>
        {sections.map((section) => (
          <Fragment key={section.key}>
            <tr className="guide-jo-van-title">
              <td
                colSpan={5}
                className="bg-teal-50/80 px-1.5 pt-2.5 pb-1.5 text-[11px] leading-snug font-bold text-teal-950"
              >
                {section.title}
              </td>
            </tr>
            {section.rows.map((row, index) => (
              <tr key={row.bookingCode} className="border-b border-teal-900/12">
                <td className="py-1.5 pr-2 align-top text-[11px] font-semibold tabular-nums text-teal-900/55">
                  {section.startNo + index + 1}
                </td>
                <td className="py-1.5 pr-2 align-top text-[11px] font-semibold break-words text-teal-950">
                  {row.guestName}
                  {row.leadPaxTag ? (
                    <span className="guide-jo-pax ml-1.5 inline-block font-bold text-teal-700">
                      {row.leadPaxTag}
                    </span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-2 align-top text-[11px] break-words text-teal-900/85">
                  {row.hotel}
                </td>
                <td className="py-1.5 pr-2 align-top">
                  {row.optionLines.length === 0 ? (
                    <span className="text-[10px] text-teal-900/30">—</span>
                  ) : (
                    <div className="guide-jo-option">
                      {row.optionLines.map((line, lineIndex) => (
                        <span
                          key={`${row.bookingCode}-opt-${lineIndex}`}
                          className="guide-jo-option-line block text-[10px] leading-snug font-semibold text-teal-900/85"
                        >
                          {line}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-1.5 align-top text-[10px] leading-snug break-words text-teal-900/80">
                  {row.note || '—'}
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

const GUIDE_JO_PRINT_CSS = `
  @media print {
    @page {
      size: A4 portrait;
      margin: 8mm;
    }
    body.printing-guide-jo * {
      visibility: hidden !important;
    }
    body.printing-guide-jo .guide-job-order-print,
    body.printing-guide-jo .guide-job-order-print * {
      visibility: visible !important;
    }
    body.printing-guide-jo .guide-job-order-print {
      display: block !important;
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      color: #042f2e !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body.printing-guide-jo .guide-jo-table {
      table-layout: fixed !important;
      width: 100% !important;
      font-size: 11px !important;
      line-height: 1.35 !important;
    }
    body.printing-guide-jo .guide-jo-table thead th {
      font-size: 9px !important;
      letter-spacing: 0.06em !important;
      padding-top: 4px !important;
      padding-bottom: 5px !important;
      border-bottom: 1.5px solid #134e4a !important;
      color: #134e4a !important;
    }
    body.printing-guide-jo .guide-jo-table td {
      padding-top: 5px !important;
      padding-bottom: 5px !important;
      vertical-align: top !important;
    }
    body.printing-guide-jo .guide-jo-van-title td {
      padding-top: 10px !important;
      padding-bottom: 4px !important;
      font-size: 11px !important;
      background: #f0fdfa !important;
      border-top: 1px solid #99f6e4 !important;
      border-bottom: 1px solid #99f6e4 !important;
    }
    body.printing-guide-jo .guide-jo-pax {
      color: #0f766e !important;
      font-weight: 700 !important;
    }
    body.printing-guide-jo .guide-jo-boat {
      margin-bottom: 0.5rem !important;
    }
    body.printing-guide-jo .guide-jo-header h1 {
      font-size: 16px !important;
      line-height: 1.25 !important;
    }
    body.printing-guide-jo .guide-jo-contact {
      width: 13.5rem !important;
      padding: 8px 10px !important;
      border: 1.5px solid #134e4a !important;
      background: #f0fdfa !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body.printing-guide-jo .guide-jo-contact p {
      color: #042f2e !important;
    }
    body.printing-guide-jo .guide-jo-option-line {
      display: block !important;
      font-size: 10px !important;
      line-height: 1.35 !important;
      font-weight: 600 !important;
      color: #134e4a !important;
    }
    body.printing-guide-jo .guide-jo-option-line + .guide-jo-option-line {
      margin-top: 3px !important;
      padding-top: 3px !important;
      border-top: 1px solid #ccfbf1 !important;
    }
    body.printing-guide-jo .guide-jo-footer {
      font-size: 10px !important;
      margin-top: 8px !important;
    }
  }
`
