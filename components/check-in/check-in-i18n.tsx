'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CHECK_IN_LANG_STORAGE_KEY,
  checkInText,
  normalizeCheckInLang,
  type CheckInCopyKey,
  type CheckInLang,
} from '@/lib/check-in-i18n'
import { cn } from '@/lib/utils'

type CheckInI18nValue = {
  lang: CheckInLang
  setLang: (lang: CheckInLang) => void
  t: (key: CheckInCopyKey, vars?: Record<string, string | number>) => string
}

const CheckInI18nContext = createContext<CheckInI18nValue | null>(null)

export function CheckInI18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<CheckInLang>('en')

  useEffect(() => {
    setLangState(normalizeCheckInLang(window.sessionStorage.getItem(CHECK_IN_LANG_STORAGE_KEY)))
  }, [])

  function setLang(next: CheckInLang) {
    setLangState(next)
    window.sessionStorage.setItem(CHECK_IN_LANG_STORAGE_KEY, next)
  }

  const value = useMemo<CheckInI18nValue>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => checkInText(lang, key, vars),
    }),
    [lang],
  )

  return <CheckInI18nContext.Provider value={value}>{children}</CheckInI18nContext.Provider>
}

export function useCheckInI18n() {
  const value = useContext(CheckInI18nContext)
  if (!value) {
    return {
      lang: 'en' as const,
      setLang: () => undefined,
      t: (key: CheckInCopyKey, vars?: Record<string, string | number>) =>
        checkInText('en', key, vars),
    }
  }
  return value
}

export function CheckInLanguageSwitch() {
  const { lang, setLang, t } = useCheckInI18n()
  return (
    <div
      role="group"
      aria-label={t('language')}
      className="inline-flex rounded-full bg-teal-950/[0.06] p-0.5"
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        className={cn(
          'rounded-full px-2.5 py-1 text-[11px] font-semibold',
          lang === 'en' ? 'bg-white text-teal-950 shadow-sm' : 'text-teal-900/50',
        )}
      >
        {t('english')}
      </button>
      <button
        type="button"
        onClick={() => setLang('hi')}
        className={cn(
          'rounded-full px-2.5 py-1 text-[11px] font-semibold',
          lang === 'hi' ? 'bg-white text-teal-950 shadow-sm' : 'text-teal-900/50',
        )}
      >
        {t('hindi')}
      </button>
    </div>
  )
}
