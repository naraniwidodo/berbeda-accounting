import { useEffect, useRef, useState } from 'react'

const R = 8
const CIRCUMFERENCE = 2 * Math.PI * R

/**
 * A short window to take back an entry just posted.
 *
 * Undo *cancels* the entry - it does not erase it. Nothing in this app
 * deletes, so the row stays with its reason recorded and its transaction
 * number spent. That is the honest behaviour for a ledger, and the wording
 * here says so rather than implying the entry vanishes.
 */
export default function Undo({
  transactionNo,
  seconds = 6,
  onUndo,
  onExpire,
  busy,
}: {
  transactionNo: string
  seconds?: number
  onUndo: () => void
  onExpire: () => void
  busy?: boolean
}) {
  const [left, setLeft] = useState(seconds)
  const expire = useRef(onExpire)
  expire.current = onExpire

  useEffect(() => {
    setLeft(seconds)
    const tick = window.setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          window.clearInterval(tick)
          expire.current()
          return 0
        }
        return n - 1
      })
    }, 1000)
    return () => window.clearInterval(tick)
  }, [transactionNo, seconds])

  return (
    <div className="undo" role="status">
      <span className="undo-timer" aria-hidden>
        <svg viewBox="0 0 20 20" width="20" height="20">
          <circle className="track" cx="10" cy="10" r={R} />
          <circle
            className="run"
            cx="10"
            cy="10"
            r={R}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - left / seconds)}
            strokeLinecap="round"
          />
        </svg>
      </span>

      <span className="undo-text">
        Posted <strong>{transactionNo}</strong>
      </span>

      <button className="btn ghost sm" onClick={onUndo} disabled={busy}>
        {busy ? 'Undoing…' : `Undo (${left}s)`}
      </button>
    </div>
  )
}
