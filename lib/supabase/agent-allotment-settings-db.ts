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
}

type SettingsRow = {
  agent_slug: string
  program?: string | null
  deduct_children: boolean | null
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
  const { error } = await supabase.from('agent_allotment_settings').upsert(
    {
      agent_slug: input.agentSlug.trim(),
      program: input.program === 'James Bond' ? 'James Bond' : 'PP',
      deduct_children: input.deductChildren,
    },
    { onConflict: 'agent_slug,program' },
  )
  if (error) throw new Error(error.message)
}
