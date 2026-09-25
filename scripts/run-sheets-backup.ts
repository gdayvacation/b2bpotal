import { readFileSync } from 'node:fs'

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

void import('@/lib/sheets/sync')
  .then(({ runSheetsBackup }) => runSheetsBackup())
  .then((result) => {
    console.log(JSON.stringify(result))
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
