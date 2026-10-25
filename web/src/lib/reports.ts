/**
 * Statement data, fetched from the API.
 *
 * The P&L and the Balance Sheet are computed on the server from the journal,
 * so there is no second implementation here to drift from it - only the
 * fetching, and the formatting that is purely presentational.
 */

import { useEffect, useState } from 'react'
import {
  fetchBalanceSheet,
  fetchPnl,
  fetchYears,
  type BalanceSheet,
  type PnL,
  type StatementRow,
} from './api'

export type { BalanceSheet, PnL, RowKind, StatementRow } from './api'

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** Accounting style: negatives in brackets, zero as an em dash. */
export function fmt(n: number): string {
  if (!n) return '—'
  const s = Math.abs(Math.round(n)).toLocaleString('en-US')
  return n < 0 ? `(${s})` : s
}

export function rowValue(rows: StatementRow[], label: string, index = 12): number {
  return rows.find((r) => r.label === label)?.values?.[index] ?? 0
}

/** "2026" for the whole year, "Mar 2026" for one month. */
export function periodName(year: number, month: number | null): string {
  return month === null ? String(year) : `${MONTHS[month]} ${year}`
}

/** The column a selection reads from: a month, or year-to-date. */
export const columnFor = (month: number | null): number => (month === null ? 12 : month)

interface Async<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/** Years present in the journal; falls back to this one while loading. */
export function useYears(): number[] {
  const [years, setYears] = useState<number[]>([new Date().getFullYear()])
  useEffect(() => {
    fetchYears()
      .then((d) => d.years.length && setYears(d.years))
      .catch(() => {})
  }, [])
  return years
}

function useStatement<T>(load: (year: number) => Promise<T>, year: number, nonce: number): Async<T> {
  const [state, setState] = useState<Async<T>>({ data: null, loading: true, error: null })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true }))
    load(year)
      .then((d) => live && setState({ data: d, loading: false, error: null }))
      .catch((e) => live && setState({ data: null, loading: false, error: (e as Error).message }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, nonce])
  return state
}

export const usePnl = (year: number, nonce = 0) => useStatement<PnL>(fetchPnl, year, nonce)
export const useBalanceSheet = (year: number, nonce = 0) =>
  useStatement<BalanceSheet>(fetchBalanceSheet, year, nonce)
