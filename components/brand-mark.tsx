import { BRAND_LEGAL, BRAND_SHORT } from '@/lib/brand'
import { cn } from '@/lib/utils'

type BrandMarkVariant = 'portal' | 'company'

/**
 * `portal` — short product mark for nav / app chrome (Gday).
 * `company` — legal issuer name for vouchers and printed documents.
 */
export function BrandMark({
  className,
  light = false,
  variant = 'portal',
}: {
  className?: string
  light?: boolean
  variant?: BrandMarkVariant
}) {
  const isCompany = variant === 'company'

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn(
          'relative flex size-9 shrink-0 items-center justify-center rounded-2xl text-[14px] font-semibold tracking-tight',
          light
            ? 'bg-white/18 text-white ring-1 ring-white/20'
            : 'bg-gradient-to-br from-sky-400 via-teal-500 to-cyan-700 text-white shadow-md shadow-teal-600/30',
        )}
      >
        <span className="relative z-10">G</span>
        {!light ? (
          <span className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.4),transparent_55%)]" />
        ) : null}
      </div>
      <div className="min-w-0 leading-tight">
        <div
          className={cn(
            'font-display font-semibold tracking-tight',
            isCompany ? 'text-[13px] sm:text-[14px]' : 'text-[15px]',
            light ? 'text-white' : 'text-teal-950',
          )}
        >
          {isCompany ? BRAND_LEGAL : BRAND_SHORT}
        </div>
        <div className={cn('text-[11px]', light ? 'text-white/70' : 'text-teal-800/55')}>
          {isCompany ? 'Tour operator' : 'Partner Portal'}
        </div>
      </div>
    </div>
  )
}
