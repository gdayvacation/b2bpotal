import { cn } from '@/lib/utils'

export function BrandMark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn(
          'flex size-8 items-center justify-center rounded-xl text-[13px] font-semibold tracking-tight shadow-sm',
          light
            ? 'bg-white/20 text-white'
            : 'bg-gradient-to-br from-teal-600 to-cyan-700 text-white shadow-teal-700/20',
        )}
      >
        G
      </div>
      <div className="leading-tight">
        <div
          className={cn(
            'font-display text-sm font-semibold tracking-tight',
            light ? 'text-white' : 'text-teal-950',
          )}
        >
          Gday
        </div>
        <div className={cn('text-[11px]', light ? 'text-white/70' : 'text-teal-800/55')}>
          Partner Portal
        </div>
      </div>
    </div>
  )
}
