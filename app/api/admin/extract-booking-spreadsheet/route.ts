import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { normalizeBookingImageDraft } from '@/lib/booking-from-image'
import { spreadsheetBufferToAiText } from '@/lib/booking-spreadsheet-ai-text'
import type { BookingSpreadsheetRow } from '@/lib/booking-spreadsheet-import'
import {
  geminiApiKey,
  generateGeminiJsonText,
  looksLikeGoogleAiStudioKey,
} from '@/lib/gemini-booking-extract'
import { hasStaffSession, STAFF_COOKIE } from '@/lib/staff-auth-server'

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_BYTES = 12 * 1024 * 1024

const SYSTEM_PROMPT = `You extract tour bookings from spreadsheet / CSV text (Excel export, pickup lists, agent reports).

Return ONLY valid JSON:
{
  "rows": [
    {
      "agentName": string | null,
      "agentRef": string | null,
      "program": "PP" | "James Bond" | null,
      "date": "YYYY-MM-DD" | null,
      "parkFee": "Included" | "Not Included" | null,
      "canoe": "Included" | "Not Included" | null,
      "adults": number,
      "children": number,
      "infants": number,
      "tourLeaders": number,
      "leadGuest": string | null,
      "pickupHotel": string | null,
      "pickupZone": string | null,
      "roomNumber": string | null,
      "note": string | null,
      "cashOnTour": string | null
    }
  ]
}

Rules:
- One object per real booking row. Skip headers, totals, empty rows, product title rows.
- program: PP = Phi Phi; James Bond = Phang Nga / JB / canoe tours.
- Map ADL/CHD/INF to adults/children/infants. COT → cashOnTour.
- If a banner row has only a date above a table, apply that date to rows below until the next banner.
- Dates → YYYY-MM-DD. Thailand-style D/M/Y when ambiguous.
- Do not invent guest names or dates.`

async function requireAdmin() {
  const jar = await cookies()
  return hasStaffSession(jar.get(STAFF_COOKIE)?.value, 'admin')
}

function parseAiRowsJson(text: string, idPrefix: string): BookingSpreadsheetRow[] {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  let parsed: { rows?: unknown }
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1)) as { rows?: unknown }
  } catch {
    return []
  }
  if (!Array.isArray(parsed.rows)) return []

  const out: BookingSpreadsheetRow[] = []
  parsed.rows.forEach((item, index) => {
    const draft = normalizeBookingImageDraft(item)
    if (!draft.leadGuest && !draft.agentRef && !draft.pickupHotel) return
    out.push({
      id: `${idPrefix}-ai-${index + 1}`,
      sheet: 'AI',
      rowNumber: index + 1,
      draft: { ...draft, confidence: draft.confidence === 'low' ? 'medium' : draft.confidence },
    })
  })
  return out
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 })
  }

  const apiKey = geminiApiKey()
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Add GEMINI_API_KEY to .env.local — https://aistudio.google.com/apikey (AIza… or new AQ.… keys)',
      },
      { status: 503 },
    )
  }

  if (!looksLikeGoogleAiStudioKey(apiKey)) {
    return NextResponse.json(
      {
        error:
          'GEMINI_API_KEY should be from Google AI Studio (AIza… or AQ.…), not service account JSON.',
      },
      { status: 503 },
    )
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Upload a CSV or Excel file under 12 MB.' }, { status: 400 })
  }

  const name = file.name.toLowerCase()
  if (
    !name.endsWith('.csv') &&
    !name.endsWith('.xlsx') &&
    !name.endsWith('.xls') &&
    !name.endsWith('.ods')
  ) {
    return NextResponse.json({ error: 'Use .csv, .xlsx, or .xls' }, { status: 415 })
  }

  try {
    const buffer = await file.arrayBuffer()
    const tableText = await spreadsheetBufferToAiText(buffer)
    if (!tableText.trim()) {
      return NextResponse.json({ error: 'Spreadsheet appears empty.' }, { status: 400 })
    }

    const content = await generateGeminiJsonText(
      apiKey,
      SYSTEM_PROMPT,
      `File name: ${file.name}\n\nExtract all bookings:\n\n${tableText}`,
    )

    const idPrefix = `import-${Date.now()}`
    const rows = parseAiRowsJson(content, idPrefix)
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            'AI could not read bookings from this file. Try the template in /templates/booking-import-template.xlsx or use Read file.',
        },
        { status: 422 },
      )
    }

    return NextResponse.json({ rows, format: 'ai' as const })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Spreadsheet AI request failed.'
    console.warn('[extract-booking-spreadsheet]', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
