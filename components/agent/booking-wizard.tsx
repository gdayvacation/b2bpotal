'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Ban,
  Bus,
  CalendarIcon,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Minus,
  Mountain,
  Plus,
  Ship,
} from 'lucide-react'
import { AmendmentPolicyNotice } from '@/components/amendment-policy-notice'
import { usePortal } from '@/components/portal-provider'
import { HotelCombobox, hotelQueryHasMatches } from '@/components/hotel-combobox'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { dateFromISO, formatIncludeLabel, formatLongDate, nextBookingCode, startOfToday, toISODate, todayISO, uniqueAgentSlug } from '@/lib/format'
import { usePortalTodayISO } from '@/lib/use-portal-today'
import { cn } from '@/lib/utils'
import { duplicateBookingMessage, findDuplicateBookings } from '@/lib/booking-duplicates'
import type { BookingImageDraft } from '@/lib/booking-from-image'
import { matchAgentFromSeed, matchZoneFromSeed } from '@/lib/booking-import-resolve'
import {
  formatPaxBreakdown,
  formatPrivateTransferPrice,
  formatPrivateTransferZone,
  isNoTransfer,
  isPrivateTransferZone,
  NO_TRANSFER_ZONE,
  PRIVATE_TRANSFER_OPTIONS,
  privateTransferAreaName,
  type Agent,
  type Booking,
  type Hotel,
  type IncludeOption,
  type PickupZoneName,
  type PrivateTransferVehicle,
  type Program,
} from '@/lib/types'

const CORE_STEPS = [
  'Select Program',
  'Tour Date',
  'Guests',
  'Pickup',
  'Review',
] as const

/** Prefer earliest open travel day (Bangkok). Today stays closed after the day-before cutoff. */
function defaultTourDate(earliestBookableDate: () => string): Date {
  return dateFromISO(earliestBookableDate())
}

type ResolvedAgent = { slug: string; name: string }

function PickupTypeButton({
  selected,
  embedded = false,
  tone,
  index,
  title,
  subtitle,
  icon,
  onClick,
}: {
  selected: boolean
  embedded?: boolean
  tone: 'teal' | 'sky' | 'amber'
  index: number
  title: string
  subtitle: string
  icon: ReactNode
  onClick: () => void
}) {
  const toneClass = {
    teal: selected
      ? 'border-teal-700 bg-teal-50 ring-2 ring-teal-700'
      : 'border-teal-300 bg-teal-50/80 hover:border-teal-500',
    sky: selected
      ? 'border-sky-700 bg-sky-50 ring-2 ring-sky-700'
      : 'border-sky-300 bg-sky-50/80 hover:border-sky-500',
    amber: selected
      ? 'border-amber-700 bg-amber-50 ring-2 ring-amber-700'
      : 'border-amber-300 bg-amber-50/80 hover:border-amber-500',
  }[tone]
  const markClass = {
    teal: selected ? 'border-teal-700 bg-teal-700 text-white' : 'border-teal-400 bg-white',
    sky: selected ? 'border-sky-700 bg-sky-700 text-white' : 'border-sky-400 bg-white',
    amber: selected ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-400 bg-white',
  }[tone]
  const iconClass = {
    teal: 'bg-teal-700 text-white',
    sky: 'bg-sky-700 text-white',
    amber: 'bg-amber-700 text-white',
  }[tone]
  const textClass = {
    teal: 'text-teal-950',
    sky: 'text-sky-950',
    amber: 'text-amber-950',
  }[tone]
  const subClass = {
    teal: 'text-teal-900/65',
    sky: 'text-sky-900/65',
    amber: 'text-amber-900/70',
  }[tone]

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all',
        embedded ? 'bg-transparent' : cn('rounded-2xl border-2', toneClass),
      )}
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
          markClass,
        )}
      >
        {selected ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', iconClass)}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block font-semibold', textClass)}>
          {index}. {title}
        </span>
        <span className={cn('mt-0.5 block text-xs', subClass)}>{subtitle}</span>
      </span>
      <span className={cn('shrink-0 text-xs font-semibold', selected ? textClass : 'opacity-50')}>
        {selected ? 'Selected' : 'Choose'}
      </span>
    </button>
  )
}

export function BookingWizard({
  agent,
  selectAgent = false,
  title = 'New Booking',
  description = 'Create a partner booking in a few clear steps.',
  eyebrow,
  seed = null,
  onSuccess,
}: {
  /** Locked agent for partner booking links. */
  agent?: Agent
  /** Admin flow: choose an existing agent or create a new one (syncs to Invoice setup). */
  selectAgent?: boolean
  title?: string
  description?: string
  eyebrow?: string
  /** Prefill from AI chat-screenshot extract — admin still confirms before save. */
  seed?: BookingImageDraft | null
  onSuccess?: (booking: Booking) => void
}) {
  const router = useRouter()
  const {
    addAgent,
    addBooking,
    addHotel,
    agents,
    bookings,
    bookedPaxFor,
    bookingCutoffs,
    earliestBookableDate,
    getBookingClosure,
    getCapacity,
    getZoneTime,
    hotels,
    isBookingOpen,
    isProgramClosed,
    zones,
  } = usePortal()

  const steps = useMemo(
    () => (selectAgent ? (['Agent', ...CORE_STEPS] as string[]) : [...CORE_STEPS]),
    [selectAgent],
  )
  const programStep = selectAgent ? 1 : 0
  const dateStep = programStep + 1
  const guestsStep = programStep + 2
  const pickupStep = programStep + 3
  const reviewStep = programStep + 4

  const seededAgent = useMemo(
    () => (seed?.agentName ? matchAgentFromSeed(agents, seed.agentName) : null),
    [seed?.agentName, agents],
  )
  const seededFromChat = Boolean(seed)

  const [step, setStep] = useState(() => {
    if (!seed || !selectAgent) return 0
    // Jump to Review so admin can scan the AI draft, then step back to fix anything.
    return CORE_STEPS.length // Agent + CORE → last index
  })
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string | null>(
    agent?.slug ?? seededAgent?.slug ?? null,
  )
  const [agentMode, setAgentMode] = useState<'existing' | 'new'>(() => {
    if (agent || seededAgent) return 'existing'
    if (seed?.agentName?.trim()) return 'new'
    return 'existing'
  })
  const [newAgentName, setNewAgentName] = useState(
    () => (!seededAgent && seed?.agentName ? seed.agentName : ''),
  )
  const [agentRef, setAgentRef] = useState(() => seed?.agentRef ?? '')
  const [program, setProgram] = useState<Program | null>(() => seed?.program ?? null)
  const [parkFee, setParkFee] = useState<IncludeOption>(() => seed?.parkFee ?? 'Included')
  const [canoe, setCanoe] = useState<IncludeOption>(() => seed?.canoe ?? 'Included')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [duplicateText, setDuplicateText] = useState('')
  const [pendingProgram, setPendingProgram] = useState<Program | null>(null)
  const [draftParkFee, setDraftParkFee] = useState<IncludeOption>('Included')
  const [draftCanoe, setDraftCanoe] = useState<IncludeOption>('Included')
  const portalToday = usePortalTodayISO()
  const prevTodayRef = useRef(portalToday)
  const [date, setDate] = useState<Date | undefined>(() => {
    if (seed?.date) {
      try {
        return dateFromISO(seed.date)
      } catch {
        /* fall through */
      }
    }
    return selectAgent ? dateFromISO(todayISO()) : defaultTourDate(earliestBookableDate)
  })

  // Bangkok day change or cutoff settings: agents jump off a closed today; admin may keep any date.
  useEffect(() => {
    prevTodayRef.current = portalToday
    setDate((current) => {
      const currentIso = current ? toISODate(current) : ''
      if (selectAgent) {
        if (currentIso) return current
        return dateFromISO(portalToday)
      }
      if (currentIso && isBookingOpen(currentIso) && currentIso >= portalToday) {
        return current
      }
      return defaultTourDate(earliestBookableDate)
    })
  }, [
    portalToday,
    selectAgent,
    bookingCutoffs.bookBeforeDays,
    bookingCutoffs.bookUntilTime,
    earliestBookableDate,
    isBookingOpen,
  ])

  const [adults, setAdults] = useState(() =>
    seed ? Math.max(0, seed.adults) : 2,
  )
  const [children, setChildren] = useState(() => (seed ? Math.max(0, seed.children) : 0))
  const [infants, setInfants] = useState(() => (seed ? Math.max(0, seed.infants) : 0))
  const [tourLeaders, setTourLeaders] = useState(() =>
    seed ? Math.max(0, seed.tourLeaders) : 0,
  )
  const [leadGuest, setLeadGuest] = useState(() => seed?.leadGuest ?? '')
  const [cashOnTour, setCashOnTour] = useState(() => seed?.cashOnTour ?? '')
  const [pickupZone, setPickupZone] = useState<PickupZoneName | null>(() => {
    if (!seed?.pickupZone || isPrivateTransferZone(seed.pickupZone)) return null
    return matchZoneFromSeed(zones, seed.pickupZone) ?? seed.pickupZone
  })
  const [joinPickup, setJoinPickup] = useState(
    () =>
      Boolean(
        seed?.pickupZone &&
          !isPrivateTransferZone(seed.pickupZone) &&
          !isNoTransfer(seed.pickupZone),
      ),
  )
  const [privatePickup, setPrivatePickup] = useState(
    () => Boolean(seed?.pickupZone && isPrivateTransferZone(seed.pickupZone)),
  )
  const [privateArea, setPrivateArea] = useState<string | null>(() => {
    const area = privateTransferAreaName(seed?.pickupZone ?? '')
    return area || null
  })
  const [privateAreaOther, setPrivateAreaOther] = useState('')
  const [privateVehicle, setPrivateVehicle] = useState<'' | PrivateTransferVehicle>('')
  const [pickupHotel, setPickupHotel] = useState(() => seed?.pickupHotel ?? '')
  const [roomNumber, setRoomNumber] = useState(() => seed?.roomNumber ?? '')
  const [note, setNote] = useState(() => {
    if (!seed) return ''
    const bits = [seed.note, seed.rawNotes].map((item) => item.trim()).filter(Boolean)
    return bits.join('\n')
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const seedAgentApplied = useRef(Boolean(seededAgent || !seed?.agentName))

  // Agents often hydrate after first paint — re-match AI agency name once available.
  useEffect(() => {
    if (!seed?.agentName || seedAgentApplied.current) return
    const matched = matchAgentFromSeed(agents, seed.agentName)
    if (matched) {
      setSelectedAgentSlug(matched.slug)
      setAgentMode('existing')
      setNewAgentName('')
      seedAgentApplied.current = true
      return
    }
    if (agents.length > 0) {
      setAgentMode('new')
      setNewAgentName(seed.agentName)
      seedAgentApplied.current = true
    }
  }, [agents, seed?.agentName])

  // Join transfer takes its zone from the hotel. The agent does not pick a zone.
  useEffect(() => {
    if (!joinPickup) return
    const name = pickupHotel.trim().toLowerCase()
    if (!name) {
      setPickupZone(null)
      return
    }
    if (name === 'other') {
      setPickupZone(zones.some((zone) => zone.name === 'Other') ? 'Other' : null)
      return
    }
    const hotel = hotels.find(
      (item) => item.active && item.name.toLowerCase() === name,
    )
    if (!hotel) {
      const unmatched =
        !selectAgent && !hotelQueryHasMatches(hotels, pickupHotel)
      setPickupZone(
        unmatched && zones.some((zone) => zone.name === 'Other') ? 'Other' : null,
      )
      return
    }
    if (hotel.zoneName && zones.some((zone) => zone.name === hotel.zoneName)) {
      setPickupZone(hotel.zoneName)
      return
    }
    setPickupZone(zones.some((zone) => zone.name === 'Other') ? 'Other' : null)
  }, [joinPickup, pickupHotel, hotels, zones, selectAgent])

  // An unlisted hotel on a private transfer uses the Other area.
  useEffect(() => {
    if (!privatePickup || selectAgent) return
    const name = pickupHotel.trim()
    if (!name) return
    const listed = hotels.some(
      (hotel) => hotel.active && hotel.name.toLowerCase() === name.toLowerCase(),
    )
    if (listed) return
    if (name.toLowerCase() !== 'other' && hotelQueryHasMatches(hotels, name)) return
    setPrivateArea((current) => (current?.toLowerCase() === 'other' ? current : 'Other'))
    setPrivateAreaOther('')
  }, [privatePickup, selectAgent, pickupHotel, hotels])

  // Match a seeded private area to a live zone name, or keep it as Other.
  useEffect(() => {
    if (!privatePickup || !privateArea || zones.length === 0) return
    if (privateArea.trim().toLowerCase() === 'other') return
    const match = zones.find(
      (zone) => zone.name.toLowerCase() === privateArea.trim().toLowerCase(),
    )
    if (match) {
      if (match.name !== privateArea) setPrivateArea(match.name)
      return
    }
    setPrivateAreaOther((current) => current || privateArea.trim())
    setPrivateArea('Other')
  }, [zones, privatePickup, privateArea])

  function openProgramOptions(next: Program) {
    setPendingProgram(next)
    setDraftParkFee(program === next ? parkFee : 'Included')
    setDraftCanoe(program === next ? canoe : 'Included')
    setOptionsOpen(true)
    setError('')
  }

  function confirmProgramOptions() {
    if (!pendingProgram) return
    setProgram(pendingProgram)
    setParkFee(draftParkFee)
    setCanoe(pendingProgram === 'James Bond' ? draftCanoe : 'Included')
    setOptionsOpen(false)
    setPendingProgram(null)
    setError('')
    setStep((current) => Math.min(current + 1, steps.length - 1))
  }

  const activeAgents = useMemo(
    () => agents.filter((item) => item.status === 'Active').slice().sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  )

  const resolvedAgent: ResolvedAgent | null = useMemo(() => {
    if (!selectAgent && agent) return { slug: agent.slug, name: agent.name }
    if (agentMode === 'new') {
      const name = newAgentName.trim().replace(/\s+/g, ' ')
      if (name.length < 2) return null
      const existing = agents.find(
        (item) => item.name.toLowerCase() === name.toLowerCase(),
      )
      if (existing) return { slug: existing.slug, name: existing.name }
      return { slug: uniqueAgentSlug(name, agents.map((item) => item.slug)), name }
    }
    const found = agents.find((item) => item.slug === selectedAgentSlug)
    return found ? { slug: found.slug, name: found.name } : null
  }, [selectAgent, agent, agentMode, newAgentName, selectedAgentSlug, agents])

  const total = adults + children + infants + tourLeaders
  const isoDate = date ? toISODate(date) : ''
  const confirmationNumber = useMemo(() => {
    if (!program || !isoDate) return '—'
    return nextBookingCode(
      program,
      isoDate,
      bookings.map((booking) => booking.code),
    )
  }, [bookings, isoDate, program])
  const bookingOpen = !isoDate || isBookingOpen(isoDate)
  const programClosedOnDate =
    Boolean(program && isoDate) && isProgramClosed(isoDate, program!)
  const programClosed = programClosedOnDate && !selectAgent
  const closureNote =
    program && isoDate ? getBookingClosure(isoDate, program)?.reason ?? '' : ''
  const capacityInfo = useMemo(() => {
    if (!program || !isoDate) return null
    const caps = getCapacity(isoDate)
    const capacity = program === 'PP' ? caps.ppCapacity : caps.jamesBondCapacity
    const booked = bookedPaxFor(isoDate, program)
    const seatsLeft = Math.max(0, capacity - booked)
    return { capacity, booked, seatsLeft }
  }, [program, isoDate, getCapacity, bookedPaxFor])
  const seatsLeft = capacityInfo?.seatsLeft ?? null
  const overCapacity = seatsLeft !== null ? total > seatsLeft : false
  const hasSeats = seatsLeft === null || seatsLeft > 0
  // Admin (selectAgent) ignores cutoff / program-closed — only seats matter.
  const dateSelectable = selectAgent
    ? Boolean(date) && hasSeats
    : Boolean(date) && bookingOpen && !programClosed && hasSeats
  const pickupTime =
    !privatePickup && pickupZone && !isNoTransfer(pickupZone) ? getZoneTime(pickupZone) : ''
  const selectedZone = zones.find((zone) => zone.name === pickupZone)
  const noTransfer = isNoTransfer(pickupZone)
  const pendingPickup = !privatePickup && !noTransfer && (selectedZone?.pending ?? false)
  const privateZoneChoices = useMemo(() => {
    const names = zones
      .map((zone) => zone.name)
      .filter((name) => !isNoTransfer(name) && !isPrivateTransferZone(name))
    if (!names.some((name) => name.toLowerCase() === 'other')) names.push('Other')
    return names
  }, [zones])
  const privateAreaName = useMemo(() => {
    if (!privatePickup || !privateArea) return ''
    if (privateArea.trim().toLowerCase() === 'other') return privateAreaOther.trim() || 'Other'
    return privateArea.trim()
  }, [privatePickup, privateArea, privateAreaOther])
  const resolvedPickupZone = noTransfer
    ? NO_TRANSFER_ZONE
    : privatePickup
      ? privateAreaName
        ? formatPrivateTransferZone(privateAreaName)
        : null
      : pickupZone
  const privateVehicleOption =
    PRIVATE_TRANSFER_OPTIONS.find((option) => option.vehicle === privateVehicle) ?? null
  const privateVehicleFits = !privateVehicleOption || total <= privateVehicleOption.maxPax
  const matchedHotel = useMemo(() => {
    const name = pickupHotel.trim().toLowerCase()
    if (!name) return null
    return hotels.find((hotel) => hotel.name.toLowerCase() === name) ?? null
  }, [hotels, pickupHotel])
  const transferExtraChargePreview = matchedHotel?.extraChargeTransfer.trim() ?? ''

  function zoneNameForHotel(hotel: Hotel) {
    if (hotel.zoneName && zones.some((zone) => zone.name === hotel.zoneName)) {
      return hotel.zoneName
    }
    if (zones.some((zone) => zone.name === 'Other') || privatePickup) return 'Other'
    return null
  }

  function rememberCustomHotel(name: string) {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (trimmed.length < 2) return
    const existing = hotels.find((hotel) => hotel.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      setPickupHotel(existing.name)
      if (!noTransfer) applyHotelSelection(existing)
      return
    }
    let zoneName: string | null = null
    if (privatePickup && privateArea && privateArea.toLowerCase() !== 'other') {
      zoneName = zones.some((zone) => zone.name === privateArea) ? privateArea : null
    } else if (!noTransfer && pickupZone && !isNoTransfer(pickupZone)) {
      zoneName = zones.some((zone) => zone.name === pickupZone) ? pickupZone : null
    }
    addHotel(trimmed, zoneName, '')
    setPickupHotel(trimmed)
  }

  function applyHotelSelection(hotel: Hotel) {
    setPickupHotel(hotel.name)
    const zoneName = zoneNameForHotel(hotel)
    if (privatePickup) {
      if (zoneName) {
        setPrivateArea(zoneName)
        if (zoneName.toLowerCase() !== 'other') setPrivateAreaOther('')
      }
      setError('')
      return
    }
    if (zoneName) setPickupZone(zoneName)
    setError('')
  }

  const canContinue = useMemo(() => {
    if (selectAgent && step === 0) return resolvedAgent !== null
    if (step === programStep) return program !== null
    if (step === dateStep) return Boolean(date) && dateSelectable
    if (step === guestsStep)
      return (
        adults + children + infants + tourLeaders > 0 &&
        leadGuest.trim().length > 1 &&
        !overCapacity
      )
    if (step === pickupStep) {
      if (noTransfer) return true
      if (privatePickup) return Boolean(privateAreaName && privateVehicleOption && privateVehicleFits)
      return (
        joinPickup && pickupZone !== null && zones.some((zone) => zone.name === pickupZone)
      )
    }
    if (step === reviewStep) return !overCapacity
    return true
  }, [
    selectAgent,
    step,
    resolvedAgent,
    programStep,
    program,
    dateStep,
    date,
    dateSelectable,
    overCapacity,
    guestsStep,
    adults,
    children,
    infants,
    tourLeaders,
    leadGuest,
    pickupStep,
    pickupZone,
    zones,
    noTransfer,
    joinPickup,
    privatePickup,
    privateAreaName,
    privateVehicleOption,
    privateVehicleFits,
    reviewStep,
  ])

  function next() {
    if (!canContinue) {
      setError(
        selectAgent && step === 0
          ? agentMode === 'new'
            ? 'Enter the new agent or agency name.'
            : 'Select an agent.'
          : step === programStep
            ? 'Please select a program.'
            : step === dateStep
              ? seatsLeft === 0
                ? selectAgent
                  ? 'This date is sold out for the selected program. Admin cannot exceed the boat seat limit.'
                  : 'This date is sold out for the selected program.'
                : !selectAgent && !bookingOpen
                  ? 'Booking is closed for this travel date.'
                  : !selectAgent && programClosed
                    ? closureNote
                      ? `Booking closed for this program — ${closureNote}`
                      : 'Booking is closed for this program on this date.'
                    : 'Please choose a tour date.'
              : step === guestsStep
                ? adults + children + infants + tourLeaders <= 0
                  ? 'Add at least one passenger.'
                  : overCapacity
                    ? `Only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left on this date.`
                    : 'Enter the guest name.'
                : !joinPickup && !privatePickup
                  ? 'Choose one pickup type.'
                  : privatePickup && !privateVehicleOption
                    ? 'Choose Car / SUV or VAN.'
                    : privatePickup && !privateVehicleFits
                      ? privateVehicleOption?.vehicle === 'Car'
                        ? 'Car / SUV is for 1–4 guests. Choose VAN for a larger group.'
                        : 'VAN takes up to 12 guests.'
                      : privatePickup
                        ? 'Select a zone for the private transfer, or choose Other.'
                        : joinPickup
                          ? 'Enter a saved hotel. The zone and pickup time come from the hotel.'
                          : 'Select a pickup zone, or choose No Transfer.',
      )
      return
    }

    if (step === pickupStep && !selectAgent) {
      const resolvedHotel = resolveAgentHotelName(pickupHotel)
      if (resolvedHotel === null) {
        setError('Choose a saved hotel from the list, or leave a name that is not listed to use Other.')
        return
      }
      applyUnlistedHotel(pickupHotel)
    }

    if (selectAgent && step === 0 && agentMode === 'new') {
      const trimmed = newAgentName.trim().replace(/\s+/g, ' ')
      const existing = agents.find(
        (item) => item.name.toLowerCase() === trimmed.toLowerCase(),
      )
      if (existing) {
        setSelectedAgentSlug(existing.slug)
        setAgentMode('existing')
        setNewAgentName('')
      } else {
        const createError = addAgent(trimmed)
        if (createError) {
          setError(createError)
          return
        }
        const slug = uniqueAgentSlug(
          trimmed,
          agents.map((item) => item.slug),
        )
        setSelectedAgentSlug(slug)
        setAgentMode('existing')
        setNewAgentName('')
      }
    }

    setError('')
    setStep((current) => Math.min(current + 1, steps.length - 1))
  }

  function resolveAgentHotelName(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return ''
    const exact = hotels.find(
      (hotel) => hotel.active && hotel.name.toLowerCase() === trimmed.toLowerCase(),
    )
    if (exact) return exact.name
    if (trimmed.toLowerCase() === 'other') return 'Other'
    if (!hotelQueryHasMatches(hotels, trimmed)) return 'Other'
    return null
  }

  function applyUnlistedHotel(name: string) {
    if (selectAgent) return
    if (resolveAgentHotelName(name) !== 'Other') return
    if (name.trim().toLowerCase() === 'other') return
    setPickupHotel('Other')
    if (privatePickup) {
      setPrivateArea('Other')
      setPrivateAreaOther('')
    }
  }

  function confirm() {
    if (!program || !date || !resolvedPickupZone || !resolvedAgent) return
    if (!selectAgent && resolveAgentHotelName(pickupHotel) === null) {
      setError('Choose a saved hotel from the list, or leave a name that is not listed to use Other.')
      return
    }
    if (!selectAgent) applyUnlistedHotel(pickupHotel)
    if (!selectAgent && agent?.status === 'Inactive') {
      setError('This agent is inactive and cannot create bookings.')
      return
    }
    if (overCapacity) {
      setError(`Only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left on this date.`)
      return
    }
    const matches = findDuplicateBookings(bookings, {
      leadGuest: leadGuest.trim(),
      date: isoDate,
      program,
    })
    if (matches.length > 0) {
      setDuplicateText(duplicateBookingMessage(matches))
      setDuplicateOpen(true)
      return
    }
    void saveBooking()
  }

  async function saveBooking() {
    if (!program || !date || !resolvedPickupZone || !resolvedAgent || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    let result: Awaited<ReturnType<typeof addBooking>>
    try {
      result = await addBooking(
        {
          agentSlug: resolvedAgent.slug,
          agentName: resolvedAgent.name,
          agentRef: agentRef.trim(),
          program,
          date: isoDate,
          parkFee,
          canoe: program === 'James Bond' ? canoe : null,
          adults,
          children,
          infants,
          tourLeaders,
          leadGuest: leadGuest.trim(),
          pickupZone: resolvedPickupZone,
          pickupHotel: selectAgent
            ? pickupHotel.trim()
            : (resolveAgentHotelName(pickupHotel) ?? 'Other'),
          roomNumber: roomNumber.trim(),
          note: note.trim(),
          cashOnTour: cashOnTour.trim(),
          ...(privatePickup && privateVehicle
            ? { privateTransferVehicle: privateVehicle }
            : {}),
        },
        { bypassCutoff: selectAgent },
      )
    } catch (err) {
      savingRef.current = false
      setSaving(false)
      setError(err instanceof Error ? err.message : 'Could not save this booking.')
      return
    }
    if (!result.ok) {
      savingRef.current = false
      setSaving(false)
      setError(result.error)
      return
    }
    // Stay locked until navigation unmounts the wizard; on a slow connection the
    // button would otherwise re-enable and a second click creates a duplicate.
    setDuplicateOpen(false)
    if (onSuccess) {
      onSuccess(result.booking)
      return
    }
    router.push(`/agent/${resolvedAgent.slug}/confirmed/${result.booking.code}`)
  }

  const headerEyebrow = eyebrow ?? (!selectAgent ? agent?.name : undefined)

  function pickupHotelFields(optional: boolean) {
    return (
      <div className="flex w-full gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={optional ? 'hotel-no-transfer' : 'hotel'}>
            {optional ? 'Hotel (optional)' : 'Pickup Hotel'}
          </Label>
          <HotelCombobox
            id={optional ? 'hotel-no-transfer' : 'hotel'}
            hotels={hotels}
            value={pickupHotel}
            onChange={(next) => {
              setPickupHotel(next)
              setError('')
            }}
            onSelectHotel={
              optional
                ? (hotel) => {
                    setPickupHotel(hotel.name)
                    setError('')
                  }
                : applyHotelSelection
            }
            allowCreate={selectAgent}
            onSelectOther={(typed) => {
              if (selectAgent) {
                const name = typed.trim()
                if (name) rememberCustomHotel(name)
              } else {
                setPickupHotel('Other')
              }
              if (optional) {
                setError('')
                return
              }
              if (privatePickup) {
                setPrivateArea('Other')
                setPrivateAreaOther('')
                setError('')
                return
              }
              if (zones.some((zone) => zone.name === 'Other')) {
                setPickupZone('Other')
              }
              setError('')
            }}
            onCommit={(typed) => applyUnlistedHotel(typed)}
          />
          <p className="text-xs text-neutral-500">
            {selectAgent
              ? 'Type a few letters to see saved hotels, including similar names. The last line adds a new hotel and keeps it in the list.'
              : 'Type a few letters to see saved hotels. If nothing is listed, the hotel and zone are Other.'}
          </p>
        </div>
        <div className="w-[7.5rem] shrink-0 space-y-2 sm:w-32">
          <Label htmlFor={optional ? 'room-number-no-transfer' : 'room-number'}>Room</Label>
          <Input
            id={optional ? 'room-number-no-transfer' : 'room-number'}
            value={roomNumber}
            onChange={(event) => setRoomNumber(event.target.value)}
            className="h-11"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 sm:mb-7">
        {headerEyebrow ? <p className="gday-soft-label mb-1.5">{headerEyebrow}</p> : null}
        <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-teal-950 sm:text-[1.85rem]">
          {title}
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-teal-950/55">{description}</p>
        {seededFromChat ? (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-sm text-sky-950">
            <p className="font-medium">Seeded from chat screenshot</p>
            <p className="mt-1 text-sky-950/75">
              Review every field below (use Back to edit steps). Nothing is saved until you confirm.
              {seed?.confidence ? (
                <>
                  {' '}
                  AI confidence: <span className="font-medium">{seed.confidence}</span>.
                </>
              ) : null}
            </p>
            {seed?.warnings?.length ? (
              <ul className="mt-2 space-y-0.5 text-sky-950/80">
                {seed.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <ol
        className={cn(
          'mb-5 hidden gap-2 sm:grid',
          steps.length >= 6 ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-5',
        )}
      >
        {steps.map((label, index) => {
          const active = index === step
          const done = index < step
          return (
            <li key={label} className="min-w-0">
              <div
                className={cn(
                  'h-1.5 rounded-full transition-colors',
                  done || active ? 'bg-teal-700' : 'bg-teal-900/10',
                )}
              />
              <p
                className={cn(
                  'mt-2 truncate text-[11px] font-medium',
                  active ? 'text-teal-950' : 'text-teal-900/40',
                )}
              >
                {index + 1}. {label}
              </p>
            </li>
          )
        })}
      </ol>
      <div className="mb-4 sm:hidden">
        <div className="mb-2 h-2 overflow-hidden rounded-full bg-teal-900/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 transition-all"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
        <p className="text-sm font-semibold text-teal-900/65">
          Step {step + 1} of {steps.length} — {steps[step]}
        </p>
      </div>

      <div className="gday-sheet rounded-[1.5rem] p-5 sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="gday-soft-label">
              Step {step + 1} of {steps.length}
            </p>
            <h2 className="font-display mt-1 text-xl font-semibold tracking-tight text-teal-950">
              {steps[step]}
            </h2>
          </div>
        </div>

        {selectAgent && step === 0 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setAgentMode('existing')
                  setError('')
                }}
                className={cn(
                  'min-h-12 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors',
                  agentMode === 'existing'
                    ? 'border-teal-800 bg-teal-800 text-white shadow-sm shadow-teal-800/20'
                    : 'border-teal-900/10 bg-white/70 text-teal-900/65 hover:border-teal-700/30',
                )}
              >
                Existing agent
              </button>
              <button
                type="button"
                onClick={() => {
                  setAgentMode('new')
                  setSelectedAgentSlug(null)
                  setError('')
                }}
                className={cn(
                  'min-h-12 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors',
                  agentMode === 'new'
                    ? 'border-teal-800 bg-teal-800 text-white shadow-sm shadow-teal-800/20'
                    : 'border-teal-900/10 bg-white/70 text-teal-900/65 hover:border-teal-700/30',
                )}
              >
                New agent
              </button>
            </div>

            {agentMode === 'existing' ? (
              <div>
                <Label className="mb-3">Choose agent</Label>
                {activeAgents.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
                    No active agents yet. Use New agent to add one — it syncs to Invoice setup too.
                  </p>
                ) : (
                  <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                    {activeAgents.map((item) => (
                      <button
                        key={item.slug}
                        type="button"
                        onClick={() => setSelectedAgentSlug(item.slug)}
                        className={cn(
                          'rounded-2xl border p-4 text-left transition-all',
                          selectedAgentSlug === item.slug
                            ? 'border-teal-700 bg-teal-50/90 ring-1 ring-teal-700 shadow-sm shadow-teal-700/10'
                            : 'border-teal-900/10 bg-white/70 hover:border-teal-700/30',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-teal-950">{item.name}</span>
                          {selectedAgentSlug === item.slug ? <Check className="size-4 shrink-0" /> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-md space-y-2">
                <Label htmlFor="new-agent-name">New agent / agency name</Label>
                <Input
                  id="new-agent-name"
                  value={newAgentName}
                  onChange={(event) => setNewAgentName(event.target.value)}
                  className="h-11"
                  placeholder="e.g. 888 Travel"
                />
                <p className="text-xs text-neutral-500">
                  Saved to the shared agent list — shows in Invoice setup and Add Booking.
                </p>
              </div>
            )}
          </div>
        )}

        {step === programStep && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ProgramCard
                title="Phi Phi"
                subtitle="Phi Phi Islands day tour"
                selected={program === 'PP'}
                icon={<Mountain className="size-6" />}
                onSelect={() => openProgramOptions('PP')}
              />
              <ProgramCard
                title="James Bond"
                subtitle="Phang Nga Bay day tour"
                selected={program === 'James Bond'}
                icon={<Ship className="size-6" />}
                onSelect={() => openProgramOptions('James Bond')}
              />
            </div>
            {program ? (
              <p className="text-sm text-teal-900/55">
                Selected:{' '}
                <span className="font-medium text-teal-950">
                  {programDisplayName(program)}
                </span>
                <span className="text-teal-900/30"> · </span>
                Park fee {formatIncludeLabel(parkFee)}
                {program === 'James Bond' ? (
                  <>
                    <span className="text-teal-900/30"> · </span>
                    Canoe {formatIncludeLabel(canoe)}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        )}

        {step === dateStep && (
          <div className="max-w-sm space-y-3">
            <Label className="mb-2">Tour date</Label>
            <Popover>
              <PopoverTrigger
                render={
                  <Button variant="outline" className="h-11 w-full justify-start gap-2 text-left font-normal" />
                }
              >
                <CalendarIcon className="size-4 text-neutral-400" />
                {date ? formatLongDate(toISODate(date)) : 'Select a date'}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-2">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(nextDate) => {
                    setDate(nextDate)
                    setError('')
                  }}
                  disabled={(day) => {
                    // Admin can book any date, including the same travel day.
                    if (selectAgent) return false
                    if (toISODate(day) < todayISO()) return true
                    const dayIso = toISODate(day)
                    // Today closes at 23:59 Bangkok the day before — after midnight only next day+ is open.
                    if (!isBookingOpen(dayIso)) return true
                    if (program && isProgramClosed(dayIso, program)) return true
                    return false
                  }}
                  defaultMonth={date ?? startOfToday()}
                />
              </PopoverContent>
            </Popover>
            {selectAgent ? (
              <p className="rounded-xl border border-teal-200 bg-teal-50/80 px-3.5 py-2.5 text-xs leading-relaxed text-teal-900/70">
                Admin can book any date, including today (same-day travel) and closed days. Boat
                capacity still applies — cannot exceed the seats left.
              </p>
            ) : (
              <AmendmentPolicyNotice settings={bookingCutoffs} variant="compact" />
            )}
            {program && capacityInfo ? (
              <div className="space-y-3">
                {!bookingOpen && !selectAgent ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    Booking closed for this travel date — choose another day.
                  </div>
                ) : null}
                {programClosed ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {closureNote
                      ? `Booking closed for ${program} — ${closureNote}`
                      : `Booking closed for ${program} on this date — choose another day.`}
                  </div>
                ) : null}
                {selectAgent && (!bookingOpen || programClosedOnDate) ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    {programClosedOnDate && closureNote
                      ? `This date is closed for agents (${closureNote}). Admin can still book if seats remain.`
                      : 'This date is closed for agents. Admin can still book today or any other day if seats remain.'}
                  </div>
                ) : null}
                {seatsLeft === 0 ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    Sold out — {program} is at the boat limit ({capacityInfo.capacity} seats,{' '}
                    {capacityInfo.booked} booked).
                    {selectAgent
                      ? ' Admin cannot exceed the seat limit.'
                      : ' Choose another date.'}
                  </div>
                ) : !bookingOpen && !selectAgent ? null : programClosed ? null : (
                  <div className="rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-3 text-sm text-teal-900/75">
                    {selectAgent ? (
                      <>
                        <span className="font-semibold text-teal-950">{seatsLeft}</span> of{' '}
                        {capacityInfo.capacity} seats left for {program}
                        <span className="text-teal-900/40"> · {capacityInfo.booked} booked</span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-teal-950">{seatsLeft}</span> seat
                        {seatsLeft === 1 ? '' : 's'} left for {program}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {step === guestsStep && (
          <div className="space-y-5">
            {seatsLeft !== null ? (
              seatsLeft === 0 ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  Sold out — go back and choose another date.
                </div>
              ) : (
                <div
                  className={cn(
                    'rounded-xl border px-4 py-3 text-sm',
                    total > seatsLeft
                      ? 'border-rose-200 bg-rose-50 text-rose-800'
                      : 'border-teal-200 bg-teal-50/80 text-teal-900/75',
                  )}
                >
                  {total > seatsLeft
                    ? `Too many guests — only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left (boat limit ${capacityInfo?.capacity}).`
                    : `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left for this departure.`}
                </div>
              )
            ) : null}
            <section className="space-y-3 rounded-2xl border-2 border-teal-500 bg-teal-50/70 p-4">
              <h3 className="text-sm font-semibold text-teal-950">Passengers</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <GuestRow
                  label="Adults"
                  hint="12 years and above"
                  value={adults}
                  max={
                    seatsLeft !== null
                      ? Math.max(0, seatsLeft - children - infants - tourLeaders)
                      : undefined
                  }
                  onChange={setAdults}
                />
                <GuestRow
                  label="Children"
                  hint="3–11 years"
                  value={children}
                  max={
                    seatsLeft !== null
                      ? Math.max(0, seatsLeft - adults - infants - tourLeaders)
                      : undefined
                  }
                  onChange={setChildren}
                />
                <GuestRow
                  label="Infants"
                  hint="Under 3 years"
                  value={infants}
                  max={
                    seatsLeft !== null
                      ? Math.max(0, seatsLeft - adults - children - tourLeaders)
                      : undefined
                  }
                  onChange={setInfants}
                />
                <GuestRow
                  label="Tour Leaders"
                  hint="Accompanying guides"
                  value={tourLeaders}
                  max={
                    seatsLeft !== null
                      ? Math.max(0, seatsLeft - adults - children - infants)
                      : undefined
                  }
                  onChange={setTourLeaders}
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-teal-950/[0.04] px-4 py-3">
                <span className="text-sm font-medium text-teal-900/55">Total Passengers</span>
                <span className="text-right">
                  <span className="font-mono text-lg font-semibold tracking-tight text-teal-950 tabular-nums">
                    {formatPaxBreakdown({ adults, children, infants, tourLeaders })}
                  </span>
                  <span className="ml-2 text-sm text-teal-900/40">({total})</span>
                </span>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border-2 border-sky-500 bg-sky-50/70 p-4">
              <h3 className="text-sm font-semibold text-sky-950">Guest details</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="lead-guest">Guest Name</Label>
                  <Input
                    id="lead-guest"
                    name="lead-guest"
                    value={leadGuest}
                    onChange={(event) => setLeadGuest(event.target.value)}
                    autoComplete="off"
                    className="h-11"
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="agent-ref-guest">Voucher Number</Label>
                  <Input
                    id="agent-ref-guest"
                    value={agentRef}
                    onChange={(event) => setAgentRef(event.target.value)}
                    className="h-11"
                    placeholder="Optional"
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="cash-on-tour">Cash on tour</Label>
                  <Input
                    id="cash-on-tour"
                    value={cashOnTour}
                    onChange={(event) => setCashOnTour(event.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        {step === pickupStep && (
          <div className="space-y-5">
            <div>
              <Label>Choose one pickup type</Label>
              <p className="mt-1 text-xs text-neutral-500">
                Select one option. Click the selected option again to close it.
              </p>
            </div>
            <div className="space-y-3" role="radiogroup" aria-label="Choose one pickup type">
              <div
                className={cn(
                  joinPickup && 'rounded-2xl border-2 border-teal-700 bg-teal-50',
                )}
              >
              <PickupTypeButton
                selected={joinPickup}
                embedded={joinPickup}
                tone="teal"
                index={1}
                title="Join Transfer Pickup"
                subtitle="Shared van at the zone pickup time"
                icon={<Bus className="size-4" />}
                onClick={() => {
                  if (joinPickup) {
                    setJoinPickup(false)
                    setError('')
                    return
                  }
                  setJoinPickup(true)
                  setPrivatePickup(false)
                  setPrivateArea(null)
                  setPrivateAreaOther('')
                  setPrivateVehicle('')
                  if (isNoTransfer(pickupZone)) setPickupZone(null)
                  setError('')
                }}
              />
              {joinPickup ? (
                <div className="space-y-4 border-t border-teal-200 p-3">
                  {pickupHotelFields(false)}
                  {pickupZone && zones.some((zone) => zone.name === pickupZone) ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-white px-3.5 py-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold tracking-wide text-teal-900/45 uppercase">
                          Zone
                        </p>
                        <p className="truncate font-semibold text-teal-950">{pickupZone}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 text-sm text-teal-900/70">
                        <Clock3 className="size-3.5" />
                        {selectedZone?.pending ? 'Awaiting time' : pickupTime}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500">
                      Enter a hotel. Its zone and pickup time show here.
                    </p>
                  )}
                </div>
              ) : null}
              </div>
              <div
                className={cn(
                  privatePickup && 'rounded-2xl border-2 border-sky-700 bg-sky-50',
                )}
              >
              <PickupTypeButton
                selected={privatePickup}
                embedded={privatePickup}
                tone="sky"
                index={2}
                title="Private Transfers"
                subtitle="Admin will confirm the pickup time"
                icon={<Car className="size-4" />}
                onClick={() => {
                  if (privatePickup) {
                    setPrivatePickup(false)
                    setError('')
                    return
                  }
                  setPrivatePickup(true)
                  setJoinPickup(false)
                  setPickupZone(null)
                  setError('')
                }}
              />
              {privatePickup ? (
                  <div className="space-y-5 border-t border-sky-200 p-3">
                    <div>
                      <Label className="mb-2">Vehicle</Label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {PRIVATE_TRANSFER_OPTIONS.map((option, index) => {
                          const tooMany = total > option.maxPax
                          const selected = privateVehicle === option.vehicle
                          return (
                            <button
                              key={option.vehicle}
                              type="button"
                              disabled={tooMany}
                              onClick={() => {
                                setPrivateVehicle(option.vehicle)
                                setError('')
                              }}
                              className={cn(
                                'flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left transition-all',
                                tooMany && 'cursor-not-allowed opacity-45',
                                selected
                                  ? 'border-sky-800 bg-sky-700 text-white shadow-sm'
                                  : 'border-sky-200 bg-white text-sky-950 hover:border-sky-500',
                              )}
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold">
                                  {index + 1}. {option.label}
                                </span>
                                <span
                                  className={cn(
                                    'mt-0.5 block text-sm',
                                    selected ? 'text-white/80' : 'text-sky-900/70',
                                  )}
                                >
                                  {formatPrivateTransferPrice(option.priceThb)}
                                </span>
                              </span>
                              {selected ? <Check className="size-4 shrink-0" /> : null}
                            </button>
                          )
                        })}
                      </div>
                      {total > 4 ? (
                        <p className="mt-2 text-xs text-sky-900/60">
                          Car / SUV is for up to 4 guests. Larger groups use VAN.
                        </p>
                      ) : null}
                    </div>
                    {privateVehicle ? (
                      <div>
                        <Label className="mb-1">Zone</Label>
                        <p className="mb-3 text-xs text-neutral-500">
                          Select the pickup zone, or Other if it is not listed.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {privateZoneChoices.map((name) => {
                            const zone = zones.find(
                              (item) => item.name.toLowerCase() === name.toLowerCase(),
                            )
                            const selected = privateArea?.toLowerCase() === name.toLowerCase()
                            const time = zone ? getZoneTime(zone.name) : ''
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => {
                                  setPrivateArea(name)
                                  if (name.toLowerCase() !== 'other') setPrivateAreaOther('')
                                  setError('')
                                }}
                                className={cn(
                                  'flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-all',
                                  selected
                                    ? 'border-sky-800 bg-sky-700 text-white shadow-sm'
                                    : 'border-sky-200 bg-white text-sky-950 hover:border-sky-500',
                                )}
                              >
                                <span className="min-w-0 truncate font-semibold">{name}</span>
                                <span
                                  className={cn(
                                    'flex shrink-0 items-center gap-1.5 text-sm',
                                    selected ? 'text-white/85' : 'text-sky-900/55',
                                  )}
                                >
                                  <Clock3 className="size-3.5" />
                                  {zone?.pending || !time ? 'Awaiting time' : time}
                                  {selected ? <Check className="size-3.5" /> : null}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        {privateArea?.toLowerCase() === 'other' ? (
                          <div className="mt-3 max-w-md space-y-2">
                            <Label htmlFor="private-zone-other">Other zone</Label>
                            <Input
                              id="private-zone-other"
                              value={privateAreaOther}
                              onChange={(event) => setPrivateAreaOther(event.target.value)}
                              className="h-11"
                              placeholder="Area not on the list"
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {pickupHotelFields(false)}
                  </div>
              ) : null}
              </div>
              <div
                className={cn(
                  noTransfer && 'rounded-2xl border-2 border-amber-700 bg-amber-50',
                )}
              >
              <PickupTypeButton
                selected={noTransfer}
                embedded={noTransfer}
                tone="amber"
                index={3}
                title="No Transfer"
                subtitle="Guest needs no pickup"
                icon={<Ban className="size-4" />}
                onClick={() => {
                  if (noTransfer) {
                    setPickupZone(null)
                    setError('')
                    return
                  }
                  setJoinPickup(false)
                  setPrivatePickup(false)
                  setPrivateArea(null)
                  setPrivateAreaOther('')
                  setPrivateVehicle('')
                  setPickupZone(NO_TRANSFER_ZONE)
                  setError('')
                }}
              />
              {noTransfer ? (
                <div className="space-y-4 border-t border-amber-200 p-3">
                  <p className="text-sm text-neutral-600">
                    The guest will arrange their own transport. Hotel is optional and still shows on
                    the van board when set.
                  </p>
                  {pickupHotelFields(true)}
                </div>
              ) : null}
              </div>
            </div>
            <div className="max-w-md space-y-2">
              <Label htmlFor="pickup-note">Note</Label>
              <Textarea
                id="pickup-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-24"
                placeholder={
                  privatePickup ? 'Landmark, hotel wing, or anything admin should know' : undefined
                }
              />
            </div>
            {noTransfer || joinPickup ? null : privatePickup ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Admin will confirm the pickup time for you ASAP.
              </div>
            ) : pendingPickup ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Pickup time: awaiting admin to set
              </div>
            ) : pickupZone ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                Pickup time for {pickupZone}:{' '}
                <span className="font-semibold text-neutral-900">{pickupTime}</span>
              </div>
            ) : null}
            {!privatePickup && transferExtraChargePreview ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="text-[10px] font-semibold tracking-wide text-amber-800/70 uppercase">
                  Extra Charge Transfer
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words font-medium">
                  {transferExtraChargePreview}
                </p>
              </div>
            ) : null}
          </div>
        )}

        {step === reviewStep && (
          <div className="space-y-4">
            {seatsLeft !== null && total > seatsLeft ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                Over the boat limit — {total} pax vs {seatsLeft} seat
                {seatsLeft === 1 ? '' : 's'} left (capacity {capacityInfo?.capacity}). Reduce guests
                or choose another date.
              </div>
            ) : null}
            <section className="overflow-hidden rounded-2xl border border-teal-200 bg-white">
              <div className="flex items-center gap-3 bg-gradient-to-r from-teal-800 to-cyan-700 px-4 py-3 text-white">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Ship className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white/70">Booking</p>
                  <p className="truncate font-display text-lg font-semibold tracking-tight">
                    {leadGuest.trim() || '—'}
                  </p>
                </div>
                <p className="ml-auto shrink-0 text-right text-sm text-white/80">
                  {program ? programDisplayName(program) : '—'}
                  <span className="mt-0.5 block text-[11px] font-medium tracking-wide text-white/70 uppercase">
                    Confirmation number
                  </span>
                  <span className="block font-mono text-sm font-semibold tracking-tight text-white">
                    {confirmationNumber}
                  </span>
                </p>
              </div>
              <div className="space-y-4 p-4">
              <div className="rounded-xl bg-teal-50 px-4 py-3 ring-1 ring-teal-200">
                <p className="text-xs font-semibold tracking-wide text-teal-800 uppercase">Trip Date</p>
                <p className="font-display mt-1 text-2xl font-semibold tracking-tight text-teal-950">
                  {isoDate ? formatLongDate(isoDate) : '—'}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <DetailCell label="Guest name" value={leadGuest.trim() || '—'} emphasize />
                {resolvedAgent?.name || (selectAgent && agentMode === 'new') ? (
                  <DetailCell
                    label="Agent"
                    value={
                      (resolvedAgent?.name || newAgentName.trim() || '—') +
                      (selectAgent && agentMode === 'new' ? ' · New' : '')
                    }
                  />
                ) : null}
                <DetailCell label="Program" value={program ? programDisplayName(program) : '—'} />
              </dl>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <GuestStat label="Adults" value={adults} tone="teal" />
                <GuestStat label="Children" value={children} tone="cyan" />
                <GuestStat label="Infants" value={infants} tone="sky" />
                <GuestStat label="Tour leaders" value={tourLeaders} tone="amber" />
                <GuestStat
                  label="Total"
                  value={formatPaxBreakdown({ adults, children, infants, tourLeaders })}
                  hint={`${total}`}
                  tone="total"
                  className="col-span-2 sm:col-span-1"
                />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-teal-900/8 pt-4 sm:grid-cols-4">
                <DetailCell label="Park fee" value={formatIncludeLabel(parkFee)} />
                {program === 'James Bond' ? (
                  <DetailCell label="Canoe" value={formatIncludeLabel(canoe)} />
                ) : null}
                <DetailCell label="Voucher" value={agentRef.trim() || '—'} />
                <DetailCell label="Cash on tour" value={cashOnTour.trim() || '—'} wrap />
              </dl>
              </div>
            </section>

            <section
              className={cn(
                'overflow-hidden rounded-2xl border bg-white',
                noTransfer
                  ? 'border-amber-200'
                  : privatePickup
                    ? 'border-sky-200'
                    : 'border-teal-200',
              )}
            >
              <div
                className={cn(
                  'flex items-center gap-3 px-4 py-3',
                  noTransfer
                    ? 'bg-amber-50 text-amber-950'
                    : privatePickup
                      ? 'bg-sky-50 text-sky-950'
                      : 'bg-teal-50 text-teal-950',
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl text-white',
                    noTransfer ? 'bg-amber-700' : privatePickup ? 'bg-sky-700' : 'bg-teal-700',
                  )}
                >
                  {noTransfer ? (
                    <Ban className="size-4" />
                  ) : privatePickup ? (
                    <Car className="size-4" />
                  ) : (
                    <Bus className="size-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium opacity-70">Pickup</p>
                  <p className="font-semibold">
                    {noTransfer
                      ? 'No Transfer'
                      : privatePickup
                        ? 'Private Transfers'
                        : 'Join Transfer Pickup'}
                  </p>
                </div>
              </div>
              <div className="p-4">
              {noTransfer ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  <DetailCell label="Type" value="No Transfer" emphasize />
                  <DetailCell label="Hotel" value={pickupHotel || '—'} className="sm:col-span-2" wrap />
                  <DetailCell label="Room" value={roomNumber.trim() || '—'} />
                  {note.trim() ? (
                    <DetailCell label="Note" value={note.trim()} className="col-span-2 sm:col-span-4" wrap />
                  ) : null}
                </dl>
              ) : privatePickup ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  <DetailCell label="Type" value="Private transfer" emphasize />
                  <DetailCell
                    label="Vehicle"
                    value={
                      privateVehicleOption
                        ? `${privateVehicleOption.label} · ${formatPrivateTransferPrice(privateVehicleOption.priceThb)}`
                        : '—'
                    }
                    className="sm:col-span-2"
                    wrap
                  />
                  <DetailCell label="Zone" value={privateAreaName || '—'} />
                  <DetailCell label="Time" value="Admin confirms ASAP" emphasize />
                  <DetailCell label="Hotel" value={pickupHotel || '—'} className="sm:col-span-2" wrap />
                  <DetailCell label="Room" value={roomNumber.trim() || '—'} />
                  {note.trim() ? (
                    <DetailCell label="Note" value={note.trim()} className="col-span-2 sm:col-span-4" wrap />
                  ) : null}
                </dl>
              ) : (
                <>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                    <DetailCell label="Type" value="Join transfer" emphasize />
                    <DetailCell label="Zone" value={pickupZone ?? '—'} />
                    <DetailCell
                      label="Time"
                      value={pendingPickup ? 'Awaiting time' : pickupTime || '—'}
                      emphasize
                    />
                    <DetailCell label="Hotel" value={pickupHotel || '—'} wrap />
                    <DetailCell label="Room" value={roomNumber.trim() || '—'} />
                    {note.trim() ? (
                      <DetailCell
                        label="Note"
                        value={note.trim()}
                        className="col-span-2 sm:col-span-3"
                        wrap
                      />
                    ) : null}
                  </dl>
                  {transferExtraChargePreview ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      <p className="text-[10px] font-semibold tracking-wide text-amber-800/70 uppercase">
                        Extra Charge Transfer
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words font-medium">
                        {transferExtraChargePreview}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
              </div>
            </section>

            {!selectAgent ? (
              <AmendmentPolicyNotice settings={bookingCutoffs} title="Please note before you confirm" />
            ) : null}
          </div>
        )}

        {error ? <p className="mt-5 text-sm text-red-600">{error}</p> : null}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-teal-900/8 pt-5">
          <Button
            variant="outline"
            className="h-12 min-w-0 flex-1 rounded-xl px-4 sm:flex-none"
            disabled={step === 0}
            onClick={() => {
              setError('')
              setStep((current) => Math.max(current - 1, 0))
            }}
          >
            <ChevronLeft data-icon="inline-start" />
            Back
          </Button>
          {step < steps.length - 1 ? (
            <Button className="h-12 min-w-0 flex-1 rounded-xl px-4 sm:flex-none" onClick={next}>
              Continue
              <ChevronRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button
              className="h-12 min-w-0 flex-1 rounded-xl px-4 sm:flex-none"
              disabled={saving}
              onClick={confirm}
            >
              {saving ? 'Saving…' : 'Confirm Booking'}
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={optionsOpen}
        onOpenChange={(open) => {
          setOptionsOpen(open)
          if (!open) setPendingProgram(null)
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle className="pr-8 font-display text-lg font-semibold tracking-tight text-teal-950">
              {pendingProgram === 'James Bond' ? 'James Bond options' : 'Phi Phi options'}
            </DialogTitle>
            <DialogDescription className="text-sm text-teal-900/55">
              {pendingProgram === 'James Bond'
                ? 'Choose park fee and canoe for this booking.'
                : 'Choose whether park fee is included.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <OptionGroup title="Park fee" value={draftParkFee} onChange={setDraftParkFee} />
            {pendingProgram === 'James Bond' ? (
              <OptionGroup title="Canoe" value={draftCanoe} onChange={setDraftCanoe} />
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOptionsOpen(false)
                setPendingProgram(null)
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={confirmProgramOptions}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Possible duplicate</DialogTitle>
            <DialogDescription>{duplicateText}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDuplicateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void saveBooking()}>
              {saving ? 'Saving…' : 'Save anyway'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function programDisplayName(program: Program) {
  return program === 'PP' ? 'Phi Phi' : program
}

function ProgramCard({
  title,
  subtitle,
  selected,
  icon,
  onSelect,
}: {
  title: string
  subtitle: string
  selected: boolean
  icon: ReactNode
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex min-h-[4.5rem] items-center gap-4 rounded-2xl border p-4 text-left transition-all active:scale-[0.99]',
        selected
          ? 'border-teal-700 bg-teal-50/90 ring-1 ring-teal-700 shadow-sm shadow-teal-700/10'
          : 'border-teal-900/10 bg-white/70 hover:border-teal-700/30',
      )}
    >
      <div
        className={cn(
          'flex size-12 items-center justify-center rounded-2xl',
          selected
            ? 'bg-gradient-to-br from-teal-500 to-cyan-700 text-white shadow-sm'
            : 'bg-teal-950/[0.05] text-teal-800',
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-teal-950">{title}</div>
        <div className="text-sm text-teal-900/50">{subtitle}</div>
      </div>
      {selected ? <Check className="size-4 shrink-0 text-teal-800" /> : null}
    </button>
  )
}

function OptionGroup({
  title,
  value,
  onChange,
}: {
  title: string
  value: IncludeOption
  onChange: (value: IncludeOption) => void
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="grid grid-cols-2 gap-3">
        {(['Included', 'Not Included'] as IncludeOption[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
              value === option
                ? 'border-teal-800 bg-teal-800 text-white'
                : 'border-teal-900/10 text-teal-900/65 hover:border-teal-700/30',
            )}
          >
            {option === 'Not Included' ? 'Excluded' : option}
          </button>
        ))}
      </div>
    </div>
  )
}

function GuestRow({
  label,
  hint,
  value,
  max,
  onChange,
}: {
  label: string
  hint: string
  value: number
  max?: number
  onChange: (value: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)
  const atMax = max !== undefined && value >= max
  const hardCap = max !== undefined ? max : 999

  useEffect(() => {
    if (!editing) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [editing])

  function startEdit() {
    setDraft(String(value))
    setEditing(true)
  }

  function commit(raw: string) {
    const digits = raw.replace(/\D/g, '')
    const parsed = digits === '' ? 0 : Number.parseInt(digits, 10)
    const next = Number.isFinite(parsed) ? Math.min(hardCap, Math.max(0, parsed)) : 0
    onChange(next)
    setEditing(false)
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-teal-900/10 bg-white px-3 py-3">
      <div className="text-sm font-semibold text-teal-950">{label}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-teal-900/50">{hint}</div>
      <div className="mt-3 flex items-center justify-between gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8 shrink-0 rounded-full"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`Decrease ${label}`}
        >
          <Minus />
        </Button>
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={`${label} count`}
            value={draft}
            onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 3))}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit(draft)
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setEditing(false)
              }
            }}
            className="h-8 w-10 rounded-lg border border-teal-700/35 bg-white text-center text-base font-semibold tabular-nums text-teal-950 outline-none ring-2 ring-teal-700/15"
          />
        ) : (
          <button
            type="button"
            title="Click or tap to type a number"
            onClick={startEdit}
            className="min-w-7 rounded-lg px-1 py-1 text-center text-lg font-semibold tabular-nums text-teal-950 transition-colors hover:bg-teal-950/[0.05]"
          >
            {value}
          </button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="size-8 shrink-0 rounded-full"
          disabled={atMax}
          onClick={() => onChange(Math.min(hardCap, value + 1))}
          aria-label={`Increase ${label}`}
        >
          <Plus />
        </Button>
      </div>
    </div>
  )
}

function GuestStat({
  label,
  value,
  hint,
  tone = 'teal',
  className,
}: {
  label: string
  value: number | string
  hint?: string
  tone?: 'teal' | 'cyan' | 'sky' | 'amber' | 'total'
  className?: string
}) {
  const toneClass = {
    teal: 'border-teal-200 bg-teal-50 text-teal-950',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-950',
    sky: 'border-sky-200 bg-sky-50 text-sky-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    total: 'border-teal-800 bg-teal-800 text-white',
  }[tone]
  return (
    <div className={cn('rounded-xl border px-3 py-2', toneClass, className)}>
      <p className={cn('text-[11px] leading-tight', tone === 'total' ? 'text-white/70' : 'opacity-60')}>
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums">
        {value}
        {hint ? (
          <span className={cn('ml-1.5 text-sm font-medium', tone === 'total' ? 'text-white/70' : 'opacity-50')}>
            ({hint})
          </span>
        ) : null}
      </p>
    </div>
  )
}

function DetailCell({
  label,
  value,
  emphasize = false,
  className,
  wrap = false,
}: {
  label: string
  value: string
  emphasize?: boolean
  className?: string
  wrap?: boolean
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-teal-900/50">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 text-sm text-teal-950',
          emphasize ? 'font-semibold' : 'font-medium',
          wrap ? 'whitespace-pre-wrap break-words' : 'truncate',
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}
