import { useNavigate } from 'react-router-dom'
import { useJournal, liveEntries } from '../lib/store'
import { useBalanceSheet, useYears } from '../lib/reports'
import { useLock, periodLabel } from '../lib/lock'

/* Small brand-coloured marks for each tile - cheerful, flat, no gradients. */

function ClientArt() {
  return (
    <svg viewBox="0 0 120 96" width="100%" height="104" aria-hidden>
      <rect x="22" y="14" width="76" height="68" rx="8" fill="#fff" stroke="#025e73" strokeWidth="2.5" />
      <circle cx="46" cy="40" r="11" fill="#95cfbb" />
      <path d="M31 64c0-8 7-13 15-13s15 5 15 13" fill="none" stroke="#025e73" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="70" y1="34" x2="90" y2="34" stroke="#ead9a6" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="70" y1="46" x2="90" y2="46" stroke="#ead9a6" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="70" y1="58" x2="82" y2="58" stroke="#ead9a6" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="90" cy="70" r="12" fill="#0a9294" />
      <path d="M85 70l3.5 3.5L95 67" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function JournalArt() {
  return (
    <svg viewBox="0 0 120 96" width="100%" height="104" aria-hidden>
      <rect x="18" y="10" width="74" height="76" rx="7" fill="#ffffff" stroke="#0a9294" strokeWidth="2.5" />
      <rect x="18" y="10" width="74" height="16" rx="7" fill="#0a9294" />
      <rect x="18" y="19" width="74" height="7" fill="#0a9294" />
      <line x1="30" y1="40" x2="62" y2="40" stroke="#025e73" strokeWidth="3" strokeLinecap="round" />
      <line x1="30" y1="53" x2="78" y2="53" stroke="#95cfbb" strokeWidth="3" strokeLinecap="round" />
      <line x1="30" y1="66" x2="54" y2="66" stroke="#95cfbb" strokeWidth="3" strokeLinecap="round" />
      <circle cx="90" cy="68" r="15" fill="#f09d02" />
      <line x1="90" y1="61" x2="90" y2="75" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <line x1="83" y1="68" x2="97" y2="68" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function PnlArt() {
  return (
    <svg viewBox="0 0 120 96" width="100%" height="104" aria-hidden>
      <line x1="16" y1="80" x2="104" y2="80" stroke="#e8e4db" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="24" y="52" width="15" height="28" rx="3.5" fill="#95cfbb" />
      <rect x="45" y="38" width="15" height="42" rx="3.5" fill="#0a9294" />
      <rect x="66" y="58" width="15" height="22" rx="3.5" fill="#ead9a6" />
      <rect x="87" y="26" width="15" height="54" rx="3.5" fill="#bc3f17" />
      <path d="M26 44 L52 30 L73 40 L98 14" fill="none" stroke="#025e73" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="98" cy="14" r="5" fill="#f09d02" stroke="#fff" strokeWidth="2.5" />
    </svg>
  )
}

function BalanceArt() {
  return (
    <svg viewBox="0 0 120 96" width="100%" height="104" aria-hidden>
      <line x1="60" y1="18" x2="60" y2="82" stroke="#025e73" strokeWidth="3" strokeLinecap="round" />
      <line x1="26" y1="30" x2="94" y2="30" stroke="#025e73" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="18" r="5.5" fill="#f09d02" />
      <path d="M12 30 L26 56 L40 30 Z" fill="#0a9294" opacity=".92" />
      <path d="M80 30 L94 56 L108 30 Z" fill="#bc3f17" opacity=".92" />
      <line x1="26" y1="30" x2="26" y2="40" stroke="#025e73" strokeWidth="2.5" />
      <line x1="94" y1="30" x2="94" y2="40" stroke="#025e73" strokeWidth="2.5" />
      <rect x="44" y="78" width="32" height="7" rx="3.5" fill="#ead9a6" />
    </svg>
  )
}

const TILES = [
  {
    n: '01',
    to: '/clients',
    color: '#025e73',
    title: 'Client Registration',
    blurb:
      'Register every project before journalling it. A settlement can only find its deposit if both name the same project.',
    art: <ClientArt />,
  },
  {
    n: '02',
    to: '/journal',
    color: '#0a9294',
    title: 'Journal Entries',
    blurb: 'Pick what happened, enter the amount. The debits and credits are written for you.',
    art: <JournalArt />,
  },
  {
    n: '03',
    to: '/pnl',
    color: '#bc3f17',
    title: 'Profit & Loss',
    blurb: 'Revenue through to EBIT, by month and year to date.',
    art: <PnlArt />,
  },
  {
    n: '04',
    to: '/balance-sheet',
    color: '#f09d02',
    title: 'Balance Sheet',
    blurb: 'Assets, liabilities and equity — with net income carried into retained earnings.',
    art: <BalanceArt />,
  },
]

export default function Home() {
  const nav = useNavigate()
  const journal = useJournal()
  const { entries, openPrepayment: openDp } = journal.data
  const years = useYears()
  const year = years[0]
  const { data: bs } = useBalanceSheet(year, entries.length)
  const inBalance = bs?.balanced[12] ?? true
  const openCount = Object.keys(openDp).length
  const lock = useLock()
  const live = liveEntries(entries)
  const cancelled = entries.length - live.length

  return (
    <main className="page">
      <div className="tiles">
        {TILES.map((t) => (
          <button key={t.to} className="tile" onClick={() => nav(t.to)}>
            <div className="tile-swatch" style={{ background: t.color }} />
            <div className="tile-num">{t.n}</div>
            <div className="tile-art">{t.art}</div>
            <h2>{t.title}</h2>
            <p>{t.blurb}</p>
            <span className="tile-go" style={{ color: t.color }}>
              Open →
            </span>
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 22 }}>
        <div className="card-head">
          <h3>Where the book stands</h3>
          <div className="actions">
            <span className={`pill ${lock.lockedThrough ? 'locked' : 'open'}`}>
              <span className="dot" />
              {lock.lockedThrough ? `Locked through ${periodLabel(lock.lockedThrough)}` : 'Period open'}
            </span>
            <span className={`pill ${inBalance ? 'good' : 'bad'}`}>
              <span className="dot" />
              {inBalance ? 'In balance' : 'Out of balance'}
            </span>
          </div>
        </div>
        <div className="card-body">
          {journal.error && (
            <div className="note" style={{ marginTop: 0, marginBottom: 14 }}>
              <strong>The accounting API is not answering.</strong> {journal.error}
            </div>
          )}
          <div className="stat-row" style={{ marginBottom: 0 }}>
            <div className="stat">
              <div className="k">Entries counting</div>
              <div className="v">{live.length}</div>
            </div>
            <div className="stat">
              <div className="k">Cancelled</div>
              <div className="v" style={{ color: cancelled ? 'var(--rust)' : undefined }}>
                {cancelled}
              </div>
            </div>
            <div className="stat">
              <div className="k">Open down payments</div>
              <div className="v" style={{ color: openCount ? 'var(--rust)' : undefined }}>
                {openCount}
              </div>
            </div>
            <div className="stat">
              <div className="k">Period</div>
              <div className="v">{year}</div>
            </div>
          </div>
          {openCount > 0 && (
            <div className="note">
              {openCount === 1 ? 'One SKU has' : `${openCount} SKUs have`} a down payment still
              open: {Object.keys(openDp).join(', ')}. Post <strong>A4 · Final settlement</strong>{' '}
              to clear {openCount === 1 ? 'it' : 'them'} — the clearing line is filled in for you.
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
