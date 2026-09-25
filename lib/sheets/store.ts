import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const STORE_PATH = path.join(process.cwd(), '.data', 'google-sheets-backup.json')

export type StoredSpreadsheet = {
  spreadsheetId: string
  url: string
  title: string
}

export function readStoredSpreadsheet(): StoredSpreadsheet | null {
  try {
    const raw = readFileSync(STORE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Partial<StoredSpreadsheet>
    const spreadsheetId = parsed.spreadsheetId?.trim()
    if (!spreadsheetId) return null
    return {
      spreadsheetId,
      url: parsed.url?.trim() || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      title: parsed.title?.trim() || "G'Day Tours — Daily backup",
    }
  } catch {
    return null
  }
}

export function writeStoredSpreadsheet(row: StoredSpreadsheet) {
  mkdirSync(path.dirname(STORE_PATH), { recursive: true })
  writeFileSync(STORE_PATH, `${JSON.stringify(row, null, 2)}\n`, 'utf8')
}

export function spreadsheetUrl(id: string) {
  return `https://docs.google.com/spreadsheets/d/${id}`
}
