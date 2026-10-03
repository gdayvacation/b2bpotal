'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ClipboardPaste,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  MessageSquareText,
  Sparkles,
  X,
} from 'lucide-react'
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
import {
  draftReadyForImport,
  matchAgentFromSeed,
  resolvePickupZoneForDraft,
} from '@/lib/booking-import-resolve'
import {
  emptyImportSelection,
  inferYearMonthFromFileName,
  parseBookingSpreadsheetFile,
  type BookingSpreadsheetImportRow,
} from '@/lib/booking-spreadsheet-import'
import { uniqueAgentSlug } from '@/lib/format'
import { usePortal } from '@/components/portal-provider'
import { cn } from '@/lib/utils'
import type { IncludeOption, Program } from '@/lib/types'

type CaptureMode = 'chat' | 'spreadsheet'
type Phase = 'capture' | 'review' | 'bulk-review'

export function BookingFromChatDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { agents, zones, hotels, addBooking, addAgent } = usePortal()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const spreadsheetInputRef = useRef<HTMLInputElement>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const [captureMode, setCaptureMode] = useState<CaptureMode>('chat')
  const [phase, setPhase] = useState<Phase>('capture')
  const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null)
  const [yearMonth, setYearMonth] = useState('')
  const [needsMonth, setNeedsMonth] = useState(false)
  const [bulkRows, setBulkRows] = useState<BookingSpreadsheetImportRow[]>([])
  const [importSummary, setImportSummary] = useState<{ ok: number; failed: string[] } | null>(
    null,
  )
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [chatText, setChatText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<BookingImageDraft>(emptyBookingImageDraft)

  const reset = useCallback(() => {
    setCaptureMode('chat')
    setPhase('capture')
    setBusy(false)
    setError('')
    setFile(null)
    setChatText('')
    setSpreadsheetFile(null)
    setYearMonth('')
    setNeedsMonth(false)
    setBulkRows([])
    setImportSummary(null)
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

  function acceptSpreadsheet(next: File | null) {
    if (!next) return
    const name = next.name.toLowerCase()
    if (
      !name.endsWith('.csv') &&
      !name.endsWith('.xlsx') &&
      !name.endsWith('.xls') &&
      !name.endsWith('.ods')
    ) {
      setError('Use a CSV or Excel file (.csv, .xlsx, .xls).')
      return
    }
    setError('')
    setSpreadsheetFile(next)
    setImportSummary(null)
    const inferred = inferYearMonthFromFileName(next.name)
    if (inferred) setYearMonth(inferred)
    setNeedsMonth(false)
  }

  async function readSpreadsheet() {
    if (!spreadsheetFile) {
      setError('Choose a CSV or Excel file first.')
      return
    }
    setBusy(true)
    setError('')
    setImportSummary(null)
    try {
      const parsed = await parseBookingSpreadsheetFile(spreadsheetFile, {
        yearMonth: yearMonth || undefined,
      })
      if (parsed.needsMonth) {
        setNeedsMonth(true)
        if (parsed.inferredYearMonth) setYearMonth(parsed.inferredYearMonth)
        setError('This workbook uses day tabs (1–31). Pick the tour month, then read again.')
        return
      }
      if (parsed.rows.length === 0) {
        throw new Error('No booking rows found. Check headers or try another sheet.')
      }
      setBulkRows(emptyImportSelection(parsed.rows))
      setPhase('bulk-review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the file.')
    } finally {
      setBusy(false)
    }
  }

  function resolveAgentForDraft(agentName: string) {
    const trimmed = agentName.trim().replace(/\s+/g, ' ')
    if (!trimmed) return { error: 'Missing agent name.' }
    const matched = matchAgentFromSeed(agents, trimmed)
    if (matched) return { slug: matched.slug, name: matched.name }
    const createError = addAgent(trimmed)
    if (createError) return { error: createError }
    const slug = uniqueAgentSlug(
      trimmed,
      agents.map((agent) => agent.slug),
    )
    return { slug, name: trimmed }
  }

  async function importSelectedRows() {
    const selected = bulkRows.filter((row) => row.selected)
    if (selected.length === 0) {
      setError('Select at least one booking to add.')
      return
    }
    setBusy(true)
    setError('')
    const failed: string[] = []
    const succeededIds = new Set<string>()
    let ok = 0

    for (const row of selected) {
      const draft = row.draft
      if (!draftReadyForImport(draft)) {
        failed.push(`Row ${row.rowNumber} (${row.sheet}): incomplete — fix or deselect.`)
        continue
      }
      const agentResult = resolveAgentForDraft(draft.agentName)
      if ('error' in agentResult) {
        failed.push(`Row ${row.rowNumber}: ${agentResult.error}`)
        continue
      }
      const pickupZone = resolvePickupZoneForDraft(draft, zones, hotels)
      if (!pickupZone) {
        failed.push(
          `Row ${row.rowNumber}: pickup zone missing — set zone or a known hotel.`,
        )
        continue
      }
      const program = draft.program!
      const result = addBooking(
        {
          agentSlug: agentResult.slug,
          agentName: agentResult.name,
          agentRef: draft.agentRef.trim(),
          program,
          date: draft.date,
          parkFee: draft.parkFee,
          canoe: program === 'James Bond' ? draft.canoe : null,
          adults: draft.adults,
          children: draft.children,
          infants: draft.infants,
          tourLeaders: draft.tourLeaders,
          leadGuest: draft.leadGuest.trim(),
          pickupZone,
          pickupHotel: draft.pickupHotel.trim(),
          roomNumber: draft.roomNumber.trim(),
          note: draft.note.trim(),
          cashOnTour: draft.cashOnTour.trim(),
        },
        { bypassCutoff: true, actor: { role: 'admin', name: 'Admin import' } },
      )
      if (!result.ok) {
        failed.push(`Row ${row.rowNumber} · ${draft.leadGuest}: ${result.error}`)
        continue
      }
      ok += 1
      succeededIds.add(row.id)
    }

    setImportSummary({ ok, failed })
    if (succeededIds.size > 0) {
      setBulkRows((current) => current.filter((row) => !succeededIds.has(row.id)))
    }
    setBusy(false)
  }

  const selectedBulkCount = bulkRows.filter((row) => row.selected).length

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl md:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-teal-700" />
            {phase === 'bulk-review'
              ? 'Review imported bookings'
              : phase === 'capture'
                ? 'Seed bookings'
                : 'Review extracted booking'}
          </DialogTitle>
          <DialogDescription>
            {phase === 'bulk-review'
              ? 'Check every row from your file. Deselect any you do not want, then add the rest to the system.'
              : phase === 'capture'
                ? captureMode === 'chat'
                  ? 'Paste chat text (⌘V) and/or upload a screenshot. AI builds a draft — you recheck before it is saved.'
                  : 'Upload CSV or Excel (including multi-day workbooks). Rows are parsed for review — nothing is saved until you confirm.'
                : 'Correct anything that looks wrong, then continue to the booking form. Nothing is saved until you confirm there.'}
          </DialogDescription>
        </DialogHeader>

        {phase === 'bulk-review' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-teal-900/70">
              <span>
                {bulkRows.length} row{bulkRows.length === 1 ? '' : 's'} · {selectedBulkCount} selected
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setBulkRows((current) => current.map((row) => ({ ...row, selected: true })))
                  }
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setBulkRows((current) =>
                      current.map((row) => ({
                        ...row,
                        selected: draftReadyForImport(row.draft),
                      })),
                    )
                  }
                >
                  Select ready only
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setBulkRows((current) => current.map((row) => ({ ...row, selected: false })))
                  }
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="max-h-[min(52vh,420px)] overflow-auto rounded-xl border border-teal-900/10">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="sticky top-0 bg-teal-50/95 text-teal-900/60">
                  <tr>
                    <th className="w-10 px-2 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all rows"
                        checked={bulkRows.length > 0 && bulkRows.every((row) => row.selected)}
                        onChange={(event) => {
                          const checked = event.target.checked
                          setBulkRows((current) =>
                            current.map((row) => ({ ...row, selected: checked })),
                          )
                        }}
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Program</th>
                    <th className="px-2 py-2 font-medium">Guest</th>
                    <th className="px-2 py-2 font-medium">Pax</th>
                    <th className="px-2 py-2 font-medium">Agent</th>
                    <th className="px-2 py-2 font-medium">Hotel / zone</th>
                    <th className="px-2 py-2 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((row) => {
                    const ready = draftReadyForImport(row.draft)
                    const pax =
                      row.draft.adults +
                      row.draft.children +
                      row.draft.infants +
                      row.draft.tourLeaders
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          'border-t border-teal-900/6',
                          !ready && 'bg-amber-50/40',
                        )}
                      >
                        <td className="px-2 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(event) =>
                              setBulkRows((current) =>
                                current.map((item) =>
                                  item.id === row.id
                                    ? { ...item, selected: event.target.checked }
                                    : item,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2 align-top whitespace-nowrap">{row.draft.date || '—'}</td>
                        <td className="px-2 py-2 align-top">{row.draft.program || '—'}</td>
                        <td className="max-w-[120px] truncate px-2 py-2 align-top" title={row.draft.leadGuest}>
                          {row.draft.leadGuest || '—'}
                        </td>
                        <td className="px-2 py-2 align-top whitespace-nowrap">{pax}</td>
                        <td className="max-w-[100px] truncate px-2 py-2 align-top" title={row.draft.agentName}>
                          {row.draft.agentName || '—'}
                        </td>
                        <td className="max-w-[140px] truncate px-2 py-2 align-top">
                          {[row.draft.pickupHotel, row.draft.pickupZone].filter(Boolean).join(' · ') ||
                            '—'}
                        </td>
                        <td className="px-2 py-2 align-top text-amber-900/80">
                          {!ready ? 'Needs data' : null}
                          {row.draft.warnings.length > 0 ? (
                            <span title={row.draft.warnings.join(' ')}>⚠</span>
                          ) : null}
                          {row.sheet !== 'Sheet1' ? (
                            <span className="text-teal-900/45"> · {row.sheet}</span>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {importSummary ? (
              <div className="space-y-2 rounded-xl border border-teal-900/10 bg-teal-50/50 px-3 py-2 text-sm">
                <p className="font-medium text-teal-950">
                  Added {importSummary.ok} booking{importSummary.ok === 1 ? '' : 's'}.
                </p>
                {importSummary.failed.length > 0 ? (
                  <ul className="max-h-32 overflow-auto text-amber-950">
                    {importSummary.failed.map((line) => (
                      <li key={line}>• {line}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {error}
              </p>
            ) : null}
          </div>
        ) : phase === 'capture' ? (
          <div className="space-y-4">
            <div className="flex gap-1 rounded-xl border border-teal-900/10 bg-teal-950/[0.03] p-1">
              <button
                type="button"
                onClick={() => setCaptureMode('chat')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  captureMode === 'chat'
                    ? 'bg-white text-teal-950 shadow-sm'
                    : 'text-teal-900/55 hover:text-teal-900/80',
                )}
              >
                <MessageSquareText className="size-3.5" />
                Chat / photo
              </button>
              <button
                type="button"
                onClick={() => setCaptureMode('spreadsheet')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  captureMode === 'spreadsheet'
                    ? 'bg-white text-teal-950 shadow-sm'
                    : 'text-teal-900/55 hover:text-teal-900/80',
                )}
              >
                <FileSpreadsheet className="size-3.5" />
                CSV / Excel
              </button>
            </div>

            {captureMode === 'spreadsheet' ? (
              <>
                <div
                  className={cn(
                    'relative flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-teal-900/20 bg-teal-950/[0.02] px-4 py-5 text-center',
                    spreadsheetFile && 'border-solid border-teal-700/30 bg-white',
                  )}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    acceptSpreadsheet(event.dataTransfer.files?.[0] ?? null)
                  }}
                >
                  <FileSpreadsheet className="size-7 text-teal-800/35" />
                  {spreadsheetFile ? (
                    <p className="text-sm font-medium text-teal-950">{spreadsheetFile.name}</p>
                  ) : (
                    <p className="text-xs text-teal-900/50">
                      Drop CSV or Excel here — or export from Google Sheets as .xlsx / .csv
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => spreadsheetInputRef.current?.click()}
                  >
                    Choose file
                  </Button>
                  <input
                    ref={spreadsheetInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(event) => acceptSpreadsheet(event.target.files?.[0] ?? null)}
                  />
                </div>

                {(needsMonth || yearMonth) && (
                  <Field label="Tour month (for day tabs 1–31)">
                    <Input
                      type="month"
                      value={yearMonth}
                      onChange={(e) => {
                        setYearMonth(e.target.value)
                        setNeedsMonth(false)
                        if (error) setError('')
                      }}
                    />
                  </Field>
                )}

                <p className="text-xs text-teal-900/45">
                  Supports report-style headers (Date, Guest, Program, …) and Good Day speedboat
                  workbooks with one tab per day.
                </p>
              </>
            ) : (
              <>
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
              </>
            )}
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
          {phase === 'review' || phase === 'bulk-review' ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (phase === 'bulk-review') {
                  setPhase('capture')
                  setBulkRows([])
                  setImportSummary(null)
                } else {
                  setPhase('capture')
                }
              }}
            >
              Back
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {phase === 'capture' ? (
            captureMode === 'spreadsheet' ? (
              <Button
                type="button"
                onClick={() => void readSpreadsheet()}
                disabled={busy || !spreadsheetFile}
                className="gap-1.5"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />}
                {busy ? 'Reading…' : 'Read file'}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={extract}
                disabled={busy || !canExtract}
                className="gap-1.5"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {busy ? 'Reading…' : 'Read with AI'}
              </Button>
            )
          ) : phase === 'bulk-review' ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                {importSummary?.ok ? 'Done' : 'Close'}
              </Button>
              <Button
                type="button"
                onClick={() => void importSelectedRows()}
                disabled={busy || selectedBulkCount === 0}
                className="gap-1.5"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {busy ? 'Adding…' : `Add ${selectedBulkCount} to system`}
              </Button>
            </>
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
