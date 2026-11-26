import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'
import type { Program } from '@/lib/types'

/**
 * How one agent's allotment deducts heads.
 * deductChildren true  -> adults and children both come off the head count (default).
 * deductChildren false -> only adults come off. Children stay on the daily sheet as
 *                         "invoiced" because the agent pays them on a separate invoice.
 */
export type AgentAllotmentSettings = {
  agentSlug: string
  program: Program
  deductChildren: boolean
  /** Trip heads sheet + separate prepaid cash sheet (park fees, extras). */
  splitPrepaidLedger: boolean
}

type SettingsRow = {
  agent_slug: string
  program?: string | null
  deduct_children: boolean | null
  split_prepaid_ledger?: boolean | null
}

export const DEFAULT_DEDUCT_CHILDREN = true

function requireSupabase() {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase is not configured.')
  }
  return getSupabaseBrowserClient()
}

function mapRow(row: SettingsRow): AgentAllotmentSettings {
  return {
    agentSlug: row.agent_slug,
    program: row.program === 'James Bond' ? 'James Bond' : 'PP',
    deductChildren: row.deduct_children !== false,
    splitPrepaidLedger: row.split_prepaid_ledger === true,
  }
}

export function settingsKey(agentSlug: string, program: Program) {
  return `${program}|${agentSlug}`
}

export async function listAgentAllotmentSettings(): Promise<AgentAllotmentSettings[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.from('agent_allotment_settings').select('*')
  if (error) throw new Error(error.message)
  return ((data ?? []) as SettingsRow[]).map(mapRow)
}

/** Whether this agent's children come off the head count. No saved setup means yes. */
export function deductsChildren(
  settings: AgentAllotmentSettings[],
  agentSlug: string,
  program: Program,
) {
  const found = settings.find((row) => row.agentSlug === agentSlug && row.program === program)
  return found ? found.deductChildren : DEFAULT_DEDUCT_CHILDREN
}

export function splitPrepaidLedger(
  settings: AgentAllotmentSettings[],
  agentSlug: string,
  program: Program,
) {
  const found = settings.find((row) => row.agentSlug === agentSlug && row.program === program)
  return found?.splitPrepaidLedger === true
}

/** Rocket Bird and agents with setup flag use two allotment tables. */
export function agentUsesSplitPrepaidLedger(
  settings: AgentAllotmentSettings[],
  agentSlug: string,
  program: Program,
  agentName?: string,
) {
  const slug = agentSlug.trim().toLowerCase()
  const name = (agentName ?? '').trim()
  if (slug.includes('rocket') && slug.includes('bird')) return true
  if (/^rocket\s+bird$/i.test(name)) return true
  return splitPrepaidLedger(settings, agentSlug, program)
}

/** One-agent lookup for code outside React. Falls back to deduct everyone if it cannot load. */
export async function loadDeductChildren(
  agentSlug: string,
  program: Program = 'PP',
): Promise<boolean> {
  if (!hasSupabaseConfig() || !agentSlug) return DEFAULT_DEDUCT_CHILDREN
  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('agent_allotment_settings')
      .select('deduct_children')
      .eq('agent_slug', agentSlug)
      .eq('program', program)
      .maybeSingle()
    if (error || !data) return DEFAULT_DEDUCT_CHILDREN
    return (data as { deduct_children: boolean | null }).deduct_children !== false
  } catch {
    return DEFAULT_DEDUCT_CHILDREN
  }
}

export async function saveAgentAllotmentSettings(input: AgentAllotmentSettings): Promise<void> {
  const supabase = requireSupabase()
  const payload = {
    agent_slug: input.agentSlug.trim(),
    program: input.program === 'James Bond' ? 'James Bond' : 'PP',
    deduct_children: input.deductChildren,
    split_prepaid_ledger: input.splitPrepaidLedger === true,
  }
  const { error } = await supabase.from('agent_allotment_settings').upsert(payload, {
    onConflict: 'agent_slug,program',
  })
  if (error && /split_prepaid|schema cache|column/i.test(error.message)) {
    const { split_prepaid_ledger: _split, ...base } = payload
    const retry = await supabase.from('agent_allotment_settings').upsert(base, {
      onConflict: 'agent_slug,program',
    })
    if (retry.error) throw new Error(retry.error.message)
    if (input.splitPrepaidLedger) {
      throw new Error(
        'Run supabase/add-agent-allotment-split-prepaid.sql in Supabase, then save again to store the split-table flag.',
      )
    }
    return
  }
  if (error) throw new Error(error.message)
}
