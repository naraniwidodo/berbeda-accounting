import { useEffect, useRef, useState } from 'react'
import { fetchHealth, sendChat, type ChatReply, type ChatUsage } from '../lib/api'

/**
 * The model writes the occasional **bold** or `code`. Rendering those two is
 * cheaper than pulling in a markdown parser, and safer than printing the
 * markers raw — text is inserted as text, never as HTML.
 */
function formatted(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    return part
  })
}

interface Turn {
  role: 'user' | 'assistant'
  content: string
  grounded?: string[]
  failed?: boolean
  tokens?: number
}

const n = (x: number) => x.toLocaleString('en-US')

const OPENERS = [
  'Why does a settlement debit Prepayment Client?',
  'What was my revenue this year?',
  'I paid a vendor today — how do I book it?',
]

export default function Chat() {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [usage, setUsage] = useState<ChatUsage | null>(null)
  //: null while unknown. A fresh clone with no key in .env still runs every
  //: other page, so say that here rather than letting someone ask and be
  //: turned away three times.
  const [aiOn, setAiOn] = useState<boolean | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || aiOn !== null) return
    fetchHealth()
      .then((h) => setAiOn(h.aiConfigured))
      .catch(() => setAiOn(null))
  }, [open, aiOn])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns, busy, open])

  async function send(text: string) {
    const question = text.trim()
    if (!question || busy) return

    const next: Turn[] = [...turns, { role: 'user', content: question }]
    setTurns(next)
    setDraft('')
    setBusy(true)

    try {
      const reply: ChatReply = await sendChat(
        next.map((t) => ({ role: t.role, content: t.content })),
      )
      setTurns([
        ...next,
        {
          role: 'assistant',
          content: reply.reply,
          grounded: reply.grounded_in,
          tokens: reply.usage?.question_tokens,
        },
      ])
      if (reply.usage) setUsage(reply.usage)
    } catch (e) {
      setTurns([
        ...next,
        { role: 'assistant', content: (e as Error).message, failed: true },
      ])
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Ask about accounting">
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden>
          <path
            d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.8 8.8 0 0 1-3.9-.9L3 21l2.1-5.3A8.2 8.2 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"
            fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
          />
        </svg>
        <span>Ask</span>
      </button>
    )
  }

  return (
    <div className="chat" role="dialog" aria-label="Accounting helper">
      <header className="chat-head">
        <div>
          <strong>Accounting helper</strong>
          <span>Explains the method, and can read your P&amp;L and Balance Sheet</span>
        </div>
        <button className="chat-x" onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </header>

      <div className="chat-body" ref={scroller}>
        {turns.length === 0 && (
          <div className="chat-empty">
            <p>
              Ask about debits and credits, what an account is for, or how to book something —
              and it can look up your own P&amp;L and Balance Sheet figures by period. It never
              guesses a number it wasn’t given.
            </p>
            {aiOn === false ? (
              <p className="chat-offline">
                The helper is not connected yet — no API key is set. Put your Portkey key in
                the <code>.env</code> file at the project root and restart the API. Every other
                page works without it.
              </p>
            ) : (
              <div className="chat-openers">
                {OPENERS.map((o) => (
                  <button key={o} onClick={() => send(o)}>
                    {o}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role}${t.failed ? ' failed' : ''}`}>
            {formatted(t.content)}
            {t.role === 'assistant' && (t.grounded?.length || t.tokens) && (
              <span className="bubble-src">
                {t.grounded?.length ? `from ${t.grounded.join(', ')}` : ''}
                {t.grounded?.length && t.tokens ? ' · ' : ''}
                {t.tokens ? `${n(t.tokens)} tokens` : ''}
              </span>
            )}
          </div>
        ))}

        {busy && (
          <div className="bubble assistant thinking">
            <span /><span /><span />
          </div>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          void send(draft)
        }}
      >
        <input
          value={draft}
          placeholder="Ask an accounting question…"
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
          autoFocus
        />
        <button className="btn sm" type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>

      {usage && (
        <div
          className="chat-usage"
          title={
            `Tokens are spent only by this helper — journal entries, the P&L and ` +
            `the Balance Sheet cost none. The session total resets when the ` +
            `server restarts.`
          }
        >
          <span>
            {n(usage.session_tokens)} tokens this session
            {usage.session_calls > 0 && ` · ${usage.session_calls} question${usage.session_calls === 1 ? '' : 's'}`}
          </span>
          {usage.limit_per_question && (
            <span className="chat-usage-limit">
              cap {n(usage.limit_per_question)} per question
            </span>
          )}
        </div>
      )}
    </div>
  )
}
