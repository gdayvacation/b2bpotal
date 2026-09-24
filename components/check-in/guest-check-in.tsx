'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Building2,
  Bus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  Ship,
  AlertTriangle,
  Minus,
  Plus,
} from 'lucide-react'
import { BoatFleetBadge } from '@/components/boat-badge'
import { usePortal } from '@/components/portal-provider'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckInI18nProvider, CheckInLanguageSwitch, useCheckInI18n } from '@/components/check-in/check-in-i18n'
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
import {
  englishPlural,
  isEnglishName,
  isEnglishPassport,
  sanitizeEnglishName,
  sanitizeEnglishPassport,
} from '@/lib/check-in-i18n'
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
    isEnglishName(guest.firstName) &&
    isEnglishName(guest.lastName) &&
    Boolean(matchNationality(guest.nationality)) &&
    Boolean(buildBirthdayIso(guest.birthYear, guest.birthMonth, guest.birthDay)) &&
    isEnglishPassport(guest.passportNumber)
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

export function GuestCheckIn({
  lockedBookingCode = null,
}: {
  lockedBookingCode?: string | null
}) {
  return (
    <CheckInI18nProvider>
      <GuestCheckInForm lockedBookingCode={lockedBookingCode} />
    </CheckInI18nProvider>
  )
}

function GuestCheckInForm({
  lockedBookingCode = null,
}: {
  lockedBookingCode?: string | null
}) {
  const { t, lang } = useCheckInI18n()
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
  const lockedCode = lockedBookingCode?.trim() || null
  const isLocked = Boolean(lockedCode)

  const lockedBooking = useMemo(() => {
    if (!lockedCode) return null
    return bookings.find((item) => item.code === lockedCode) ?? null
  }, [bookings, lockedCode])

  const tourDate = lockedBooking?.date ?? today

  const [step, setStep] = useState<Step>(() => (lockedCode ? 'scope' : 'welcome'))
  const [program, setProgram] = useState<Program | null>(null)
  const [findMode, setFindMode] = useState<FindMode>('van')
  const [findQuery, setFindQuery] = useState('')
  const [selectedVan, setSelectedVan] = useState<number | null>(null)
  const [selectedHotel, setSelectedHotel] = useState<string | null>(null)
  const [bookingCode, setBookingCode] = useState<string | null>(lockedCode)
  const [scope, setScope] = useState<Scope | null>(null)
  const [partySize, setPartySize] = useState(1)
  const [guests, setGuests] = useState<GuestDraft[]>([emptyGuestDraft()])
  const [error, setError] = useState('')
  const [detailsAttempted, setDetailsAttempted] = useState(false)
  const [doneNeedsPayment, setDoneNeedsPayment] = useState(false)
  const [lockedReady, setLockedReady] = useState(!lockedCode)
  const lockedBootstrappedRef = useRef(false)

  const detailsReady = guests.length > 0 && guests.every(guestDraftReady)

  const dayBookings = useMemo(() => {
    if (!program) return [] as Booking[]
    return bookings
      .filter(
        (b) =>
          isActiveBooking(b) &&
          b.date === tourDate &&
          b.program === program &&
          getCheckInAttendance(tourDate, program, b.code) !== 'no-show',
      )
      .sort(
        (a, b) =>
          a.leadGuest.localeCompare(b.leadGuest) || a.code.localeCompare(b.code),
      )
  }, [bookings, getCheckInAttendance, program, tourDate])

  const vehiclePlan = program ? getDayVehiclePlan(tourDate, program) : null
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

  const selectedBooking = useMemo(() => {
    if (!bookingCode) return null
    if (isLocked && lockedBooking) return lockedBooking
    return (
      dayBookings.find((b) => b.code === bookingCode) ??
      bookings.find((b) => b.code === bookingCode) ??
      null
    )
  }, [bookingCode, bookings, dayBookings, isLocked, lockedBooking])

  const enrolled = selectedBooking
    ? getCheckInEnrollments(tourDate, selectedBooking.program, selectedBooking.code)
    : []
  const enrolledSeats = enrolledSeatCount(enrolled)
  const seatsTotal = selectedBooking ? totalPassengers(selectedBooking) : 0
  const remainingSeats = Math.max(0, seatsTotal - enrolledSeats)
  const fullyCheckedIn = selectedBooking
    ? remainingSeats === 0 ||
      getCheckInAttendance(tourDate, selectedBooking.program, selectedBooking.code) === 'checked'
    : false

  // Resolve locked QR booking once portal data is ready.
  useEffect(() => {
    if (!hydrated || !lockedCode || lockedBootstrappedRef.current) return

    const booking = bookings.find((item) => item.code === lockedCode) ?? null
    lockedBootstrappedRef.current = true

    if (!booking) {
      setLockedReady(true)
      setError(t('invalidQr'))
      setStep('welcome')
      return
    }

    if (!isActiveBooking(booking)) {
      setLockedReady(true)
      setError(t('cancelledBooking'))
      setStep('welcome')
      return
    }
    if (getCheckInAttendance(booking.date, booking.program, booking.code) === 'no-show') {
      setLockedReady(true)
      setError(t('noShowBooking'))
      setStep('welcome')
      return
    }

    setProgram(booking.program)
    setBookingCode(booking.code)
    setError('')
    setLockedReady(true)

    const seats = totalPassengers(booking)
    const already = enrolledSeatCount(
      getCheckInEnrollments(booking.date, booking.program, booking.code),
    )
    const attendance = getCheckInAttendance(booking.date, booking.program, booking.code)
    if (attendance === 'checked' || already >= seats) {
      setDoneNeedsPayment(paymentDue(booking).needsStaff)
      setStep('done')
      return
    }
    setStep('scope')
  }, [
    bookings,
    getCheckInAttendance,
    getCheckInEnrollments,
    hydrated,
    lockedCode,
  ])

  function resetFind() {
    setFindQuery('')
    setSelectedVan(null)
    setSelectedHotel(null)
    if (!isLocked) setBookingCode(null)
  }

  function goBack() {
    setError('')
    if (step === 'program') setStep('welcome')
    else if (step === 'find') {
      setProgram(null)
      resetFind()
      setStep('program')
    } else if (step === 'scope') {
      if (isLocked) return
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
    setScope(null)
    setPartySize(1)
    setGuests([emptyGuestDraft()])
    setDetailsAttempted(false)
    setError('')
    setDoneNeedsPayment(false)
    if (isLocked && lockedBooking && isActiveBooking(lockedBooking)) {
      setProgram(lockedBooking.program)
      setBookingCode(lockedBooking.code)
      const seats = totalPassengers(lockedBooking)
      const already = enrolledSeatCount(
        getCheckInEnrollments(lockedBooking.date, lockedBooking.program, lockedBooking.code),
      )
      const attendance = getCheckInAttendance(
        lockedBooking.date,
        lockedBooking.program,
        lockedBooking.code,
      )
      if (attendance === 'checked' || already >= seats) {
        setDoneNeedsPayment(paymentDue(lockedBooking).needsStaff)
        setStep('done')
      } else {
        setStep('scope')
      }
      return
    }
    setStep('welcome')
    setProgram(null)
    setFindMode('van')
    resetFind()
  }

  function updateGuest(index: number, patch: Partial<GuestDraft>) {
    setGuests((current) =>
      current.map((guest, i) => (i === index ? { ...guest, ...patch } : guest)),
    )
  }

  function beginDetails(count = partySize) {
    const size = Math.min(Math.max(1, Math.floor(count) || 1), Math.max(1, remainingSeats))
    setPartySize(size)
    setScope(size === 1 ? 'one' : 'group')
    setGuests(Array.from({ length: size }, () => emptyGuestDraft()))
    setDetailsAttempted(false)
    setError('')
    setStep('details')
  }

  function openBooking(code: string) {
    const booking = dayBookings.find((item) => item.code === code)
    if (!booking) return
    const seats = totalPassengers(booking)
    const enrolledCount = enrolledSeatCount(
      getCheckInEnrollments(tourDate, booking.program, booking.code),
    )
    const attendance = getCheckInAttendance(tourDate, booking.program, booking.code)
    const alreadyDone = attendance === 'checked' || enrolledCount >= seats
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

    if (program && selectedBooking.program !== program) {
      setError(t('programMismatch'))
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
      date: selectedBooking.date,
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

  if (!hydrated || (isLocked && !lockedReady)) {
    return (
      <div className="gday-app flex min-h-dvh items-center justify-center px-4">
        <p className="text-sm text-teal-900/55">{t('loading')}</p>
      </div>
    )
  }

  const showBack =
    step !== 'welcome' &&
    step !== 'done' &&
    !(isLocked && step === 'scope')

  return (
    <div className="gday-app relative min-h-dvh overflow-hidden" lang={lang}>
      <div className="gday-grid pointer-events-none absolute inset-0 opacity-40" />
      <header className="relative mx-auto flex h-14 w-full max-w-lg items-center justify-between gap-3 px-4">
        <BrandMark />
        <div className="flex items-center gap-2">
          <CheckInLanguageSwitch />
          <p className="text-xs font-medium text-teal-900/45">{formatLongDate(tourDate)}</p>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-lg px-4 pb-10 pt-2">
        {showBack ? (
          <button
            type="button"
            onClick={goBack}
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-teal-800/70 transition-colors hover:text-teal-950"
          >
            <ChevronLeft className="size-4" />
            {t('back')}
          </button>
        ) : null}

        {step === 'welcome' ? (
          <section className="gday-sheet space-y-5 rounded-[1.5rem] p-6">
            <p className="gday-soft-label">{t('marinaCheckIn')}</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
              {error ? t('checkInUnavailable') : t('scanQr')}
            </h1>
            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm leading-relaxed text-rose-900">
                {error}
              </p>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-teal-950/60">{t('welcomeBody')}</p>
                <p className="rounded-2xl bg-teal-950/[0.04] px-4 py-3.5 text-sm leading-relaxed text-teal-900/70">
                  {t('welcomeAskStaff')}
                </p>
              </>
            )}
          </section>
        ) : null}

        {step === 'program' && !isLocked ? (
          <section className="space-y-4">
            <StepHeading title={t('whichProgram')} subtitle={t('whichProgramSub')} />
            <div className="grid gap-3">
              <ChoiceCard
                title={t('phiPhi')}
                subtitle={t('phiPhiSub')}
                icon={<Ship className="size-5" />}
                selected={program === 'PP'}
                onSelect={() => {
                  setProgram('PP')
                  resetFind()
                  setStep('find')
                }}
              />
              <ChoiceCard
                title={t('jamesBond')}
                subtitle={t('jamesBondSub')}
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

        {step === 'find' && program && !isLocked ? (
          <section className="space-y-4">
            <StepHeading
              title={t('findBooking')}
              subtitle={`${programLabel(program)} · ${formatLongDate(tourDate)}`}
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
                placeholder={t('searchPlaceholder')}
                autoComplete="off"
                className="h-11 pl-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-teal-950/[0.04] p-1">
              <ModeTab
                active={findMode === 'van'}
                label={t('vanPlate')}
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
                label={t('hotel')}
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
                  {t('searchResults')}
                </p>
                {filteredBookings.length === 0 ? (
                  <EmptyNote text={t('noSearchMatch')} />
                ) : (
                  <BookingPickList
                    bookings={filteredBookings}
                    today={tourDate}
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
                      {t('selectVan')}
                    </p>
                    {vanOptions.length === 0 ? (
                      <EmptyNote text={t('noVans')} />
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
                      {t('selectHotel')}
                    </p>
                    {hotels.length === 0 ? (
                      <EmptyNote text={t('noBookingsToday')} />
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
                      {t('guestLeader')}
                    </p>
                    {filteredBookings.length === 0 ? (
                      <EmptyNote text={t('noVanHotel')} />
                    ) : (
                      <BookingPickList
                        bookings={filteredBookings}
                        today={tourDate}
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
              title={t('whoCheckingIn')}
              subtitle={`${programLabel(selectedBooking.program)} · ${formatLongDate(selectedBooking.date)}`}
            />
            <p className="text-sm leading-relaxed text-teal-900/60">{t('howManySub')}</p>
            <div className="gday-sheet space-y-2 rounded-[1.5rem] p-4">
              <p className="text-sm font-semibold text-teal-950">{selectedBooking.leadGuest}</p>
              <p className="text-xs text-teal-900/55">
                {selectedBooking.code}
                {selectedBooking.pickupHotel
                  ? ` · ${selectedBooking.pickupHotel}`
                  : selectedBooking.pickupZone
                    ? ` · ${selectedBooking.pickupZone}`
                    : ''}
              </p>
              <p className="text-xs font-medium tabular-nums text-teal-800/70">
                {t('seatsLeft', {
                  remaining: remainingSeats,
                  total: seatsTotal,
                  plural: englishPlural(seatsTotal),
                })}
              </p>
            </div>
            {(() => {
              const due = paymentDue(selectedBooking)
              if (!due.needsStaff) return null
              return (
                <div
                  role="alert"
                  className="rounded-2xl border border-orange-300 bg-orange-50 px-4 py-3.5 text-sm leading-relaxed text-orange-950"
                >
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-4 shrink-0" />
                    {t('paymentDueTitle')}
                  </p>
                  <p className="mt-1 text-orange-900/85">
                    {due.amount > 0
                      ? t('payAmount', { amount: due.amount.toLocaleString('en-US') })
                      : t('payCash')}
                  </p>
                </div>
              )
            })()}
            {fullyCheckedIn ? (
              <div className="space-y-3">
                <EmptyNote text={t('alreadyCheckedIn')} />
                <Button
                  className="h-12 w-full text-base"
                  onClick={() => {
                    setDoneNeedsPayment(paymentDue(selectedBooking).needsStaff)
                    setStep('done')
                  }}
                >
                  {t('viewStatus')}
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </div>
            ) : (
              <div className="gday-sheet space-y-4 rounded-[1.5rem] p-5">
                <div>
                  <p className="text-sm font-semibold text-teal-950">{t('howManyTitle')}</p>
                  <p className="mt-1 text-xs font-medium tracking-wide text-teal-800/55 uppercase">
                    {t('guestCountLabel')}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    aria-label="Decrease"
                    disabled={partySize <= 1}
                    onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                    className="flex size-12 items-center justify-center rounded-2xl bg-teal-950/[0.06] text-teal-900 transition-colors hover:bg-teal-950/[0.1] disabled:opacity-35"
                  >
                    <Minus className="size-5" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={remainingSeats}
                    inputMode="numeric"
                    lang="en"
                    value={partySize}
                    onChange={(event) => {
                      const next = Math.floor(Number(event.target.value) || 1)
                      setPartySize(Math.min(remainingSeats, Math.max(1, next)))
                    }}
                    className="h-16 w-24 rounded-2xl border border-teal-900/12 bg-white text-center font-display text-3xl font-semibold tabular-nums text-teal-950 outline-none focus-visible:border-teal-700/40"
                  />
                  <button
                    type="button"
                    aria-label="Increase"
                    disabled={partySize >= remainingSeats}
                    onClick={() => setPartySize((n) => Math.min(remainingSeats, n + 1))}
                    className="flex size-12 items-center justify-center rounded-2xl bg-teal-950/[0.06] text-teal-900 transition-colors hover:bg-teal-950/[0.1] disabled:opacity-35"
                  >
                    <Plus className="size-5" />
                  </button>
                </div>
                {remainingSeats > 1 ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPartySize(1)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-xs font-semibold',
                        partySize === 1
                          ? 'bg-teal-800 text-white'
                          : 'bg-teal-950/[0.05] text-teal-900/70',
                      )}
                    >
                      1
                    </button>
                    {remainingSeats > 3 ? (
                      <button
                        type="button"
                        onClick={() => setPartySize(Math.min(3, remainingSeats))}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs font-semibold',
                          partySize === 3
                            ? 'bg-teal-800 text-white'
                            : 'bg-teal-950/[0.05] text-teal-900/70',
                        )}
                      >
                        3
                      </button>
                    ) : null}
                    {remainingSeats > 6 ? (
                      <button
                        type="button"
                        onClick={() => setPartySize(Math.min(6, remainingSeats))}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs font-semibold',
                          partySize === 6
                            ? 'bg-teal-800 text-white'
                            : 'bg-teal-950/[0.05] text-teal-900/70',
                        )}
                      >
                        6
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setPartySize(remainingSeats)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-xs font-semibold',
                        partySize === remainingSeats
                          ? 'bg-teal-800 text-white'
                          : 'bg-teal-950/[0.05] text-teal-900/70',
                      )}
                    >
                      {t('allRemaining', { count: remainingSeats })}
                    </button>
                  </div>
                ) : null}
                <Button className="h-12 w-full text-base" onClick={() => beginDetails()}>
                  {t('continueWith', {
                    count: partySize,
                    plural: englishPlural(partySize),
                  })}
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </div>
            )}
          </section>
        ) : null}

        {step === 'details' && selectedBooking && scope ? (
          <section className="space-y-4">
            <StepHeading
              title={scope === 'group' ? t('groupDetails') : t('yourDetails')}
              subtitle={
                scope === 'group'
                  ? t('groupDetailsSub', { count: guests.length })
                  : t('yourDetailsSub')
              }
            />
            <div
              role="alert"
              className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-sm leading-relaxed text-amber-950"
            >
              <p className="font-semibold">{t('fillEnglishOnly')}</p>
            </div>
            <div
              role="alert"
              className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3.5 text-sm leading-relaxed text-rose-900"
            >
              <p className="font-semibold text-rose-950">{t('passportOnlyTitle')}</p>
              <p className="mt-1 text-rose-900/85">{t('passportOnlyBody')}</p>
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
                        {t('guestOf', { n: index + 1, total: guests.length })}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        label={t('firstName')}
                        value={guest.firstName}
                        onChange={(value) =>
                          updateGuest(index, { firstName: sanitizeEnglishName(value) })
                        }
                        autoComplete="given-name"
                        required
                        showError={detailsAttempted && !isEnglishName(guest.firstName)}
                        errorText={
                          guest.firstName.trim()
                            ? t('nameEnglishOnly')
                            : t('firstNameRequired')
                        }
                        hint={t('nameEnglishOnly')}
                      />
                      <Field
                        label={t('lastName')}
                        value={guest.lastName}
                        onChange={(value) =>
                          updateGuest(index, { lastName: sanitizeEnglishName(value) })
                        }
                        autoComplete="family-name"
                        required
                        showError={detailsAttempted && !isEnglishName(guest.lastName)}
                        errorText={
                          guest.lastName.trim() ? t('nameEnglishOnly') : t('lastNameRequired')
                        }
                        hint={t('nameEnglishOnly')}
                      />
                    </div>
                    <NationalityCombobox
                      id={`nationality-${index}`}
                      value={guest.nationality}
                      onChange={(value) => updateGuest(index, { nationality: value })}
                      required
                      showError={detailsAttempted}
                      label={t('nationality')}
                      placeholder={t('nationalityPlaceholder')}
                      noMatchText={t('nationalityNoMatch')}
                      errorText={t('nationalityRequired')}
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
                      label={t('passportNumber')}
                      value={guest.passportNumber}
                      onChange={(value) =>
                        updateGuest(index, {
                          passportNumber: sanitizeEnglishPassport(value),
                        })
                      }
                      placeholder={t('passportPlaceholder')}
                      autoComplete="off"
                      required
                      showError={detailsAttempted && !isEnglishPassport(guest.passportNumber)}
                      errorText={
                        guest.passportNumber.trim()
                          ? t('passportEnglishOnly')
                          : t('passportRequired')
                      }
                      hint={t('passportEnglishOnly')}
                    />
                  </div>
                )
              })}
              {error ? <p className="text-sm text-rose-700">{error}</p> : null}
              {detailsAttempted && !detailsReady ? (
                <p className="text-sm font-medium text-rose-700">
                  {t('completeFields')}
                </p>
              ) : null}
              <Button
                className="h-12 w-full text-base"
                onClick={() => {
                  setDetailsAttempted(true)
                  if (!detailsReady) {
                    setError(t('allFieldsRequired'))
                    return
                  }
                  setError('')
                  setStep('confirm')
                }}
              >
                {t('next')}
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
                      selectedBooking.date,
                      selectedBooking.program,
                      selectedBooking.code,
                    ).map((item) => guestDisplayName(item))
                  : []
            }
            boat={
              selectedBooking
                ? (getDayBoatPlan(selectedBooking.date, selectedBooking.program).assignments[
                    selectedBooking.code
                  ] ?? null)
                : null
            }
            boatPlan={
              selectedBooking
                ? getDayBoatPlan(selectedBooking.date, selectedBooking.program)
                : null
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
  const { t } = useCheckInI18n()
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
      <StepHeading title={t('confirmTitle')} subtitle={t('confirmSub')} />
      <div className="gday-sheet space-y-4 rounded-[1.5rem] p-5">
        <DetailRow label={t('program')} value={programLabel(booking.program)} />
        <DetailRow label={t('dateLabel')} value={formatLongDate(booking.date)} />
        <DetailRow label={t('leaderName')} value={booking.leadGuest} />
        <DetailRow label={t('bookingCode')} value={booking.code} />
        <DetailRow label={t('hotelName')} value={booking.pickupHotel || booking.pickupZone || '—'} />
        <DetailRow
          label={t('totalPax')}
          value={formatGuestPaxLabel(booking)}
        />
        <DetailRow label={t('nationalPark')} value={formatIncludeLabel(booking.parkFee)} />
        {booking.program === 'James Bond' ? (
          <DetailRow label={t('canoe')} value={formatIncludeLabel(booking.canoe)} />
        ) : null}
        {due.parkFeeAmount > 0 ? (
          <DetailRow
            label={t('parkFeeCollect')}
            value={`${due.parkFeeAmount.toLocaleString('en-US')} THB`}
          />
        ) : null}
        {due.cashNote ? (
          <DetailRow
            label={t('cashOnTour')}
            value={
              due.cashAmount > 0
                ? `${due.cashAmount.toLocaleString('en-US')} THB`
                : due.cashNote
            }
          />
        ) : (
          <DetailRow label={t('cashOnTour')} value={t('none')} />
        )}
        {due.amount > 0 ? (
          <DetailRow
            label={t('totalCollect')}
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
            {t('checkingInGuests', {
              count: guests.length,
              plural: englishPlural(guests.length),
              group: scope === 'group' ? t('wholeGroupNote') : '',
            })}
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
                  {t('birthdayShort')} {birthday ? formatLongDate(birthday) : '—'} · {t('passportShort')}{' '}
                  {guest.passportNumber.trim() || '—'}
                </p>
              </div>
            )
          })}
          {!leadMatch && first ? (
            <p className="text-xs text-amber-800/80">
              {t('nameDiffers')}
            </p>
          ) : null}
        </div>

        {due.needsStaff ? (
          <div className="flex gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-3 text-sm text-orange-950/85">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-orange-600" />
            {t('paymentAfter')}
          </div>
        ) : (
          <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-950/80">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            {t('noCash')}
          </div>
        )}

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}

        <Button className="h-12 w-full text-base" onClick={onConfirm}>
          {t('confirmFinish')}
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
  const { t } = useCheckInI18n()
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
      hotelName={booking?.pickupHotel.trim() || ''}
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
              {t('paymentNeeded')}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-orange-950/70">
              {parkExcluded ? t('payPark') : t('payStaff')}
            </p>
          </div>
          {boarding}
          <Button variant="outline" className="h-11 w-full" onClick={onAgain}>
            {t('checkInAnother')}
          </Button>
        </section>

        {showParkNote ? (
          <section className="rounded-[1.5rem] border border-teal-900/10 bg-white/80 px-4 py-4 text-left text-sm leading-relaxed text-teal-950/75">
            <p className="font-semibold tracking-wide text-teal-950 uppercase">
              {t('parkNoteTitle')}
            </p>
            <p className="mt-2">{t('parkNote1')}</p>
            <p className="mt-2 font-medium text-teal-950">{t('parkNote2')}</p>
            <p className="mt-2">{t('parkNote3')}</p>
            <p className="mt-3 text-xs font-semibold tracking-wide text-teal-900/55 uppercase">
              {t('management')}
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
          {t('successTitle')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-emerald-950/70">{t('successBody')}</p>
      </div>
      {boarding}
      <Button variant="outline" className="h-11 w-full" onClick={onAgain}>
        {t('checkInAnother')}
      </Button>
    </section>
  )
}

function BoardingSummary({
  names,
  hotelName,
  boat,
  boatLabel,
}: {
  names: string[]
  hotelName: string
  boat: number | null
  boatLabel: string | null
}) {
  const { t } = useCheckInI18n()
  const theme = boat && boat > 0 ? boatTheme(boat) : null

  return (
    <div className="space-y-3 text-left">
      <div className="rounded-2xl bg-white/80 px-4 py-3.5 ring-1 ring-teal-900/8">
        <p className="text-[11px] font-semibold tracking-wide text-teal-800/50 uppercase">
          {names.length === 1 ? t('guest') : t('guests')}
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

      <div className="rounded-2xl bg-white/80 px-4 py-3.5 ring-1 ring-teal-900/8">
        <p className="text-[11px] font-semibold tracking-wide text-teal-800/50 uppercase">
          {t('hotelName')}
        </p>
        <p className="mt-1 text-base font-semibold text-teal-950">
          {hotelName || '—'}
        </p>
      </div>

      {theme && boatLabel ? (
        <div
          className={cn(
            'rounded-2xl px-4 py-4 ring-1',
            theme.sheet,
            theme.ring.replace('ring-', 'ring-'),
          )}
        >
          <p className="text-[11px] font-semibold tracking-wide uppercase opacity-70">{t('yourBoat')}</p>
          <div className="mt-2 flex items-center gap-3">
            <span className={cn('size-10 shrink-0 rounded-xl shadow-sm', theme.swatch)} />
            <div className="min-w-0">
              <p className={cn('font-display text-xl font-semibold tracking-tight', theme.title)}>
                {boatLabel}
              </p>
              <p className={cn('mt-0.5 text-sm font-semibold', theme.title)}>
                {theme.colorName}
                <span className="mx-1.5 opacity-40">·</span>
                {t('boat')} {theme.fleetNumber}
              </p>
            </div>
            <BoatFleetBadge boat={boat} showColorName className="ml-auto text-sm" />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white/80 px-4 py-3.5 ring-1 ring-teal-900/8">
          <p className="text-[11px] font-semibold tracking-wide text-teal-800/50 uppercase">
            {t('yourBoat')}
          </p>
          <p className="mt-1 text-sm font-medium text-teal-900/55">
            {t('boatUnassigned')}
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
  const { t } = useCheckInI18n()
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
                {t('guestsCount', { count: total, plural: englishPlural(total) })} ·{' '}
                {booking.pickupHotel || booking.pickupZone || '—'}
              </p>
            </div>
            {done ? (
              <span className="shrink-0 text-[11px] font-semibold text-emerald-700">{t('checkedIn')}</span>
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
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  required?: boolean
  showError?: boolean
  errorText?: string
  hint?: string
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
        spellCheck={false}
        lang="en"
        aria-invalid={showError || undefined}
        className={cn(showError && 'border-rose-400 focus-visible:border-rose-500')}
        onChange={(event) => onChange(event.target.value)}
      />
      {showError && errorText ? (
        <p className="mt-1.5 text-xs font-medium text-rose-700">{errorText}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[11px] text-teal-900/45">{hint}</p>
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
  const { t } = useCheckInI18n()
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
        {t('birthday')}
        {required ? <span className="text-rose-600"> *</span> : null}
      </Label>
      <div className="grid grid-cols-3 gap-2">
        <select
          aria-label={t('year')}
          className={selectClass}
          value={year}
          onChange={(event) => onYearChange(event.target.value)}
        >
          <option value="">{t('year')}</option>
          {birthYearOptions().map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
        <select
          aria-label={t('month')}
          className={selectClass}
          value={month}
          onChange={(event) => onMonthChange(event.target.value)}
        >
          <option value="">{t('month')}</option>
          {MONTH_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          aria-label={t('date')}
          className={selectClass}
          value={day}
          onChange={(event) => onDayChange(event.target.value)}
        >
          <option value="">{t('date')}</option>
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
          {t('birthdayRequired')}
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
