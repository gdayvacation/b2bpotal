/** Turn workbook bytes into compact text for Gemini spreadsheet import. */
export async function spreadsheetBufferToAiText(buffer: ArrayBuffer, maxRowsPerSheet = 120) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array', raw: false })
  const chunks: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][]
    const slice = rows.slice(0, maxRowsPerSheet)
    chunks.push(`### Sheet: ${sheetName}`)
    slice.forEach((row, index) => {
      if (!Array.isArray(row)) return
      const cells = row.map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim())
      if (cells.every((c) => !c)) return
      chunks.push(`${index + 1}\t${cells.join('\t')}`)
    })
    chunks.push('')
  }

  return chunks.join('\n').slice(0, 48_000)
}
