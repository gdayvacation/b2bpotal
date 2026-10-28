'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCheckInI18n } from '@/components/check-in/check-in-i18n'
import {
  addonPeopleCap,
  PRIVATE_LONGTAIL_TIERS,
  privatePartyFromBoatPrice,
  isSharedChildPrice,
  quoteGuestAddon,
  SCUBA_PRICE_PER_PERSON,
  SHARED_LONGTAIL_ADULT_PRICE,
  SHARED_LONGTAIL_BOAT_CAP,
  SHARED_LONGTAIL_CHILD_PRICE,
  sharePartyCopyKey,
} from '@/lib/check-in-addon-catalog'
import {
  serviceLineTotal,
  type CheckInServiceKind,
  type CheckInServiceLine,
} from '@/lib/check-in-services'
import { cn } from '@/lib/utils'
import type { CheckInCopyKey } from '@/lib/check-in-i18n'

const OFFER_ORDER: CheckInServiceKind[] = ['scuba', 'share-longtail', 'private-longtail']

const OFFER_PHOTOS: Record<CheckInServiceKind, string[]> = {
  scuba: ['/addons/scuba-reef.jpg', '/addons/scuba-gear-boat.jpg', '/addons/scuba.png'],
  'share-longtail': [
    '/addons/shared-guests.jpg',
    '/addons/shared-swim.jpg',
    '/addons/shared-longtail.jpg',
  ],
  'private-longtail': [
    '/addons/private-family.jpg',
    '/addons/private-canyon.jpg',
    '/addons/private-longtail.jpg',
  ],
}

function OfferPhotos({ kind }: { kind: CheckInServiceKind }) {
  const { t } = useCheckInI18n()
  const photos = OFFER_PHOTOS[kind]
  const [index, setIndex] = useState(0)
  const src = photos[index] ?? photos[0]

  function step(delta: number) {
    setIndex((current) => (current + delta + photos.length) % photos.length)
  }

  return (
    <div className="relative h-44 bg-white">
      <img
        src={src}
        alt=""
        className={cn('h-full w-full', src.endsWith('.png') ? 'object-contain' : 'object-cover')}
      />
      <button
        type="button"
        aria-label={t('addonPrevPhoto')}
        onClick={() => step(-1)}
        className="absolute top-1/2 left-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-teal-950 shadow ring-1 ring-teal-900/10"
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        type="button"
        aria-label={t('addonNextPhoto')}
        onClick={() => step(1)}
        className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-teal-950 shadow ring-1 ring-teal-900/10"
      >
        <ChevronRight className="size-5" />
      </button>
      <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
        {photos.map((photo, photoIndex) => (
          <span
            key={photo}
            className={cn(
              'size-1.5 rounded-full ring-1 ring-teal-950/25',
              photoIndex === index ? 'bg-teal-800' : 'bg-white/80',
            )}
          />
        ))}
      </div>
    </div>
  )
}

const POSTERS: Record<CheckInServiceKind, { src: string; width: number; height: number }> = {
  scuba: { src: '/addons/scuba.png', width: 1024, height: 1024 },
  'share-longtail': { src: '/addons/shared-longtail.jpg', width: 1024, height: 682 },
  'private-longtail': { src: '/addons/private-longtail.jpg', width: 1024, height: 682 },
}

const OFFER_FAQ: Record<CheckInServiceKind, Array<readonly [CheckInCopyKey, CheckInCopyKey]>> = {
  scuba: [
    ['scubaQSwim', 'scubaASwim'],
    ['scubaQMaster', 'scubaAMaster'],
    ['scubaQDepth', 'scubaADepth'],
    ['scubaQPhoto', 'scubaAPhoto'],
    ['scubaQCourse', 'scubaACourse'],
    ['scubaQHealth', 'scubaAHealth'],
    ['scubaQWear', 'scubaAWear'],
    ['scubaQPay', 'scubaAPay'],
  ],
  'share-longtail': [
    ['sharedQWho', 'sharedAWho'],
    ['sharedQLong', 'sharedALong'],
    ['sharedQSwim', 'sharedASwim'],
    ['sharedQPrivate', 'sharedAPrivate'],
    ['sharedQPay', 'sharedAPay'],
  ],
  'private-longtail': [
    ['privateQWho', 'privateAWho'],
    ['privateQPrice', 'privateAPrice'],
    ['privateQMax', 'privateAMax'],
    ['privateQLong', 'privateALong'],
    ['privateQSwim', 'privateASwim'],
    ['privateQPay', 'privateAPay'],
  ],
}

function OfferFaq({ kind }: { kind: CheckInServiceKind }) {
  const { t } = useCheckInI18n()
  const [open, setOpen] = useState<CheckInCopyKey | null>(null)

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-teal-900/10">
      <p className="px-3 pt-2.5 pb-1 text-[11px] font-bold tracking-wide text-orange-600 uppercase">
        {t('addonConditions')}
      </p>
      {OFFER_FAQ[kind].map(([question, answer]) => {
        const shown = open === question
        return (
          <button
            key={question}
            type="button"
            aria-expanded={shown}
            onClick={() => setOpen(shown ? null : question)}
            className="block w-full border-t border-teal-900/10 px-3 py-2.5 text-left"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-teal-950">{t(question)}</span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-teal-800/45 transition-transform',
                  shown && 'rotate-180',
                )}
              />
            </span>
            {shown ? (
              <span className="mt-1.5 block text-[13px] leading-snug text-teal-900/70">
                {t(answer)}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function money(amount: number) {
  return `${amount.toLocaleString('en-US')} THB`
}

function offerName(
  kind: CheckInServiceKind,
  t: (key: CheckInCopyKey, vars?: Record<string, string | number>) => string,
) {
  if (kind === 'scuba') return t('addonScubaName')
  if (kind === 'share-longtail') return t('addonSharedName')
  return t('addonPrivateName')
}

function partyLabel(
  kind: CheckInServiceKind,
  count: number,
  t: (key: CheckInCopyKey, vars?: Record<string, string | number>) => string,
) {
  if (kind === 'private-longtail') {
    return count === 1 ? t('addonOneBoat') : t('addonBoatCount', { count })
  }
  return t('addonPaxCount', { count })
}

export function AddonReceiptToggle({
  services,
  details = [],
}: {
  services: CheckInServiceLine[]
  details?: Array<{ label: string; value: string }>
}) {
  const { t } = useCheckInI18n()
  const [open, setOpen] = useState(false)
  const settled = services.length > 0 && services.every((line) => line.paid)
  const total = services.reduce((sum, line) => sum + serviceLineTotal(line), 0)
  if (!settled) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-xs font-semibold text-teal-800 underline decoration-teal-800/30 underline-offset-2"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
      >
        {open ? t('hideReceipt') : t('seeReceipt')}
      </button>
      {open ? (
        <div className="mt-2 rounded-xl bg-white px-3 py-3 text-left ring-1 ring-emerald-200">
          <p className="text-center text-[10px] font-bold tracking-[0.14em] text-teal-800/50 uppercase">
            {t('addonReceiptTitle')}
          </p>
          {details.length > 0 ? (
            <div className="mt-2 space-y-1 text-[11px]">
              {details.map((row) => (
                <div key={row.label} className="flex justify-between gap-3">
                  <span className="text-teal-900/50">{row.label}</span>
                  <span className="text-right font-medium text-teal-950">{row.value}</span>
                </div>
              ))}
            </div>
          ) : null}
          <ul className="mt-2 space-y-1 border-t border-dashed border-teal-900/15 pt-2 text-[12px]">
            {services.map((line) => (
              <li key={line.id} className="flex justify-between gap-3">
                <span className="min-w-0 text-teal-950">
                  {offerName(line.kind, t)}
                  <span className="text-teal-900/50">
                    {' '}
                    · {partyLabel(line.kind, line.people, t)}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-teal-950">
                  {money(serviceLineTotal(line))}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-dashed border-teal-900/15 pt-2 text-sm font-semibold text-teal-950">
            <span>{t('addonTotal')}</span>
            <span className="tabular-nums">{money(total)}</span>
          </div>
          <p className="mt-2 text-center text-sm font-bold tracking-wide text-emerald-800">
            {t('paidBadge')}
          </p>
        </div>
      ) : null}
    </div>
  )
}

type AddonWriteResult = { ok: true } | { ok: false; error: string }

export function AddonShop({
  bookingPax,
  bookingAdults,
  bookingChildren,
  services,
  busyKind,
  error,
  focusKind,
  onAdd,
  onUpdate,
  onRemove,
  onDone,
}: {
  bookingPax: number
  bookingAdults: number
  bookingChildren: number
  services: CheckInServiceLine[]
  busyKind: CheckInServiceKind | null
  error: string
  focusKind?: CheckInServiceKind | null
  onAdd: (
    kind: CheckInServiceKind,
    people: number,
    band?: 'adult' | 'child',
  ) => Promise<AddonWriteResult>
  onUpdate: (id: string, people: number) => Promise<AddonWriteResult>
  onRemove: (id: string) => Promise<AddonWriteResult>
  onDone: () => void
}) {
  const { t } = useCheckInI18n()
  const [people, setPeople] = useState<Record<CheckInServiceKind, number>>({
    scuba: 1,
    'share-longtail': 1,
    'private-longtail': 1,
  })
  const [shareAdults, setShareAdults] = useState(1)
  const [shareChildren, setShareChildren] = useState(0)
  const [openKind, setOpenKind] = useState<CheckInServiceKind | null>(null)
  const [notedKind, setNotedKind] = useState<CheckInServiceKind | null>(null)
  const [savingKind, setSavingKind] = useState<CheckInServiceKind | null>(null)
  const [draftParty, setDraftParty] = useState<Record<string, number>>({})
  const [pendingIds, setPendingIds] = useState<Record<string, true>>({})
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const pendingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!notedKind) return
    const timer = window.setTimeout(() => setNotedKind(null), 2500)
    return () => window.clearTimeout(timer)
  }, [notedKind])

  function partyOf(line: CheckInServiceLine) {
    const draft = draftParty[line.id]
    if (draft != null) return draft
    if (line.kind === 'private-longtail') return privatePartyFromBoatPrice(line.pricePerPerson)
    return line.people
  }

  function amountOf(line: CheckInServiceLine) {
    if (line.paid) return serviceLineTotal(line)
    const quote = quoteGuestAddon(line.kind, partyOf(line), bookingPax)
    return quote?.total ?? serviceLineTotal(line)
  }

  const addedTotal = services.reduce((sum, line) => sum + amountOf(line), 0)
  const addonsSettled = services.length > 0 && services.every((line) => line.paid)
  const needsMarina = services.some((line) => !line.paid && !line.confirmed)
  const waitingPay = services.some((line) => line.confirmed && !line.paid)

  useEffect(() => {
    if (!openKind) return
    document.getElementById(`addon-offer-${openKind}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  }, [openKind])

  function savedShare(band: 'adult' | 'child', exceptId?: string) {
    return services
      .filter(
        (line) =>
          line.kind === 'share-longtail' &&
          line.id !== exceptId &&
          isSharedChildPrice(line.pricePerPerson) === (band === 'child'),
      )
      .reduce((sum, line) => sum + line.people, 0)
  }

  function shareAdultRoom(exceptId?: string) {
    const savedAdults = savedShare('adult', exceptId)
    const savedChildren = savedShare('child', exceptId)
    const byBooking = Math.max(0, bookingAdults - savedAdults)
    const byBoat = Math.max(0, SHARED_LONGTAIL_BOAT_CAP - savedAdults - savedChildren)
    return Math.min(byBooking, byBoat)
  }

  function shareChildRoom(exceptId?: string) {
    const savedAdults = savedShare('adult', exceptId)
    const savedChildren = savedShare('child', exceptId)
    const byBooking = Math.max(0, bookingChildren - savedChildren)
    const byBoat = Math.max(0, SHARED_LONGTAIL_BOAT_CAP - savedAdults - savedChildren)
    return Math.min(byBooking, byBoat)
  }

  const savedAdultOnBoat = savedShare('adult') > 0

  function setCount(kind: CheckInServiceKind, next: number) {
    const cap = addonPeopleCap(kind, bookingPax)
    setPeople((current) => ({
      ...current,
      [kind]: Math.min(cap, Math.max(1, next)),
    }))
  }

  function formAdultMax() {
    const savedTotal = savedShare('adult') + savedShare('child')
    return Math.min(
      Math.max(0, bookingAdults - savedShare('adult')),
      Math.max(0, SHARED_LONGTAIL_BOAT_CAP - savedTotal - shareChildren),
    )
  }

  function formChildMax() {
    const savedTotal = savedShare('adult') + savedShare('child')
    return Math.min(
      Math.max(0, bookingChildren - savedShare('child')),
      Math.max(0, SHARED_LONGTAIL_BOAT_CAP - savedTotal - shareAdults),
    )
  }

  function editableLine(kind: CheckInServiceKind, band: 'adult' | 'child' = 'adult') {
    return services.find((line) => {
      if (line.kind !== kind || line.paid || line.confirmed) return false
      if (kind !== 'share-longtail') return true
      return isSharedChildPrice(line.pricePerPerson) === (band === 'child')
    })
  }

  async function addOrMerge(
    kind: CheckInServiceKind,
    count: number,
    band: 'adult' | 'child' = 'adult',
  ) {
    if (count < 1 || savingKind !== null || busyKind !== null) {
      return { ok: false as const, error: '' }
    }
    const line = editableLine(kind, band)
    setSavingKind(kind)
    try {
      const result = line
        ? await onUpdate(line.id, kind === 'private-longtail' ? count : line.people + count)
        : await onAdd(kind, count, band)
      if (result.ok) setNotedKind(kind)
      return result
    } finally {
      setSavingKind(null)
    }
  }

  function setShareCount(band: 'adult' | 'child', next: number) {
    if (band === 'adult') {
      const room = formAdultMax()
      let clamped = Math.max(0, Math.min(next, room))
      if (shareChildren > 0 && !savedAdultOnBoat && room > 0) clamped = Math.max(1, clamped)
      setShareAdults(clamped)
      if (clamped < 1 && !savedAdultOnBoat) setShareChildren(0)
      return
    }
    if (shareAdults < 1 && !savedAdultOnBoat) {
      setShareChildren(0)
      return
    }
    setShareChildren(Math.max(0, Math.min(next, formChildMax())))
  }

  async function changeParty(line: CheckInServiceLine, next: number) {
    if (line.paid || line.confirmed || pendingRef.current.has(line.id)) return
    const cap =
      line.kind === 'share-longtail'
        ? isSharedChildPrice(line.pricePerPerson)
          ? shareChildRoom(line.id)
          : shareAdultRoom(line.id)
        : addonPeopleCap(line.kind, bookingPax)
    const party = Math.min(cap, Math.max(1, next))
    if (party === partyOf(line)) return
    pendingRef.current.add(line.id)
    setConfirmId((current) => (current === line.id ? null : current))
    setDraftParty((current) => ({ ...current, [line.id]: party }))
    setPendingIds((current) => ({ ...current, [line.id]: true }))
    const result = await onUpdate(line.id, party)
    pendingRef.current.delete(line.id)
    setPendingIds((current) => {
      if (!current[line.id]) return current
      const copy = { ...current }
      delete copy[line.id]
      return copy
    })
    if (!result.ok) {
      setDraftParty((current) => {
        if (current[line.id] !== party) return current
        const copy = { ...current }
        delete copy[line.id]
        return copy
      })
    }
  }

  async function removeLine(line: CheckInServiceLine) {
    if (line.paid || line.confirmed || pendingRef.current.has(line.id)) return
    if (confirmId !== line.id) {
      setConfirmId(line.id)
      return
    }
    pendingRef.current.add(line.id)
    setPendingIds((current) => ({ ...current, [line.id]: true }))
    const result = await onRemove(line.id)
    pendingRef.current.delete(line.id)
    setPendingIds((current) => {
      if (!current[line.id]) return current
      const copy = { ...current }
      delete copy[line.id]
      return copy
    })
    setConfirmId((current) => (current === line.id ? null : current))
    if (result.ok) {
      setDraftParty((current) => {
        if (current[line.id] == null) return current
        const copy = { ...current }
        delete copy[line.id]
        return copy
      })
    }
  }

  const paused = busyKind !== null || savingKind !== null

  return (
    <section
      className={cn(
        openKind ? 'space-y-4' : 'flex min-h-[calc(100dvh-6.5rem)] flex-col gap-4',
      )}
    >
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
          {t('addonTitle')}
        </h1>
        <p className="mt-1 text-sm leading-snug text-teal-900/60">{t('addonSub')}</p>
      </div>

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      {services.length > 0 ? (
        <div className="rounded-2xl bg-white px-4 py-3.5 shadow-md shadow-emerald-900/10 ring-1 ring-emerald-300/80">
          <p className="text-sm font-semibold text-emerald-950">{t('addonSummary')}</p>
          <ul className="mt-2 space-y-2">
            {services.map((line) => {
              const party = partyOf(line)
              const cap =
                line.kind === 'share-longtail'
                  ? isSharedChildPrice(line.pricePerPerson)
                    ? shareChildRoom(line.id)
                    : shareAdultRoom(line.id)
                  : addonPeopleCap(line.kind, bookingPax)
              const pending = Boolean(pendingIds[line.id])
              const tier = PRIVATE_LONGTAIL_TIERS.find(
                (row) => party >= row.min && party <= row.max,
              )
              const boatText =
                line.people === 1 ? t('addonOneBoat') : t('addonBoatCount', { count: line.people })
              const qty =
                line.kind === 'private-longtail'
                  ? draftParty[line.id] != null
                    ? `${t('addonPaxCount', { count: party })} · ${boatText}`
                    : `${tier ? `${tier.min}–${tier.max}` : party} ${t('addonPeopleWord')} · ${boatText}`
                  : line.kind === 'share-longtail'
                    ? t(sharePartyCopyKey(line.people, line.pricePerPerson), { count: line.people })
                    : t('addonPaxCount', { count: party })
              const locked = line.paid || line.confirmed
              return (
                <li key={line.id} className={cn('text-sm', pending && 'opacity-60')}>
                  <div className="relative">
                  <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_5.75rem_4.75rem] items-center gap-x-2 pr-5">
                    <img
                      src={POSTERS[line.kind].src}
                      alt=""
                      width={44}
                      height={44}
                      className="size-11 rounded-xl object-cover object-[center_70%] ring-1 ring-teal-900/10"
                    />
                    <span className="min-w-0 truncate font-medium text-teal-950">
                      {offerName(line.kind, t)}
                    </span>
                    {!locked && line.kind !== 'private-longtail' ? (
                      <span className="flex w-full items-center justify-center gap-1">
                        <button
                          type="button"
                          aria-label={t('addonFewer')}
                          disabled={party <= 1 || pending || paused}
                          onClick={() => void changeParty(line, party - 1)}
                          className="flex size-8 items-center justify-center rounded-full bg-teal-950/[0.05] text-teal-900 ring-1 ring-teal-900/10 disabled:opacity-40"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-5 text-center font-display text-base font-semibold tabular-nums text-teal-950">
                          {party}
                        </span>
                        <button
                          type="button"
                          aria-label={t('addonMore')}
                          disabled={party >= cap || pending || paused}
                          onClick={() => void changeParty(line, party + 1)}
                          className="flex size-8 items-center justify-center rounded-full bg-teal-950/[0.05] text-teal-900 ring-1 ring-teal-900/10 disabled:opacity-40"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </span>
                    ) : (
                      <span className="truncate text-center text-xs font-normal text-teal-900/55">
                        {qty}
                      </span>
                    )}
                    <span className="text-right font-semibold tabular-nums text-teal-950">
                      {money(amountOf(line))}
                    </span>
                  </div>
                  {!locked ? (
                    confirmId === line.id ? (
                      <span className="absolute inset-y-0 right-0 z-10 flex items-center gap-1 rounded-full bg-white pl-2 pr-0.5 shadow-sm ring-1 ring-rose-200">
                        <span className="text-[11px] font-semibold text-rose-800">
                          {t('addonRemoveConfirm')}
                        </span>
                        <button
                          type="button"
                          disabled={pending || paused}
                          onClick={() => void removeLine(line)}
                          className="rounded-full bg-rose-700 px-2 py-0.5 text-[11px] font-semibold text-white"
                        >
                          {t('addonYes')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-teal-900"
                        >
                          {t('addonNo')}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={t('addonRemove')}
                        disabled={pending || paused}
                        onClick={() => void removeLine(line)}
                        className="absolute right-0 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-rose-700"
                      >
                        <X className="size-3.5" strokeWidth={2.5} />
                      </button>
                    )
                  ) : null}
                  </div>
                  {line.paid ? (
                    <p className="mt-1.5 text-xs font-semibold text-emerald-800">{t('addonPaid')}</p>
                  ) : line.confirmed ? (
                    <p className="mt-1.5 text-xs font-semibold text-sky-800">{t('addonConfirmedWait')}</p>
                  ) : line.kind === 'private-longtail' ? (
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
                        {PRIVATE_LONGTAIL_TIERS.map((tier) => {
                          const active = party >= tier.min && party <= tier.max
                          const reachable = tier.min <= cap
                          return (
                            <button
                              key={tier.min}
                              type="button"
                              disabled={!reachable || pending || paused}
                              onClick={() => void changeParty(line, tier.min)}
                              className={cn(
                                'rounded-lg px-1 py-1.5 text-center ring-1',
                                active
                                  ? 'bg-teal-800 text-white ring-teal-800'
                                  : 'bg-teal-950/[0.03] text-teal-950 ring-teal-900/10',
                                !reachable && 'opacity-40',
                              )}
                            >
                              <span className="block text-[10px] font-semibold">
                                {tier.min}–{tier.max}
                              </span>
                              <span className="block text-[10px] font-semibold tabular-nums">
                                {money(tier.price)}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <div className="mt-2.5 flex items-center justify-between border-t border-emerald-900/10 pt-2.5">
            <span className="text-sm font-semibold text-teal-950">{t('addonTotal')}</span>
            {addonsSettled ? (
              <span className="text-base font-bold tracking-wide text-emerald-800">
                {t('paidBadge')}
              </span>
            ) : (
              <span className="font-display text-lg font-semibold tabular-nums text-emerald-800">
                {money(addedTotal)}
              </span>
            )}
          </div>
          <AddonReceiptToggle services={services} />
          {needsMarina ? (
            <p className="mt-2 text-[12px] font-semibold leading-snug text-red-700">
              {t('addonPayStaff')}
            </p>
          ) : waitingPay ? (
            <p className="mt-2 text-[12px] font-semibold leading-snug text-sky-800">
              {t('addonConfirmedWait')}
            </p>
          ) : null}
          <Button type="button" className="mt-3 h-11 w-full" onClick={onDone}>
            {t('addonDone')}
          </Button>
        </div>
      ) : null}

      {OFFER_ORDER.map((kind) => {
        const savedScuba =
          kind === 'scuba'
            ? services
                .filter((line) => line.kind === 'scuba')
                .reduce((sum, line) => sum + line.people, 0)
            : 0
        const cap =
          kind === 'scuba'
            ? Math.max(0, addonPeopleCap(kind, bookingPax) - savedScuba)
            : addonPeopleCap(kind, bookingPax)
        const count = cap > 0 ? Math.min(Math.max(people[kind], 1), cap) : 0
        const quote =
          kind === 'share-longtail' || count < 1 ? null : quoteGuestAddon(kind, count, bookingPax)
        const adultRoomLeft = kind === 'share-longtail' ? formAdultMax() : 0
        const childRoomLeft = kind === 'share-longtail' ? formChildMax() : 0
        const adultCovered = shareAdults >= 1 || savedAdultOnBoat
        const shareTotal =
          shareAdults * SHARED_LONGTAIL_ADULT_PRICE + shareChildren * SHARED_LONGTAIL_CHILD_PRICE
        const shareReady =
          kind === 'share-longtail' &&
          shareAdults + shareChildren >= 1 &&
          shareAdults <= adultRoomLeft &&
          shareChildren <= childRoomLeft &&
          (shareChildren === 0 || adultCovered)
        const busy = busyKind === kind || savingKind === kind
        const title =
          kind === 'scuba'
            ? t('addonScubaName')
            : kind === 'share-longtail'
              ? t('addonSharedName')
              : t('addonPrivateName')
        const addLabel =
          kind === 'scuba'
            ? t('addonAddScuba')
            : kind === 'share-longtail'
              ? t('addonAddShared')
              : t('addonAddPrivate')
        const alreadyAdded = services.some((line) => line.kind === kind)
        const menuPrice =
          kind === 'scuba'
            ? money(SCUBA_PRICE_PER_PERSON)
            : kind === 'share-longtail'
              ? `${t('addonShareAdultRate')} · ${t('addonShareChildRate')}`
              : `${money(PRIVATE_LONGTAIL_TIERS[0].price)}–${money(PRIVATE_LONGTAIL_TIERS[2].price)}`
        const menuPhoto =
          kind === 'scuba'
            ? '/addons/scuba-reef.jpg'
            : kind === 'share-longtail'
              ? '/addons/shared-guests.jpg'
              : '/addons/private-family.jpg'
        const open = openKind === kind
        return (
          <article
            key={kind}
            id={`addon-offer-${kind}`}
            className={cn(
              'scroll-mt-4 overflow-hidden rounded-2xl bg-white shadow-md shadow-teal-950/8 ring-1',
              !openKind && 'flex min-h-40 flex-1 flex-col',
              open || focusKind === kind ? 'ring-2 ring-teal-600' : 'ring-teal-900/10',
            )}
          >
            {open ? <OfferPhotos kind={kind} /> : null}
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenKind(open ? null : kind)}
              className={cn(
                'flex w-full flex-col text-left',
                !openKind && 'min-h-0 flex-1',
              )}
            >
              {open ? null : (
                <span className="relative min-h-28 flex-1">
                  <img src={menuPhoto} alt="" className="absolute inset-0 h-full w-full object-cover" />
                </span>
              )}
              <span className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-display text-lg font-semibold leading-tight text-teal-950">
                    {title}
                  </span>
                  <span className="mt-1 block text-sm font-semibold leading-tight text-teal-800">
                    {menuPrice}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-teal-800/50">
                    {alreadyAdded ? t('addonSummary') : t('addonTapToSee')}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'mt-1 size-5 shrink-0 text-teal-800 transition-transform',
                    open && 'rotate-180',
                  )}
                />
              </span>
            </button>
            {open ? (
            <div className="space-y-3 border-t border-teal-900/10 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-teal-800/55">{t('addonDuration')}</p>
                </div>
                {kind === 'share-longtail' ? (
                  <div className="text-right text-sm font-semibold leading-tight text-teal-900">
                    <p>
                      {t('addonAdult')} {money(SHARED_LONGTAIL_ADULT_PRICE)}
                    </p>
                    <p className="text-[11px] font-medium text-teal-800/50">{t('addonPerPerson')}</p>
                    <p className="mt-1.5">
                      {t('addonChild')} {money(SHARED_LONGTAIL_CHILD_PRICE)}
                    </p>
                    <p className="text-[11px] font-medium whitespace-nowrap text-teal-800/55">
                      {t('addonChildAge')}
                      <span className="text-teal-800/50"> · {t('addonPerPerson')}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-right text-sm font-semibold text-teal-900">
                    {kind === 'scuba' ? money(SCUBA_PRICE_PER_PERSON) : quote ? money(quote.total) : ''}
                    <span className="mt-0.5 block text-[11px] font-medium text-teal-800/50">
                      {kind === 'private-longtail' ? t('addonPerBoat') : t('addonPerPerson')}
                    </span>
                  </p>
                )}
              </div>

              {kind === 'scuba' ? (
                <p className="text-xs leading-snug text-teal-900/60">{t('addonGear')}</p>
              ) : null}
              {kind === 'share-longtail' ? (
                <p className="text-xs leading-snug text-teal-900/60">
                  {t('addonSharedCap')} {t('sharedDetail')}
                </p>
              ) : null}
              {kind === 'private-longtail' ? (
                <p className="text-xs leading-snug text-teal-900/60">{t('privateDetail')}</p>
              ) : null}
              {kind === 'private-longtail' ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {PRIVATE_LONGTAIL_TIERS.map((tier) => {
                    const active = count >= tier.min && count <= tier.max
                    const reachable = tier.min <= cap
                    return (
                      <button
                        key={tier.min}
                        type="button"
                        disabled={!reachable || paused}
                        onClick={() => setCount(kind, tier.min)}
                        className={cn(
                          'rounded-xl px-1.5 py-2 text-center ring-1 transition-colors',
                          active
                            ? 'bg-teal-800 text-white ring-teal-800'
                            : 'bg-teal-950/[0.03] text-teal-950 ring-teal-900/10',
                          !reachable && 'opacity-40',
                        )}
                      >
                        <span className="block text-[10px] font-semibold tracking-wide uppercase">
                          {tier.min}–{tier.max}
                        </span>
                        <span className="mt-0.5 block text-xs font-semibold tabular-nums">
                          {money(tier.price)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <OfferFaq kind={kind} />

              {kind === 'share-longtail' ? (
                <div className="space-y-2">
                  {(
                    [
                      ['adult', t('addonAdult'), shareAdults],
                      ['child', t('addonChild'), shareChildren],
                    ] as const
                  ).map(([band, label, value]) => (
                    <div key={band} className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-teal-900/70">
                        {label}
                        {band === 'child' ? (
                          <span className="ml-1.5 text-xs font-normal text-teal-800/55">
                            {t('addonChildAge')}
                          </span>
                        ) : null}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={t('addonFewer')}
                          disabled={
                            paused ||
                            value <= (band === 'adult' && shareChildren > 0 && !savedAdultOnBoat ? 1 : 0)
                          }
                          onClick={() => setShareCount(band, value - 1)}
                          className="flex size-11 items-center justify-center rounded-full bg-teal-950/[0.05] text-teal-900 ring-1 ring-teal-900/10 disabled:opacity-40"
                        >
                          <Minus className="size-4" />
                        </button>
                        <span className="w-8 text-center font-display text-2xl font-semibold tabular-nums text-teal-950">
                          {value}
                        </span>
                        <button
                          type="button"
                          aria-label={t('addonMore')}
                          disabled={
                            paused ||
                            value >= (band === 'adult' ? adultRoomLeft : childRoomLeft) ||
                            (band === 'child' && !adultCovered)
                          }
                          onClick={() => setShareCount(band, value + 1)}
                          className="flex size-11 items-center justify-center rounded-full bg-teal-950/[0.05] text-teal-900 ring-1 ring-teal-900/10 disabled:opacity-40"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs leading-snug text-teal-800/60">
                    {t('addonShareBookingCap', { adults: bookingAdults, children: bookingChildren })}
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-teal-900/70">
                    {kind === 'private-longtail' ? t('addonBoatPeople') : t('addonPeople')}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={t('addonFewer')}
                      disabled={count <= 1 || paused}
                      onClick={() => setCount(kind, count - 1)}
                      className="flex size-11 items-center justify-center rounded-full bg-teal-950/[0.05] text-teal-900 ring-1 ring-teal-900/10 disabled:opacity-40"
                    >
                      <Minus className="size-4" />
                    </button>
                    <span className="w-8 text-center font-display text-2xl font-semibold tabular-nums text-teal-950">
                      {count}
                    </span>
                    <button
                      type="button"
                      aria-label={t('addonMore')}
                      disabled={count >= cap || paused}
                      onClick={() => setCount(kind, count + 1)}
                      className="flex size-11 items-center justify-center rounded-full bg-teal-950/[0.05] text-teal-900 ring-1 ring-teal-900/10 disabled:opacity-40"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl bg-teal-950/[0.04] px-3.5 py-2.5">
                <span className="text-sm text-teal-900/60">{t('addonTotal')}</span>
                <span className="font-display text-lg font-semibold tabular-nums text-teal-950">
                  {kind === 'share-longtail'
                    ? shareReady
                      ? money(shareTotal)
                      : '—'
                    : quote
                      ? money(quote.total)
                      : '—'}
                </span>
              </div>

              {notedKind === kind ? (
                <p className="text-sm font-semibold text-emerald-800">{t('addonJustAdded')}</p>
              ) : null}

              <Button
                type="button"
                className="h-12 w-full bg-gradient-to-r from-teal-700 via-emerald-600 to-cyan-600 text-base shadow-md shadow-teal-700/25 hover:from-teal-800 hover:to-cyan-700"
                disabled={(kind === 'share-longtail' ? !shareReady : !quote) || paused}
                onClick={() => {
                  if (kind !== 'share-longtail') {
                    void addOrMerge(kind, count)
                    return
                  }
                  void (async () => {
                    if (shareAdults > 0) {
                      const adult = await addOrMerge(kind, shareAdults, 'adult')
                      if (!adult.ok) return
                    }
                    if (shareChildren > 0) await addOrMerge(kind, shareChildren, 'child')
                  })()
                }}
              >
                {busy ? t('addonAdding') : addLabel}
              </Button>
            </div>
            ) : null}
          </article>
        )
      })}

    </section>
  )
}
