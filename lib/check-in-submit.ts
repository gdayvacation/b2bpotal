/** The phone was not signed in as the guest, so the save never reached the database. */
export const CHECK_IN_SESSION_ERROR = 'CHECK_IN_SESSION'

/** The save did not finish. The guest can tap again; do not send a second write automatically. */
export const CHECK_IN_RETRY_ERROR = 'CHECK_IN_RETRY'

export function checkInSaveFailure(message: string): 'missing' | 'session' | 'retry' {
  if (
    /could not find the function/i.test(message) ||
    /schema cache/i.test(message) ||
    /PGRST202/i.test(message)
  ) {
    return 'missing'
  }
  if (
    /permission denied/i.test(message) ||
    /\bjwt\b/i.test(message) ||
    /not authenticated/i.test(message) ||
    /invalid claim/i.test(message) ||
    /row-level security/i.test(message) ||
    /42501/.test(message)
  ) {
    return 'session'
  }
  return 'retry'
}
