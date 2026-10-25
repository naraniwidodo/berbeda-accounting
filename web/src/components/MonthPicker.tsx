import { MONTHS } from '../lib/reports'

/**
 * Narrows a statement to one month.
 *
 * `null` means the whole year — all twelve columns plus year to date, which
 * is the default. Picking a month shows that column alone, which is the only
 * way the table is readable on a laptop.
 */
export default function MonthPicker({
  month,
  onChange,
  year,
}: {
  month: number | null
  onChange: (m: number | null) => void
  year: number
}) {
  return (
    <label className="month-picker">
      <span>Show</span>
      <select
        value={month === null ? 'all' : String(month)}
        onChange={(e) => onChange(e.target.value === 'all' ? null : Number(e.target.value))}
      >
        <option value="all">Full year</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={i}>
            {m} {year}
          </option>
        ))}
      </select>
    </label>
  )
}
