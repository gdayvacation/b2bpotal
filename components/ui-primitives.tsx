import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="gday-soft-label mb-1.5 flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-full bg-gradient-to-r from-sky-400 to-teal-500" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-teal-950 sm:text-[1.85rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-teal-950/55">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Surface({
  children,
  className,
  ...props
}: {
  children: ReactNode
  className?: string
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('gday-sheet rounded-[1.35rem]', className)} {...props}>
      {children}
    </div>
  )
}

export function SoftLabel({
  children,
  className,
  htmlFor,
}: {
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  if (htmlFor) {
    return (
      <label htmlFor={htmlFor} className={cn('gday-soft-label', className)}>
        {children}
      </label>
    )
  }
  return <p className={cn('gday-soft-label', className)}>{children}</p>
}

export function SegmentedControl({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-teal-900/8 bg-gradient-to-r from-teal-950/[0.04] via-sky-950/[0.03] to-amber-950/[0.03] p-1',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Segment({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl px-3.5 py-2 text-sm font-medium transition-all',
        active
          ? 'bg-gradient-to-br from-teal-700 to-cyan-700 text-white shadow-md shadow-teal-700/20'
          : 'text-teal-900/55 hover:bg-white/70 hover:text-teal-950',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('px-4 py-12 text-center text-sm text-teal-900/45', className)}>{children}</p>
  )
}
