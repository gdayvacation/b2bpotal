'use client'

import { useEffect, useId, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { CompanyLogo } from '@/components/agent/company-logo'
import { usePortal } from '@/components/portal-provider'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { prepareCompanyLogo, type AgentCompanyProfile } from '@/lib/agent-company'
import { loadAgentCompany } from '@/lib/supabase/portal-db'

export function AgentCompanyPage({ slug }: { slug: string }) {
  const { agents, saveAgentCompanyProfile } = usePortal()
  const agent = agents.find((item) => item.slug === slug)
  const fileId = useId()
  const [profile, setProfile] = useState<AgentCompanyProfile | null>(null)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [readingLogo, setReadingLogo] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadError('')
    loadAgentCompany(slug)
      .then((row) => {
        if (cancelled) return
        const current = agents.find((item) => item.slug === slug)
        if (row) {
          setProfile({
            companyName: row.companyName.trim() || current?.name || '',
            companyPhone: row.companyPhone,
            companyEmail: row.companyEmail,
            logoDataUrl: row.logoDataUrl,
          })
          return
        }
        setProfile({
          companyName: current?.companyName?.trim() || current?.name || '',
          companyPhone: current?.companyPhone || '',
          companyEmail: current?.companyEmail || '',
          logoDataUrl: current?.logoDataUrl || '',
        })
      })
      .catch((caught) => {
        if (cancelled) return
        const current = agents.find((item) => item.slug === slug)
        setProfile({
          companyName: current?.companyName || current?.name || '',
          companyPhone: current?.companyPhone || '',
          companyEmail: current?.companyEmail || '',
          logoDataUrl: current?.logoDataUrl || '',
        })
        setLoadError(caught instanceof Error ? caught.message : 'Could not load the saved company profile.')
      })
    return () => {
      cancelled = true
    }
    // Load once per agency. Later edits stay in this form until save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  async function onLogo(file: File | undefined) {
    if (!file || !profile) return
    setFormError('')
    setSaved(false)
    setReadingLogo(true)
    try {
      const logoDataUrl = await prepareCompanyLogo(file)
      setProfile({ ...profile, logoDataUrl })
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not use that logo.')
    } finally {
      setReadingLogo(false)
    }
  }

  async function onSave() {
    if (!profile) return
    setSaving(true)
    setFormError('')
    setSaved(false)
    const error = await saveAgentCompanyProfile(slug, profile)
    setSaving(false)
    if (error) {
      setFormError(error)
      return
    }
    setSaved(true)
  }

  if (!agent || !profile) {
    return <p className="text-sm text-teal-900/55">Loading company details…</p>
  }

  const previewName = profile.companyName.trim() || agent.name
  const previewContact = [profile.companyPhone.trim(), profile.companyEmail.trim()].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Voucher"
        title="Company details"
        description="This name, logo, and contact appear on every voucher you send to guests."
      />

      <Surface className="p-5 sm:p-6">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            void onSave()
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <CompanyLogo
              name={previewName}
              logoUrl={profile.logoDataUrl}
              rounded="sheet"
              className="size-16 text-lg"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-teal-950">Logo</p>
              <p className="mt-1 text-sm leading-relaxed text-teal-900/55">
                PNG, JPG, or WebP. Square logos look best. Up to 5 MB — we crop it to a square and
                resize it to 256×256. Clear areas are filled white so the logo prints cleanly.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  id={fileId}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    void onLogo(file)
                  }}
                />
                <label
                  htmlFor={fileId}
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'h-10 cursor-pointer rounded-xl',
                    readingLogo && 'pointer-events-none opacity-50',
                  )}
                >
                  <ImagePlus data-icon="inline-start" />
                  {readingLogo ? 'Resizing…' : profile.logoDataUrl ? 'Replace logo' : 'Upload logo'}
                </label>
                {profile.logoDataUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={() => {
                      setSaved(false)
                      setProfile({ ...profile, logoDataUrl: '' })
                    }}
                  >
                    <Trash2 data-icon="inline-start" />
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="company-name">Company name on the voucher</Label>
            <Input
              id="company-name"
              value={profile.companyName}
              maxLength={120}
              onChange={(event) => {
                setSaved(false)
                setProfile({ ...profile, companyName: event.target.value })
              }}
              placeholder="Sunrise Tours Co., Ltd"
            />
            <p className="text-xs text-teal-900/45">
              Use the name your guests should see. This does not change your booking-link name.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="company-phone">Phone or WhatsApp</Label>
              <Input
                id="company-phone"
                value={profile.companyPhone}
                inputMode="tel"
                autoComplete="tel"
                maxLength={40}
                onChange={(event) => {
                  setSaved(false)
                  setProfile({ ...profile, companyPhone: event.target.value })
                }}
                placeholder="+66 81 234 5678"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-email">Email</Label>
              <Input
                id="company-email"
                type="email"
                value={profile.companyEmail}
                autoComplete="email"
                maxLength={120}
                onChange={(event) => {
                  setSaved(false)
                  setProfile({ ...profile, companyEmail: event.target.value })
                }}
                placeholder="reservations@example.com"
              />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-teal-900/45">
            Phone and email are optional. Guests use them if pickup details change on the tour day.
          </p>

          {loadError ? <p className="text-sm text-amber-800">{loadError}</p> : null}
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          {saved ? <p className="text-sm font-medium text-teal-800">Saved. New vouchers use these details.</p> : null}

          <Button type="submit" className="h-10 rounded-xl" disabled={saving || readingLogo}>
            {saving ? 'Saving…' : 'Save company details'}
          </Button>
        </form>
      </Surface>

      <Surface className="mt-4 overflow-hidden">
        <p className="border-b border-teal-900/8 px-5 py-3 text-[11px] font-semibold tracking-wide text-teal-900/45 uppercase">
          Voucher header preview
        </p>
        <div className="flex items-center gap-2.5 px-5 py-4">
          <CompanyLogo
            name={previewName}
            logoUrl={profile.logoDataUrl}
            rounded="sheet"
            className="size-9 text-[13px]"
          />
          <div className="min-w-0 leading-tight">
            <div className="font-display text-[14px] font-semibold tracking-tight text-teal-950">
              {previewName}
            </div>
            <div className="text-[11px] text-teal-800/55">{previewContact || 'Travel partner'}</div>
          </div>
        </div>
      </Surface>
    </div>
  )
}
