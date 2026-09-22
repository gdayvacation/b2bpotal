/** Editable Bangkok Insurance policy number for marina guest lists. */

export const INSURANCE_POLICY_STORAGE_KEY = 'gday-insurance-policy-number'

export const DEFAULT_INSURANCE_POLICY_NUMBER = '726-16017-67'

export function loadInsurancePolicyNumber(): string {
  if (typeof window === 'undefined') return DEFAULT_INSURANCE_POLICY_NUMBER
  try {
    const raw = window.localStorage.getItem(INSURANCE_POLICY_STORAGE_KEY)
    const value = String(raw ?? '').trim()
    return value || DEFAULT_INSURANCE_POLICY_NUMBER
  } catch {
    return DEFAULT_INSURANCE_POLICY_NUMBER
  }
}

export function saveInsurancePolicyNumber(value: string) {
  if (typeof window === 'undefined') return
  try {
    const next = value.trim() || DEFAULT_INSURANCE_POLICY_NUMBER
    window.localStorage.setItem(INSURANCE_POLICY_STORAGE_KEY, next)
  } catch {
    // ignore quota / private mode
  }
}
