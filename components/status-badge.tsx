import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function StatusBadge({
  status,
}: {
  status: 'Confirmed' | 'Pending Pickup Time' | 'Active' | 'Inactive'
}) {
  const styles = {
    Confirmed: 'border-emerald-200/80 bg-emerald-50 text-emerald-800',
    'Pending Pickup Time': 'border-amber-200/80 bg-amber-50 text-amber-800',
    Active: 'border-emerald-200/80 bg-emerald-50 text-emerald-800',
    Inactive: 'border-teal-900/10 bg-teal-950/[0.04] text-teal-900/50',
  }[status]

  return (
    <Badge
      variant="outline"
      className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-tight', styles)}
    >
      {status}
    </Badge>
  )
}
