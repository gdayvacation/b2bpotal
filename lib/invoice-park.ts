/** Foreigner or Thai National Park line. Cancel never bills this, for any agent. */
export function isNationalParkInvoiceLine(item: { lineKind?: string; description?: string }) {
  if (item.lineKind === 'park_fee') return true
  return /national park/i.test(item.description ?? '')
}
