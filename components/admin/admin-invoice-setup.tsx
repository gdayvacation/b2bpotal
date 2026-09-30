'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Check, ChevronDown, Save, Trash2, Upload } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { useInvoiceStore } from '@/components/admin/use-invoice-store'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
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
import {
  AGENT_BILLING_TYPES,
  DEFAULT_INVOICE_SETTINGS,
  DEFAULT_NATIONAL_PARK_FEE,
  agencyRatesReady,
  emptyAgencyRates,
  parseAgentBillingType,
  parseMoneyInput,
  ratesForAgent,
  type AgencyInvoiceRates,
  type InvoiceSettings,
} from '@/lib/invoice'
import { uniqueAgentSlug } from '@/lib/format'

function readSignatureFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      const maxWidth = 420
      const scale = Math.min(1, maxWidth / image.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Could not read image'))
        return
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    image.src = url
  })
}

function MoneyField({
  value,
  onChange,
  id,
  disabled,
  className,
}: {
  value: number
  onChange: (value: number) => void
  id?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <Input
      id={id}
      type="number"
      min={0}
      step="1"
      disabled={disabled}
      value={value || ''}
      onChange={(event) => onChange(parseMoneyInput(event.target.value))}
      className={`h-8 w-full min-w-0 px-1.5 text-right text-xs tabular-nums ${className ?? ''}`}
    />
  )
}

type RatesSortKey = 'agency' | 'type' | 'park'
type SortDir = 'asc' | 'desc'

function RatesSortHead({
  column,
  active,
  dir,
  onSort,
  children,
  className,
  title,
  align = 'left',
}: {
  column: RatesSortKey
  active: boolean
  dir: SortDir
  onSort: (key: RatesSortKey) => void
  children: ReactNode
  className?: string
  title?: string
  align?: 'left' | 'center' | 'right'
}) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <TableHead className={className} title={title}>
      <button
        type="button"
        className={`inline-flex max-w-full items-center gap-0.5 rounded-md font-medium transition-colors hover:text-teal-900 ${
          align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end ml-auto' : ''
        } ${active ? 'text-teal-900' : ''}`}
        onClick={() => onSort(column)}
        aria-label={`Sort by ${column}${active ? `, currently ${dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span className="min-w-0 leading-tight">{children}</span>
        <Icon className={`size-3 shrink-0 ${active ? 'opacity-80' : 'opacity-40'}`} />
      </button>
    </TableHead>
  )
}

export function AdminInvoiceSetup() {
  const pathname = usePathname()
  const invoicesHref = pathname.startsWith('/accounting') ? '/accounting' : '/admin/invoices'
  const { agents, addAgent } = usePortal()
  const { settings, rates, loading, cloud, error: storeError, updateSettings, updateRates } = useInvoiceStore()
  const [draftSettings, setDraftSettings] = useState<InvoiceSettings | null>(null)
  const [saved, setSaved] = useState<'company' | string | null>(null)
  const [rateDrafts, setRateDrafts] = useState<Record<string, AgencyInvoiceRates>>({})
  const [companyOpen, setCompanyOpen] = useState(false)
  const [newAgentName, setNewAgentName] = useState('')
  const [addAgentError, setAddAgentError] = useState('')
  const [sort, setSort] = useState<{ key: RatesSortKey; dir: SortDir }>({
    key: 'agency',
    dir: 'asc',
  })

  const company = draftSettings ?? settings

  function ratesFor(slug: string) {
    return rateDrafts[slug] ?? ratesForAgent(rates, slug)
  }

  const activeAgents = useMemo(() => {
    const list = agents.slice()
    const dir = sort.dir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      if (sort.key === 'type') {
        const aType = parseAgentBillingType(ratesFor(a.slug).billingType)
        const bType = parseAgentBillingType(ratesFor(b.slug).billingType)
        const byType = aType.localeCompare(bType)
        if (byType !== 0) return byType * dir
        return a.name.localeCompare(b.name)
      }
      if (sort.key === 'park') {
        const aRow = ratesFor(a.slug)
        const bRow = ratesFor(b.slug)
        const aInc = aRow.nationalParkIncluded ? 0 : 1
        const bInc = bRow.nationalParkIncluded ? 0 : 1
        if (aInc !== bInc) return (aInc - bInc) * dir
        if (!aRow.nationalParkIncluded && !bRow.nationalParkIncluded) {
          const byFee = (aRow.nationalParkFee || 0) - (bRow.nationalParkFee || 0)
          if (byFee !== 0) return byFee * dir
        }
        return a.name.localeCompare(b.name)
      }
      return a.name.localeCompare(b.name) * dir
    })
    return list
    // ratesFor uses rateDrafts + rates; include them for live sort when drafts change
  }, [agents, sort, rates, rateDrafts])

  function toggleSort(key: RatesSortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    )
  }

  function handleAddAgent() {
    const trimmed = newAgentName.trim().replace(/\s+/g, ' ')
    const createError = addAgent(trimmed)
    if (createError) {
      setAddAgentError(createError)
      return
    }
    const slug = uniqueAgentSlug(
      trimmed,
      agents.map((agent) => agent.slug),
    )
    setRateDrafts((current) => ({
      ...current,
      [slug]: emptyAgencyRates(slug),
    }))
    setNewAgentName('')
    setAddAgentError('')
    setSort({ key: 'agency', dir: 'asc' })
  }

  function patchRates(slug: string, patch: Partial<AgencyInvoiceRates>) {
    setRateDrafts((current) => ({
      ...current,
      [slug]: { ...ratesFor(slug), ...patch },
    }))
  }

  async function saveCompany() {
    await updateSettings(company)
    setDraftSettings(null)
    setSaved('company')
    window.setTimeout(() => setSaved(null), 1800)
  }

  async function persistAgent(next: AgencyInvoiceRates) {
    setRateDrafts((current) => ({ ...current, [next.agentSlug]: next }))
    await updateRates(next)
    setRateDrafts((current) => {
      const draft = { ...current }
      delete draft[next.agentSlug]
      return draft
    })
    setSaved(next.agentSlug)
    window.setTimeout(() => setSaved(null), 1800)
  }

  async function saveAgent(slug: string) {
    await persistAgent(ratesFor(slug))
  }

  async function changeBillingType(slug: string, billingType: AgencyInvoiceRates['billingType']) {
    await persistAgent({ ...ratesFor(slug), billingType })
  }

  async function changeNationalPark(
    slug: string,
    patch: { nationalParkIncluded: boolean; nationalParkFee?: number },
  ) {
    const current = ratesFor(slug)
    const included = patch.nationalParkIncluded
    await persistAgent({
      ...current,
      nationalParkIncluded: included,
      nationalParkFee: included
        ? 0
        : (patch.nationalParkFee ??
          (current.nationalParkFee || DEFAULT_NATIONAL_PARK_FEE)),
    })
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Invoice setup"
        description="Set agency tour prices, bank details, and the signature printed on invoices, billing notes, and receipts."
        actions={
          <Link href={invoicesHref}>
            <Button type="button" variant="outline" className="h-10 rounded-xl">
              <ArrowLeft className="size-3.5" />
              Back to invoices
            </Button>
          </Link>
        }
      />

      {!cloud && !loading ? (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Invoice tables are not in the cloud yet. Run <code>supabase/add-invoices.sql</code> in
          the Supabase SQL Editor so rates and bills sync across devices. Until then, this
          computer keeps a local copy.
        </p>
      ) : null}

      {storeError ? (
        <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          ⚠ {storeError}
        </p>
      ) : null}

      <Surface className="mb-5 overflow-hidden p-0">
        <button
          type="button"
          onClick={() => setCompanyOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-teal-950/[0.03]"
          aria-expanded={companyOpen}
        >
          <div className="min-w-0">
            <h2 className="font-medium text-teal-950">Company, bank, and signature</h2>
            <p className="mt-1 text-sm text-teal-900/55">
              {companyOpen
                ? 'Printed on every invoice, billing note, and receipt.'
                : 'Hidden while you edit agency prices — click to show.'}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-teal-900/12 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-teal-900/70">
            {companyOpen ? 'Hide' : 'Show'}
            <ChevronDown
              className={`size-3.5 transition-transform ${companyOpen ? 'rotate-180' : ''}`}
            />
          </span>
        </button>

        {companyOpen ? (
          <div className="border-t border-teal-900/8 px-5 pb-5 pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-sm text-teal-900/55">
                Change company details anytime, then save.
              </p>
              <Button type="button" className="h-10 rounded-xl" onClick={saveCompany}>
                {saved === 'company' ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
                {saved === 'company' ? 'Saved' : 'Save company'}
              </Button>
            </div>

            <h3 className="mt-5 text-sm font-medium text-teal-900">Company</h3>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {(
                [
                  ['companyName', 'Company name', company.companyName],
                  ['companyLegal', 'Legal name', company.companyLegal],
                  ['addressTh', 'Address (Thai)', company.addressTh],
                  ['addressEn', 'Address (English)', company.addressEn],
                ] as const
              ).map(([key, label, value]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key} className="text-xs text-neutral-400">
                    {label}
                  </Label>
                  <Input
                    id={key}
                    value={value}
                    onChange={(event) =>
                      setDraftSettings({ ...company, [key]: event.target.value })
                    }
                  />
                </div>
              ))}
            </div>

            <h3 className="mt-6 text-sm font-medium text-teal-900">Bank details</h3>
            <p className="mt-1 text-xs text-teal-900/50">Shown under “Bank Details” on the printed paper.</p>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {(
                [
                  ['bankName', 'Bank name', company.bankName],
                  ['bankAccountType', 'Account type', company.bankAccountType],
                  ['bankAccountName', 'Account name', company.bankAccountName],
                  ['bankAccountNo', 'Account number', company.bankAccountNo],
                ] as const
              ).map(([key, label, value]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key} className="text-xs text-neutral-400">
                    {label}
                  </Label>
                  <Input
                    id={key}
                    value={value}
                    onChange={(event) =>
                      setDraftSettings({ ...company, [key]: event.target.value })
                    }
                  />
                </div>
              ))}
            </div>

            <h3 className="mt-6 text-sm font-medium text-teal-900">Signature</h3>
            <p className="mt-1 text-xs text-teal-900/50">
              Printed on the company sign-off. Upload a PNG or JPG of the handwritten signature.
            </p>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {(
                [
                  ['issuerName', 'Issuer name', company.issuerName],
                  ['issuerTitle', 'Issuer title', company.issuerTitle],
                ] as const
              ).map(([key, label, value]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key} className="text-xs text-neutral-400">
                    {label}
                  </Label>
                  <Input
                    id={key}
                    value={value}
                    onChange={(event) =>
                      setDraftSettings({ ...company, [key]: event.target.value })
                    }
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {company.signatureImage ? (
                <img
                  src={company.signatureImage}
                  alt="Signature preview"
                  className="h-16 w-auto rounded-lg border border-teal-900/10 bg-white object-contain px-3 py-1"
                />
              ) : (
                <div className="flex h-16 items-center rounded-lg border border-dashed border-teal-900/15 px-4 text-xs text-teal-900/45">
                  No signature uploaded
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-teal-900/12 bg-white/80 px-3.5 text-sm font-medium hover:bg-teal-950/[0.04]">
                  <Upload className="size-3.5" />
                  {company.signatureImage ? 'Replace signature' : 'Upload signature'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (!file) return
                      void readSignatureFile(file)
                        .then((signatureImage) =>
                          setDraftSettings({ ...company, signatureImage }),
                        )
                        .catch(() => {
                          window.alert('Could not read that image. Try a PNG or JPG.')
                        })
                    }}
                  />
                </label>
                {company.signatureImage ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl text-rose-600 hover:text-rose-800"
                    onClick={() => setDraftSettings({ ...company, signatureImage: '' })}
                  >
                    <Trash2 className="size-3.5" />
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              className="mt-4 text-xs font-medium text-teal-700 hover:text-teal-950"
              onClick={() => setDraftSettings(DEFAULT_INVOICE_SETTINGS)}
            >
              Reset to Good Day Vacation defaults
            </button>
          </div>
        ) : null}
      </Surface>

      <Surface className="overflow-hidden">
        <div className="border-b border-teal-900/8 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-medium text-teal-950">Agency prices (THB)</h2>
              <p className="mt-1 text-sm text-teal-900/55">
                Prebuy deducts AD+CH heads; Invoice bills tour price. National Park: INC (no price) or
                Exc (set fee). Change date &amp; cancel are automatic — on-time free, after cutoff full
                charge on the bill. Infants / TL are free.
              </p>
            </div>
          </div>
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              handleAddAgent()
            }}
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="invoice-new-agent" className="text-xs text-neutral-400">
                Add agent
              </Label>
              <Input
                id="invoice-new-agent"
                value={newAgentName}
                onChange={(event) => {
                  setNewAgentName(event.target.value)
                  if (addAgentError) setAddAgentError('')
                }}
                placeholder="Agency name"
                className="h-10"
              />
            </div>
            <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-xl">
              Add agent
            </Button>
          </form>
          {addAgentError ? (
            <p className="mt-2 text-sm text-rose-600">{addAgentError}</p>
          ) : (
            <p className="mt-2 text-xs text-teal-900/45">
              Same agent list as Add Booking — add here or there, both stay in sync.
            </p>
          )}
        </div>
        <div className="px-3 pb-3 sm:px-4">
          <Table className="w-full table-fixed text-xs">
            <TableHeader>
              <TableRow className="border-teal-900/10">
                <RatesSortHead
                  column="agency"
                  active={sort.key === 'agency'}
                  dir={sort.dir}
                  onSort={toggleSort}
                  className="w-[18%] whitespace-normal px-2 py-2 text-[11px] leading-tight"
                >
                  Agency
                </RatesSortHead>
                <RatesSortHead
                  column="type"
                  active={sort.key === 'type'}
                  dir={sort.dir}
                  onSort={toggleSort}
                  align="center"
                  className="w-[10%] whitespace-normal px-1.5 py-2 text-center text-[11px] leading-tight"
                >
                  Type
                </RatesSortHead>
                <TableHead className="w-[8%] whitespace-normal px-1.5 py-2 text-right text-[11px] leading-tight">
                  AD
                </TableHead>
                <TableHead className="w-[8%] whitespace-normal px-1.5 py-2 text-right text-[11px] leading-tight">
                  CH
                </TableHead>
                <RatesSortHead
                  column="park"
                  active={sort.key === 'park'}
                  dir={sort.dir}
                  onSort={toggleSort}
                  align="center"
                  className="w-[14%] whitespace-normal px-1.5 py-2 text-center text-[11px] leading-tight"
                  title="INC = included (no price). Exc = set park fee. Click to sort."
                >
                  National
                  <br />
                  Park
                </RatesSortHead>
                <TableHead className="w-[10%] whitespace-normal px-1.5 py-2 text-center text-[11px] leading-tight">
                  Private
                  <br />
                  transfer
                </TableHead>
                <TableHead className="w-[10%] whitespace-normal px-1.5 py-2 text-center text-[11px] leading-tight">
                  Extra
                  <br />
                  zone
                </TableHead>
                <TableHead className="w-[10%] whitespace-normal px-1.5 py-2 text-center text-[11px] leading-tight">
                  Other
                  <br />
                  service
                </TableHead>
                <TableHead className="w-[12%] px-1.5 py-2 text-center text-[11px] leading-tight">
                  Save
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeAgents.map((agent) => {
                const row = ratesFor(agent.slug)
                const noRates = !agencyRatesReady(row)
                const parkIncluded = Boolean(row.nationalParkIncluded)
                const isSaved = saved === agent.slug
                const billingType = parseAgentBillingType(row.billingType)
                const isPrebuy = billingType === 'prebuy'
                return (
                  <TableRow key={agent.slug} className="border-teal-900/8">
                    <TableCell className="whitespace-normal px-2 py-2 align-middle font-medium text-teal-950">
                      <div className="min-w-0">
                        <span className="block text-[12px] leading-snug break-words">
                          {agent.name}
                        </span>
                        {noRates ? (
                          <span className="mt-0.5 block text-[10px] font-normal text-rose-500">
                            No rates
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-1.5 py-2 align-middle">
                      <select
                        aria-label={`${agent.name} billing type`}
                        value={billingType}
                        onChange={(event) =>
                          void changeBillingType(
                            agent.slug,
                            parseAgentBillingType(event.target.value),
                          )
                        }
                        className={
                          isPrebuy
                            ? 'h-8 w-full min-w-0 rounded-md border border-amber-500/50 bg-amber-50 px-1 text-center text-[11px] font-semibold text-amber-950 outline-none focus-visible:border-amber-600 focus-visible:ring-2 focus-visible:ring-amber-400/30'
                            : 'h-8 w-full min-w-0 rounded-md border border-sky-500/40 bg-sky-50 px-1 text-center text-[11px] font-medium text-sky-950 outline-none focus-visible:border-sky-600 focus-visible:ring-2 focus-visible:ring-sky-400/30'
                        }
                      >
                        {AGENT_BILLING_TYPES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.value === 'prebuy' ? 'Prebuy' : 'Invoice'}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="px-1.5 py-2 align-middle">
                      <MoneyField
                        value={row.adultPrice}
                        onChange={(value) => patchRates(agent.slug, { adultPrice: value })}
                      />
                    </TableCell>
                    <TableCell className="px-1.5 py-2 align-middle">
                      <MoneyField
                        value={row.childPrice}
                        onChange={(value) => patchRates(agent.slug, { childPrice: value })}
                      />
                    </TableCell>
                    <TableCell className="px-1.5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-1">
                        <select
                          aria-label={`${agent.name} national park`}
                          value={parkIncluded ? 'included' : 'excluded'}
                          onChange={(event) => {
                            const included = event.target.value === 'included'
                            void changeNationalPark(agent.slug, {
                              nationalParkIncluded: included,
                              nationalParkFee: included
                                ? 0
                                : row.nationalParkFee || DEFAULT_NATIONAL_PARK_FEE,
                            })
                          }}
                          className={
                            parkIncluded
                              ? 'h-8 w-[3.5rem] shrink-0 rounded-md border border-emerald-500/45 bg-emerald-50 px-0.5 text-center text-[11px] font-semibold text-emerald-950 outline-none'
                              : 'h-8 w-[3.5rem] shrink-0 rounded-md border border-orange-400/50 bg-orange-50 px-0.5 text-center text-[11px] font-semibold text-orange-950 outline-none'
                          }
                        >
                          <option value="included">INC</option>
                          <option value="excluded">Exc</option>
                        </select>
                        {parkIncluded ? (
                          <span className="inline-flex h-8 w-[4.25rem] items-center justify-center text-[11px] text-teal-900/35">
                            —
                          </span>
                        ) : (
                          <div className="w-[4.25rem] shrink-0">
                            <MoneyField
                              value={row.nationalParkFee || DEFAULT_NATIONAL_PARK_FEE}
                              onChange={(value) =>
                                patchRates(agent.slug, {
                                  nationalParkFee: value || DEFAULT_NATIONAL_PARK_FEE,
                                })
                              }
                            />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-1.5 py-2 align-middle">
                      <div className="mx-auto w-full max-w-[5.5rem]">
                        <MoneyField
                          value={row.privateTransferExtra}
                          onChange={(value) =>
                            patchRates(agent.slug, { privateTransferExtra: value })
                          }
                        />
                      </div>
                    </TableCell>
                    <TableCell className="px-1.5 py-2 align-middle">
                      <div className="mx-auto w-full max-w-[5.5rem]">
                        <MoneyField
                          value={row.extraZoneCharge}
                          onChange={(value) => patchRates(agent.slug, { extraZoneCharge: value })}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="px-1.5 py-2 align-middle">
                      <div className="mx-auto w-full max-w-[5.5rem]">
                        <MoneyField
                          value={row.otherServiceCharge}
                          onChange={(value) =>
                            patchRates(agent.slug, { otherServiceCharge: value })
                          }
                        />
                      </div>
                    </TableCell>
                    <TableCell className="px-1.5 py-2 align-middle text-center">
                      <Button
                        type="button"
                        size="sm"
                        variant={isSaved ? 'default' : 'outline'}
                        className="h-8 rounded-lg px-2.5 text-[11px]"
                        onClick={() => saveAgent(agent.slug)}
                        aria-label={isSaved ? `${agent.name} saved` : `Save ${agent.name}`}
                      >
                        {isSaved ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Save className="size-3.5" />
                        )}
                        {isSaved ? 'Saved' : 'Save'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Surface>
    </div>
  )
}
