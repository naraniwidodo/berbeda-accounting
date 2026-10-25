/**
 * Downloads - Excel and CSV.
 *
 * The Journal sheet matches the column layout of the source workbook, so
 * exported entries drop straight into the existing process. Statement sheets
 * are written from whatever the API returned, not recomputed here.
 *
 * Cancelled entries are kept in the file and marked, rather than filtered
 * out. A ledger that quietly omits them would not reconcile against the app,
 * and the gap in the numbering would look like a missing entry.
 */

import * as XLSX from 'xlsx'
import type { BalanceSheet, JournalEntry, PnL, StatementRow } from './api'
import { sortedEntries } from './store'
import { MONTHS } from './reports'

/**
 * The source workbook's ten columns, in its order, followed by the two
 * reference fields the purchase registers carry (`NO. INVOICE` and
 * `NAMA VENDOR`). Appending rather than inserting keeps anything keyed to the
 * original column positions working.
 */
const JOURNAL_HEADER = [
  'Date', 'Month', 'Year', 'Transaction Details', 'Transaction Numbers',
  'Rp', 'Debit/Credit', 'COA', 'Details', 'Remarks',
  'Invoice No', 'Source of Payment',
]

type Cell = string | number | null
type Rows = Cell[][]

function journalRows(entries: JournalEntry[]): Rows {
  const rows: Rows = [JOURNAL_HEADER]
  for (const e of sortedEntries(entries)) {
    for (const ln of e.lines) {
      rows.push([
        e.date,
        Number(e.date.slice(5, 7)),
        Number(e.date.slice(0, 4)),
        e.sku || null,
        e.transactionNo || null,
        ln.amount,
        ln.side,
        ln.account,
        ln.detail,
        e.cancelled ? `CANCELLED — ${e.voidReason ?? ''}`.trim() : (e.note || e.templateLabel),
        e.invoiceNo ?? null,
        e.paymentSource ?? null,
      ])
    }
  }
  return rows
}

function statementRows(title: string, rows: StatementRow[], month: number | null): Rows {
  // one column when a month is selected, so the file matches what is on screen
  const columns = month === null ? [...MONTHS.map((_, i) => i), 12] : [month]
  const heading = (i: number) => (i === 12 ? 'YTD' : MONTHS[i])

  const out: Rows = [[title], ['', ...columns.map(heading)]]
  for (const r of rows) {
    if (r.kind === 'spacer') {
      out.push([])
      continue
    }
    out.push([
      r.kind === 'detail' ? `    ${r.label}` : r.label,
      ...columns.map((i) => r.values?.[i] ?? 0),
    ])
  }
  return out
}

function autoWidth(rows: Rows): XLSX.ColInfo[] {
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = cell == null ? 0 : String(cell).length
      widths[i] = Math.max(widths[i] ?? 8, Math.min(len + 2, 34))
    })
  }
  return widths.map((w) => ({ wch: w }))
}

function addSheet(wb: XLSX.WorkBook, name: string, rows: Rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = autoWidth(rows)
  XLSX.utils.book_append_sheet(wb, ws, name)
}

const stamp = () => new Date().toISOString().slice(0, 10)

/* ── period ────────────────────────────────────────────────────────────── */

/** "all", a year ("2026"), or a month ("2026-10"). */
export type Period = string

export function periodLabel(period: Period): string {
  if (period === 'all') return 'All periods'
  if (period.length === 4) return period
  const [y, m] = period.split('-')
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`
}

/** Periods present in the journal: every year, and every month inside it. */
export function periodsIn(entries: JournalEntry[]): Period[] {
  const years = new Set<string>()
  const months = new Set<string>()
  for (const e of entries) {
    if (!e.date) continue
    years.add(e.date.slice(0, 4))
    months.add(e.date.slice(0, 7))
  }
  const out: Period[] = ['all']
  for (const y of [...years].sort().reverse()) {
    out.push(y)
    for (const m of [...months].filter((m) => m.startsWith(y)).sort().reverse()) out.push(m)
  }
  return out
}

export function filterByPeriod(entries: JournalEntry[], period: Period): JournalEntry[] {
  if (period === 'all') return entries
  return entries.filter((e) => e.date?.startsWith(period))
}

/* ── writing a file ────────────────────────────────────────────────────── */

export type Format = 'xlsx' | 'csv'

function downloadCsv(rows: Rows, filename: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  // a BOM so Excel opens UTF-8 correctly instead of mangling the rupiah text
  const csv = '\uFEFF' + XLSX.utils.sheet_to_csv(ws)
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function slug(period: Period): string {
  return period === 'all' ? 'all' : period.replace('-', '')
}

/**
 * The journal for a period, in the source workbook's ten columns.
 *
 * Returns how many entries went into the file, so the caller can say
 * "nothing in that period" rather than handing over an empty download.
 */
export function exportJournal(
  entries: JournalEntry[],
  period: Period = 'all',
  format: Format = 'xlsx',
): number {
  const scoped = sortedEntries(filterByPeriod(entries, period))
  if (!scoped.length) return 0

  const rows = journalRows(scoped)
  const name = `berbeda_journal_${slug(period)}_${stamp()}`

  if (format === 'csv') downloadCsv(rows, `${name}.csv`)
  else {
    const wb = XLSX.utils.book_new()
    addSheet(wb, 'Journal', rows)
    XLSX.writeFile(wb, `${name}.xlsx`)
  }
  return scoped.length
}

export function exportStatement(
  year: number,
  which: 'pnl' | 'bs',
  data: PnL | BalanceSheet,
  format: Format = 'xlsx',
  month: number | null = null,
) {
  const period = month === null ? String(year) : `${MONTHS[month]} ${year}`
  const title = which === 'pnl' ? `Profit & Loss ${period}` : `Balance Sheet ${period}`
  const rows = statementRows(title, data.rows, month)
  const slugged = month === null ? String(year) : `${year}${String(month + 1).padStart(2, '0')}`
  const name = `berbeda_${which === 'pnl' ? 'pnl' : 'balance_sheet'}_${slugged}_${stamp()}`

  if (format === 'csv') downloadCsv(rows, `${name}.csv`)
  else {
    const wb = XLSX.utils.book_new()
    addSheet(wb, which === 'pnl' ? 'P&L' : 'Balance Sheet', rows)
    XLSX.writeFile(wb, `${name}.xlsx`)
  }
}
