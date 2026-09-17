import Link from 'next/link'
import { ArrowRight, Link2, Shield } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.14),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(14,116,144,0.1),_transparent_45%)]" />
      <div className="gday-grid pointer-events-none absolute inset-0 opacity-40" />

      <header className="relative mx-auto flex h-16 w-full max-w-4xl items-center px-4 sm:px-6">
        <BrandMark />
      </header>

      <main className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        <h1 className="font-display gday-fade-up text-center text-3xl font-semibold tracking-tight text-teal-950 sm:text-4xl">
          Gday Partner Portal
        </h1>

        <div className="gday-fade-up mt-8 grid gap-4 delay-100 sm:mt-10 sm:grid-cols-2">
          <section className="rounded-3xl border border-teal-900/8 bg-white/85 p-5 shadow-[0_20px_50px_-28px_rgba(13,148,136,0.45)] backdrop-blur-sm sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-teal-700 text-white">
                <Link2 className="size-5" />
              </div>
              <h2 className="font-display text-lg font-semibold text-teal-950">Agent</h2>
            </div>
            <p className="text-sm leading-relaxed text-teal-950/55">
              Open the private booking link sent by Gday admin. Each agency has its own URL.
            </p>
          </section>

          <Link
            href="/admin"
            className="flex flex-col justify-between rounded-3xl border border-transparent bg-gradient-to-br from-teal-800 to-cyan-900 p-5 text-white shadow-[0_20px_50px_-28px_rgba(15,118,110,0.7)] transition-transform hover:-translate-y-0.5 sm:p-6"
          >
            <div>
              <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-white/15">
                <Shield className="size-5" />
              </div>
              <h2 className="font-display text-lg font-semibold">Admin</h2>
              <p className="mt-1 text-sm text-teal-50/70">Operations dashboard</p>
            </div>
            <div className="mt-8 inline-flex items-center gap-2 text-sm font-medium">
              Open Admin
              <ArrowRight className="size-4" />
            </div>
          </Link>
        </div>
      </main>
    </div>
  )
}
