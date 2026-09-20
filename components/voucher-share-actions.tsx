'use client'

import { useState } from 'react'
import { Check, Copy, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function voucherUrl(slug: string, code: string) {
  if (typeof window === 'undefined') return `/agent/${slug}/voucher/${code}`
  return `${window.location.origin}/agent/${slug}/voucher/${code}`
}

export function VoucherShareActions({
  slug,
  code,
  className,
  size = 'default',
}: {
  slug: string
  code: string
  guestName?: string
  className?: string
  size?: 'default' | 'sm'
}) {
  const [copied, setCopied] = useState(false)
  const url = voucherUrl(slug, code)
  const printUrl = `${url}?print=1`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copy voucher link:', url)
    }
  }

  const btnClass =
    size === 'sm'
      ? 'h-8 shrink-0 gap-1 rounded-lg px-2 text-xs'
      : 'h-10 gap-1.5 rounded-xl px-3.5'

  return (
    <div className={cn('flex flex-nowrap items-center gap-1.5', className)}>
      <Button
        type="button"
        variant="outline"
        className={btnClass}
        onClick={() => {
          window.open(printUrl, '_blank', 'noopener,noreferrer')
        }}
      >
        <Printer className="size-3.5" />
        Print
      </Button>
      <Button type="button" variant="outline" className={btnClass} onClick={() => void copyLink()}>
        {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  )
}
