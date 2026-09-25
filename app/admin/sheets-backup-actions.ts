'use server'

import {
  canCreateSpreadsheet,
  hasServiceAccount,
  missingSheetsBackupEnv,
  resolvedSpreadsheetId,
  shareEmail,
  sheetsBackupConfigured,
} from '@/lib/sheets/config'
import { createBackupSpreadsheet } from '@/lib/sheets/create'
import { spreadsheetUrl } from '@/lib/sheets/store'
import { runSheetsBackup } from '@/lib/sheets/sync'

export async function getSheetsBackupStatus() {
  const spreadsheetId = resolvedSpreadsheetId()
  return {
    configured: sheetsBackupConfigured(),
    canCreate: canCreateSpreadsheet(),
    hasServiceAccount: hasServiceAccount(),
    missing: missingSheetsBackupEnv(),
    spreadsheetId,
    spreadsheetUrl: spreadsheetId ? spreadsheetUrl(spreadsheetId) : '',
    shareEmail: shareEmail(),
  }
}

export async function createSheetsBackupWorkbook(email: string) {
  try {
    const result = await createBackupSpreadsheet(email)
    return { ok: true as const, ...result }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Could not create the Google Sheet',
    }
  }
}

export async function runSheetsBackupNow() {
  try {
    const result = await runSheetsBackup()
    return { ok: true as const, ...result }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Sheets backup failed',
    }
  }
}
