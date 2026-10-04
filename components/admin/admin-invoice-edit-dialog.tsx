'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  chargeUnit,
  formatInvoiceDate,
  formatInvoiceLineDescription,
  formatInvoiceMoney,
  invoiceLineKindLabel,
  invoiceLineUnitPrice,
  isInvoiceAmountStale,
  isLateReduceFeeLine,
  itemsAgentTotal,
  itemsGuestTotal,
  lateReduceFeeDisplay,
  parseSignedMoneyInput,
  withInvoiceLineRecalc,
  withInvoiceLineUnitPrice,
  type InvoiceDocument,
  type InvoiceItem,
  type InvoiceLineKind,
} from '@/lib/invoice'
import { cn } from '@/lib/utils'

const LINE_KIND_TONE: Record<InvoiceLineKind, string> = {
  tour: 'bg-teal-900/8 text-teal-900/70',
  no_show: 'bg-rose-100 text-rose-800',
  change_date: 'bg-amber-100 text-amber-900',
  cancel: 'bg-slate-200/80 text-slate-800',
  private_transfer: 'bg-sky-100 text-sky-900',
  extra_zone: 'bg-orange-100 text-orange-900',
  park_fee: 'bg-emerald-100 text-emerald-900',
  park_guest: 'bg-emerald-50 text-emerald-800',
  service: 'bg-violet-100 text-violet-900',
  other: 'bg-teal-900/6 text-teal-900/55',
}

function emptyLine(
  invoiceId: string,
  bookingCode: string,
  travelDate: string,
  sortOrder: number,
  voucherNo = '',
): InvoiceItem {
  return {
    id: crypto.randomUUID(),
    invoiceId,
    bookingCode,
    travelDate,
    voucherNo,
    description: '',
    adults: 0,
    children: 0,
    infants: 0,
    tourLeaders: 0,
    adultPrice: 0,
    childPrice: 0,
    infantPrice: 0,
    tourLeaderPrice: 0,
    cot: 0,
    amount: 0,
    lineKind: 'other',
    sortOrder,
    unit: '',
  }
}

function countInput(value: number, onChange: (value: number) => void, ariaLabel: string) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={value || ''}
      onChange={(event) => {
        const raw = event.target.value.replace(/[^\d]/g, '')
        onChange(Math.max(0, Math.round(Number(raw) || 0)))
      }}
      className="h-8 border-transparent bg-transparent px-1 text-right tabular-nums shadow-none hover:border-teal-900/15 focus-visible:border-teal-700/40 focus-visible:bg-white"
    />
  )
}

function documentTitle(doc: InvoiceDocument, isNew: boolean) {
  if (isNew) return 'New invoice'
  if (doc.kind === 'billing_note') return 'Billing note'
  return 'Invoice'
}

export function InvoiceEditDialog({
  doc,
  isNew,
  open,
  onOpenChange,
  onSave,
  liveItemsForCodes,
  guestByBookingCode,
}: {
  doc: InvoiceDocument | null
  isNew: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (doc: InvoiceDocument, mode: 'draft' | 'issue') => Promise<void>
  liveItemsForCodes?: (codes: string[]) => Omit<InvoiceItem, 'invoiceId'>[]
  guestByBookingCode?: ReadonlyMap<string, string>
}) {
  const [draft, setDraft] = useState<InvoiceDocument | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !doc) {
      setDraft(null)
      setError('')
      setSaving(false)
      setPriceDrafts({})
      return
    }
    setDraft({
      ...doc,
      items: doc.items.map((item) => {
        if (!isLateReduceFeeLine(item)) {
          return { ...item, unit: chargeUnit(item) }
        }
        const display = lateReduceFeeDisplay(item)
        return {
          ...item,
          description: formatInvoiceLineDescription(item),
          adults: display.heads || item.adults,
          adultPrice: display.perPerson || item.adultPrice,
          unit: display.heads > 0 ? 'Pax' : 'Fee',
        }
      }),
    })
    setError('')
    setSaving(false)
    setPriceDrafts({})
  }, [doc, open])

  const total = useMemo(() => (draft ? itemsAgentTotal(draft.items) : 0), [draft])
  const guestTotal = useMemo(() => (draft ? itemsGuestTotal(draft.items) : 0), [draft])
  const prebuy = useMemo(() => {
    if (!draft) return false
    const hasTour = draft.items.some((item) => item.lineKind === 'tour')
    const tourIsDeduct =
      hasTour && draft.items.every((item) => item.lineKind !== 'tour' || item.amount === 0)
    const hasNoShowDeduct = draft.items.some(
      (item) =>
        item.lineKind === 'no_show' && /deduct \d+ heads?/i.test(item.description),
    )
    const hasChangeDateDeduct = draft.items.some(
      (item) =>
        item.lineKind === 'change_date' && /deduct \d+ heads?/i.test(item.description),
    )
    return tourIsDeduct || hasNoShowDeduct || hasChangeDateDeduct
  }, [draft])
  const deductHeads = useMemo(() => {
    if (!draft || !prebuy) return 0
    return draft.items
      .filter(
        (item) =>
          item.lineKind === 'tour' ||
          item.lineKind === 'no_show' ||
          item.lineKind === 'change_date',
      )
      .reduce(
        (sum, item) => sum + Math.max(0, item.adults) + Math.max(0, item.children),
        0,
      )
  }, [draft, prebuy])

  const bookingCodes = useMemo(
    () => [...new Set((draft?.items ?? []).map((item) => item.bookingCode).filter(Boolean))],
    [draft],
  )
  const liveItems = useMemo(
    () => (liveItemsForCodes && bookingCodes.length > 0 ? liveItemsForCodes(bookingCodes) : []),
    [bookingCodes, liveItemsForCodes],
  )
  const liveTotal = useMemo(() => itemsAgentTotal(liveItems), [liveItems])
  const amountStale = useMemo(() => {
    if (liveItems.length === 0 || !draft) return false
    const storedAuto = itemsAgentTotal(
      draft.items.filter((item) => item.bookingCode && item.lineKind !== 'other'),
    )
    const liveAuto = itemsAgentTotal(liveItems.filter((item) => item.lineKind !== 'other'))
    return isInvoiceAmountStale(storedAuto, liveAuto)
  }, [draft, liveItems])

  function refreshFromBookings() {
    if (!draft || liveItems.length === 0) return
    const extras = draft.items.filter((item) => !item.bookingCode)
    setDraft({
      ...draft,
      items: [
        ...liveItems.map((item, index) => ({
          ...item,
          invoiceId: draft.id,
          sortOrder: index,
        })),
        ...extras.map((item, index) => ({
          ...item,
          sortOrder: liveItems.length + index,
        })),
      ],
    })
  }

  function patch(next: Partial<InvoiceDocument>) {
    setDraft((current) => (current ? { ...current, ...next } : current))
  }

  function patchItem(id: string, next: Partial<InvoiceItem>) {
    const affectsAmount =
      'adults' in next ||
      'children' in next ||
      'infants' in next ||
      'tourLeaders' in next ||
      'adultPrice' in next ||
      'childPrice' in next ||
      'infantPrice' in next ||
      'tourLeaderPrice' in next
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.map((item) => {
          if (item.id !== id) return item
          return affectsAmount ? withInvoiceLineRecalc(item, next) : { ...item, ...next }
        }),
      }
    })
  }

  function patchItemUnitPrice(id: string, unitPrice: number) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.map((item) =>
          item.id === id ? withInvoiceLineUnitPrice(item, unitPrice) : item,
        ),
      }
    })
  }

  function patchVoucher(voucherNo: string) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.map((item) => ({ ...item, voucherNo })),
      }
    })
  }

  async function save(mode: 'draft' | 'issue') {
    if (!draft) return
    if (draft.items.length === 0) {
      setError('Add at least one bill line.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(
        {
          ...draft,
          grandTotal: itemsAgentTotal(draft.items),
          items: draft.items.map((item, index) => ({ ...item, sortOrder: index })),
        },
        mode,
      )
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this invoice.')
      setSaving(false)
    }
  }

  if (!draft) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice</DialogTitle>
            <DialogDescription>No invoice selected.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  const fallbackCode = draft.items[0]?.bookingCode ?? ''
  const fallbackDate = draft.items[0]?.travelDate || draft.issueDate
  const paid = draft.status === 'paid'
  const unissued = isNew || draft.isDraft === true
  const uniqueVouchers = [...new Set(draft.items.map((item) => item.voucherNo.trim()).filter(Boolean))]
  const headerVoucher = uniqueVouchers[0] ?? draft.items[0]?.voucherNo ?? ''
  const travelDate =
    [...new Set(draft.items.map((item) => item.travelDate).filter(Boolean))][0] || ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[92vh] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <DialogHeader className="border-b border-teal-900/10 px-6 py-4 pr-12">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-900/45">
                {unissued ? 'Draft' : documentTitle(draft, isNew)}
              </p>
              <DialogTitle className="mt-0.5 font-display text-2xl tracking-tight text-teal-950">
                {unissued ? 'Not issued' : draft.number}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Edit invoice lines for {draft.agentName}, then save.
              </DialogDescription>
            </div>
            <span
              className={
                paid
                  ? 'rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800'
                  : 'rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900'
              }
            >
              {unissued ? 'Not issued' : paid ? 'Paid' : 'Unpaid'}
            </span>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {paid ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              This invoice is already paid. Changes stay on the same receipt
              {draft.receiptNo ? ` (${draft.receiptNo})` : ''}.
            </p>
          ) : null}

          {amountStale ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
              <p>
                Booking totals changed after this invoice was issued — live amount is{' '}
                {formatInvoiceMoney(liveTotal)} THB. The stored total stays until you update it.
              </p>
              {liveItemsForCodes ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-lg border-rose-300 bg-white"
                  onClick={refreshFromBookings}
                >
                  <RotateCcw className="size-3.5" />
                  Refresh from booking
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-6 border-b border-teal-900/8 pb-5 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-900/40">Bill to</p>
              <p className="mt-1 text-base font-semibold text-teal-950">{draft.agentName}</p>
              <p className="mt-0.5 text-sm text-teal-900/50">
                {prebuy ? 'Prebuy — deduct heads, bill extras' : 'Invoice — bill tour price plus extras'}
              </p>
            </div>
            <div>
              <label htmlFor="invoice-voucher" className="text-[11px] font-semibold uppercase tracking-wide text-teal-900/40">
                Voucher
              </label>
              {uniqueVouchers.length > 1 ? (
                <p className="mt-1 text-sm text-teal-900/55">Each line has its own reference.</p>
              ) : (
                <Input
                  id="invoice-voucher"
                  value={headerVoucher}
                  onChange={(event) => patchVoucher(event.target.value)}
                  className="mt-1 h-9"
                  placeholder="Voucher no."
                />
              )}
              {travelDate ? (
                <p className="mt-1.5 text-sm text-teal-900/50">Travel {formatInvoiceDate(travelDate)}</p>
              ) : null}
            </div>
            <div className="sm:justify-self-end sm:text-right">
              <label htmlFor="invoice-issue-date" className="text-[11px] font-semibold uppercase tracking-wide text-teal-900/40">
                Issue date
              </label>
              <Input
                id="invoice-issue-date"
                type="date"
                value={draft.issueDate}
                onChange={(event) => patch({ issueDate: event.target.value })}
                className="mt-1 h-9 w-full max-w-[12rem] sm:ml-auto"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-teal-900/40">
              Line items
            </p>
            <div className="overflow-x-auto rounded-xl border border-teal-900/12">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-teal-900/10 bg-teal-950/[0.04] text-left text-xs font-bold text-teal-950">
                    <th className="w-8 px-2 py-2.5 text-center font-bold text-teal-900/40">#</th>
                    <th className="px-2 py-2.5 font-bold">Description</th>
                    <th className="w-24 px-2 py-2.5 font-bold" title="Pax, Box, Pcs, Van">Unit</th>
                    <th className="w-14 px-1 py-2.5 text-right font-bold" title="Adults">AD</th>
                    <th className="w-14 px-1 py-2.5 text-right font-bold" title="Children">CH</th>
                    <th className="w-28 px-2 py-2.5 text-right font-bold">Price/Unit</th>
                    <th className="w-32 px-2 py-2.5 text-right font-bold">Amount (THB)</th>
                    <th className="w-10 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {draft.items.map((item, index) => {
                    const unitPrice = invoiceLineUnitPrice(item)
                    const guestName = guestByBookingCode?.get(item.bookingCode)?.trim() ?? ''
                    return (
                    <tr key={item.id} className="border-b border-teal-900/8 last:border-0">
                      <td className="px-2 py-1.5 text-center text-xs tabular-nums text-teal-900/35">
                        {index + 1}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="space-y-1">
                          <span
                            className={cn(
                              'inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                              LINE_KIND_TONE[item.lineKind],
                            )}
                          >
                            {invoiceLineKindLabel(item.lineKind)}
                          </span>
                          {guestName ? (
                            <p className="px-1.5 text-xs font-semibold text-teal-950">{guestName}</p>
                          ) : null}
                          {item.bookingCode ? (
                            <p className="px-1.5 text-[11px] font-medium tabular-nums text-teal-900/55">
                              {item.bookingCode}
                            </p>
                          ) : null}
                          <Input
                            value={item.voucherNo}
                            onChange={(event) =>
                              patchItem(item.id, { voucherNo: event.target.value })
                            }
                            className="h-8 border-transparent bg-transparent px-1.5 shadow-none hover:border-teal-900/15 focus-visible:border-teal-700/40 focus-visible:bg-white"
                            placeholder="Reference"
                            aria-label={`Reference for ${item.bookingCode || `line ${index + 1}`}`}
                          />
                          <Input
                            value={item.description}
                            onChange={(event) =>
                              patchItem(item.id, { description: event.target.value })
                            }
                            className="h-8 border-transparent bg-transparent px-1.5 shadow-none hover:border-teal-900/15 focus-visible:border-teal-700/40 focus-visible:bg-white"
                            placeholder="Description"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={item.unit ?? ''}
                          onChange={(event) => patchItem(item.id, { unit: event.target.value })}
                          className="h-8 border-transparent bg-transparent px-1.5 shadow-none hover:border-teal-900/15 focus-visible:border-teal-700/40 focus-visible:bg-white"
                          placeholder="Box, Pcs, Van"
                          list="invoice-unit-suggestions"
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        {countInput(item.adults, (adults) => patchItem(item.id, { adults }), 'Adults')}
                      </td>
                      <td className="px-1 py-1.5">
                        {countInput(item.children, (children) => patchItem(item.id, { children }), 'Children')}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={
                            priceDrafts[item.id] ?? (unitPrice === 0 ? '' : String(unitPrice))
                          }
                          onChange={(event) => {
                            const raw = event.target.value.replace(/,/g, '')
                            if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return
                            setPriceDrafts((current) => ({ ...current, [item.id]: raw }))
                            if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return
                            patchItemUnitPrice(item.id, parseSignedMoneyInput(raw))
                          }}
                          onBlur={() => {
                            const raw = priceDrafts[item.id]
                            if (raw !== undefined) {
                              patchItemUnitPrice(item.id, parseSignedMoneyInput(raw))
                              setPriceDrafts((current) => {
                                const next = { ...current }
                                delete next[item.id]
                                return next
                              })
                            }
                          }}
                          className={cn(
                            'h-8 border-transparent bg-transparent px-1.5 text-right font-medium tabular-nums shadow-none hover:border-teal-900/15 focus-visible:border-teal-700/40 focus-visible:bg-white',
                            unitPrice < 0 && 'text-rose-700',
                          )}
                          title="Price per unit. Amount = Price/Unit × AD/CH (auto)."
                        />
                      </td>
                      <td
                        className={cn(
                          'px-2 py-1.5 text-right font-medium tabular-nums',
                          item.amount < 0 ? 'text-rose-700' : 'text-teal-950',
                        )}
                        title="Auto-calculated from Price/Unit × AD/CH"
                      >
                        {item.amount === 0 ? '—' : formatInvoiceMoney(item.amount)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Remove line"
                          onClick={() =>
                            setDraft((current) =>
                              current
                                ? { ...current, items: current.items.filter((row) => row.id !== item.id) }
                                : current,
                            )
                          }
                        >
                          <Trash2 className="size-3.5 text-rose-600" />
                        </Button>
                      </td>
                    </tr>
                    )
                  })}
                  {draft.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-sm text-teal-900/45">
                        No lines yet. Add a line or refresh from the booking.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <datalist id="invoice-unit-suggestions">
              <option value="Pax" />
              <option value="Head" />
              <option value="Box" />
              <option value="Pcs" />
              <option value="Van" />
              <option value="Trip" />
            </datalist>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-teal-800 hover:text-teal-950"
              onClick={() =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        items: [
                          ...current.items,
                          emptyLine(
                            current.id,
                            fallbackCode,
                            fallbackDate,
                            current.items.length,
                            headerVoucher,
                          ),
                        ],
                      }
                    : current,
                )
              }
            >
              <Plus className="size-3.5" />
              Add line
            </button>
          </div>

          <div className="grid items-start gap-6 border-t border-teal-900/10 pt-5 sm:grid-cols-[1fr_16rem]">
            <div>
              <label htmlFor="invoice-notes" className="text-[11px] font-semibold uppercase tracking-wide text-teal-900/40">
                Notes
              </label>
              <Textarea
                id="invoice-notes"
                value={draft.notes}
                onChange={(event) => patch({ notes: event.target.value })}
                rows={3}
                placeholder="Optional note printed on the invoice"
                className="mt-1.5"
              />
            </div>
            <div className="rounded-xl border border-teal-900/12 bg-teal-950/[0.03] px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-900/45">
                  {prebuy ? 'To pay' : 'Due'}
                </p>
                <p
                  className={cn(
                    'text-xl font-semibold tabular-nums',
                    total < 0 ? 'text-rose-700' : 'text-teal-950',
                  )}
                >
                  {formatInvoiceMoney(total)}
                  <span className="ml-1 text-xs font-medium text-teal-900/45">THB</span>
                </p>
              </div>
              {prebuy && deductHeads > 0 ? (
                <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-teal-900/8 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-900/45">
                    Heads
                  </p>
                  <p className="text-base font-semibold tabular-nums text-teal-950">{deductHeads}</p>
                </div>
              ) : null}
              {guestTotal > 0 ? (
                <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-teal-900/8 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-900/45">
                    Guest
                  </p>
                  <p className="text-xs font-medium tabular-nums text-teal-900/55">
                    {formatInvoiceMoney(guestTotal)} THB
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {unissued ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl"
              disabled={saving}
              onClick={() => void save('draft')}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-10 rounded-xl"
            disabled={saving}
            onClick={() => void save('issue')}
          >
            {saving ? 'Saving…' : unissued ? 'Create invoice' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
