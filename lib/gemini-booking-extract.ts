/** GA Flash per https://ai.google.dev/gemini-api/docs/models — override via GEMINI_BOOKING_VISION_MODEL */
const DEFAULT_MODEL = 'gemini-3.8-flash'

export function geminiApiKey() {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    ''
  )
}

export function geminiBookingModel() {
  return process.env.GEMINI_BOOKING_VISION_MODEL?.trim() || DEFAULT_MODEL
}

/** Google AI Studio: legacy `AIza…` or newer auth keys `AQ.…` */
export function looksLikeGoogleAiStudioKey(key: string) {
  return key.startsWith('AIza') || key.startsWith('AQ.')
}

export async function generateGeminiJsonText(apiKey: string, systemPrompt: string, userText: string) {
  const model = geminiBookingModel()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
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
