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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  formatInvoiceMoney,
  isInvoiceAmountStale,
  itemsGrandTotal,
  parseMoneyInput,
  type InvoiceDocument,
  type InvoiceItem,
} from '@/lib/invoice'

function emptyLine(invoiceId: string, bookingCode: string, travelDate: string, sortOrder: number): InvoiceItem {
  return {
    id: crypto.randomUUID(),
    invoiceId,
    bookingCode,
    travelDate,
    voucherNo: '',
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
  }
}

function countInput(value: number, onChange: (value: number) => void, ariaLabel: string) {
  return (
    <Input
      type="number"
      min={0}
      step={1}
      aria-label={ariaLabel}
      value={value || ''}
      onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) || 0)))}
      className="h-9 px-2 text-right"
    />
  )
}

export function InvoiceEditDialog({
  doc,
  isNew,
  open,
  onOpenChange,
  onSave,
  liveItemsForCodes,
}: {
  doc: InvoiceDocument | null
  isNew: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (doc: InvoiceDocument) => Promise<void>
  liveItemsForCodes?: (codes: string[]) => Omit<InvoiceItem, 'invoiceId'>[]
}) {
  const [draft, setDraft] = useState<InvoiceDocument | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !doc) {
      setDraft(null)
      setError('')
      setSaving(false)
      return
    }
    setDraft({
      ...doc,
      items: doc.items.map((item) => ({ ...item })),
    })
    setError('')
    setSaving(false)
  }, [doc, open])

  const total = useMemo(() => (draft ? itemsGrandTotal(draft.items) : 0), [draft])

  const bookingCodes = useMemo(
    () => [...new Set((draft?.items ?? []).map((item) => item.bookingCode).filter(Boolean))],
    [draft],
  )
  const liveItems = useMemo(
    () => (liveItemsForCodes && bookingCodes.length > 0 ? liveItemsForCodes(bookingCodes) : []),
    [bookingCodes, liveItemsForCodes],
  )
  const liveTotal = useMemo(() => itemsGrandTotal(liveItems), [liveItems])
  const amountStale = useMemo(() => {
    if (liveItems.length === 0 || !draft) return false
    const storedAuto = itemsGrandTotal(
      draft.items.filter((item) => item.bookingCode && item.lineKind !== 'other'),
    )
    const liveAuto = itemsGrandTotal(liveItems.filter((item) => item.lineKind !== 'other'))
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
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.map((item) => (item.id === id ? { ...item, ...next } : item)),
      }
    })
  }

  async function save() {
    if (!draft) return
    if (draft.items.length === 0) {
      setError('Add at least one bill line.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...draft,
        grandTotal: itemsGrandTotal(draft.items),
        items: draft.items.map((item, index) => ({ ...item, sortOrder: index })),
      })
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[92vh] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <DialogHeader className="border-b border-teal-900/8 px-5 py-4 pr-12">
          <DialogTitle>
            {isNew ? 'New invoice' : draft.kind === 'billing_note' ? 'Billing note' : 'Invoice'} · {draft.number}
          </DialogTitle>
          <DialogDescription>
            {draft.agentName} · {draft.status === 'paid' ? 'PAID' : 'Unpaid'} · edit the lines, then save.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {draft.status === 'paid' ? (
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-issue-date">Issue date</Label>
              <Input
                id="invoice-issue-date"
                type="date"
                value={draft.issueDate}
                onChange={(event) => patch({ issueDate: event.target.value })}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Total</Label>
              <p className="flex h-10 items-center text-sm font-medium text-teal-950">
                {formatInvoiceMoney(total)} THB
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-notes">Note</Label>
            <Textarea
              id="invoice-notes"
              value={draft.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              rows={2}
              placeholder="Shown on the invoice if needed"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-teal-900/10">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-teal-900/8 bg-teal-950/[0.03] text-left text-xs font-medium text-teal-900/55">
                  <th className="px-2 py-2">Voucher</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="w-16 px-2 py-2 text-right">A</th>
                  <th className="w-16 px-2 py-2 text-right">C</th>
                  <th className="w-16 px-2 py-2 text-right">I</th>
                  <th className="w-16 px-2 py-2 text-right">TL</th>
                  <th className="w-28 px-2 py-2 text-right">Amount</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {draft.items.map((item) => (
                  <tr key={item.id} className="border-b border-teal-900/6 last:border-0">
                    <td className="px-2 py-1.5">
                      <Input
                        value={item.voucherNo}
                        onChange={(event) => patchItem(item.id, { voucherNo: event.target.value })}
                        className="h-9 px-2"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={item.description}
                        onChange={(event) => patchItem(item.id, { description: event.target.value })}
                        className="h-9 px-2"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {countInput(item.adults, (adults) => patchItem(item.id, { adults }), 'Adults')}
                    </td>
                    <td className="px-2 py-1.5">
                      {countInput(item.children, (children) => patchItem(item.id, { children }), 'Children')}
                    </td>
                    <td className="px-2 py-1.5">
                      {countInput(item.infants, (infants) => patchItem(item.id, { infants }), 'Infants')}
                    </td>
                    <td className="px-2 py-1.5">
                      {countInput(
                        item.tourLeaders,
                        (tourLeaders) => patchItem(item.id, { tourLeaders }),
                        'Tour leaders',
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.amount || ''}
                        onChange={(event) =>
                          patchItem(item.id, { amount: parseMoneyInput(event.target.value) })
                        }
                        className="h-9 px-2 text-right"
                      />
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
                ))}
              </tbody>
            </table>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl"
            onClick={() =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      items: [
                        ...current.items,
                        emptyLine(current.id, fallbackCode, fallbackDate, current.items.length),
                      ],
                    }
                  : current,
              )
            }
          >
            <Plus className="size-3.5" />
            Add line
          </Button>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="h-10 rounded-xl" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : isNew ? 'Create invoice' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
