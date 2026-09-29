'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, CalendarCheck2, History, Pencil, Plus, Trash2 } from 'lucide-react'
import { AdminAgentAllotmentDailyChecker } from '@/components/admin/admin-agent-allotment-daily'
import { AdminAgentAllotmentHistory } from '@/components/admin/admin-agent-allotment-history'
import { usePortal } from '@/components/portal-provider'
import { PageHeader, Surface } from '@/components/ui-primitives'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatShortDate, todayISO, uniqueAgentSlug } from '@/lib/format'
import {
  allotmentTotalAmount,
  createAgentAllotment,
  deleteAgentAllotment,
  listAgentAllotments,
  updateAgentAllotment,
  type AgentAllotment,
} from '@/lib/supabase/agent-allotment-db'
import { cn } from '@/lib/utils'

type View = 'hub' | 'add' | 'history' | 'daily'

type Draft = {
  agentSlug: string
  newAgentName: string
  adultPrice: string
  childPrice: string
  adultSeats: string
  childSeats: string
  paidDate: string
  note: string
}

const NEW_AGENT_VALUE = '__new__'

const emptyDraft = (): Draft => ({
  agentSlug: '',
  newAgentName: '',
  adultPrice: '',
  childPrice: '',
  adultSeats: '',
  childSeats: '',
  paidDate: todayISO(),
  note: '',
})

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

function parseMoney(value: string) {
  const n = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : NaN
}

function parseHeads(value: string) {
  const n = Math.floor(Number(String(value).trim()))
  return Number.isFinite(n) ? n : NaN
}

function draftTotals(draft: Draft) {
  const adultPrice = parseMoney(draft.adultPrice)
  const childPrice = parseMoney(draft.childPrice)
  const adultSeats = parseHeads(draft.adultSeats)
  const childSeats = parseHeads(draft.childSeats)
  const safeAdultPrice = Number.isFinite(adultPrice) && adultPrice >= 0 ? adultPrice : 0
  const safeChildPrice = Number.isFinite(childPrice) && childPrice >= 0 ? childPrice : 0
  const safeAdultSeats = Number.isFinite(adultSeats) && adultSeats >= 0 ? adultSeats : 0
  const safeChildSeats = Number.isFinite(childSeats) && childSeats >= 0 ? childSeats : 0
  return {
    adultPrice: safeAdultPrice,
    childPrice: safeChildPrice,
    adultSeats: safeAdultSeats,
    childSeats: safeChildSeats,
    seats: safeAdultSeats + safeChildSeats,
    totalAmount: allotmentTotalAmount({
      adultPrice: safeAdultPrice,
      childPrice: safeChildPrice,
      adultSeats: safeAdultSeats,
      childSeats: safeChildSeats,
    }),
  }
}

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function AdminAgentAllotment() {
  const { agents, addAgent } = usePortal()
  const [view, setView] = useState<View>('hub')
  const [rows, setRows] = useState<AgentAllotment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<AgentAllotment | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const agentOptions = useMemo(
    () => [...agents].sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  )

  async function refresh() {
    const next = await listAgentAllotments()
    setRows(next)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      try {
        const next = await listAgentAllotments()
        if (!cancelled) setRows(next)
      } catch (caught) {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : 'Could not load allotments.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  function resolveExistingAgent(slug: string) {
    const agent = agentOptions.find((item) => item.slug === slug)
    if (!agent) return null
    return { slug: agent.slug, name: agent.name }
  }

  function resolveOrCreateAgent(draftValue: Draft): { slug: string; name: string } | { error: string } {
    if (draftValue.agentSlug === NEW_AGENT_VALUE) {
      const trimmed = draftValue.newAgentName.trim().replace(/\s+/g, ' ')
      if (!trimmed) return { error: 'Enter a new agent name.' }
      const existing = agentOptions.find(
        (agent) => agent.name.toLowerCase() === trimmed.toLowerCase(),
      )
      if (existing) return { slug: existing.slug, name: existing.name }
      const createError = addAgent(trimmed)
      if (createError) return { error: createError }
      const slug = uniqueAgentSlug(
        trimmed,
        agentOptions.map((agent) => agent.slug),
      )
      return { slug, name: trimmed }
    }
    const agent = resolveExistingAgent(draftValue.agentSlug)
    if (!agent) return { error: 'Choose an agent, or add a new one.' }
    return agent
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAddError('')
    const agent = resolveOrCreateAgent(draft)
    if ('error' in agent) {
      setAddError(agent.error)
      return
    }
    const adultPrice = parseMoney(draft.adultPrice)
    const childPrice = parseMoney(draft.childPrice)
    const adultSeats = parseHeads(draft.adultSeats || '0')
    const childSeats = parseHeads(draft.childSeats || '0')
    if (!Number.isFinite(adultPrice) || adultPrice < 0) {
      setAddError('Enter a valid AD price / head.')
      return
    }
    if (!Number.isFinite(childPrice) || childPrice < 0) {
      setAddError('Enter a valid CH price / head.')
      return
    }
    if (!Number.isFinite(adultSeats) || adultSeats < 0) {
      setAddError('Enter AD heads (0 or more).')
      return
    }
    if (!Number.isFinite(childSeats) || childSeats < 0) {
      setAddError('Enter CH heads (0 or more).')
      return
    }
    if (adultSeats + childSeats <= 0) {
      setAddError('Enter at least one AD or CH head.')
      return
    }
    if (!isIsoDate(draft.paidDate)) {
      setAddError('Enter the date they paid for prebuy.')
      return
    }
    setAdding(true)
    try {
      await createAgentAllotment({
        agentSlug: agent.slug,
        agentName: agent.name,
        adultSeats,
        childSeats,
        adultPrice,
        childPrice,
        paidDate: draft.paidDate.trim(),
        note: draft.note,
      })
      setDraft(emptyDraft())
      await refresh()
    } catch (caught) {
      setAddError(caught instanceof Error ? caught.message : 'Could not save allotment.')
    } finally {
      setAdding(false)
    }
  }

  function openEdit(row: AgentAllotment) {
    setEditing(row)
    setEditDraft({
      agentSlug: row.agentSlug,
      newAgentName: '',
      adultPrice: row.adultPrice ? String(row.adultPrice) : '',
      childPrice: row.childPrice ? String(row.childPrice) : '',
      adultSeats: String(row.adultSeats),
      childSeats: String(row.childSeats),
      paidDate: row.paidDate || todayISO(),
      note: row.note,
    })
    setEditError('')
  }

  async function handleEditSave() {
    if (!editing) return
    setEditError('')
    const agent = resolveOrCreateAgent(editDraft)
    if ('error' in agent) {
      setEditError(agent.error)
      return
    }
    const adultPrice = parseMoney(editDraft.adultPrice)
    const childPrice = parseMoney(editDraft.childPrice)
    const adultSeats = parseHeads(editDraft.adultSeats || '0')
    const childSeats = parseHeads(editDraft.childSeats || '0')
    if (!Number.isFinite(adultPrice) || adultPrice < 0) {
      setEditError('Enter a valid AD price / head.')
      return
    }
    if (!Number.isFinite(childPrice) || childPrice < 0) {
      setEditError('Enter a valid CH price / head.')
      return
    }
    if (!Number.isFinite(adultSeats) || adultSeats < 0) {
      setEditError('Enter AD heads (0 or more).')
      return
    }
    if (!Number.isFinite(childSeats) || childSeats < 0) {
      setEditError('Enter CH heads (0 or more).')
      return
    }
    if (adultSeats + childSeats <= 0) {
      setEditError('Enter at least one AD or CH head.')
      return
    }
    if (!isIsoDate(editDraft.paidDate)) {
      setEditError('Enter the date they paid for prebuy.')
      return
    }
    setSavingEdit(true)
    try {
      await updateAgentAllotment(editing.id, {
        agentSlug: agent.slug,
        agentName: agent.name,
        adultSeats,
        childSeats,
        adultPrice,
        childPrice,
        paidDate: editDraft.paidDate.trim(),
        note: editDraft.note,
      })
      setEditing(null)
      await refresh()
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : 'Could not update allotment.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(row: AgentAllotment) {
    if (!window.confirm(`Remove allotment for ${row.agentName}?`)) return
    try {
      await deleteAgentAllotment(row.id)
      await refresh()
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Could not remove allotment.')
    }
  }

  if (view === 'hub') {
    return (
      <div className="w-full">
        <PageHeader
          title="Agent Allotment"
          description="Prebuy seats by agent — add a purchase, check daily heads, or review booking usage and balance left."
        />
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          <AllotmentModeCard
            tone="teal"
            title="Add allotment"
            subtitle="Record a new prebuy — AD/CH price per head, heads, and paid date."
            meta="New purchase"
            icon={<Plus className="size-7" strokeWidth={1.75} />}
            onClick={() => {
              setDraft(emptyDraft())
              setAddError('')
              setView('add')
            }}
          />
          <AllotmentModeCard
            tone="sky"
            title="Daily checker"
            subtitle="Each tour date: Booking Head, Check in, No Show, Invoice, and editable Total Deduct."
            meta="Deduct heads"
            icon={<CalendarCheck2 className="size-7" strokeWidth={1.75} />}
            onClick={() => setView('daily')}
          />
          <AllotmentModeCard
            tone="amber"
            title="Allotment history"
            subtitle="Bookings used, Daily checker heads, and seats left per agent."
            meta="Usage & balance"
            icon={<History className="size-7" strokeWidth={1.75} />}
            onClick={() => setView('history')}
          />
        </div>
      </div>
    )
  }

  if (view === 'daily') {
    return <AdminAgentAllotmentDailyChecker onBack={() => setView('hub')} />
  }

  if (view === 'history') {
    return (
      <AdminAgentAllotmentHistory
        onBack={() => setView('hub')}
        onAdd={() => {
          setDraft(emptyDraft())
          setAddError('')
          setView('add')
        }}
      />
    )
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Add allotment"
        description="Choose an agent, set AD/CH price per head and heads — total amount calculates automatically."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => setView('hub')}>
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
        }
      />

      <Surface className="p-5">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" onSubmit={handleAdd}>
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-2">
            <Label htmlFor="allotment-agent" className="text-xs text-neutral-400">
              Agent
            </Label>
            <select
              id="allotment-agent"
              required
              value={draft.agentSlug}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  agentSlug: event.target.value,
                  newAgentName: event.target.value === NEW_AGENT_VALUE ? current.newAgentName : '',
                }))
                if (addError) setAddError('')
              }}
              className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
            >
              <option value="">Select agent</option>
              <option value={NEW_AGENT_VALUE}>+ Add new agent…</option>
              {agentOptions.map((agent) => (
                <option key={agent.slug} value={agent.slug}>
                  {agent.name}
                </option>
              ))}
            </select>
            {draft.agentSlug === NEW_AGENT_VALUE ? (
              <Input
                id="allotment-new-agent"
                value={draft.newAgentName}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, newAgentName: event.target.value }))
                  if (addError) setAddError('')
                }}
                placeholder="New agent name"
                className="mt-2 h-10"
                required
              />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-adult-price" className="text-xs text-neutral-400">
              Price / head AD
            </Label>
            <Input
              id="allotment-adult-price"
              type="number"
              min={0}
              step={1}
              required
              value={draft.adultPrice}
              onChange={(event) => {
                setDraft((current) => ({ ...current, adultPrice: event.target.value }))
                if (addError) setAddError('')
              }}
              placeholder="0"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-child-price" className="text-xs text-neutral-400">
              Price / head CH
            </Label>
            <Input
              id="allotment-child-price"
              type="number"
              min={0}
              step={1}
              required
              value={draft.childPrice}
              onChange={(event) => {
                setDraft((current) => ({ ...current, childPrice: event.target.value }))
                if (addError) setAddError('')
              }}
              placeholder="0"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-adult-seats" className="text-xs text-neutral-400">
              AD heads
            </Label>
            <Input
              id="allotment-adult-seats"
              type="number"
              min={0}
              step={1}
              value={draft.adultSeats}
              onChange={(event) => {
                setDraft((current) => ({ ...current, adultSeats: event.target.value }))
                if (addError) setAddError('')
              }}
              placeholder="0"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-child-seats" className="text-xs text-neutral-400">
              CH heads
            </Label>
            <Input
              id="allotment-child-seats"
              type="number"
              min={0}
              step={1}
              value={draft.childSeats}
              onChange={(event) => {
                setDraft((current) => ({ ...current, childSeats: event.target.value }))
                if (addError) setAddError('')
              }}
              placeholder="0"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-neutral-400">Total amount</Label>
            <div className="flex h-10 items-center rounded-xl border border-teal-900/10 bg-teal-950/[0.03] px-3 text-sm font-semibold tabular-nums text-teal-950">
              {formatMoney(draftTotals(draft).totalAmount)} THB
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-paid-date" className="text-xs text-neutral-400">
              Paid date
            </Label>
            <Input
              id="allotment-paid-date"
              type="date"
              required
              value={draft.paidDate}
              onChange={(event) => {
                setDraft((current) => ({ ...current, paidDate: event.target.value }))
                if (addError) setAddError('')
              }}
              className="h-10"
            />
          </div>
          <div className="flex items-end sm:col-span-2 xl:col-span-8">
            <Button type="submit" disabled={adding} className="h-10 w-full sm:w-auto">
              <Plus data-icon="inline-start" />
              {adding ? 'Saving…' : 'Save allotment'}
            </Button>
          </div>
        </form>
        {addError ? <p className="mt-3 text-sm text-red-600">{addError}</p> : null}
      </Surface>

      {loadError ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {loadError}
        </p>
      ) : null}

      {loading ? <p className="mt-4 text-sm text-teal-900/50">Loading purchases…</p> : null}

      {!loading && rows.length > 0 ? (
        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-teal-950">Seat purchases</h2>
          <p className="mb-3 text-xs text-teal-900/50">
            Heads bought per agent (edit here). Usage and balance live under Allotment history.
          </p>
          <Surface className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 text-teal-700/45">Agent</TableHead>
                  <TableHead className="text-right text-teal-700/45">Price AD</TableHead>
                  <TableHead className="text-right text-teal-700/45">Price CH</TableHead>
                  <TableHead className="text-right text-teal-700/45">AD</TableHead>
                  <TableHead className="text-right text-teal-700/45">CH</TableHead>
                  <TableHead className="text-right text-teal-700/45">Heads</TableHead>
                  <TableHead className="text-right text-teal-700/45">Total</TableHead>
                  <TableHead className="text-teal-700/45">Paid date</TableHead>
                  <TableHead className="text-right text-teal-700/45" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="px-4 font-medium">{row.agentName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.adultPrice > 0 ? formatMoney(row.adultPrice) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.childPrice > 0 ? formatMoney(row.childPrice) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.adultSeats}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.childSeats}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{row.seats}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatMoney(row.totalAmount)}
                    </TableCell>
                    <TableCell>{row.paidDate ? formatShortDate(row.paidDate) : '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="text-neutral-400 hover:text-red-600"
                          aria-label={`Delete allotment for ${row.agentName}`}
                          onClick={() => void handleDelete(row)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Surface>
        </div>
      ) : null}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit allotment</DialogTitle>
            <DialogDescription>
              Update agent, AD/CH prices and heads. Total recalculates automatically.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleEditSave()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-allotment-agent">Agent</Label>
              <select
                id="edit-allotment-agent"
                required
                value={editDraft.agentSlug}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    agentSlug: event.target.value,
                    newAgentName: event.target.value === NEW_AGENT_VALUE ? current.newAgentName : '',
                  }))
                }
                className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
              >
                <option value="">Select agent</option>
                <option value={NEW_AGENT_VALUE}>+ Add new agent…</option>
                {agentOptions.map((agent) => (
                  <option key={agent.slug} value={agent.slug}>
                    {agent.name}
                  </option>
                ))}
              </select>
              {editDraft.agentSlug === NEW_AGENT_VALUE ? (
                <Input
                  id="edit-allotment-new-agent"
                  value={editDraft.newAgentName}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, newAgentName: event.target.value }))
                  }
                  placeholder="New agent name"
                  className="mt-2 h-10"
                  required
                />
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-allotment-adult-price">Price / head AD</Label>
                <Input
                  id="edit-allotment-adult-price"
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={editDraft.adultPrice}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, adultPrice: event.target.value }))
                  }
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-allotment-child-price">Price / head CH</Label>
                <Input
                  id="edit-allotment-child-price"
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={editDraft.childPrice}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, childPrice: event.target.value }))
                  }
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-allotment-adult-seats">AD heads</Label>
                <Input
                  id="edit-allotment-adult-seats"
                  type="number"
                  min={0}
                  step={1}
                  value={editDraft.adultSeats}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, adultSeats: event.target.value }))
                  }
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-allotment-child-seats">CH heads</Label>
                <Input
                  id="edit-allotment-child-seats"
                  type="number"
                  min={0}
                  step={1}
                  value={editDraft.childSeats}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, childSeats: event.target.value }))
                  }
                  className="h-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Total amount</Label>
              <div className="flex h-10 items-center rounded-xl border border-teal-900/10 bg-teal-950/[0.03] px-3 text-sm font-semibold tabular-nums text-teal-950">
                {formatMoney(draftTotals(editDraft).totalAmount)} THB
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-allotment-paid-date">Paid date</Label>
              <Input
                id="edit-allotment-paid-date"
                type="date"
                required
                value={editDraft.paidDate}
                onChange={(event) =>
                  setEditDraft((current) => ({ ...current, paidDate: event.target.value }))
                }
                className="h-10"
              />
            </div>
            {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type CardTone = 'teal' | 'amber' | 'sky'

const CARD_TONES: Record<
  CardTone,
  {
    card: string
    icon: string
    meta: string
    title: string
    body: string
    cta: string
    wash: string
  }
> = {
  teal: {
    card: 'border-teal-900/10 bg-gradient-to-br from-teal-50/90 via-white to-cyan-50/40 hover:border-teal-600/30 hover:shadow-lg hover:shadow-teal-900/8',
    icon: 'bg-gradient-to-br from-teal-600 to-cyan-700 text-white shadow-md shadow-teal-700/25',
    meta: 'bg-teal-950/6 text-teal-800',
    title: 'text-teal-950',
    body: 'text-teal-900/55',
    cta: 'text-teal-800',
    wash: 'from-teal-500/10 via-transparent to-transparent',
  },
  amber: {
    card: 'border-amber-900/10 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/35 hover:border-amber-600/30 hover:shadow-lg hover:shadow-amber-900/8',
    icon: 'bg-gradient-to-br from-amber-500 to-orange-700 text-white shadow-md shadow-amber-700/25',
    meta: 'bg-amber-950/6 text-amber-900',
    title: 'text-amber-950',
    body: 'text-amber-950/55',
    cta: 'text-amber-800',
    wash: 'from-amber-500/12 via-transparent to-transparent',
  },
  sky: {
    card: 'border-sky-900/10 bg-gradient-to-br from-sky-50/95 via-white to-blue-50/40 hover:border-sky-600/30 hover:shadow-lg hover:shadow-sky-900/8',
    icon: 'bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-md shadow-sky-700/25',
    meta: 'bg-sky-950/6 text-sky-900',
    title: 'text-sky-950',
    body: 'text-sky-950/55',
    cta: 'text-sky-800',
    wash: 'from-sky-500/12 via-transparent to-transparent',
  },
}

function AllotmentModeCard({
  tone,
  title,
  subtitle,
  meta,
  icon,
  onClick,
}: {
  tone: CardTone
  title: string
  subtitle: string
  meta: string
  icon: ReactNode
  onClick: () => void
}) {
  const styles = CARD_TONES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-[1.35rem] border p-5 text-left transition-all sm:p-6',
        styles.card,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80',
          styles.wash,
        )}
      />
      <div className="relative flex items-start gap-4">
        <span
          className={cn(
            'inline-flex size-12 shrink-0 items-center justify-center rounded-2xl',
            styles.icon,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
              styles.meta,
            )}
          >
            {meta}
          </span>
          <h2 className={cn('mt-2 text-lg font-semibold tracking-tight', styles.title)}>{title}</h2>
          <p className={cn('mt-1.5 text-sm leading-relaxed', styles.body)}>{subtitle}</p>
          <p className={cn('mt-4 text-xs font-semibold tracking-wide uppercase', styles.cta)}>
            Open →
          </p>
        </div>
      </div>
    </button>
  )
}
