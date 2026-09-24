'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Save } from 'lucide-react'
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
  DEFAULT_INVOICE_SETTINGS,
  emptyAgencyRates,
  parseMoneyInput,
  type AgencyInvoiceRates,
  type InvoiceSettings,
} from '@/lib/invoice'

function MoneyField({
  value,
  onChange,
  id,
}: {
  value: number
  onChange: (value: number) => void
  id?: string
}) {
  return (
    <Input
      id={id}
      type="number"
      min={0}
      step="1"
      value={value || ''}
      onChange={(event) => onChange(parseMoneyInput(event.target.value))}
      className="h-9 w-24 px-2 text-right"
    />
  )
}

export function AdminInvoiceSetup() {
  const { agents } = usePortal()
  const { settings, rates, loading, cloud, updateSettings, updateRates } = useInvoiceStore()
  const [draftSettings, setDraftSettings] = useState<InvoiceSettings | null>(null)
  const [saved, setSaved] = useState<'company' | string | null>(null)
  const [rateDrafts, setRateDrafts] = useState<Record<string, AgencyInvoiceRates>>({})

  const company = draftSettings ?? settings
  const activeAgents = useMemo(
    () => agents.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  )

  function ratesFor(slug: string) {
    return rateDrafts[slug] ?? rates.find((row) => row.agentSlug === slug) ?? emptyAgencyRates(slug)
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

  async function saveAgent(slug: string) {
    await updateRates(ratesFor(slug))
    setRateDrafts((current) => {
      const next = { ...current }
      delete next[slug]
      return next
    })
    setSaved(slug)
    window.setTimeout(() => setSaved(null), 1800)
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Invoice setup"
        description="Set agency tour prices and company bank details used on invoices, billing notes, and receipts."
        actions={
          <Link href="/admin/invoices">
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

      <Surface className="mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-medium text-teal-950">Company and bank</h2>
            <p className="mt-1 text-sm text-teal-900/55">
              Printed on every invoice and receipt. Defaults match the Good Day Vacation paper.
            </p>
          </div>
          <Button type="button" className="h-10 rounded-xl" onClick={saveCompany}>
            {saved === 'company' ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
            {saved === 'company' ? 'Saved' : 'Save company'}
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(
            [
              ['companyName', 'Company name', company.companyName],
              ['companyLegal', 'Legal name', company.companyLegal],
              ['addressTh', 'Address (Thai)', company.addressTh],
              ['addressEn', 'Address (English)', company.addressEn],
              ['bankName', 'Bank name', company.bankName],
              ['bankAccountType', 'Account type', company.bankAccountType],
              ['bankAccountName', 'Account name', company.bankAccountName],
              ['bankAccountNo', 'Account number', company.bankAccountNo],
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
        <button
          type="button"
          className="mt-3 text-xs font-medium text-teal-700 hover:text-teal-950"
          onClick={() => setDraftSettings(DEFAULT_INVOICE_SETTINGS)}
        >
          Reset to Good Day Vacation defaults
        </button>
      </Surface>

      <Surface className="overflow-hidden">
        <div className="border-b border-teal-900/8 px-5 py-4">
          <h2 className="font-medium text-teal-950">Agency prices (THB)</h2>
          <p className="mt-1 text-sm text-teal-900/55">
            AD / CH / IN / TL are per person. Change date and cancel are per adult + child.
            Private transfer and extra zone apply when the check-in booking has those charges.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agency</TableHead>
                <TableHead className="text-right">AD</TableHead>
                <TableHead className="text-right">CH</TableHead>
                <TableHead className="text-right">IN</TableHead>
                <TableHead className="text-right">TL</TableHead>
                <TableHead className="text-right">Change date</TableHead>
                <TableHead className="text-right">Cancel</TableHead>
                <TableHead className="text-right">Private transfer</TableHead>
                <TableHead className="text-right">Extra zone</TableHead>
                <TableHead>Other service</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeAgents.map((agent) => {
                const row = ratesFor(agent.slug)
                return (
                  <TableRow key={agent.slug}>
                    <TableCell className="font-medium text-teal-950">{agent.name}</TableCell>
                    <TableCell>
                      <MoneyField
                        value={row.adultPrice}
                        onChange={(value) => patchRates(agent.slug, { adultPrice: value })}
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyField
                        value={row.childPrice}
                        onChange={(value) => patchRates(agent.slug, { childPrice: value })}
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyField
                        value={row.infantPrice}
                        onChange={(value) => patchRates(agent.slug, { infantPrice: value })}
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyField
                        value={row.tourLeaderPrice}
                        onChange={(value) => patchRates(agent.slug, { tourLeaderPrice: value })}
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyField
                        value={row.changeDatePrice}
                        onChange={(value) => patchRates(agent.slug, { changeDatePrice: value })}
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyField
                        value={row.cancelPrice}
                        onChange={(value) => patchRates(agent.slug, { cancelPrice: value })}
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyField
                        value={row.privateTransferExtra}
                        onChange={(value) =>
                          patchRates(agent.slug, { privateTransferExtra: value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyField
                        value={row.extraZoneCharge}
                        onChange={(value) => patchRates(agent.slug, { extraZoneCharge: value })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MoneyField
                          value={row.otherServiceCharge}
                          onChange={(value) =>
                            patchRates(agent.slug, { otherServiceCharge: value })
                          }
                        />
                        <Input
                          value={row.otherServiceLabel}
                          onChange={(event) =>
                            patchRates(agent.slug, { otherServiceLabel: event.target.value })
                          }
                          className="h-9 w-36 px-2"
                          placeholder="Label"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-xl"
                        onClick={() => saveAgent(agent.slug)}
                      >
                        {saved === agent.slug ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Save className="size-3.5" />
                        )}
                        Save
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
