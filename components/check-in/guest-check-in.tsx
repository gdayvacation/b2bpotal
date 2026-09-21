'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  Bus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  Ship,
  UserRound,
  Users,
  AlertTriangle,
} from 'lucide-react'
import { BoatFleetBadge } from '@/components/boat-badge'
import { usePortal } from '@/components/portal-provider'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NationalityCombobox } from '@/components/check-in/nationality-combobox'
import { enrolledSeatCount, guestDisplayName } from '@/lib/check-in-enrollment'
import { boatTheme } from '@/lib/boat-theme'
import { matchNationality } from '@/lib/nationalities'
import {
  collectTotal,
  formatCollectTotal,
  formatIncludeLabel,
  formatLongDate,
  parseCashOnTourAmount,
  parkFeeTotal,
} from '@/lib/format'
import { usePortalTodayISO } from '@/lib/use-portal-today'
import { listVanNumbers, primaryVan } from '@/lib/vehicle-assign'
import { cn } from '@/lib/utils'
import {
  isActiveBooking,
  isNoTransfer,
  boatDisplayName,
  totalPassengers,
  type Booking,
  type Program,
} from '@/lib/types'

type Step =
  | 'welcome'
  | 'program'
  | 'find'
  | 'scope'
  | 'details'
  | 'confirm'
  | 'done'

type FindMode = 'van' | 'hotel'
type Scope = 'one' | 'group'

type GuestDraft = {
  firstName: string
  lastName: string
  nationality: string
  birthYear: string
  birthMonth: string
  birthDay: string
  passportNumber: string
}

function emptyGuestDraft(): GuestDraft {
  return {
    firstName: '',
    lastName: '',
    nationality: '',
    birthYear: '',
    birthMonth: '',
    birthDay: '',
    passportNumber: '',
  }
}

function guestDraftReady(guest: GuestDraft) {
  return (
    Boolean(guest.firstName.trim()) &&
    Boolean(guest.lastName.trim()) &&
    Boolean(matchNationality(guest.nationality)) &&
    Boolean(buildBirthdayIso(guest.birthYear, guest.birthMonth, guest.birthDay)) &&
    Boolean(guest.passportNumber.trim())
  )
}

function programLabel(program: Program) {
  return program === 'PP' ? 'Phi Phi' : 'James Bond'
}

function paymentDue(booking: Booking) {
  const collect = collectTotal(
    booking.parkFee,
    booking.program,
    booking.adults,
    booking.children,
    booking.cashOnTour,
  )
  const transferNote = booking.transferExtraCharge.trim()
  const cashNote = booking.cashOnTour.trim()
  const hasCashText = Boolean(cashNote) && parseCashOnTourAmount(cashNote) === 0
  return {
    amount: collect,
    // Transfer extra is back-office only — do not drive guest payment UI.
    needsStaff: collect > 0 || hasCashText,
    parkFeeAmount: parkFeeTotal(
      booking.parkFee,
      booking.program,
      booking.adults,
      booking.children,
    ),
    cashAmount: parseCashOnTourAmount(booking.cashOnTour),
    cashNote,
    transferNote,
  }
}

export function GuestCheckIn() {
  const {
    bookings,
    getDayVehiclePlan,
    getDayBoatPlan,
    resolveVanMeta,
    getCheckInEnrollments,
    getCheckInAttendance,
    recordGuestCheckIns,
    hydrated,
  } = usePortal()

  const today = usePortalTodayISO()
  const [step, setStep] = useState<Step>('welcome')
  const [program, setProgram] = useState<Program | null>(null)
  const [findMode, setFindMode] = useState<FindMode>('van')
  const [findQuery, setFindQuery] = useState('')
  const [selectedVan, setSelectedVan] = useState<number | null>(null)
  const [selectedHotel, setSelectedHotel] = useState<string | null>(null)
  const [bookingCode, setBookingCode] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope | null>(null)
  const [guests, setGuests] = useState<GuestDraft[]>([emptyGuestDraft()])
  const [error, setError] = useState('')
  const [detailsAttempted, setDetailsAttempted] = useState(false)
  const [doneNeedsPayment, setDoneNeedsPayment] = useState(false)

  const detailsReady = guests.length > 0 && guests.every(guestDraftReady)

  const dayBookings = useMemo(() => {
    if (!program) return [] as Booking[]
    return bookings
      .filter(
        (b) =>
          isActiveBooking(b) &&
          b.date === today &&
          b.program === program &&
          getCheckInAttendance(today, program, b.code) !== 'no-show',
      )
      .sort(
        (a, b) =>
          a.leadGuest.localeCompare(b.leadGuest) || a.code.localeCompare(b.code),
      )
  }, [bookings, getCheckInAttendance, program, today])

  const vehiclePlan = program ? getDayVehiclePlan(today, program) : null
  const vanNumbers = vehiclePlan ? listVanNumbers(vehiclePlan.assignments) : []
  const vanOptions = useMemo(() => {
    if (!vehiclePlan) return [] as Array<{ van: number; plate: string }>
    return vanNumbers.map((van) => {
      const meta = resolveVanMeta(van, vehiclePlan.vanMeta[String(van)])
      return {
        van,
        plate: meta.plate.trim() || `Van ${van}`,
      }
    })
  }, [resolveVanMeta, vanNumbers, vehiclePlan])

  const hotels = useMemo(() => {
    const names = new Set<string>()
    for (const booking of dayBookings) {
      const hotel = booking.pickupHotel.trim() || (isNoTransfer(booking.pickupZone) ? 'No Transfer' : '—')
      names.add(hotel)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [dayBookings])

  const normalizedFindQuery = findQuery.trim().toLowerCase()
  const isSearching = normalizedFindQuery.length > 0

  const searchedBookings = useMemo(() => {
    if (!isSearching) return [] as Booking[]
    return dayBookings.filter((b) => bookingMatchesFindQuery(b, normalizedFindQuery))
  }, [dayBookings, isSearching, normalizedFindQuery])

  const filteredBookings = useMemo(() => {
    if (!program) return [] as Booking[]
    if (isSearching) return searchedBookings
    if (!vehiclePlan) return [] as Booking[]
    if (findMode === 'van') {
      if (selectedVan === null) return []
      return dayBookings.filter(
        (b) => primaryVan(vehiclePlan.assignments[b.code]) === selectedVan,
      )
    }
    if (!selectedHotel) return []
    return dayBookings.filter((b) => {
      const hotel = b.pickupHotel.trim() || (isNoTransfer(b.pickupZone) ? 'No Transfer' : '—')
      return hotel === selectedHotel
    })
  }, [
    dayBookings,
    findMode,
    isSearching,
    program,
    searchedBookings,
    selectedHotel,
    selectedVan,
    vehiclePlan,
  ])

  const selectedBooking = useMemo(
    () => dayBookings.find((b) => b.code === bookingCode) ?? null,
    [bookingCode, dayBookings],
  )

  const enrolled = selectedBooking
    ? getCheckInEnrollments(today, selectedBooking.program, selectedBooking.code)
    : []
  const enrolledSeats = enrolledSeatCount(enrolled)
  const seatsTotal = selectedBooking ? totalPassengers(selectedBooking) : 0
  const remainingSeats = Math.max(0, seatsTotal - enrolledSeats)
  const fullyCheckedIn = selectedBooking
    ? remainingSeats === 0 ||
      getCheckInAttendance(today, selectedBooking.program, selectedBooking.code) === 'checked'
    : false

  function resetFind() {
    setFindQuery('')
    setSelectedVan(null)
    setSelectedHotel(null)
    setBookingCode(null)
  }

  function goBack() {
    setError('')
    if (step === 'program') setStep('welcome')
    else if (step === 'find') {
      setProgram(null)
      resetFind()
      setStep('program')
    } else if (step === 'scope') {
      setBookingCode(null)
      setScope(null)
      setStep('find')
    } else if (step === 'details') {
      setScope(null)
      setGuests([emptyGuestDraft()])
      setDetailsAttempted(false)
      setStep('scope')
    } else if (step === 'confirm') setStep('details')
  }

  function startOver() {
    setStep('welcome')
    setProgram(null)
    setFindMode('van')
    resetFind()
    setScope(null)
    setGuests([emptyGuestDraft()])
    setDetailsAttempted(false)
    setError('')
    setDoneNeedsPayment(false)
  }

  function updateGuest(index: number, patch: Partial<GuestDraft>) {
    setGuests((current) =>
      current.map((guest, i) => (i === index ? { ...guest, ...patch } : guest)),
    )
  }

  function beginDetails(nextScope: Scope) {
    const count = nextScope === 'group' ? Math.max(1, remainingSeats) : 1
    setScope(nextScope)
    setGuests(Array.from({ length: count }, () => emptyGuestDraft()))
    setDetailsAttempted(false)
    setError('')
    setStep('details')
  }

  function openBooking(code: string) {
    const booking = dayBookings.find((item) => item.code === code)
    if (!booking) return
    const seats = totalPassengers(booking)
    const enrolled = enrolledSeatCount(
      getCheckInEnrollments(today, booking.program, booking.code),
    )
    const attendance = getCheckInAttendance(today, booking.program, booking.code)
    const alreadyDone = attendance === 'checked' || enrolled >= seats
    setBookingCode(code)
    if (alreadyDone) {
      setDoneNeedsPayment(paymentDue(booking).needsStaff)
      setStep('done')
      return
    }
    setStep('scope')
  }

  function submitCheckIn() {
    if (!selectedBooking || !scope) return
    setError('')

    if (selectedBooking.program !== program) {
      setError('Program does not match this booking. Please start again.')
      return
    }

    const payload = guests.map((guest) => ({
      firstName: guest.firstName,
      lastName: guest.lastName,
      nationality: matchNationality(guest.nationality) ?? guest.nationality.trim(),
      birthday: buildBirthdayIso(guest.birthYear, guest.birthMonth, guest.birthDay) ?? '',
      passportNumber: guest.passportNumber,
    }))

    const result = recordGuestCheckIns({
      date: today,
      program: selectedBooking.program,
      bookingCode: selectedBooking.code,
      scope,
      guests: payload,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }

    setDoneNeedsPayment(paymentDue(selectedBooking).needsStaff)
    setStep('done')
  }

  if (!hydrated) {
    return (
      <div className="gday-app flex min-h-dvh items-center justify-center px-4">
        <p className="text-sm text-teal-900/55">Loading check-in…</p>
      </div>
    )
  }

  return (
    <div className="gday-app relative min-h-dvh overflow-hidden">
      <div className="gday-grid pointer-events-none absolute inset-0 opacity-40" />
      <header className="relative mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4">
        <BrandMark />
        <p className="text-xs font-medium text-teal-900/45">{formatLongDate(today)}</p>
      </header>

      <main className="relative mx-auto w-full max-w-lg px-4 pb-10 pt-2">
        {step !== 'welcome' && step !== 'done' ? (
          <button
            type="button"
            onClick={goBack}
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-teal-800/70 transition-colors hover:text-teal-950"
          >
            <ChevronLeft className="size-4" />
            Back
          </button>
        ) : null}

        {step === 'welcome' ? (
          <section className="gday-sheet space-y-5 rounded-[1.5rem] p-6">
            <p className="gday-soft-label">Marina check-in</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
              Welcome — let&apos;s check you in
            </h1>
            <p className="text-sm leading-relaxed text-teal-950/60">
              Tour date:{' '}
              <span className="font-semibold text-teal-950">{formatLongDate(today)}</span>
            </p>
            <p className="rounded-2xl bg-teal-950/[0.04] px-4 py-3.5 text-sm leading-relaxed text-teal-900/70">
              Please enter your details exactly as on your passport — this is used for travel
              insurance.
            </p>
            <Button className="h-12 w-full text-base" onClick={() => setStep('program')}>
              Start check-in
              <ChevronRight data-icon="inline-end" />
            </Button>
          </section>
        ) : null}

        {step === 'program' ? (
          <section className="space-y-4">
            <StepHeading title="Which program today?" subtitle="Choose the tour you are joining." />
            <div className="grid gap-3">
              <ChoiceCard
                title="Phi Phi"
                subtitle="Phi Phi Islands"
                icon={<Ship className="size-5" />}
                selected={program === 'PP'}
                onSelect={() => {
                  setProgram('PP')
                  resetFind()
                  setStep('find')
                }}
              />
              <ChoiceCard
                title="James Bond"
                subtitle="Phang Nga Bay"
                icon={<Ship className="size-5" />}
                selected={program === 'James Bond'}
                onSelect={() => {
                  setProgram('James Bond')
                  resetFind()
                  setStep('find')
                }}
              />
            </div>
          </section>
        ) : null}

        {step === 'find' && program ? (
          <section className="space-y-4">
            <StepHeading
              title="Find your booking"
              subtitle={`${programLabel(program)} · ${formatLongDate(today)}`}
            />
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-teal-900/35" />
              <Input
                value={findQuery}
                onChange={(event) => {
                  setFindQuery(event.target.value)
                  setSelectedVan(null)
                  setSelectedHotel(null)
                  setBookingCode(null)
                }}
                placeholder="Search name, hotel, or voucher…"
                autoComplete="off"
                className="h-11 pl-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-teal-950/[0.04] p-1">
              <ModeTab
                active={findMode === 'van'}
                label="Van plate"
                icon={<Bus className="size-3.5" />}
                onClick={() => {
                  setFindMode('van')
                  setFindQuery('')
                  setSelectedHotel(null)
                  setBookingCode(null)
                }}
              />
              <ModeTab
                active={findMode === 'hotel'}
                label="Hotel"
                icon={<Building2 className="size-3.5" />}
                onClick={() => {
                  setFindMode('hotel')
                  setFindQuery('')
                  setSelectedVan(null)
                  setBookingCode(null)
                }}
              />
            </div>

            {isSearching ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-wide text-teal-800/55 uppercase">
                  Search results
                </p>
                {filteredBookings.length === 0 ? (
                  <EmptyNote text="No bookings match that name, hotel, or voucher today." />
                ) : (
                  <BookingPickList
                    bookings={filteredBookings}
                    today={today}
                    getCheckInEnrollments={getCheckInEnrollments}
                    getCheckInAttendance={getCheckInAttendance}
                    onPick={openBooking}
                  />
                )}
              </div>
            ) : (
              <>
                {findMode === 'van' ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-wide text-teal-800/55 uppercase">
                      Select van plate
                    </p>
                    {vanOptions.length === 0 ? (
                      <EmptyNote text="No vans assigned yet for this program. Try hotel search, or ask staff." />
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {vanOptions.map(({ van, plate }) => (
                          <button
                            key={van}
                            type="button"
                            onClick={() => {
                              setSelectedVan(van)
                              setBookingCode(null)
                            }}
                            className={cn(
                              'rounded-xl px-3 py-3 text-sm font-semibold leading-snug ring-1 transition-all',
                              selectedVan === van
                                ? 'bg-teal-800 text-white ring-teal-800'
                                : 'bg-white/80 text-teal-950 ring-teal-900/10 hover:bg-white',
                            )}
                          >
                            {plate}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-wide text-teal-800/55 uppercase">
                      Select hotel
                    </p>
                    {hotels.length === 0 ? (
                      <EmptyNote text="No bookings found for this program today." />
                    ) : (
                      <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-2xl ring-1 ring-teal-900/8">
                        {hotels.map((hotel) => (
                          <button
                            key={hotel}
                            type="button"
                            onClick={() => {
                              setSelectedHotel(hotel)
                              setBookingCode(null)
                            }}
                            className={cn(
                              'flex w-full items-center px-3.5 py-3 text-left text-sm font-medium transition-colors',
                              selectedHotel === hotel
                                ? 'bg-teal-800 text-white'
                                : 'bg-white/80 text-teal-950 hover:bg-teal-50',
                            )}
                          >
                            {hotel}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(findMode === 'van' && selectedVan !== null) ||
                (findMode === 'hotel' && selectedHotel) ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-wide text-teal-800/55 uppercase">
                      Guest / leader name
                    </p>
                    {filteredBookings.length === 0 ? (
                      <EmptyNote text="No bookings on this van or hotel. Try the other filter." />
                    ) : (
                      <BookingPickList
                        bookings={filteredBookings}
                        today={today}
                        getCheckInEnrollments={getCheckInEnrollments}
                        getCheckInAttendance={getCheckInAttendance}
                        onPick={openBooking}
                      />
                    )}
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {step === 'scope' && selectedBooking ? (
          <section className="space-y-4">
            <StepHeading
              title="Who is checking in?"
              subtitle={`${selectedBooking.leadGuest} · ${remainingSeats} of ${seatsTotal} left`}
            />
            {fullyCheckedIn ? (
              <div className="space-y-3">
                <EmptyNote text="This booking is already fully checked in." />
                <Button
                  className="h-12 w-full text-base"
                  onClick={() => {
                    setDoneNeedsPayment(paymentDue(selectedBooking).needsStaff)
                    setStep('done')
                  }}
                >
                  View check-in status
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </div>
            ) : (
              <div className="grid gap-3">
                <ChoiceCard
                  title="1 person"
                  subtitle="Check in yourself only"
                  icon={<UserRound className="size-5" />}
                  selected={scope === 'one'}
                  onSelect={() => beginDetails('one')}
                />
                <ChoiceCard
                  title="Whole group"
                  subtitle={`Enter details for all ${remainingSeats} remaining guest${remainingSeats === 1 ? '' : 's'}`}
                  icon={<Users className="size-5" />}
                  selected={scope === 'group'}
                  onSelect={() => beginDetails('group')}
                />
              </div>
            )}
          </section>
        ) : null}

        {step === 'details' && selectedBooking && scope ? (
          <section className="space-y-4">
            <StepHeading
              title={scope === 'group' ? 'Group details' : 'Your details'}
              subtitle={
                scope === 'group'
                  ? `Enter information for each of the ${guests.length} guests checking in. All fields are required.`
                  : 'Enter the guest checking in now. All fields are required.'
              }
            />
            <div
              role="alert"
              className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3.5 text-sm leading-relaxed text-rose-900"
            >
              <p className="font-semibold text-rose-950">Use passport details only</p>
              <p className="mt-1 text-rose-900/85">
                Name, birthday, nationality, and passport number must match your passport exactly.
                Wrong information means travel insurance may not cover you.
              </p>
            </div>
            <div className="space-y-4">
              {guests.map((guest, index) => {
                const birthdayOk = Boolean(
                  buildBirthdayIso(guest.birthYear, guest.birthMonth, guest.birthDay),
                )
                return (
                  <div key={index} className="gday-sheet space-y-3.5 rounded-[1.5rem] p-5">
                    {scope === 'group' ? (
                      <p className="text-xs font-semibold tracking-wide text-teal-800/55 uppercase">
                        Guest {index + 1} of {guests.length}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        label="First name"
                        value={guest.firstName}
                        onChange={(value) => updateGuest(index, { firstName: value })}
                        autoComplete="given-name"
                        required
                        showError={detailsAttempted && !guest.firstName.trim()}
                        errorText="First name is required."
                      />
                      <Field
                        label="Last name"
                        value={guest.lastName}
                        onChange={(value) => updateGuest(index, { lastName: value })}
                        autoComplete="family-name"
                        required
                        showError={detailsAttempted && !guest.lastName.trim()}
                        errorText="Last name is required."
                      />
                    </div>
                    <NationalityCombobox
                      id={`nationality-${index}`}
                      value={guest.nationality}
                      onChange={(value) => updateGuest(index, { nationality: value })}
                      required
                      showError={detailsAttempted}
                    />
                    <BirthdayPickers
                      year={guest.birthYear}
                      month={guest.birthMonth}
                      day={guest.birthDay}
                      required
                      showError={detailsAttempted && !birthdayOk}
                      onYearChange={(value) =>
                        updateGuest(index, {
                          birthYear: value,
                          birthDay: clampDay(guest.birthDay, value, guest.birthMonth),
                        })
                      }
                      onMonthChange={(value) =>
                        updateGuest(index, {
                          birthMonth: value,
                          birthDay: clampDay(guest.birthDay, guest.birthYear, value),
                        })
                      }
                      onDayChange={(value) => updateGuest(index, { birthDay: value })}
                    />
                    <Field
                      label="Passport number"
                      value={guest.passportNumber}
                      onChange={(value) => updateGuest(index, { passportNumber: value })}
                      placeholder="Exactly as on passport"
                      autoComplete="off"
                      required
                      showError={detailsAttempted && !guest.passportNumber.trim()}
                      errorText="Passport number is required."
                    />
                  </div>
                )
              })}
              {error ? <p className="text-sm text-rose-700">{error}</p> : null}
              {detailsAttempted && !detailsReady ? (
                <p className="text-sm font-medium text-rose-700">
                  Please complete every required field before continuing.
                </p>
              ) : null}
              <Button
                className="h-12 w-full text-base"
                onClick={() => {
                  setDetailsAttempted(true)
                  if (!detailsReady) {
                    setError('All fields are required. Please fill in every guest completely.')
                    return
                  }
                  setError('')
                  setStep('confirm')
                }}
              >
                Next
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'confirm' && selectedBooking && scope ? (
          <ConfirmStep
            booking={selectedBooking}
            guests={guests}
            scope={scope}
            error={error}
            onConfirm={submitCheckIn}
          />
        ) : null}

        {step === 'done' ? (
          <DoneStep
            needsPayment={doneNeedsPayment}
            booking={selectedBooking}
            guestNames={
              guests.some((guest) => guest.firstName.trim() || guest.lastName.trim())
                ? guests.map((guest) => guestDisplayName(guest)).filter(Boolean)
                : selectedBooking
                  ? getCheckInEnrollments(
                      today,
                      selectedBooking.program,
                      selectedBooking.code,
                    ).map((item) => guestDisplayName(item))
                  : []
            }
            boat={
              selectedBooking
                ? (getDayBoatPlan(today, selectedBooking.program).assignments[
                    selectedBooking.code
                  ] ?? null)
                : null
            }
            boatPlan={
              selectedBooking ? getDayBoatPlan(today, selectedBooking.program) : null
            }
            onAgain={startOver}
          />
        ) : null}
      </main>
    </div>
  )
}

function ConfirmStep({
  booking,
  guests,
  scope,
  error,
  onConfirm,
}: {
  booking: Booking
  guests: GuestDraft[]
  scope: Scope
  error: string
  onConfirm: () => void
}) {
  const due = paymentDue(booking)
  const first = guests[0]
  const leadMatch = first
    ? normalizeName(`${first.firstName} ${first.lastName}`) ===
        normalizeName(booking.leadGuest) ||
      normalizeName(first.firstName) ===
        normalizeName(booking.leadGuest.split(/\s+/)[0] ?? '')
    : false

  return (
    <section className="space-y-4">
      <StepHeading
        title="Confirm booking"
        subtitle="Please check these details match your voucher."
      />
      <div className="gday-sheet space-y-4 rounded-[1.5rem] p-5">
        <DetailRow label="Program" value={programLabel(booking.program)} />
        <DetailRow label="Date" value={formatLongDate(booking.date)} />
        <DetailRow label="Leader / booking name" value={booking.leadGuest} />
        <DetailRow label="Booking code" value={booking.code} />
        <DetailRow label="Hotel" value={booking.pickupHotel || booking.pickupZone || '—'} />
        <DetailRow
          label="Total Pax in Booking"
          value={formatGuestPaxLabel(booking)}
        />
        <DetailRow label="National park" value={formatIncludeLabel(booking.parkFee)} />
        {booking.program === 'James Bond' ? (
          <DetailRow label="Canoe" value={formatIncludeLabel(booking.canoe)} />
        ) : null}
        {due.parkFeeAmount > 0 ? (
          <DetailRow
            label="Park fee to collect"
            value={`${due.parkFeeAmount.toLocaleString('en-US')} THB`}
          />
        ) : null}
        {due.cashNote ? (
          <DetailRow
            label="Cash on tour"
            value={
              due.cashAmount > 0
                ? `${due.cashAmount.toLocaleString('en-US')} THB`
                : due.cashNote
            }
          />
        ) : (
          <DetailRow label="Cash on tour" value="None" />
        )}
        {due.amount > 0 ? (
          <DetailRow
            label="Total to collect"
            value={`${formatCollectTotal(
              booking.parkFee,
              booking.program,
              booking.adults,
              booking.children,
              booking.cashOnTour,
            )} THB`}
            strong
          />
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-teal-800/50 uppercase">
            Checking in {guests.length} guest{guests.length === 1 ? '' : 's'}
            {scope === 'group' ? ' (whole group)' : ''}
          </p>
          {guests.map((guest, index) => {
            const birthday =
              buildBirthdayIso(guest.birthYear, guest.birthMonth, guest.birthDay) ?? ''
            return (
              <div
                key={index}
                className="rounded-xl bg-teal-950/[0.04] px-3.5 py-3 text-sm text-teal-900/70"
              >
                <p className="font-semibold text-teal-950">
                  {guests.length > 1 ? `${index + 1}. ` : ''}
                  {guestDisplayName(guest)}
                  <span className="font-normal text-teal-900/55"> · {guest.nationality}</span>
                </p>
                <p className="mt-0.5 text-xs text-teal-900/50">
                  Birthday {birthday ? formatLongDate(birthday) : '—'} · Passport{' '}
                  {guest.passportNumber.trim() || '—'}
                </p>
              </div>
            )
          })}
          {!leadMatch && first ? (
            <p className="text-xs text-amber-800/80">
              First guest name differs from booking leader — that&apos;s OK for group members.
            </p>
          ) : null}
        </div>

        {due.needsStaff ? (
          <div className="flex gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-3 text-sm text-orange-950/85">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-orange-600" />
            Payment is due on this booking. After check-in, please contact staff to pay.
          </div>
        ) : (
          <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-950/80">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            No cash on tour to collect — you can finish check-in.
          </div>
        )}

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}

        <Button className="h-12 w-full text-base" onClick={onConfirm}>
          Confirm &amp; finish check-in
        </Button>
      </div>
    </section>
  )
}

function DoneStep({
  needsPayment,
  booking,
  guestNames,
  boat,
  boatPlan,
  onAgain,
}: {
  needsPayment: boolean
  booking: Booking | null
  guestNames: string[]
  boat: number | null
  boatPlan: ReturnType<ReturnType<typeof usePortal>['getDayBoatPlan']> | null
  onAgain: () => void
}) {
  const due = booking ? paymentDue(booking) : null
  const parkExcluded = Boolean(due && due.parkFeeAmount > 0)
  const showParkNote = parkExcluded && booking?.program === 'PP'
  const displayNames =
    guestNames.length > 0
      ? guestNames
      : booking?.leadGuest
        ? [booking.leadGuest]
        : []

  const boarding = (
    <BoardingSummary
      names={displayNames}
      boat={boat}
      boatLabel={
        boat && boatPlan ? boatDisplayName(boatPlan, boat) : boat ? `Boat ${boat}` : null
      }
    />
  )

  if (needsPayment) {
    return (
      <div className="space-y-4">
        <section className="gday-sheet space-y-5 rounded-[1.5rem] border border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg shadow-orange-500/30">
            <AlertTriangle className="size-8" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-orange-950">
              Checked in — payment needed
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-orange-950/70">
              {parkExcluded
                ? 'Your booking does not include the National Park fee. Please see marina staff to complete payment.'
                : 'Please see marina staff to complete your payment.'}
            </p>
          </div>
          {boarding}
          <Button variant="outline" className="h-11 w-full" onClick={onAgain}>
            Check in another guest
          </Button>
        </section>

        {showParkNote ? (
          <section className="rounded-[1.5rem] border border-teal-900/10 bg-white/80 px-4 py-4 text-left text-sm leading-relaxed text-teal-950/75">
            <p className="font-semibold tracking-wide text-teal-950 uppercase">
              National Park Fee Note
            </p>
            <p className="mt-2">
              Entry to Phi Phi Island, Maya Bay, and the other islands on this trip is not free for
              foreigners. A mandatory fee of{' '}
              <span className="font-semibold text-teal-950">400 THB per adult</span> and{' '}
              <span className="font-semibold text-teal-950">200 THB per child</span> applies for
              foreign visitors, paid in cash when visiting Maya Bay.
            </p>
            <p className="mt-2 font-medium text-teal-950">
              This is not optional. Failure to pay this fee will result in forfeiture of your trip,
              with no refunds.
            </p>
            <p className="mt-2">
              Please confirm with your booking agent whether your package includes the National Park
              fee. Thank you.
            </p>
            <p className="mt-3 text-xs font-semibold tracking-wide text-teal-900/55 uppercase">
              Management
            </p>
          </section>
        ) : null}
      </div>
    )
  }

  return (
    <section className="gday-sheet space-y-5 rounded-[1.5rem] border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-6 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
        <CheckCircle2 className="size-8" />
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold text-emerald-950">
          Check-in successful
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-emerald-950/70">
          You&apos;re all set — no cash on tour to pay. Have a great day on the water!
        </p>
      </div>
      {boarding}
      <Button variant="outline" className="h-11 w-full" onClick={onAgain}>
        Check in another guest
      </Button>
    </section>
  )
}

function BoardingSummary({
  names,
  boat,
  boatLabel,
}: {
  names: string[]
  boat: number | null
  boatLabel: string | null
}) {
  const theme = boat && boat > 0 ? boatTheme(boat) : null

  return (
    <div className="space-y-3 text-left">
      <div className="rounded-2xl bg-white/80 px-4 py-3.5 ring-1 ring-teal-900/8">
        <p className="text-[11px] font-semibold tracking-wide text-teal-800/50 uppercase">
          Guest{names.length === 1 ? '' : 's'}
        </p>
        {names.length === 0 ? (
          <p className="mt-1 text-sm font-semibold text-teal-950">—</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {names.map((name, index) => (
              <li key={`${name}-${index}`} className="text-base font-semibold text-teal-950">
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {theme && boatLabel ? (
        <div
          className={cn(
            'rounded-2xl px-4 py-4 ring-1',
            theme.sheet,
            theme.ring.replace('ring-', 'ring-'),
          )}
        >
          <p className="text-[11px] font-semibold tracking-wide uppercase opacity-70">Your boat</p>
          <div className="mt-2 flex items-center gap-3">
            <span className={cn('size-10 shrink-0 rounded-xl shadow-sm', theme.swatch)} />
            <div className="min-w-0">
              <p className={cn('font-display text-xl font-semibold tracking-tight', theme.title)}>
                {boatLabel}
              </p>
              <p className={cn('mt-0.5 text-sm font-semibold', theme.title)}>
                {theme.colorName}
                <span className="mx-1.5 opacity-40">·</span>
                Boat {theme.fleetNumber}
              </p>
            </div>
            <BoatFleetBadge boat={boat} showColorName className="ml-auto text-sm" />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white/80 px-4 py-3.5 ring-1 ring-teal-900/8">
          <p className="text-[11px] font-semibold tracking-wide text-teal-800/50 uppercase">
            Your boat
          </p>
          <p className="mt-1 text-sm font-medium text-teal-900/55">
            Boat not assigned yet — please ask marina staff.
          </p>
        </div>
      )}
    </div>
  )
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight text-teal-950 sm:text-2xl">
        {title}
      </h1>
      <p className="mt-1 text-sm text-teal-900/55">{subtitle}</p>
    </div>
  )
}

function ChoiceCard({
  title,
  subtitle,
  icon,
  selected,
  onSelect,
}: {
  title: string
  subtitle: string
  icon: ReactNode
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 rounded-2xl px-4 py-4 text-left ring-1 transition-all',
        selected
          ? 'bg-gradient-to-r from-teal-700 to-cyan-700 text-white ring-teal-700 shadow-md shadow-teal-700/20'
          : 'bg-white/90 text-teal-950 ring-teal-900/10 hover:ring-teal-700/25',
      )}
    >
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl',
          selected ? 'bg-white/15' : 'bg-teal-950/[0.05] text-teal-800',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className={cn('mt-0.5 block text-sm', selected ? 'text-white/75' : 'text-teal-900/50')}>
          {subtitle}
        </span>
      </span>
    </button>
  )
}

function ModeTab({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
        active ? 'bg-white text-teal-950 shadow-sm' : 'text-teal-900/55 hover:text-teal-950',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function BookingPickList({
  bookings,
  today,
  getCheckInEnrollments,
  getCheckInAttendance,
  onPick,
}: {
  bookings: Booking[]
  today: string
  getCheckInEnrollments: ReturnType<typeof usePortal>['getCheckInEnrollments']
  getCheckInAttendance: ReturnType<typeof usePortal>['getCheckInAttendance']
  onPick: (code: string) => void
}) {
  return (
    <div className="space-y-2">
      {bookings.map((booking) => {
        const done =
          enrolledSeatCount(getCheckInEnrollments(today, booking.program, booking.code)) >=
            totalPassengers(booking) ||
          getCheckInAttendance(today, booking.program, booking.code) === 'checked'
        const total = totalPassengers(booking)
        return (
          <button
            key={booking.code}
            type="button"
            onClick={() => onPick(booking.code)}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left ring-1 transition-all',
              done
                ? 'bg-teal-50/80 text-teal-950 ring-teal-900/8 hover:ring-teal-700/25'
                : 'bg-white/90 text-teal-950 ring-teal-900/10 hover:ring-teal-700/30',
            )}
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">{booking.leadGuest}</p>
              <p className="mt-0.5 truncate text-xs text-teal-900/50">
                {total} guest{total === 1 ? '' : 's'} ·{' '}
                {booking.pickupHotel || booking.pickupZone || '—'}
              </p>
            </div>
            {done ? (
              <span className="shrink-0 text-[11px] font-semibold text-emerald-700">Checked in</span>
            ) : (
              <ChevronRight className="size-4 shrink-0 text-teal-900/30" />
            )}
          </button>
        )
      })}
    </div>
  )
}

function bookingMatchesFindQuery(booking: Booking, query: string) {
  const hotel =
    booking.pickupHotel.trim() ||
    (isNoTransfer(booking.pickupZone) ? 'No Transfer' : booking.pickupZone)
  const haystacks = [
    booking.leadGuest,
    hotel,
    booking.code,
    booking.agentRef,
  ]
  return haystacks.some((value) => value.toLowerCase().includes(query))
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  showError,
  errorText,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  required?: boolean
  showError?: boolean
  errorText?: string
}) {
  return (
    <div>
      <Label className="mb-1.5">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </Label>
      <Input
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={showError || undefined}
        className={cn(showError && 'border-rose-400 focus-visible:border-rose-500')}
        onChange={(event) => onChange(event.target.value)}
      />
      {showError && errorText ? (
        <p className="mt-1.5 text-xs font-medium text-rose-700">{errorText}</p>
      ) : null}
    </div>
  )
}

const MONTH_OPTIONS = [
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' },
  { value: '05', label: 'May' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
] as const

function birthYearOptions() {
  const current = new Date().getFullYear()
  const years: number[] = []
  for (let year = current; year >= current - 100; year -= 1) years.push(year)
  return years
}

function daysInMonth(year: string, month: string) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 31
  return new Date(y, m, 0).getDate()
}

function clampDay(day: string, year: string, month: string) {
  if (!day) return ''
  const max = daysInMonth(year, month)
  const n = Number(day)
  if (!Number.isFinite(n) || n < 1) return ''
  return String(Math.min(n, max)).padStart(2, '0')
}

function buildBirthdayIso(year: string, month: string, day: string) {
  if (!year || !month || !day) return null
  const iso = `${year}-${month}-${day.padStart(2, '0')}`
  const parsed = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() + 1 !== Number(month) ||
    parsed.getDate() !== Number(day)
  ) {
    return null
  }
  return iso
}

function BirthdayPickers({
  year,
  month,
  day,
  onYearChange,
  onMonthChange,
  onDayChange,
  required,
  showError,
}: {
  year: string
  month: string
  day: string
  onYearChange: (value: string) => void
  onMonthChange: (value: string) => void
  onDayChange: (value: string) => void
  required?: boolean
  showError?: boolean
}) {
  const maxDay = daysInMonth(year, month)
  const selectClass = cn(
    'h-11 w-full rounded-xl border bg-white/80 px-2.5 text-sm text-teal-950 outline-none focus-visible:ring-3',
    showError
      ? 'border-rose-400 focus-visible:border-rose-500 focus-visible:ring-rose-500/15'
      : 'border-teal-900/12 focus-visible:border-teal-700/40 focus-visible:ring-teal-700/15',
  )

  return (
    <div>
      <Label className="mb-1.5">
        Birthday
        {required ? <span className="text-rose-600"> *</span> : null}
      </Label>
      <div className="grid grid-cols-3 gap-2">
        <select
          aria-label="Birth year"
          className={selectClass}
          value={year}
          onChange={(event) => onYearChange(event.target.value)}
        >
          <option value="">Year</option>
          {birthYearOptions().map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
        <select
          aria-label="Birth month"
          className={selectClass}
          value={month}
          onChange={(event) => onMonthChange(event.target.value)}
        >
          <option value="">Month</option>
          {MONTH_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Birth day"
          className={selectClass}
          value={day}
          onChange={(event) => onDayChange(event.target.value)}
        >
          <option value="">Date</option>
          {Array.from({ length: maxDay }, (_, index) => {
            const value = String(index + 1).padStart(2, '0')
            return (
              <option key={value} value={value}>
                {index + 1}
              </option>
            )
          })}
        </select>
      </div>
      {showError ? (
        <p className="mt-1.5 text-xs font-medium text-rose-700">
          Birthday is required — pick Year, Month, and Date.
        </p>
      ) : null}
    </div>
  )
}

function DetailRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-teal-900/6 pb-2.5 last:border-0 last:pb-0">
      <span className="text-xs font-semibold tracking-wide text-teal-800/50 uppercase">
        {label}
      </span>
      <span
        className={cn(
          'max-w-[60%] text-right text-sm text-teal-950',
          strong && 'font-semibold tabular-nums',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-teal-900/8 bg-teal-50/60 px-3.5 py-3 text-sm text-teal-900/60">
      {text}
    </p>
  )
}

function formatGuestPaxLabel(booking: Pick<Booking, 'adults' | 'children' | 'infants' | 'tourLeaders'>) {
  const parts: string[] = []
  if (booking.adults > 0) parts.push(`${booking.adults}AD`)
  if (booking.children > 0) parts.push(`${booking.children}CH`)
  if (booking.infants > 0) parts.push(`${booking.infants}INF`)
  if (booking.tourLeaders > 0) parts.push(`${booking.tourLeaders}TL`)
  return parts.length > 0 ? parts.join(' + ') : '0'
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
