import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  TEMPLATES_BY_ID,
  SETTLEMENT,
  ACCOUNT_LIST,
  ACCOUNTS,
  groupedTemplates,
  detailOptions,
  render,
  validate,
  sumSide,
  PostingError,
  type JournalLine,
  type Side,
} from '../lib/engine'
import {
  useJournal,
  addEntry,
  cancelEntry,
  sortedEntries,
  prefixFor,
} from '../lib/store'
import { useLock, isDateLocked, periodLabel } from '../lib/lock'
import { useClients } from '../lib/clients'
import { exportJournal, periodsIn, type Format, type Period } from '../lib/excel'
import DownloadBar from '../components/DownloadBar'
import Undo from '../components/Undo'

const today = () => new Date().toISOString().slice(0, 10)

function groupNumber(n: number): string {
  return n ? n.toLocaleString('en-US') : ''
}

function MoneyInput({
  value,
  onChange,
  readOnly,
  placeholder,
}: {
  value: number
  onChange?: (n: number) => void
  readOnly?: boolean
  placeholder?: string
}) {
  return (
    <div className="money-input">
      <span>Rp</span>
      <input
        type="text"
        inputMode="numeric"
        readOnly={readOnly}
        value={groupNumber(value)}
        placeholder={placeholder ?? '0'}
        style={readOnly ? { background: 'var(--shell)', color: 'var(--text-soft)' } : undefined}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '')
          onChange?.(digits ? parseInt(digits, 10) : 0)
        }}
      />
    </div>
  )
}

interface ManualLine {
  side: Side
  account: string
  detail: string
  amount: number
}

const emptyManual = (): ManualLine[] => [
  { side: 'Dr', account: 'Cash/Bank', detail: '', amount: 0 },
  { side: 'Cr', account: 'Revenue', detail: 'Jasa Lukis', amount: 0 },
]

export default function JournalEntries() {
  const journal = useJournal()
  const { entries, openPrepayment: openDp, nextNumbers } = journal.data
  const { clients } = useClients()
  const groups = useMemo(() => groupedTemplates(), [])

  const [templateId, setTemplateId] = useState('A1')
  const [date, setDate] = useState(today())
  const [sku, setSku] = useState('')
  const [settlement, setSettlement] = useState('paid_now')
  const [detail, setDetail] = useState('')
  const [values, setValues] = useState<Record<string, number>>({})
  const [manual, setManual] = useState<ManualLine[]>(emptyManual)
  const [note, setNote] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [paymentSource, setPaymentSource] = useState('')
  const [flash, setFlash] = useState('')
  const [voiding, setVoiding] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState('')
  // the entry just posted, while the undo window is open
  const [undoable, setUndoable] = useState<{ id: string; no: string } | null>(null)
  const [undoing, setUndoing] = useState(false)

  const lock = useLock()

  const tpl = TEMPLATES_BY_ID[templateId]
  const details = useMemo(() => (tpl ? detailOptions(tpl) : []), [tpl])
  /**
   * Sources already used *for this kind of transaction*, so repeat suppliers
   * are a choice rather than a retype.
   *
   * Scoped by group on purpose: a marketplace is a sensible answer for a
   * purchase and a nonsensical one for remitting tax, so the two lists are
   * kept apart rather than pooled.
   */
  const knownSources = useMemo(() => {
    const group = tpl?.group
    const seen: string[] = []
    for (const e of [...entries].reverse()) {
      if (!e.paymentSource || seen.includes(e.paymentSource)) continue
      if (TEMPLATES_BY_ID[e.templateId]?.group !== group) continue
      seen.push(e.paymentSource)
    }
    return seen
  }, [entries, tpl])
  // the number is the server's to assign; this is only what it says is next
  const suggestedNo = nextNumbers[prefixFor(templateId)] ?? '—'

  function pickTemplate(id: string) {
    const next = TEMPLATES_BY_ID[id]
    setTemplateId(id)
    setValues({})
    setDetail(next?.detail_default ?? '')
    if (next?.settlement && !next.settlement.includes(settlement)) {
      setSettlement(next.settlement[0])
    }
  }

  const dpOpen = sku ? (openDp[sku] ?? 0) : 0

  /* ── preview ─────────────────────────────────────────────────────────── */

  const preview = useMemo((): { lines: JournalLine[]; warnings: string[]; error: string | null } => {
    if (!tpl) return { lines: [], warnings: [], error: 'Pick a transaction type' }

    if (tpl.manual) {
      const lines: JournalLine[] = manual
        .filter((l) => l.amount > 0 && l.account)
        .map((l) => ({
          side: l.side,
          account: l.account,
          detail: ACCOUNTS[l.account]?.details.length ? l.detail || null : null,
          amount: l.amount,
          auto: false,
        }))
      try {
        validate(lines)
        return { lines, warnings: ['Manual entry — flagged for review'], error: null }
      } catch (e) {
        return { lines, warnings: [], error: (e as Error).message }
      }
    }

    const vals: Record<string, number> = { ...values }
    if (tpl.context?.some((c) => c.name === 'dp_open')) vals.dp_open = dpOpen

    try {
      const { lines, warnings } = render(templateId, vals, { settlement, detail })
      return { lines, warnings, error: null }
    } catch (e) {
      const msg = e instanceof PostingError ? e.message : (e as Error).message
      return { lines: [], warnings: [], error: msg }
    }
  }, [tpl, templateId, values, settlement, detail, dpOpen, manual])

  const needsSku = tpl?.sku === 'required'
  const dateLocked = isDateLocked(date, lock)
  const canPost =
    !preview.error &&
    preview.lines.length > 0 &&
    !!date &&
    !dateLocked &&
    (!needsSku || !!sku.trim())

  async function post() {
    if (!canPost || !tpl || busy) return
    setBusy(true)
    setServerError('')
    try {
      // the server renders the entry again from the same template and refuses
      // it if it does not balance - this request carries inputs, not lines
      const { entry } = await addEntry({
        template_id: templateId,
        date,
        values,
        settlement: tpl.settlement ? settlement : null,
        detail: detail || null,
        sku: sku.trim(),
        note: note.trim() || null,
        invoice_no: invoiceNo.trim() || null,
        payment_source: paymentSource.trim() || null,
        // a manual template has no posting rule, so its lines travel with the
        // request; the server validates them exactly as it validates a
        // rendered entry
        ...(tpl.manual
          ? {
              lines: preview.lines.map((l) => ({
                side: l.side,
                account: l.account,
                detail: l.detail,
                amount: l.amount,
              })),
            }
          : {}),
      })
      setValues({})
      setManual(emptyManual())
      setNote('')
      setInvoiceNo('')
      setPaymentSource('')
      setUndoable({ id: entry.id, no: entry.transactionNo })
    } catch (e) {
      setServerError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** Undo = cancel. Nothing deletes, so the row and its number stay. */
  async function undoLast() {
    if (!undoable || undoing) return
    setUndoing(true)
    setServerError('')
    try {
      await cancelEntry(undoable.id, 'Undone by the user moments after posting')
      setUndoable(null)
      setFlash(`${undoable.no} cancelled`)
      window.setTimeout(() => setFlash(''), 3000)
    } catch (e) {
      setServerError((e as Error).message)
    } finally {
      setUndoing(false)
    }
  }

  async function doCancel(id: string, reason: string) {
    setServerError('')
    try {
      await cancelEntry(id, reason)
    } catch (e) {
      setServerError((e as Error).message)
    } finally {
      setVoiding(null)
    }
  }

  const rows = sortedEntries(entries)
  const dr = sumSide(preview.lines, 'Dr')
  const cr = sumSide(preview.lines, 'Cr')

  return (
    <main className="page">
      <div className="page-head">
        <h1>Journal Entries</h1>
        <p>
          Pick what happened and enter the amount — the debits and credits come from the
          template, not from you.
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>New entry</h3>
          <span className="sub">{tpl ? `${tpl.id} · ${tpl.group}` : ''}</span>
        </div>
        <div className="card-body">
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="tpl">What happened</label>
              <select id="tpl" value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
                {groups.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.items.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.id} · {t.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {tpl?.description && <p className="tpl-note">{tpl.description}</p>}
            </div>

            <div className="field">
              <label htmlFor="date">Date of transaction</label>
              <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="no">
                Transaction number <span className="hint">· assigned in sequence</span>
              </label>
              <input
                id="no"
                type="text"
                readOnly
                value={suggestedNo}
                style={{ background: 'var(--shell)', color: 'var(--text-soft)' }}
              />
            </div>

            {tpl?.sku && (
              <div className="field">
                <label htmlFor="sku">
                  SKU / project{' '}
                  <span className="hint">
                    {tpl.sku === 'required' ? '· required' : '· optional'}
                    {clients.length === 0 && ' · none registered yet'}
                  </span>
                </label>
                <select id="sku" value={sku} onChange={(e) => setSku(e.target.value)}>
                  <option value="">
                    {clients.length ? 'Choose a project…' : 'Register a project first'}
                  </option>
                  {clients.map((c) => (
                    <option key={c.sku} value={c.sku}>
                      {c.sku} · {c.client_name}
                      {c.open_prepayment ? ` · deposit open ${c.open_prepayment.toLocaleString('en-US')}` : ''}
                    </option>
                  ))}
                </select>
                {clients.length === 0 && (
                  <span className="hint">
                    <Link to="/clients">Register one</Link> so settlements can find their deposit.
                  </span>
                )}
              </div>
            )}

            {details.length > 0 && (
              <div className="field">
                <label htmlFor="detail">Detail</label>
                <select id="detail" value={detail} onChange={(e) => setDetail(e.target.value)}>
                  {details.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(tpl?.inputs ?? []).map((inp) => (
              <div className="field" key={inp.name}>
                <label>{inp.label}</label>
                <MoneyInput
                  value={values[inp.name] ?? 0}
                  onChange={(n) => setValues((v) => ({ ...v, [inp.name]: n }))}
                />
              </div>
            ))}

            {(tpl?.context ?? []).map((c) => (
              <div className="field" key={c.name}>
                <label>
                  {c.label} <span className="hint">· filled from the ledger</span>
                </label>
                <MoneyInput value={dpOpen} readOnly />
              </div>
            ))}

            {tpl?.settlement && (
              <div className="field full">
                <label>How settled</label>
                <div className="seg">
                  {tpl.settlement.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={settlement === m ? 'on' : ''}
                      onClick={() => setSettlement(m)}
                    >
                      {SETTLEMENT[m].label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tpl?.manual && (
              <div className="field full">
                <label>Manual lines</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {manual.map((l, i) => (
                    <div
                      key={i}
                      style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 150px 34px', gap: 8 }}
                    >
                      <select
                        value={l.side}
                        onChange={(e) =>
                          setManual((m) =>
                            m.map((x, j) => (j === i ? { ...x, side: e.target.value as Side } : x)),
                          )
                        }
                      >
                        <option>Dr</option>
                        <option>Cr</option>
                      </select>
                      <select
                        value={l.account}
                        onChange={(e) =>
                          setManual((m) =>
                            m.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    account: e.target.value,
                                    detail: ACCOUNTS[e.target.value]?.details[0] ?? '',
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        {ACCOUNT_LIST.map((a) => (
                          <option key={a.code} value={a.code}>
                            {a.code}
                          </option>
                        ))}
                      </select>
                      <select
                        value={l.detail}
                        disabled={!ACCOUNTS[l.account]?.details.length}
                        onChange={(e) =>
                          setManual((m) =>
                            m.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)),
                          )
                        }
                      >
                        {(ACCOUNTS[l.account]?.details ?? ['—']).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <MoneyInput
                        value={l.amount}
                        onChange={(n) =>
                          setManual((m) => m.map((x, j) => (j === i ? { ...x, amount: n } : x)))
                        }
                      />
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={manual.length <= 2}
                        onClick={() => setManual((m) => m.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() =>
                        setManual((m) => [
                          ...m,
                          { side: 'Dr', account: 'Cash/Bank', detail: '', amount: 0 },
                        ])
                      }
                    >
                      + line
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tpl?.extras?.includes('invoice_no') && (
              <div className="field">
                <label htmlFor="inv">
                  Invoice number <span className="hint">· the supplier&rsquo;s own</span>
                </label>
                <input
                  id="inv"
                  type="text"
                  value={invoiceNo}
                  placeholder="INV/2026/0412"
                  onChange={(e) => setInvoiceNo(e.target.value)}
                />
              </div>
            )}

            {tpl?.extras?.includes('payment_source') && (
              <div className="field">
                <label htmlFor="src">
                  {tpl.payment_source_label ?? 'Source of payment'}{' '}
                  <span className="hint">· optional</span>
                </label>
                <input
                  id="src"
                  type="text"
                  list="source-list"
                  value={paymentSource}
                  placeholder={
                    tpl.payment_source_placeholder ?? 'Shopee, TikTok, offline store…'
                  }
                  onChange={(e) => setPaymentSource(e.target.value)}
                />
                <datalist id="source-list">
                  {knownSources.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </div>
            )}

            <div className="field full">
              <label htmlFor="note">
                Remark <span className="hint">· optional</span>
              </label>
              <input
                id="note"
                type="text"
                value={note}
                placeholder={tpl ? tpl.label : ''}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div className={`preview ${preview.error ? 'err' : preview.lines.length ? 'ok' : ''}`}>
              {preview.lines.length === 0 ? (
                <div className="preview-empty">
                  {preview.error ?? 'Enter an amount to see the entry'}
                </div>
              ) : (
                <>
                  {preview.lines.map((ln, i) => (
                    <div key={i} className={`entry-line${ln.side === 'Cr' ? ' cr' : ''}`}>
                      <span className={`side ${ln.side}`}>{ln.side}</span>
                      <span className="acct">
                        {ln.account}
                        {ln.detail && <span className="det"> / {ln.detail}</span>}
                        {ln.auto && <span className="auto-tag">auto</span>}
                      </span>
                      <span className="amt">{groupNumber(ln.amount)}</span>
                    </div>
                  ))}
                  <div className="preview-foot">
                    <span className="bal">
                      Dr {groupNumber(dr)} · Cr {groupNumber(cr)}
                    </span>
                    {preview.error ? (
                      <span className="bad">{preview.error}</span>
                    ) : (
                      <span className="ok">Balanced</span>
                    )}
                  </div>
                </>
              )}
            </div>

            {preview.warnings.map((w, i) => (
              <div className="note" key={i}>
                {w}
              </div>
            ))}

            {templateId === 'A4' && sku && dpOpen > 0 && (
              <div className="note">
                <strong>{sku}</strong> has Rp {groupNumber(dpOpen)} of down payment open. That
                line is written into the entry automatically — it cannot be left out.
              </div>
            )}
            {templateId === 'A4' && sku && dpOpen === 0 && (
              <div className="note">
                No open down payment found for <strong>{sku || '—'}</strong>. Post{' '}
                <strong>A1</strong> first, or use <strong>A5</strong> if the sale was paid in
                full with no DP.
              </div>
            )}

            {dateLocked && (
              <div className="note locked-note">
                <strong>{periodLabel(lock.lockedThrough)} and earlier is closed.</strong> Nothing
                can be posted into a locked period — pick a later date, or unlock from the P&amp;L
                or Balance Sheet page.
              </div>
            )}

            {serverError && (
              <div className="note" style={{ borderLeftColor: 'var(--rust)', background: 'rgba(188,63,23,.07)', color: 'var(--rust)' }}>
                <strong>The server refused this.</strong> {serverError}
              </div>
            )}

            <div className="actions" style={{ marginTop: 18 }}>
              <button className="btn" disabled={!canPost || busy} onClick={post}>
                {busy ? 'Posting…' : 'Post entry'}
              </button>
              {needsSku && !sku.trim() && (
                <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>
                  SKU required for this template
                </span>
              )}
              {undoable && (
                <Undo
                  transactionNo={undoable.no}
                  seconds={6}
                  busy={undoing}
                  onUndo={() => void undoLast()}
                  onExpire={() => setUndoable(null)}
                />
              )}
              {!undoable && flash && (
                <span className="pill good">
                  <span className="dot" />
                  {flash}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Journal</h3>
          <div className="actions">
            <span className="sub">
              {journal.loading
                ? 'loading…'
                : `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · ${rows.reduce(
                    (n, e) => n + e.lines.length,
                    0,
                  )} lines`}
            </span>
            <DownloadBar
              periods={periodsIn(entries)}
              disabled={!rows.length}
              label="Download"
              onDownload={(period: Period, format: Format) =>
                exportJournal(entries, period, format)
              }
            />
          </div>
        </div>

        {journal.error ? (
          <div className="empty">
            <strong>The accounting API is not answering</strong>
            {journal.error}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <strong>No entries yet</strong>
            Post one above and it will appear here.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>No.</th>
                  <th>SKU</th>
                  <th></th>
                  <th>Invoice</th>
                  <th>Source</th>
                  <th>COA</th>
                  <th>Detail</th>
                  <th className="num">Rp</th>
                  <th>Remark</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.flatMap((e) => {
                  const cancelled = !!e.voidedAt
                  const entryLocked = isDateLocked(e.date, lock)
                  return e.lines.map((ln, i) => (
                    <tr key={`${e.id}-${i}`} className={cancelled ? 'cancelled' : undefined}>
                      <td>{i === 0 ? e.date : ''}</td>
                      <td>
                        {i === 0 && (
                          <>
                            {e.transactionNo}
                            {cancelled && <span className="void-tag">cancelled</span>}
                          </>
                        )}
                      </td>
                      <td>{i === 0 ? e.sku : ''}</td>
                      <td style={{ color: 'var(--text-soft)', fontSize: 13 }}>
                        {i === 0 ? (e.invoiceNo ?? '') : ''}
                      </td>
                      <td style={{ color: 'var(--text-soft)', fontSize: 13 }}>
                        {i === 0 ? (e.paymentSource ?? '') : ''}
                      </td>
                      <td className={`side-${ln.side}`}>{ln.side}</td>
                      <td>{ln.account}</td>
                      <td style={{ color: 'var(--text-soft)' }}>{ln.detail ?? '—'}</td>
                      <td className="num">{groupNumber(ln.amount)}</td>
                      <td style={{ color: 'var(--text-soft)', fontSize: 13 }}>
                        {i === 0 && (cancelled ? (e.voidReason || 'Cancelled') : (e.note ?? e.templateLabel))}
                      </td>
                      <td>
                        {i === 0 && !cancelled && (
                          <button
                            className="btn ghost sm"
                            disabled={entryLocked}
                            title={
                              entryLocked
                                ? 'This period is closed — unlock it first'
                                : 'Cancel this entry'
                            }
                            onClick={() => {
                              setVoiding(e.id)
                              setVoidReason('')
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {voiding && (
        <div className="modal-backdrop" onClick={() => setVoiding(null)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <h3>Cancel this entry?</h3>
            <p>
              The entry stays in the journal and keeps its number — it just stops counting
              towards the P&amp;L and Balance Sheet. The number is not reused, so the gap
              records that something was posted here and withdrawn.
            </p>
            <input
              type="text"
              autoFocus
              value={voidReason}
              placeholder="Reason (recorded against the entry)"
              onChange={(ev) => setVoidReason(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' && voidReason.trim()) {
                  void doCancel(voiding, voidReason.trim())
                }
              }}
            />
            <div className="actions" style={{ marginTop: 14 }}>
              <button
                className="btn rust sm"
                disabled={!voidReason.trim()}
                onClick={() => void doCancel(voiding, voidReason.trim())}
              >
                Cancel entry
              </button>
              <button className="btn ghost sm" onClick={() => setVoiding(null)}>
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
