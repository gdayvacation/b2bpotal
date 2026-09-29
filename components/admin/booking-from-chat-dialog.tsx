'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardPaste, ImagePlus, Loader2, Sparkles, X } from 'lucide-react'
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
  emptyBookingImageDraft,
  saveBookingImageDraft,
  type BookingImageDraft,
} from '@/lib/booking-from-image'
import { cn } from '@/lib/utils'
import type { IncludeOption, Program } from '@/lib/types'

type Phase = 'capture' | 'review'

export function BookingFromChatDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const [phase, setPhase] = useState<Phase>('capture')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [chatText, setChatText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<BookingImageDraft>(emptyBookingImageDraft)

  const reset = useCallback(() => {
    setPhase('capture')
    setBusy(false)
    setError('')
    setFile(null)
    setChatText('')
    setDraft(emptyBookingImageDraft())
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  useEffect(() => {
    if (open && phase === 'capture') {
      const t = window.setTimeout(() => textAreaRef.current?.focus(), 50)
      return () => window.clearTimeout(t)
    }
  }, [open, phase])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function acceptFile(next: File | null) {
    if (!next) return
    if (!next.type.startsWith('image/')) {
      setError('Please choose an image screenshot.')
      return
    }
    setError('')
    setFile(next)
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(next)
    })
  }

  function acceptText(next: string) {
    const trimmed = next.trim()
    if (!trimmed) return
    setError('')
    setChatText((current) => {
      if (!current.trim()) return trimmed
      return `${current.trim()}\n\n${trimmed}`
    })
  }

  async function pasteFromClipboard() {
    setError('')
    try {
      // Prefer plain text (common when copying chat messages).
      const text = await navigator.clipboard.readText()
      if (text.trim()) {
        acceptText(text)
        return
      }
    } catch {
      // Fall through to rich clipboard / image read.
    }

    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain')
          acceptText(await blob.text())
          return
        }
        const imageType = item.types.find((t) => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          acceptFile(
            new File([blob], `chat-paste.${imageType.split('/')[1] || 'png'}`, {
              type: imageType,
            }),
          )
          return
        }
      }
      setError('Clipboard is empty. Copy chat text or a screenshot, then paste.')
    } catch {
      setError('Clipboard blocked. Click in the text box and press ⌘V / Ctrl+V, or use Upload.')
    }
  }

  useEffect(() => {
    if (!open || phase !== 'capture') return
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null
      // Let the textarea handle its own paste normally.
      if (target?.closest('textarea, input')) return

      const imageItem = Array.from(event.clipboardData?.items ?? []).find((entry) =>
        entry.type.startsWith('image/'),
      )
      if (imageItem) {
        const blob = imageItem.getAsFile()
        if (blob) {
          event.preventDefault()
          acceptFile(blob)
          return
        }
      }

      const text = event.clipboardData?.getData('text/plain')?.trim()
      if (text) {
        event.preventDefault()
        acceptText(text)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open, phase])

  async function extract() {
    if (!file && !chatText.trim()) {
      setError('Paste chat text or add a screenshot first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      if (file) body.append('image', file)
      if (chatText.trim()) body.append('text', chatText.trim())
      const response = await fetch('/api/admin/extract-booking', {
        method: 'POST',
        body,
      })
      const payload = (await response.json().catch(() => ({}))) as {
        draft?: BookingImageDraft
        error?: string
      }
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || 'Could not read the chat.')
      }
      setDraft(payload.draft)
      setPhase('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the chat.')
    } finally {
      setBusy(false)
    }
  }

  function continueToForm() {
    saveBookingImageDraft(draft)
    onOpenChange(false)
    router.push('/admin/bookings/new?seed=chat')
  }

  function updateDraft<K extends keyof BookingImageDraft>(key: K, value: BookingImageDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const canExtract = Boolean(file || chatText.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-teal-700" />
            {phase === 'capture' ? 'Seed booking from chat' : 'Review extracted booking'}
          </DialogTitle>
          <DialogDescription>
            {phase === 'capture'
              ? 'Paste chat text (⌘V) and/or upload a screenshot. AI builds a draft — you recheck before it is saved.'
              : 'Correct anything that looks wrong, then continue to the booking form. Nothing is saved until you confirm there.'}
          </DialogDescription>
        </DialogHeader>

        {phase === 'capture' ? (
          <div className="space-y-4">
            <Field label="Chat text">
              <Textarea
                ref={textAreaRef}
                value={chatText}
                onChange={(e) => {
                  setChatText(e.target.value)
                  if (error) setError('')
                }}
                placeholder="Paste the booking message here…&#10;&#10;e.g. James Bond 12/10, 2AD 1CH, Hotel Patong Beach, guest Mr Smith"
                rows={6}
                className="min-h-[140px] resize-y"
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={pasteFromClipboard} className="gap-1.5">
                <ClipboardPaste className="size-3.5" />
                Paste text
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5"
              >
                <ImagePlus className="size-3.5" />
                Upload photo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                capture="environment"
                className="hidden"
                onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
              />
            </div>

            <div
              className={cn(
                'relative flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-teal-900/20 bg-teal-950/[0.02] px-4 py-5 text-center',
                previewUrl && 'border-solid border-teal-700/30 bg-white',
              )}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                acceptFile(event.dataTransfer.files?.[0] ?? null)
              }}
            >
              {previewUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Chat screenshot preview"
                    className="max-h-40 w-full rounded-xl object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null)
                      setPreviewUrl((current) => {
                        if (current) URL.revokeObjectURL(current)
                        return null
                      })
                    }}
                    className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-full border border-teal-900/10 bg-white text-teal-900/70 shadow-sm hover:bg-teal-50"
                    aria-label="Remove image"
                  >
                    <X className="size-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <ImagePlus className="size-6 text-teal-800/35" />
                  <p className="text-xs text-teal-900/50">Optional screenshot — drop or upload</p>
                </>
              )}
            </div>

            {error ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {draft.warnings.length > 0 ? (
              <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
                {draft.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            ) : null}

            <p className="text-xs font-medium tracking-wide text-teal-900/45 uppercase">
              Confidence: {draft.confidence}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Agent / agency">
                <Input
                  value={draft.agentName}
                  onChange={(e) => updateDraft('agentName', e.target.value)}
                  placeholder="Agency name"
                />
              </Field>
              <Field label="Agent ref / voucher #">
                <Input
                  value={draft.agentRef}
                  onChange={(e) => updateDraft('agentRef', e.target.value)}
                />
              </Field>
              <Field label="Program">
                <select
                  className="h-10 w-full rounded-lg border border-teal-900/12 bg-white px-3 text-sm"
                  value={draft.program ?? ''}
                  onChange={(e) =>
                    updateDraft('program', (e.target.value || null) as Program | null)
                  }
                >
                  <option value="">Select…</option>
                  <option value="PP">PP (Phi Phi)</option>
                  <option value="James Bond">James Bond</option>
                </select>
              </Field>
              <Field label="Tour date">
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(e) => updateDraft('date', e.target.value)}
                />
              </Field>
              <Field label="Lead guest">
                <Input
                  value={draft.leadGuest}
                  onChange={(e) => updateDraft('leadGuest', e.target.value)}
                />
              </Field>
              <Field label="Pickup hotel">
                <Input
                  value={draft.pickupHotel}
                  onChange={(e) => updateDraft('pickupHotel', e.target.value)}
                />
              </Field>
              <Field label="Adults">
                <Input
                  type="number"
                  min={0}
                  value={draft.adults}
                  onChange={(e) => updateDraft('adults', Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Children">
                <Input
                  type="number"
                  min={0}
                  value={draft.children}
                  onChange={(e) => updateDraft('children', Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Infants">
                <Input
                  type="number"
                  min={0}
                  value={draft.infants}
                  onChange={(e) => updateDraft('infants', Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Tour leaders">
                <Input
                  type="number"
                  min={0}
                  value={draft.tourLeaders}
                  onChange={(e) => updateDraft('tourLeaders', Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Park fee">
                <IncludeSelect
                  value={draft.parkFee}
                  onChange={(value) => updateDraft('parkFee', value)}
                />
              </Field>
              <Field label="Canoe">
                <IncludeSelect
                  value={draft.canoe}
                  onChange={(value) => updateDraft('canoe', value)}
                />
              </Field>
              <Field label="Pickup zone">
                <Input
                  value={draft.pickupZone}
                  onChange={(e) => updateDraft('pickupZone', e.target.value)}
                  placeholder="Patong / Kata / No Transfer…"
                />
              </Field>
              <Field label="Room #">
                <Input
                  value={draft.roomNumber}
                  onChange={(e) => updateDraft('roomNumber', e.target.value)}
                />
              </Field>
              <Field label="Cash on tour">
                <Input
                  value={draft.cashOnTour}
                  onChange={(e) => updateDraft('cashOnTour', e.target.value)}
                />
              </Field>
            </div>

            <Field label="Note">
              <Textarea
                value={draft.note}
                onChange={(e) => updateDraft('note', e.target.value)}
                rows={2}
              />
            </Field>

            {error ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {phase === 'review' ? (
            <Button type="button" variant="outline" onClick={() => setPhase('capture')}>
              Back
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {phase === 'capture' ? (
            <Button
              type="button"
              onClick={extract}
              disabled={busy || !canExtract}
              className="gap-1.5"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {busy ? 'Reading…' : 'Read with AI'}
            </Button>
          ) : (
            <Button type="button" onClick={continueToForm} className="gap-1.5">
              Continue to booking form
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-teal-900/70">{label}</Label>
      {children}
    </div>
  )
}

function IncludeSelect({
  value,
  onChange,
}: {
  value: IncludeOption
  onChange: (value: IncludeOption) => void
}) {
  return (
    <select
      className="h-10 w-full rounded-lg border border-teal-900/12 bg-white px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as IncludeOption)}
    >
      <option value="Included">Included</option>
      <option value="Not Included">Not Included</option>
    </select>
  )
}
