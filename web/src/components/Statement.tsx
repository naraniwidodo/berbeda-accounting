import { MONTHS, fmt, type StatementRow } from '../lib/reports'
import { useLock, isMonthLocked } from '../lib/lock'

export default function Statement({
  rows,
  year,
  month = null,
}: {
  rows: StatementRow[]
  year: number
  /** null shows the whole year; a 0-based index shows that month alone. */
  month?: number | null
}) {
  const lock = useLock()
  const closed = MONTHS.map((_, i) => isMonthLocked(year, i, lock))

  // which value columns to draw: every month plus YTD, or just the one
  const columns = month === null ? [...MONTHS.map((_, i) => i), 12] : [month]
  const heading = (i: number) => (i === 12 ? 'YTD' : MONTHS[i])

  return (
    <div className="table-wrap">
      <table className="stmt">
        <thead>
          <tr>
            <th style={{ minWidth: 220 }}></th>
            {columns.map((i) => (
              <th
                key={i}
                className={`num${i < 12 && closed[i] ? ' closed' : ''}`}
                title={i < 12 && closed[i] ? 'Closed period' : undefined}
              >
                {heading(i)}
                {i < 12 && closed[i] && (
                  <span className="lock-glyph" aria-label="closed">
                    ·
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            if (r.kind === 'spacer') {
              return (
                <tr className="spacer" key={i}>
                  <td colSpan={columns.length + 1} />
                </tr>
              )
            }
            return (
              <tr className={r.kind} key={i}>
                <td>{r.label}</td>
                {columns.map((j) => {
                  const v = r.values?.[j] ?? 0
                  return (
                    <td
                      key={j}
                      className={`num${v < 0 ? ' neg' : ''}${j < 12 && closed[j] ? ' closed' : ''}`}
                    >
                      {fmt(v)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
