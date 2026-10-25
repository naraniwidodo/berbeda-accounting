import { useState } from 'react'
import { MONTHS, columnFor, fmt, rowValue, usePnl, useYears } from '../lib/reports'
import { useJournal } from '../lib/store'
import { exportStatement, type Format, type Period } from '../lib/excel'
import DownloadBar from '../components/DownloadBar'
import Statement from '../components/Statement'
import YearPicker from '../components/YearPicker'
import MonthPicker from '../components/MonthPicker'
import LockPanel from '../components/LockPanel'

export default function ProfitLoss() {
  const years = useYears()
  const [picked, setPicked] = useState<number | null>(null)
  const [month, setMonth] = useState<number | null>(null)
  const year = picked ?? years[0]
  const col = columnFor(month)
  const { entries } = useJournal().data
  const { data, loading, error } = usePnl(year, entries.length)

  const revenue = data ? rowValue(data.rows, 'Revenue', col) : 0
  const gross = data ? rowValue(data.rows, 'Gross Profit', col) : 0
  const ebitda = data ? rowValue(data.rows, 'EBITDA', col) : 0
  const margin = revenue ? Math.round((gross / revenue) * 100) : 0

  return (
    <main className="page">
      <div className="page-head">
        <h1>Profit &amp; Loss</h1>
        <p>
          Revenue through to EBIT, by month and year to date. Computed by the server from the
          journal — nothing here is stored separately.
        </p>
      </div>

      <div className="toolbar">
        <YearPicker years={years} year={year} onChange={setPicked} />
        <MonthPicker month={month} onChange={setMonth} year={year} />
        <div className="spacer" />
        <DownloadBar
          disabled={!data}
          label="Download"
          onDownload={(_p: Period, format: Format) => {
            if (data) exportStatement(year, 'pnl', data, format, month)
          }}
        />
      </div>

      <LockPanel />

      <div className="stat-row">
        <div className="stat">
          <div className="k">Revenue {month === null ? 'YTD' : MONTHS[month]}</div>
          <div className="v">{fmt(revenue)}</div>
        </div>
        <div className="stat">
          <div className="k">Gross Profit</div>
          <div className={`v ${gross < 0 ? 'neg' : ''}`}>{fmt(gross)}</div>
        </div>
        <div className="stat">
          <div className="k">Gross Margin</div>
          <div className="v">{revenue ? `${margin}%` : '—'}</div>
        </div>
        <div className="stat">
          <div className="k">EBITDA</div>
          <div className={`v ${ebitda < 0 ? 'neg' : ''}`}>{fmt(ebitda)}</div>
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
