export type DriverRosterEntry = {
  name: string
  phone: string
  plate: string
}

export const DEFAULT_DRIVERS: DriverRosterEntry[] = [
  { name: 'พี่กุ๊กไก่', plate: '31-7558', phone: '092-8393294' },
  { name: 'พี่เอ็น', plate: '31-8773', phone: '0980421384' },
  { name: 'พี่มนัส', plate: '31-1643', phone: '092-3360029' },
  { name: 'พี่แขก', plate: '31-7558', phone: '0989038477' },
  { name: 'NAN', plate: '31-5873', phone: '098-8645905' },
  { name: 'YOT', plate: '31-8515', phone: '093-5796656' },
  { name: 'นน', plate: '30-1440', phone: '0629754977' },
]

const STORAGE_KEY = 'gday-driver-roster'
const RECENT_STORAGE_KEY = 'gday-driver-recent'
const REMOVED_STORAGE_KEY = 'gday-driver-removed'
export const RECENT_DRIVER_LIMIT = 7

export function normalizeDriverName(name: string) {
  return name.trim()
}

export function driverNameKey(name: string) {
  return normalizeDriverName(name).toLowerCase()
}

export function findDriver(roster: DriverRosterEntry[], name: string) {
  const key = driverNameKey(name)
  if (!key) return null
  return roster.find((driver) => driverNameKey(driver.name) === key) ?? null
}

export function driverContactLabel(driver: DriverRosterEntry) {
  const phone = driver.phone.trim()
  const plate = driver.plate.trim()
  if (!phone && !plate) return ''
  return [phone || 'No telephone', plate || 'No plate'].join(' · ')
}

export function loadRemovedDriverKeys(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(REMOVED_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => (typeof item === 'string' ? driverNameKey(item) : ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

export function rememberDriverRemoval(name: string) {
  if (typeof window === 'undefined') return
  const key = driverNameKey(name)
  if (!key) return
  const next = [key, ...loadRemovedDriverKeys().filter((item) => item !== key)]
  window.localStorage.setItem(REMOVED_STORAGE_KEY, JSON.stringify(next))
  forgetRecentDriver(name)
}

export function clearDriverRemoval(name: string) {
  if (typeof window === 'undefined') return
  const key = driverNameKey(name)
  if (!key) return
  const next = loadRemovedDriverKeys().filter((item) => item !== key)
  window.localStorage.setItem(REMOVED_STORAGE_KEY, JSON.stringify(next))
}

export function mergeDriverRoster(saved: DriverRosterEntry[]): DriverRosterEntry[] {
  const removed = new Set(loadRemovedDriverKeys())
  const byName = new Map<string, DriverRosterEntry>()
  for (const driver of saved) {
    const name = normalizeDriverName(driver.name)
    if (!name) continue
    const key = driverNameKey(name)
    if (removed.has(key)) continue
    byName.set(key, {
      name,
      phone: driver.phone.trim(),
      plate: driver.plate.trim(),
    })
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'))
}

export function loadLocalDrivers(): DriverRosterEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as Partial<DriverRosterEntry>
      const name = normalizeDriverName(String(row.name ?? ''))
      if (!name) return []
      return [
        {
          name,
          phone: String(row.phone ?? '').trim(),
          plate: String(row.plate ?? '').trim(),
        },
      ]
    })
  } catch {
    return []
  }
}

export function saveLocalDrivers(list: DriverRosterEntry[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mergeDriverRoster(list)))
}

export function loadRecentDriverKeys(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => (typeof item === 'string' ? driverNameKey(item) : ''))
      .filter(Boolean)
      .slice(0, RECENT_DRIVER_LIMIT)
  } catch {
    return []
  }
}

export function recordRecentDriver(name: string) {
  if (typeof window === 'undefined') return
  const key = driverNameKey(name)
  if (!key) return
  const prev = loadRecentDriverKeys().filter((item) => item !== key)
  const next = [key, ...prev].slice(0, RECENT_DRIVER_LIMIT)
  window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next))
}

export function forgetRecentDriver(name: string) {
  if (typeof window === 'undefined') return
  const key = driverNameKey(name)
  if (!key) return
  const next = loadRecentDriverKeys().filter((item) => item !== key)
  window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next))
}

export function pickRecentDrivers(
  roster: DriverRosterEntry[],
  options?: { limit?: number; pinName?: string },
): DriverRosterEntry[] {
  const limit = options?.limit ?? RECENT_DRIVER_LIMIT
  const picked: DriverRosterEntry[] = []
  const seen = new Set<string>()

  const add = (driver: DriverRosterEntry | null | undefined) => {
    if (!driver || picked.length >= limit) return
    const key = driverNameKey(driver.name)
    if (seen.has(key)) return
    seen.add(key)
    picked.push(driver)
  }

  if (options?.pinName?.trim()) {
    add(findDriver(roster, options.pinName))
  }

  for (const key of loadRecentDriverKeys()) {
    if (picked.length >= limit) break
    add(roster.find((row) => driverNameKey(row.name) === key))
  }

  for (const driver of roster) {
    if (picked.length >= limit) break
    add(driver)
  }

  return picked
}
