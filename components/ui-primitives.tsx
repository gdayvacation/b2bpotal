import type { ReactNode } from 'react'
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
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-teal-700/55 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950 sm:text-[28px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-teal-950/55">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  )
}

export function Surface({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-teal-900/8 bg-white/90 shadow-[0_12px_40px_-28px_rgba(15,118,110,0.35)] backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}
