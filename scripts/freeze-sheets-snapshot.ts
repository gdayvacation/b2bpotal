import { readFileSync } from 'node:fs'
import { freezeLiveSheet } from '@/lib/sheets/snapshot'

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

loadEnvLocal()

const savedAt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(new Date())

freezeLiveSheet(savedAt)
  .then((result) => {
    console.log(JSON.stringify(result))
    if (result.blocked) process.exit(1)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
