'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarClock, ChevronRight, KeyRound, MapPin, Users } from 'lucide-react'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { cn } from '@/lib/utils'

export const SETTINGS_PAGES = [
  {
    href: '/admin/availability',
    label: 'Availability',
    hint: 'Boat seats, close dates, and cutoffs',
    icon: CalendarClock,
    tone: 'bg-amber-100 text-amber-700',
  },
  {
    href: '/admin/agents',
    label: 'Agents',
    hint: 'Agent names and booking links',
    icon: Users,
    tone: 'bg-emerald-100 text-emerald-700',
  },
  {
    href: '/admin/users',
    label: 'Users',
    hint: 'Partner User IDs and passwords',
    icon: KeyRound,
    tone: 'bg-sky-100 text-sky-700',
  },
  {
    href: '/admin/pickup-zones',
    label: 'Pickup Zones',
    hint: 'Hotels, zones, and pickup times',
    icon: MapPin,
    tone: 'bg-rose-100 text-rose-700',
  },
] as const

export function SettingsSubnav() {
  const pathname = usePathname()
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {SETTINGS_PAGES.map((item) => {
        const active = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-teal-800 text-white shadow-sm'
                : 'bg-white/80 text-teal-900/65 ring-1 ring-teal-900/8 hover:bg-white hover:text-teal-950',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}

export function AdminSettings() {
  return (
    <div className="w-full">
      <PageHeader
        title="Settings"
        description="Tap a section to manage availability, agents, users, or pickup zones."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SETTINGS_PAGES.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} className="group block">
              <Surface className="h-full p-5 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
                <span className={cn('inline-flex size-10 items-center justify-center rounded-2xl', item.tone)}>
                  <Icon className="size-5" />
                </span>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-teal-950">{item.label}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-teal-900/55">{item.hint}</p>
                  </div>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-teal-900/25 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-800" />
                </div>
              </Surface>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
