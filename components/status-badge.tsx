import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function StatusBadge({
  status,
}: {
  status: 'Confirmed' | 'Pending Pickup Time' | 'Active' | 'Inactive'
}) {
  const styles = {
    Confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    'Pending Pickup Time': 'border-amber-200 bg-amber-50 text-amber-700',
    Active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    Inactive: 'border-neutral-200 bg-neutral-50 text-neutral-500',
  }[status]

  return (
    <Badge variant="outline" className={cn('rounded-full font-medium', styles)}>
      {status}
    </Badge>
  )
}
