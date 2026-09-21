import { boatTheme } from '@/lib/boat-theme'
import { cn } from '@/lib/utils'

/** Compact colored fleet number (7 / 8 / 9 …) for tables & reports. */
export function BoatFleetBadge({
  boat,
  className,
  showColorName = false,
}: {
  boat: number | null | undefined
  className?: string
  showColorName?: boolean
}) {
  if (!boat || boat < 1) {
    return <span className={cn('text-teal-900/40', className)}>—</span>
  }
  const theme = boatTheme(boat)
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
        theme.softBadge,
        className,
      )}
      title={`Boat ${theme.fleetNumber} · ${theme.colorName}`}
    >
      <span className={cn('size-1.5 rounded-full', theme.swatch)} aria-hidden />
      {theme.fleetNumber}
      {showColorName ? (
        <span className="font-medium tracking-wide uppercase opacity-80">{theme.colorName}</span>
      ) : null}
    </span>
  )
}
