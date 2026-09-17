import Link from 'next/link'
import { BrandMark } from '@/components/brand-mark'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f7f5] px-4 text-center">
      <BrandMark />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-500">
        This agent link or screen is not part of the prototype.
      </p>
      <Link href="/" className="mt-6 text-sm font-medium underline">
        Back to home
      </Link>
    </div>
  )
}
