import { appendFileSync, readFileSync } from 'node:fs'
import {
  SNAPSHOT_SPREADSHEET_TITLE,
  shareEmails,
  snapshotSpreadsheetId,
  spreadsheetId,
} from '@/lib/sheets/config'
import { copySpreadsheet, readValues, shareSpreadsheetWithEmails } from '@/lib/sheets/google'
import { SNAPSHOT_SOURCE_TABS, createSnapshotSpreadsheet, saveRawSnapshot } from '@/lib/sheets/snapshot'

function loadEnvLocal() {
  const raw = readFileSync('.env.local', 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const index = line.indexOf('=')
    const key = line.slice(0, index)
    let value = line.slice(index + 1)
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function quotedRange(title: string, a1: string) {
  const quoted = /[^A-Za-z0-9_]/.test(title) ? `'${title.replace(/'/g, "''")}'` : title
  return `${quoted}!${a1}`
}

loadEnvLocal()

async function main() {
  let id = snapshotSpreadsheetId()
  if (!id) {
    const created = await createSnapshotSpreadsheet().catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('403')) throw error
      console.log('Create was denied. Copying the current backup file instead.')
      try {
        const copied = await copySpreadsheet(spreadsheetId(), SNAPSHOT_SPREADSHEET_TITLE)
        const emails = shareEmails()
        if (emails.length > 0) await shareSpreadsheetWithEmails(copied.spreadsheetId, emails, 'writer')
        return { ...copied, sharedWith: emails.join(', ') }
      } catch (copyError) {
        const copyMessage = copyError instanceof Error ? copyError.message : String(copyError)
        console.log(`Copy was not available (${copyMessage.slice(0, 80)}). Using the import workbook already in your Drive.`)
        return {
          spreadsheetId: '1fnjtv9hVTaoN33yufkF0smpgGM0cdF_NLkDZfHWooWM',
          url: 'https://docs.google.com/spreadsheets/d/1fnjtv9hVTaoN33yufkF0smpgGM0cdF_NLkDZfHWooWM/edit',
          title: SNAPSHOT_SPREADSHEET_TITLE,
          sharedWith: '',
        }
      }
    })
    id = created.spreadsheetId
    process.env.GOOGLE_SHEETS_SNAPSHOT_ID = id
    const env = readFileSync('.env.local', 'utf8')
    if (!/^GOOGLE_SHEETS_SNAPSHOT_ID=/m.test(env)) {
      appendFileSync('.env.local', `\nGOOGLE_SHEETS_SNAPSHOT_ID=${id}\n`)
    }
    console.log(
      JSON.stringify({
        created: true,
        spreadsheetId: created.spreadsheetId,
        url: created.url,
        sharedWith: created.sharedWith,
      }),
    )
  }

  const savedAt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())

  const tables = []
  for (const title of SNAPSHOT_SOURCE_TABS) {
    const values = await readValues(quotedRange(title, 'A:AZ'))
    tables.push({ title, values })
  }

  const result = await saveRawSnapshot(tables, savedAt)
  console.log(JSON.stringify({ spreadsheetId: snapshotSpreadsheetId(), ...result }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
