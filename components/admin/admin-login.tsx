'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ADMIN_USERNAME = 'admin'
const ADMIN_PIN = '1234'

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState(ADMIN_USERNAME)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const pinRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    pinRef.current?.focus()
  }, [])

  function trySignIn(nextUsername: string, nextPin: string) {
    const nameOk = nextUsername.trim().toLowerCase() === ADMIN_USERNAME
    const pinOk = nextPin === ADMIN_PIN
    if (!nameOk || !pinOk) {
      setError('PIN is incorrect.')
      setPin('')
      requestAnimationFrame(() => pinRef.current?.focus())
      return
    }
    setError('')
    onSuccess()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    trySignIn(username, pin)
  }

  function handlePinChange(value: string) {
    const nextPin = value.replace(/\D/g, '').slice(0, 4)
    setPin(nextPin)
    if (error) setError('')
    if (nextPin.length === 4) {
      trySignIn(username, nextPin)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.14),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(14,116,144,0.1),_transparent_45%)]" />
      <div className="gday-grid pointer-events-none absolute inset-0 opacity-40" />

      <header className="relative mx-auto flex h-16 w-full max-w-md items-center px-4 sm:px-6">
        <BrandMark />
      </header>

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        <form
          onSubmit={handleSubmit}
          className="gday-fade-up rounded-3xl border border-teal-900/8 bg-white/90 p-6 shadow-[0_20px_50px_-28px_rgba(13,148,136,0.45)] backdrop-blur-sm sm:p-8"
        >
          <div className="mb-6 flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-700 to-cyan-800 text-white shadow-md shadow-teal-800/20">
            <Shield className="size-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
            Admin sign in
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-teal-950/55">
            Enter the 4-digit PIN to open the operations dashboard.
          </p>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-username">Username</Label>
              <Input
                id="admin-username"
                autoComplete="username"
                value={username}
                readOnly
                onChange={(event) => setUsername(event.target.value)}
                className="h-11 bg-teal-50/60 text-teal-900/70"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-pin">PIN</Label>
              <Input
                ref={pinRef}
                id="admin-pin"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={4}
                value={pin}
                onChange={(event) => handlePinChange(event.target.value)}
                placeholder="••••"
                className="h-11 tracking-[0.35em]"
              />
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="mt-6 h-11 w-full">
            Sign in
          </Button>
        </form>

        <Link
          href="/"
          className="gday-fade-up delay-100 mt-6 inline-flex items-center gap-2 self-start text-sm text-teal-800/70 transition-colors hover:text-teal-950"
        >
          <ArrowLeft className="size-4" />
          Back to portal
        </Link>
      </main>
    </div>
  )
}
