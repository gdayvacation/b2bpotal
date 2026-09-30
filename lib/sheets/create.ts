import { appendFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  BACKUP_SPREADSHEET_TITLE,
  SHEET_TITLES,
  hasServiceAccount,
  resolvedSpreadsheetId,
  shareEmail,
  shareEmails,
} from '@/lib/sheets/config'
import { createSpreadsheet, shareSpreadsheetWithEmails } from '@/lib/sheets/google'
import { spreadsheetUrl, writeStoredSpreadsheet } from '@/lib/sheets/store'

export type CreatedSpreadsheet = {
  spreadsheetId: string
  url: string
  title: string
  created: boolean
  sharedWith: string
}

export async function createBackupSpreadsheet(email = shareEmail()): Promise<CreatedSpreadsheet> {
  if (!hasServiceAccount()) {
    throw new Error(
      'Add a Google service account key first (GOOGLE_SERVICE_ACCOUNT_JSON). Then the API can create the sheet.',
    )
  }

  const emails = shareEmails(email)
  const sharedWith = emails.join(', ')

  const existing = resolvedSpreadsheetId()
  if (existing) {
    const url = spreadsheetUrl(existing)
    if (emails.length > 0) {
      await shareSpreadsheetWithEmails(existing, emails, 'writer')
    }
    return {
      spreadsheetId: existing,
      url,
      title: BACKUP_SPREADSHEET_TITLE,
      created: false,
      sharedWith,
    }
  }

  const created = await createSpreadsheet(BACKUP_SPREADSHEET_TITLE, Object.values(SHEET_TITLES))
  writeStoredSpreadsheet(created)
  appendSpreadsheetIdToLocalEnv(created.spreadsheetId)
  if (emails.length > 0) {
    await shareSpreadsheetWithEmails(created.spreadsheetId, emails, 'writer')
  }

  return {
    ...created,
    created: true,
    sharedWith,
  }
}

function appendSpreadsheetIdToLocalEnv(id: string) {
  const envPath = path.join(process.cwd(), '.env.local')
  try {
    const current = readFileSync(envPath, 'utf8')
    if (/^GOOGLE_SHEETS_SPREADSHEET_ID=/m.test(current)) return
    appendFileSync(envPath, `\nGOOGLE_SHEETS_SPREADSHEET_ID=${id}\n`)
  } catch {
    // Vercel / read-only filesystem — id is still stored in .data
  }
}
