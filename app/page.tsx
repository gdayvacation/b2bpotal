import Link from 'next/link'
import { ArrowRight, Link2, Shield } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'

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
            Gday
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-teal-950/55">
            Partner portal for agents and operations — book tours, confirm pickups, run the daily board.
          </p>
        </div>

        <div className="gday-fade-up mt-8 grid gap-3 delay-100 sm:mt-10 sm:grid-cols-2 sm:gap-4">
          <section className="gday-sheet rounded-[1.5rem] p-5 sm:p-6">
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-teal-950/[0.05] text-teal-800">
              <Link2 className="size-5" />
            </div>
            <h2 className="font-display text-lg font-semibold text-teal-950">Agent</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-teal-950/55">
              Open the private booking link from Gday admin. Each agency has its own URL.
            </p>
          </section>

          <Link
            href="/admin"
            className="gday-scale-in group flex flex-col justify-between rounded-[1.5rem] bg-gradient-to-br from-teal-700 via-teal-800 to-cyan-900 p-5 text-white shadow-[0_20px_50px_-28px_rgba(15,118,110,0.75)] transition-transform active:scale-[0.99] sm:p-6"
          >
            <div>
              <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/15">
                <Shield className="size-5" />
              </div>
              <h2 className="font-display text-lg font-semibold">Admin</h2>
              <p className="mt-1 text-sm text-teal-50/70">Operations dashboard</p>
            </div>
            <div className="mt-8 inline-flex items-center gap-2 text-sm font-semibold">
              Open Admin
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        </div>
      </main>
    </div>
  )
}
