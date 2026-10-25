import { useState } from 'react'
import type { Format, Period } from '../lib/excel'
import { periodLabel } from '../lib/excel'

/**
 * Period and format picker beside a download button.
 *
 * `onDownload` returns how many rows were written, so an empty period says so
 * rather than handing over a file with nothing in it.
 */
export default function DownloadBar({
  periods,
  onDownload,
  label = 'Download',
  disabled,
}: {
  periods?: Period[]
  onDownload: (period: Period, format: Format) => number | void
  label?: string
  disabled?: boolean
}) {
  const [period, setPeriod] = useState<Period>(periods?.[0] ?? 'all')
  const [format, setFormat] = useState<Format>('xlsx')
  const [note, setNote] = useState('')

  function run() {
    const written = onDownload(period, format)
    if (written === 0) {
      setNote(`Nothing posted in ${periodLabel(period)}`)
      window.setTimeout(() => setNote(''), 3200)
    }
  }

  return (
    <div className="download-bar">
      {periods && (
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          aria-label="Period to download"
        >
          {periods.map((p) => (
            <option key={p} value={p}>
              {periodLabel(p)}
            </option>
          ))}
        </select>
      )}

      <div className="seg">
        <button className={format === 'xlsx' ? 'on' : ''} onClick={() => setFormat('xlsx')}>
          Excel
        </button>
        <button className={format === 'csv' ? 'on' : ''} onClick={() => setFormat('csv')}>
          CSV
        </button>
      </div>

      <button className="btn ghost sm" disabled={disabled} onClick={run}>
        {label}
      </button>

      {note && <span className="download-note">{note}</span>}
    </div>
  )
}
