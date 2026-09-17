'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Minus,
  Mountain,
  Plus,
  Ship,
  UserRound,
  Users,
} from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
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
import { formatLongDate, slugifyAgentName, toISODate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatPaxBreakdown, type Agent, type Booking, type IncludeOption, type PickupZoneName, type Program } from '@/lib/types'

const CORE_STEPS = [
  'Select Program',
  'Tour Date',
  'Guests',
  'Guest Information',
  'Pickup',
  'Review',
] as const

const TODAY = new Date(2026, 8, 17)

type ResolvedAgent = { slug: string; name: string }

export function BookingWizard({
  agent,
  selectAgent = false,
  title = 'New Booking',
  description = 'Create a partner booking in a few clear steps.',
  eyebrow,
  onSuccess,
}: {
  /** Locked agent for partner booking links. */
  agent?: Agent
  /** Admin offline flow: choose an existing agent or type a name. */
  selectAgent?: boolean
  title?: string
  description?: string
  eyebrow?: string
  onSuccess?: (booking: Booking) => void
}) {
  const router = useRouter()
  const { addBooking, agents, getZoneTime, zones } = usePortal()

  const steps = useMemo(
    () => (selectAgent ? (['Agent', ...CORE_STEPS] as string[]) : [...CORE_STEPS]),
    [selectAgent],
  )
  const programStep = selectAgent ? 1 : 0
  const dateStep = programStep + 1
  const guestsStep = programStep + 2
  const guestInfoStep = programStep + 3
  const pickupStep = programStep + 4
  const reviewStep = programStep + 5

  const [step, setStep] = useState(0)
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string | null>(agent?.slug ?? null)
  const [agentMode, setAgentMode] = useState<'existing' | 'offline'>(agent ? 'existing' : 'existing')
  const [offlineAgentName, setOfflineAgentName] = useState('')
  const [agentRef, setAgentRef] = useState('')
  const [program, setProgram] = useState<Program | null>(null)
  const [parkFee, setParkFee] = useState<IncludeOption>('Included')
  const [canoe, setCanoe] = useState<IncludeOption>('Included')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [pendingProgram, setPendingProgram] = useState<Program | null>(null)
  const [draftParkFee, setDraftParkFee] = useState<IncludeOption>('Included')
  const [draftCanoe, setDraftCanoe] = useState<IncludeOption>('Included')
  const [date, setDate] = useState<Date | undefined>(TODAY)
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [infants, setInfants] = useState(0)
  const [tourLeaders, setTourLeaders] = useState(0)
  const [leadGuest, setLeadGuest] = useState('')
  const [pickupZone, setPickupZone] = useState<PickupZoneName | null>(null)
  const [pickupHotel, setPickupHotel] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

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
    if (agentMode === 'offline') {
      const name = offlineAgentName.trim()
      if (name.length < 2) return null
      return { slug: `offline-${slugifyAgentName(name)}`, name }
    }
    const found = agents.find((item) => item.slug === selectedAgentSlug)
    return found ? { slug: found.slug, name: found.name } : null
  }, [selectAgent, agent, agentMode, offlineAgentName, selectedAgentSlug, agents])

  const total = adults + children + infants + tourLeaders
  const isoDate = date ? toISODate(date) : ''
  const pickupTime = pickupZone ? getZoneTime(pickupZone) : ''
  const selectedZone = zones.find((zone) => zone.name === pickupZone)
  const pendingPickup = selectedZone?.pending ?? false

  const canContinue = useMemo(() => {
    if (selectAgent && step === 0) return resolvedAgent !== null
    if (step === programStep) return program !== null
    if (step === dateStep) return Boolean(date)
    if (step === guestsStep) return adults + children + infants + tourLeaders > 0
    if (step === guestInfoStep) return leadGuest.trim().length > 1
    if (step === pickupStep)
      return (
        pickupZone !== null &&
        zones.some((zone) => zone.name === pickupZone) &&
        pickupHotel.trim().length > 1
      )
    return true
  }, [
    selectAgent,
    step,
    resolvedAgent,
    programStep,
    program,
    dateStep,
    date,
    guestsStep,
    adults,
    children,
    infants,
    tourLeaders,
    guestInfoStep,
    leadGuest,
    pickupStep,
    pickupZone,
    pickupHotel,
    zones,
  ])

  function next() {
    if (!canContinue) {
      setError(
        selectAgent && step === 0
          ? agentMode === 'offline'
            ? 'Enter the agent or agency name.'
            : 'Select an agent.'
          : step === programStep
            ? 'Please select a program.'
            : step === dateStep
              ? 'Please choose a tour date.'
              : step === guestsStep
                ? 'Add at least one passenger.'
                : step === guestInfoStep
                  ? 'Enter the lead guest name.'
                  : 'Select a pickup zone and hotel.',
      )
      return
    }
    setError('')
    setStep((current) => Math.min(current + 1, steps.length - 1))
  }

  function confirm() {
    if (!program || !date || !pickupZone || !resolvedAgent) return
    const booking = addBooking({
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
      pickupZone,
      pickupHotel: pickupHotel.trim(),
      roomNumber: roomNumber.trim(),
      note: note.trim(),
    })
    if (onSuccess) {
      onSuccess(booking)
      return
    }
    router.push(`/agent/${resolvedAgent.slug}/confirmed/${booking.code}`)
  }

  const headerEyebrow = eyebrow ?? (!selectAgent ? agent?.name : undefined)

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 sm:mb-7">
        {headerEyebrow ? <p className="gday-soft-label mb-1.5">{headerEyebrow}</p> : null}
        <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-teal-950 sm:text-[1.85rem]">
          {title}
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-teal-950/55">{description}</p>
      </div>

      <ol
        className={cn(
          'mb-5 hidden gap-2 sm:grid',
          steps.length > 7 ? 'sm:grid-cols-4 lg:grid-cols-8' : 'sm:grid-cols-7',
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
        <div className="mb-6">
          <p className="gday-soft-label">
            Step {step + 1} of {steps.length}
          </p>
          <h2 className="font-display mt-1 text-xl font-semibold tracking-tight text-teal-950">
            {steps[step]}
          </h2>
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
                  setAgentMode('offline')
                  setSelectedAgentSlug(null)
                  setError('')
                }}
                className={cn(
                  'min-h-12 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors',
                  agentMode === 'offline'
                    ? 'border-teal-800 bg-teal-800 text-white shadow-sm shadow-teal-800/20'
                    : 'border-teal-900/10 bg-white/70 text-teal-900/65 hover:border-teal-700/30',
                )}
              >
                Offline / walk-in
              </button>
            </div>

            {agentMode === 'existing' ? (
              <div>
                <Label className="mb-3">Choose agent</Label>
                {activeAgents.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
                    No active agents yet. Use Offline / walk-in and type the agency name.
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
                        <p className="mt-1 text-sm text-teal-900/50">{item.country}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-md space-y-2">
                <Label htmlFor="offline-agent">Agent / agency name</Label>
                <Input
                  id="offline-agent"
                  value={offlineAgentName}
                  onChange={(event) => setOfflineAgentName(event.target.value)}
                  placeholder="e.g. Walk-in guest, Phone booking…"
                  className="h-11"
                />
                <p className="text-xs text-neutral-500">
                  For bookings taken offline — no partner link required.
                </p>
              </div>
            )}

            <div className="max-w-md space-y-2 border-t border-teal-900/8 pt-5">
              <Label htmlFor="agent-ref">Agent Ref / Agent Voucher Number</Label>
              <Input
                id="agent-ref"
                value={agentRef}
                onChange={(event) => setAgentRef(event.target.value)}
                placeholder="e.g. AG-10284 or voucher #"
                className="h-11"
              />
              <p className="text-xs text-neutral-500">
                Optional — the agent’s own reference or voucher number for this booking.
              </p>
            </div>
          </div>
        )}

        {step === programStep && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ProgramCard
                title="PP"
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
                Selected: <span className="font-medium text-teal-950">{program}</span>
                <span className="text-teal-900/30"> · </span>
                Park fee {parkFee.toLowerCase()}
                {program === 'James Bond' ? (
                  <>
                    <span className="text-teal-900/30"> · </span>
                    Canoe {canoe.toLowerCase()}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        )}

        {step === dateStep && (
          <div className="max-w-sm">
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
                  onSelect={setDate}
                  disabled={{ before: TODAY }}
                  defaultMonth={date ?? TODAY}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {step === guestsStep && (
          <div className="space-y-1">
            <GuestRow label="Adults" hint="12 years and above" value={adults} onChange={setAdults} />
            <GuestRow label="Children" hint="2–11 years" value={children} onChange={setChildren} />
            <GuestRow label="Infants" hint="Under 2 years" value={infants} onChange={setInfants} />
            <GuestRow label="Tour Leaders" hint="Accompanying guides" value={tourLeaders} onChange={setTourLeaders} />
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-teal-950/[0.04] px-4 py-3.5">
              <span className="text-sm font-medium text-teal-900/55">Total Passengers</span>
              <span className="text-right">
                <span className="font-mono text-lg font-semibold tracking-tight text-teal-950 tabular-nums">
                  {formatPaxBreakdown({ adults, children, infants, tourLeaders })}
                </span>
                <span className="ml-2 text-sm text-teal-900/40">({total})</span>
              </span>
            </div>
          </div>
        )}

        {step === guestInfoStep && (
          <div className="max-w-md space-y-5">
            <div className="space-y-2">
              <Label htmlFor="lead-guest">Lead Guest Name</Label>
              <Input
                id="lead-guest"
                value={leadGuest}
                onChange={(event) => setLeadGuest(event.target.value)}
                placeholder="John Smith"
                className="h-11"
              />
            </div>
            {!selectAgent ? (
              <div className="space-y-2">
                <Label htmlFor="agent-ref-guest">Agent Ref / Agent Voucher Number</Label>
                <Input
                  id="agent-ref-guest"
                  value={agentRef}
                  onChange={(event) => setAgentRef(event.target.value)}
                  placeholder="e.g. AG-10284 or voucher #"
                  className="h-11"
                />
                <p className="text-xs text-neutral-500">
                  Optional — your own reference or voucher number for this booking.
                </p>
              </div>
            ) : null}
          </div>
        )}

        {step === pickupStep && (
          <div className="space-y-5">
            <div>
              <Label className="mb-3">Pickup Zone</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {zones.map((zone) => {
                  const time = getZoneTime(zone.name)
                  return (
                    <button
                      key={zone.name}
                      type="button"
                      onClick={() => setPickupZone(zone.name)}
                      className={cn(
                        'rounded-2xl border p-4 text-left transition-all',
                        pickupZone === zone.name
                          ? 'border-teal-700 bg-teal-50/90 ring-1 ring-teal-700 shadow-sm shadow-teal-700/10'
                          : 'border-teal-900/10 bg-white/70 hover:border-teal-700/30',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-teal-950">{zone.name}</span>
                        {pickupZone === zone.name ? <Check className="size-4" /> : null}
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-teal-900/50">
                        <Clock3 className="size-3.5" />
                        {zone.pending ? 'Pending Confirmation' : time}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="max-w-md space-y-2">
              <Label htmlFor="hotel">Pickup Hotel</Label>
              <Input
                id="hotel"
                value={pickupHotel}
                onChange={(event) => setPickupHotel(event.target.value)}
                placeholder={pendingPickup ? 'Hotel name' : 'ABC Hotel'}
                className="h-11"
              />
            </div>
            <div className="max-w-md space-y-2">
              <Label htmlFor="room-number">Room number</Label>
              <Input
                id="room-number"
                value={roomNumber}
                onChange={(event) => setRoomNumber(event.target.value)}
                placeholder="e.g. 1204"
                className="h-11"
              />
            </div>
            <div className="max-w-md space-y-2">
              <Label htmlFor="pickup-note">Note</Label>
              <Textarea
                id="pickup-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Special request, landmark, contact…"
                className="min-h-24"
              />
            </div>
            {pendingPickup ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Pickup Time: Pending Confirmation
              </div>
            ) : pickupZone ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                Pickup time for {pickupZone}: <span className="font-semibold text-neutral-900">{pickupTime}</span>
              </div>
            ) : null}
          </div>
        )}

        {step === reviewStep && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-teal-800 via-teal-700 to-cyan-700 px-4 py-4 text-white sm:px-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-[0.16em] text-white/50 uppercase">
                    Booking summary
                  </p>
                  <h3 className="font-display mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                    {program ?? '—'}
                  </h3>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-white/75">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarIcon className="size-3.5 shrink-0 opacity-70" />
                      {isoDate ? formatLongDate(isoDate) : '—'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="size-3.5 shrink-0 opacity-70" />
                      {leadGuest || '—'}
                    </span>
                  </p>
                </div>
                <div className="rounded-lg bg-white/12 px-3 py-2 text-right backdrop-blur-sm">
                  <p className="text-[10px] font-medium tracking-wide text-white/55 uppercase">
                    Pax
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-semibold tracking-tight leading-none tabular-nums sm:text-xl">
                    {formatPaxBreakdown({ adults, children, infants, tourLeaders })}
                  </p>
                  <p className="mt-1 text-[10px] text-white/45">{total} total</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 border-t border-white/15 pt-2.5 text-xs text-white/65">
                <span>{resolvedAgent?.name ?? '—'}</span>
                {selectAgent && agentMode === 'offline' ? (
                  <>
                    <span className="text-white/30">·</span>
                    <span>Offline / walk-in</span>
                  </>
                ) : null}
                {agentRef.trim() ? (
                  <>
                    <span className="text-white/30">·</span>
                    <span>Ref {agentRef.trim()}</span>
                  </>
                ) : null}
                <span className="text-white/30">·</span>
                <span>Park fee {parkFee.toLowerCase()}</span>
                {program === 'James Bond' ? (
                  <>
                    <span className="text-white/30">·</span>
                    <span>Canoe {canoe.toLowerCase()}</span>
                  </>
                ) : null}
              </div>
            </div>

            <ReviewSection title="Guests" icon={<Users className="size-3.5" />}>
              <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg bg-teal-900/8">
                <GuestStat label="Adults" value={adults} />
                <GuestStat label="Children" value={children} />
                <GuestStat label="Infants" value={infants} />
                <GuestStat label="TL" value={tourLeaders} />
              </div>
            </ReviewSection>

            <ReviewSection title="Pickup" icon={<MapPin className="size-3.5" />}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                <DetailCell label="Zone" value={pickupZone ?? '—'} />
                <DetailCell
                  label="Time"
                  value={pendingPickup ? 'Pending' : pickupTime || '—'}
                  emphasize
                />
                <DetailCell label="Hotel" value={pickupHotel || '—'} className="sm:col-span-2" />
                <DetailCell label="Room" value={roomNumber.trim() || '—'} />
                <DetailCell
                  label="Note"
                  value={note.trim() || '—'}
                  className="col-span-2 sm:col-span-3"
                  wrap
                />
              </dl>
            </ReviewSection>

            <ReviewSection title="Tour options" icon={<Ship className="size-3.5" />}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                <DetailCell label="Park fee" value={parkFee} />
                <DetailCell
                  label="Canoe"
                  value={program === 'James Bond' ? canoe : 'N/A'}
                />
                <DetailCell
                  label="Agent ref"
                  value={agentRef.trim() || '—'}
                  className="col-span-2 sm:col-span-1"
                />
              </dl>
            </ReviewSection>
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
            <Button className="h-12 min-w-0 flex-1 rounded-xl px-4 sm:flex-none" onClick={confirm}>
              Confirm Booking
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
              {pendingProgram === 'James Bond' ? 'James Bond options' : 'PP options'}
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
    </div>
  )
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
            {option}
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
  onChange,
}: {
  label: string
  hint: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center justify-between border-b border-teal-900/6 py-4 last:border-0">
      <div>
        <div className="text-sm font-semibold text-teal-950">{label}</div>
        <div className="text-xs text-teal-900/50">{hint}</div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="size-10 rounded-full"
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          <Minus />
        </Button>
        <span className="w-7 text-center text-base font-semibold tabular-nums text-teal-950">
          {value}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-10 rounded-full"
          onClick={() => onChange(value + 1)}
        >
          <Plus />
        </Button>
      </div>
    </div>
  )
}

function ReviewSection({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-teal-900/8 bg-white/60 px-3.5 py-3 sm:px-4">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="flex size-5 items-center justify-center rounded-md bg-teal-900/5 text-teal-800">
          {icon}
        </span>
        <h4 className="text-xs font-semibold tracking-wide text-teal-900/55 uppercase">
          {title}
        </h4>
      </div>
      {children}
    </section>
  )
}

function GuestStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white px-2 py-2 text-center">
      <p className="font-display text-lg font-semibold tracking-tight text-teal-950">{value}</p>
      <p className="text-[10px] font-medium tracking-wide text-teal-900/45 uppercase">{label}</p>
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
      <dt className="text-[10px] font-medium tracking-wide text-teal-900/40 uppercase">{label}</dt>
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
