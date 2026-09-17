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
    <div className="gday-app relative flex flex-col overflow-hidden">
      <div className="gday-grid pointer-events-none absolute inset-0 opacity-45" />

      <header className="relative mx-auto flex h-16 w-full max-w-md items-center px-4 sm:px-6">
        <BrandMark />
      </header>

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        <form onSubmit={handleSubmit} className="gday-fade-up gday-sheet rounded-[1.6rem] p-6 sm:p-8">
          <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-700 text-white shadow-md shadow-teal-800/25">
            <Shield className="size-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
            Admin sign in
          </h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-teal-950/55">
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
                className="bg-teal-950/[0.03] text-teal-900/70"
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
                className="tracking-[0.4em]"
              />
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="mt-6 h-12 w-full rounded-xl text-base">
            Sign in
          </Button>
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
