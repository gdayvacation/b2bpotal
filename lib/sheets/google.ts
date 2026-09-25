import { JWT } from 'google-auth-library'
import { serviceAccountCredentials, spreadsheetId } from '@/lib/sheets/config'
import type { SheetCell } from '@/lib/sheets/rows'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'

type SheetProps = {
  sheetId: number
  title: string
}

async function accessToken() {
  const { email, key } = serviceAccountCredentials()
  const client = new JWT({
    email,
    key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
  })
  const token = await client.getAccessToken()
  if (!token.token) throw new Error('Google Sheets auth failed — no access token')
  return token.token
}

async function googleFetch(url: string, init?: RequestInit) {
  const token = await accessToken()
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google API ${response.status}: ${text.slice(0, 400)}`)
  }
  if (response.status === 204) return null
  return response.json() as Promise<unknown>
}

async function sheetsFetch(path: string, init?: RequestInit, id = spreadsheetId()) {
  return googleFetch(`${SHEETS_API}/${id}${path}`, init)
}

export async function createSpreadsheet(title: string, tabTitles: string[]) {
  const data = (await googleFetch(SHEETS_API, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: tabTitles.map((tabTitle, index) => ({
        properties: {
          title: tabTitle,
          index,
          hidden: tabTitle.startsWith('_'),
        },
      })),
    }),
  })) as { spreadsheetId?: string; spreadsheetUrl?: string }

  const spreadsheetIdValue = data.spreadsheetId?.trim()
  if (!spreadsheetIdValue) throw new Error('Google Sheets create returned no spreadsheet id')
  return {
    spreadsheetId: spreadsheetIdValue,
    url: data.spreadsheetUrl?.trim() || `https://docs.google.com/spreadsheets/d/${spreadsheetIdValue}`,
    title,
  }
}

export async function shareSpreadsheet(id: string, email: string) {
  const trimmed = email.trim()
  if (!trimmed) return
  await googleFetch(
    `${DRIVE_API}/files/${encodeURIComponent(id)}/permissions?sendNotificationEmail=true`,
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'user',
        role: 'writer',
        emailAddress: trimmed,
      }),
    },
  )
}

export async function shareSpreadsheetAnyoneWithLink(id: string) {
  await googleFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}/permissions`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'anyone',
      role: 'writer',
    }),
  })
}

export async function listSheets(): Promise<SheetProps[]> {
  const data = (await sheetsFetch('?fields=sheets.properties')) as {
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>
  }
  return (data.sheets ?? [])
    .map((sheet) => ({
      sheetId: sheet.properties?.sheetId ?? -1,
      title: sheet.properties?.title ?? '',
    }))
    .filter((sheet) => sheet.sheetId >= 0 && sheet.title)
}

export async function ensureSheets(titles: string[]) {
  const existing = await listSheets()
  const have = new Set(existing.map((sheet) => sheet.title))
  const requests: unknown[] = []
  const leftover = existing.find((sheet) => sheet.title === 'Sheet1')
  if (leftover && titles[0] && !have.has(titles[0])) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: leftover.sheetId, title: titles[0] },
        fields: 'title',
      },
    })
    have.add(titles[0])
  }
  for (const title of titles) {
    if (have.has(title)) continue
    requests.push({ addSheet: { properties: { title, hidden: title.startsWith('_') } } })
  }
  if (requests.length > 0) {
    await sheetsFetch(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests }),
    })
  }
  return listSheets()
}

export async function getCell(range: string) {
  const data = (await sheetsFetch(`/values/${encodeURIComponent(range)}`)) as {
    values?: string[][]
  }
  return data.values?.[0]?.[0] ?? ''
}

export async function clearRange(range: string) {
  await sheetsFetch(`/values/${encodeURIComponent(range)}:clear`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function writeValues(
  range: string,
  values: SheetCell[][],
  valueInputOption: 'RAW' | 'USER_ENTERED' = 'RAW',
) {
  await sheetsFetch(`/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`, {
    method: 'PUT',
    body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
  })
}

export async function batchUpdate(requests: unknown[]) {
  if (requests.length === 0) return
  await sheetsFetch(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests }),
  })
}

export function expandGridRequests(sheetId: number, rowCount = 10000, columnCount = 60) {
  return {
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: { rowCount, columnCount },
      },
      fields: 'gridProperties.rowCount,gridProperties.columnCount',
    },
  }
}

export function sheetIdByTitle(sheets: SheetProps[], title: string) {
  const match = sheets.find((sheet) => sheet.title === title)
  if (!match) throw new Error(`Missing Google Sheet tab: ${title}`)
  return match.sheetId
}

export function freezeAndFilterRequests(sheetId: number, columnCount: number, rowCount: number) {
  return [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: Math.max(2, rowCount),
            startColumnIndex: 0,
            endColumnIndex: columnCount,
          },
        },
      },
    },
  ]
}

export function hideSheetRequest(sheetId: number) {
  return {
    updateSheetProperties: {
      properties: { sheetId, hidden: true },
      fields: 'hidden',
    },
  }
}

export function monthDropdownRequest(sheetId: number, monthCount: number) {
  return {
    setDataValidation: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 1,
        endColumnIndex: 2,
      },
      rule: {
        condition: {
          type: 'ONE_OF_RANGE',
          values: [
            {
              userEnteredValue: `='_Months'!A2:A${Math.max(2, monthCount + 1)}`,
            },
          ],
        },
        showCustomUi: true,
        strict: true,
      },
    },
  }
}
