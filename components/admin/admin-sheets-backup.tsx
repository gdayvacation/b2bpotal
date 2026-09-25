'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, CloudUpload, FileSpreadsheet } from 'lucide-react'
import {
  createSheetsBackupWorkbook,
  getSheetsBackupStatus,
  runSheetsBackupNow,
} from '@/app/admin/sheets-backup-actions'
import { PageHeader, SoftLabel, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AdminSheetsBackup({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [creating, setCreating] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [canCreate, setCanCreate] = useState(false)
  const [hasServiceAccount, setHasServiceAccount] = useState(false)
  const [missing, setMissing] = useState<string[]>([])
  const [spreadsheetId, setSpreadsheetId] = useState('')
  const [sheetUrl, setSheetUrl] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refreshStatus() {
    const status = await getSheetsBackupStatus()
    setConfigured(status.configured)
    setCanCreate(status.canCreate)
    setHasServiceAccount(status.hasServiceAccount)
    setMissing(status.missing)
    setSpreadsheetId(status.spreadsheetId)
    setSheetUrl(status.spreadsheetUrl)
    if (status.shareEmail && !email) setEmail(status.shareEmail)
    setLoading(false)
  }

  useEffect(() => {
    void refreshStatus()
  }, [])

  async function handleCreate() {
    setCreating(true)
    setMessage(null)
    setError(null)
    const result = await createSheetsBackupWorkbook(email)
    setCreating(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSpreadsheetId(result.spreadsheetId)
    setSheetUrl(result.url)
    setConfigured(true)
    setMessage(
      result.created
        ? `Created the Google Sheet${result.sharedWith ? ` and shared it with ${result.sharedWith}` : ''}.`
        : `Using the existing sheet${result.sharedWith ? ` and shared it with ${result.sharedWith}` : ''}.`,
    )
    await refreshStatus()
  }

  async function handleBackup() {
    setRunning(true)
    setMessage(null)
    setError(null)
    const result = await runSheetsBackupNow()
    setRunning(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage(
      `Synced ${result.bookings} bookings and ${result.guests} check-in guests at ${result.syncedAt} Thai time.`,
    )
  }

  return (
    <div className="w-full">
      <div className="mb-4">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
          Report
        </Button>
      </div>
      <PageHeader
        title="Google Sheets backup"
        description="The API creates the workbook with four tabs. Nightly sync at 4:00 AM Thai time keeps it updated."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCreate()}
              disabled={!canCreate || creating}
            >
              <FileSpreadsheet data-icon="inline-start" />
              {creating ? 'Creating…' : spreadsheetId ? 'Share / open setup' : 'Create Google Sheet'}
            </Button>
            <Button type="button" onClick={() => void handleBackup()} disabled={!configured || running}>
              <CloudUpload data-icon="inline-start" />
              {running ? 'Backing up…' : 'Backup now'}
            </Button>
          </div>
        }
      />

      {message ? (
        <p className="mb-4 rounded-xl border border-teal-700/20 bg-teal-50 px-4 py-3 text-sm text-teal-950">
          {message}{' '}
          {sheetUrl ? (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-teal-800 underline-offset-2 hover:underline"
            >
              Open sheet
            </a>
          ) : null}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-xl border border-rose-700/20 bg-rose-50 px-4 py-3 text-sm text-rose-950">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="p-5">
          <p className="text-sm font-semibold text-teal-950">Tabs the API creates</p>
          <ol className="mt-3 space-y-2 text-sm leading-relaxed text-teal-900/70">
            <li>
              <span className="font-semibold text-teal-950">Bookings</span> — every booking, with a
              Month column.
            </li>
            <li>
              <span className="font-semibold text-teal-950">Check-in guests</span> — one row per
              guest who checked in.
            </li>
            <li>
              <span className="font-semibold text-teal-950">Merge</span> — booked pax vs real
              check-in vs extra charge.
            </li>
            <li>
              <span className="font-semibold text-teal-950">Monthly</span> — pick a month in B1.
            </li>
          </ol>
        </Surface>

        <Surface className="p-5">
          <p className="text-sm font-semibold text-teal-950">Create with the API</p>
          {loading ? (
            <p className="mt-3 text-sm text-teal-900/55">Checking environment…</p>
          ) : (
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-teal-900/70">
              <div className="space-y-1.5">
                <SoftLabel htmlFor="sheets-share-email">Share the new sheet with</SoftLabel>
                <Input
                  id="sheets-share-email"
                  type="email"
                  placeholder="your@gmail.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              {hasServiceAccount ? (
                <p>
                  Service account is ready. Click <span className="font-semibold">Create Google Sheet</span>{' '}
                  — Google will make the workbook and share it to that email.
                </p>
              ) : (
                <div className="space-y-2">
                  <p>
                    I can create the sheet through the Google API, but Google still needs a service
                    account key. Add this to `.env.local` and Vercel, then come back and click Create:
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    {missing
                      .filter((item) => !item.includes('SPREADSHEET_ID'))
                      .map((item) => (
                        <li key={item} className="font-mono text-xs text-teal-950">
                          {item}
                        </li>
                      ))}
                  </ul>
                  <p>
                    Enable <span className="font-medium">Google Sheets API</span> and{' '}
                    <span className="font-medium">Google Drive API</span> on that Google Cloud
                    project. You do not need to make a blank sheet yourself.
                  </p>
                </div>
              )}
              {sheetUrl ? (
                <p>
                  <a
                    href={sheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-teal-800 underline-offset-2 hover:underline"
                  >
                    Open the backup sheet
                  </a>
                </p>
              ) : null}
            </div>
          )}
        </Surface>
      </div>
    </div>
  )
}
