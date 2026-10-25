import { useState } from 'react'
import { useJournal } from '../lib/store'
import {
  useLock,
  setPassword,
  lockThrough,
  unlock,
  periodLabel,
  lockablePeriods,
} from '../lib/lock'

/**
 * One control, shown on both statement pages.
 *
 * It locks the period rather than the statement, so the P&L and the Balance
 * Sheet are always closed together.
 */
export default function LockPanel() {
  const { entries } = useJournal().data
  const lock = useLock()

  const periods = lockablePeriods(entries.map((e) => e.date))
  const [period, setPeriod] = useState(periods[periods.length - 1])
  const [open, setOpen] = useState<null | 'lock' | 'unlock' | 'create'>(null)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const locked = lock.lockedThrough !== null

  function close() {
    setOpen(null)
    setPw('')
    setPw2('')
    setNote('')
    setErr('')
  }

  async function doCreate() {
    if (pw.length < 4) return setErr('Use at least 4 characters')
    if (pw !== pw2) return setErr('The two entries do not match')
    setBusy(true)
    try {
      await setPassword(pw)
    } catch (e) {
      setBusy(false)
      return setErr((e as Error).message)
    }
    setBusy(false)
    setPw('')
    setPw2('')
    setErr('')
    setOpen('lock')
  }

  async function doLock() {
    setBusy(true)
    try {
      await lockThrough(period, note.trim() || undefined)
      close()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function doUnlock() {
    setBusy(true)
    try {
      // the server checks the password; a wrong one comes back 401
      await unlock(pw, note.trim() || undefined)
      close()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lockbar">
      <div className="lockbar-main">
        <span className={`pill ${locked ? 'locked' : 'open'}`}>
          <span className="dot" />
          {locked ? `Locked through ${periodLabel(lock.lockedThrough)}` : 'Period open'}
        </span>
        <span className="lockbar-hint">
          {locked
            ? 'Nothing dated in a closed period can be posted or cancelled, so these figures cannot move.'
            : 'Both statements close together — the Balance Sheet carries net income from the P&L.'}
        </span>
      </div>

      {locked ? (
        <button className="btn ghost sm" onClick={() => setOpen('unlock')}>
          Unlock
        </button>
      ) : (
        <button
          className="btn sm"
          disabled={!entries.length}
          onClick={() => setOpen(lock.hasPassword ? 'lock' : 'create')}
        >
          Lock period
        </button>
      )}

      {open === 'create' && (
        <div className="lock-form">
          <p className="lock-title">Set an unlock password</p>
          <p className="lock-sub">
            For one user this is a speed bump, not security — it makes reopening closed books a
            deliberate act. Every lock and unlock is recorded below either way.
          </p>
          <div className="lock-fields">
            <input
              type="password"
              value={pw}
              placeholder="Password"
              onChange={(e) => setPw(e.target.value)}
            />
            <input
              type="password"
              value={pw2}
              placeholder="Repeat"
              onChange={(e) => setPw2(e.target.value)}
            />
          </div>
          {err && <p className="lock-err">{err}</p>}
          <div className="actions">
            <button className="btn sm" disabled={busy} onClick={doCreate}>
              Save password
            </button>
            <button className="btn ghost sm" onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {open === 'lock' && (
        <div className="lock-form">
          <p className="lock-title">Close the books through</p>
          <div className="lock-fields">
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {periodLabel(p)}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={note}
              placeholder="Reason (optional)"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <p className="lock-sub">
            Entries dated on or before {periodLabel(period)} can no longer be posted or
            cancelled.
          </p>
          <div className="actions">
            <button className="btn sm" disabled={busy} onClick={doLock}>
              Lock
            </button>
            <button className="btn ghost sm" onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {open === 'unlock' && (
        <div className="lock-form">
          <p className="lock-title">Reopen {periodLabel(lock.lockedThrough)} and earlier</p>
          <div className="lock-fields">
            <input
              type="password"
              value={pw}
              placeholder="Password"
              autoFocus
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doUnlock()}
            />
            <input
              type="text"
              value={note}
              placeholder="Why (optional, but recorded)"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {err && <p className="lock-err">{err}</p>}
          <div className="actions">
            <button className="btn rust sm" disabled={busy || !pw} onClick={doUnlock}>
              Unlock
            </button>
            <button className="btn ghost sm" onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {lock.log.length > 0 && (
        <details className="lock-log">
          <summary>Lock history · {lock.log.length}</summary>
          <ul>
            {[...lock.log].reverse().map((ev, i) => (
              <li key={i}>
                <span className={`lock-act ${ev.action}`}>{ev.action.replace('-', ' ')}</span>
                <span>{ev.period ? periodLabel(ev.period) : '—'}</span>
                <span className="lock-when">{new Date(ev.at).toLocaleString()}</span>
                {ev.note && <span className="lock-why">“{ev.note}”</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
