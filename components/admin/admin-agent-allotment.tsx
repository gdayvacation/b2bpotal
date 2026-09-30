'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  CalendarCheck2,
  ChevronRight,
  History,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react'
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
  allotmentBalance,
  allotmentPaidTotal,
  allotmentPayStatus,
  allotmentTotalAmount,
  createAgentAllotment,
  deleteAgentAllotment,
  formatAllotmentParkFee,
  listAgentAllotments,
  updateAgentAllotment,
  type AgentAllotment,
  type AgentAllotmentParkFee,
  type AgentAllotmentPayStatus,
} from '@/lib/supabase/agent-allotment-db'
import { cn } from '@/lib/utils'

type View = 'hub' | 'add' | 'history' | 'daily' | 'agent'

type Draft = {
  agentSlug: string
  newAgentName: string
  adultPrice: string
  childPrice: string
  parkFee: AgentAllotmentParkFee
  /** Shared AD+CH head pool for this top-up line. */
  heads: string
  paidAmount: string
  paidDate: string
  note: string
}

type LedgerLine = {
  key: string
  allotmentId: string
  date: string
  description: string
  amount: number
  heads: number
  balanceHeads: number
  adultPrice: number
  childPrice: number
  parkFee: AgentAllotmentParkFee
  row: AgentAllotment
}

const NEW_AGENT_VALUE = '__new__'

const emptyDraft = (): Draft => ({
  agentSlug: '',
  newAgentName: '',
  adultPrice: '',
  childPrice: '',
  parkFee: 'exc',
  heads: '',
  paidAmount: '',
  paidDate: todayISO(),
  note: '',
})

const selectClassName =
  'h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15'

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

/** Purchase amount for a shared head pool — priced at AD rate; CH bookings deduct from same pool. */
function draftTotals(draft: Draft) {
  const adultPrice = parseMoney(draft.adultPrice)
  const childPrice = parseMoney(draft.childPrice)
  const heads = parseHeads(draft.heads)
  const safeAdultPrice = Number.isFinite(adultPrice) && adultPrice >= 0 ? adultPrice : 0
  const safeChildPrice = Number.isFinite(childPrice) && childPrice >= 0 ? childPrice : 0
  const safeHeads = Number.isFinite(heads) && heads >= 0 ? heads : 0
  return {
    adultPrice: safeAdultPrice,
    childPrice: safeChildPrice,
    seats: safeHeads,
    totalAmount: allotmentTotalAmount({
      adultPrice: safeAdultPrice,
      childPrice: safeChildPrice,
      adultSeats: safeHeads,
      childSeats: 0,
    }),
  }
}

function seatsToDraftHeads(row: Pick<AgentAllotment, 'seats' | 'adultSeats' | 'childSeats'>) {
  return String(Math.max(row.seats, row.adultSeats + row.childSeats))
}

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function payStatusLabel(status: AgentAllotmentPayStatus) {
  if (status === 'paid') return 'Paid'
  if (status === 'partial') return 'Partial'
  return 'Unpaid'
}

function payStatusClass(status: AgentAllotmentPayStatus) {
  if (status === 'paid') return 'bg-emerald-50 text-emerald-800 ring-emerald-700/15'
  if (status === 'partial') return 'bg-amber-50 text-amber-900 ring-amber-700/15'
  return 'bg-rose-50 text-rose-800 ring-rose-700/15'
}

export function AdminAgentAllotment() {
  const { agents, addAgent } = usePortal()
  const [view, setView] = useState<View>('hub')
  const [selectedAgentSlug, setSelectedAgentSlug] = useState('')
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
  const [ledgerDraft, setLedgerDraft] = useState<Draft>(emptyDraft)
  const [ledgerError, setLedgerError] = useState('')
  const [savingLedger, setSavingLedger] = useState(false)

  const agentOptions = useMemo(
    () => [...agents].sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  )

  const agentSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        slug: string
        name: string
        purchases: number
        seats: number
        totalAmount: number
        paidAmount: number
        balance: number
        adultPrice: number
        childPrice: number
      }
    >()
    for (const row of rows) {
      const current = map.get(row.agentSlug) ?? {
        slug: row.agentSlug,
        name: row.agentName,
        purchases: 0,
        seats: 0,
        totalAmount: 0,
        paidAmount: 0,
        balance: 0,
        adultPrice: 0,
        childPrice: 0,
      }
      current.name = row.agentName
      current.purchases += 1
      current.seats += row.seats
      current.totalAmount += row.totalAmount
      current.paidAmount += allotmentPaidTotal(row)
      current.balance += allotmentBalance(row)
      if (row.adultPrice > 0) current.adultPrice = row.adultPrice
      if (row.childPrice > 0) current.childPrice = row.childPrice
      map.set(row.agentSlug, current)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const selectedAgentRows = useMemo(
    () =>
      rows
        .filter((row) => row.agentSlug === selectedAgentSlug)
        .sort((a, b) => {
          const aKey = a.paidDate || a.createdAt.slice(0, 10)
          const bKey = b.paidDate || b.createdAt.slice(0, 10)
          return aKey.localeCompare(bKey) || a.createdAt.localeCompare(b.createdAt)
        }),
    [rows, selectedAgentSlug],
  )

  const selectedAgentSummary = agentSummaries.find((row) => row.slug === selectedAgentSlug) ?? null

  const ledgerLines = useMemo<LedgerLine[]>(() => {
    let runningHeads = 0
    return selectedAgentRows.map((row) => {
      const heads = Math.max(row.seats, row.adultSeats + row.childSeats)
      runningHeads += heads
      const paid = allotmentPaidTotal(row)
      const description =
        row.note.trim() ||
        `${heads} heads · AD ${formatMoney(row.adultPrice)} / CH ${formatMoney(row.childPrice)}`
      return {
        key: row.id,
        allotmentId: row.id,
        date: row.paidDate || row.createdAt.slice(0, 10),
        description,
        amount: paid > 0 ? paid : row.totalAmount,
        heads,
        balanceHeads: runningHeads,
        adultPrice: row.adultPrice,
        childPrice: row.childPrice,
        parkFee: row.parkFee,
        row,
      }
    })
  }, [selectedAgentRows])

  function openAgent(slug: string) {
    const summary = agentSummaries.find((row) => row.slug === slug)
    const latest = rows
      .filter((row) => row.agentSlug === slug)
      .sort((a, b) => (b.paidDate || b.createdAt).localeCompare(a.paidDate || a.createdAt))[0]
    setSelectedAgentSlug(slug)
    setLedgerError('')
    setLedgerDraft({
      ...emptyDraft(),
      agentSlug: slug,
      adultPrice: String(latest?.adultPrice || summary?.adultPrice || ''),
      childPrice: String(latest?.childPrice || summary?.childPrice || ''),
      parkFee: latest?.parkFee || 'exc',
    })
    setView('agent')
  }

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
    const heads = parseHeads(draft.heads || '0')
    if (!Number.isFinite(adultPrice) || adultPrice < 0) {
      setAddError('Enter a valid AD price / head.')
      return
    }
    if (!Number.isFinite(childPrice) || childPrice < 0) {
      setAddError('Enter a valid CH price / head.')
      return
    }
    if (!Number.isFinite(heads) || heads <= 0) {
      setAddError('Enter total heads for this top-up.')
      return
    }
    if (!isIsoDate(draft.paidDate)) {
      setAddError('Enter the date of this payment / top-up.')
      return
    }
    const totals = draftTotals(draft)
    const paidAmountRaw = draft.paidAmount.trim()
      ? parseMoney(draft.paidAmount)
      : totals.totalAmount
    if (!Number.isFinite(paidAmountRaw) || paidAmountRaw <= 0) {
      setAddError('Enter the amount transferred for this top-up.')
      return
    }
    setAdding(true)
    try {
      await createAgentAllotment({
        agentSlug: agent.slug,
        agentName: agent.name,
        adultSeats: heads,
        childSeats: 0,
        adultPrice,
        childPrice,
        parkFee: draft.parkFee,
        paidDate: draft.paidDate.trim(),
        paidAmount: paidAmountRaw,
        note: draft.note,
      })
      setDraft(emptyDraft())
      await refresh()
      openAgent(agent.slug)
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
      parkFee: row.parkFee,
      heads: seatsToDraftHeads(row),
      paidAmount: String(allotmentPaidTotal(row)),
      paidDate: row.paidDate || todayISO(),
      note: row.note,
    })
    setEditError('')
  }

  async function handleLedgerTopUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLedgerError('')
    const agent =
      resolveExistingAgent(selectedAgentSlug) ||
      (() => {
        const name =
          selectedAgentSummary?.name ||
          agents.find((item) => item.slug === selectedAgentSlug)?.name ||
          selectedAgentSlug
        return selectedAgentSlug ? { slug: selectedAgentSlug, name } : null
      })()
    if (!agent) {
      setLedgerError('Agent not found.')
      return
    }
    const adultPrice = parseMoney(ledgerDraft.adultPrice)
    const childPrice = parseMoney(ledgerDraft.childPrice)
    const heads = parseHeads(ledgerDraft.heads || '0')
    if (!Number.isFinite(adultPrice) || adultPrice < 0) {
      setLedgerError('Enter a valid AD price / head.')
      return
    }
    if (!Number.isFinite(childPrice) || childPrice < 0) {
      setLedgerError('Enter a valid CH price / head.')
      return
    }
    if (!Number.isFinite(heads) || heads <= 0) {
      setLedgerError('Enter total heads for this top-up.')
      return
    }
    if (!isIsoDate(ledgerDraft.paidDate)) {
      setLedgerError('Enter the transfer date.')
      return
    }
    const totals = draftTotals(ledgerDraft)
    const paidAmountRaw = ledgerDraft.paidAmount.trim()
      ? parseMoney(ledgerDraft.paidAmount)
      : totals.totalAmount
    if (!Number.isFinite(paidAmountRaw) || paidAmountRaw <= 0) {
      setLedgerError('Enter the amount transferred for this top-up.')
      return
    }
    setSavingLedger(true)
    try {
      await createAgentAllotment({
        agentSlug: agent.slug,
        agentName: agent.name,
        adultSeats: heads,
        childSeats: 0,
        adultPrice,
        childPrice,
        parkFee: ledgerDraft.parkFee,
        paidDate: ledgerDraft.paidDate.trim(),
        paidAmount: paidAmountRaw,
        note: ledgerDraft.note,
      })
      setLedgerDraft((current) => ({
        ...emptyDraft(),
        agentSlug: agent.slug,
        adultPrice: current.adultPrice,
        childPrice: current.childPrice,
        parkFee: current.parkFee,
      }))
      await refresh()
    } catch (caught) {
      setLedgerError(caught instanceof Error ? caught.message : 'Could not save top-up.')
    } finally {
      setSavingLedger(false)
    }
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
    const heads = parseHeads(editDraft.heads || '0')
    if (!Number.isFinite(adultPrice) || adultPrice < 0) {
      setEditError('Enter a valid AD price / head.')
      return
    }
    if (!Number.isFinite(childPrice) || childPrice < 0) {
      setEditError('Enter a valid CH price / head.')
      return
    }
    if (!Number.isFinite(heads) || heads <= 0) {
      setEditError('Enter total heads for this top-up.')
      return
    }
    setSavingEdit(true)
    try {
      await updateAgentAllotment(editing.id, {
        agentSlug: agent.slug,
        agentName: agent.name,
        adultSeats: heads,
        childSeats: 0,
        adultPrice,
        childPrice,
        parkFee: editDraft.parkFee,
        paidDate: editDraft.paidDate || editing.paidDate || todayISO(),
        note: editDraft.note,
      })
      setEditing(null)
      await refresh()
      if (agent.slug !== selectedAgentSlug && view === 'agent') {
        openAgent(agent.slug)
      }
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
            subtitle="Open an agent ledger — record top-ups anytime. No need to set a full target first."
            meta="Top-ups"
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

  if (view === 'agent') {
    const agentName =
      selectedAgentSummary?.name ||
      selectedAgentRows[0]?.agentName ||
      agents.find((agent) => agent.slug === selectedAgentSlug)?.name ||
      selectedAgentSlug
    const ledgerTotals = draftTotals(ledgerDraft)
    const newestLine = ledgerLines.at(-1) ?? null

    return (
      <div className="w-full">
        <PageHeader
          title={agentName || 'Agent allotment'}
          description="Top-up history for this agent. Add each transfer as a new line — no need to set a full buy target first."
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => setView('add')}>
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
          }
        />

        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <Surface className="px-4 py-3">
            <p className="text-xs text-teal-900/45">Paid total</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-teal-800">
              {formatMoney(selectedAgentSummary?.paidAmount ?? 0)} THB
            </p>
          </Surface>
          <Surface className="px-4 py-3">
            <p className="text-xs text-teal-900/45">Total heads</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-teal-950">
              {selectedAgentSummary?.seats ?? 0}
            </p>
          </Surface>
          <Surface className="px-4 py-3">
            <p className="text-xs text-teal-900/45">Top-ups</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-teal-950">
              {ledgerLines.length}
            </p>
            {newestLine ? (
              <p className="mt-0.5 text-[11px] text-teal-900/45">
                Latest {formatShortDate(newestLine.date)}
              </p>
            ) : null}
          </Surface>
        </div>

        <Surface className="mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Wallet className="size-4 text-teal-800" />
            <h2 className="text-sm font-semibold text-teal-950">Add top-up</h2>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"
            onSubmit={handleLedgerTopUp}
          >
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Date</Label>
              <Input
                type="date"
                required
                value={ledgerDraft.paidDate}
                onChange={(event) =>
                  setLedgerDraft((current) => ({ ...current, paidDate: event.target.value }))
                }
                className="h-10"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2 xl:col-span-2">
              <Label className="text-xs text-neutral-400">Description</Label>
              <Input
                value={ledgerDraft.note}
                onChange={(event) =>
                  setLedgerDraft((current) => ({ ...current, note: event.target.value }))
                }
                placeholder="e.g. Bank transfer / deposit"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Price AD</Label>
              <Input
                type="number"
                min={0}
                step={1}
                required
                value={ledgerDraft.adultPrice}
                onChange={(event) =>
                  setLedgerDraft((current) => ({ ...current, adultPrice: event.target.value }))
                }
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Price CH</Label>
              <Input
                type="number"
                min={0}
                step={1}
                required
                value={ledgerDraft.childPrice}
                onChange={(event) =>
                  setLedgerDraft((current) => ({ ...current, childPrice: event.target.value }))
                }
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Park Fee</Label>
              <select
                value={ledgerDraft.parkFee}
                onChange={(event) =>
                  setLedgerDraft((current) => ({
                    ...current,
                    parkFee: event.target.value as AgentAllotmentParkFee,
                  }))
                }
                className={selectClassName}
              >
                <option value="inc">Inc</option>
                <option value="exc">Exc</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Heads</Label>
              <Input
                type="number"
                min={1}
                step={1}
                required
                value={ledgerDraft.heads}
                onChange={(event) =>
                  setLedgerDraft((current) => ({ ...current, heads: event.target.value }))
                }
                placeholder="0"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Amount (THB)</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={ledgerDraft.paidAmount}
                onChange={(event) =>
                  setLedgerDraft((current) => ({ ...current, paidAmount: event.target.value }))
                }
                placeholder={
                  ledgerTotals.totalAmount > 0 ? String(ledgerTotals.totalAmount) : '0'
                }
                className="h-10"
              />
            </div>
            <div className="flex items-end sm:col-span-2 xl:col-span-8">
              <div className="flex w-full flex-wrap items-center gap-3">
                <Button type="submit" disabled={savingLedger} className="h-10">
                  <Plus data-icon="inline-start" />
                  {savingLedger ? 'Saving…' : 'Add top-up'}
                </Button>
                <p className="text-xs text-teal-900/45">
                  Auto {formatMoney(ledgerTotals.totalAmount)} THB ({ledgerTotals.seats} heads × AD
                  price). AD + CH bookings deduct from the same head pool.
                </p>
              </div>
            </div>
          </form>
          {ledgerError ? <p className="mt-3 text-sm text-red-600">{ledgerError}</p> : null}
        </Surface>

        {loadError ? (
          <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
            {loadError}
          </p>
        ) : null}

        {loading ? <p className="text-sm text-teal-900/50">Loading top-up history…</p> : null}

        {!loading && ledgerLines.length === 0 ? (
          <Surface className="p-6 text-sm text-teal-900/55">
            No top-ups yet. Add the first transfer above.
          </Surface>
        ) : null}

        {ledgerLines.length > 0 ? (
          <>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-teal-950">Top-up history</h2>
                <p className="text-xs text-teal-900/45">
                  One line per transfer. Balance heads = cumulative heads after that line.
                </p>
              </div>
            </div>

            <div className="space-y-2 md:hidden">
              {[...ledgerLines].reverse().map((line) => (
                <Surface key={line.key} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-teal-900/45">{formatShortDate(line.date)}</p>
                      <p className="mt-0.5 font-medium text-teal-950">{line.description}</p>
                    </div>
                    <p className="font-semibold tabular-nums text-teal-950">
                      {formatMoney(line.amount)}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-teal-900/40">Park Fee</p>
                      <p className="font-semibold text-teal-950">
                        {formatAllotmentParkFee(line.parkFee)}
                      </p>
                    </div>
                    <div>
                      <p className="text-teal-900/40">Heads this line</p>
                      <p className="font-semibold tabular-nums text-teal-950">{line.heads}</p>
                    </div>
                    <div>
                      <p className="text-teal-900/40">Balance heads</p>
                      <p className="font-semibold tabular-nums text-teal-800">
                        {line.balanceHeads}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(line.row)}>
                      <Pencil data-icon="inline-start" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="text-neutral-400 hover:text-red-600"
                      aria-label="Delete top-up"
                      onClick={() => void handleDelete(line.row)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </Surface>
              ))}
            </div>

            <Surface className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4 text-teal-700/45">Date</TableHead>
                    <TableHead className="text-teal-700/45">Description</TableHead>
                    <TableHead className="text-center text-teal-700/45">Park Fee</TableHead>
                    <TableHead className="text-right text-teal-700/45">Amount</TableHead>
                    <TableHead className="text-right text-teal-700/45">Heads</TableHead>
                    <TableHead className="text-right text-teal-700/45">Balance heads</TableHead>
                    <TableHead className="text-right text-teal-700/45" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...ledgerLines].reverse().map((line) => (
                    <TableRow key={line.key}>
                      <TableCell className="px-4 whitespace-nowrap">
                        {formatShortDate(line.date)}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-teal-950">{line.description}</p>
                        <p className="text-[11px] text-teal-900/40">
                          Price AD {formatMoney(line.adultPrice)} · CH{' '}
                          {formatMoney(line.childPrice)} · Park{' '}
                          {formatAllotmentParkFee(line.parkFee)}
                        </p>
                      </TableCell>
                      <TableCell className="text-center tabular-nums font-medium">
                        {formatAllotmentParkFee(line.parkFee)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatMoney(line.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {line.heads}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-teal-800">
                        {line.balanceHeads}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(line.row)}>
                            <Pencil data-icon="inline-start" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            className="text-neutral-400 hover:text-red-600"
                            aria-label="Delete top-up"
                            onClick={() => void handleDelete(line.row)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 border-teal-900/15 bg-teal-950/[0.03] hover:bg-teal-950/[0.03]">
                    <TableCell className="px-4 font-semibold text-teal-950" colSpan={3}>
                      Current total
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-teal-950">
                      {formatMoney(selectedAgentSummary?.paidAmount ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-teal-950">
                      {selectedAgentSummary?.seats ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-teal-800">
                      {newestLine?.balanceHeads ?? 0}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </Surface>
          </>
        ) : null}

        <Dialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit top-up</DialogTitle>
              <DialogDescription>
                Update prices, heads, and description for this transfer line.
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
                <Label htmlFor="edit-ledger-note">Description</Label>
                <Input
                  id="edit-ledger-note"
                  value={editDraft.note}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, note: event.target.value }))
                  }
                  placeholder="e.g. Bank transfer"
                  className="h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-ledger-adult-price">Price / head AD</Label>
                  <Input
                    id="edit-ledger-adult-price"
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
                  <Label htmlFor="edit-ledger-child-price">Price / head CH</Label>
                  <Input
                    id="edit-ledger-child-price"
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
                  <Label htmlFor="edit-ledger-park-fee">Park Fee</Label>
                  <select
                    id="edit-ledger-park-fee"
                    value={editDraft.parkFee}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        parkFee: event.target.value as AgentAllotmentParkFee,
                      }))
                    }
                    className={selectClassName}
                  >
                    <option value="inc">Inc</option>
                    <option value="exc">Exc</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-ledger-heads">Heads (AD + CH pool)</Label>
                  <Input
                    id="edit-ledger-heads"
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={editDraft.heads}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, heads: event.target.value }))
                    }
                    className="h-10"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Line amount</Label>
                <div className="flex h-10 items-center rounded-xl border border-teal-900/10 bg-teal-950/[0.03] px-3 text-sm font-semibold tabular-nums text-teal-950">
                  {formatMoney(draftTotals(editDraft).totalAmount)} THB
                </div>
                <p className="text-xs text-teal-900/45">
                  Heads × AD price. CH bookings use the same head balance.
                </p>
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

  const addTotals = draftTotals(draft)

  return (
    <div className="w-full">
      <PageHeader
        title="Add allotment"
        description="Record a top-up, or click an agent to open their ledger history. No need to set a full buy target first."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => setView('hub')}>
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
        }
      />

      <Surface className="p-5">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9" onSubmit={handleAdd}>
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
              Price AD
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
              Price CH
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
            <Label htmlFor="allotment-park-fee" className="text-xs text-neutral-400">
              Park Fee
            </Label>
            <select
              id="allotment-park-fee"
              value={draft.parkFee}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  parkFee: event.target.value as AgentAllotmentParkFee,
                }))
                if (addError) setAddError('')
              }}
              className={selectClassName}
            >
              <option value="inc">Inc</option>
              <option value="exc">Exc</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-heads" className="text-xs text-neutral-400">
              Heads
            </Label>
            <Input
              id="allotment-heads"
              type="number"
              min={1}
              step={1}
              required
              value={draft.heads}
              onChange={(event) => {
                setDraft((current) => ({ ...current, heads: event.target.value }))
                if (addError) setAddError('')
              }}
              placeholder="0"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-neutral-400">Amount</Label>
            <div className="flex h-10 items-center rounded-xl border border-teal-900/10 bg-teal-950/[0.03] px-3 text-sm font-semibold tabular-nums text-teal-950">
              {formatMoney(addTotals.totalAmount)} THB
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-paid-amount" className="text-xs text-neutral-400">
              Paid now
            </Label>
            <Input
              id="allotment-paid-amount"
              type="number"
              min={0}
              step={1}
              value={draft.paidAmount}
              onChange={(event) => {
                setDraft((current) => ({ ...current, paidAmount: event.target.value }))
                if (addError) setAddError('')
              }}
              placeholder={addTotals.totalAmount ? String(addTotals.totalAmount) : '0'}
              className="h-10"
            />
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
          <div className="flex items-end sm:col-span-2 xl:col-span-9">
            <Button type="submit" disabled={adding} className="h-10 w-full sm:w-auto">
              <Plus data-icon="inline-start" />
              {adding ? 'Saving…' : 'Save allotment'}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-teal-900/45">
          Each save becomes one history line. Prefer opening an agent card below to manage ongoing
          top-ups in a ledger.
        </p>
        {addError ? <p className="mt-3 text-sm text-red-600">{addError}</p> : null}
      </Surface>

      {loadError ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {loadError}
        </p>
      ) : null}

      {loading ? <p className="mt-4 text-sm text-teal-900/50">Loading purchases…</p> : null}

      {!loading && agentSummaries.length > 0 ? (
        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-teal-950">Agents</h2>
          <p className="mb-3 text-xs text-teal-900/50">
            Click an agent to view top-up history and add the next transfer.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {agentSummaries.map((summary) => {
              const status: AgentAllotmentPayStatus =
                summary.paidAmount <= 0.009
                  ? 'unpaid'
                  : summary.balance <= 0.009
                    ? 'paid'
                    : 'partial'
              return (
                <button
                  key={summary.slug}
                  type="button"
                  onClick={() => openAgent(summary.slug)}
                  className="rounded-[1.2rem] border border-teal-900/10 bg-white/80 px-4 py-3.5 text-left transition hover:border-teal-600/30 hover:bg-teal-50/40 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-teal-950">{summary.name}</p>
                      <p className="mt-0.5 text-xs text-teal-900/45">
                        {summary.purchases} purchase{summary.purchases === 1 ? '' : 's'} ·{' '}
                        {summary.seats} heads
                      </p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset',
                        payStatusClass(status),
                      )}
                    >
                      {payStatusLabel(status)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-teal-900/40">Paid</p>
                      <p className="font-semibold tabular-nums text-teal-800">
                        {formatMoney(summary.paidAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-teal-900/40">Heads</p>
                      <p className="font-semibold tabular-nums text-teal-950">{summary.seats}</p>
                    </div>
                    <div>
                      <p className="text-teal-900/40">Lines</p>
                      <p className="font-semibold tabular-nums text-teal-950">
                        {summary.purchases}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-teal-800 uppercase">
                    Open ledger
                    <ChevronRight className="size-3.5" />
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-teal-950">Recent top-ups</h2>
          <p className="mb-3 text-xs text-teal-900/50">
            Each transfer line. Click the agent name for the full ledger.
          </p>
          <Surface className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 text-teal-700/45">Agent</TableHead>
                  <TableHead className="text-right text-teal-700/45">Price AD</TableHead>
                  <TableHead className="text-right text-teal-700/45">Price CH</TableHead>
                  <TableHead className="text-center text-teal-700/45">Park Fee</TableHead>
                  <TableHead className="text-right text-teal-700/45">Heads</TableHead>
                  <TableHead className="text-right text-teal-700/45">Total</TableHead>
                  <TableHead className="text-right text-teal-700/45">Paid</TableHead>
                  <TableHead className="text-teal-700/45">Status</TableHead>
                  <TableHead className="text-right text-teal-700/45" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const status = allotmentPayStatus(row)
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="px-4">
                        <button
                          type="button"
                          className="font-medium text-teal-900 underline-offset-2 hover:underline"
                          onClick={() => openAgent(row.agentSlug)}
                        >
                          {row.agentName}
                        </button>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.adultPrice > 0 ? formatMoney(row.adultPrice) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.childPrice > 0 ? formatMoney(row.childPrice) : '—'}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {formatAllotmentParkFee(row.parkFee)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {row.seats}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatMoney(row.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(allotmentPaidTotal(row))}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset',
                            payStatusClass(status),
                          )}
                        >
                          {payStatusLabel(status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openAgent(row.agentSlug)}>
                            Ledger
                          </Button>
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
                  )
                })}
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
                <Label htmlFor="edit-allotment-park-fee">Park Fee</Label>
                <select
                  id="edit-allotment-park-fee"
                  value={editDraft.parkFee}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      parkFee: event.target.value as AgentAllotmentParkFee,
                    }))
                  }
                  className={selectClassName}
                >
                  <option value="inc">Inc</option>
                  <option value="exc">Exc</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-allotment-heads">Heads (AD + CH pool)</Label>
                <Input
                  id="edit-allotment-heads"
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={editDraft.heads}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, heads: event.target.value }))
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
              <p className="text-xs text-teal-900/45">
                Heads × AD price. AD and CH bookings share this head pool.
              </p>
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
