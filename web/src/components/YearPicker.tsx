export default function YearPicker({
  years,
  year,
  onChange,
}: {
  years: number[]
  year: number
  onChange: (y: number) => void
}) {
  return (
    <div className="seg">
      {years.map((y) => (
        <button key={y} className={y === year ? 'on' : ''} onClick={() => onChange(y)}>
          {y}
        </button>
      ))}
    </div>
  )
}
