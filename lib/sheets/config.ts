import { readStoredSpreadsheet } from '@/lib/sheets/store'

export const SHEET_TITLES = {
  bookings: 'Bookings',
  guests: 'Check-in guests',
  merge: 'Merge',
  monthly: 'Monthly',
  months: '_Months',
} as const

export const BACKUP_SPREADSHEET_TITLE = "G'Day Tours — Daily backup"

export function hasServiceAccount() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) ||
    (Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()) &&
      Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim()))
}

export function resolvedSpreadsheetId() {
  return (
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ||
    readStoredSpreadsheet()?.spreadsheetId ||
    ''
  )
}

export function sheetsBackupConfigured() {
  return hasServiceAccount() && Boolean(resolvedSpreadsheetId())
}

export function canCreateSpreadsheet() {
  return hasServiceAccount()
}

export function missingSheetsBackupEnv() {
  const missing: string[] = []
  if (!hasServiceAccount()) {
    missing.push('GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_EMAIL + PRIVATE_KEY')
  }
  if (!resolvedSpreadsheetId()) {
    missing.push('GOOGLE_SHEETS_SPREADSHEET_ID (or click Create sheet)')
  }
  return missing
}

export function spreadsheetId() {
  const id = resolvedSpreadsheetId()
  if (!id) throw new Error('Missing Google Sheet. Create it from Report → Google Sheets backup.')
  return id
}

export function shareEmail() {
  return process.env.GOOGLE_SHEETS_SHARE_EMAIL?.trim() ?? ''
}

export function serviceAccountCredentials() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (json) {
    const parsed = JSON.parse(json) as { client_email?: string; private_key?: string }
    const email = parsed.client_email?.trim()
    const key = parsed.private_key?.replace(/\\n/g, '\n')
    if (!email || !key) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key')
    }
    return { email, key }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  }
  return { email, key }
}
