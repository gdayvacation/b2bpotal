import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { parseBookingImageModelText } from '@/lib/booking-from-image'
import {
  geminiApiKey,
  geminiBookingModel,
  looksLikeGoogleAiStudioKey,
} from '@/lib/gemini-booking-extract'
import { hasStaffSession, STAFF_COOKIE } from '@/lib/staff-auth-server'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 8 * 1024 * 1024
const MAX_TEXT = 20_000
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const SYSTEM_PROMPT = `You extract tour booking details from chat text and/or chat screenshots (WhatsApp, Line, iMessage, Messenger, email, handwritten notes photos).

Return ONLY valid JSON (no markdown) with this exact shape:
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
  "cashOnTour": string | null,
  "confidence": "high" | "medium" | "low",
  "warnings": string[],
  "rawNotes": string | null
}

Rules:
- Programs: PP = Phi Phi / Maya Bay / Bamboo. James Bond = Phang Nga / canoe / Hong Island / JB.
- Dates: convert any local format to YYYY-MM-DD. Prefer day/month/year when ambiguous (Thailand style).
- Pax: adults/AD, children/CH, infants/INF, tour leaders/TL/FOC. Use 0 when absent.
- parkFee / canoe: Included unless chat clearly says excluded / pay own / not included. canoe only matters for James Bond.
- pickupZone examples: Patong, Kata, Karon, Other, No Transfer, Private.
- Put unclear free text into note or rawNotes. List uncertainties in warnings.
- Never invent a guest name or date. Use null / 0 when unknown.
- Read Thai and English text.`

async function requireAdmin() {
  const jar = await cookies()
  return hasStaffSession(jar.get(STAFF_COOKIE)?.value, 'admin')
}

type ExtractInput = {
  text?: string
  image?: { mimeType: string; base64: string }
}

async function extractWithGemini(apiKey: string, input: ExtractInput) {
  const parts: Array<Record<string, unknown>> = [
    {
      text: input.text
        ? `Extract the booking fields from this chat / booking text${input.image ? ' and screenshot' : ''}:\n\n${input.text}`
        : 'Extract the booking fields from this chat / booking screenshot.',
    },
  ]
  if (input.image) {
    parts.push({
      inlineData: {
        mimeType: input.image.mimeType,
        data: input.image.base64,
      },
    })
  }

  const model = geminiBookingModel()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
  })

  const payload = (await response.json().catch(() => null)) as
    | {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> }
        }>
        error?: { message?: string }
      }
    | null

  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Google AI Studio request failed.')
  }

  return payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
}

async function extractWithOpenAI(apiKey: string, input: ExtractInput) {
  const model = process.env.OPENAI_BOOKING_VISION_MODEL?.trim() || 'gpt-4o-mini'
  const content: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: input.text
        ? `Extract the booking fields from this chat / booking text${input.image ? ' and screenshot' : ''}:\n\n${input.text}`
        : 'Extract the booking fields from this chat / booking screenshot.',
    },
  ]
  if (input.image) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${input.image.mimeType};base64,${input.image.base64}`,
        detail: 'high',
      },
    })
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    }),
  })

  const payload = (await response.json().catch(() => null)) as
    | {
        choices?: Array<{ message?: { content?: string } }>
        error?: { message?: string }
      }
    | null

  if (!response.ok) {
    throw new Error(payload?.error?.message || 'OpenAI vision request failed.')
  }

  return payload?.choices?.[0]?.message?.content ?? ''
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 })
  }

  const googleKey = geminiApiKey()
  const openaiKey = process.env.OPENAI_API_KEY?.trim() || ''
  if (!googleKey && !openaiKey) {
    return NextResponse.json(
      {
        error:
          'Add GEMINI_API_KEY from Google AI Studio (AIza… or AQ.…) to .env.local — https://aistudio.google.com/apikey',
      },
      { status: 503 },
    )
  }

  if (googleKey && !looksLikeGoogleAiStudioKey(googleKey) && !openaiKey) {
    return NextResponse.json(
      {
        error:
          'GEMINI_API_KEY must be from Google AI Studio (AIza… or AQ.…), not service account JSON. Create one at https://aistudio.google.com/apikey',
      },
      { status: 503 },
    )
  }

  const useGemini = Boolean(googleKey && looksLikeGoogleAiStudioKey(googleKey))
  if (!useGemini && !openaiKey) {
    return NextResponse.json(
      {
        error:
          'Add a valid GEMINI_API_KEY (AI Studio) or OPENAI_API_KEY to .env.local',
      },
      { status: 503 },
    )
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 })
  }

  const chatText = String(formData.get('text') ?? '').trim()
  const file = formData.get('image')
  const hasImage = file instanceof File

  if (!chatText && !hasImage) {
    return NextResponse.json(
      { error: 'Paste chat text or attach a screenshot.' },
      { status: 400 },
    )
  }
  if (chatText.length > MAX_TEXT) {
    return NextResponse.json({ error: 'Chat text is too long.' }, { status: 413 })
  }

  let image: ExtractInput['image']
  if (hasImage) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Use a JPG, PNG, WEBP, or GIF screenshot.' },
        { status: 415 },
      )
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be under 8 MB.' }, { status: 413 })
    }
    image = {
      mimeType: file.type,
      base64: Buffer.from(await file.arrayBuffer()).toString('base64'),
    }
  }

  const input: ExtractInput = {
    text: chatText || undefined,
    image,
  }

  try {
    const content = useGemini
      ? await extractWithGemini(googleKey, input)
      : await extractWithOpenAI(openaiKey, input)
    const draft = parseBookingImageModelText(content)
    return NextResponse.json({ draft })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Vision AI request failed.'
    console.warn('[extract-booking]', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
