/**
 * Period lock state, backed by the API.
 *
 * The lock is enforced on the server - a closed period refuses posting and
 * cancellation there, so the greyed-out buttons here are a courtesy rather
 * than the control.
 */

import { useEffect, useSyncExternalStore } from 'react'
import {
  fetchLock,
  lockPeriod as apiLock,
  setLockPassword as apiSetPassword,
  unlockPeriod as apiUnlock,
  type LockState,
} from './api'

export type { LockEvent, LockState } from './api'

const EMPTY: LockState = { lockedThrough: null, hasPassword: false, log: [] }

let state: LockState = EMPTY
let started = false
const listeners = new Set<() => void>()

function set(next: LockState) {
  state = next
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export async function refreshLock(): Promise<void> {
  try {
    set(await fetchLock())
  } catch {
    /* the lock bar simply shows "period open" until the API answers */
  }
}

export function useLock(): LockState {
  useEffect(() => {
    if (started) return
    started = true
    void refreshLock()
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  )
}

export async function setPassword(password: string) {
  set(await apiSetPassword(password))
}

export async function lockThrough(period: string, note?: string) {
  set(await apiLock(period, note))
}

/** Reopens the period. The server checks the password; a wrong one throws. */
export async function unlock(password: string, note?: string) {
  set(await apiUnlock(password, note))
}

/* ── queries ───────────────────────────────────────────────────────────── */

export function isDateLocked(date: string, s: LockState = state): boolean {
  if (!s.lockedThrough || !date) return false
  return date.slice(0, 7) <= s.lockedThrough
}

export function isMonthLocked(year: number, month: number, s: LockState = state): boolean {
  if (!s.lockedThrough) return false
  return `${year}-${String(month + 1).padStart(2, '0')}` <= s.lockedThrough
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function periodLabel(period: string | null): string {
  if (!period) return '—'
  const [y, m] = period.split('-')
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`
}

/** Months offered in the lock picker: everything the journal touches, plus now. */
export function lockablePeriods(dates: string[]): string[] {
  const set = new Set<string>(dates.map((d) => d.slice(0, 7)).filter(Boolean))
  set.add(new Date().toISOString().slice(0, 7))
  return [...set].sort()
}
