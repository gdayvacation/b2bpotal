'use client'

import { useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowRight, KeyRound, Landmark, Mail, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BRAND_SHORT } from '@/lib/brand'
import { loginStaff, type StaffRole } from '@/lib/staff-auth'
import { cn } from '@/lib/utils'

export function HomePortal() {
  return (
    <div className="gday-fade-up mt-8 space-y-8 delay-100 sm:mt-10">
      <section>
        <p className="gday-soft-label mb-3">Partners</p>
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <Link
            href="/signup"
            className="gday-scale-in group flex flex-col justify-between rounded-[1.5rem] bg-white/80 p-5 shadow-[0_18px_40px_-28px_rgba(15,118,110,0.35)] ring-1 ring-teal-900/8 transition-transform active:scale-[0.99] sm:p-6"
          >
            <div>
              <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-teal-950/[0.05] text-teal-800">
                <Mail className="size-5" />
              </div>
              <h2 className="font-display text-lg font-semibold text-teal-950">Sign up</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-teal-950/55">
                Register with your email. {BRAND_SHORT} admin will set your User ID and password.
              </p>
            </div>
            <div className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-teal-800">
              Sign up with email
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>

          <Link
            href="/signin"
            className="gday-scale-in group flex flex-col justify-between rounded-[1.5rem] bg-white/80 p-5 shadow-[0_18px_40px_-28px_rgba(15,118,110,0.35)] ring-1 ring-teal-900/8 transition-transform active:scale-[0.99] sm:p-6"
          >
            <div>
              <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-teal-950/[0.05] text-teal-800">
                <KeyRound className="size-5" />
              </div>
              <h2 className="font-display text-lg font-semibold text-teal-950">Sign in</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-teal-950/55">
                Use the User ID and password from {BRAND_SHORT} admin.
              </p>
            </div>
            <div className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-teal-800">
              Sign in
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        </div>
      </section>

      <section>
        <p className="gday-soft-label mb-3">Quick access</p>
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <PasscodeCard
            id="admin"
            title="Admin"
            hint="Operations dashboard"
            href="/admin"
            icon={Shield}
            tone="teal"
            role="admin"
          />
          <PasscodeCard
            id="accounting"
            title="Accounting / บัญชี"
            hint="Invoices and receipts"
            href="/accounting"
            icon={Landmark}
            tone="amber"
            role="accounting"
          />
        </div>
      </section>
    </div>
  )
}

function PasscodeCard({
  id,
  title,
  hint,
  href,
  icon: Icon,
  tone,
  role,
}: {
  id: string
  title: string
  hint: string
  href: string
  icon: typeof Shield
  tone: 'teal' | 'amber'
  role: StaffRole
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)
  const teal = tone === 'teal'

  async function unlock(nextPin: string) {
    if (!nextPin || busy) return
    setBusy(true)
    setError('')
    try {
      await loginStaff(role, nextPin)
      window.location.assign(href)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PIN is incorrect.')
      setPin('')
      requestAnimationFrame(() => pinRef.current?.focus())
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void unlock(pin)
  }

  function handlePinChange(value: string) {
    const nextPin = value.replace(/\D/g, '').slice(0, 4)
    setPin(nextPin)
    if (error) setError('')
    if (nextPin.length === 4) void unlock(nextPin)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'gday-scale-in flex flex-col justify-between rounded-[1.5rem] p-5 text-white sm:p-6',
        teal
          ? 'bg-gradient-to-br from-teal-700 via-teal-800 to-cyan-900 shadow-[0_20px_50px_-28px_rgba(15,118,110,0.75)]'
          : 'bg-gradient-to-br from-amber-500 via-orange-600 to-stone-800 shadow-[0_20px_50px_-28px_rgba(194,65,12,0.7)]',
      )}
    >
      <div>
        <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/15">
          <Icon className="size-5" />
        </div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className={cn('mt-1 text-sm', teal ? 'text-teal-50/70' : 'text-amber-50/75')}>{hint}</p>
      </div>

      <div className="mt-6">
        <label htmlFor={`${id}-pin`} className="sr-only">
          {title} PIN
        </label>
        <input
          ref={pinRef}
          id={`${id}-pin`}
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          value={pin}
          onChange={(event) => handlePinChange(event.target.value)}
          placeholder="Passcode"
          className="h-12 w-full rounded-xl border-0 bg-white/15 px-3.5 text-center text-base tracking-[0.35em] text-white outline-none ring-1 ring-white/20 placeholder:tracking-normal placeholder:text-white/45 focus-visible:ring-2 focus-visible:ring-white/55"
        />
        {error ? <p className="mt-2 text-sm text-red-100">{error}</p> : null}
        <Button
          type="submit"
          disabled={busy}
          className="mt-3 h-11 w-full rounded-xl bg-white/15 text-white ring-1 ring-white/15 hover:bg-white/25"
        >
          {busy ? 'Opening…' : 'Open'}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </form>
  )
}
