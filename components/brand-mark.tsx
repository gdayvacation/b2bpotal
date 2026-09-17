import { cn } from '@/lib/utils'

export function BrandMark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn(
          'relative flex size-9 items-center justify-center rounded-2xl text-[14px] font-semibold tracking-tight',
          light
            ? 'bg-white/18 text-white ring-1 ring-white/20'
            : 'bg-gradient-to-br from-teal-500 via-teal-600 to-cyan-700 text-white shadow-md shadow-teal-700/25',
        )}
      >
        <span className="relative z-10">G</span>
        {!light ? (
          <span className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.35),transparent_55%)]" />
        ) : null}
      </div>
      <div className="leading-tight">
        <div
          className={cn(
            'font-display text-[15px] font-semibold tracking-tight',
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
