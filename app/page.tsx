import { BrandMark } from '@/components/brand-mark'
import { HomePortal } from '@/components/home-portal'
import { BRAND_LEGAL, BRAND_SHORT } from '@/lib/brand'

export default function HomePage() {
  return (
    <div className="gday-app relative flex flex-col overflow-hidden">
      <div className="gday-grid pointer-events-none absolute inset-0 opacity-50" />

      <header className="relative mx-auto flex h-16 w-full max-w-3xl items-center px-4 sm:px-6">
        <BrandMark />
      </header>

      <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        <div className="gday-fade-up text-center">
          <p className="gday-soft-label mb-3">B2B tour bookings</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-teal-950 sm:text-5xl">
            {BRAND_SHORT}
          </h1>
          <p className="mt-2 text-sm font-medium text-teal-900/45">{BRAND_LEGAL}</p>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-teal-950/55">
            Partner portal for agents and operations — book tours, confirm pickups, run the daily board.
          </p>
        </div>

        <HomePortal />
      </main>
    </div>
  )
}
