import {
  documentProgram,
  parseAgentBillingType,
  prebuyDeductHeads,
  ratesForAgent,
  type AgencyInvoiceRates,
  type InvoiceDocument,
} from '@/lib/invoice'
import type { Program } from '@/lib/types'
import {
  listAgentAllotments,
  type AgentAllotment,
} from '@/lib/supabase/agent-allotment-db'
import {
  listAgentAllotmentDailyByAgent,
  upsertAgentAllotmentDaily,
} from '@/lib/supabase/agent-allotment-daily-db'
import { hasSupabaseConfig } from '@/lib/supabase/client'

export type PrebuyHeadBalance = {
  agentSlug: string
  purchased: number
  deducted: number
  remaining: number
}

export function purchasedHeadsFromAllotments(
  rows: AgentAllotment[],
  agentSlug: string,
  program: Program = 'PP',
) {
  return rows
    .filter((row) => row.agentSlug === agentSlug && row.program === program)
    .reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.seats) || 0)), 0)
}

export async function loadPrebuyHeadBalance(
  agentSlug: string,
  program: Program = 'PP',
): Promise<PrebuyHeadBalance | null> {
  if (!hasSupabaseConfig() || !agentSlug) return null
  try {
    const [allotments, daily] = await Promise.all([
      listAgentAllotments(),
      listAgentAllotmentDailyByAgent(agentSlug),
    ])
    const purchased = purchasedHeadsFromAllotments(allotments, agentSlug, program)
    const deducted = daily
      .filter((row) => row.program === program)
      .reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.totalDeduct) || 0)), 0)
    return {
      agentSlug,
      purchased,
      deducted,
      remaining: purchased - deducted,
    }
  } catch {
    return null
  }
}

/**
 * After a Prebuy invoice is saved, add its deduct heads into allotment daily
 * by travel date. Never lowers an existing daily total (manual deduct stays).
 */
export async function syncPrebuyDeductFromInvoice(
  doc: InvoiceDocument,
  rates: AgencyInvoiceRates[],
): Promise<{ ok: boolean; message?: string }> {
  if (doc.kind !== 'invoice') return { ok: true }
  const billing = parseAgentBillingType(ratesForAgent(rates, doc.agentSlug).billingType)
  if (billing !== 'prebuy') return { ok: true }
  if (!hasSupabaseConfig()) return { ok: true }

  const heads = prebuyDeductHeads(doc.items)
  if (heads <= 0) return { ok: true }

  const byDate = new Map<string, number>()
  for (const item of doc.items) {
    if (
      item.lineKind !== 'tour' &&
      item.lineKind !== 'no_show' &&
      item.lineKind !== 'change_date'
    ) {
      continue
    }
    const day = (item.travelDate || doc.issueDate || '').slice(0, 10)
    if (!day) continue
    const lineHeads = Math.max(0, item.adults) + Math.max(0, item.children)
    if (lineHeads <= 0) continue
    byDate.set(day, (byDate.get(day) ?? 0) + lineHeads)
  }
  if (byDate.size === 0) return { ok: true }
  const program = documentProgram(doc) ?? 'PP'

  try {
    const existing = await listAgentAllotmentDailyByAgent(doc.agentSlug)
    const balance = await loadPrebuyHeadBalance(doc.agentSlug, program)
    for (const [day, addHeads] of byDate) {
      const row = existing.find((item) => item.day === day && item.program === program)
      const current = row?.totalDeduct ?? 0
      const noteParts = [row?.note?.trim() || '', `INV ${doc.number} +${addHeads}`]
        .filter(Boolean)
        .join(' · ')
      const alreadyNoted = (row?.note ?? '').includes(`INV ${doc.number}`)
      if (alreadyNoted) continue
      await upsertAgentAllotmentDaily({
        day,
        agentSlug: doc.agentSlug,
        agentName: doc.agentName,
        program,
        totalDeduct: current + addHeads,
        note: noteParts.slice(0, 240),
      })
    }
    if (balance && balance.remaining < heads) {
      return {
        ok: true,
        message: `Prebuy warning: ${doc.agentName} remaining ${balance.remaining} heads, invoice deducts ${heads}.`,
      }
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
