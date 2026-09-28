'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BRAND_SHORT } from '@/lib/brand'
import { signUpPortalUser } from '@/lib/supabase/portal-users-db'

export function SignUpForm() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signUpPortalUser({ email, name, company })
      setDone(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign up.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gday-app relative flex flex-col overflow-hidden">
      <div className="gday-grid pointer-events-none absolute inset-0 opacity-45" />

      <header className="relative mx-auto flex h-16 w-full max-w-md items-center px-4 sm:px-6">
        <BrandMark />
      </header>

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        {done ? (
          <div className="gday-fade-up gday-sheet rounded-[1.6rem] p-6 sm:p-8">
            <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-700 text-white shadow-md shadow-teal-800/25">
              <Mail className="size-5" />
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
              Sign-up received
            </h1>
            <p className="mt-1.5 text-[15px] leading-relaxed text-teal-950/55">
              {BRAND_SHORT} admin will set your User ID and password. Use those to sign in — the
              agent booking link is not open yet.
            </p>
            <Link
              href="/signin"
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-teal-800 text-base font-medium text-white shadow-sm shadow-teal-800/20 transition-colors hover:bg-teal-700"
            >
              Go to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="gday-fade-up gday-sheet rounded-[1.6rem] p-6 sm:p-8">
            <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-700 text-white shadow-md shadow-teal-800/25">
              <Mail className="size-5" />
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
              Sign up
            </h1>
            <p className="mt-1.5 text-[15px] leading-relaxed text-teal-950/55">
              Register with your email. Admin will arrange your User ID and password from the
              back office.
            </p>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    if (error) setError('')
                  }}
                  placeholder="you@agency.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-name">Your name</Label>
                <Input
                  id="signup-name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-company">Company</Label>
                <Input
                  id="signup-company"
                  autoComplete="organization"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            {error ? (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={busy} className="mt-6 h-12 w-full rounded-xl text-base">
              {busy ? 'Sending…' : 'Sign up with email'}
            </Button>

            <p className="mt-4 text-center text-sm text-teal-900/55">
              Already have a User ID?{' '}
              <Link href="/signin" className="font-semibold text-teal-800 hover:text-teal-950">
                Sign in
              </Link>
            </p>
          </form>
        )}

        <Link
          href="/"
          className="gday-fade-up delay-100 mt-6 inline-flex items-center gap-2 self-start text-sm font-medium text-teal-800/70 transition-colors hover:text-teal-950"
        >
          <ArrowLeft className="size-4" />
          Back to portal
        </Link>
      </main>
    </div>
  )
}
