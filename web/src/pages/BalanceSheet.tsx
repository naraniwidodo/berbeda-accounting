import { useState } from 'react'
import { columnFor, fmt, periodName, useBalanceSheet, useYears } from '../lib/reports'
import { useJournal } from '../lib/store'
import { exportStatement, type Format, type Period } from '../lib/excel'
import DownloadBar from '../components/DownloadBar'
import Statement from '../components/Statement'
import YearPicker from '../components/YearPicker'
import MonthPicker from '../components/MonthPicker'
import LockPanel from '../components/LockPanel'

export default function BalanceSheetPage() {
  const years = useYears()
  const [picked, setPicked] = useState<number | null>(null)
  const [month, setMonth] = useState<number | null>(null)
  const year = picked ?? years[0]
  const col = columnFor(month)
  const { entries } = useJournal().data
  const { data, loading, error } = useBalanceSheet(year, entries.length)

  const assets = data?.assets[col] ?? 0
  const liabEquity = data?.liabilitiesAndEquity[col] ?? 0
  const ok = data?.balanced[col] ?? true
  const diff = assets - liabEquity

  return (
    <main className="page">
      <div className="page-head">
        <h1>Balance Sheet</h1>
        <p>
          Closing balances by month. Net income carries into retained earnings, so this and
          the P&amp;L always describe the same period.
        </p>
      </div>

      <div className="toolbar">
        <YearPicker years={years} year={year} onChange={setPicked} />
        <MonthPicker month={month} onChange={setMonth} year={year} />
        <span className={`pill ${ok ? 'good' : 'bad'}`}>
          <span className="dot" />
          {ok ? 'Balanced' : `Out by ${fmt(Math.abs(diff))}`}
        </span>
        <div className="spacer" />
        <DownloadBar
          disabled={!data}
          label="Download"
          onDownload={(_p: Period, format: Format) => {
            if (data) exportStatement(year, 'bs', data, format, month)
          }}
        />
      </div>

      <LockPanel />

      <div className="stat-row">
        <div className="stat">
          <div className="k">Total Assets</div>
          <div className="v">{fmt(assets)}</div>
        </div>
        <div className="stat">
          <div className="k">Liabilities + Equity</div>
          <div className="v">{fmt(liabEquity)}</div>
        </div>
        <div className="stat">
          <div className="k">Difference</div>
          <div className={`v ${diff ? 'neg' : 'pos'}`}>{diff ? fmt(diff) : '0'}</div>
        </div>
        <div className="stat">
          <div className="k">Period</div>
          <div className="v" style={{ fontSize: 17 }}>{periodName(year, month)}</div>
        </div>
      </div>

      <div className="card">
        {error ? (
          <div className="empty">
            <strong>Could not load the statement</strong>
            {error}
          </div>
        ) : loading && !data ? (
          <div className="empty">Loading…</div>
        ) : !data || entries.length === 0 ? (
          <div className="empty">
            <strong>Nothing to report yet</strong>
            Post a journal entry and the statement fills in.
          </div>
        ) : (
          <Statement rows={data.rows} year={year} month={month} />
        )}
      </div>
    </main>
  )
}
