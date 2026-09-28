export function rpcMessage(error: { message?: string } | null, fallback: string) {
  const raw = error?.message?.trim()
  if (!raw) return fallback
  return raw.replace(/^ERROR:\s*/i, '').replace(/\s*\(SQLSTATE\s+\w+\)\s*$/i, '')
}
