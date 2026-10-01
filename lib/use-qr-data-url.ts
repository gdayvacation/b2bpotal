'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** Renders the QR in the browser so link secrets never reach a third-party QR service. */
export function useQrDataUrl(text: string, size = 512) {
  const [result, setResult] = useState<{ text: string; url: string } | null>(null)

  useEffect(() => {
    if (!text) return
    let cancelled = false
    QRCode.toDataURL(text, { width: size, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setResult({ text, url })
      })
      .catch(() => {
        if (!cancelled) setResult(null)
      })
    return () => {
      cancelled = true
    }
  }, [text, size])

  return text && result?.text === text ? result.url : ''
}
