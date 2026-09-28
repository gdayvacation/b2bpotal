'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { writePortalSession } from '@/lib/portal-auth'
import { signInPortalUser } from '@/lib/supabase/portal-users-db'

export function SignInForm() {
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const session = await signInPortalUser({ userId, password })
      writePortalSession(session)
      window.location.replace('/account')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in.')
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
        <form onSubmit={handleSubmit} className="gday-fade-up gday-sheet rounded-[1.6rem] p-6 sm:p-8">
          <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-700 text-white shadow-md shadow-teal-800/25">
            <KeyRound className="size-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
            Sign in
          </h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-teal-950/55">
            Use the User ID and password from Gday admin.
          </p>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signin-user-id">User ID</Label>
              <Input
                id="signin-user-id"
                autoComplete="username"
                required
                value={userId}
                onChange={(event) => {
                  setUserId(event.target.value)
                  if (error) setError('')
                }}
                placeholder="Your User ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signin-password">Password</Label>
              <Input
                id="signin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (error) setError('')
                }}
              />
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={busy} className="mt-6 h-12 w-full rounded-xl text-base">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="mt-4 text-center text-sm text-teal-900/55">
            No login yet?{' '}
            <Link href="/signup" className="font-semibold text-teal-800 hover:text-teal-950">
              Sign up with email
            </Link>
          </p>
        </form>

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
