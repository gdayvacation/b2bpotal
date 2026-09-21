'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useRef, useState } from 'react'
import { todayISO } from '@/lib/format'

/**
 * Live Thailand calendar date (Asia/Bangkok).
 * Rolls at midnight Bangkok — e.g. 23:50 on 20 Sep stays 20 Sep;
 * 00:10 on 21 Sep becomes 21 Sep.
 */
export function usePortalTodayISO(): string {
  const [today, setToday] = useState(() => todayISO())

  useEffect(() => {
    const sync = () => {
      const next = todayISO()
      setToday((prev) => (prev === next ? prev : next))
    }
    sync()
    const id = window.setInterval(sync, 15_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', sync)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', sync)
    }
  }, [])

  return today
}

/**
 * Default working date for ops screens (check-in, job orders, vans, boats, lists).
 * Opens on Thailand "today". If the user is still on the previous ops day when
 * Bangkok midnight passes, the selection rolls forward automatically.
 */
export function usePortalDefaultDateISO(): [
  string,
  Dispatch<SetStateAction<string>>,
  string,
] {
  const today = usePortalTodayISO()
  const [selectedDate, setSelectedDate] = useState(today)
  const prevTodayRef = useRef(today)

  useEffect(() => {
    if (today === prevTodayRef.current) return
    const previousToday = prevTodayRef.current
    prevTodayRef.current = today
    setSelectedDate((current) => (current === previousToday ? today : current))
  }, [today])

  return [selectedDate, setSelectedDate, today]
}
